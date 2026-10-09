from pathlib import Path
from urllib.parse import urlparse
import httpx
from .config import settings


def require_private_chat(chat_id: str) -> None:
    """Fail closed before ANY WAHA outbound sendText/sendList HTTP request."""
    if not isinstance(chat_id, str) or not chat_id.endswith(("@c.us", "@s.whatsapp.net", "@lid")):
        raise ValueError("Blocked WAHA send: destination is not a private WhatsApp chat")


def headers():
    return {'X-Api-Key': settings.waha_api_key}


async def send_text(session: str, chat_id: str, message: str):
    require_private_chat(chat_id)
    async with httpx.AsyncClient(timeout=20) as client:
        response=await client.post(
            f'{settings.waha_url.rstrip("/")}/api/sendText',
            json={'session':session,'chatId':chat_id,'text':message},
            headers=headers(),
        )
        response.raise_for_status()


_MENU_COPY = {
    "en": {
        "title": "GeoSathi AI",
        "description": "Select a service to continue",
        "button": "Choose service",
        "infra": "Infrastructure Search",
        "infra_desc": "Find features in satellite/aerial imagery",
        "road": "Road Damage Report",
        "road_desc": "Upload road image and GPS pin",
    },
    "hi": {
        "title": "GeoSathi AI",
        "description": "जारी रखने के लिए सेवा चुनें",
        "button": "सेवा चुनें",
        "infra": "इन्फ्रास्ट्रक्चर खोज",
        "infra_desc": "सैटेलाइट/एरियल imagery में features खोजें",
        "road": "सड़क क्षति रिपोर्ट",
        "road_desc": "सड़क की फोटो और GPS location भेजें",
    },
    "mr": {
        "title": "GeoSathi AI",
        "description": "पुढे जाण्यासाठी सेवा निवडा",
        "button": "सेवा निवडा",
        "infra": "पायाभूत सुविधा शोध",
        "infra_desc": "सॅटेलाइट/एरियल imagery मध्ये features शोधा",
        "road": "रस्ता नुकसान अहवाल",
        "road_desc": "रस्त्याचा फोटो आणि GPS location पाठवा",
    },
}


async def send_menu(session: str, chat_id: str, fallback_text: str, language: str = "en"):
    require_private_chat(chat_id)
    copy = _MENU_COPY.get(language, _MENU_COPY["en"])
    # sendList may be unavailable with some WAHA engines/editions. Always preserve fallback.
    data={
        'session':session,
        'chatId':chat_id,
        'reply_to':None,
        'message':{
            'title':copy['title'],
            'description':copy['description'],
            'footer':'FUSION 2026',
            'button':copy['button'],
            'sections':[{
                'title':copy['description'],
                'rows':[
                    {'title':copy['infra'],'rowId':'infrastructure','description':copy['infra_desc']},
                    {'title':copy['road'],'rowId':'road','description':copy['road_desc']},
                ],
            }],
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r=await client.post(f'{settings.waha_url.rstrip("/")}/api/sendList',json=data,headers=headers())
            r.raise_for_status()
            return 'list'
    except (httpx.HTTPStatusError,httpx.RequestError):
        await send_text(session,chat_id,fallback_text)
        return 'text_fallback'


async def download_image(media: dict, destination: Path):
    raw_url=media.get('url')
    if not raw_url: raise ValueError('WAHA did not provide a downloadable media URL')
    parsed=urlparse(raw_url)
    if not parsed.path.startswith('/api/files/') or parsed.scheme not in ('http','https'):
        raise ValueError('Unexpected media URL')
    url=f'{settings.waha_url.rstrip("/")}{parsed.path}'
    if parsed.query: url += '?' + parsed.query
    async with httpx.AsyncClient(timeout=30,follow_redirects=False) as client:
        async with client.stream('GET',url,headers=headers()) as response:
            response.raise_for_status()
            size=0
            destination.parent.mkdir(parents=True,exist_ok=True)
            try:
                with destination.open('wb') as out:
                    async for chunk in response.aiter_bytes():
                        size+=len(chunk)
                        if size>settings.max_image_bytes:
                            raise ValueError('Image exceeds size limit')
                        out.write(chunk)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
