"""Reviewed additive CRM deployment. Run as root after fixture HTTPS acceptance.

Never prints existing credentials or lead data. Generated staff passwords are returned
once to the private interactive installer, which removes them from saved results.
"""
import fcntl,hashlib,json,os,re,shutil,sqlite3,subprocess,sys,time,urllib.request,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent;ORIGIN='https://xn--80aaan1dh9b.xn--p1ai';HOST=ORIGIN[8:]
WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current');CADDY=Path('/etc/caddy/Caddyfile');UNIT='garant-bani-relay.service'
DROP=Path('/etc/systemd/system/garant-bani-relay.service.d/90-crm.conf')
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,text=True,**kwargs)
def sha(data):return hashlib.sha256(data).hexdigest()
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=sha(p.read_bytes())
 return result
def swap(link,target):
 if target.parent!=link.parent/'releases' or not target.is_dir():raise RuntimeError('Unsafe symlink target')
 pending=link.with_name('current.crm-switch')
 if pending.exists() or pending.is_symlink():raise RuntimeError('Pending switch exists')
 pending.symlink_to(target);os.replace(pending,link)
def health():
 for attempt in range(40):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=2) as response:
    if json.load(response).get('ok') is True:return
  except Exception:pass
  time.sleep(.25)
 raise RuntimeError('API health check failed')
