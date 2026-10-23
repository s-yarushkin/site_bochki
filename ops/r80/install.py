#!/usr/bin/env python3
"""R8.0 web-only deployment. Default read-only; --stage creates a non-live release; --activate requires staged fingerprint.
No GitHub Actions, no Node, no API, no SQLite writes. Strict atomic symlink switch with rollback.
"""
import argparse,contextlib,fcntl,hashlib,json,os,sys,shutil,time,urllib.request,concurrent.futures
from pathlib import Path
import transform

SITE=Path('/srv/sites/dachapar-preview')
WEB=SITE/'current'
API=Path('/srv/services/garant-bani-relay/current')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
EXPECTED_WEB='GALLERY-UNIFIED-20261022-parus-qh-v1-1792680175428407103'
SOURCE_HASHES={
'index.html':'47721d7abedc509bb462bafb7a6466152e6579872ea86660b3da74cb3aa4628f',
'bani/kvadro-haus/index.html':'30aab58547fb01843ce0bf10d88087aed048b75fcb6d113c7617016aeb672e01',
'app.mjs':'0940a8dc9e5849d40089d865a62f71505924eace0a869ce2ae4fa6879a103b1a',
'parus-media/content.mjs':'c71b32b2ae4a07db722f5d2cb97d4613aeb68a844efd7d37e395cadcd02276f4',
}
MODIFIED={'index.html','bani/kvadro/index.html','bani/viking/index.html','bani/parus/index.html','bani/kvadro-haus/index.html','sitemap.xml'}
CREATED={'raboty/index.html','cjm-r80.css','cjm-r80-model.mjs'}
EXPECTED_SOURCE_FILES={*MODIFIED,*SOURCE_HASHES,'parus-media/widget.mjs','qh-media/widget.mjs','quote.mjs','lead-client.mjs','manager.html','robots.txt'}
RELEASE_PREFIX='CJM-R80-20261022-'


def chk(v,reason):
 if not v:raise RuntimeError(reason)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def inventory(root):
 result={}
 for p in root.rglob('*'):
  chk(not p.is_symlink(),'NESTED_SYMLINK_'+str(p))
  if p.is_file():result[p.relative_to(root).as_posix()]=digest(p)
 return result

def pointer(link):
 chk(link.is_symlink(),'CURRENT_NOT_SYMLINK_'+str(link))
 path=link.resolve(strict=True)
 chk(path.is_dir(),'TARGET_MISSING_'+str(link))
 return path

def preflight():
 web=pointer(WEB);api=pointer(API)
 chk(web.name==EXPECTED_WEB,'SOURCE_RELEASE_CHANGED_'+web.name)
 chk(web.parent==SITE/'releases','INVALID_WEB_RELEASE_ROOT')
 before=inventory(web)
 for p in EXPECTED_SOURCE_FILES:chk(p in before,'SOURCE_MISSING_'+p)
 for p,h in SOURCE_HASHES.items():chk(before[p]==h,'SOURCE_HASH_MISMATCH_'+p)
 for p in CREATED:chk(p not in before,'CREATED_PATH_ALREADY_EXISTS_'+p)
 chk((SITE/'releases').is_dir(),'RELEASES_MISSING')
 needed=sum(x.stat().st_size for x in web.rglob('*') if x.is_file())+80*1024*1024
 chk(shutil.disk_usage(SITE).free>needed,'NOT_ENOUGH_SPACE')
 return web,api,before

def changes(before,after):
 modified={p for p in set(before)&set(after) if before[p]!=after[p]}
 added=set(after)-set(before);removed=set(before)-set(after)
 chk(not removed,'UNEXPECTED_DELETION_'+repr(removed))
 chk(modified <= MODIFIED,'UNEXPECTED_EXISTING_MODIFICATION_'+repr(modified-MODIFIED))
 chk(added==CREATED,'UNEXPECTED_CREATED_FILES_'+repr(added^CREATED))
 chk(modified==MODIFIED,'MISSING_REQUIRED_MODIFICATION_'+repr(MODIFIED-modified))
 return sorted(modified|added)

def audit_path(stage):return stage.parent/(stage.name+'.r80-audit.json')

