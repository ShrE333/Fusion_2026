import hashlib
import hmac
import json
import logging
import uuid
from pathlib import Path

import httpx
from PIL import Image, ImageDraw
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request

from . import store
from .config import settings
from .i18n import normalize_language, t
from .waha import download_image, send_image, send_menu, send_text

logging.basicConfig(level=logging.INFO)
log=logging.getLogger('fusion.whatsapp')
app=FastAPI(title='Fusion 2026 WhatsApp Adapter', version='0.2.0')

IMAGE_EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
}
IMAGE_MIME_BY_SUFFIX = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
}


@app.on_event('startup')
def start():
    store.init()
    if not settings.waha_api_key or not settings.waha_hmac_secret:
        log.warning('WAHA credentials not configured. Webhooks will be rejected until HMAC is configured.')


@app.get('/health')
def health():
    return {
        'ok': True,
        'component': 'whatsapp-adapter',
        'road_inference_configured': bool(settings.road_inference_url),
        'infra_search_configured': bool(settings.infra_search_url),
        'languages': ['en', 'hi', 'mr'],
    }


def extract_location(payload):
    loc=payload.get('location') or payload.get('_data',{}).get('location') or {}
    if not isinstance(loc,dict):
        loc={}
    lat=loc.get('latitude',loc.get('lat',payload.get('latitude',payload.get('lat'))))
    lon=loc.get('longitude',loc.get('lng',loc.get('lon',payload.get('longitude',payload.get('lng')))))
    try:
        if lat is None or lon is None:
            return None
        lat,lon=float(lat),float(lon)
        if -90<=lat<=90 and -180<=lon<=180:
            return {'lat':lat,'lon':lon}
    except (ValueError,TypeError):
        pass
    return None


async def call_worker(url, data):
    if not url:
        return None
    headers={'Authorization':f'Bearer {settings.service_token}'} if settings.service_token else {}
    async with httpx.AsyncClient(timeout=120) as client:
        response=await client.post(url,json=data,headers=headers)
        response.raise_for_status()
        return response.json()


async def call_road_detector(image_path):
    if not settings.road_inference_url:
        return None

    path=Path(image_path)
    if not path.is_file():
        raise FileNotFoundError(f'Road image not found: {path}')

    size=path.stat().st_size
    if size <= 0:
        raise ValueError('Road image is empty')
    if size > settings.max_image_bytes:
        raise ValueError('Road image exceeds configured upload limit')

    mime=IMAGE_MIME_BY_SUFFIX.get(path.suffix.lower())
    if not mime:
        raise ValueError('Unsupported road image type')

    url=settings.road_inference_url.rstrip('/')
    if not url.endswith('/predict'):
        url=f'{url}/predict'

    headers={}
    if settings.road_service_token:
        headers['Authorization']=f'Bearer {settings.road_service_token}'

    params={'conf':settings.road_conf,'iou':settings.road_iou}
    timeout=httpx.Timeout(settings.road_timeout_seconds)

    with path.open('rb') as handle:
        files={'file':(path.name,handle,mime)}
        async with httpx.AsyncClient(timeout=timeout) as client:
            response=await client.post(url,params=params,files=files,headers=headers)
            response.raise_for_status()
            result=response.json()

    if not isinstance(result,dict):
        raise ValueError('Road detector returned a non-object response')
    detections=result.get('detections',[])
    if detections is not None and not isinstance(detections,list):
        raise ValueError('Road detector returned invalid detections')
    return result


def _map_url(lat, lon, zoom=18):
    return f'https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lon:.6f}#map={zoom}/{lat:.6f}/{lon:.6f}'


def _confidence_text(detections):
    values=[]
    for item in detections:
        if not isinstance(item,dict):
            continue
        value=item.get('confidence')
        if isinstance(value,(int,float)):
            values.append(float(value))
    if not values:
        return 'n/a'
    highest=max(values)
    return f'{highest * 100:.1f}%' if 0 <= highest <= 1 else f'{highest:.1f}%'


def _latency_text(result):
    inference=result.get('inference') if isinstance(result,dict) else None
    latency=inference.get('latency_ms') if isinstance(inference,dict) else None
    return f'{float(latency):.0f} ms' if isinstance(latency,(int,float)) else 'n/a'


