"""Atomic web-only asset release. Never reads or writes CRM database or credentials."""
import argparse,concurrent.futures,fcntl,hashlib,json,os,re,shutil,subprocess,tarfile,tempfile,urllib.request
from pathlib import Path,PurePosixPath
HERE=Path(__file__).resolve().parent;WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current');ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(data):return hashlib.sha256(data).hexdigest()
def fail(text):raise RuntimeError('ASSET_STOP: '+text)
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():fail('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=sha(p.read_bytes())
 return result
def active(link):
 if not link.is_symlink():fail('Active release is not a symlink')
 p=link.resolve(strict=True)
 if p.parent!=link.parent/'releases':fail('Release outside expected parent')
 return p
def health():
 with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=10) as r:
  if json.load(r).get('ok') is not True:fail('Lead service unhealthy')
def baseline(config):
 web=active(WEB);api=active(API)
 if str(web)!=config['baseline']['web'] or str(api)!=config['baseline']['api']:fail('Another release is active')
 expected={k:v['sha256'] for k,v in config['baseline']['files'].items()}
 if tree(web)!=expected:fail('Baseline files changed')
 health();return web,api,expected
def archive_check(config,archive):
 if not re.fullmatch('ASSETS-[a-f0-9]{12}',config['release']):fail('Invalid release')
 if sha((HERE/'payload.tar.gz').read_bytes())!=config['payload_sha256']:fail('Package checksum')
 rows=config['overlay'];names=[r['path'] for r in rows];components=set(config['components'])
 if len(rows)!=580 or len(set(names))!=580 or len(components)!=6:fail('Unexpected overlay count')
 if config['verification'].get('ok') is not True or config['verification'].get('models_rendered')!=22:fail('Image and 3D acceptance missing')
 for name in names:
  p=PurePosixPath(name)
  if p.is_absolute() or '..' in p.parts or '\\' in name or ':' in name:fail('Unsafe path')
  if name not in components and p.suffix.lower() not in ['.webp','.jpg','.jpeg','.png','.svg']:fail('Non-media overlay')
 if set(archive.getnames())!={'site/'+n for n in names}:fail('Unexpected archive member')
 for row in rows:
  member=archive.getmember('site/'+row['path'])
  if not member.isfile():fail('Archive link or directory')
  data=archive.extractfile(member).read()
  if len(data)!=row['bytes'] or sha(data)!=row['sha256']:fail('Asset checksum: '+row['path'])
def overlay(candidate,config,archive,expected):
 expected=dict(expected)
 for row in config['overlay']:
  target=candidate/row['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.extractfile('site/'+row['path']).read());target.chmod(0o644);expected[row['path']]=row['sha256']
 if tree(candidate)!=expected:fail('Protected file inventory mismatch')
 for name in config['components']:
  if name.endswith('.mjs'):subprocess.run(['/usr/bin/node','--check',str(candidate/name)],check=True,capture_output=True)
 # All 41 GLB, all specifications, prices, lead modules and CRM files stay byte-identical.
 if any(name.endswith(('.glb','.json','.html')) for name in (r['path'] for r in config['overlay'])):fail('Protected document modified')
 return expected
def swap(destination):
 if destination.parent!=WEB.parent/'releases' or not destination.is_dir():fail('Unsafe switch target')
 pending=WEB.with_name('current.asset-switch')
 if pending.exists() or pending.is_symlink():fail('Pending switch exists')
 pending.symlink_to(destination);os.replace(pending,WEB)
def public_check(config,expected):
 protected=['index.html','manager.html','lead-client.mjs','analytics-core.mjs','journey-tracker.mjs','data/site-settings.json','choice/app.mjs','choice/catalog-pricebook.json','home-hero/layouts/index.json','quiz.mjs','novyy-god/index.html']
 names=sorted({r['path'] for r in config['overlay']}|set(protected))
 def check(name):
  with urllib.request.urlopen(ORIGIN+'/'+name,timeout=40) as r:
   if sha(r.read())!=expected[name]:fail('Public checksum: '+name)
  return name
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:return list(pool.map(check,names))
def main():
 parser=argparse.ArgumentParser();mode=parser.add_mutually_exclusive_group(required=True)
 for name in ['check','apply','rollback']:mode.add_argument('--'+name,action='store_true')
 args=parser.parse_args();config=json.loads((HERE/'deployment.json').read_text())
 if args.rollback:
  if os.geteuid()!=0:fail('sudo required')
  saved=json.loads((Path('/var/backups/dachapar')/config['release']/'state.json').read_text())
  if str(active(WEB))!=saved['new_web'] or str(active(API))!=saved['api']:fail('Another release is active')
  old=Path(saved['old_web'])
  if tree(old)!={k:v['sha256'] for k,v in config['baseline']['files'].items()}:fail('Rollback source changed')
  swap(old);health();print(json.dumps({'ok':True,'rolled_back':True,'api_unchanged':True,'database_touched':False}));return
 with tarfile.open(HERE/'payload.tar.gz') as archive:
  archive_check(config,archive);old,api,expected=baseline(config)
  if args.check:
   with tempfile.TemporaryDirectory(prefix='dachapar-assets-check-') as folder:
    candidate=Path(folder)/'web';shutil.copytree(old,candidate);overlay(candidate,config,archive,expected)
   print(json.dumps({'ok':True,'preflight':'PASS','files':580,'images':574,'api_unchanged':True,'database_touched':False}));return
  if os.geteuid()!=0:fail('sudo required')
  with open('/run/lock/dachapar-assets-deploy.lock','w') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);old,api,expected=baseline(config);api_hashes=tree(api)
   if shutil.disk_usage(WEB.parent).free<600*1024*1024:fail('Insufficient free space')
   candidate=WEB.parent/'releases'/config['release']
   if candidate.exists():fail('Candidate already exists')
   shutil.copytree(old,candidate);expected=overlay(candidate,config,archive,expected)
   backup=Path('/var/backups/dachapar')/config['release'];backup.mkdir(mode=0o700,parents=True,exist_ok=False)
   state={'old_web':str(old),'new_web':str(candidate),'api':str(api),'source_commit':config['source_commit']};(backup/'state.json').write_text(json.dumps(state,indent=2));(backup/'state.json').chmod(0o600)
   swap(candidate)
   try:
    verified=public_check(config,expected);health()
    if active(API)!=api or tree(api)!=api_hashes:fail('API changed during asset publication')
    if tree(candidate)!=expected:fail('Published inventory drift')
   except BaseException:swap(old);health();raise
   result={**state,'ok':True,'release':config['release'],'images_watermarked':574,'viewer_components':6,'public_files_verified':len(verified),'protected_web_files':len(config['baseline']['files'])-sum(r['path'] in config['baseline']['files'] for r in config['overlay']),'api_unchanged':True,'database_touched':False,'original_glb_and_specs_unchanged':True,'backup':str(backup),'rollback':'sudo python3 '+str(Path(__file__).resolve())+' --rollback'}
   (HERE/'deployment-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
if __name__=='__main__':main()
