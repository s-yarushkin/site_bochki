#!/usr/bin/env python3
"""Update only two public legal pages using a separate reversible static release."""
import argparse,fcntl,hashlib,json,os,shutil,sys,urllib.request
from pathlib import Path
CURRENT=Path('/srv/sites/dachapar-preview/current')
EXPECTED='/srv/sites/dachapar-preview/releases/20261015-56bf8a1a82d2-v72'
OLD_HASHES={
 'privacy.html':{'e8bcf410311f1f42ec52c0fd575825ead3d9ccaf8a1be498bd7489195dc850ae','1a186d20df88812d0ac27fdc798db30bdc4683d020c645638e19e927cd1a6ade'},
 'requisites.html':{'2424b839b7d92d88c843d497d51dbb7663acd1d1eab5796689d290e1e1485f83','dcae82be98aca808369e7bb63fba46ac0861ed3758a8073a09f9ccbeaabb83c2'}
}
def require(ok,message):
 if not ok:raise RuntimeError(message)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def switch(target):
 temp=CURRENT.with_name('current.contact-tmp');temp.symlink_to(target);os.replace(temp,CURRENT)
def rollback(state):
 require(str(CURRENT.resolve())==state['new'],'CONCURRENT_STATIC_CHANGE')
 switch(state['old']);print('CONTACT_ROLLBACK=PASS')
def apply(directory,source_sha):
 require(len(source_sha)==40 and all(c in '0123456789abcdef' for c in source_sha),'INVALID_SHA')
 require(CURRENT.is_symlink() and str(CURRENT.resolve())==EXPECTED,'ACTIVE_FRONTEND_CHANGED')
 old=CURRENT.resolve()
 for name,hashes in OLD_HASHES.items():require(sha(old/name) in hashes,'EXISTING_PAGE_CHANGED: '+name)
 for name in OLD_HASHES:
  text=(directory/name).read_text()
  require('mailto:Vologdagarant@yandex.ru' in text,'CONTACT_MISSING: '+name)
 require('Автоматическое удаление заявок по расписанию сейчас не настроено.' in (directory/'privacy.html').read_text(),'RETENTION_TEXT_MISSING')
 new=old.parent/('20261015-contact-'+source_sha[:12])
 require(not new.exists(),'CONTACT_RELEASE_ALREADY_EXISTS')
 backup=Path('/var/backups/dachapar')/('contact-'+source_sha[:12])
 require(not backup.exists(),'CONTACT_BACKUP_ALREADY_EXISTS')
 backup.mkdir(mode=0o700)
 state={'old':str(old),'new':str(new),'sourceSha':source_sha}
 (backup/'state.json').write_text(json.dumps(state,indent=2))
 shutil.copyfile(__file__,backup/'installer.py')
 shutil.copytree(old,new,symlinks=True)
 for name in OLD_HASHES:shutil.copyfile(directory/name,new/name)
 # No other file may differ; the existing site entry point and all assets are preserved.
 for path in old.rglob('*'):
  if path.is_file() and path.relative_to(old).as_posix() not in OLD_HASHES:
   require(sha(path)==sha(new/path.relative_to(old)),'UNRELATED_STATIC_FILE_CHANGED')
 require(str(CURRENT.resolve())==str(old),'PREACTIVATION_STATIC_CHANGED')
 for name,hashes in OLD_HASHES.items():require(sha(old/name) in hashes,'PREACTIVATION_PAGE_CHANGED: '+name)
 switch(new)
 try:
  for name in OLD_HASHES:
   with urllib.request.urlopen('https://xn--80aaan1dh9b.xn--p1ai/'+name,timeout=15) as response:
    require(response.status==200,'PAGE_HTTP_FAILED')
    require(hashlib.sha256(response.read()).hexdigest()==sha(new/name),'LIVE_PAGE_BYTES_MISMATCH')
 except Exception:
  rollback(state);raise
 print('CONTACT_PAGES=PASS; EMAIL=Vologdagarant@yandex.ru; AUTO_DELETE=NOT_CONFIGURED')
 print('BACKEND_UNCHANGED=YES; PRODUCTION_SQLITE_WRITES=0; INDEXING_UNCHANGED=YES')
 print('ROLLBACK: sudo python3 '+str(backup/'installer.py')+' --rollback '+str(backup/'state.json'))
def main():
 p=argparse.ArgumentParser();p.add_argument('--directory',type=Path);p.add_argument('--source-sha');p.add_argument('--rollback',type=Path);a=p.parse_args()
 require(os.geteuid()==0,'ROOT_REQUIRED')
 with open('/run/lock/dachapar-v72.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if a.rollback:rollback(json.loads(a.rollback.read_text()))
  else:require(a.directory and a.source_sha,'SOURCE_REQUIRED');apply(a.directory,a.source_sha)
if __name__=='__main__':
 try:main()
 except Exception as error:print('CONTACT_UPDATE_STOPPED: '+str(error),file=sys.stderr);sys.exit(1)