def _annotate_road_image(image_path, detections, report_id):
    path=Path(image_path)
    if not path.is_file() or not detections:
        return None
    output=path.with_name(f"{path.stem}_{report_id}_detected.jpg")
    with Image.open(path) as source:
        image=source.convert("RGB")
        draw=ImageDraw.Draw(image)
        width,height=image.size
        line_width=max(3,round(min(width,height)*0.006))
        valid=0
        for detection in detections:
            if not isinstance(detection,dict):
                continue
            bbox=detection.get("bbox")
            if not isinstance(bbox,dict):
                continue
            try:
                x1=max(0,min(width-1,int(round(float(bbox["x1"])))))
                y1=max(0,min(height-1,int(round(float(bbox["y1"])))))
                x2=max(0,min(width-1,int(round(float(bbox["x2"])))))
                y2=max(0,min(height-1,int(round(float(bbox["y2"])))))
            except (KeyError,TypeError,ValueError):
                continue
            if x2<=x1 or y2<=y1:
                continue
            confidence=detection.get("confidence")
            if isinstance(confidence,(int,float)):
                pct=float(confidence)*100 if 0<=confidence<=1 else float(confidence)
                label=f"pothole {pct:.1f}%"
            else:
                label="pothole"
            draw.rectangle((x1,y1,x2,y2),outline=(230,40,40),width=line_width)
            box=draw.textbbox((0,0),label)
            tw,th=box[2]-box[0],box[3]-box[1]
            ly=max(0,y1-th-8)
            draw.rectangle((x1,ly,min(width-1,x1+tw+8),min(height-1,ly+th+8)),fill=(255,255,255))
            draw.text((x1+4,ly+4),label,fill=(190,20,20))
            valid+=1
        if not valid:
            return None
        image.save(output,"JPEG",quality=92,optimize=True)
    return output


async def finish_report(session, chat, report_id, image, loc, language='en'):
    lat=float(loc['lat'])
    lon=float(loc['lon'])
    map_url=_map_url(lat,lon)

    if not settings.road_inference_url:
        store.save_report(report_id,chat,lat,lon,str(image),'pending_inference',{})
        await send_text(
            session,
            chat,
            t(language,'road_not_configured',report_id=report_id,lat=lat,lon=lon),
        )
        return

    try:
        result=await call_road_detector(image)
        detections=(result or {}).get('detections') or []
        raw_count=(result or {}).get('potholes_count',len(detections))
        try:
            potholes_count=max(0,int(raw_count))
        except (TypeError,ValueError):
            potholes_count=len(detections)

        if potholes_count > 0:
            status='ai_detected_pending_verification'
            store.save_report(report_id,chat,lat,lon,str(image),status,result or {})
            try:
                annotated=_annotate_road_image(image,detections,report_id)
                if annotated:
                    await send_image(
                        session,chat,annotated,
                        t(language,'road_annotated_caption',report_id=report_id,count=potholes_count),
                    )
            except Exception:
                log.exception('Could not send annotated road image for %s',report_id)
            await send_text(
                session,chat,
                t(language,'road_detected',report_id=report_id,count=potholes_count,
                  confidence=_confidence_text(detections),latency=_latency_text(result or {}),
                  lat=lat,lon=lon,map_url=map_url),
            )
            await send_menu(session,chat,t(language,'menu'),language)
        else:
            status='no_detection_pending_review'
            store.save_report(report_id,chat,lat,lon,str(image),status,result or {})
            await send_text(
                session,chat,
                t(language,'road_no_detection',report_id=report_id,lat=lat,lon=lon,map_url=map_url),
            )
            await send_menu(session,chat,t(language,'menu'),language)
    except Exception:
        log.exception('Road inference failed for %s',report_id)
        store.save_report(report_id,chat,lat,lon,str(image),'inference_failed',{})
        await send_text(
            session,
            chat,
            t(
                language,
                'road_failed',
                report_id=report_id,
                lat=lat,
                lon=lon,
                map_url=map_url,
            ),
        )


