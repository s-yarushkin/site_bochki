#!/usr/bin/env python3
"""R8.3 copy/Comfort editorial release: read-only preflight, isolated stage, guarded activation/rollback.
Only writes a new immutable WEB release and sidecar audit. Never touches API, SQLite, MAX, manager or pricebook.
"""
from __future__ import annotations
import argparse,sys,json,os,hashlib,shutil,fcntl,urllib.request,time,importlib.util
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import transform
ROOT=Path(os.environ.get('R83_SITE_ROOT','/srv/sites/dachapar-preview'))
API=Path(os.environ.get('R83_API_LINK','/srv/services/garant-bani-relay/current'))
CURRENT=ROOT/'current';RELEASES=ROOT/'releases'
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
BASE='VIKING-BUILT-20261024-1792838766529643617'
# require exact latest known live source. Do not accidentally fork/erase newer releases.
API_EXPECTED='R73-LEGAL-db5d49445661-1792566478879449075'
PREFIX='CJM-R83-COPY-COMFORT-20261024-'
SOURCE_SHA=hashlib.sha256((HERE/'transform.py').read_bytes()).hexdigest()
PROTECTED=['quote.mjs','lead-client.mjs','data/catalog-pricebook.json','manager.html','privacy.html','consent.html','requisites.html','analytics-runtime.mjs']


def chk(ok,code):
 if not ok:raise RuntimeError(code)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def link(p):
 chk(p.is_symlink(),'NOT_SYMLINK_'+str(p))
 q=p.resolve(strict=True);chk(q.is_dir(),'MISSING_RELEASE_'+str(q));return q
def hashes(p):
 a={}
 for f in p.rglob('*'):
  chk(not f.is_symlink(),'SYMLINK_WITHIN_WEB_'+str(f))
  if f.is_file():a[f.relative_to(p).as_posix()]=sha(f)
 return a

def audit_path(p):return RELEASES/(p.name+'.r83-audit.json')
def source_state():
 base=link(CURRENT);api=link(API)
 chk(base.parent==RELEASES,'INVALID_WEB_RELEASE_PARENT')
 chk(base.name==BASE,'R83_SOURCE_DRIFT_LIVE_'+base.name+'_EXPECTED_'+BASE)
 chk(api.name==API_EXPECTED,'R83_API_CHANGED_'+api.name)
 inv=hashes(base)
 for k in PROTECTED:chk(k in inv,'R83_MISSING_PROTECTED_'+k)
 chk('app.mjs' in inv and 'voprosy/index.html' in inv and 'viking-built-media/catalog.json' in inv,'MISSING_LATEST_VIKING_SITE_SOURCE')
 disk=shutil.disk_usage(ROOT)
 chk(disk.free>sum(x.stat().st_size for x in base.rglob('*') if x.is_file())+90*1024*1024,'R83_NO_DISK')
 return base,api,inv

def assertions(root):
 # Verifies consumer-facing labels; old internal "comfort" keys must remain as-is.
 from html.parser import HTMLParser
 from html import unescape
 class Text(HTMLParser):
  def __init__(self):super().__init__();self.parts=[];self.ignore=0
  def handle_starttag(self,t,a):
   if t in ('script','style'):self.ignore+=1
  def handle_endtag(self,t):
   if t in ('script','style'):self.ignore=max(0,self.ignore-1)
  def handle_data(self,x):
   if not self.ignore:self.parts.append(x)
 def plain(path):
  x=Text();x.feed((root/path).read_text(encoding='utf-8'));return unescape(' '.join(x.parts)).replace('\u00a0',' ')
 faq=plain('voprosy/index.html')
 for needle in ('60 × 60 см','60 × 80 см','Что входит в комплектацию Комфорт?','Чем Делюкс отличается от Комфорта?','505 000 ₽','618 022 ₽','113 022 ₽','Сборка'):
  chk(needle.lower() in faq.lower(),'R83_FAQ_INCOMPLETE_'+needle)
 bad=['Для Квадро 5 м база стоит','Комфорт — 618 022 ₽','в Комфорте для Квадро 5 м есть лавка-рундук']
 for s in bad:chk(s not in faq,'R83_OLD_PACKAGE_CLAIM_'+s)
 for model in transform.MODEL_NAMES:
  p=f'bani/{model}/index.html';s=(root/p).read_text(encoding='utf-8');t=plain(p)
  chk(s.count('id="comfort-included"')==1,'R83_COMFORT_BLOCK_'+model)
  chk('Что входит в Комфорт' in t,'R83_COMFORT_HEADING_'+model)
  chk(all(x in t for x in ('Печь, дымоход','Вентиляция и слив','Конструкция пола')),'R83_KIT_PARTS_'+model)
  chk(s.count('id="r83-comfort-style"')==1,'R83_COMFORT_STYLE_'+model)
  chk('Окна и двери выбранного варианта' not in t,'R83_UNHELPFUL_OPENING_'+model)
  chk(transform.MODEL_OPENINGS[model] in t,'R83_CONTRACT_EXAMPLE_MISSING_'+model)
 for p in ('journal/banya-4-5-6-metrov/index.html','journal/iz-chego-skladyvaetsya-tsena/index.html','journal/index.html','journal/kvadro-5-komfort/index.html','journal/kak-chitat-komplektatsiyu-bani/index.html','journal/kak-prinyat-gotovuyu-banyu/index.html','journal/ventilyatsiya-i-fortochka/index.html'):
  txt=plain(p)
  chk('Делюкс' in txt,'R83_OLD_DELUXE_ARTICLE_'+p)
 chk('Комфорт: что входит' in plain('journal/kak-chitat-komplektatsiyu-bani/index.html'), 'R83_NO_COMFORT_GUIDE')
 home=(root/'index.html').read_text(encoding='utf-8');chk('id="configure"' in home and 'id="relay-lead-form"' in home,'R83_HOME_FORM_DAMAGED')
 for p in ('bani/kvadro/index.html','bani/parus/index.html','bani/viking/index.html','bani/kvadro-haus/index.html','index.html','voprosy/index.html'):
  txt=plain(p);chk('80% клиентов' not in txt,'R83_UNVERIFIED_PERCENT_'+p)
 chk((root/'data/catalog-pricebook.json').is_file(),'R83_NO_PRICEBOOK')
 book=json.loads((root/'data/catalog-pricebook.json').read_text(encoding='utf8'))
 chk(book['prices']['kvadro']['500']==505000,'R83_PRICEBOOK_KVADRO_DRIFT')
 chk(book['prices']['kvadro-house']['4x4']==590000,'R83_QH_PRICEBOOK_DRIFT')
 bundle=book['featuredBundle'];ids=bundle['selectedOptionIds'];vals=sum(book['options'][i]['unitPriceRub'] for i in ids)
 chk(vals==113022 and book['prices']['kvadro']['500']+vals==618022,'R83_DELUXE_SUM_DRIFT')

