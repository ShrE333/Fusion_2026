"""WAHA messaging helpers: direct chats only, interactive lists with safe fallback."""
import base64
import mimetypes
import logging
from pathlib import Path
from urllib.parse import urlparse
import httpx
from .config import settings

log=logging.getLogger("geosathi.waha")

def require_private_chat(chat_id: str) -> None:
    if not isinstance(chat_id,str) or not chat_id.endswith(("@c.us","@s.whatsapp.net","@lid")):
        raise ValueError("Blocked WAHA send: private chats only")

def headers():
    return {"X-Api-Key":settings.waha_api_key}

async def send_text(session:str, chat_id:str, message:str):
    require_private_chat(chat_id)
    async with httpx.AsyncClient(timeout=20) as client:
        response=await client.post(
            f'{settings.waha_url.rstrip("/")}/api/sendText',
            json={"session":session,"chatId":chat_id,"text":message},headers=headers())
        response.raise_for_status()

async def send_image(session:str,chat_id:str,image_path,caption:str=""):
    require_private_chat(chat_id)
    path=Path(image_path)
    if not path.is_file(): raise FileNotFoundError(path)
    if path.stat().st_size>settings.max_image_bytes:raise ValueError("Image too large")
    mime=mimetypes.guess_type(path.name)[0] or "image/jpeg"
    payload={"session":session,"chatId":chat_id,"file":{
        "mimetype":mime,"filename":path.name,"data":base64.b64encode(path.read_bytes()).decode("ascii")
    },"caption":caption}
    async with httpx.AsyncClient(timeout=45) as client:
        r=await client.post(f'{settings.waha_url.rstrip("/")}/api/sendImage',json=payload,headers=headers())
        r.raise_for_status()

_MENU_COPY={
    "en":("What would you like to do?","Choose option","Infrastructure Search","Search GIS and imagery","Road Damage Report","Send road photo and location"),
    "hi":("आप क्या करना चाहते हैं?","विकल्प चुनें","इन्फ्रास्ट्रक्चर खोज","GIS और imagery खोजें","सड़क क्षति रिपोर्ट","सड़क की फोटो और GPS pin भेजें"),
    "mr":("तुम्हाला काय करायचे आहे?","पर्याय निवडा","पायाभूत सुविधा शोध","GIS आणि imagery शोधा","रस्ता नुकसान अहवाल","रस्त्याचा फोटो आणि GPS pin पाठवा"),
}
_LANGUAGE_ROWS=[
    {"title":"English","rowId":"language_en","description":"GeoSathi in English"},
    {"title":"हिन्दी","rowId":"language_hi","description":"GeoSathi हिन्दी में"},
    {"title":"मराठी","rowId":"language_mr","description":"GeoSathi मराठीत"},
]

def _sections(language,only_language=False):
    c=_MENU_COPY.get(language,_MENU_COPY["en"])
    rows=[{"title":c[2],"rowId":"infrastructure","description":c[3]},
          {"title":c[4],"rowId":"road","description":c[5]}]
    services={"title":"Services / सेवा","rows":rows}
    language_rows={"title":"Language / भाषा","rows":_LANGUAGE_ROWS}
    return [language_rows] if only_language else [services,language_rows]

async def _send_list(session,chat_id,language,only_language):
    require_private_chat(chat_id)
    c=_MENU_COPY.get(language,_MENU_COPY["en"])
    payload={"session":session,"chatId":chat_id,"reply_to":None,"message":{
        "title":"GeoSathi AI",
        "description":"Choose language / भाषा चुनें / भाषा निवडा" if only_language else c[0],
        "footer":"FUSION 2026",
        "button":"Choose language" if only_language else c[1],
        "sections":_sections(language,only_language)
    }}
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.post(f'{settings.waha_url.rstrip("/")}/api/sendList',json=payload,headers=headers())
        r.raise_for_status()

def language_fallback():
    return "🌐 Choose language / भाषा चुनें / भाषा निवडा\n\nEnglish\nहिन्दी\nमराठी\n\nReply with the language NAME if your WhatsApp app cannot open the list."

async def send_language_menu(session:str,chat_id:str,fallback_text:str="",language:str="en"):
    try:
        await _send_list(session,chat_id,language,True)
        return "list"
    except (httpx.HTTPStatusError,httpx.RequestError) as exc:
        log.warning("WAHA language list unavailable: %s",exc)
        await send_text(session,chat_id,language_fallback())
        return "text_fallback"

async def send_menu(session:str,chat_id:str,fallback_text:str,language:str="en"):
    try:
        await _send_list(session,chat_id,language,False)
        return "list"
    except (httpx.HTTPStatusError,httpx.RequestError) as exc:
        log.warning("WAHA service list unavailable: %s",exc)
        await send_text(session,chat_id,fallback_text)
        return "text_fallback"

async def download_image(media:dict,destination:Path):
    raw_url=media.get("url")
    if not raw_url:raise ValueError("WAHA did not supply media URL")
    parsed=urlparse(raw_url)
    if not parsed.path.startswith("/api/files/") or parsed.scheme not in ("http","https"):
        raise ValueError("Unexpected WAHA media URL")
    url=f'{settings.waha_url.rstrip("/")}{parsed.path}'
    if parsed.query:url+="?"+parsed.query
    async with httpx.AsyncClient(timeout=30,follow_redirects=False) as client:
        async with client.stream("GET",url,headers=headers()) as response:
            response.raise_for_status()
            size=0
            destination.parent.mkdir(parents=True,exist_ok=True)
            try:
                with destination.open("wb") as out:
                    async for chunk in response.aiter_bytes():
                        size+=len(chunk)
                        if size>settings.max_image_bytes:raise ValueError("Image exceeds size limit")
                        out.write(chunk)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