async def finish_search(session,chat,search_id,query,loc,language='en'):
    try:
        if settings.infra_search_url:
            result=await call_worker(settings.infra_search_url,{'query_id':search_id,'query':query,'location':loc})
            candidates=(result or {}).get('results') or []
            status=(result or {}).get('status','completed')
            store.save_search(search_id,chat,query,loc,status,result or {})
            if candidates:
                top=candidates[0]
                center=top.get('center') or {}
                lat=float(center.get('lat',loc['lat']))
                lon=float(center.get('lon',loc['lon']))
                if (result or {}).get('gis_verified') or top.get('gis_verified'):
                    await send_text(
                        session,chat,
                        t(language,'search_gis_found',search_id=search_id,count=len(candidates),
                          layer=str((result or {}).get('gis_layer') or top.get('gis_layer') or 'GIS'),
                          name=str(top.get('name') or 'Unnamed feature'),
                          lat=lat,lon=lon,map_url=_map_url(lat,lon,17)),
                    )
                else:
                    score=top.get('similarity')
                    score_text=f'{float(score):.3f}' if isinstance(score,(int,float)) else 'n/a'
                    await send_text(
                        session,chat,
                        t(language,'search_found',search_id=search_id,count=len(candidates),
                          lat=lat,lon=lon,score=score_text,map_url=_map_url(lat,lon,17)),
                    )
            else:
                await send_text(session,chat,t(language,'search_none',search_id=search_id))
            await send_menu(session,chat,t(language,'menu'),language)
        else:
            store.save_search(search_id,chat,query,loc,'pending_index',{})
            await send_text(session,chat,t(language,'search_saved',search_id=search_id))
    except Exception:
        log.exception('Search failed %s',search_id)
        store.save_search(search_id,chat,query,loc,'failed',{})
        await send_text(session,chat,t(language,'search_failed',search_id=search_id))


def is_private_chat(chat_id: str) -> bool:
    """Allow only private WhatsApp IDs; never broadcast/status/group/channel."""
    return isinstance(chat_id, str) and chat_id.endswith(("@c.us", "@s.whatsapp.net", "@lid"))


def _is_language_command(command):
    return command in {'language','lang','भाषा','भाषा चुनें','भाषा निवडा'}


def _is_menu_command(command):
    return command in {'menu','मेनू','cancel','रद्द','रद्द करा'}


def _is_infra_choice(command):
    return command in {
        '1','infrastructure','infrastructure search',
        'इन्फ्रास्ट्रक्चर','इन्फ्रास्ट्रक्चर खोज','बुनियादी ढांचा',
        'पायाभूत सुविधा','पायाभूत सुविधा शोध',
    }


def _is_road_choice(command):
    return command in {
        '2','road','road damage','road damage report',
        'सड़क','सड़क क्षति','सड़क क्षति रिपोर्ट',
        'रस्ता','रस्ता नुकसान','रस्ता नुकसान अहवाल',
    }


