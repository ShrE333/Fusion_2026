import hashlib
import hmac
import json
import logging
import re
import uuid
from pathlib import Path
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from .config import settings
from . import store
from .waha import download_image, send_text, send_menu
import httpx

logging.basicConfig(level=logging.INFO)
log=logging.getLogger('fusion.whatsapp')
app=FastAPI(title='Fusion 2026 WhatsApp Adapter', version='0.1.0')

MENU='👋 Welcome to GeoSathi AI!\n\n1️⃣ Infrastructure Search 🛰️\n2️⃣ Road Damage Report 🛣️\n\nReply 1 or 2. Type menu anytime.'
ROAD='🛣️ Please send a clear pothole/road-damage photo (one image).'
INFRA='🛰️ What do you want to locate?\nExample: Find buildings near drainage within 200m.\n\nSend your natural-language query.'

@app.on_event('startup')
def start():
    store.init()
    if not settings.waha_api_key or not settings.waha_hmac_secret:
        log.warning('WAHA credentials not configured. Webhooks will be rejected until HMAC is configured.')

@app.get('/health')
def health():
    return {'ok': True, 'component': 'whatsapp-adapter'}


def extract_location(payload):
    loc=payload.get('location') or payload.get('_data',{}).get('location') or {}
    if not isinstance(loc,dict): loc={}
    lat=loc.get('latitude',loc.get('lat',payload.get('latitude',payload.get('lat'))))
    lon=loc.get('longitude',loc.get('lng',loc.get('lon',payload.get('longitude',payload.get('lng')))))
    try:
        if lat is None or lon is None: return None
        lat,lon=float(lat),float(lon)
        if -90<=lat<=90 and -180<=lon<=180: return {'lat':lat,'lon':lon}
    except (ValueError,TypeError): pass
    return None


async def call_worker(url, data):
    if not url: return None
    h={'Authorization':f'Bearer {settings.service_token}'} if settings.service_token else {}
    async with httpx.AsyncClient(timeout=50) as client:
        r=await client.post(url,json=data,headers=h)
        r.raise_for_status()
        return r.json()


async def finish_report(session, chat, report_id, image, loc):
    # Image coordinates are not measured hazard coordinates; user's pin is only a reported location.
    status='pending_inference'; result={}
    try:
        if settings.road_inference_url:
            # Real YOLO service can be plugged in only after secure shared media access is agreed.
            # Do not submit unresolvable local file paths to remote AWS services.
            result=await call_worker(settings.road_inference_url, {'report_id':report_id,'image_path':str(image),'location':loc})
            status='pending_verification'
        store.save_report(report_id,chat,loc['lat'],loc['lon'],str(image),status,result)
        extra='Detection submitted for review.' if result else 'AI detection is not connected yet; report saved for processing.'
        await send_text(session,chat,f'✅ Report {report_id} saved.\nReported pin: {loc["lat"]:.5f}, {loc["lon"]:.5f}\nStatus: {status}\n{extra}')
    except Exception:
        log.exception('Report processor failed for %s',report_id)
        store.save_report(report_id,chat,loc['lat'],loc['lon'],str(image),'processing_failed',{})
        await send_text(session,chat,f'⚠️ Report {report_id} saved but processing failed. Please try later.')


async def finish_search(session,chat,search_id,query,loc):
    try:
        # Real spatial results come only from connected retrieval + GIS backend.
        if settings.infra_search_url:
            result=await call_worker(settings.infra_search_url,{'query_id':search_id,'query':query,'location':loc})
            store.save_search(search_id,chat,query,loc,'completed',result)
            await send_text(session,chat,f'🛰️ Search {search_id} completed. Open your dashboard to review the real results.')
        else:
            store.save_search(search_id,chat,query,loc,'pending_index',{})
            await send_text(session,chat,f'🛰️ Search {search_id} saved. Satellite image indexing/search is not connected yet. No geographic matches have been asserted.')
    except Exception:
        log.exception('Search failed %s',search_id)
        store.save_search(search_id,chat,query,loc,'failed',{})
        await send_text(session,chat,f'⚠️ Search {search_id} could not finish. Please retry later.')


