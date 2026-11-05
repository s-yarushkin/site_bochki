"""Build explicit source overlays and a fixture-only HTTPS staging bundle. No credentials."""
import hashlib,json,tarfile,io,subprocess,secrets
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'.local/crm-release';out.mkdir(parents=True,exist_ok=True)
web={n:'web/'+n for n in ['manager.html','privacy.html','assets/js/manager.js','crm/manager-extension.mjs','crm/manager-extension.css','journey-tracker.mjs','journey-tracker.css','analytics-core.mjs','lead-client.mjs']}
for prefix,names in [('home-hero/',['layout-panel.mjs','layout-viewer.mjs','model-request.mjs']),('choice/home-hero/',['layout-panel.mjs','model-request.mjs'])]:
 for name in names:web[prefix+name]=('concepts/choice-album/' if prefix.startswith('choice/') else 'concepts/')+prefix+name
api={p.relative_to(root/'api').as_posix():p.relative_to(root).as_posix() for p in (root/'api/server').glob('crm-*.mjs')}
api.update({n:'api/'+n for n in ['server/garant-bani-relay.mjs','server/lead-store.mjs']})
def digest(data):return hashlib.sha256(data).hexdigest()
def add(tar,name,data):
 info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
overlay={}
with tarfile.open(out/'payload.tar.gz','w:gz') as tar:
 for kind,mapping in [('web',web),('api',api)]:
  for destination,source in mapping.items():
   data=(root/source).read_bytes();name=kind+'/'+destination;add(tar,name,data);overlay[name]=digest(data)
with tarfile.open(out/'stage.tar.gz','w:gz') as tar:
 stage={}
 for folder in ['web','.local/api-baseline']:
  for p in (root/folder).rglob('*'):
   if p.is_file() and p.suffix in ['.mjs','.js','.html','.css','.json']:stage[p.relative_to(root).as_posix()]=p
 for p in (root/'api/server').glob('*.mjs'):stage[p.relative_to(root).as_posix()]=p
 for name in ['scripts/test-api.mjs','scripts/crm-preview.mjs']:stage[name]=root/name
 for name,p in stage.items():add(tar,name,p.read_bytes())
 # Isolated fixture test uses only baseline public source. No credential paths are included.
 add(tar,'package.json',b'{"type":"module"}')
config={'version':1,'id':secrets.token_hex(6),'expected_web':'/srv/sites/dachapar-preview/releases/ALBUM-2184569675bafffe','expected_api':'/srv/services/garant-bani-relay/releases/DPQUIZ-bd4ef314ab5f','overlay':overlay,'payload_sha256':digest((out/'payload.tar.gz').read_bytes()),'stage_sha256':digest((out/'stage.tar.gz').read_bytes()),'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()}
config['api_baseline']={p.relative_to(root/'.local/api-baseline').as_posix():digest(p.read_bytes()) for p in (root/'.local/api-baseline').rglob('*') if p.is_file() and p.suffix in ['.mjs','.js','.json']}
(out/'deployment.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(overlay),'stage_bytes':(out/'stage.tar.gz').stat().st_size,'payload_bytes':(out/'payload.tar.gz').stat().st_size,'id':config['id']}))
