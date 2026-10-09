"""Offline image index. Input manifest JSON list of {tile_id, file, bbox, source, acquired_at}."""
import os,sys,json
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.main import embed_images, IMAGE_ROOT, INDEX_DIR

def main():
    if len(sys.argv)!=2: raise SystemExit('Usage: python scripts/build_index.py /data/tiles.json')
    items=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    if not isinstance(items,list) or not items: raise SystemExit('Expected nonempty JSON array')
    paths=[];seen=set()
    for item in items:
        assert isinstance(item['tile_id'],str) and item['tile_id'] not in seen,'Duplicate/invalid tile ID'
        seen.add(item['tile_id'])
        bbox=item['bbox']
        assert len(bbox)==4 and -180<=bbox[0]<bbox[2]<=180 and -90<=bbox[1]<bbox[3]<=90,'Invalid bbox'
        p=(IMAGE_ROOT/item['file']).resolve()
        assert p.is_relative_to(IMAGE_ROOT.resolve()) and p.is_file(),'File must exist inside IMAGE_ROOT'
        paths.append(p)
    vec=embed_images(paths)
    INDEX_DIR.mkdir(parents=True,exist_ok=True)
    np.save(INDEX_DIR/'vectors.npy',vec)
    (INDEX_DIR/'metadata.json').write_text(json.dumps(items,indent=2),encoding='utf-8')
    print(f'Indexed {len(items)} georeferenced images; vector size {vec.shape[1]}')
if __name__=='__main__':main()
