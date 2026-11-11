"""Fetch missing public text sources for an accurate local preview, hash-checked."""
import hashlib,json,time,urllib.request,urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/blackfriday-20261110'
state=json.loads((OUT/'baseline.json').read_text('utf8'))
names=[n for n in json.loads((OUT/'preview-missing.json').read_text()) if Path(n).suffix in ['.mjs','.js','.css','.html','.json']]
def fetch(name):
 try:
  req=urllib.request.Request('https://xn--80aaan1dh9b.xn--p1ai/'+urllib.parse.quote(name),headers={'User-Agent':'DachaPar-Static-Source-Check/1.0'})
  with urllib.request.urlopen(req,timeout=20) as response:data=response.read()
  assert hashlib.sha256(data).hexdigest()==state['web_files'][name]
  p=OUT/'baseline/web'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
  return {'name':name,'ok':True}
 except Exception as error:return {'name':name,'ok':False,'error':type(error).__name__}
results=[]
with ThreadPoolExecutor(max_workers=4) as pool:
 for result in pool.map(fetch,names):
  results.append(result)
  if len(results)%12==0:print(json.dumps({'source_progress':len(results),'total':len(names)}),flush=True)
print(json.dumps({'public_sources_fetched':sum(r['ok'] for r in results),'failures':[r for r in results if not r['ok']][:5],'private_data_fetched':False}))
