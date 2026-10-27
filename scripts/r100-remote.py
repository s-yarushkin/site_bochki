"""Guarded R100 overlay. Check/stage are separate from switching production symlinks."""
import argparse,hashlib,json,os,shutil,sqlite3,subprocess,time,urllib.request,zipfile,fcntl,re,tempfile
from pathlib import Path,PurePosixPath
WEB=Path('/srv/sites/dachapar-preview/current');API=Path('/srv/services/garant-bani-relay/current')
WEB_RELEASES=WEB.parent/'releases';API_RELEASES=API.parent/'releases'
EXPECTED_WEB=WEB_RELEASES/'R99-UX-1f26cd8d7ccd';EXPECTED_API=API_RELEASES/'R96-PLAN-INFO-004d95fb2255'
DB=Path('/var/lib/garant-bani-relay/leads.sqlite');BACKUPS=Path('/var/backups/dachapar')
def fail(message):raise RuntimeError('R100_STOP: '+message)
def digest(data):return hashlib.sha256(data).hexdigest()
def checked_file(root,relative):
 p=PurePosixPath(relative)
 if p.is_absolute() or '..' in p.parts or ':' in relative:fail('unsafe path')
 target=root.joinpath(*p.parts)
 if any(x.is_symlink() for x in [target,*list(target.parents)[:len(p.parts)-1]]):fail('symlink in overlay path '+relative)
 return target
def active(link,parent):
 if not link.is_symlink():fail('active path is not a symlink '+str(link))
 p=link.resolve(strict=True)
 if p.parent!=parent or not p.is_dir():fail('active path outside releases')
 return p
def swap(link,destination):
 if destination.parent!=link.parent/'releases' or not destination.is_dir():fail('invalid switch target')
 tmp=link.with_name(link.name+'.r100-switch')
 if tmp.exists() or tmp.is_symlink():fail('pending switch exists')
 tmp.symlink_to(destination);os.replace(tmp,link)
def health():
 for _ in range(10):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=2) as r:
    if json.load(r).get('ok') is True:return
  except Exception:time.sleep(.5)
 fail('relay health failed')
def restart():subprocess.run(['systemctl','restart','garant-bani-relay.service'],check=True);health()
def run_node(path):
 subprocess.run(['node','--check',str(path/'server/garant-bani-relay.mjs')],check=True)
 module=(path/'server/garant-bani-relay.mjs').as_uri()
 source="const m=await import("+json.dumps(module)+"); const lead=m.validateBaniLead({flow:'callback',phone:'+79990000001',consent:true,consentVersion:'2026-10-21',consentMethod:'submit-button-v2',journeyContext:{purpose:'photo',reference:{model:'kvadro',objectId:'timber-graphite',photoId:'kq-08'}}}); if(!m.formatBaniLead(lead).includes('kq-08'))throw Error('CONTEXT_SMOKE'); console.log('API_IMPORT_AND_CONTEXT=PASS; no lead submitted');"
 subprocess.run(['node','--input-type=module','-e',source],check=True)
def clone(source,destination):
 if destination.exists():fail('stage already exists '+str(destination))
 shutil.copytree(source,destination,symlinks=True)
 # Preserve owner/group as well as modes of private files in the existing API.
 for p in [source,*source.rglob('*')]:
  d=destination/p.relative_to(source);st=p.lstat();os.chown(d,st.st_uid,st.st_gid,follow_symlinks=False)
