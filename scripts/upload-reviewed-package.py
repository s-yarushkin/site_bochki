"""Upload only reviewed release artifacts over SSH, avoiding fragile SFTP transfers."""
import base64,gzip,hashlib,io,json,os,re,shlex,subprocess,tarfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local'/os.environ['DACHAPAR_CONSENT_PACKAGE']
c=json.loads((OUT/'deployment.json').read_text('utf8'))
assert re.fullmatch(r'CONSENT-[a-f0-9]{12}',c['release'])
assert set(c['support_files'])<= {'deploy-consent-remote.py','crm-production-audit.py','audit-lead-intent.py','caddy_public_cache.py','deploy-reviewed-job.py'}
folder='/tmp/dachapar-consent-'+c['release'].removeprefix('CONSENT-')
files={'deployment.json':(OUT/'deployment.json').read_bytes(),'payload.tar.gz':(OUT/'payload.tar.gz').read_bytes()}
for name,digest in c['support_files'].items():
 data=(ROOT/'scripts'/name).read_bytes()
 if hashlib.sha256(data).hexdigest()!=digest:raise RuntimeError('Reviewed helper changed')
 files[name]=data
raw=io.BytesIO()
with tarfile.open(fileobj=raw,mode='w') as tar:
 for name,data in files.items():
  item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o600;tar.addfile(item,io.BytesIO(data))
payload=gzip.compress(raw.getvalue(),mtime=0)
archive=folder+'/.upload-'+hashlib.sha256(payload).hexdigest()+'.tgz'
ssh=['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar']
def call(code):
 command='exec(__import__("base64").b64decode("'+base64.b64encode(code.encode()).decode()+'"))'
 for attempt in range(3):
  try:
   result=subprocess.run(ssh+['python3 -c '+shlex.quote(command)],stdin=subprocess.DEVNULL,capture_output=True,timeout=35)
   if result.returncode:raise RuntimeError('SSH transfer: '+result.stderr.decode('utf8',errors='replace')[-220:])
   return json.loads(result.stdout)
  except (OSError,subprocess.SubprocessError,ValueError,RuntimeError):
   if attempt==2:raise
   time.sleep(2)
start="from pathlib import Path; import json,os; p=Path("+repr(folder)+"); p.mkdir(mode=0o700,exist_ok=True); assert not p.is_symlink() and p.stat().st_uid==os.getuid(); f=Path("+repr(archive)+"); assert not f.is_symlink(); print(json.dumps({'offset':f.stat().st_size if f.exists() else 0}))"
offset=call(start)['offset']
assert 0<=offset<=len(payload)
print('Uploading reviewed archive with resumable SSH blocks: '+str(len(payload))+' bytes',flush=True)
while offset<len(payload):
 chunk=payload[offset:offset+8192];end=offset+len(chunk)
 code="from pathlib import Path; import base64,json,os; p=Path("+repr(archive)+"); assert not p.is_symlink(); f=open(p,'r+b' if p.exists() else 'w+b'); assert os.fstat(f.fileno()).st_size>="+str(offset)+"; f.seek("+str(offset)+"); f.write(base64.b64decode("+repr(base64.b64encode(chunk).decode())+")); f.flush(); os.fsync(f.fileno()); f.close(); p.chmod(0o600); print(json.dumps({'offset':"+str(end)+"}))"
 assert call(code)['offset']==end;offset=end
 print('Uploaded '+str(offset)+' / '+str(len(payload)),flush=True)
remote="""import hashlib,io,json,os,sys,tarfile
from pathlib import Path
folder=Path(FOLDER);folder.mkdir(mode=0o700,exist_ok=True)
assert not folder.is_symlink() and folder.stat().st_uid==os.getuid()
data=Path(ARCHIVE).read_bytes();assert hashlib.sha256(data).hexdigest()==DIGEST
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
 assert set(tar.getnames())==set(NAMES)
 for member in tar.getmembers():
  assert member.isfile() and member.name in NAMES
  target=folder/member.name;assert not target.is_symlink()
  pending=target.with_suffix(target.suffix+'.upload');assert not pending.is_symlink()
  pending.write_bytes(tar.extractfile(member).read());pending.chmod(0o600);os.replace(pending,target)
print(json.dumps({'ok':True,'artifacts':len(NAMES),'archive_sha256_verified':True}))
""".replace('FOLDER',repr(folder)).replace('ARCHIVE',repr(archive)).replace('DIGEST',repr(hashlib.sha256(payload).hexdigest())).replace('NAMES',repr(list(files)))
print(json.dumps(call(remote)))
