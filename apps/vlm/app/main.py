"""SkyCLIP service. Deliberately never fabricates semantic or GIS results."""
import os, json, threading
from pathlib import Path
from contextlib import asynccontextmanager
import numpy as np
from PIL import Image
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel, Field

MODEL_PATH=Path(os.getenv('SKYCLIP_CHECKPOINT','/models/epoch_20.pt'))
IMAGE_ROOT=Path(os.getenv('IMAGE_ROOT','/data/images'))
INDEX_DIR=Path(os.getenv('INDEX_DIR','/data/index'))
SERVICE_TOKEN=os.getenv('SERVICE_TOKEN','')
DEVICE=os.getenv('DEVICE','cpu')
_model=None;_preprocess=None;_tokenizer=None;_torch=None
_lock=threading.Lock()

def authorize(authorization: str | None=Header(default=None)):
    if not SERVICE_TOKEN: raise HTTPException(503,'SERVICE_TOKEN not configured')
    if authorization != f'Bearer {SERVICE_TOKEN}': raise HTTPException(401,'Unauthorized')

def load_model():
    global _model,_preprocess,_tokenizer,_torch
    if _model is not None: return
    if not MODEL_PATH.is_file(): raise RuntimeError(f'Checkpoint missing: {MODEL_PATH}. See README for download.')
    with _lock:
        if _model is not None: return
        import torch, open_clip
        model,_,preprocess=open_clip.create_model_and_transforms('ViT-B-32',pretrained=str(MODEL_PATH),device=DEVICE)
        model.eval()
        _model,_preprocess,_tokenizer,_torch=model,preprocess,open_clip.get_tokenizer('ViT-B-32'),torch

def embed_images(paths):
    load_model()
    output=[]
    with _torch.inference_mode():
        for path in paths:
            with Image.open(path) as im:
                tensor=_preprocess(im.convert('RGB')).unsqueeze(0).to(DEVICE)
            vec=_model.encode_image(tensor).float()
            vec=vec/vec.norm(dim=-1,keepdim=True).clamp(min=1e-10)
            output.append(vec.cpu().numpy()[0])
    return np.stack(output).astype('float32')

def embed_query(query):
    load_model()
    with _torch.inference_mode():
        tokens=_tokenizer([query]).to(DEVICE)
        vec=_model.encode_text(tokens).float()
        vec=vec/vec.norm(dim=-1,keepdim=True).clamp(min=1e-10)
        return vec.cpu().numpy()[0]

class SearchInput(BaseModel):
    query: str=Field(min_length=3,max_length=1000)
    top_k: int=Field(default=5,ge=1,le=50)
    bbox: list[float] | None=None # [minlon,minlat,maxlon,maxlat]

def index_files():
    index=INDEX_DIR/'vectors.npy';manifest=INDEX_DIR/'metadata.json'
    if not index.is_file() or not manifest.is_file(): raise HTTPException(503,'No imagery index. Run scripts/build_index.py first.')
    arr=np.load(index,allow_pickle=False);items=json.loads(manifest.read_text())
    if len(items)!=len(arr): raise HTTPException(503,'Index/metadata mismatch')
    return arr,items

def overlaps(a,b):
    return a[0]<=b[2] and a[2]>=b[0] and a[1]<=b[3] and a[3]>=b[1]

app=FastAPI(title='GeoSathi SkyCLIP Retrieval',version='0.2.0')
@app.get('/health')
def health():
    return {'ok':True,'component':'skyclip-service','checkpoint_present':MODEL_PATH.is_file(),
            'index_present':(INDEX_DIR/'vectors.npy').is_file(),'model_loaded':_model is not None}

@app.post('/search',dependencies=[Depends(authorize)])
def search(payload:SearchInput):
    if payload.bbox is not None:
        b=payload.bbox
        if len(b)!=4 or not (-180<=b[0]<b[2]<=180 and -90<=b[1]<b[3]<=90):
            raise HTTPException(422,'Expected bbox [minlon,minlat,maxlon,maxlat]')
    arr,items=index_files()
    if not len(items): return {'query':payload.query,'model':'SkyCLIP ViT-B/32','results':[]}
    q=embed_query(payload.query)
    if arr.shape[1]!=q.shape[0]: raise HTTPException(503,'Embedding dimension mismatch; rebuild index')
    scores=arr@q
    candidates=[]
    for i,item in enumerate(items):
        if payload.bbox and not overlaps(item['bbox'],payload.bbox):continue
        candidates.append({'tile_id':item['tile_id'],'bbox':item['bbox'],
            'source':item.get('source','unknown'),'acquired_at':item.get('acquired_at'),
            'similarity':round(float(scores[i]),6)})
    candidates.sort(key=lambda x:x['similarity'],reverse=True)
    return {'query':payload.query,'model':'SkyCLIP ViT-B/32','results':candidates[:payload.top_k],
            'note':'Similarity-ranked image tiles; not verified object detections or spatial features.'}
