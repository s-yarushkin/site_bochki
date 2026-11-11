"""Capture public production sources and prepare a narrow, hash-guarded web overlay."""
import argparse,base64,gzip,hashlib,io,json,shutil,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local/blackfriday-20261110'
SOURCE='''import pathlib,json,hashlib,base64
w=pathlib.Path('/srv/sites/dachapar-preview/current').resolve(strict=True);a=pathlib.Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
assert w.parent==pathlib.Path('/srv/sites/dachapar-preview/releases') and a.parent==pathlib.Path('/srv/services/garant-bani-relay/releases')
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
 return result
names=['index.html','choice/app.mjs','choice/state.mjs','choice/catalog-pricebook.json','choice/choice.css','choice/comparison.mjs','choice/home-hero/model-request.mjs','lead-client.mjs','request-intent.mjs','journey-tracker.mjs','journey-runtime.mjs','data/site-settings.json','quiz.mjs','quote.mjs']
sources={n:base64.b64encode((w/n).read_bytes()).decode() for n in names if (w/n).is_file()}
caddy=pathlib.Path('/etc/caddy/Caddyfile').read_text()
routes=[s.strip() for s in caddy.splitlines() if any(t in s for t in ['root * /srv/sites/dachapar','file_server','try_files','handle /nov','rewrite * /nov','redir /nov'])]
print(json.dumps({'web':str(w),'api':str(a),'web_files':tree(w),'api_files':tree(a),'source':sources,'routing':routes}))
'''
def sha(data):return hashlib.sha256(data).hexdigest()
def capture():
 OUT.mkdir(parents=True,exist_ok=True)
 r=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar','python3 -'],input=SOURCE.encode(),capture_output=True,check=True,timeout=90)
 state=json.loads(r.stdout);sources=state.pop('source');routing=state.pop('routing')
 (OUT/'baseline.json').write_bytes((json.dumps(state,indent=2)+'\n').encode())
 (OUT/'routing.json').write_bytes(json.dumps(routing,indent=2).encode())
 for name,value in sources.items():
  data=base64.b64decode(value);assert sha(data)==state['web_files'][name]
  p=OUT/'baseline/web'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 print(json.dumps({'captured':True,'web':state['web'],'web_files':len(state['web_files']),'api_files':len(state['api_files']),'source_files':list(sources),'routing':routing}))
def package():
 baseline=json.loads((OUT/'baseline.json').read_text('utf8'));files={}
 names=json.loads((OUT/'overlay-files.json').read_text('utf8'))
 for name in names:
  if not name.startswith('web/') or '..' in Path(name).parts:raise RuntimeError('Only explicit web overlay paths are allowed')
  data=(ROOT/name).read_bytes()
  if sha(data)!=baseline['web_files'].get(name[4:]):files[name]=data
 manifest={n:sha(data) for n,data in sorted(files.items())}
 support={n:sha((ROOT/'scripts'/n).read_bytes()) for n in ['deploy-blackfriday-remote.py','deploy-blackfriday-job.py']}
 release='BF-'+sha(json.dumps({'overlay':manifest,'support':support},sort_keys=True).encode())[:12]
 raw=io.BytesIO()
 with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as tar:
  for name,data in sorted(files.items()):
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
 payload=gzip.compress(raw.getvalue(),mtime=0);(OUT/'payload.tar.gz').write_bytes(payload)
 config={'release':release,'baseline':baseline,'overlay':manifest,'payload_sha256':sha(payload),'support_files':support,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}
 (OUT/'deployment.json').write_bytes((json.dumps(config,indent=2)+'\n').encode())
 print(json.dumps({'release':release,'files':len(files),'bytes':len(payload),'api_changed':False}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',action='store_true');args=p.parse_args()
 capture() if args.baseline else package()
