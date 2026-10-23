#!/usr/bin/env python3
"""R8.1 exact-source guarded WEB-only stage/activate, default read-only.
Do not run deploy until 42-case Chromium acceptance and source/claims verified.
"""
import argparse,contextlib,fcntl,hashlib,json,os,shutil,sys,time,urllib.request,concurrent.futures
from pathlib import Path
HERE=Path(__file__).resolve().parent
MANIFEST=json.loads((HERE/'manifest.json').read_text(encoding='utf-8'))
SITE=Path('/srv/sites/dachapar-preview')
WEB=SITE/'current'
API=Path('/srv/services/garant-bani-relay/current')
RELEASE='CJM-R80-20261022-1792731611547801280'
PREFIX='CJM-R81-20261023-'
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
MODIFIED=MANIFEST['modified_files']
PAYLOAD=HERE/'overlay'
PROTECTED=['data/catalog-pricebook.json','data/pricebook.js','lead-client.mjs','analytics-runtime.mjs','privacy.html','consent.html','requisites.html']

def require(v,msg):
 if not v:raise RuntimeError(msg)
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def inventory(root):
 out={}
 for p in root.rglob('*'):
  require(not p.is_symlink(),'R81_UNEXPECTED_SYMLINK_'+str(p))
  if p.is_file():out[p.relative_to(root).as_posix()]=sha(p)
 return out

def pointer(link):
 require(link.is_symlink(),'R81_NOT_SYMLINK_'+str(link))
 real=link.resolve(strict=True);require(real.is_dir(),'R81_MISSING_RELEASE');return real

def preflight():
 web=pointer(WEB);api=pointer(API)
 require(web.name==RELEASE and web.parent==SITE/'releases','R81_LIVE_SOURCE_DRIFT_'+str(web))
 before=inventory(web)
 require(len(before)>=250,'R81_SOURCE_INVENTORY_TOO_SMALL_'+str(len(before)))
 for path,item in MODIFIED.items():
  target=PAYLOAD/path
  require(target.is_file() and not target.is_symlink(),'R81_PAYLOAD_MISSING_'+path)
  require(sha(target)==item['sha256'],'R81_PACKAGE_HASH_DRIFT_'+path)
  if item['source_sha256']:
   require(before.get(path)==item['source_sha256'],'R81_SOURCE_HASH_DRIFT_'+path)
  else:require(path not in before,'R81_NEW_FILE_ALREADY_EXISTS_'+path)
 for path in PROTECTED:require(path in before,'R81_PROTECTED_MISSING_'+path)
 need=sum(p.stat().st_size for p in web.rglob('*') if p.is_file())+120*1024*1024
 require(shutil.disk_usage(SITE).free>need,'R81_DISK_SPACE')
 return web,api,before

def audit_path(path):return path.parent/(path.name+'.r81-audit.json')

def verify_diff(before,after):
 deleted=set(before)-set(after)
 require(not deleted,'R81_UNEXPECTED_DELETE_'+str(sorted(deleted)[:4]))
 changed={p for p in before if before[p]!=after.get(p)}|{p for p in after if p not in before}
 expected=set(MODIFIED)
 require(changed==expected,'R81_UNEXPECTED_DIFF_'+str(sorted(changed^expected)[:12]))
 for p in PROTECTED:require(after[p]==before[p],'R81_PROTECTED_CHANGED_'+p)
 for p,item in MODIFIED.items():require(after[p]==item['sha256'],'R81_STAGED_PAYLOAD_MISMATCH_'+p)
 require('id="configure"' in (PAYLOAD/'index.html').read_text() and 'id="relay-lead-form"' in (PAYLOAD/'index.html').read_text(),'R81_FORM_MISSING')
 return sorted(changed)

