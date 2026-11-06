from pathlib import Path
import hashlib,json,os,shutil,sys,fcntl,urllib.request,concurrent.futures
B=Path(__file__).resolve().parent;SITE=Path('/srv/sites/dachapar-preview')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file()}
def switch(target):
 p=SITE/('.inquiry-current-'+str(os.getpid()));p.symlink_to(target);os.replace(p,SITE/'current')
def main():
 m=json.loads((B/'manifest.json').read_text());mode=sys.argv[1];digest=sha(B/'manifest.json')[:16];old=Path(m['baseline']);target=SITE/'releases'/('WELCOME-'+digest);state=SITE/('.welcome-'+digest+'.json')
 allowed=set(m['files']); assert all(p.endswith(('.html','.mjs','.css')) and '..' not in p for p in allowed)
 assert set(m['files'])==allowed and old==SITE/'releases/MFA-81c68cd72bf6'
 if mode=='--rollback':
  saved=json.loads(state.read_text());assert os.geteuid()==0 and (SITE/'current').resolve()==target and inventory(old)==saved['before'];switch(old);print('FULL_ROLLBACK=PASS '+str(old));return
 if mode=='--status':print(json.dumps({'active':str((SITE/'current').resolve()),'candidate':str(target),'state':json.loads(state.read_text())['phase'] if state.exists() else 'not-applied'}));return
 assert mode in {'--check','--apply'} and (SITE/'current').resolve() in {old,target}
 for p,h in m['before'].items():assert (not (old/p).exists()) if h is None else sha(old/p)==h,p
 for p,h in m['files'].items():assert sha(B/'site'/p)==h,p
 print('PREFLIGHT=PASS; WELCOME_UI_AND_SHARE_METADATA',flush=True)
 if mode=='--check':return
 assert os.geteuid()==0
 with (SITE/'.bath-choice-deploy.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if (SITE/'current').resolve()!=target:
   assert not target.exists();before=inventory(old);shutil.copytree(old,target,symlinks=True)
   for p in allowed:shutil.copy2(B/'site'/p,target/p)
   after=inventory(target);assert {p for p in after if before.get(p)!=after[p]}==allowed
   assert inventory(old)==before and (SITE/'current').resolve()==old
   state.write_text(json.dumps({'before':before,'phase':'prepared'}));switch(target)
  saved=json.loads(state.read_text())
  try:
   def verify(item):
    p,h=item
    with urllib.request.urlopen('https://xn--80aaan1dh9b.xn--p1ai/'+('' if p=='index.html' else p)+'?welcome_verify='+digest,timeout=20) as r:assert hashlib.sha256(r.read()).hexdigest()==h,p
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(verify,m['files'].items()))
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=10) as r:assert json.load(r)['ok'] is True
   assert inventory(old)==saved['before']
  except BaseException:switch(old);print('AUTO_FULL_ROLLBACK=PASS '+str(old),flush=True);raise
  saved['phase']='active';state.write_text(json.dumps(saved));print('PUBLIC_HASHES=PASS; API_HEALTH=PASS; PROTECTED_FILES=UNCHANGED; ACTIVE='+str(target));print('ROLLBACK: sudo python3 '+str(B/'install.py')+' --rollback')
if __name__=='__main__':main()
