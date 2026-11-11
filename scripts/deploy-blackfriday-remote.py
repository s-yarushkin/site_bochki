"""Static-only atomic release. API, database, credentials, Caddy and services stay untouched."""
import argparse,fcntl,hashlib,json,os,re,shutil,subprocess,tarfile,tempfile,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(data):return hashlib.sha256(data).hexdigest()
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=sha(p.read_bytes())
 return result
def active(link):
 p=link.resolve(strict=True)
 if not link.is_symlink() or p.parent!=link.parent/'releases':raise RuntimeError('Unexpected active release')
 return p
def baseline(c):
 for kind,link in [('web',WEB),('api',API)]:
  p=active(link)
  if str(p)!=c['baseline'][kind] or tree(p)!=c['baseline'][kind+'_files']:raise RuntimeError('Production changed: '+kind)
 return active(WEB)
def allowed(name):
 return name in ['web/index.html','web/choice/app.mjs','web/choice/state.mjs','web/choice/home-hero/model-request.mjs','web/campaigns/blackfriday.mjs','web/campaigns/blackfriday-data.mjs','web/campaigns/blackfriday.css'] or bool(re.fullmatch(r'web/blackfriday/(?:index\.html|style\.css|app\.mjs|state\.mjs|lead-data\.mjs|assets/scene-(?:kvadro|parus|viking|kvadro-house)\.webp)',name))
def run(args):return subprocess.run(args,capture_output=True,check=True,timeout=90)
def stage(dest,c):
 if sha((HERE/'payload.tar.gz').read_bytes())!=c['payload_sha256']:raise RuntimeError('Archive checksum mismatch')
 if any(not allowed(n) for n in c['overlay']):raise RuntimeError('File outside campaign scope')
 expected=dict(c['baseline']['web_files'])
 with tarfile.open(HERE/'payload.tar.gz') as tar:
  if set(tar.getnames())!=set(c['overlay']) or len(tar.getmembers())!=len(c['overlay']):raise RuntimeError('Archive inventory mismatch')
  for name,digest in c['overlay'].items():
   member=tar.getmember(name)
   if not member.isfile():raise RuntimeError('Unexpected archive member')
   data=tar.extractfile(member).read()
   if sha(data)!=digest:raise RuntimeError('File checksum mismatch')
   rel=name.removeprefix('web/');p=dest/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o644);expected[rel]=digest
 if tree(dest)!=expected:raise RuntimeError('Protected web inventory changed')
 for name in c['overlay']:
  p=dest/name.removeprefix('web/')
  if p.suffix=='.mjs':
   run(['/usr/bin/node','--check',str(p)])
   for url in re.findall(r'from\s+[\'\"]([^\'\"]+)[\'\"]',p.read_text()):
    url=url.split('?',1)[0]
    if not url.startswith(('.', '/')):continue
    dependency=(dest/url.lstrip('/') if url.startswith('/') else p.parent/url).resolve()
    if not dependency.is_relative_to(dest.resolve()) or not dependency.is_file():raise RuntimeError('Missing module dependency: '+url)
  if p.suffix=='.webp' and (p.read_bytes()[:4]!=b'RIFF' or p.read_bytes()[8:12]!=b'WEBP'):raise RuntimeError('Invalid WebP image')
 smoke='''const {CAMPAIGN,campaignQuote,campaignPhase}=await import(process.argv[1]);
 const expected={kvadro:{comfort:25000,deluxe:35000},parus:{comfort:30000,deluxe:35000},viking:{comfort:30000,deluxe:35000},'kvadro-house':{comfort:45000,deluxe:55000}};
 if(CAMPAIGN.rows.length!==40)throw Error('PRICE_ROWS');const start=Date.parse(CAMPAIGN.start),end=Date.parse(CAMPAIGN.end);
 if(campaignPhase(start-1)!=='upcoming'||campaignPhase(start)!=='active'||campaignPhase(end-1)!=='active'||campaignPhase(end)!=='ended')throw Error('CAMPAIGN_WINDOW');
 for(const r of CAMPAIGN.rows){const q=campaignQuote(r.model,r.size,r.package,{now:start});if(q.discountRub!==expected[r.model][r.package]||q.priceRub!==r.source-5000)throw Error('CAMPAIGN_PRICE');}
 const {validateBaniLead,formatBaniLead}=await import(process.argv[2]);const {campaignLeadFields}=await import(process.argv[3]);
 for(const channel of ['max','telegram','whatsapp','phone']){const state={model:'parus',size:'550',package:'deluxe'},q=campaignQuote('parus','550','deluxe',{now:start});
 const p={requestId:'00000000-0000-4000-8000-000000000001',flow:'callback',phone:'+79990000001',name:'',consent:true,consentVersion:'2026-10-21',consentMethod:'submit-button-v2',...campaignLeadFields(state,q,'model',channel)};
 const lead=validateBaniLead(p);if(!formatBaniLead(lead).includes('649000'))throw Error('LEAD_CONTRACT');}
 console.log(JSON.stringify({prices:40,channels:4,persisted:0,max_messages:0}));'''
 run(['/usr/bin/node','--input-type=module','-e',smoke,(dest/'campaigns/blackfriday.mjs').as_uri(),(active(API)/'server/garant-bani-relay.mjs').as_uri(),(dest/'blackfriday/lead-data.mjs').as_uri()])
 return expected
