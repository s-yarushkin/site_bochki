"""Read one public model losslessly compressed over SSH for local 3D verification."""
import gzip,hashlib,json
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-speed-20261111'
c=json.loads((OUT/'build.json').read_text());target='assets/fast/40805cfe723ce86305926f4f.glb';info=c['aliases'][target]
size=json.loads((OUT/'sizes.json').read_text())[info['source']];step=65536
def block(start):
 end=min(size-1,start+step-1)
 for attempt in range(3):
  try:
   with urlopen(Request('https://xn--80aaan1dh9b.xn--p1ai/'+info['source'],headers={'Range':f'bytes={start}-{end}'}),timeout=15) as response:
    assert response.status==206 and response.headers['Content-Range']==f'bytes {start}-{end}/{size}'
    data=response.read();assert len(data)==end-start+1;return data
  except Exception:
   if attempt==2:raise
with ThreadPoolExecutor(max_workers=8) as pool:data=b''.join(pool.map(block,range(0,size,step)))
assert hashlib.sha256(data).hexdigest()==info['sha256']
for name in ['preview-web/'+info['source'],'candidate-web/'+info['source'],'candidate-web/'+target]:
 p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
report={'model':info['source'],'original_bytes':len(data),'gzip_bytes':len(gzip.compress(data,mtime=0)),'lossless':True}
(OUT/'model-compression.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
