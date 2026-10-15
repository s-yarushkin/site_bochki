#!/usr/bin/env python3
"""Scoped, fail-closed preview cutover. Run via the pinned PowerShell launcher.
No customer POSTs. Never restores/deletes production SQLite on rollback.
"""
import argparse, contextlib, fcntl, hashlib, json, os, re, shlex, shutil, sqlite3
import stat, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

HOST='xn--80aaan1dh9b.xn--p1ai'
OLD='xn----7sbbigeqcfm8bq.xn--p1ai'
EXPECTED_CADDY='f841de60facfd2bd1baac257902f0bb3d45409490e745dc2c948ccf442a1a49f'
OLD_WEB='/srv/sites/garant-bani-preview/releases/20261014-2f4502339060-v71-client'
OLD_API='/srv/services/garant-bani-relay/releases/20261012-7b7ffe2c3ed5-v66-relay'
CADDY=Path('/etc/caddy/Caddyfile')
API=Path('/srv/services/garant-bani-relay/current')
WEB=Path('/srv/sites/dachapar-preview/current')
DROP=Path('/etc/systemd/system/garant-bani-relay.service.d/72-dachapar.conf')
DB=Path('/var/lib/garant-bani-relay/leads.sqlite')
SERVICE='garant-bani-relay.service'
LEGACY_WEB=Path('/srv/sites/garant-bani-preview/current')
ENV_FILE=Path('/etc/garant-bani-preview/relay.env')
BACKUPS=Path('/var/backups/dachapar')

