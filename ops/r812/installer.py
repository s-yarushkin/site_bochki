#!/usr/bin/env python3
"""R8.1.2 — exact-base stage-first visual comparison UX hotfix (WEB-only).
No server API/SQLite/MAX/manager writes, only stages new WEB copy and safely switches its symlink after explicit activation.
"""
import argparse, fcntl, hashlib, json, os, shutil, sys, time, urllib.request
from pathlib import Path
ROOT=Path('/srv/sites/dachapar-preview')
CURRENT=ROOT/'current'; RELEASES=ROOT/'releases'
API=Path('/srv/services/garant-bani-relay/current')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
BASE='CJM-R811-HERO-COPY-20261023-1792759364955844292'
API_EXPECTED='R73-LEGAL-db5d49445661-1792566478879449075'
PREFIX='CJM-R812-VISUAL-SELECT-20261023-'
HERE=Path(__file__).resolve().parent
MANIFEST=json.loads((HERE/'manifest.json').read_text(encoding='utf8'))
MODIFIED=MANIFEST['modified']

def check(ok,reason):
    if not ok:raise RuntimeError(reason)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def pointer(path):
    check(path.is_symlink(),'R812_POINTER_NOT_SYMLINK_'+str(path))
    result=path.resolve(strict=True)
    check(result.is_dir(),'R812_POINTER_TARGET_NOT_DIR')
    return result
def audit_path(path):return path.parent/(path.name+'.r812-audit.json')
def inventory(root):
    d={}
    for p in root.rglob('*'):
        check(not p.is_symlink(),'R812_NESTED_SYMLINK_'+str(p))
        if p.is_file():d[p.relative_to(root).as_posix()]=sha(p)
    return d
def check_api():
    api=pointer(API)
    check(api.name==API_EXPECTED,'R812_API_CHANGED_'+api.name)
    return api
def check_base(web,base_files):
    check(web.name==BASE,'R812_CURRENT_NOT_R811_'+web.name)
    for p,digest in {**MANIFEST['pin_r81_changed_sha256'],**MANIFEST['pin_unchanged_sha256']}.items():
        check(base_files.get(p)==digest,'R812_BASE_SHA_DRIFT_'+p)
    for p in MANIFEST['required_paths']:
        check(p in base_files,'R812_BASE_REQUIRED_MISSING_'+p)
    for p,m in MODIFIED.items():
        check(base_files.get(p)==m['before_sha256'],'R812_CHANGED_PRE_SHA_DRIFT_'+p)
def check_payload():
    check(MANIFEST['expected_active_release']==BASE and MANIFEST['fallback_release']==BASE,'R812_MANIFEST_BASE')
    check(set(MODIFIED)=={'index.html','bani/index.html','compare/index.html'},'R812_SCOPE')
    for p,m in MODIFIED.items():
        path=HERE/p
        check(path.is_file() and not path.is_symlink(),'R812_PAYLOAD_MISSING_'+p)
        check(sha(path)==m['after_sha256'],'R812_PAYLOAD_SHA_'+p)
        content=path.read_text(encoding='utf8')
        check(content.count('<h1')==1,'R812_MAIN_H1_'+p)
    home=(HERE/'index.html').read_text(encoding='utf8')
    compare=(HERE/'compare/index.html').read_text(encoding='utf8')
    catalog=(HERE/'bani/index.html').read_text(encoding='utf8')
    check('<a href="/compare/">Сравнить модели ↗</a>' not in home,'R812_HOME_COMPARE_PROMO')
    check('id="models"' in home and 'id="configure"' in home and 'id="relay-lead-form"' in home,'R812_HOME_FORM_CHANGED')
    check(compare.count('class="r812-card"')==4,'R812_VISUAL_CARDS')
    check('<details id="prices">' in compare and 'Одна длина — три модели' in compare,'R812_PRICE_TABLE_LOST')
    check('Подробная таблица размеров и цен' in catalog and 'Сравнить модели' not in catalog,'R812_CATALOG_COMPARE_PROMO')
    check('80% клиентов' not in home+compare+catalog,'R812_UNVERIFIED_MARKETING_CLAIM')

def base_check():
    check_payload()
    web=pointer(CURRENT);api=check_api()
    check(web.parent==RELEASES,'R812_INVALID_WEB_RELEASE_ROOT')
    src=inventory(web);check_base(web,src)
    check(shutil.disk_usage(ROOT).free>sum(p.stat().st_size for p in web.rglob('*') if p.is_file())+70*1024*1024,'R812_LOW_DISK')
    return web,api,src

def check_only_changes(before,after):
    check(set(before)==set(after),'R812_CHANGED_FILE_SET')
    differing={p for p in before if before[p]!=after[p]}
    check(differing==set(MODIFIED),'R812_UNEXPECTED_MODIFICATIONS_'+repr(sorted(differing)))
    for p,m in MODIFIED.items():check(after[p]==m['after_sha256'],'R812_STAGED_SHA_'+p)

