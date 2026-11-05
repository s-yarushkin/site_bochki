"""Remove only a hidden preview caption; retain the form's DOM hook and all logic."""
from pathlib import Path
import hashlib,json,os,re,shutil,sys,urllib.request,concurrent.futures,fcntl
SITE=Path('/srv/sites/dachapar-preview');BASE=SITE/'releases/SEO-293e53cd0a31ce5a'
NEEDLE='Тестовый просмотр · Заявка останется на этом компьютере'.encode()
def sha(data):return hashlib.sha256(data).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p.read_bytes()) for p in root.rglob('*') if p.is_file()}
def switch(target):
 temp=SITE/('.note-current-'+str(os.getpid()));temp.symlink_to(target);os.replace(temp,SITE/'current')
def plan():
 result={}
 for p in BASE.rglob('*.html'):
  rel=p.relative_to(BASE).as_posix()
  if rel.startswith('novyy-god/'):continue
  data=p.read_bytes()
  if NEEDLE not in data:continue
  paragraphs=re.findall(rb'<p\b[^>]*\bid=["\x27]preview-note["\x27][^>]*>.*?</p>',data,re.S)
  assert sum(x.count(NEEDLE) for x in paragraphs)==data.count(NEEDLE)
  assert all(b'hidden' in x.split(b'>')[0] for x in paragraphs)
  new=data.replace(NEEDLE,b'')
  assert new.count(b'id="preview-note"')==data.count(b'id="preview-note"')
  result[rel]={'before':sha(data),'after':sha(new)}
 assert result and 'index.html' in result
 return result
def main():
 mode=sys.argv[1];assert mode in {'--check','--apply','--rollback','--status'}
 changes=plan();digest=sha(json.dumps(changes,sort_keys=True).encode())[:16]
 target=SITE/'releases'/('CLEAN-NOTE-'+digest);state=SITE/('.clean-note-'+digest+'.json');current=(SITE/'current').resolve()
 if mode=='--status':print(json.dumps({'active':str(current),'candidate':str(target),'files':len(changes)}));return
 if mode=='--rollback':
  saved=json.loads(state.read_text());assert os.geteuid()==0 and current==target
  assert inventory(BASE)==saved['before'];switch(BASE);print('FULL_ROLLBACK=PASS '+str(BASE));return
 assert current in {BASE,target}
 for p,row in changes.items():assert sha((BASE/p).read_bytes())==row['before']
 print('PREFLIGHT=PASS; HIDDEN_CAPTION_ONLY; FORM_HOOKS_UNCHANGED; FILES='+str(len(changes)),flush=True)
 if mode=='--check':return
 assert os.geteuid()==0
 with (SITE/'.bath-choice-deploy.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if current!=target:
   assert not target.exists();before=inventory(BASE);shutil.copytree(BASE,target,symlinks=True)
   for p,row in changes.items():(target/p).write_bytes((BASE/p).read_bytes().replace(NEEDLE,b''))
   after=inventory(target);assert {p for p in after if before.get(p)!=after[p]}==set(changes)
   assert inventory(BASE)==before and (SITE/'current').resolve()==BASE
   state.write_text(json.dumps({'previous':str(BASE),'candidate':str(target),'before':before,'changes':changes,'phase':'prepared'}));switch(target)
  saved=json.loads(state.read_text())
  try:
   def verify(item):
    p,row=item
    with urllib.request.urlopen('https://xn--80aaan1dh9b.xn--p1ai/'+('' if p=='index.html' else p)+'?note_verify='+digest,timeout=20) as r:
     data=r.read();assert sha(data)==row['after'] and NEEDLE not in data,p
   with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(verify,changes.items()))
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=10) as r:assert json.load(r)['ok'] is True
   assert inventory(BASE)==saved['before']
  except BaseException:switch(BASE);print('AUTO_FULL_ROLLBACK=PASS '+str(BASE),flush=True);raise
  saved['phase']='active';state.write_text(json.dumps(saved))
  print('PUBLIC_HASHES=PASS; API_HEALTH=PASS; ACTIVE='+str(target),flush=True)
  print('ROLLBACK: sudo python3 '+str(Path(__file__).resolve())+' --rollback',flush=True)
if __name__=='__main__':main()