def main():
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 lock=open('/run/lock/dachapar-crm-deploy.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 config=json.loads((HERE/'deployment.json').read_text());identity=config['id'];assert re.fullmatch('[a-f0-9]{12}',identity)
 stage=json.loads((HERE/'stage-ready.json').read_text());accepted=json.loads((HERE/'stage-accepted.json').read_text())
 if accepted.get('id')!=identity or accepted.get('https_pass') is not True or not stage.get('fixture_only'):raise RuntimeError('HTTPS acceptance required')
 oldweb=WEB.resolve(strict=True);oldapi=API.resolve(strict=True)
 if str(oldweb)!=config['expected_web'] or str(oldapi)!=config['expected_api']:raise RuntimeError('Active release changed since audit')
 if sha((HERE/'payload.tar.gz').read_bytes())!=config['payload_sha256']:raise RuntimeError('Payload checksum mismatch')
 for name,expected in config['api_baseline'].items():
  if sha((oldapi/name).read_bytes())!=expected:raise RuntimeError('Audited API changed: '+name)
 health();beforeweb=tree(oldweb);beforeapi=tree(oldapi)
 candidateweb=WEB.parent/'releases'/('CRM-'+identity);candidateapi=API.parent/'releases'/('CRM-'+identity)
 if candidateweb.exists() or candidateapi.exists():raise RuntimeError('Candidate exists')
 shutil.copytree(oldweb,candidateweb);shutil.copytree(oldapi,candidateapi)
 expectedweb=dict(beforeweb);expectedapi=dict(beforeapi)
 with tarfile.open(HERE/'payload.tar.gz') as archive:
  if set(archive.getnames())!=set(config['overlay']):raise RuntimeError('Unexpected package files')
  for entry in archive.getmembers():
   name=entry.name;parts=Path(name).parts
   if not entry.isfile() or Path(name).is_absolute() or '..' in parts or parts[0] not in ['web','api']:raise RuntimeError('Unsafe overlay')
   data=archive.extractfile(entry).read()
   if sha(data)!=config['overlay'][name]:raise RuntimeError('Overlay checksum mismatch')
   target=(candidateweb if parts[0]=='web' else candidateapi).joinpath(*parts[1:]);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o644)
   (expectedweb if parts[0]=='web' else expectedapi)['/'.join(parts[1:])]=sha(data)
 if tree(candidateweb)!=expectedweb or tree(candidateapi)!=expectedapi:raise RuntimeError('Protected files changed')
 # Preserve validation, formatting, MAX delivery and secret loading byte-for-byte.
 def max_contract(base):
  source=(base/'server/garant-bani-relay.mjs').read_text();return source[source.index('export function validateBaniLead'):source.index('function json(res')]
 if max_contract(oldapi)!=max_contract(candidateapi):raise RuntimeError('Existing MAX contract changed')
 for name in config['overlay']:
  if name.endswith(('.js','.mjs')):run(['/usr/bin/node','--check',str((candidateweb if name.startswith('web/') else candidateapi)/name.split('/',1)[1])])
 run(['/usr/bin/node','--input-type=module','-e',"await import('file://'+process.argv[2])",'/usr/bin/node',str(candidateapi/'server/garant-bani-relay.mjs')])
 # A fresh consistent WAL backup, with a tested isolated restore, immediately before migration.
 run([sys.executable,str(HERE/'crm-production-audit.py')]);audit=json.loads((HERE/'audit-sanitized.json').read_text());backup=Path(audit['backup_path'])
 shutil.copy2(CADDY,backup/'Caddyfile');(backup/'Caddyfile').chmod(0o600)
 previous_drop=DROP.read_bytes() if DROP.exists() else None
 if previous_drop is not None:(backup/'90-crm.conf').write_bytes(previous_drop)
 evidence=json.loads((HERE/'owner-auth.json').read_text());staff=json.loads((HERE/'staff-request.json').read_text())['managers']
 # Root bootstrap reads hashes and HMAC secret only locally. They never leave this process.
 entry="""import fs from 'node:fs';import {bootstrapCrm} from './server/crm-bootstrap.mjs';
const args=JSON.parse(fs.readFileSync(0,'utf8'));args.accounts=JSON.parse(fs.readFileSync('/etc/garant-bani-preview/manager-accounts.json','utf8'));args.sessionSecret=fs.readFileSync('/etc/garant-bani-preview/manager-session-secret','utf8').trim();console.log(JSON.stringify(bootstrapCrm(args)));"""
 database=audit['database_path'];original_leads={}
 with sqlite3.connect(database) as db:original_leads={row[0]:sha(row[1].encode()) for row in db.execute('SELECT id,snapshot_json FROM leads')}
 changed=False;caddy_before=CADDY.read_text();caddy_after=caddy_before
 try:
  boot=run(['/usr/bin/node','--input-type=module','-e',entry],cwd=candidateapi,input=json.dumps({'databasePath':database,'ownerEvidence':evidence,'staff':staff}));bootstrap=json.loads(boot.stdout)
  with sqlite3.connect(database) as db:
   for lead_id,digest in original_leads.items():
    row=db.execute('SELECT snapshot_json FROM leads WHERE id=?',(lead_id,)).fetchone()
    if not row or sha(row[0].encode())!=digest:raise RuntimeError('Existing lead changed')
   if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Database integrity failed')
   if db.execute('PRAGMA foreign_key_check').fetchall():raise RuntimeError('Database foreign keys failed')
  from importlib.machinery import SourceFileLoader
  stage_module=SourceFileLoader('crm_stage',str(HERE/'crm-remote-stage.py')).load_module();a,b=stage_module.block(caddy_before);stanza=caddy_before[a:b]
  # Remove the fixture rule and add only the required short-link proxy to this domain.
  prefix=stage['prefix'];rule=f'handle_path {prefix}/* {{\n        header X-Robots-Tag "noindex, nofollow, noarchive"\n        reverse_proxy 127.0.0.1:3302\n    }}\n    '
  if stanza.count(rule)!=1 or stanza.count('handle /api/* {')!=1:raise RuntimeError('Caddy stage route drift')
  stanza=stanza.replace(rule,'').replace('handle /api/* {','handle /go/* {\n        reverse_proxy 127.0.0.1:3301\n    }\n    handle /api/* {')
  caddy_after=caddy_before[:a]+stanza+caddy_before[b:];candidate=HERE/'caddy-final.conf';candidate.write_text(caddy_after);run(['caddy','validate','--config',str(candidate),'--adapter','caddyfile'])
  DROP.parent.mkdir(parents=True,exist_ok=True);DROP.write_text('[Service]\nEnvironment=CRM_ENABLED=1\nEnvironment=CRM_TRACKING_ENABLED=1\n');DROP.chmod(0o644)
  changed=True;swap(API,candidateapi);run(['systemctl','daemon-reload']);run(['systemctl','restart',UNIT]);health()
  swap(WEB,candidateweb);CADDY.write_text(caddy_after);run(['systemctl','reload','caddy'])
  # Read-only public receipts: no real test lead or MAX message is created.
  for name in [p[4:] for p in config['overlay'] if p.startswith('web/')]:
   with urllib.request.urlopen(ORIGIN+'/'+name,timeout=15) as response:
    if sha(response.read())!=config['overlay']['web/'+name]:raise RuntimeError('Public file mismatch: '+name)
  with urllib.request.urlopen(ORIGIN+'/api/analytics/config',timeout=10) as response:
   if json.load(response).get('enabled') is not True:raise RuntimeError('Public tracker config mismatch')
  try:urllib.request.urlopen(ORIGIN+'/api/manager/users',timeout=10);raise RuntimeError('Anonymous staff access')
  except urllib.error.HTTPError as error:
   if error.code!=401:raise
  result={'ok':True,'id':identity,'web':str(candidateweb),'api':str(candidateapi),'backup':str(backup),'existing_leads_preserved':len(original_leads),'protected_web_files':len(beforeweb)-sum(n.startswith('web/') and n[4:] in beforeweb for n in config['overlay']),'max_code_unchanged':True,'real_max_test_messages':0,'owner_id':bootstrap['ownerId'],'staff':bootstrap['staff'],'credentials':bootstrap['credentials'],'tracking_enabled':True,'caddy_validated':True,'database_integrity':'ok'}
  run(['systemctl','stop',stage['unit']]);saved={k:v for k,v in result.items() if k!='credentials'};(HERE/'deploy-result.json').write_text(json.dumps(saved,indent=2));(HERE/'deploy-result.json').chmod(0o644)
  for name in ['owner-auth.json','staff-request.json']:(HERE/name).unlink(missing_ok=True)
  print(json.dumps(result),flush=True)
 except Exception:
  if changed:
   swap(WEB,oldweb);swap(API,oldapi)
   if previous_drop is None:DROP.unlink(missing_ok=True)
   else:DROP.write_bytes(previous_drop)
   CADDY.write_text(caddy_before);run(['systemctl','daemon-reload']);run(['systemctl','restart',UNIT]);run(['systemctl','reload','caddy']);health()
  # Additive tables remain compatible. Never restore an old DB over newly received leads.
  raise
if __name__=='__main__':
 try:main()
 except Exception as error:print(json.dumps({'ok':False,'error_type':type(error).__name__,'message':str(error)[:400],'database_restore_performed':False}),flush=True);sys.exit(1)