def run(*args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
def digest(data): return hashlib.sha256(data).hexdigest()
def require(value,message):
    if not value: raise RuntimeError(message)
def atomic_bytes(path,data,mode=0o644):
    temp=path.with_name(path.name+'.v72-tmp')
    with open(temp,'xb') as f:
        f.write(data); f.flush(); os.fsync(f.fileno())
    os.chmod(temp,mode); os.replace(temp,path)
def replace_caddy(data,mode,uid,gid):
    atomic_bytes(CADDY,data,mode)
    os.chown(CADDY,uid,gid)

def link(path,target):
    temp=path.with_name(path.name+'.v72-tmp')
    os.symlink(target,temp); os.replace(temp,path)
def response(url,host=None,expected=200):
    req=urllib.request.Request(url,headers={'Host':host} if host else {})
    try:
        with urllib.request.urlopen(req,timeout=15) as res:
            status=res.status; data=res.read(); headers=res.headers
    except urllib.error.HTTPError as e:
        status=e.code; data=e.read(); headers=e.headers
    require(status==expected,f'HTTP_EXPECTED_{expected}_GOT_{status}: {url}')
    return data,headers

def caddy_block(root):
    return f'''\n# DACHA_PAR_V72_PREVIEW_BEGIN\n{HOST} {{
    root * {root}
    header X-Robots-Tag "noindex, nofollow, noarchive"
    header Cache-Control "no-store"
    @private path /server /server/* /ops /ops/* /tests /tests/* /.git /.git/*
    respond @private 404
    handle /api/* {{
        reverse_proxy 127.0.0.1:3301
    }}
    handle /health {{
        reverse_proxy 127.0.0.1:3301
    }}
    handle /robots.txt {{
        respond "User-agent: *\\nDisallow: /\\n" 200
    }}
    handle {{
        file_server
    }}
}}
# DACHA_PAR_V72_PREVIEW_END\n'''.encode()

def verify_source(source,sha):
    manifest=json.loads((source/'V72-INSTALL-MANIFEST.json').read_text())
    require(manifest['sourceSha']==sha,'SOURCE_SHA_MISMATCH')
    for name,wanted in manifest['files'].items():
        p=source/name
        require(not p.is_symlink() and p.is_file() and p.resolve().is_relative_to(source),'UNSAFE_SOURCE_FILE')
        require(digest(p.read_bytes())==wanted,'SOURCE_HASH_MISMATCH: '+name)
    for required in ['index.html','server/garant-bani-relay.mjs','ops/v72-domain-install.py']:
        require(required in manifest['files'],'MANIFEST_FILE_MISSING')
    return manifest

def rollback(state):
    # Refuse to overwrite concurrent work, even during automatic recovery.
    require(digest(CADDY.read_bytes()) in [state['baselineCaddy'],state['candidateCaddy']], 'ROLLBACK_CADDY_CONCURRENT_CHANGE')
    require(str(API.resolve()) in [state['oldApi'],state['newApi']], 'ROLLBACK_API_CONCURRENT_CHANGE')
    if DROP.exists(): require(digest(DROP.read_bytes())==state['dropHash'],'ROLLBACK_DROPIN_CONCURRENT_CHANGE')
    if WEB.is_symlink(): require(str(WEB.resolve())==state['newWeb'],'ROLLBACK_WEB_CONCURRENT_CHANGE')
    replace_caddy(Path(state['backup'],'Caddyfile').read_bytes(),state['caddyMode'],state['caddyUid'],state['caddyGid'])
    link(API,state['oldApi'])
    if DROP.exists(): DROP.unlink() # only this release's new drop-in; no preexisting file is allowed
    if WEB.is_symlink(): WEB.unlink() # previous/new releases and old website are preserved
    run('systemctl','daemon-reload');run('systemctl','restart',SERVICE)
    run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile')
    run('systemctl','reload','caddy')
    response('http://127.0.0.1:3301/health')
    print('ROLLBACK=PASS; SQLite preserved; no DB restore performed')

def install(source,sha,apply):
    require(os.geteuid()==0,'ROOT_REQUIRED')
    require(re.fullmatch('[0-9a-f]{40}',sha),'INVALID_SOURCE_SHA')
    manifest=verify_source(source,sha)
    baseline=CADDY.read_bytes(); caddy_stat=CADDY.stat()
    require(digest(baseline)==EXPECTED_CADDY,'CADDY_BASELINE_CHANGED; fresh infrastructure review required')
    require(HOST.encode() not in baseline,'NEW_DOMAIN_ALREADY_PRESENT; review existing route')
    require(str(LEGACY_WEB.resolve())==OLD_WEB,'OLD_WEB_CHANGED')
    require(str(API.resolve())==OLD_API,'OLD_BACKEND_CHANGED')
    require(not DROP.exists(),'DROPIN_ALREADY_EXISTS')
    require(not WEB.exists() and not WEB.is_symlink(),'NEW_WEB_ALREADY_EXISTS')
    require(run('systemctl','is-active','caddy')=='active','CADDY_NOT_ACTIVE')
    require(run('systemctl','is-active',SERVICE)=='active','BACKEND_NOT_ACTIVE')
    unit=run('systemctl','cat',SERVICE)
    require('ExecStart=/usr/bin/node /srv/services/garant-bani-relay/current/server/garant-bani-relay.mjs' in unit,'UNEXPECTED_EXECSTART')
    require('LEADS_DB_PATH=/var/lib/garant-bani-relay/leads.sqlite' in unit,'UNEXPECTED_DATABASE_PATH')
    require('EnvironmentFile=/etc/garant-bani-preview/relay.env' in unit,'UNEXPECTED_ENV_FILE')
    env={}
    for line in ENV_FILE.read_text().splitlines():
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            key,val=line.split('=',1); parts=shlex.split(val)
            env[key]=' '.join(parts)
    require(env.get('ALLOWED_ORIGIN')=='https://'+OLD,'LEGACY_ORIGIN_CHANGED')
    require(env.get('SITE_BASE_PATH','/bani-preview/')=='/bani-preview/','LEGACY_COOKIE_PATH_CHANGED')
    require(env.get('PORT','3301')=='3301','BACKEND_PORT_CHANGED')
    require(not env.get('ADDITIONAL_SITES_JSON'),'ADDITIONAL_SITES_ALREADY_CONFIGURED')
    require(DB.is_file(),'DATABASE_MISSING')
    require(int(run('/usr/bin/node','-p','process.versions.node.split(".")[0]'))>=24,'NODE24_REQUIRED')
    run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile')
    response('http://127.0.0.1:3301/health')
    response('http://127.0.0.1:3301/api/manager/session',OLD,401)
    release='20261015-'+sha[:12]+'-v72'
    backup=BACKUPS/release
    require(not backup.exists(),'RELEASE_ALREADY_ATTEMPTED; inspect saved state')
    new_api=API.parent/'releases'/release
    new_web=WEB.parent/'releases'/release
    require(not new_api.exists() and not new_web.exists(),'STAGED_RELEASE_EXISTS')
    print('PREFLIGHT=PASS; exact Caddy, legacy links, backend health and 401 confirmed')
    if not apply:
        print('READ_ONLY=YES; rerun with --apply to install');return
    backup.mkdir(parents=True,mode=0o700);os.chmod(backup,0o700)
    (backup/'Caddyfile').write_bytes(baseline)
    (backup/'unit.txt').write_text(unit)
    (backup/'relay.env').write_bytes(ENV_FILE.read_bytes())
    with contextlib.closing(sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True)) as src:
        require(src.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_INTEGRITY_FAILED')
        with contextlib.closing(sqlite3.connect(backup/'leads.sqlite')) as dst:
            src.backup(dst)
            require(dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_BACKUP_FAILED')
    for root in [new_api,new_web]: root.mkdir(parents=True,mode=0o755)
    for name in manifest['files']:
        # Only deploy assets needed by the existing runtime, never tests/ops/source metadata.
        if name.startswith(('server/','assets/','data/')) or name in ['index.html','manager.html','privacy.html','consent.html','requisites.html']:
            dest=new_api/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,dest);os.chmod(dest,0o644)
            if not name.startswith('server/'):
                dest=new_web/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,dest);os.chmod(dest,0o644)
    # Fresh noindex protection in addition to the HTML meta and HTTP header.
    (new_web/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
    candidate=baseline+caddy_block(WEB)
    candidate_path=backup/'Caddyfile.candidate';candidate_path.write_bytes(candidate)
    require(candidate[:len(baseline)]==baseline,'EXISTING_CONFIG_CHANGED')
    run('caddy','validate','--config',str(candidate_path),'--adapter','caddyfile')
    additional=json.dumps([{'origin':'https://'+HOST,'basePath':'/'}],separators=(',',':'))
    drop=('[Service]\nEnvironment=\'ADDITIONAL_SITES_JSON='+additional+"'\n").encode()
    state={'sourceSha':sha,'backup':str(backup),'oldApi':OLD_API,'newApi':str(new_api),'newWeb':str(new_web),'baselineCaddy':digest(baseline),'candidateCaddy':digest(candidate),'dropHash':digest(drop),'caddyMode':stat.S_IMODE(caddy_stat.st_mode),'caddyUid':caddy_stat.st_uid,'caddyGid':caddy_stat.st_gid}
    (backup/'state.json').write_text(json.dumps(state,indent=2))
    shutil.copyfile(source/'ops/v72-domain-install.py',backup/'installer.py')
    # Last lease check immediately before activation; refuse competing deploys.
    require(digest(CADDY.read_bytes())==EXPECTED_CADDY and str(API.resolve())==OLD_API,'PREACTIVATION_BASELINE_CHANGED')
    try:
        DROP.parent.mkdir(parents=True,exist_ok=True);atomic_bytes(DROP,drop)
        link(API,new_api);link(WEB,new_web)
        run('systemctl','daemon-reload');run('systemctl','restart',SERVICE)
        response('http://127.0.0.1:3301/health')
        for host in [OLD,HOST]:response('http://127.0.0.1:3301/api/manager/session',host,401)
        replace_caddy(candidate,state['caddyMode'],state['caddyUid'],state['caddyGid'])
        run('systemctl','reload','caddy')
        # ACME may take time. HTTPS is verified with the system trust store, never -k.
        last=None
        for attempt in range(6):
            try:
                body,headers=response('https://'+HOST+'/')
                require('noindex' in headers.get('X-Robots-Tag',''),'NOINDEX_HEADER_MISSING')
                require('Дача Пар' in body.decode(),'WRONG_FRONTEND')
                last=None;break
            except Exception as error:
                last=error
                if attempt<5:time.sleep(10)
        if last:raise last
        for path in ['/privacy.html','/consent.html','/requisites.html','/assets/css/dachapar-v72.css','/assets/js/app.js','/assets/media-v5/hero-sun.webp']:
            response('https://'+HOST+path)
        response('https://'+HOST+'/health')
        response('https://'+HOST+'/api/manager/session',expected=401)
        # Both old static release and its exact Caddy bytes remain intact.
        require(str(LEGACY_WEB.resolve())==OLD_WEB,'OLD_SITE_CHANGED')
        require(CADDY.read_bytes().startswith(baseline),'EXISTING_CONFIG_CHANGED')
        run('caddy','validate','--config',str(CADDY),'--adapter','caddyfile')
        (backup/'result.json').write_text(json.dumps({'installed':True,'sourceSha':sha,'https':True,'realMaxDelivery':'NOT_TESTED','browserQA':'PENDING'},indent=2))
        print('DEPLOYED_PREVIEW=YES; HTTPS=PASS; OLD_SITE_PRESERVED=YES; REAL_MAX_DELIVERY=NOT_TESTED; BROWSER_QA=PENDING')
        print('ROLLBACK: sudo python3 '+str(backup/'installer.py')+' --rollback '+str(backup/'state.json'))
    except Exception:
        rollback(state)
        raise

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path);p.add_argument('--source-sha');p.add_argument('--apply',action='store_true');p.add_argument('--rollback',type=Path)
    a=p.parse_args()
    with open('/run/lock/dachapar-v72.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if a.rollback:
            require(os.geteuid()==0,'ROOT_REQUIRED');rollback(json.loads(a.rollback.read_text()))
        else:
            require(a.source and a.source_sha,'SOURCE_AND_SHA_REQUIRED')
            install(a.source.resolve(),a.source_sha,a.apply)
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('INSTALL_STOPPED: '+str(error),file=sys.stderr);sys.exit(1)
