#!/usr/bin/env python3
"""Dacha Par R8.1.1: guarded WEB-only copy hotfix for two homepage strings.

Only writes new immutable WEB release + atomically flips /srv/sites/dachapar-preview/current.
Never modifies API/DB/MAX, existing releases, pricebook or manager.
Default mode status; --mode deploy stages + verifies + switches + checks GET in ONE sudo process.
--mode rollback returns only this hotfix to its known R8.1 FIX2 source.
"""
import argparse,fcntl,hashlib,json,os,shutil,sys,time,urllib.request
from pathlib import Path
ROOT=Path('/srv/sites/dachapar-preview')
CURRENT=ROOT/'current'
API=Path('/srv/services/garant-bani-relay/current')
RELEASES=ROOT/'releases'
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
BASE='CJM-R81-20261023-1792748144511530110'
PREFIX='CJM-R811-HERO-COPY-20261023-'
EXPECTED_API='R73-LEGAL-db5d49445661-1792566478879449075'
HERE=Path(__file__).resolve().parent
MANIFEST=json.loads((HERE/'manifest.json').read_text(encoding='utf-8'))

def require(ok,message):
    if not ok: raise RuntimeError(message)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def pointer(p):
    require(p.is_symlink(),'R811_NOT_SYMLINK_'+str(p))
    val=p.resolve(strict=True)
    require(val.is_dir(),'R811_TARGET_NOT_DIR_'+str(val))
    return val

def inventory(path):
    values={}
    for p in path.rglob('*'):
        require(not p.is_symlink(),'R811_NESTED_SYMLINK_'+str(p))
        if p.is_file(): values[p.relative_to(path).as_posix()]=sha(p)
    return values

def source_pin(inventory_):
    changed=MANIFEST['pin_r81_changed_sha256'];unchanged=MANIFEST['pin_unchanged_sha256']
    for k,val in {**changed,**unchanged}.items():
        require(inventory_.get(k)==val,'R811_SOURCE_DRIFT_'+k)
    for k in MANIFEST['required_paths']:
        require(k in inventory_,'R811_REQUIRED_MISSING_'+k)
    require(inventory_.get('index.html')==MANIFEST['before_sha256'],'R811_SOURCE_INDEX_DRIFT')

def app_snapshot():
    web=pointer(CURRENT);api=pointer(API)
    require(api.name==EXPECTED_API,'R811_API_RELEASE_CHANGED_'+api.name)
    require(web.parent==RELEASES,'R811_INVALID_WEB_RELEASE_ROOT')
    return web,api

def validate_payload():
    require(MANIFEST['expected_active_release']==BASE,'R811_MANIFEST_BASE_UNEXPECTED')
    require(MANIFEST['fallback_release']==BASE,'R811_MANIFEST_ROLLBACK_UNEXPECTED')
    html=HERE/'index.html'
    require(html.is_file() and not html.is_symlink(),'R811_MISSING_PATCH')
    require(sha(html)==MANIFEST['after_sha256'],'R811_PATCH_SHA_MISMATCH')
    text=html.read_text(encoding='utf-8')
    require('Ваша баня. Ваше место тишины.' not in text,'R811_HERO_BADGE_PERSISTS')
    require('Все девять выполненных бань' not in text,'R811_WORKS_COUNT_PERSISTS')
    require('Смотреть реальные бани →' in text,'R811_NEW_WORKS_CTA_MISSING')
    require('id="hero"' in text and 'id="configure"' in text and 'id="relay-lead-form"' in text,'R811_CORE_DOM_CHANGED')
    return html

def audit_file(path):return path.parent/(path.name+'.r811-audit.json')
def flip(target):
    temporary=ROOT/('.current.r811.'+str(time.time_ns())+'.tmp')
    try:
        temporary.symlink_to(target)
        os.replace(temporary,CURRENT)
    finally:
        if temporary.is_symlink():temporary.unlink()

def public_get(relative,expected):
    address=ORIGIN+'/'+(relative[:-10] if relative.endswith('index.html') else relative)
    address+=('?r811='+str(time.time_ns()))
    req=urllib.request.Request(address,headers={'Cache-Control':'no-cache','Accept-Encoding':'identity','User-Agent':'DachaPar-R811-GET-ONLY'})
    with urllib.request.urlopen(req,timeout=30) as response:
        require(response.status==200,'R811_HTTP_ERROR_'+relative)
        require(hashlib.sha256(response.read()).hexdigest()==expected,'R811_PUBLIC_SHA_DRIFT_'+relative)
    print('R811_PUBLIC=PASS; PATH='+relative,flush=True)

def preflight():
    patch=validate_payload()
    web,api=app_snapshot()
    require(web.name==BASE,'R811_NOT_EXPECTED_R81_FIX2_'+web.name)
    before=inventory(web)
    source_pin(before)
    needed=sum(p.stat().st_size for p in web.rglob('*') if p.is_file())+70*1024*1024
    require(shutil.disk_usage(ROOT).free>needed,'R811_DISK_SPACE')
    return patch,web,api,before

