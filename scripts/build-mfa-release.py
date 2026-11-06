"""Build a small overlay and a disposable test fixture. No production secrets/data."""
import hashlib,io,json,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/mfa';OUT.mkdir(parents=True,exist_ok=True)
FILES=['api/server/'+n for n in ['crm-access.mjs','crm-session.mjs','crm-manager-api.mjs','crm-mfa.mjs','crm-totp.mjs','garant-bani-relay.mjs','vendor/qrcode.cjs','vendor/qrcode-LICENSE.txt']]+['web/'+n for n in ['manager.html','assets/js/manager.js','crm/manager-extension.mjs','crm/manager-mfa.mjs','crm/manager-mfa.css']]
def sha(data):return hashlib.sha256(data).hexdigest()
def archive(file,entries):
 with tarfile.open(file,'w:gz',compresslevel=6) as tar:
  for name,data in sorted(entries.items()):
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
source={name:(ROOT/name).read_bytes() for name in FILES};identity=sha(json.dumps({n:sha(d) for n,d in source.items()},sort_keys=True).encode())[:12]
inventory="""import hashlib,json,pathlib
def tree(root):
 r={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Release symlink')
  if p.is_file():r[p.relative_to(root).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
 return r
w=pathlib.Path('/srv/sites/dachapar-preview/current').resolve(strict=True);a=pathlib.Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
print(json.dumps({'expected_web':str(w),'expected_api':str(a),'web_baseline':tree(w),'api_baseline':tree(a)}))
"""
baseline=json.loads(subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','python3 -'],input=inventory,text=True,capture_output=True,check=True).stdout)
archive(OUT/'payload.tar.gz',source)
stage={}
for p in (ROOT/'.local/api-baseline').rglob('*'):
 if p.is_file() and p.suffix in ['.js','.mjs','.json','.cjs']:stage['.local/api-baseline/'+p.relative_to(ROOT/'.local/api-baseline').as_posix()]=p.read_bytes()
for p in (ROOT/'api').rglob('*'):
 if p.is_file():stage['api/'+p.relative_to(ROOT/'api').as_posix()]=p.read_bytes()
for p in (ROOT/'web').rglob('*'):
 if p.is_file() and p.suffix in ['.html','.js','.mjs','.json','.css']:stage['web/'+p.relative_to(ROOT/'web').as_posix()]=p.read_bytes()
for name in ['crm-preview.mjs','test-api.mjs','mfa-stage-check.mjs']:stage['scripts/'+name]=(ROOT/'scripts'/name).read_bytes()
archive(OUT/'stage.tar.gz',stage)
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
config={'id':identity,'source_commit':commit,'mfa':True,**baseline,'overlay':{n:sha(d) for n,d in source.items()},'payload_sha256':sha((OUT/'payload.tar.gz').read_bytes()),'stage_sha256':sha((OUT/'stage.tar.gz').read_bytes())}
(OUT/'deployment.json').write_bytes((json.dumps(config,indent=2)+'\n').encode())
print(json.dumps({'release':'MFA-'+identity,'files':len(FILES),'fixture_bytes':(OUT/'stage.tar.gz').stat().st_size,'source_commit':commit,'protected_web_files':len(baseline['web_baseline'])-sum(n.startswith('web/') and n[4:] in baseline['web_baseline'] for n in FILES)}))
