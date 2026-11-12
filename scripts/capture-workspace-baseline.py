"""Read-only production inventory; copy public sources, never accounts or client data."""
import base64,hashlib,json,subprocess,sys,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local/crm-speed-20261111'
SOURCE=r'''import pathlib,json,hashlib,base64
w=pathlib.Path('/srv/sites/dachapar-preview/current').resolve(strict=True);a=pathlib.Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
assert w.parent==pathlib.Path('/srv/sites/dachapar-preview/releases') and a.parent==pathlib.Path('/srv/services/garant-bani-relay/releases')
def inventory(root):
 result={};sizes={}
 for p in root.rglob('*'):
  assert not p.is_symlink()
  if p.is_file():
   data=p.read_bytes();name=p.relative_to(root).as_posix();result[name]=hashlib.sha256(data).hexdigest();sizes[name]=len(data)
 return result,sizes
wf,ws=inventory(w);af,asz=inventory(a)
source={}
api_source={n:base64.b64encode((a/n).read_bytes()).decode() for n in ['server/lead-store.mjs','server/crm-manager-api.mjs']}
print(json.dumps({'web':str(w),'api':str(a),'web_files':wf,'api_files':af,'sizes':ws,'source':source,'api_source':api_source}))
'''
def sha(data):return hashlib.sha256(data).hexdigest()
OUT.mkdir(parents=True,exist_ok=True)
r=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar','python3 -'],input=SOURCE.encode(),capture_output=True,timeout=50,check=True)
c=json.loads(r.stdout);sources=c.pop('source');apis=c.pop('api_source');sizes=c.pop('sizes')
(OUT/'baseline.json').write_text(json.dumps(c,indent=2)+'\n',encoding='utf8')
(OUT/'sizes.json').write_text(json.dumps(sizes,indent=2)+'\n',encoding='utf8')
for kind,files in [('web',sources),('api',apis)]:
 for name,value in files.items():
  data=base64.b64decode(value);assert sha(data)==c[kind+'_files'][name]
  dest=OUT/'baseline'/kind/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
preview=OUT/'preview-web';missing=[]
bases=[OUT/'baseline/web',ROOT/'web',ROOT/'.local/blackfriday-20261110/preview-web',ROOT/'.local/package-layouts-20261110/baseline/web']
for name,digest in c['web_files'].items():
 for base in bases:
  p=base/name
  if p.is_file() and sha(p.read_bytes())==digest:
   dest=preview/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);break
 else:missing.append(name)
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen
def fetch(name):
 try:
  with urlopen('https://xn--80aaan1dh9b.xn--p1ai/'+name,timeout=20) as response:data=response.read()
  assert sha(data)==c['web_files'][name]
  for base in [OUT/'baseline/web',preview]:
   p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
  return name
 except Exception:return None
needed=[n for n in missing if Path(n).suffix in ['.html','.mjs','.js','.css','.json','.svg','.woff2']]
with ThreadPoolExecutor(max_workers=8) as pool:fetched=set(filter(None,pool.map(fetch,needed)))
missing=[n for n in missing if n not in fetched]
(OUT/'missing.json').write_text(json.dumps(missing,indent=2)+'\n',encoding='utf8')
print(json.dumps({'web':c['web'],'api':c['api'],'web_files':len(c['web_files']),'source_files':len(sources),'missing_images':len(missing),'public_bytes':sum(sizes.values())}))
