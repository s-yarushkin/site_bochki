"""Resumable binary SSH upload of reviewed artifacts, then read-only remote preflight."""
import base64,gzip,hashlib,io,json,os,shlex,subprocess,tarfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-speed-20261111'
c=json.loads((OUT/'deployment.json').read_text('utf8'));folder='/tmp/dachapar-workspace-'+c['release'].removeprefix('WORKSPACE-')
files={'deployment.json':(OUT/'deployment.json').read_bytes(),'payload.tar.gz':(OUT/'payload.tar.gz').read_bytes()}
for name,digest in c['support_files'].items():
 data=(ROOT/'scripts'/name).read_bytes();assert hashlib.sha256(data).hexdigest()==digest;files[name]=data
raw=io.BytesIO()
with tarfile.open(fileobj=raw,mode='w') as tar:
 for name,data in files.items():
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o600;tar.addfile(info,io.BytesIO(data))
payload=gzip.compress(raw.getvalue(),mtime=0);digest=hashlib.sha256(payload).hexdigest();archive=folder+'/.upload-'+digest+'.tgz'
ssh=['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar']
def call(code,data=None,timeout=90):
 command='exec(__import__("base64").b64decode("'+base64.b64encode(code.encode()).decode()+'"))'
 for attempt in range(3):
  try:
   r=subprocess.run(ssh+['python3 -c '+shlex.quote(command)],input=data,capture_output=True,timeout=timeout)
   if r.returncode:raise RuntimeError('SSH: '+r.stderr.decode('utf8',errors='replace')[-200:])
   return json.loads(r.stdout.strip().splitlines()[-1])
  except (OSError,subprocess.SubprocessError,ValueError,RuntimeError):
   if attempt==2:raise
   time.sleep(2)
code="from pathlib import Path; import json,os; p=Path("+repr(folder)+"); p.mkdir(mode=0o700,exist_ok=True); assert not p.is_symlink() and p.stat().st_uid==os.getuid(); f=Path("+repr(archive)+"); assert not f.is_symlink(); print(json.dumps({'offset':f.stat().st_size if f.exists() else 0}))"
offset=call(code)['offset'];assert 0<=offset<=len(payload)
print(json.dumps({'upload_bytes':len(payload),'resume_offset':offset}),flush=True)
while offset<len(payload):
 chunk=payload[offset:offset+262144];end=offset+len(chunk)
 code="from pathlib import Path; import sys,json,hashlib,os; p=Path("+repr(archive)+"); assert not p.is_symlink(); data=sys.stdin.buffer.read(); assert len(data)=="+str(len(chunk))+" and hashlib.sha256(data).hexdigest()=="+repr(hashlib.sha256(chunk).hexdigest())+"; f=open(p,'r+b' if p.exists() else 'w+b'); assert os.fstat(f.fileno()).st_size>="+str(offset)+"; f.seek("+str(offset)+"); f.write(data); f.flush(); os.fsync(f.fileno()); f.close(); p.chmod(0o600); print(json.dumps({'offset':"+str(end)+"}))"
 assert call(code,chunk)['offset']==end;offset=end;print(json.dumps({'uploaded':offset,'total':len(payload)}),flush=True)
code='''import pathlib,tarfile,hashlib,json,os,subprocess
p=pathlib.Path(FOLDER);a=pathlib.Path(ARCHIVE);assert hashlib.sha256(a.read_bytes()).hexdigest()==DIGEST
with tarfile.open(a) as tar:
 assert set(tar.getnames())==set(NAMES)
 for member in tar.getmembers():
  assert member.isfile() and member.name in NAMES
  target=p/member.name;assert not target.is_symlink();target.write_bytes(tar.extractfile(member).read());target.chmod(0o600)
r=subprocess.run(['python3',str(p/'deploy-workspace-remote.py'),'--check'],capture_output=True,timeout=240)
if r.stdout.strip():print(r.stdout.decode().strip().splitlines()[-1])
else:print(json.dumps({'ok':False,'message':r.stderr.decode()[-500:]}))
'''.replace('FOLDER',repr(folder)).replace('ARCHIVE',repr(archive)).replace('DIGEST',repr(digest)).replace('NAMES',repr(list(files)))
result=call(code,timeout=280)
if not result.get('ok') or result.get('preflight')!='PASS':raise RuntimeError(json.dumps(result))
(OUT/'preflight.json').write_bytes((json.dumps({**result,'release':c['release'],'folder':folder},indent=2)+'\n').encode())
print(json.dumps(result),flush=True)
