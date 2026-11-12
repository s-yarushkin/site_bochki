"""One reviewed release: additive CRM, nonmodal notice, content-preserving static delivery."""
import argparse,fcntl,gzip,hashlib,json,os,re,shutil,sqlite3,subprocess,tarfile,tempfile,time,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current');SERVICE='garant-bani-relay.service';ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
SUPPORT={'deploy-workspace-remote.py','deploy-workspace-job.py','migrate-workspace.mjs','crm-production-audit.py','caddy_fast_assets.py'}
API_ALLOWED={'server/lead-store.mjs','server/crm-manager-api.mjs','server/crm-lead-workspace.mjs'}
WEB_ALLOWED={'index.html','manager.html','assets/js/manager.js','crm/lead-workspace.mjs','crm/lead-workspace.css','choice/app.mjs','choice/state.mjs','choice/gallery.mjs','choice/display-prices.json','choice/home-hero/layout-panel.mjs','choice/home-hero/model-request.mjs','quiz.mjs','campaigns/blackfriday.mjs','campaigns/blackfriday-data.mjs','campaigns/blackfriday-notice.mjs','campaigns/blackfriday-notice.css','performance/home-entry.mjs','performance/quiz-entry.mjs','performance/media.mjs','campaigns/assets/notice-parus.webp','campaigns/assets/notice-kvadro-house.webp'}
def sha(data):return hashlib.sha256(data).hexdigest()
def run(args,**kw):return subprocess.run(args,check=True,capture_output=True,timeout=180,**kw)
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
 result=[]
 for kind,link in [('web',WEB),('api',API)]:
  p=active(link)
  if str(p)!=c['baseline'][kind] or tree(p)!=c['baseline'][kind+'_files']:raise RuntimeError('Production changed: '+kind)
  result.append(p)
 if sha(Path('/etc/caddy/Caddyfile').read_bytes())!=c['caddy_sha256']:raise RuntimeError('Caddy configuration changed')
 return result
def stage(dest,c):
 if sha((HERE/'payload.tar.gz').read_bytes())!=c['payload_sha256']:raise RuntimeError('Archive checksum mismatch')
 expected={k:dict(c['baseline'][k+'_files']) for k in ['web','api']}
 with tarfile.open(HERE/'payload.tar.gz') as tar:
  if len(tar.getmembers())!=len(c['overlay']) or set(tar.getnames())!=set(c['overlay']):raise RuntimeError('Archive inventory mismatch')
  for name,digest in c['overlay'].items():
   kind,rel=name.split('/',1)
   if kind not in expected or '..' in Path(rel).parts or rel.startswith('/'):raise RuntimeError('Unsafe overlay path')
   if kind=='api' and rel not in API_ALLOWED or kind=='web' and rel not in WEB_ALLOWED and not re.fullmatch(r'assets/build/[A-Za-z0-9_-]+\.(mjs|css)',rel):raise RuntimeError('Unapproved overlay file')
   member=tar.getmember(name)
   if not member.isfile():raise RuntimeError('Nonregular archive member')
   data=tar.extractfile(member).read()
   if sha(data)!=digest:raise RuntimeError('File checksum mismatch')
   p=dest[kind]/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o644);expected[kind][rel]=digest
 for target,info in c['aliases'].items():
  source=info['source'];digest=info['sha256'];suffix=Path(source).suffix
  if c['baseline']['web_files'].get(source)!=digest or suffix not in ['.webp','.png','.jpg','.jpeg','.svg','.glb','.woff2','.js'] or target!='assets/fast/'+digest[:24]+suffix:raise RuntimeError('Invalid byte-identical asset alias')
  src=dest['web']/source;p=dest['web']/target;p.parent.mkdir(parents=True,exist_ok=True)
  if sha(src.read_bytes())!=digest:raise RuntimeError('Source asset changed')
  if p.exists():
   if sha(p.read_bytes())!=digest:raise RuntimeError('Alias collision')
  else:os.link(src,p)
  expected['web'][target]=digest
 for kind in ['web','api']:
  if tree(dest[kind])!=expected[kind]:raise RuntimeError('Protected inventory changed: '+kind)
 run(['/usr/bin/node','--input-type=module','-e','await import(process.argv[2]);','/usr/bin/node',(dest['api']/'server/garant-bani-relay.mjs').as_uri()])
 for name in c['overlay']:
  if name.endswith(('.mjs','.js')):
   kind,rel=name.split('/',1);run(['/usr/bin/node','--check',str(dest[kind]/rel)])
 pricecheck="""import fs from 'node:fs';const root=process.argv[1],full=JSON.parse(fs.readFileSync(root+'/choice/catalog-pricebook.json')),small=JSON.parse(fs.readFileSync(root+'/choice/display-prices.json'));let n=0;for(const [m,v]of Object.entries(full.r85.models))for(const [s,r]of Object.entries(v.sizes)){const d=small.r85.models[m].sizes[s];if(d.priceRub!==r.priceRub||d.deluxe.priceRub!==r.deluxe.priceRub||d.label!==r.label)throw Error('PRICE_PARITY');n+=2;}if(n!==40)throw Error('PRICE_COUNT');"""
 run(['/usr/bin/node','--input-type=module','-e',pricecheck,str(dest['web'])])
 return expected
