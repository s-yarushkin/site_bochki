"""Upload only reviewed release artifacts over SSH, avoiding fragile SFTP transfers."""
import gzip,hashlib,io,json,os,re,shlex,subprocess,tarfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local'/os.environ['DACHAPAR_CONSENT_PACKAGE']
c=json.loads((OUT/'deployment.json').read_text('utf8'))
assert re.fullmatch(r'CONSENT-[a-f0-9]{12}',c['release'])
assert set(c['support_files'])<= {'deploy-consent-remote.py','crm-production-audit.py','audit-lead-intent.py','caddy_public_cache.py'}
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
remote="""import hashlib,io,json,os,sys,tarfile
from pathlib import Path
folder=Path(FOLDER);folder.mkdir(mode=0o700,exist_ok=True)
assert not folder.is_symlink() and folder.stat().st_uid==os.getuid()
data=sys.stdin.buffer.read();assert hashlib.sha256(data).hexdigest()==DIGEST
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
 assert set(tar.getnames())==set(NAMES)
 for member in tar.getmembers():
  assert member.isfile() and member.name in NAMES
  target=folder/member.name;assert not target.is_symlink()
  pending=target.with_suffix(target.suffix+'.upload');assert not pending.is_symlink()
  pending.write_bytes(tar.extractfile(member).read());pending.chmod(0o600);os.replace(pending,target)
print(json.dumps({'ok':True,'artifacts':len(NAMES),'archive_sha256_verified':True}))
""".replace('FOLDER',repr(folder)).replace('DIGEST',repr(hashlib.sha256(payload).hexdigest())).replace('NAMES',repr(list(files)))
args=['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar','python3 -c '+shlex.quote(remote)]
print('Uploading reviewed artifacts in small SSH chunks',flush=True)
process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
 for offset in range(0,len(payload),1024):
  process.stdin.write(payload[offset:offset+1024]);process.stdin.flush();time.sleep(.025)
 process.stdin.close();process.stdin=None
 stdout,stderr=process.communicate(timeout=90)
 if process.returncode:raise RuntimeError('SSH upload failed: '+stderr.decode('utf8',errors='replace')[-250:])
 print(stdout.decode('utf8').strip())
except Exception:
 process.kill();process.communicate();raise
