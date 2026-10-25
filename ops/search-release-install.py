#!/usr/bin/env python3
"""Scoped static SEO release and indexing switch for Dacha Par only."""
import argparse,fcntl,hashlib,importlib.util,json,os,re,shutil,stat,subprocess,sys,urllib.error,urllib.request
from pathlib import Path
HOST='xn--80aaan1dh9b.xn--p1ai'
ORIGIN='https://'+HOST
WEB=Path('/srv/sites/dachapar-preview/current')
EXPECTED_WEB='/srv/sites/dachapar-preview/releases/20261015-contact-e71048a20039'
CADDY=Path('/etc/caddy/Caddyfile')
BASE=Path('/var/backups/dachapar')
HOME_HASHES={'e69e789f73ef491173d679d521cdaac3a7fa3d4463b36c9a39fb76781d37858f','c64308a91993886df6f704e28e0d4f21efcb3b63bf2f154d4260b1999bc47124'}
APP_HASHES={'5f6738843c3c8e59eeaa9eb81548b060a6541a239173ec9489f3a15b9b608b04','d62d12131eb80a4bf181285f5826a52003637fe6c3d295a286c8f4cf3cbf83c0'}
def require(ok,message):
 if not ok:raise RuntimeError(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout

def candidate_config(baseline,expected):
 begin=b'\n# DACHA_PAR_V72_PREVIEW_BEGIN\n';end=b'# DACHA_PAR_V72_PREVIEW_END\n'
 require(baseline.count(begin)==1 and baseline.count(end)==1,'DACHA_PAR_BLOCK_NOT_UNIQUE')
 start=baseline.index(begin);stop=baseline.index(end,start)+len(end)
 require(baseline[start:stop]==expected,'DACHA_PAR_BLOCK_CHANGED')
 changed=expected.replace(b'    header X-Robots-Tag "noindex, nofollow, noarchive"\n',b'    @noindex path /manager.html /api/* /health /privacy.html /consent.html /requisites.html\n    header @noindex X-Robots-Tag "noindex, nofollow, noarchive"\n    encode zstd gzip\n')
 robots=b'    handle /robots.txt {\n        respond "User-agent: *\\nDisallow: /\\n" 200\n    }\n'
 require(changed.count(robots)==1,'PREVIEW_ROBOTS_HANDLER_CHANGED')
 changed=changed.replace(robots,b'')
 return baseline[:start]+changed+baseline[stop:]
def replace(path,data,mode=0o644):
 tmp=path.with_name(path.name+'.search-tmp')
 with open(tmp,'xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chmod(tmp,mode);os.replace(tmp,path)
def switch(target):
 tmp=WEB.with_name('current.search-tmp');tmp.symlink_to(target);os.replace(tmp,WEB)
def fetch(path,expected=200):
 try:
  with urllib.request.urlopen(ORIGIN+path,timeout=20) as r:code=r.status;body=r.read();headers=r.headers
 except urllib.error.HTTPError as e:code=e.code;body=e.read();headers=e.headers
 require(code==expected,'HTTP_'+str(code)+'_EXPECTED_'+str(expected)+': '+path)
 return body,headers

def rollback(state):
 require(sha(CADDY.read_bytes()) in [state['baselineHash'],state['candidateHash']],'ROLLBACK_CADDY_CONCURRENT_CHANGE')
 require(str(WEB.resolve()) in [state['oldWeb'],state['newWeb']],'ROLLBACK_STATIC_CONCURRENT_CHANGE')
 replace(CADDY,Path(state['backup'],'Caddyfile').read_bytes(),state['mode']);os.chown(CADDY,state['uid'],state['gid'])
 switch(state['oldWeb']);run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile');run('systemctl','reload','caddy')
 print('SEARCH_ROLLBACK=PASS; previous indexing controls restored; SQLite unchanged')

def install(source,source_sha):
 require(re.fullmatch('[a-f0-9]{40}',source_sha),'INVALID_SOURCE_SHA')
 # Reuse the accepted per-file source verifier and exact old Caddy block generator.
 spec=importlib.util.spec_from_file_location('domain_installer',source/'ops/v72-domain-install.py')
 helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
 helper.verify_source(source,source_sha)
 require(WEB.is_symlink() and str(WEB.resolve())==EXPECTED_WEB,'ACTIVE_STATIC_CHANGED')
 old=WEB.resolve()
 require(sha((old/'index.html').read_bytes()) in HOME_HASHES,'ACTIVE_HOME_CHANGED')
 require(sha((old/'assets/js/app.js').read_bytes()) in APP_HASHES,'ACTIVE_APP_CHANGED')
 require(json.loads((old/'data/catalog-pricebook.json').read_text())==json.loads((source/'data/catalog-pricebook.json').read_text()),'LIVE_PRICEBOOK_DIFFERS')
 baseline=CADDY.read_bytes();meta=CADDY.stat()
 candidate=candidate_config(baseline,helper.caddy_block(WEB))
 run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile')
 pages=json.loads((source/'seo/pages.json').read_text())['pages']
 files=[p['file'] for p in pages]+['robots.txt','sitemap.xml','llms.txt','assets/js/app.js','assets/js/landing-model.js','assets/css/search-pages.css','assets/css/seo-links.css']
 require(len(set(files))==len(files),'DUPLICATE_OVERLAY_FILE')
 for name in files:require((source/name).is_file() and not (source/name).is_symlink() and (source/name).resolve().is_relative_to(source),'UNSAFE_OVERLAY_FILE')
 backup=BASE/('search-'+source_sha[:12]);new=old.parent/('20261015-search-'+source_sha[:12])
 require(not backup.exists() and not new.exists(),'SEARCH_RELEASE_ALREADY_ATTEMPTED')
 backup.mkdir(mode=0o700);(backup/'Caddyfile').write_bytes(baseline);shutil.copyfile(__file__,backup/'installer.py')
 state={'sourceSha':source_sha,'backup':str(backup),'oldWeb':str(old),'newWeb':str(new),'baselineHash':sha(baseline),'candidateHash':sha(candidate),'mode':stat.S_IMODE(meta.st_mode),'uid':meta.st_uid,'gid':meta.st_gid}
 (backup/'state.json').write_text(json.dumps(state,indent=2))
 shutil.copytree(old,new,symlinks=True)
 for name in files:
  dst=new/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,dst);os.chmod(dst,0o644)
 for p in old.rglob('*'):
  if p.is_file() and p.relative_to(old).as_posix() not in files:require(sha(p.read_bytes())==sha((new/p.relative_to(old)).read_bytes()),'UNRELATED_STATIC_CHANGED')
 candidate_path=backup/'Caddyfile.candidate';candidate_path.write_bytes(candidate)
 run('caddy','validate','--config',str(candidate_path),'--adapter','caddyfile')
 require(sha(CADDY.read_bytes())==state['baselineHash'] and str(WEB.resolve())==str(old),'PREACTIVATION_CONCURRENT_CHANGE')
 print('SEARCH_PREFLIGHT=PASS; nine public URLs; exact own Caddy block; outside routes preserved',flush=True)
 try:
  switch(new);replace(CADDY,candidate,state['mode']);os.chown(CADDY,state['uid'],state['gid']);run('systemctl','reload','caddy')
  for p in pages:
   body,headers=fetch(p['path']);text=body.decode()
   require('noindex' not in headers.get('X-Robots-Tag','').lower(),'PUBLIC_NOINDEX_HEADER: '+p['path'])
   require('content="index,follow,max-image-preview:large"' in text,'PUBLIC_NOINDEX_HTML')
   require('rel="canonical" href="'+ORIGIN+p['path']+'"' in text,'LIVE_CANONICAL_MISMATCH')
   require(sha(body)==sha((new/p['file']).read_bytes()),'LIVE_PAGE_BYTES_MISMATCH: '+p['path'])
  for path in ['robots.txt','sitemap.xml','llms.txt','assets/js/landing-model.js','assets/css/search-pages.css','assets/css/seo-links.css']:
   body,_=fetch('/'+path);require(sha(body)==sha((new/path).read_bytes()),'LIVE_ASSET_BYTES_MISMATCH')
  for path in ['/manager.html','/privacy.html','/consent.html','/requisites.html']:
   body,headers=fetch(path);require('noindex' in headers.get('X-Robots-Tag','').lower() and b'noindex' in body,'PRIVATE_PAGE_INDEXABLE')
  _,headers=fetch('/api/manager/session',401);require('noindex' in headers.get('X-Robots-Tag','').lower(),'PRIVATE_API_INDEXABLE')
  fetch('/not-a-real-search-page-check',404)
  run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile')
  (backup/'result.json').write_text(json.dumps({'installed':True,'sourceSha':source_sha,'publicUrls':len(pages),'serverChecks':'PASS','browserQA':'PENDING'},indent=2))
  print('SEARCH_RELEASE=INSTALLED; INDEXABLE_URLS=9; HTTPS=PASS; ROBOTS_SITEMAP_CANONICAL=PASS; PRIVATE_NOINDEX=PASS')
  print('BACKEND_UNCHANGED=YES; SQLITE_WRITES=0; OLD_DOMAIN_UNCHANGED=YES; PAID_TRAFFIC=OFF')
  print('ROLLBACK: sudo python3 '+str(backup/'installer.py')+' --rollback '+str(backup/'state.json'))
 except Exception as error:
  print('SEARCH_ACTIVATION_FAILED: '+str(error),flush=True)
  try:rollback(state)
  except Exception as recovery:raise RuntimeError(str(error)+'; ROLLBACK_FAILED: '+str(recovery)) from error
  raise

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path);p.add_argument('--source-sha');p.add_argument('--rollback',type=Path);a=p.parse_args()
 require(os.geteuid()==0,'ROOT_REQUIRED')
 with open('/run/lock/dachapar-v72.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if a.rollback:rollback(json.loads(a.rollback.read_text()))
  else:require(a.source and a.source_sha,'SOURCE_REQUIRED');install(a.source.resolve(),a.source_sha)
if __name__=='__main__':
 try:main()
 except Exception as error:print('SEARCH_RELEASE_STOPPED: '+str(error),file=sys.stderr);sys.exit(1)
