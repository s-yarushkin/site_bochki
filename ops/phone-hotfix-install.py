#!/usr/bin/env python3
"""Static-only phone removal. Caddy, backend, legal pages and prices untouched."""
import argparse,fcntl,hashlib,json,os,re,shutil,sys,urllib.request
from pathlib import Path
CURRENT=Path('/srv/sites/dachapar-preview/current')
CADDY=Path('/etc/caddy/Caddyfile')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def require(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def switch(target):
 tmp=CURRENT.with_name('current.phone-tmp');tmp.symlink_to(target);os.replace(tmp,CURRENT)
def rollback(state):
 require(str(CURRENT.resolve())==state['new'],'ROLLBACK_STATIC_CONCURRENT_CHANGE')
 switch(state['old']);print('PHONE_ROLLBACK=PASS; legal pages and prices preserved')
def install(source,source_sha):
 require(re.fullmatch('[a-f0-9]{40}',source_sha),'INVALID_SOURCE_SHA')
 manifest=json.loads((source/'ops/phone-hotfix-manifest.json').read_text())
 require(CURRENT.is_symlink() and str(CURRENT.resolve())==manifest['expectedTarget'],'ACTIVE_STATIC_CHANGED')
 old=CURRENT.resolve();caddy_hash=sha(CADDY)
 for n,wanted in manifest['baseline'].items():require(sha(old/n)==wanted,'ACTIVE_FILE_CHANGED: '+n)
 for n in manifest['baseline']:
  p=source/n;require(p.is_file() and not p.is_symlink(),'INVALID_SOURCE: '+n)
  if n.endswith('.html') or n=='llms.txt':require(not re.search(r'tel:|telephone|293[- ]?46',p.read_text()),'PUBLIC_PHONE_REMAINS')
 new=old.parent/('20261016-phone-'+source_sha[:12]);backup=Path('/var/backups/dachapar')/('phone-'+source_sha[:12])
 require(not new.exists() and not backup.exists(),'RELEASE_ALREADY_ATTEMPTED')
 backup.mkdir(mode=0o700);shutil.copyfile(__file__,backup/'installer.py')
 state={'old':str(old),'new':str(new),'sourceSha':source_sha}
 (backup/'state.json').write_text(json.dumps(state,indent=2))
 shutil.copytree(old,new,symlinks=True)
 for n in manifest['baseline']:shutil.copyfile(source/n,new/n)
 for p in old.rglob('*'):
  if p.is_file() and p.relative_to(old).as_posix() not in manifest['baseline']:require(sha(p)==sha(new/p.relative_to(old)),'UNRELATED_STATIC_CHANGED')
 require(str(CURRENT.resolve())==str(old) and sha(CADDY)==caddy_hash,'PREACTIVATION_CHANGED')
 for n,wanted in manifest['baseline'].items():require(sha(old/n)==wanted,'PREACTIVATION_FILE_CHANGED')
 print('PHONE_PREFLIGHT=PASS; exact active static files; prices and legal pages preserved',flush=True)
 switch(new)
 try:
  for n in manifest['baseline']:
   url='/' if n=='index.html' else '/'+n.removesuffix('index.html') if n.endswith('/index.html') else '/'+n
   with urllib.request.urlopen(ORIGIN+url,timeout=20) as response:require(hashlib.sha256(response.read()).hexdigest()==sha(new/n),'LIVE_BYTES_MISMATCH: '+n)
  require(sha(CADDY)==caddy_hash,'CADDY_CHANGED_EXTERNALLY')
 except Exception:rollback(state);raise
 print('PHONE_REMOVAL=PASS; PUBLIC_PHONE=NONE; LEGAL_UNCHANGED=YES; PRICES_UNCHANGED=YES; BACKEND_UNCHANGED=YES')
 print('ROLLBACK: sudo python3 '+str(backup/'installer.py')+' --rollback '+str(backup/'state.json'))
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path);p.add_argument('--source-sha');p.add_argument('--rollback',type=Path);a=p.parse_args()
 require(os.geteuid()==0,'ROOT_REQUIRED')
 with open('/run/lock/dachapar-v72.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if a.rollback:rollback(json.loads(a.rollback.read_text()))
  else:require(a.source and a.source_sha,'SOURCE_REQUIRED');install(a.source,a.source_sha)
if __name__=='__main__':
 try:main()
 except Exception as error:print('PHONE_HOTFIX_STOPPED: '+str(error),file=sys.stderr);sys.exit(1)