def stage():
    web,api,src=base_check()
    target=RELEASES/(PREFIX+str(time.time_ns()))
    check(not target.exists(),'R812_TARGET_EXISTS')
    shutil.copytree(web,target)
    try:
        for f in MODIFIED:shutil.copy2(HERE/f,target/f)
        after=inventory(target);check_only_changes(src,after)
        check(CURRENT.resolve()==web and API.resolve()==api,'R812_STAGE_SOURCE_POINTER_CHANGED')
        audit={'name':'R8.1.2','base':str(web),'target':str(target),'api':str(api),'before':src,'after':after,'manifest_sha':sha(HERE/'manifest.json'),'files_changed':sorted(MODIFIED),'unix':int(time.time())}
        out=audit_path(target);out.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf8');out.chmod(0o600)
        print('R812_STAGE=PASS; WEB='+str(target)+'; FILES_CHANGED=3; PUBLIC_SWITCH=NO; API_UNCHANGED=YES',flush=True)
        print('R812_AUDIT='+str(out),flush=True)
    except BaseException:
        if target.exists():shutil.rmtree(target)
        raise

def flip(target):
    tmp=ROOT/('.current.r812.'+str(time.time_ns())+'.tmp')
    try:tmp.symlink_to(target);os.replace(tmp,CURRENT)
    finally:
        if tmp.is_symlink():tmp.unlink()
def get_public(path,expected):
    url=ORIGIN+'/'+(path[:-10] if path.endswith('index.html') else path)+'?r812='+str(time.time_ns())
    req=urllib.request.Request(url,headers={'User-Agent':'DachaPar-R812-get-only','Accept-Encoding':'identity','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=30) as res:
        check(res.status==200,'R812_HTTP_'+path)
        check(hashlib.sha256(res.read()).hexdigest()==expected,'R812_PUBLIC_SHA_'+path)
    print('R812_PUBLIC=PASS; PATH='+path,flush=True)

def activate(stage_path):
    web,api,src=base_check()
    target=Path(stage_path).resolve(strict=True)
    check(target.parent==RELEASES and target.name.startswith(PREFIX),'R812_WRONG_STAGE')
    a=audit_path(target);check(a.is_file(),'R812_STAGE_AUDIT_MISSING')
    data=json.loads(a.read_text(encoding='utf8'))
    check(data['base']==str(web) and data['api']==str(api) and data['target']==str(target),'R812_STAGE_BASE_MISMATCH')
    check(data['manifest_sha']==sha(HERE/'manifest.json'),'R812_MANIFEST_CHANGED_SINCE_STAGE')
    check(data['before']==src,'R812_BASE_DRIFT_SINCE_STAGE')
    after=inventory(target);check(after==data['after'],'R812_STAGE_DRIFT')
    check_only_changes(src,after)
    check(CURRENT.resolve()==web and API.resolve()==api,'R812_PRE_FLIP_POINTER_DRIFT')
    flip(target)
    try:
        for f in ['index.html','bani/index.html','compare/index.html','app.mjs','quote.mjs','lead-client.mjs','data/catalog-pricebook.json']:
            get_public(f,after[f])
        check(CURRENT.resolve()==target and API.resolve()==api,'R812_POST_FLIP_POINTER_DRIFT')
    except BaseException:
        if CURRENT.resolve()==target:
            flip(web);print('R812_AUTO_ROLLBACK=PASS; PREVIOUS='+str(web),flush=True)
        raise
    print('R812_DEPLOY=PASS; WEB='+str(target)+'; PREVIOUS='+str(web)+'; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_POSTS=0',flush=True)

def rollback():
    web=pointer(CURRENT);api=check_api();previous=RELEASES/BASE
    if web==previous:
        print('R812_ROLLBACK=ALREADY_R811; NO_WRITE=YES');return
    check(web.name.startswith(PREFIX),'R812_ROLLBACK_REFUSE_'+web.name)
    audit=audit_path(web);check(audit.is_file(),'R812_NO_AUDIT')
    data=json.loads(audit.read_text(encoding='utf8'))
    check(data['target']==str(web) and data['base']==str(previous),'R812_BAD_AUDIT')
    check(data['api']==str(api),'R812_API_DRIFT')
    check(inventory(web)==data['after'],'R812_PUBLISHED_FILES_DRIFT')
    check(inventory(previous)==data['before'],'R812_ROLLBACK_TARGET_DRIFT')
    check(CURRENT.resolve()==web and API.resolve()==api,'R812_ROLLBACK_POINTER_DRIFT')
    flip(previous)
    print('R812_ROLLBACK=PASS; WEB='+str(previous)+'; API_UNCHANGED=YES')

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--mode',required=True,choices=['status','preflight','stage','activate','rollback'])
    p.add_argument('--stage-path')
    a=p.parse_args()
    check(a.mode=='activate' or not a.stage_path,'R812_STAGE_PATH_ONLY_FOR_ACTIVATE')
    with (ROOT/'.gallery-r80.lock').open('a') as stream:
        fcntl.flock(stream.fileno(),fcntl.LOCK_EX)
        if a.mode=='status':
            print('R812_STATUS=PASS; WEB='+str(pointer(CURRENT))+'; API='+str(check_api())+'; READ_ONLY=YES')
        elif a.mode=='preflight':
            web,api,files=base_check();print('R812_PREFLIGHT=PASS; WEB='+str(web)+'; API='+str(api)+'; FILES='+str(len(files))+'; READ_ONLY=YES')
        elif a.mode=='stage':stage()
        elif a.mode=='activate':
            check(bool(a.stage_path),'R812_STAGE_PATH_REQUIRED');activate(a.stage_path)
        else:rollback()
if __name__=='__main__':
    try:main()
    except BaseException as e:
        print('R812_ABORT='+str(e),file=sys.stderr,flush=True);sys.exit(2)