def main():
 args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');args.add_argument('--stage',action='store_true');args.add_argument('--apply',action='store_true');args.add_argument('--rollback',type=Path);a=args.parse_args()
 if sum([a.check,a.stage,a.apply,bool(a.rollback)])!=1:fail('choose exactly one mode')
 here=Path(__file__).resolve().parent
 if a.rollback:
  if os.geteuid()!=0:fail('sudo required')
  state_path=a.rollback.resolve()
  if state_path.parent.parent!=BACKUPS or state_path.name!='state.json':fail('invalid rollback state')
  state=json.loads(state_path.read_text())
  if active(WEB,WEB_RELEASES)!=Path(state['newWeb']) or active(API,API_RELEASES)!=Path(state['newApi']):fail('another release is active; manual review required')
  swap(API,Path(state['oldApi']));restart();swap(WEB,Path(state['oldWeb']));print('ROLLED_BACK; lead database was not restored or overwritten');return
 manifest=json.loads((here/'manifest.json').read_text());payload=here/'payload.zip'
 if digest(payload.read_bytes())!=manifest['payloadSha256']:fail('payload checksum mismatch')
 oldweb,oldapi=active(WEB,WEB_RELEASES),active(API,API_RELEASES)
 if (oldweb,oldapi)!=(EXPECTED_WEB,EXPECTED_API):fail('production has changed since R99/R96')
 roots={'web':oldweb,'api':oldapi}
 for name,expected in manifest['protectedWeb'].items():
  if digest(checked_file(oldweb,name).read_bytes())!=expected:fail('protected file changed '+name)
 for name,expected in manifest.get('protectedApi',{}).items():
  if digest(checked_file(oldapi,name).read_bytes())!=expected:fail('protected API calculation changed '+name)
 for entry in manifest['files']:
  target=checked_file(roots[entry['area']],entry['path']);actual=digest(target.read_bytes()) if target.is_file() else None
  if entry['oldSha256'] is not None and actual!=entry['oldSha256']:fail('source changed '+entry['area']+'/'+entry['path'])
  if entry['oldSha256'] is None and actual not in [None,entry['newSha256']]:fail('new file already exists with other contents '+entry['path'])
 for name,expected in manifest.get('requiredAssets',{}).items():
  if digest(checked_file(oldweb,name).read_bytes())!=expected:fail('referenced photo changed '+name)
 with zipfile.ZipFile(payload) as z:
  expected={e['area']+'/'+e['path']:e for e in manifest['files']}
  if set(z.namelist())!=set(expected):fail('unexpected payload members')
  for name,e in expected.items():
   if digest(z.read(name))!=e['newSha256']:fail('member checksum '+name)
  if a.check:
   # Test new API modules against actual installed dependencies in an isolated temp tree.
   with tempfile.TemporaryDirectory(prefix='dachapar-r100-check-') as tmp:
    check=Path(tmp);(check/'server').mkdir();(check/'data').mkdir();(check/'assets').symlink_to(oldapi/'assets')
    for folder in ['server','data']:
     for source in (oldapi/folder).iterdir():(check/folder/source.name).symlink_to(source)
    for name,e in expected.items():
     if e['area']!='api':continue
     target=checked_file(check,e['path']) if not (check/e['path']).is_symlink() else check/e['path']
     if target.is_symlink():target.unlink()
     target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name))
    run_node(check)
   print('PREFLIGHT=PASS; active WEB/API and protected prices unchanged; no production writes');return
  if os.geteuid()!=0:fail('sudo required for stage/apply')
  release=manifest['release']
  if not re.fullmatch(r'R100-CRO-[a-f0-9]{12}',release):fail('invalid release name')
  newweb=WEB_RELEASES/release;newapi=API_RELEASES/release
  if not newweb.exists() and not newapi.exists():
   clone(oldweb,newweb);clone(oldapi,newapi)
   for name,e in expected.items():
    target=checked_file(newweb if e['area']=='web' else newapi,e['path']);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name));target.chmod(0o644)
  for e in manifest['files']:
   target=checked_file(newweb if e['area']=='web' else newapi,e['path'])
   if digest(target.read_bytes())!=e['newSha256']:fail('staged member mismatch '+e['path'])
  run_node(newapi)
  for e in manifest['files']:
   if e['area']=='web' and e['path'].endswith(('.mjs','.js')):subprocess.run(['node','--check',str(newweb/e['path'])],check=True)
  if a.stage:print('STAGED='+release+'; production symlinks unchanged');return
  BACKUPS.mkdir(parents=True,exist_ok=True);backup=BACKUPS/release;backup.mkdir(mode=0o700,exist_ok=False)
  state={'oldWeb':str(oldweb),'oldApi':str(oldapi),'newWeb':str(newweb),'newApi':str(newapi),'payloadSha256':manifest['payloadSha256']}
  (backup/'state.json').write_text(json.dumps(state,indent=2));(backup/'state.json').chmod(0o600)
  with sqlite3.connect('file:'+str(DB)+'?mode=ro',uri=True) as source,sqlite3.connect(backup/'leads-before.sqlite') as dest:source.backup(dest)
  (backup/'leads-before.sqlite').chmod(0o600)
  try:
   swap(API,newapi);restart();swap(WEB,newweb)
   for name in manifest['protectedWeb']:
    if digest((WEB/name).read_bytes())!=manifest['protectedWeb'][name]:fail('protected contract after switch')
  except Exception:
   if active(WEB,WEB_RELEASES)==newweb:swap(WEB,oldweb)
   if active(API,API_RELEASES)==newapi:swap(API,oldapi);restart()
   raise
  print('DEPLOYED='+release+'; rollback: sudo python3 '+str(here/'r100-remote.py')+' --rollback '+str(backup/'state.json'))
if __name__=='__main__':
 try:
  # Serialize only mutation modes. A read-only preflight needs no root access.
  if '--check' in __import__('sys').argv:main()
  else:
   with open('/run/lock/dachapar-r100.lock','a') as lock:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);main()
 except Exception as e:print(str(e));raise SystemExit(1)