def preflight():
 base,api,inv=source_state()
 print('R83_PREFLIGHT=PASS; BASE='+str(base)+'; API='+str(api)+'; SOURCE_FILES='+str(len(inv))+'; READ_ONLY=YES',flush=True)
 return base,api,inv

def stage():
 base,api,before=source_state()
 dest=RELEASES/(PREFIX+str(time.time_ns()))
 chk(not dest.exists(),'R83_STAGE_EXISTS')
 shutil.copytree(base,dest)
 try:
  rep=transform.run(dest)
  after=hashes(dest)
  removed=set(before)-set(after);added=set(after)-set(before)
  chk(not removed and not added,'R83_FILELIST_DRIFT_'+str(removed)+str(added))
  changed=sorted(x for x in before if before[x]!=after[x])
  chk(set(changed)==set(rep['changed_files']),'R83_CHANGED_INVENTORY_MISMATCH')
  chk(set(changed)<=transform.EDITABLE,'R83_UNSAFE_EDIT')
  chk(len(changed)>=1,'R83_NO_CHANGES')
  for k in PROTECTED:chk(before[k]==after[k],'R83_PROTECTED_DRIFT_'+k)
  assertions(dest)
  chk(CURRENT.resolve()==base and API.resolve()==api,'R83_CHANGED_DURING_STAGE')
  chk(hashes(base)==before,'R83_SOURCE_MUTATED')
  audit={'state':'STAGED_NO_PUBLIC_SWITCH','source':str(base),'api':str(api),'stage':str(dest),'before':before,'after':after,'modified':changed,'transform_sha256':SOURCE_SHA,'editorial':rep,'created_at':int(time.time())}
  path=audit_path(dest);path.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');path.chmod(0o644)
  results={}
  for group in range(1,44):
   entries=rep['groups'].get(str(group),[])
   results[str(group)]={'CHANGED':sum(e['result']=='CHANGED' for e in entries),'ALREADY':sum(e['result']=='ALREADY' for e in entries),'NOT_FOUND':sum(e['result']=='NOT_FOUND' for e in entries),'MISSING_SOURCE':sum(e['result']=='MISSING_SOURCE' for e in entries)}
  print('R83_STAGE=PASS; WEB='+str(dest)+'; FILES_CHANGED='+str(len(changed))+'; PUBLIC_SWITCH=NO; API_UNCHANGED=YES',flush=True)
  print('R83_EDITORIAL_AUDIT='+str(path)+'; GROUPS='+str(len(results))+'; FILES='+','.join(changed),flush=True)
  print('R83_P0_PRICES=PASS; COMFORT_BLOCKS=4; COMFORT_FAQ=PASS; 505000_618022_113022=PASS',flush=True)
  print('R83_WORK_PROGRESS='+json.dumps(results,ensure_ascii=False,separators=(',',':')),flush=True)
 except BaseException:
  shutil.rmtree(dest,ignore_errors=True)
  raise

def flip(target):
 temp=CURRENT.parent/('.current.r83.'+str(time.time_ns())+'.tmp')
 try:temp.symlink_to(target);os.replace(temp,CURRENT)
 finally:
  if temp.is_symlink():temp.unlink()

