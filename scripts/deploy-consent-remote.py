"""Hash-guarded consent/aggregate release. Passwords and customer data never leave server."""
import argparse,fcntl,hashlib,json,os,re,shutil,sqlite3,subprocess,tarfile,tempfile,time,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current')
DROP=Path('/etc/systemd/system/garant-bani-relay.service.d/92-aggregate.conf')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai';SERVICE='garant-bani-relay.service'
ALLOWED={
 'api/server/garant-bani-relay.mjs','api/server/crm-manager-api.mjs','api/server/crm-public-api.mjs','api/server/crm-insights.mjs','api/server/crm-aggregate.mjs',
 'web/journey-tracker.mjs','web/journey-tracker.css','web/analytics-core.mjs','web/privacy.html','web/assets/js/manager.js','web/crm/manager-extension.mjs','web/aggregate-actions.mjs','web/consent-banner.mjs','web/analytics-consent.html','web/crm/aggregate-report.mjs','web/index.html','web/assets/social/dachapar-parus-winter-20261106-v1.png'}
def sha(data):return hashlib.sha256(data).hexdigest()
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=sha(p.read_bytes())
 return result
def active(link):
 target=link.resolve(strict=True)
 if not link.is_symlink() or target.parent!=link.parent/'releases':raise RuntimeError('Unexpected active release')
 return target
def baseline(c):
 for kind,link in [('web',WEB),('api',API)]:
  target=active(link)
  if str(target)!=c['baseline'][kind] or tree(target)!=c['baseline'][kind+'_files']:raise RuntimeError('Production changed: '+kind)
 return active(WEB),active(API)
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,timeout=180,**kwargs)
def stage(dest,c):
 if sha((HERE/'payload.tar.gz').read_bytes())!=c['payload_sha256']:raise RuntimeError('Archive checksum mismatch')
 if not set(c['overlay']).issubset(ALLOWED):raise RuntimeError('Unapproved file in overlay')
 expected={k:dict(c['baseline'][k+'_files']) for k in ['web','api']}
 with tarfile.open(HERE/'payload.tar.gz') as tar:
  if len(tar.getmembers())!=len(c['overlay']) or set(tar.getnames())!=set(c['overlay']):raise RuntimeError('Archive inventory mismatch')
  for name,digest in c['overlay'].items():
   member=tar.getmember(name)
   if not member.isfile():raise RuntimeError('Unexpected archive member')
   data=tar.extractfile(member).read()
   if sha(data)!=digest:raise RuntimeError('File checksum mismatch')
   kind,rel=name.split('/',1);p=dest[kind]/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o644);expected[kind][rel]=digest
 for kind in ['web','api']:
  if tree(dest[kind])!=expected[kind]:raise RuntimeError('Protected inventory changed: '+kind)
 # Import the complete candidate API, including the live pricebook and conversion modules.
 run(['/usr/bin/node','--input-type=module','-e',"await import(process.argv[2]);",'/usr/bin/node',(dest['api']/'server/garant-bani-relay.mjs').as_uri()])
 for name in c['overlay']:
  if name.endswith(('.mjs','.js')):
   kind,rel=name.split('/',1);run(['/usr/bin/node','--check',str(dest[kind]/rel)])
 # Isolated migration, no live data or external delivery.
 script="""const {openAggregateCounters}=await import(process.argv[1]);
const s=openAggregateCounters(process.argv[2],{enabled:true});s.migrate();
if(!s.ready()||s.count({events:[{event_code:'dp_model_select',model_id:'kvadro'}],source:'direct',channel:'direct',page:'/'}).accepted!==1||s.report().rows[0].count!==1)throw Error('COUNTER_SMOKE');s.close();"""
 with tempfile.TemporaryDirectory(prefix='dachapar-counter-smoke-') as isolated:
  run(['/usr/bin/node','--input-type=module','-e',script,(dest['api']/'server/crm-aggregate.mjs').as_uri(),str(Path(isolated)/'fixture.sqlite')])
 return expected
def switch(link,target):
 if target.parent!=link.parent/'releases' or not target.is_dir():raise RuntimeError('Unsafe switch')
 pending=link.with_name('current.consent-switch')
 if pending.exists() or pending.is_symlink():raise RuntimeError('Pending switch exists')
 pending.symlink_to(target);os.replace(pending,link)