async def process_event(data):
    if data.get('event')!='message':
        return

    payload=data.get('payload') or {}
    if payload.get('fromMe'):
        return

    chat=payload.get('from')
    session=data.get('session')
    msg_id=payload.get('id') or data.get('id')
    if not chat or not session or not msg_id or not is_private_chat(chat):
        return
    if not store.mark_once(str(session)+':'+str(msg_id)):
        return

    body=(payload.get('body') or '').strip()
    command=(extract_selection(payload) or body).strip().lower()
    state,draft=store.get_chat(chat)
    language=store.get_language(chat)
    media=payload.get('media') or {}
    loc=extract_location(payload)

    if _is_language_command(command):
        store.set_chat(chat,'LANGUAGE')
        await send_text(session,chat,t(language or 'en','language_prompt'))
        return

    if command in {'geosathi','hi','hello','start'}:
        if language:
            store.set_chat(chat,'MENU')
            await send_menu(session,chat,t(language,'menu'),language)
        else:
            store.set_chat(chat,'LANGUAGE')
            await send_text(session,chat,t('en','language_prompt'))
        return

    if _is_menu_command(command):
        if language:
            store.set_chat(chat,'MENU')
            await send_menu(session,chat,t(language,'menu'),language)
        else:
            store.set_chat(chat,'LANGUAGE')
            await send_text(session,chat,t('en','language_prompt'))
        return

    if state=='LANGUAGE':
        selected=normalize_language(command)
        if not selected:
            await send_text(session,chat,t(language or 'en','language_prompt'))
            return
        store.set_language(chat,selected)
        store.set_chat(chat,'MENU')
        await send_text(session,chat,t(selected,'language_saved'))
        await send_menu(session,chat,t(selected,'menu'),selected)
        return

    # Existing users from older deployments may not have a preference row yet.
    language=language or 'en'

    reply=None
    if state=='MENU':
        if _is_infra_choice(command):
            store.set_chat(chat,'INFRA_QUERY')
            reply=t(language,'infra_prompt')
        elif _is_road_choice(command):
            store.set_chat(chat,'ROAD_IMAGE')
            reply=t(language,'road_prompt')
        else:
            await send_menu(session,chat,t(language,'menu'),language)
            return

    elif state=='ROAD_IMAGE':
        mime=str(media.get('mimetype','')).split(';',1)[0].lower()
        suffix=IMAGE_EXTENSIONS.get(mime)
        if payload.get('hasMedia') and suffix:
            path=Path(settings.media_dir)/(uuid.uuid4().hex+suffix)
            try:
                await download_image(media,path)
            except Exception:
                log.exception('Image download failed')
                reply=t(language,'image_download_failed')
            else:
                store.set_chat(chat,'ROAD_LOCATION',{'image':str(path)})
                reply=t(language,'image_received')
        else:
            reply=t(language,'invalid_image')

    elif state=='ROAD_LOCATION':
        if loc:
            image=draft.get('image')
            if not image or not Path(image).exists():
                store.set_chat(chat,'ROAD_IMAGE')
                reply=t(language,'photo_expired')
            else:
                report_id='GS-'+uuid.uuid4().hex[:8].upper()
                store.set_chat(chat,'MENU')
                store.save_report(report_id,chat,loc['lat'],loc['lon'],image)
                await send_text(
                    session,
                    chat,
                    t(language,'processing_report',report_id=report_id),
                )
                await finish_report(session,chat,report_id,image,loc,language)
                return
        else:
            reply=t(language,'road_location_invalid')

    elif state=='INFRA_QUERY':
        if len(body)<5:
            reply=t(language,'infra_query_short')
        else:
            store.set_chat(chat,'INFRA_LOCATION',{'query':body})
            reply=t(language,'infra_location_prompt')

    elif state=='INFRA_LOCATION':
        if loc:
            query=draft.get('query','')
            search_id='Q-'+uuid.uuid4().hex[:8].upper()
            store.set_chat(chat,'MENU')
            store.save_search(search_id,chat,query,loc)
            await send_text(session,chat,t(language,'searching',search_id=search_id))
            await finish_search(session,chat,search_id,query,loc,language)
            return
        else:
            reply=t(language,'infra_location_invalid')

    if reply:
        await send_text(session,chat,reply)


def extract_selection(payload):
    """Support GOWS list selectedRowID and normal text replies."""
    data=payload.get('_data') or {}
    msg=data.get('Message') or {}
    entries=[
        payload.get('selectedRowId'),
        payload.get('selectedRowID'),
        (payload.get('listResponse') or {}).get('rowId'),
        (msg.get('listResponseMessage') or {}).get('singleSelectReply',{}).get('selectedRowID'),
    ]
    for entry in entries:
        if isinstance(entry,str) and entry.lower() in {'infrastructure','road','1','2'}:
            return entry.lower()
    return None


@app.post('/webhooks/waha')
async def webhook(request:Request, background_tasks:BackgroundTasks):
    body=await request.body()
    if not settings.waha_hmac_secret:
        raise HTTPException(status_code=503,detail='Webhook secret not configured')
    sig=request.headers.get('X-Webhook-Hmac','')
    alg=request.headers.get('X-Webhook-Hmac-Algorithm','')
    expected=hmac.new(settings.waha_hmac_secret.encode(),body,hashlib.sha512).hexdigest()
    if alg.lower()!='sha512' or not hmac.compare_digest(expected,sig.lower()):
        raise HTTPException(status_code=401,detail='Invalid webhook signature')
    try:
        data=json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400,detail='Invalid JSON')
    if (
        data.get('event')=='message'
        and is_private_chat((data.get('payload') or {}).get('from'))
        and not (data.get('payload') or {}).get('fromMe')
    ):
        background_tasks.add_task(process_event,data)
    return {'accepted':True}