def stage():
 web,api,before=preflight()
 dest=SITE/'releases'/(PREFIX+str(time.time_ns()))
 require(not dest.exists(),'R81_STAGE_EXISTS')
 shutil.copytree(web,dest)
 try:
  for p in MODIFIED:
   file=dest/p;file.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(PAYLOAD/p,file)
  after=inventory(dest);changed=verify_diff(before,after)
  require(WEB.resolve()==web and API.resolve()==api and inventory(web)==before,'R81_RACE_DRIFT')
  audit={'status':'STAGED_NOT_LIVE','before_release':str(web),'before_api':str(api),'before':before,'after':after,'changed':changed,'stage':str(dest),'manifest_sha256':sha(HERE/'manifest.json'),'created_at':int(time.time())}
  a=audit_path(dest);a.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');a.chmod(0o600)
  print('R81_STAGE=PASS; FILES_CHANGED='+str(len(changed))+'; WEB='+str(dest),flush=True)
  print('R81_STAGE_AUDIT='+str(a)+'; LIVE_UNCHANGED=YES; API_UNCHANGED=YES',flush=True)
  return dest
 except BaseException:
  shutil.rmtree(dest,ignore_errors=True);raise

def flip(target):
 tmp=SITE/('.current.r81.'+str(time.time_ns()))
 try:tmp.symlink_to(target);os.replace(tmp,WEB)
 finally:
  if tmp.is_symlink():tmp.unlink()

def public_check(stage,after,changed):
 chosen=changed+['data/catalog-pricebook.json','lead-client.mjs','analytics-runtime.mjs','robots.txt','parus-media/content.mjs','qh-media/content.mjs']
 def check(path):
  url=ORIGIN+'/'+(path[:-10] if path.endswith('index.html') else path)
  req=urllib.request.Request(url+('?r81='+str(time.time_ns())),headers={'User-Agent':'DachaPar-R81-VERIFY-GET','Cache-Control':'no-cache','Accept-Encoding':'identity'})
  with urllib.request.urlopen(req,timeout=25) as resp:
   require(resp.status==200,'R81_PUBLIC_STATUS_'+path)
   require(hashlib.sha256(resp.read()).hexdigest()==after[path],'R81_PUBLIC_HASH_'+path)
  return path
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for p in pool.map(check,chosen):print('R81_PUBLIC=PASS; PATH='+p,flush=True)

def activate(stage_name):
 web,api,before=preflight();stage_path=Path(stage_name).resolve(strict=True)
 require(stage_path.parent==SITE/'releases' and stage_path.name.startswith(PREFIX),'R81_INVALID_STAGE')
 a=audit_path(stage_path);require(a.is_file(),'R81_AUDIT_MISSING')
 audit=json.loads(a.read_text());require(audit['before_release']==str(web) and audit['before_api']==str(api),'R81_STAGE_SOURCE_DRIFT')
 require(audit['before']==before and audit['manifest_sha256']==sha(HERE/'manifest.json'),'R81_MANIFEST_DRIFT')
 after=inventory(stage_path);require(audit['after']==after,'R81_STAGED_CONTENT_DRIFT')
 changed=verify_diff(before,after)
 require(WEB.resolve()==web and API.resolve()==api,'R81_LAST_SECOND_DRIFT')
 flip(stage_path)
 try:
  public_check(stage_path,after,changed)
  require(WEB.resolve()==stage_path and API.resolve()==api,'R81_POINTER_DRIFT')
 except BaseException:
  if WEB.resolve()==stage_path:flip(web);print('R81_ROLLBACK=PASS; PREVIOUS_WEB_RESTORED=YES',flush=True)
  raise
 print('R81_DEPLOY=PASS; WEB='+str(stage_path)+'; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_CALLS=0',flush=True)
 print('R81_PREVIOUS_WEB='+str(web),flush=True)

def main():
 p=argparse.ArgumentParser();group=p.add_mutually_exclusive_group()
 group.add_argument('--stage',action='store_true');group.add_argument('--activate',metavar='STAGE_PATH');args=p.parse_args()
 with (SITE/'.gallery-r80.lock').open('a') as lock:
  fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
  if args.stage:stage()
  elif args.activate:activate(args.activate)
  else:
   web,api,files=preflight();print('R81_PREFLIGHT=PASS; LIVE='+str(web)+'; API='+str(api)+'; FILES='+str(len(files))+'; READ_ONLY=YES')
if __name__=='__main__':
 try:main()
 except BaseException as e:
  print('R81_ABORT='+str(e),file=sys.stderr,flush=True);sys.exit(2)
