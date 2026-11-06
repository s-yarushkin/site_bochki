"""Atomic two-file web overlay. API, credentials and database are never modified."""
import argparse,fcntl,hashlib,json,os,shutil,subprocess,tarfile,tempfile,urllib.request,urllib.error
from pathlib import Path
from social_preview import IMAGE_PATH,IMAGE_URL,patch_preview
HERE=Path(__file__).resolve().parent;WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current');ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(data):return hashlib.sha256(data).hexdigest()
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=sha(p.read_bytes())
 return result
def active(link):
 target=link.resolve(strict=True)
 if not link.is_symlink() or target.parent!=link.parent/'releases':raise RuntimeError('Unexpected release')
 return target
def baseline(c):
 web=active(WEB);api=active(API)
 if str(web)!=c['baseline']['web'] or str(api)!=c['baseline']['api']:raise RuntimeError('Another release is active')
 if tree(web)!=c['baseline']['web_files'] or tree(api)!=c['baseline']['api_files']:raise RuntimeError('Baseline inventory changed')
 return web,api
def overlay(destination,c):
 if sha((HERE/'payload.tar.gz').read_bytes())!=c['payload_sha256']:raise RuntimeError('Archive checksum mismatch')
 expected=dict(c['baseline']['web_files'])
 with tarfile.open(HERE/'payload.tar.gz') as archive:
  if set(c['overlay'])!={'index.html',IMAGE_PATH} or set(archive.getnames())!={'site/'+n for n in c['overlay']}:raise RuntimeError('Unexpected overlay')
  for name,digest in c['overlay'].items():
   member=archive.getmember('site/'+name)
   if not member.isfile():raise RuntimeError('Unexpected archive member')
   data=archive.extractfile(member).read()
   if sha(data)!=digest:raise RuntimeError('Overlay checksum mismatch')
   target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o644);expected[name]=digest
 original=Path(c['baseline']['web'])/'index.html';after=(destination/'index.html').read_bytes()
 if after!=patch_preview(original.read_bytes()):raise RuntimeError('Non-preview HTML changed')
 if tree(destination)!=expected:raise RuntimeError('Protected web files changed')
 return expected
def swap(target):
 if target.parent!=WEB.parent/'releases' or not target.is_dir():raise RuntimeError('Unsafe switch')
 pending=WEB.with_name('current.social-switch')
 if pending.exists() or pending.is_symlink():raise RuntimeError('Pending switch exists')
 pending.symlink_to(target);os.replace(pending,WEB)
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--apply',action='store_true');p.add_argument('--rollback',action='store_true');args=p.parse_args()
 if sum([args.check,args.apply,args.rollback])!=1:raise RuntimeError('Choose one operation')
 c=json.loads((HERE/'deployment.json').read_text());release=c['release']
 if not __import__('re').fullmatch('SOCIAL-[a-f0-9]{12}',release):raise RuntimeError('Invalid release')
 if args.rollback:
  if os.geteuid()!=0:raise RuntimeError('sudo required')
  state=json.loads((Path('/var/backups/dachapar')/release/'state.json').read_text())
  if str(active(WEB))!=state['web'] or str(active(API))!=state['api']:raise RuntimeError('Another release is active')
  old=Path(state['previous_web'])
  if tree(old)!=c['baseline']['web_files']:raise RuntimeError('Previous release changed')
  swap(old);print(json.dumps({'ok':True,'rolled_back':True,'database_touched':False,'api_unchanged':True}));return
 old,api=baseline(c)
 if args.check:
  with tempfile.TemporaryDirectory(prefix='dachapar-social-check-') as folder:
   candidate=Path(folder)/'web';shutil.copytree(old,candidate);overlay(candidate,c)
  print(json.dumps({'ok':True,'preflight':'PASS','files':2,'protected_files':len(c['baseline']['web_files'])-1,'api_unchanged':True,'database_touched':False}));return
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 with open('/run/lock/dachapar-crm-deploy.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);old,api=baseline(c);candidate=WEB.parent/'releases'/release
  if candidate.exists():raise RuntimeError('Candidate already exists')
  shutil.copytree(old,candidate);expected=overlay(candidate,c)
  backup=Path('/var/backups/dachapar')/release;backup.mkdir(mode=0o700,parents=True,exist_ok=False);(backup/'index-before.html').write_bytes((old/'index.html').read_bytes());(backup/'index-before.html').chmod(0o600)
  switched=False
  try:
   swap(candidate);switched=True
   for name in ['index.html',IMAGE_PATH,'manager.html','assets/js/manager.js']:
    url=ORIGIN+'/' if name=='index.html' else ORIGIN+'/'+name
    with urllib.request.urlopen(url,timeout=30) as response:
     if sha(response.read())!=expected[name]:raise RuntimeError('Public file checksum mismatch: '+name)
     if name==IMAGE_PATH and response.headers.get_content_type()!='image/png':raise RuntimeError('Image MIME mismatch')
   if tree(api)!=c['baseline']['api_files'] or active(API)!=api:raise RuntimeError('API changed during publication')
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=5) as response:
    if json.load(response).get('ok') is not True:raise RuntimeError('Service unhealthy')
   with urllib.request.urlopen(ORIGIN+'/go/youtube-9df13f105a08',timeout=20) as response:
    if sha(response.read())!=expected['index.html']:raise RuntimeError('Short link did not resolve to the updated page')
  except Exception:
   if switched:swap(old)
   raise
  receipt={'ok':True,'release':release,'web':str(candidate),'previous_web':str(old),'api':str(api),'source_commit':c['source_commit'],'image_url':IMAGE_URL,'image_sha256':expected[IMAGE_PATH],'public_index_sha256':expected['index.html'],'protected_web_files':len(c['baseline']['web_files'])-1,'api_unchanged':True,'database_touched':False,'manager_preserved':True,'go_link_verified':True,'backup':str(backup)}
  (backup/'state.json').write_text(json.dumps(receipt,indent=2)+'\n');(backup/'state.json').chmod(0o600);print(json.dumps(receipt))
if __name__=='__main__':
 try:main()
 except Exception as error:print(json.dumps({'ok':False,'message':str(error)[:250]}));raise SystemExit(1)