async def process_event(data):
    if data.get('event')!='message': return
    payload=data.get('payload') or {}
    if payload.get('fromMe'): return
    chat=payload.get('from')
    session=data.get('session')
    msg_id=payload.get('id') or data.get('id')
    if not chat or not session or not msg_id or chat.endswith('@g.us'): return
    if not store.mark_once(str(session)+':'+str(msg_id)): return
    body=(payload.get('body') or '').strip()
    command=extract_selection(payload) or body.lower()
    state,draft=store.get_chat(chat)
    media=payload.get('media') or {}
    loc=extract_location(payload)
    reply=None
    if command in {'hi','hello','start','menu','cancel'}:
        store.set_chat(chat,'MENU')
        reply=MENU
    elif state=='MENU':
        if command in {'1','infrastructure','infrastructure search'}:
            store.set_chat(chat,'INFRA_QUERY');reply=INFRA
        elif command in {'2','road','road damage','road damage report'}:
            store.set_chat(chat,'ROAD_IMAGE');reply=ROAD
        else: reply=MENU
    elif state=='ROAD_IMAGE':
        if payload.get('hasMedia') and str(media.get('mimetype','')).lower() in ('image/jpeg','image/png','image/webp'):
            path=Path(settings.media_dir)/(uuid.uuid4().hex+'.jpg')
            try: await download_image(media,path)
            except Exception:
                log.exception('Image download failed');reply='Could not download image. Please resend a JPG/PNG image.'
            else:
                store.set_chat(chat,'ROAD_LOCATION',{'image':str(path)})
                reply='📍 Image received! Send the road damage location as a WhatsApp location pin.'
        else: reply='Please send a JPG/PNG photo of the road damage, or type menu.'
    elif state=='ROAD_LOCATION':
        if loc:
            image=draft.get('image')
            if not image or not Path(image).exists():
                store.set_chat(chat,'ROAD_IMAGE');reply='Photo expired. Please send it again.'
            else:
                report_id='GS-'+uuid.uuid4().hex[:8].upper()
                store.set_chat(chat,'MENU')
                store.save_report(report_id,chat,loc['lat'],loc['lon'],image)
                await send_text(session,chat,f'⏳ Processing report {report_id}...')
                await finish_report(session,chat,report_id,image,loc)
                return
        else: reply='Send a WhatsApp *location pin* for the road damage, or type menu.'
    elif state=='INFRA_QUERY':
        if len(body)<5: reply='Describe the infrastructure you want to find (at least 5 characters).'
        else:
            store.set_chat(chat,'INFRA_LOCATION',{'query':body})
            reply='📍 Please share the centre of the study area as a WhatsApp location pin. (Search coverage will depend on indexed imagery.)'
    elif state=='INFRA_LOCATION':
        if loc:
            query=draft.get('query','')
            search_id='Q-'+uuid.uuid4().hex[:8].upper()
            store.set_chat(chat,'MENU')
            store.save_search(search_id,chat,query,loc)
            await send_text(session,chat,f'⏳ Searching imagery for {search_id}...')
            await finish_search(session,chat,search_id,query,loc)
            return
        else: reply='Please share a WhatsApp location pin for the search area, or type menu.'
    if reply:
        if reply==MENU: await send_menu(session,chat,MENU)
        else: await send_text(session,chat,reply)


def extract_selection(payload):
    """Support GOWS list selectedRowID and normal text replies."""
    d=payload.get('_data') or {}
    msg=d.get('Message') or {}
    entries=[payload.get('selectedRowId'), payload.get('selectedRowID'),
             (payload.get('listResponse') or {}).get('rowId'),
             (msg.get('listResponseMessage') or {}).get('singleSelectReply',{}).get('selectedRowID')]
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
    try: data=json.loads(body)
    except json.JSONDecodeError: raise HTTPException(status_code=400,detail='Invalid JSON')
    if data.get('event')=='message': background_tasks.add_task(process_event,data)
    return {'accepted':True}
