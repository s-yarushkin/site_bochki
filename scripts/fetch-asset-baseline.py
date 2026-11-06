"""Read-only inventory and source snapshot of the public web release, without API/credentials."""
import io,json,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/asset-refresh';OUT.mkdir(parents=True,exist_ok=True)
remote=r'''
import hashlib,io,json,tarfile,sys
from pathlib import Path
web=Path('/srv/sites/dachapar-preview/current').resolve(strict=True)
api=Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
assert web.parent==Path('/srv/sites/dachapar-preview/releases')
inventory={'web':str(web),'api':str(api),'files':{}}
allowed={'.html','.css','.js','.mjs','.json','.png','.jpg','.jpeg','.webp','.avif','.svg','.gif','.glb','.woff','.woff2','.ico','.txt'}
files=[]
for p in sorted(web.rglob('*')):
 if p.is_symlink():raise RuntimeError('Unexpected public symlink')
 if not p.is_file():continue
 name=p.relative_to(web).as_posix();data=p.read_bytes()
 inventory['files'][name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
 if p.suffix.lower() in allowed and not any(part.startswith('.') or part in ['server','ops','tests','private'] for part in p.relative_to(web).parts):files.append((name,p))
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz',compresslevel=1) as tar:
 data=json.dumps(inventory).encode();info=tarfile.TarInfo('__inventory.json');info.size=len(data);tar.addfile(info,io.BytesIO(data))
 for name,p in files:tar.add(p,arcname=name,recursive=False)
'''
archive=OUT/'public-baseline.tar.gz'
with archive.open('wb') as target:subprocess.run(['ssh','-o','BatchMode=yes','dachapar','python3 -'],input=remote.encode(),stdout=target,check=True,timeout=240)
with tarfile.open(archive,'r:gz') as tar:
 for m in tar.getmembers():
  path=Path(m.name)
  if path.is_absolute() or '..' in path.parts or not m.isfile():raise RuntimeError('Unsafe public member')
  target=OUT/'baseline'/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(m).read())
inventory=json.loads((OUT/'baseline/__inventory.json').read_text());print(json.dumps({'web':inventory['web'],'api':inventory['api'],'files':len(inventory['files']),'archive_bytes':archive.stat().st_size}))