def public_sha(path,expected):
 url=ORIGIN+'/'+(path[:-10] if path.endswith('index.html') else path)
 req=urllib.request.Request(url+'?r83verify='+str(time.time_ns()),headers={'User-Agent':'R83-public-verify','Accept-Encoding':'identity','Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=22) as res:
  chk(res.status==200,'HTTP_'+path)
  chk(hashlib.sha256(res.read()).hexdigest()==expected,'PUBLIC_HASH_'+path)
 print('R83_PUBLIC=PASS; PATH='+path,flush=True)

def activate(stage_path,acceptance_file,approval):
 chk(approval=='R83_COPY_COMFORT_APPROVED','R83_APPROVAL_REQUIRED')
 base,api,before=source_state()
 stage=Path(stage_path).resolve(strict=True)
 chk(stage.parent==RELEASES and stage.name.startswith(PREFIX),'R83_INVALID_STAGE_PATH')
 aud=json.loads(audit_path(stage).read_text(encoding='utf8'))
 chk(aud['source']==str(base) and aud['api']==str(api),'R83_STAGE_STALE')
 chk(aud['transform_sha256']==SOURCE_SHA,'R83_TRANSFORM_CHANGED')
 chk(aud['before']==before,'R83_SOURCE_DRIFT')
 after=hashes(stage);chk(aud['after']==after,'R83_STAGE_DRIFT')
 assertions(stage)
 # Never allow cutover without an explicit browser QA evidence file for EXACT stage.
 evidence=json.loads(Path(acceptance_file).read_text(encoding='utf8'))
 chk(evidence.get('stage')==str(stage) and evidence.get('status')=='PASS','R83_ACCEPTANCE_MISSING_OR_WRONG')
 chk(evidence.get('failed',1)==0 and evidence.get('passed',0)>=15,'R83_BROWSER_QA_INCOMPLETE')
 chk(CURRENT.resolve()==base and API.resolve()==api,'R83_POINTER_DRIFT')
 flip(stage)
 try:
  for p in list(aud['modified'])+[p for p in ('quote.mjs','lead-client.mjs','data/catalog-pricebook.json','manager.html','robots.txt') if p in after]:
   public_sha(p,after[p])
  chk(CURRENT.resolve()==stage and API.resolve()==api,'R83_POSTCHECK_POINTER_DRIFT')
 except BaseException:
  if CURRENT.resolve()==stage:
   flip(base);print('R83_AUTO_ROLLBACK=PASS; RESTORED='+str(base),flush=True)
  raise
 print('R83_DEPLOY=PASS; WEB='+str(stage)+'; PREVIOUS='+str(base)+'; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_POSTS=0',flush=True)

def rollback():
 api=link(API);chk(api.name==API_EXPECTED,'R83_API_CHANGED')
 active=link(CURRENT);chk(active.parent==RELEASES,'R83_INVALID_ACTIVE_RELEASE')
 if active.name==BASE:
  print('R83_ROLLBACK=ALREADY_ON_PREVIOUS; WEB='+str(active),flush=True);return
 chk(active.name.startswith(PREFIX),'R83_ROLLBACK_REFUSES_UNRELATED_RELEASE')
 aud=json.loads(audit_path(active).read_text(encoding='utf8'))
 old=Path(aud['source']).resolve(strict=True)
 chk(old==RELEASES/BASE,'R83_ROLLBACK_PREVIOUS_MISMATCH')
 chk(aud['stage']==str(active) and aud['api']==str(api),'R83_ROLLBACK_AUDIT_MISMATCH')
 chk(hashes(old)==aud['before'] and hashes(active)==aud['after'],'R83_ROLLBACK_SHA_DRIFT')
 flip(old)
 chk(link(CURRENT)==old,'R83_ROLLBACK_POINTER_FAILED')
 for name in ('index.html','bani/kvadro/index.html','voprosy/index.html'):
  public_sha(name,aud['before'][name])
 print('R83_ROLLBACK=PASS; WEB='+str(old)+'; API_UNCHANGED=YES',flush=True)

def status():
 b=link(CURRENT);a=link(API);print('R83_STATUS=PASS; LIVE='+str(b)+'; API='+str(a)+'; NO_WRITES=YES')

def main():
 p=argparse.ArgumentParser();p.add_argument('--mode',choices=['preflight','stage','activate','status','rollback'],default='preflight');p.add_argument('--stage-path');p.add_argument('--acceptance-file');p.add_argument('--approval');x=p.parse_args()
 chk(ROOT.is_dir(),'R83_ROOT_MISSING')
 lock=ROOT/'.gallery-r80.lock'
 with lock.open('a') as fh:
  fcntl.flock(fh.fileno(),fcntl.LOCK_EX)
  if x.mode=='preflight':preflight()
  elif x.mode=='stage':stage()
  elif x.mode=='activate':activate(x.stage_path,x.acceptance_file,x.approval)
  elif x.mode=='rollback':rollback()
  else:status()
if __name__=='__main__':
 try:main()
 except BaseException as e:print('R83_ABORT='+str(e),file=sys.stderr,flush=True);sys.exit(2)
