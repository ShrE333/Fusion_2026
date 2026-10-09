from pathlib import Path
from urllib.parse import urlparse
import httpx
from .config import settings

def headers():
    return {'X-Api-Key': settings.waha_api_key}

async def send_text(session: str, chat_id: str, message: str):
    async with httpx.AsyncClient(timeout=20) as client:
        response=await client.post(f'{settings.waha_url.rstrip("/")}/api/sendText', json={'session':session,'chatId':chat_id,'text':message},headers=headers())
        response.raise_for_status()

async def send_menu(session: str, chat_id: str, fallback_text: str):
    # sendList may be unavailable with some WAHA engines/editions. Always preserve fallback.
    data={'session':session,'chatId':chat_id,'reply_to':None,'message':{
        'title':'GeoSathi AI','description':'Select a service to continue',
        'footer':'FUSION 2026','button':'Choose service','sections':[{'title':'Services','rows':[
            {'title':'Infrastructure Search','rowId':'infrastructure','description':'Find features in satellite/aerial imagery'},
            {'title':'Road Damage Report','rowId':'road','description':'Upload road image and GPS pin'}]}]}}
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
            response.raise_for_status(); size=0;destination.parent.mkdir(parents=True,exist_ok=True)
            try:
                with destination.open('wb') as out:
                    async for chunk in response.aiter_bytes():
                        size+=len(chunk)
                        if size>settings.max_image_bytes: raise ValueError('Image exceeds size limit')
                        out.write(chunk)
            except Exception:
                destination.unlink(missing_ok=True);raise