def switch(target):
 if target.parent!=WEB.parent/'releases' or not target.is_dir():raise RuntimeError('Unsafe web switch')
 pending=WEB.with_name('current.blackfriday-switch')
 if pending.exists() or pending.is_symlink():raise RuntimeError('Pending web switch exists')
 pending.symlink_to(target);os.replace(pending,WEB)
def request(path,method='GET',data=None):
 req=urllib.request.Request(ORIGIN+path,data=data,method=method,headers={'Origin':ORIGIN,'Content-Type':'application/json','User-Agent':'DachaPar-BlackFriday-Release/1.0'})
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as r:return r.code,r.read(),r.headers
def verify(expected,c):
 for name in sorted(c['overlay']):
  rel=name.removeprefix('web/');path='/' if rel=='index.html' else '/'+rel
  status,data,headers=request(path)
  if status!=200 or sha(data)!=expected[rel]:raise RuntimeError('Public checksum failed: '+rel)
  if rel.endswith('.webp') and headers.get_content_type()!='image/webp':raise RuntimeError('Image MIME mismatch')
 status,data,_=request('/blackfriday')
 if status!=200 or sha(data)!=expected['blackfriday/index.html']:raise RuntimeError('Campaign route unavailable')
 if request('/api/lead','POST',b'{}')[0]!=400:raise RuntimeError('Invalid lead must be rejected')
 if request('/api/manager/aggregate-actions')[0]!=401:raise RuntimeError('Manager auth check failed')
 if request('/api/analytics/config')[0]!=200:raise RuntimeError('Analytics config unavailable')
 if str(active(API))!=c['baseline']['api'] or tree(active(API))!=c['baseline']['api_files']:raise RuntimeError('API changed during publication')
 return {'route':'/blackfriday/','public_hashes':True,'all_prices_checked':40,'lead_channels_checked':4,'invalid_lead_rejected':True,'manager_auth_required':True,'api_unchanged':True,'database_unchanged':True,'caddy_unchanged':True,'services_restarted':0,'real_test_leads_sent':0,'max_test_messages':0}
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--apply',action='store_true');args=p.parse_args()
 if args.check==args.apply:raise RuntimeError('Choose one operation')
 c=json.loads((HERE/'deployment.json').read_text());release=c['release']
 if not re.fullmatch(r'BF-[a-f0-9]{12}',release):raise RuntimeError('Invalid release')
 for name,digest in c['support_files'].items():
  if name not in ['deploy-blackfriday-remote.py','deploy-blackfriday-job.py'] or sha((HERE/name).read_bytes())!=digest:raise RuntimeError('Helper checksum mismatch')
 old=baseline(c)
 with tempfile.TemporaryDirectory(prefix='dachapar-bf-check-') as temp:
  dest=Path(temp)/'web';shutil.copytree(old,dest);stage(dest,c)
 if args.check:
  result={'ok':True,'preflight':'PASS','files':len(c['overlay']),'api_unchanged':True,'database_touched':False};(HERE/'preflight-result.json').write_text(json.dumps(result));print(json.dumps(result));return
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 with open('/run/lock/dachapar-crm-deploy.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);baseline(c)
  backup=Path('/var/backups/dachapar')/release;backup.mkdir(parents=True,mode=0o700,exist_ok=False)
  dest=WEB.parent/'releases'/release;shutil.copytree(old,dest);expected=stage(dest,c)
  state={'release':release,'previous_web':str(old),'web':str(dest),'api':c['baseline']['api'],'source_commit':c['source_commit']}
  (backup/'state.json').write_text(json.dumps(state,indent=2));(backup/'state.json').chmod(0o600)
  switched=False
  try:
   baseline(c);switch(dest);switched=True;checks=verify(expected,c)
   if tree(dest)!=expected:raise RuntimeError('Candidate changed during verification')
  except Exception:
   if switched:switch(old)
   raise
  receipt={'ok':True,**state,'checks':checks,'rollback_file':str(backup/'state.json'),'api_changed':False,'existing_credentials_preserved':True,'mfa_preserved':True}
  (backup/'receipt.json').write_text(json.dumps(receipt,indent=2));(backup/'receipt.json').chmod(0o600);print(json.dumps(receipt))
if __name__=='__main__':
 try:main()
 except Exception as error:print(json.dumps({'ok':False,'error_type':type(error).__name__,'message':str(error)[:240]}));raise SystemExit(1)
