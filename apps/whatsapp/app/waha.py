from pathlib import Path
from urllib.parse import urlparse
import httpx
from .config import settings


def headers():
    return {'X-Api-Key': settings.waha_api_key}


async def send_text(session: str, chat_id: str, message: str):
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f'{settings.waha_url.rstrip("/")}/api/sendText',
            json={'session': session, 'chatId': chat_id, 'text': message}, headers=headers())
        response.raise_for_status()


async def download_image(media: dict, destination: Path):
    raw_url=media.get('url')
    if not raw_url:
        raise ValueError('WAHA did not provide a downloadable media URL')
    # Never request an arbitrary user-controlled URL. Use only its WAHA /api/files path.
    parsed=urlparse(raw_url)
    if not parsed.path.startswith('/api/files/') or parsed.scheme not in ('http','https'):
        raise ValueError('Unexpected media URL')
    # GOWS often returns a localhost/internal URL; use configured WAHA host.
    url=f'{settings.waha_url.rstrip("/")}{parsed.path}'
    if parsed.query:
        url += '?' + parsed.query
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        async with client.stream('GET', url, headers=headers()) as response:
            response.raise_for_status()
            size=0
            destination.parent.mkdir(parents=True,exist_ok=True)
            try:
                with destination.open('wb') as out:
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > settings.max_image_bytes:
                            raise ValueError('Image exceeds configured size limit')
                        out.write(chunk)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
