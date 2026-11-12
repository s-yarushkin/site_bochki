"""Prepare a reviewable overlay and lossless aliases against the captured production tree."""
import base64,gzip,hashlib,io,json,shlex,subprocess,tarfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-speed-20261111'
def sha(data):return hashlib.sha256(data).hexdigest()
baseline=json.loads((OUT/'baseline.json').read_text('utf8'));build=json.loads((OUT/'build.json').read_text('utf8'));files={}
assert build['baseline_web']==baseline['web'] and build['baseline_index_sha256']==baseline['web_files']['index.html']
names=build['overlay_files']+['api/server/crm-lead-workspace.mjs','api/server/lead-store.mjs','api/server/crm-manager-api.mjs']
for name in names:
 kind,rel=name.split('/',1);data=(ROOT/name).read_bytes()
 if sha(data)!=baseline[kind+'_files'].get(rel):files[name]=data
assert sha(files['web/index.html'])==build['index_sha256']
support={n:sha((ROOT/'scripts'/n).read_bytes()) for n in ['deploy-workspace-remote.py','deploy-workspace-job.py','migrate-workspace.mjs','crm-production-audit.py','caddy_fast_assets.py']}
manifest={n:sha(data) for n,data in sorted(files.items())}
release='WORKSPACE-'+sha(json.dumps({'overlay':manifest,'support':support,'aliases':build['aliases']},sort_keys=True).encode())[:12]
raw=io.BytesIO()
with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as tar:
 for name,data in sorted(files.items()):
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
payload=gzip.compress(raw.getvalue(),mtime=0);(OUT/'payload.tar.gz').write_bytes(payload)
code="from pathlib import Path;import json,hashlib;print(json.dumps({'sha256':hashlib.sha256(Path('/etc/caddy/Caddyfile').read_bytes()).hexdigest()}))"
command='exec(__import__("base64").b64decode("'+base64.b64encode(code.encode()).decode()+'"))'
for attempt in range(3):
 try:
  r=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar','python3 -c '+shlex.quote(command)],stdin=subprocess.DEVNULL,capture_output=True,timeout=35,check=True)
  break
 except (OSError,subprocess.SubprocessError):
  if attempt==2:raise
  time.sleep(2)
caddy=json.loads(r.stdout)['sha256'];staff=json.loads((OUT/'staff-names.json').read_text('utf8'));assert len(staff)==3
c={'release':release,'baseline':baseline,'overlay':manifest,'payload_sha256':sha(payload),'support_files':support,'aliases':build['aliases'],'caddy_sha256':caddy,'staff_names':staff,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}
(OUT/'deployment.json').write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'release':release,'overlay_files':len(files),'upload_bytes':len(payload),'byte_identical_media_aliases':len(build['aliases']),'api_files_changed':3}))