def stage():
 web,api,before=preflight()
 dest=SITE/'releases'/(RELEASE_PREFIX+str(time.time_ns()))
 chk(not dest.exists(),'STAGE_ALREADY_EXISTS')
 shutil.copytree(web,dest)
 try:
  output=transform.transform(dest)
  after=inventory(dest)
  changed=changes(before,after)
  for f,sha in output.items():chk(after.get(f)==sha,'STAGE_GENERATED_SHA_MISMATCH_'+f)
  chk(inventory(web)==before and WEB.resolve()==web,'SOURCE_CHANGED_DURING_STAGE')
  chk(API.resolve()==api,'API_CHANGED_DURING_STAGE')
  # No client-side service access; checks exact DOM invariants without HTML dependencies.
  html=(dest/'index.html').read_text()
  chk(html.count('id="configure"')==1 and html.count('id="relay-lead-form"')==1 and 'id="quote-total"' in html,'MAIN_CALCULATOR_OR_LEAD_CHANGED')
  chk('parus-photos"' not in html and 'qh-photos"' not in html or 'cjm-r80-legacy-routing' in html,'LEGACY_ROUTE_MISSING')
  for f in ('bani/parus/index.html','bani/kvadro-haus/index.html'):
   page=(dest/f).read_text();chk('id="photos"' in page and 'id="plans"' in page,'MODEL_MEDIA_MISSING_'+f)
  audit={'status':'STAGED_NO_PUBLIC_SWITCH','created_at':int(time.time()),'source_web':str(web),'api_web':str(api),
         'source_files':before,'modified_files':changed,'expected_stage_files':after,'stage_path':str(dest),
         'release_payload':output,'source_manifest_sha':digest(Path(__file__).resolve().parent/'transform.py')}
  path=audit_path(dest);path.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');path.chmod(0o600)
  print('R80_STAGE=PASS; CHANGED='+str(len(changed))+'; WEB='+str(dest),flush=True)
  print('R80_PREVIOUS_WEB='+str(web)+'; LIVE_UNCHANGED=YES; API_UNCHANGED=YES',flush=True)
  print('R80_STAGE_AUDIT='+str(path),flush=True)
  return dest
 except Exception:
  if dest.exists():shutil.rmtree(dest)
  raise

def flip(target):
 temp=WEB.parent/('.current.r80.'+str(time.time_ns())+'.tmp')
 try:temp.symlink_to(target);os.replace(temp,WEB)
 finally:
  if temp.is_symlink():temp.unlink()

def public_smoke(stage,after,changed):
 paths=changed+['app.mjs','parus-media/content.mjs','qh-media/content.mjs','lead-client.mjs','robots.txt']
 def check(p):
  url=ORIGIN+'/'+(p[:-10] if p.endswith('index.html') else p)
  req=urllib.request.Request(url+'?r80_verify='+str(time.time_ns()),headers={'User-Agent':'DachaPar-R80-publish-readonly','Accept-Encoding':'identity','Cache-Control':'no-cache'})
  with urllib.request.urlopen(req,timeout=25) as res:
   chk(res.status==200,'HTTP_'+p)
   chk(hashlib.sha256(res.read()).hexdigest()==after[p],'PUBLIC_HASH_'+p)
  return p
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for path in pool.map(check,paths):print('R80_PUBLIC=PASS; PATH='+path,flush=True)

def activate(stage_path):
 web,api,before=preflight()
 path=Path(stage_path).resolve(strict=True)
 chk(path.parent==SITE/'releases' and path.name.startswith(RELEASE_PREFIX),'INVALID_STAGE_PATH')
 a=audit_path(path);chk(a.is_file(),'MISSING_STAGE_AUDIT')
 audit=json.loads(a.read_text())
 chk(audit['source_web']==str(web) and audit['api_web']==str(api),'AUDIT_SOURCE_DRIFT')
 chk(audit['source_files']==before,'SOURCE_DRIFT')
 chk(audit['source_manifest_sha']==digest(Path(__file__).resolve().parent/'transform.py'),'TRANSFORM_CHANGED_SINCE_STAGE')
 after=inventory(path)
 chk(after==audit['expected_stage_files'],'STAGE_FILES_DRIFT')
 modified=changes(before,after)
 chk(WEB.resolve()==web and API.resolve()==api,'POINTER_DRIFT_BEFORE_SWITCH')
 flip(path)
 try:
  public_smoke(path,after,modified)
  chk(WEB.resolve()==path and API.resolve()==api,'POINTER_DRIFT_AFTER_SMOKE')
 except BaseException:
  if WEB.resolve()==path:
   flip(web);print('R80_ROLLBACK=PASS; PREVIOUS_WEB_RESTORED=YES',flush=True)
  raise
 print('R80_DEPLOY=PASS; WEB_RELEASE='+str(path)+'; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_CALLS=0',flush=True)
 print('R80_PREVIOUS_WEB='+str(web),flush=True)

def main():
 p=argparse.ArgumentParser();g=p.add_mutually_exclusive_group();g.add_argument('--stage',action='store_true');g.add_argument('--activate',metavar='STAGE_PATH');a=p.parse_args()
 with (SITE/'.gallery-r80.lock').open('a') as stream:
  fcntl.flock(stream.fileno(),fcntl.LOCK_EX)
  if a.stage:stage()
  elif a.activate:activate(a.activate)
  else:
   web,api,before=preflight()
   print('R80_PREFLIGHT=PASS; LIVE_WEB='+str(web)+'; API='+str(api)+'; SOURCE_FILES='+str(len(before))+'; READ_ONLY=YES',flush=True)
if __name__=='__main__':
 try:main()
 except BaseException as e:
  print('R80_ABORT='+str(e),file=sys.stderr,flush=True);sys.exit(2)
