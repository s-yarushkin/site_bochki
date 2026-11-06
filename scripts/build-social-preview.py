"""Capture current public web inventory and build a deterministic two-file overlay."""
import gzip,hashlib,io,json,pathlib,struct,subprocess,tarfile,urllib.request
from social_preview import ORIGIN,IMAGE_PATH,WIDTH,HEIGHT,patch_preview
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'.local/social-preview';OUT.mkdir(parents=True,exist_ok=True)
def sha(data):return hashlib.sha256(data).hexdigest()
inventory="""import json,pathlib,hashlib
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
 return result
w=pathlib.Path('/srv/sites/dachapar-preview/current').resolve(strict=True);a=pathlib.Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
print(json.dumps({'web':str(w),'api':str(a),'web_files':tree(w),'api_files':tree(a)}))
"""
baseline=json.loads(subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','python3 -'],input=inventory,text=True,capture_output=True,check=True).stdout)
before=urllib.request.urlopen(ORIGIN+'/',timeout=20).read()
if sha(before)!=baseline['web_files']['index.html']:raise RuntimeError('Public index differs from active release')
after=patch_preview(before);image=(ROOT/'web'/IMAGE_PATH).read_bytes()
if image[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',image[16:24])!=(WIDTH,HEIGHT):raise RuntimeError('Image dimensions differ from metadata')
files={'index.html':after,IMAGE_PATH:image};identity=sha(after+image)[:12]
with (OUT/'payload.tar.gz').open('wb') as raw,gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6) as compressed,tarfile.open(fileobj=compressed,mode='w') as archive:
 for name,data in sorted(files.items()):
  info=tarfile.TarInfo('site/'+name);info.size=len(data);info.mode=0o644;info.mtime=0;archive.addfile(info,io.BytesIO(data))
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();config={'release':'SOCIAL-'+identity,'source_commit':commit,'baseline':baseline,'overlay':{n:sha(d) for n,d in files.items()},'payload_sha256':sha((OUT/'payload.tar.gz').read_bytes())}
for name,data in [('index-before.html',before),('index-after.html',after)]: (OUT/name).write_bytes(data)
(OUT/'deployment.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps({'release':config['release'],'source_commit':commit,'files':2,'image_bytes':len(image),'dimensions':[WIDTH,HEIGHT],'body_unchanged':after.split(b'</head>',1)[1]==before.split(b'</head>',1)[1]}))