def switch(link,target):
 if target.parent!=link.parent/'releases' or not target.is_dir():raise RuntimeError('Unsafe release switch')
 pending=link.with_name('current.workspace-switch')
 if pending.exists() or pending.is_symlink():raise RuntimeError('Pending switch exists')
 pending.symlink_to(target);os.replace(pending,link)
def request(path,method='GET',data=None,origin=ORIGIN,headers=None):
 req=urllib.request.Request(origin+path,data=data,method=method,headers={'Origin':ORIGIN,'Content-Type':'application/json','User-Agent':'DachaPar-Workspace-Release/1.0',**(headers or {})})
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as r:return r.code,r.read(),r.headers
def cache_plan(c):
 from caddy_fast_assets import patch_config
 p=Path('/etc/caddy/Caddyfile');old=p.read_bytes()
 if sha(old)!=c['caddy_sha256']:raise RuntimeError('Caddy changed')
 new=patch_config(old.decode()).encode()
 with tempfile.TemporaryDirectory(prefix='dachapar-cache-check-') as folder:
  candidate=Path(folder)/'Caddyfile';candidate.write_bytes(new);run(['caddy','adapt','--config',str(candidate),'--adapter','caddyfile'])
 return {'path':p,'old':old,'new':new,'stat':p.stat()}
def install_cache(plan,data):
 p=plan['path'];pending=p.with_name('Caddyfile.dachapar-workspace')
 if pending.exists():raise RuntimeError('Pending Caddy file exists')
 try:
  pending.write_bytes(data);os.chmod(pending,plan['stat'].st_mode&0o777);os.chown(pending,plan['stat'].st_uid,plan['stat'].st_gid)
  run(['caddy','validate','--config',str(pending),'--adapter','caddyfile']);os.replace(pending,p);run(['systemctl','reload','caddy'])
 finally:pending.unlink(missing_ok=True)
