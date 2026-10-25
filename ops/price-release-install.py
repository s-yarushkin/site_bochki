#!/usr/bin/env python3
"""Synchronized website/server price snapshot. No Caddy/env/auth/database changes."""
import argparse,contextlib,fcntl,hashlib,importlib.util,json,os,re,shutil,sqlite3,subprocess,sys,urllib.error,urllib.request
from pathlib import Path
API=Path('/srv/services/garant-bani-relay/current')
WEB=Path('/srv/sites/dachapar-preview/current')
CADDY=Path('/etc/caddy/Caddyfile')
DB=Path('/var/lib/garant-bani-relay/leads.sqlite')
SERVICE='garant-bani-relay.service'
HOST='xn--80aaan1dh9b.xn--p1ai'
OLD='xn----7sbbigeqcfm8bq.xn--p1ai'
ORIGIN='https://'+HOST
BASE=Path('/var/backups/dachapar')
def require(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
def helper(source):
 spec=importlib.util.spec_from_file_location('domain_installer',source/'ops/v72-domain-install.py')
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

def link(path,target):
 temp=path.with_name('current.price-tmp');temp.symlink_to(target);os.replace(temp,path)
def response(url,code=200,host=None):
 req=urllib.request.Request(url,headers={'Host':host} if host else {})
 try:
  with urllib.request.urlopen(req,timeout=20) as res:status=res.status;data=res.read();headers=res.headers
 except urllib.error.HTTPError as err:status=err.code;data=err.read();headers=err.headers
 require(status==code,'HTTP_'+str(status)+'_EXPECTED_'+str(code)+': '+url)
 return data,headers

def rollback(state):
 require(str(API.resolve()) in [state['oldApi'],state['newApi']],'ROLLBACK_API_CONCURRENT_CHANGE')
 require(str(WEB.resolve()) in [state['oldWeb'],state['newWeb']],'ROLLBACK_WEB_CONCURRENT_CHANGE')
 # First stop advertising the new book, then restore the matching server. Never restore SQLite.
 if str(WEB.resolve())!=state['oldWeb']:link(WEB,state['oldWeb'])
 if str(API.resolve())!=state['oldApi']:
  link(API,state['oldApi']);run('systemctl','restart',SERVICE)
  wait_ready()
 print('PRICE_ROLLBACK=PASS; previous frontend/backend restored; production SQLite never restored or deleted')
def wait_ready():
 import time
 deadline=time.monotonic()+30;last=None
 while time.monotonic()<deadline:
  try:response('http://127.0.0.1:3301/health');return
  except Exception as err:last=err;time.sleep(0.5)
 raise RuntimeError('RELAY_NOT_READY: '+str(last))
def check_files(root,guards):
 for n,wanted in guards.items():require(sha(root/n) in (wanted if isinstance(wanted,list) else [wanted]),'ACTIVE_FILE_CHANGED: '+n)
def install(source,source_sha):
 require(re.fullmatch('[a-f0-9]{40}',source_sha),'INVALID_SOURCE_SHA')
 source_manifest=helper(source).verify_source(source,source_sha)
 m=json.loads((source/'ops/price-release-manifest.json').read_text())
 require(API.is_symlink() and str(API.resolve())==m['expectedApi'],'ACTIVE_API_CHANGED')
 require(WEB.is_symlink() and str(WEB.resolve()) in m['staticBaselines'],'ACTIVE_STATIC_CHANGED')
 old_api=API.resolve();old_web=WEB.resolve();static_guards=m['staticBaselines'][str(old_web)]
 check_files(old_api,m['apiGuards']);check_files(old_web,static_guards)
 caddy_hash=sha(CADDY)
 unit=run('systemctl','cat',SERVICE)
 require('ExecStart=/usr/bin/node /srv/services/garant-bani-relay/current/server/garant-bani-relay.mjs' in unit,'UNEXPECTED_EXECSTART')
 require('LEADS_DB_PATH=/var/lib/garant-bani-relay/leads.sqlite' in unit,'DATABASE_PATH_CHANGED')
 require(run('systemctl','is-active',SERVICE)=='active','RELAY_NOT_ACTIVE')
 for host in [HOST,OLD]:response('http://127.0.0.1:3301/api/manager/session',401,host)
 response('http://127.0.0.1:3301/health')
 run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile')
 for name in set(m['webFiles']+m['apiFiles']):
  require(name in source_manifest['files'],'MANIFEST_FILE_MISSING: '+name)
  path=source/name;require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(source),'UNSAFE_OVERLAY_FILE')
 new_api=old_api.parent/('20261016-prices-'+source_sha[:12]);new_web=old_web.parent/('20261016-prices-'+source_sha[:12]);backup=BASE/('prices-'+source_sha[:12])
 require(not new_api.exists() and not new_web.exists() and not backup.exists(),'RELEASE_ALREADY_ATTEMPTED')
 backup.mkdir(mode=0o700)
 state={'sourceSha':source_sha,'oldApi':str(old_api),'oldWeb':str(old_web),'newApi':str(new_api),'newWeb':str(new_web),'caddyHash':caddy_hash}
 (backup/'state.json').write_text(json.dumps(state,indent=2));shutil.copyfile(__file__,backup/'installer.py')
 (backup/'unit.txt').write_text(unit);(backup/'Caddyfile').write_bytes(CADDY.read_bytes())
 # Consistent read-only backup. Existing database, WAL, rows and schema are never modified by installer.
 require(DB.is_file(),'DATABASE_MISSING')
 with contextlib.closing(sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True)) as src:
  require(src.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_INTEGRITY_FAILED')
  with contextlib.closing(sqlite3.connect(backup/'leads.sqlite')) as dest:src.backup(dest)
 os.chmod(backup/'leads.sqlite',0o600)
 for old,new,names in [(old_api,new_api,m['apiFiles']),(old_web,new_web,m['webFiles'])]:
  shutil.copytree(old,new,symlinks=True)
  for n in names:
   dest=new/n;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/n,dest);os.chmod(dest,0o644)
  for p in old.rglob('*'):
   if p.is_file() and p.relative_to(old).as_posix() not in names:require(sha(p)==sha(new/p.relative_to(old)),'UNRELATED_RELEASE_FILE_CHANGED')
 print(run('/usr/bin/node',str(source/'ops/price-release-probe.mjs'),str(new_api)),flush=True)
 require(str(API.resolve())==str(old_api) and str(WEB.resolve())==str(old_web) and sha(CADDY)==caddy_hash and run('systemctl','cat',SERVICE)==unit,'PREACTIVATION_CHANGED')
 check_files(old_api,m['apiGuards']);check_files(old_web,static_guards)
 print('PRICE_PREFLIGHT=PASS; current and legacy books verified; SQLite backup complete; exact runtime and static baseline',flush=True)
 try:
  # Deploy server first: it supports both books while old and new browser tabs coexist.
  link(API,new_api);run('systemctl','restart',SERVICE);wait_ready()
  for host in [HOST,OLD]:response('http://127.0.0.1:3301/api/manager/session',401,host)
  link(WEB,new_web)
  pages=json.loads((source/'seo/pages.json').read_text())['pages']
  for page in pages:
   body,headers=response(ORIGIN+page['path']);require(hashlib.sha256(body).hexdigest()==sha(new_web/page['file']),'LIVE_PAGE_BYTES_MISMATCH')
   require('noindex' not in headers.get('X-Robots-Tag','').lower(),'PUBLIC_INDEXING_CHANGED')
  for n in ['assets/js/app.js','data/catalog-pricebook.json','assets/js/landing-model.js']:
   body,_=response(ORIGIN+'/'+n);require(hashlib.sha256(body).hexdigest()==sha(new_web/n),'LIVE_ASSET_BYTES_MISMATCH')
  for p in ['/manager.html','/privacy.html','/requisites.html']:
   _,headers=response(ORIGIN+p);require('noindex' in headers.get('X-Robots-Tag','').lower(),'PRIVATE_NOINDEX_CHANGED')
  response(ORIGIN+'/api/manager/session',401)
  response('https://'+OLD+'/bani-preview/')
  require(sha(CADDY)==caddy_hash,'CADDY_CHANGED_EXTERNALLY')
  (backup/'result.json').write_text(json.dumps({'installed':True,'sourceSha':source_sha,'browserQA':'PENDING','realMaxDelivery':'NOT_RETESTED'},indent=2))
  print('PRICE_RELEASE=INSTALLED; BASES=20; OPTIONS=15; SOURCE=SITE_COLUMN_C; NEW_AND_OLD_TABS=SUPPORTED')
  print('SQLITE_PRESERVED=YES; INSTALLER_PRODUCTION_SQLITE_WRITES=0; CADDY_UNCHANGED=YES; OLD_SITE_PRESERVED=YES; REAL_MAX_DELIVERY=NOT_RETESTED')
  print('ROLLBACK: sudo python3 '+str(backup/'installer.py')+' --rollback '+str(backup/'state.json'))
 except Exception as error:
  print('PRICE_ACTIVATION_FAILED: '+str(error),flush=True)
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
 except Exception as error:print('PRICE_RELEASE_STOPPED: '+str(error),file=sys.stderr);sys.exit(1)