def publish():
    patch,web,api,before=preflight()
    dest=RELEASES/(PREFIX+str(time.time_ns()))
    require(not dest.exists(),'R811_DESTINATION_EXISTS')
    shutil.copytree(web,dest,symlinks=False)
    switched=False
    try:
        shutil.copy2(patch,dest/'index.html')
        after=inventory(dest)
        require(set(before)==set(after),'R811_FILE_COUNT_CHANGED')
        difference={p for p in before if before[p]!=after[p]}
        require(difference=={'index.html'},'R811_EXTRA_CHANGES_'+repr(sorted(difference)))
        require(after['index.html']==MANIFEST['after_sha256'],'R811_STAGE_INDEX_SHA_DRIFT')
        require(CURRENT.resolve()==web and API.resolve()==api,'R811_SOURCE_CHANGED_DURING_COPY')
        audit={
            'release':'R8.1.1','before_release':str(web),'stage_release':str(dest),
            'before_api':str(api),'before_file_count':len(before),
            'before_index_sha256':MANIFEST['before_sha256'],
            'after_index_sha256':MANIFEST['after_sha256'],
            'files_changed':['index.html'],
            'manifest_sha256':sha(HERE/'manifest.json'),
            'created_at_unix':int(time.time())
        }
        a=audit_file(dest);a.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf8');a.chmod(0o600)
        print('R811_STAGE=PASS; ONLY=index.html; FILE_COUNT='+str(len(after))+'; WEB='+str(dest)+'; LIVE_UNCHANGED=YES',flush=True)
        require(CURRENT.resolve()==web and API.resolve()==api,'R811_POINTER_DRIFT_BEFORE_FLIP')
        flip(dest);switched=True
        try:
            public_get('index.html',after['index.html'])
            for p in ['app.mjs','quote.mjs','lead-client.mjs','data/catalog-pricebook.json','raboty/index.html']:
                public_get(p,after[p])
            require(CURRENT.resolve()==dest and API.resolve()==api,'R811_POINTER_DRIFT_AFTER_FLIP')
        except BaseException:
            if CURRENT.resolve()==dest:
                flip(web)
                print('R811_AUTO_ROLLBACK=PASS; RESTORED='+str(web),flush=True)
            raise
        print('R811_DEPLOY=PASS; WEB='+str(dest)+'; PREVIOUS='+str(web)+'; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_POSTS=0',flush=True)
    except BaseException:
        if not switched and dest.exists(): shutil.rmtree(dest)
        raise

def rollback():
    web,api=app_snapshot()
    if web.name==BASE:
        print('R811_ROLLBACK=ALREADY_R81_FIX2; NO_WRITE=YES',flush=True);return
    require(web.name.startswith(PREFIX),'R811_REFUSE_UNRELATED_RELEASE_'+web.name)
    a=audit_file(web)
    require(a.is_file(),'R811_ROLLBACK_AUDIT_MISSING')
    x=json.loads(a.read_text(encoding='utf8'))
    back=RELEASES/BASE
    require(x['stage_release']==str(web) and x['before_release']==str(back),'R811_AUDIT_NOT_FOR_THIS_HOTFIX')
    require(x['before_api']==str(api),'R811_API_CHANGED')
    require(sha(web/'index.html')==x['after_index_sha256'],'R811_LIVE_HOTFIX_DRIFT')
    require(sha(back/'index.html')==x['before_index_sha256'],'R811_PREVIOUS_HTML_DRIFT')
    require(CURRENT.resolve()==web and API.resolve()==api,'R811_ROLLBACK_LAST_SECOND_DRIFT')
    flip(back)
    print('R811_ROLLBACK=PASS; WEB='+str(back)+'; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES',flush=True)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--mode',required=True,choices=['status','preflight','deploy','rollback'])
    mode=ap.parse_args().mode
    with (ROOT/'.gallery-r80.lock').open('a') as stream:
        fcntl.flock(stream.fileno(),fcntl.LOCK_EX)
        if mode=='preflight':
            _,web,_,before=preflight()
            print('R811_PREFLIGHT=PASS; ACTIVE='+str(web)+'; 64_R81_SHAS=PASS; FILE_COUNT='+str(len(before))+'; WRITES=0')
        elif mode=='deploy':publish()
        elif mode=='rollback':rollback()
        else:
            web,api=app_snapshot()
            print('R811_STATUS=PASS; WEB='+str(web)+'; API='+str(api)+'; READ_ONLY=YES')
if __name__=='__main__':
    try:main()
    except BaseException as error:
        print('R811_ABORT='+str(error),file=sys.stderr,flush=True)
        sys.exit(2)
