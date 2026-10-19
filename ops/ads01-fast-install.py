#!/usr/bin/env python3
"""ADS-01 / V74 J fast, fail-closed synchronized WEB+API release.
No SQLite backup, copy, restore, checkpoint, schema change, or real lead POST.
Keep existing WEB/API release directories as instant rollback targets.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

WEB = Path('/srv/sites/dachapar-preview/current')
API = Path('/srv/services/garant-bani-relay/current')
DB = Path('/var/lib/garant-bani-relay/leads.sqlite')
CADDY = Path('/etc/caddy/Caddyfile')
ENV = Path('/etc/garant-bani-preview/relay.env')
SERVICE = 'garant-bani-relay.service'
ORIGIN = 'https://xn--80aaan1dh9b.xn--p1ai'
H_VERSION = '2026-10-19-v74-sheet-round-up-5000-r1'
ACTIVE_HASHES = {
    ('WEB', 'index.html'): '13ff99ea7670b4263b1075bd38944f76dae25e4b62fa7a22a044e820dac29f21',
    ('WEB', 'assets/js/app.js'): 'ddd65039c34a212661e1d32a463cace35607b0be907c25622677cbb673a95ad0',
    ('WEB', 'privacy.html'): '772753e3064cb2ed1d61c5b937e163cd52f1cc259593ca6d9d502b3d41958ee6',
    ('API', 'server/garant-bani-relay.mjs'): 'c96505738e2e7ba5776d61e1691295ae6f0d3e7c6862bb83852bb27627dcd3a0',
}
PAGES = (
    'bani/index.html', 'bani/kvadro/index.html',
    'bani/viking/index.html', 'bani/parus/index.html',
    'bani/kvadro-haus/index.html', 'dostavka-i-ustanovka/index.html',
    'voprosy/index.html', 'kontakty/index.html',
)
WEB_FILES = (
    'index.html', 'privacy.html', 'assets/js/app.js',
    'assets/js/analytics.js', 'assets/js/analytics-config.js',
    'assets/js/lead-consent.js',
    'data/catalog-pricebook.json', 'data/pricebook.js',
) + PAGES
API_FILES = (
    'server/garant-bani-relay.mjs',
    'server/ads01-conversion.mjs',
    'assets/js/lead-consent.js', 'assets/js/quote-engine.js',
    'data/catalog-pricebook.json', 'data/pricebook.js',
    'data/legacy-v73-catalog.json', 'data/legacy-v73-pricebook.js',
)
ALL_FILES = set(WEB_FILES) | set(API_FILES)

def require(ok, label):
    if not ok:
        raise RuntimeError(label)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(*cmd, timeout=50, cwd=None):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
    require(p.returncode == 0, 'COMMAND_FAILED_'+cmd[0]+'_'+(p.stderr or p.stdout)[-500:])
    return p.stdout.strip()

def request(url, expected=200):
    req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'DachaPar-ADS01-RC/1'})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            status, data=resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        status, data=exc.code, exc.read()
    require(status==expected,'HTTP_'+str(status)+'_EXPECTED_'+str(expected)+'_'+url)
    return data

def health():
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        try:
            request('http://127.0.0.1:3301/health')
            request(ORIGIN+'/api/manager/session',401)
            return
        except (RuntimeError,urllib.error.URLError,OSError,TimeoutError):
            time.sleep(.65)
    raise RuntimeError('SERVICE_HEALTH_TIMEOUT')

def target(current):
    require(current.is_symlink(),'CURRENT_NOT_SYMLINK_'+str(current))
    actual=current.resolve(strict=True)
    require(actual.parent == current.parent/'releases','RELEASE_PATH_CHANGED_'+str(current))
    require(actual.is_dir(),'RELEASE_DIRECTORY_MISSING')
    return actual

def current_state():
    old_web, old_api=target(WEB),target(API)
    for (role, rel), digest in ACTIVE_HASHES.items():
        base=old_web if role=='WEB' else old_api
        require((base/rel).is_file() and sha(base/rel)==digest,
                'ACTIVE_BASELINE_CHANGED_'+role+'_'+rel)
    for base in [old_web,old_api]:
        b=json.loads((base/'data/catalog-pricebook.json').read_text(encoding='utf8'))
        require(b.get('version')==H_VERSION,'ACTIVE_PRICE_VERSION_CHANGED')
        require(b.get('priceSource',{}).get('column')=='H','ACTIVE_PRICE_SOURCE_NOT_H')
    for missing in ['assets/js/analytics.js','assets/js/analytics-config.js']:
        require(not (old_web/missing).exists(),'ANALYTICS_ALREADY_PRESENT_'+missing)
    require(not (old_api/'server/ads01-conversion.mjs').exists(),'SERVER_CONVERSION_ALREADY_PRESENT')
    require(DB.is_file(),'DB_MISSING_DO_NOT_DEPLOY')
    require(CADDY.is_file() and ENV.is_file(),'CADDY_OR_ENV_MISSING')
    require(run('systemctl','is-active',SERVICE)=='active','SERVICE_INACTIVE')
    unit=run('systemctl','cat',SERVICE)
    require('garant-bani-relay/current/server/garant-bani-relay.mjs' in unit,'SERVICE_ENTRY_CHANGED')
    require(shutil.disk_usage(old_web.parent).free>350*1024**2,'LOW_DISK')
    health()
    return old_web,old_api,unit

def inventory(path):
    return {p.relative_to(path).as_posix():sha(p) for p in path.rglob('*') if p.is_file()}

def stage(old, new, source, allow):
    require(not new.exists() and not new.is_symlink(),'RELEASE_ALREADY_EXISTS')
    require(not any(p.is_symlink() for p in old.rglob('*')),'ACTIVE_RELEASE_HAS_NESTED_SYMLINK')
    shutil.copytree(old,new,copy_function=os.link)
    for name in allow:
        origin=source/name
        require(origin.is_file() and not origin.is_symlink(),'BAD_SOURCE_'+name)
        destination=new/name
        destination.parent.mkdir(parents=True,exist_ok=True)
        require(not destination.is_symlink(),'OVERLAY_SYMLINK_'+name)
        temp=destination.with_name(destination.name+'.ads01-part')
        require(not temp.exists() and not temp.is_symlink(),'LEFTOVER_PART_'+name)
        with open(temp,'xb') as stream:
            stream.write(origin.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp,0o644)
        os.replace(temp,destination)
    original,updated=inventory(old),inventory(new)
    for name,digest in original.items():
        if name not in allow:
            require(updated.get(name)==digest,'UNRELATED_FILE_CHANGED_'+name)
    require(set(updated)-set(original)<=set(allow),'UNEXPECTED_NEW_FILE')

def switch(current, new):
    temp=current.with_name('current.ads01-new')
    require(not temp.exists() and not temp.is_symlink(),'TEMP_LINK_OCCUPIED')
    temp.symlink_to(new)
    os.replace(temp,current)

def rollback(state):
    old_web, old_api = [Path(state[k]) for k in ('oldWeb','oldApi')]
    new_web, new_api = [Path(state[k]) for k in ('newWeb','newApi')]
    require(target(WEB) in (old_web,new_web),'WEB_CONCURRENT_CHANGE_NO_ROLLBACK')
    require(target(API) in (old_api,new_api),'API_CONCURRENT_CHANGE_NO_ROLLBACK')
    if WEB.resolve()!=old_web:
        switch(WEB,old_web)
    if API.resolve()!=old_api:
        switch(API,old_api)
        run('systemctl','restart',SERVICE,timeout=50)
    health()
    print('ADS01_ROLLBACK=PASS; SQLITE_UNCHANGED=YES; ORIGINAL_WEB_API_RESTORED=YES',flush=True)

def extract(archive, directory, expected_sha):
    require(archive.is_file() and not archive.is_symlink() and archive.stat().st_size<150*1024**2,'ARCHIVE_UNSAFE')
    with tarfile.open(archive,'r:gz') as f:
        require(f.pax_headers.get('comment')==expected_sha,'ARCHIVE_COMMIT_MISMATCH')
        seen=set()
        total=0
        for item in f:
            name=item.name
            parts=Path(name).parts
            require(name and not name.startswith('/') and '\\' not in name and '..' not in parts,'ARCHIVE_BAD_PATH')
            require(name not in seen and len(seen)<15000,'ARCHIVE_DUPLICATE')
            seen.add(name)
            require(item.isfile() or item.isdir(),'ARCHIVE_NONFILE')
            total+=item.size
            require(total<500*1024**2,'ARCHIVE_TOO_BIG')
            path=directory/name
            if item.isdir():
                path.mkdir(parents=True,exist_ok=True)
            else:
                path.parent.mkdir(parents=True,exist_ok=True)
                with f.extractfile(item) as src,open(path,'xb') as dst:
                    shutil.copyfileobj(src,dst)
                os.chmod(path,0o644)
    for name in ALL_FILES:
        require((directory/name).is_file(),'SOURCE_MISSING_'+name)

def verify_source(source):
    obj=json.loads((source/'data/catalog-pricebook.json').read_text(encoding='utf8'))
    require(obj.get('version')==H_VERSION and obj.get('priceSource',{}).get('column')=='J','NOT_APPROVED_J_PRICE')
    require((source/'assets/js/analytics-config.js').read_text(encoding='utf8').count('113675581')==1,'COUNTER_UNEXPECTED')
    adapter=(source/'assets/js/analytics.js').read_text(encoding='utf8')
    require('dp_premium_quote_confirmed' in adapter and 'dp_lead_confirmed' in adapter,'GOALS_MISSING')
    require('displayConsent' not in adapter and 'dp_analytics_consent_v1' not in adapter,'BANNER_UNEXPECTED')
    for f in ['assets/js/app.js','assets/js/analytics.js','assets/js/analytics-config.js','server/garant-bani-relay.mjs','server/ads01-conversion.mjs']:
        run('/usr/bin/node','--check',str(source/f),timeout=30)

def verify_staged(web,api):
    require(sha(web/'data/catalog-pricebook.json')==sha(api/'data/catalog-pricebook.json'),'PRICE_MISMATCH')
    require(sha(web/'data/pricebook.js')==sha(api/'data/pricebook.js'),'JS_PRICE_MISMATCH')
    for f in ['server/garant-bani-relay.mjs','server/ads01-conversion.mjs']:
        run('/usr/bin/node','--check',str(api/f))
    run('/usr/bin/node','--input-type=module','-e',"import('./server/garant-bani-relay.mjs').then(()=>console.log('RELAY_IMPORT_PASS'))",cwd=api,timeout=40)
    require('analytics.js' in (web/'assets/js/app.js').read_text(encoding='utf8'),'HOME_IMPORT_MISSING')
    for path in PAGES:
        require('src="/assets/js/analytics.js"' in (web/path).read_text(encoding='utf8'),'SEO_ANALYTICS_MISSING_'+path)
    print('ADS01_STAGED=PASS; PRICES=J; DB_WRITES=0; WEBVISOR=OFF; BANNERS=0',flush=True)

def verify_live(web, caddy_hash, env_hash, unit):
    for path in ('index.html', 'privacy.html', 'assets/js/app.js',
                 'assets/js/analytics.js','assets/js/analytics-config.js',
                 'data/catalog-pricebook.json')+PAGES:
        url='/'+path
        if path.endswith('index.html'):
            url='/'+path[:-len('index.html')]
        data=request(ORIGIN+url)
        require(hashlib.sha256(data).hexdigest()==sha(web/path),'LIVE_HASH_MISMATCH_'+path)
    request(ORIGIN+'/api/manager/session',401)
    require(sha(CADDY)==caddy_hash and sha(ENV)==env_hash,'INFRASTRUCTURE_CHANGED')
    require(run('systemctl','cat',SERVICE)==unit,'SERVICE_UNIT_CHANGED')
    print('ADS01_PUBLIC_HTTPS=PASS; 9_PAGES=PASS; PUBLISHED_MODULES=PASS; REAL_LEADS=0',flush=True)

def deploy(source,commit):
    old_web,old_api,unit=current_state()
    caddy_hash,env_hash=sha(CADDY),sha(ENV)
    source_book=json.loads((source/'data/catalog-pricebook.json').read_text('utf8'))
    require(source_book['priceSource']['column']=='J','SOURCE_NOT_J')
    nonce=str(time.time_ns())
    release='20261019-ads01-j-'+commit[:12]+'-'+nonce
    new_web=old_web.parent/release
    new_api=old_api.parent/release
    state={'sourceSha':commit,'oldWeb':str(old_web),'oldApi':str(old_api),
           'newWeb':str(new_web),'newApi':str(new_api),'caddySha':caddy_hash,'envSha':env_hash}
    changed=False
    try:
        stage(old_web,new_web,source,WEB_FILES)
        stage(old_api,new_api,source,API_FILES)
        verify_staged(new_web,new_api)
        require(WEB.resolve()==old_web and API.resolve()==old_api,'CONCURRENT_LINK_CHANGE')
        require(sha(CADDY)==caddy_hash and sha(ENV)==env_hash and run('systemctl','cat',SERVICE)==unit,'INFRA_CHANGE')
        for (role,name),digest in ACTIVE_HASHES.items():
            root=old_web if role=='WEB' else old_api
            require(sha(root/name)==digest,'BASELINE_CHANGED_DURING_STAGE')
        # The rollback program must remain available after temp extraction is deleted.
        retained=new_web/'ads01-fast-rollback-installer.py'
        shutil.copyfile(source/'ops/ads01-fast-install.py',retained)
        os.chmod(retained,0o600)
        state_file=new_web/'ads01-rollback-state.json'
        state_file.write_text(json.dumps(state,indent=2),encoding='utf8')
        os.chmod(state_file,0o600)
        switch(API,new_api)
        changed=True
        run('systemctl','restart',SERVICE,timeout=50)
        health()
        switch(WEB,new_web)
        verify_live(new_web,caddy_hash,env_hash,unit)
        print('ADS01_DEPLOY=PASS; SOURCE_SHA='+commit+'; DB_BACKUP=SKIPPED_OWNER_DECISION; DB_WRITES_BY_INSTALLER=0',flush=True)
        print('ROLLBACK_COMMAND=sudo python3 '+str(retained)+' --rollback '+str(state_file),flush=True)
    except BaseException:
        if changed:
            try:
                rollback(state)
            except Exception as err:
                print('ADS01_AUTO_ROLLBACK_FAILED='+str(err),file=sys.stderr,flush=True)
        raise

def main():
    import fcntl
    parser=argparse.ArgumentParser()
    parser.add_argument('--archive',type=Path)
    parser.add_argument('--archive-sha256')
    parser.add_argument('--source-sha')
    parser.add_argument('--rollback',type=Path)
    args=parser.parse_args()
    require(os.geteuid()==0,'SUDO_REQUIRED')
    with __import__('contextlib').ExitStack() as locks:
        for name in ('dachapar-v72.lock','dachapar-v73-unified.lock','dachapar-ads01.lock'):
            lock=locks.enter_context(open('/run/lock/'+name,'a'))
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.rollback:
            state=json.loads(args.rollback.read_text('utf8'))
            rollback(state)
            return
        require(bool(args.archive and args.archive_sha256 and args.source_sha),'SOURCE_PARAMS_REQUIRED')
        require(bool(re.fullmatch('[a-f0-9]{40}',args.source_sha)),'SHA_INVALID')
        require(bool(re.fullmatch('[a-f0-9]{64}',args.archive_sha256)),'ARCHIVE_HASH_INVALID')
        require(sha(args.archive)==args.archive_sha256,'ARCHIVE_HASH_MISMATCH')
        with tempfile.TemporaryDirectory(prefix='ads01-fast-') as tmp:
            source=Path(tmp)
            extract(args.archive,source,args.source_sha)
            verify_source(source)
            deploy(source,args.source_sha)

if __name__=='__main__':
    try:
        main()
    except BaseException as exc:
        print('ADS01_DEPLOY_STOPPED='+str(exc),file=sys.stderr,flush=True)
        sys.exit(1)
