"""Additive MFA release, fixture HTTPS acceptance and consistent backup.
stdout includes one-time activation codes: capture only in the private terminal.
"""
import fcntl,hashlib,json,os,re,shutil,sqlite3,subprocess,sys,tarfile,time,urllib.request,urllib.error
from pathlib import Path,PurePosixPath
from importlib.machinery import SourceFileLoader
HERE=Path(__file__).resolve().parent;WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current');UNIT='garant-bani-relay.service';CADDY=Path('/etc/caddy/Caddyfile');DROP=Path('/etc/systemd/system/garant-bani-relay.service.d/91-mfa.conf');ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(data):return hashlib.sha256(data).hexdigest()
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,text=True,**kwargs)
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
def swap(link,target):
 if target.parent!=link.parent/'releases' or not target.is_dir():raise RuntimeError('Unsafe release target')
 pending=link.with_name('current.mfa-switch')
 if pending.exists() or pending.is_symlink():raise RuntimeError('Pending switch exists')
 pending.symlink_to(target);os.replace(pending,link)
def health():
 for _ in range(40):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=2) as r:
    if json.load(r).get('ok') is True:return
  except Exception:pass
  time.sleep(.25)
 raise RuntimeError('Service health failed')
def main():
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 lock=open('/run/lock/dachapar-crm-deploy.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 config=json.loads((HERE/'deployment.json').read_text());identity=config['id'];assert re.fullmatch('[a-f0-9]{12}',identity)
 oldweb=active(WEB);oldapi=active(API)
 if str(oldweb)!=config['expected_web'] or str(oldapi)!=config['expected_api']:raise RuntimeError('Another release is active')
 beforeweb=tree(oldweb);beforeapi=tree(oldapi)
 if beforeweb!=config['web_baseline'] or beforeapi!=config['api_baseline']:raise RuntimeError('Baseline inventory changed')
 if sha((HERE/'payload.tar.gz').read_bytes())!=config['payload_sha256']:raise RuntimeError('Package checksum mismatch')
 health();newweb=WEB.parent/'releases'/('MFA-'+identity);newapi=API.parent/'releases'/('MFA-'+identity)
 if newweb.exists() or newapi.exists():raise RuntimeError('Candidate release exists')
 shutil.copytree(oldweb,newweb);shutil.copytree(oldapi,newapi);expected={'web':dict(beforeweb),'api':dict(beforeapi)}
 with tarfile.open(HERE/'payload.tar.gz') as archive:
  if set(archive.getnames())!=set(config['overlay']):raise RuntimeError('Package members mismatch')
  for entry in archive.getmembers():
   path=PurePosixPath(entry.name)
   if not entry.isfile() or path.is_absolute() or '..' in path.parts or len(path.parts)<2 or path.parts[0] not in expected:raise RuntimeError('Unsafe package member')
   data=archive.extractfile(entry).read()
   if sha(data)!=config['overlay'][entry.name]:raise RuntimeError('Payload file checksum')
   kind=path.parts[0];name='/'.join(path.parts[1:]);target=(newweb if kind=='web' else newapi)/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o644);expected[kind][name]=sha(data)
 if tree(newweb)!=expected['web'] or tree(newapi)!=expected['api']:raise RuntimeError('Protected files changed')
 def contract(root):
  source=(root/'server/garant-bani-relay.mjs').read_text();return source[source.index('export function validateBaniLead'):source.index('function json(res')]
 if contract(newapi)!=contract(oldapi):raise RuntimeError('MAX/lead contract changed')
 for name in config['overlay']:
  if name.endswith(('.mjs','.js','.cjs')):run(['/usr/bin/node','--check',str((newweb if name.startswith('web/') else newapi)/name.split('/',1)[1])])
 run(['/usr/bin/node','--input-type=module','-e',"await import('file://'+process.argv[2])",'/usr/bin/node',str(newapi/'server/garant-bani-relay.mjs')])
 stage=None;switched=False;before_caddy=CADDY.read_text();previous_drop=DROP.read_bytes() if DROP.exists() else None;backup=None
 try:
  stage_module=SourceFileLoader('mfa_stage',str(HERE/'crm-remote-stage.py')).load_module();stage_module.main();stage=json.loads((HERE/'stage-ready.json').read_text())
  meta=None
  for _ in range(20):
   messages=run(['journalctl','-u',stage['unit'],'-o','cat','--no-pager']).stdout.splitlines();meta=next((json.loads(line) for line in reversed(messages) if line.startswith('{"url":')),None)
   if meta:break
   time.sleep(.2)
  if not meta:raise RuntimeError('Fixture startup receipt missing')
  result=run(['/usr/bin/node',stage['folder']+'/scripts/mfa-stage-check.mjs',stage['prefix']],input=json.dumps(meta));accept=json.loads(result.stdout.strip().splitlines()[-1]);assert accept['ok'] and accept['https_pass'] and accept['real_max_messages']==0
  (HERE/'stage-accepted.json').write_text(json.dumps(accept));
  run([sys.executable,str(HERE/'crm-production-audit.py')]);audit=json.loads((HERE/'audit-sanitized.json').read_text());backup=Path(audit['backup_path']);database=audit['database_path']
  if previous_drop is not None:(backup/'91-mfa.conf').write_bytes(previous_drop);(backup/'91-mfa.conf').chmod(0o600)
  (backup/'Caddyfile-before-mfa').write_text(before_caddy);(backup/'Caddyfile-before-mfa').chmod(0o600)
  with sqlite3.connect(database) as db:
   staff=list(db.execute('SELECT id,password_hash,active,must_change_password FROM staff_users ORDER BY id'));roles=list(db.execute('SELECT user_id,role_id FROM user_roles ORDER BY user_id,role_id'));leads={r[0]:sha(r[1].encode()) for r in db.execute('SELECT id,snapshot_json FROM leads')}
  migration=run(['/usr/bin/node',str(HERE/'mfa-migrate.mjs'),database,str(newapi)]);private=json.loads(migration.stdout.strip().splitlines()[-1]);assert private['ok']
  with sqlite3.connect(database) as db:
   if staff!=list(db.execute('SELECT id,password_hash,active,must_change_password FROM staff_users ORDER BY id')) or roles!=list(db.execute('SELECT user_id,role_id FROM user_roles ORDER BY user_id,role_id')):raise RuntimeError('Staff credentials or roles changed')
   for key,value in leads.items():
    r=db.execute('SELECT snapshot_json FROM leads WHERE id=?',(key,)).fetchone()
    if not r or sha(r[0].encode())!=value:raise RuntimeError('Existing lead changed')
   if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():raise RuntimeError('Database check failed')
  DROP.parent.mkdir(parents=True,exist_ok=True);DROP.write_text('[Service]\nEnvironment=CRM_MFA_REQUIRED=1\n');DROP.chmod(0o644)
  switched=True;swap(API,newapi);run(['systemctl','daemon-reload']);run(['systemctl','restart',UNIT]);health();swap(WEB,newweb)
  verified=[]
  for name,expected_hash in config['overlay'].items():
   if not name.startswith('web/'):continue
   public=name[4:]
   with urllib.request.urlopen(ORIGIN+'/'+public,timeout=20) as r:
    if sha(r.read())!=expected_hash:raise RuntimeError('Public checksum mismatch: '+public)
   verified.append(public)
  try:
   with urllib.request.urlopen(ORIGIN+'/api/manager/session',timeout=10) as r:raise RuntimeError('Anonymous session unexpectedly allowed')
  except urllib.error.HTTPError as error:
   if error.code!=401 or json.load(error).get('code')!='LOGIN_REQUIRED':raise RuntimeError('Anonymous session gate failed')
 except Exception:
  if switched:
   swap(WEB,oldweb);swap(API,oldapi)
   if previous_drop is None:DROP.unlink(missing_ok=True)
   else:DROP.write_bytes(previous_drop)
   run(['systemctl','daemon-reload']);run(['systemctl','restart',UNIT]);health()
  raise
 finally:
  # Remove only our exact temporary route; preserve any unrelated concurrent edit.
  if stage:
   current=CADDY.read_text();rule=f'handle_path {stage["prefix"]}/* {{\n        header X-Robots-Tag "noindex, nofollow, noarchive"\n        reverse_proxy 127.0.0.1:3302\n    }}\n    '
   if current.count(rule)==1:CADDY.write_text(current.replace(rule,''));run(['systemctl','reload','caddy'])
   run(['systemctl','stop',stage['unit']])
 # Only reached after every acceptance check. Store a public, secret-free receipt.
 receipt={'ok':True,'release':'MFA-'+identity,'web':str(newweb),'api':str(newapi),'previous_web':str(oldweb),'previous_api':str(oldapi),'backup':str(backup),'source_commit':config['source_commit'],'https_fixture':accept,'public_files_verified':verified,'protected_web_files':len(beforeweb)-sum(n.startswith('web/') and n[4:] in beforeweb for n in config['overlay']),'staff_credentials_preserved':True,'roles_preserved':True,'existing_leads_preserved':len(leads),'max_contract_unchanged':True,'mfa_required':True}
 (backup/'mfa-state.json').write_text(json.dumps(receipt,indent=2));(backup/'mfa-state.json').chmod(0o600)
 print(json.dumps({**receipt,'activationCodes':private['activationCodes']}))
if __name__=='__main__':
 try:main()
 except Exception as error:
  # Never echo subprocess stdout/stderr: a failed migration may contain credentials.
  print(json.dumps({'ok':False,'error_type':type(error).__name__,'message':str(error)[:200] if not isinstance(error,subprocess.CalledProcessError) else 'Server command failed; private details retained on server.','automatic_rollback_required':True}));sys.exit(1)