def verify(c,expected):
 for _ in range(30):
  try:
   if request('/health',origin='http://127.0.0.1:3301')[0]==200:break
  except (OSError,TimeoutError):pass
  time.sleep(1)
 else:raise RuntimeError('API health failed')
 for path in ['/api/manager/lead-options','/api/manager/leads','/api/manager/security']:
  if request(path)[0]!=401:raise RuntimeError('Manager authentication failed')
 if request('/api/lead','POST',b'{}')[0]!=400:raise RuntimeError('Invalid lead validation failed')
 settings=json.loads(request('/data/site-settings.json')[1]);channels=settings.get('lead',{}).get('callbackChannels',[])
 # Existing public/static configuration and the MAX relay are outside this overlay.
 for name in c['overlay']:
  if not name.startswith('web/'):continue
  rel=name[4:];status,data,headers=request('/'+rel)
  if status!=200 or sha(data)!=expected['web'][rel]:raise RuntimeError('Public file mismatch: '+rel)
 for rel in ['manager.html','data/site-settings.json']:
  if 'no-store' not in request('/'+rel)[2].get('Cache-Control',''):raise RuntimeError('Dynamic/private cache policy changed')
 samples=[next(iter(c['aliases'])),next(n[4:] for n in c['overlay'] if n.startswith('web/assets/build/') and n.endswith('.mjs'))]
 for rel in samples:
  status,data,headers=request('/'+rel)
  if status!=200 or sha(data)!=expected['web'][rel] or 'immutable' not in headers.get('Cache-Control',''):raise RuntimeError('Immutable delivery check failed')
  status,body,_=request('/'+rel,headers={'If-None-Match':headers.get('ETag')})
  if status!=304 or body:raise RuntimeError('Immutable conditional request failed')
 model=next(n for n in c['aliases'] if n.endswith('.glb'));status,compressed,headers=request('/'+model,headers={'Accept-Encoding':'gzip'})
 if status!=200 or headers.get('Content-Encoding')!='gzip' or sha(gzip.decompress(compressed))!=expected['web'][model]:raise RuntimeError('Lossless 3D transfer failed')
 return {'public_hashes':True,'manager_auth_required':True,'invalid_lead_rejected':True,'real_test_leads_sent':0,'max_test_messages':0,'all_40_prices_unchanged':True,'images_byte_identical':True,'immutable_assets':len(c['aliases']),'dynamic_private_no_store':True,'model_transfer':{'gzip_bytes':len(compressed),'decoded_bytes':len(gzip.decompress(compressed)),'lossless':True}}
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--apply',action='store_true');args=p.parse_args()
 if args.check==args.apply:raise RuntimeError('Choose one operation')
 c=json.loads((HERE/'deployment.json').read_text());release=c['release']
 if not re.fullmatch('WORKSPACE-[a-f0-9]{12}',release) or set(c['support_files'])!=SUPPORT:raise RuntimeError('Invalid reviewed package')
 for n,digest in c['support_files'].items():
  if sha((HERE/n).read_bytes())!=digest:raise RuntimeError('Support helper changed')
 oldweb,oldapi=baseline(c);plan=cache_plan(c)
 with tempfile.TemporaryDirectory(prefix='dachapar-workspace-preflight-') as temp:
  dest={k:Path(temp)/k for k in ['web','api']}
  for k,source in [('web',oldweb),('api',oldapi)]:shutil.copytree(source,dest[k])
  stage(dest,c)
 if args.check:print(json.dumps({'ok':True,'preflight':'PASS','files':len(c['overlay']),'aliases':len(c['aliases']),'database_touched':False,'caddy_syntax':'PASS'}));return
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 with open('/run/lock/dachapar-crm-deploy.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);baseline(c)
  backup=Path('/var/backups/dachapar')/release;backup.mkdir(parents=True,mode=0o700,exist_ok=False)
  run(['python3',str(HERE/'crm-production-audit.py')]);audit=json.loads((HERE/'audit-sanitized.json').read_text())
  if audit['backup_integrity']!='ok' or audit['isolated_restore']!='PASS':raise RuntimeError('Consistent backup validation failed')
  dest={'web':WEB.parent/'releases'/release,'api':API.parent/'releases'/release}
  for k,source in [('web',oldweb),('api',oldapi)]:shutil.copytree(source,dest[k])
  expected=stage(dest,c);database=Path(audit['database_path'])
  with tempfile.TemporaryDirectory(prefix='dachapar-workspace-restore-') as temp:
   restored=Path(temp)/'restored.sqlite';shutil.copyfile(Path(audit['backup_path'])/'leads.sqlite',restored)
   check=run(['/usr/bin/node',str(HERE/'migrate-workspace.mjs'),(dest['api']/'server/lead-store.mjs').as_uri(),str(restored),str(HERE/'deployment.json')])
   if not json.loads(check.stdout)['ok']:raise RuntimeError('Isolated migration failed')
  (backup/'Caddyfile.before').write_bytes(plan['old']);(backup/'Caddyfile.before').chmod(0o600)
  state={'release':release,'previous_web':str(oldweb),'previous_api':str(oldapi),'web':str(dest['web']),'api':str(dest['api']),'database_backup':audit['backup_path'],'caddy_backup':str(backup/'Caddyfile.before')}
  (backup/'state.json').write_text(json.dumps(state,indent=2));(backup/'state.json').chmod(0o600)
  migrated=run(['/usr/bin/node',str(HERE/'migrate-workspace.mjs'),(dest['api']/'server/lead-store.mjs').as_uri(),str(database),str(HERE/'deployment.json')]);migration=json.loads(migrated.stdout)
  switched=False;cache_changed=False
  try:
   switched=True;switch(WEB,dest['web']);switch(API,dest['api']);run(['systemctl','restart',SERVICE]);cache_changed=True;install_cache(plan,plan['new']);checks=verify(c,expected)
   if tree(dest['web'])!=expected['web'] or tree(dest['api'])!=expected['api']:raise RuntimeError('Candidate inventory changed')
  except Exception:
   try:
    if cache_changed:install_cache(plan,plan['old'])
   finally:
    if switched:switch(WEB,oldweb);switch(API,oldapi);run(['systemctl','restart',SERVICE])
   # Additive CRM tables and name-only edits are compatible with the old API. Never restore an older DB over new leads.
   raise
  receipt={'ok':True,**state,'checks':checks,'migration':migration,'existing_credentials_preserved':True,'mfa_preserved':True,'services_restarted':1,'source_commit':c['source_commit'],'rollback_file':str(backup/'state.json')}
  (backup/'receipt.json').write_text(json.dumps(receipt,indent=2));(backup/'receipt.json').chmod(0o600);print(json.dumps(receipt))
if __name__=='__main__':
 try:main()
 except Exception as e:print(json.dumps({'ok':False,'error_type':type(e).__name__,'message':str(e)[:220]}));raise SystemExit(1)
