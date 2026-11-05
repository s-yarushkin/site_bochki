from pathlib import Path
import hashlib,json,os,shutil,sys,urllib.request,concurrent.futures,fcntl
B=Path(__file__).resolve().parent;SITE=Path('/srv/sites/dachapar-preview');ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file()}
def clean(v):
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items() if k!='preFinalComfortPriceRub'}
 if isinstance(v,list):return [clean(x) for x in v]
 return v
def switch(target):
 p=SITE/('.seo-current-'+str(os.getpid()));p.symlink_to(target);os.replace(p,SITE/'current')
def main():
 m=json.loads((B/'manifest.json').read_text());digest=sha(B/'manifest.json')[:16];old=Path(m['baseline']);target=SITE/'releases'/('SEO-'+digest);state=SITE/('.seo-'+digest+'.json');mode=sys.argv[1]
 assert old.parent==SITE/'releases'
 allowed={'index.html','choice/app.mjs','choice/comparison.mjs','choice/packages.mjs','data/catalog-pricebook.json','data/r85-public-pricebook.json','choice/catalog-pricebook.json','sitemap.xml','robots.txt','llms.txt'}
 assert set(m['files'])==allowed
 if mode=='--rollback':
  assert os.geteuid()==0 and (SITE/'current').resolve()==target
  saved=json.loads(state.read_text());assert inventory(old)==saved['before'];switch(old);print('FULL_ROLLBACK=PASS '+str(old));return
 assert mode in {'--check','--apply'} and (SITE/'current').resolve()==old
 for p,h in m['before'].items():assert (not (old/p).exists()) if h is None else sha(old/p)==h,p
 for p,h in m['files'].items():assert sha(B/'site'/p)==h,p
 for p in m['metadataOnlyPriceFiles']:assert json.loads((B/'site'/p).read_text())==clean(json.loads((old/p).read_text())),p
 print('PREFLIGHT=PASS; ALL_ACTIVE_PRICE_DATA=UNCHANGED; ONLY_HISTORICAL_FIELD_REMOVED',flush=True)
 if mode=='--check':return
 assert os.geteuid()==0 and not target.exists()
 with (SITE/'.bath-choice-deploy.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);before=inventory(old);shutil.copytree(old,target,symlinks=True)
  for p in m['files']:
   dest=target/p;assert dest.resolve().is_relative_to(target);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(B/'site'/p,dest)
  after=inventory(target);assert {p for p in after if before.get(p)!=after[p]}<=allowed
  assert inventory(old)==before and (SITE/'current').resolve()==old
  state.write_text(json.dumps({'before':before,'candidate':str(target),'previous':str(old),'phase':'prepared'}));switch(target)
  try:
   def verify(item):
    p,h=item
    with urllib.request.urlopen(ORIGIN+('/' if p=='index.html' else '/'+p)+'?seo_verify='+digest,timeout=20) as r:assert sha_bytes(r.read())==h,p
   with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(verify,m['files'].items()))
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=10) as r:assert json.load(r)['ok'] is True
   assert inventory(old)==before
  except BaseException:switch(old);print('AUTO_FULL_ROLLBACK=PASS '+str(old),flush=True);raise
  state.write_text(json.dumps({'before':before,'candidate':str(target),'previous':str(old),'phase':'active'}))
  print('PUBLIC_HASHES=PASS; PRICES=UNCHANGED; API_HEALTH=PASS; ACTIVE='+str(target),flush=True)
  print('ROLLBACK: sudo python3 '+str(B/'install.py')+' --rollback',flush=True)
def sha_bytes(b):return hashlib.sha256(b).hexdigest()
if __name__=='__main__':main()