def request(path,method='GET',data=None,origin=ORIGIN):
 req=urllib.request.Request(origin+path,data=data,method=method,headers={'Origin':ORIGIN,'Content-Type':'application/json','User-Agent':'DachaPar-Release-Check/1.0'})
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as r:return r.code,r.read(),r.headers
def verify(expected):
 for _ in range(30):
  try:
   if request('/health',origin='http://127.0.0.1:3301')[0]==200:break
  except (OSError,TimeoutError):pass
  time.sleep(1)
 else:raise RuntimeError('API health check failed')
 status,data,_=request('/api/analytics/config');config=json.loads(data)
 if status!=200 or config.get('aggregate_enabled') is not True:raise RuntimeError('Aggregate config not enabled')
 status,_,_=request('/api/manager/aggregate-actions')
 if status!=401:raise RuntimeError('Manager endpoint authentication check failed')
 # Invalid lead and invalid counter body must be refused, never stored or delivered.
 status,_,_=request('/api/lead','POST',b'{}')
 if status!=400:raise RuntimeError('Lead validation failed')
 status,_,_=request('/api/analytics/counters','POST',b'{"events":[],"visitor_id":"forbidden"}')
 if status!=400:raise RuntimeError('Counter privacy validation failed')
 for name in ['index.html','manager.html','journey-tracker.mjs','consent-banner.mjs','aggregate-actions.mjs','analytics-consent.html','assets/js/manager.js','crm/manager-extension.mjs','crm/aggregate-report.mjs','assets/social/dachapar-parus-winter-20261106-v1.png']:
  status,data,headers=request('/' if name=='index.html' else '/'+name)
  if status!=200 or sha(data)!=expected['web'][name]:raise RuntimeError('Public checksum failed: '+name)
  if name.endswith('.png') and headers.get_content_type()!='image/png':raise RuntimeError('Image MIME mismatch')
 # Follow the existing public short-link path without sending a lead.
 status,data,_=request('/go/youtube-9df13f105a08')
 if status!=200 or sha(data)!=expected['web']['index.html']:raise RuntimeError('Short-link preview failed')
 return {'health':True,'aggregate_enabled':True,'manager_auth_required':True,'invalid_lead_rejected':True,'private_counter_fields_rejected':True,'public_hashes':True,'share_preview':True,'test_leads_sent':0,'max_messages_sent':0}
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--apply',action='store_true');args=p.parse_args()
 if args.check==args.apply:raise RuntimeError('Choose one operation')
 c=json.loads((HERE/'deployment.json').read_text());release=c['release']
 if not re.fullmatch('CONSENT-[a-f0-9]{12}',release):raise RuntimeError('Invalid release')
 oldweb,oldapi=baseline(c)
 # Both preflight and publication test an isolated copy before switching either link.
 with tempfile.TemporaryDirectory(prefix='dachapar-consent-check-') as temp:
  dest={k:Path(temp)/k for k in ['web','api']}
  for kind,old in [('web',oldweb),('api',oldapi)]:shutil.copytree(old,dest[kind])
  stage(dest,c)
 if args.check:print(json.dumps({'ok':True,'preflight':'PASS','files':len(c['overlay']),'database_touched':False}));return
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 with open('/run/lock/dachapar-crm-deploy.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);baseline(c)
  # Consistent online backup, integrity and isolated restore, kept on server only.
  run(['python3',str(HERE/'crm-production-audit.py')])
  audit=json.loads((HERE/'audit-sanitized.json').read_text())
  if audit['backup_integrity']!='ok' or audit['isolated_restore']!='PASS':raise RuntimeError('Backup validation failed')
  backup=Path('/var/backups/dachapar')/release;backup.mkdir(parents=True,mode=0o700,exist_ok=False)
  dest={'web':WEB.parent/'releases'/release,'api':API.parent/'releases'/release}
  for kind,old in [('web',oldweb),('api',oldapi)]:shutil.copytree(old,dest[kind])
  expected=stage(dest,c)
  database=Path(audit['database_path'])
  # This migration only creates two aggregate tables. No existing table is rewritten.
  run(['/usr/bin/node','--input-type=module','-e',"const {openAggregateCounters}=await import(process.argv[1]);const s=openAggregateCounters(process.argv[2],{enabled:true});s.migrate();if(!s.ready())throw Error('MIGRATION_FAILED');s.close();",(dest['api']/'server/crm-aggregate.mjs').as_uri(),str(database)])
  previous=DROP.read_bytes() if DROP.exists() else None
  state={'release':release,'previous_web':str(oldweb),'previous_api':str(oldapi),'web':str(dest['web']),'api':str(dest['api']),'database_backup':audit['backup_path'],'previous_dropin':previous.decode() if previous else None}
  (backup/'state.json').write_text(json.dumps(state,indent=2));(backup/'state.json').chmod(0o600)
  switched=False
  try:
   DROP.parent.mkdir(parents=True,exist_ok=True);DROP.write_text('[Service]\nEnvironment=CRM_AGGREGATE_ENABLED=1\n');DROP.chmod(0o644)
   switched=True;switch(WEB,dest['web']);switch(API,dest['api']);run(['systemctl','daemon-reload']);run(['systemctl','restart',SERVICE]);checks=verify(expected)
   for kind in ['web','api']:
    if tree(dest[kind])!=expected[kind]:raise RuntimeError('Candidate changed during verification')
  except Exception:
   if switched:
    switch(WEB,oldweb);switch(API,oldapi)
    if previous is None:DROP.unlink(missing_ok=True)
    else:DROP.write_bytes(previous)
    run(['systemctl','daemon-reload']);run(['systemctl','restart',SERVICE])
   # Never restore an old DB over leads received during publication.
   raise
  receipt={'ok':True,**state,'checks':checks,'files':len(c['overlay']),'source_commit':c['source_commit'],'existing_credentials_preserved':True,'mfa_preserved':True,'database_migration':'additive aggregate tables only','rollback_file':str(backup/'state.json')}
  (backup/'receipt.json').write_text(json.dumps(receipt,indent=2));(backup/'receipt.json').chmod(0o600);print(json.dumps(receipt))
if __name__=='__main__':
 try:main()
 except Exception as error:
  print(json.dumps({'ok':False,'error_type':type(error).__name__,'message':str(error)[:220]}));raise SystemExit(1)
