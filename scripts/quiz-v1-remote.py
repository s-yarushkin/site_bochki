"""Guarded quiz-only deployment. No in-place production file edits, no SQLite restore."""
from __future__ import annotations
import argparse, hashlib, json, os, fcntl, re, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request, zipfile
from pathlib import Path, PurePosixPath

WEB = Path('/srv/sites/dachapar-preview/current')
API = Path('/srv/services/garant-bani-relay/current')
W_RELEASES, A_RELEASES = WEB.parent / 'releases', API.parent / 'releases'
DB = Path('/var/lib/garant-bani-relay/leads.sqlite')
BACKUPS = Path('/var/backups/dachapar')
LOCK = '/run/lock/dachapar-quiz.lock'
CSS_ANCHOR = '<link href="/r100-journey.css?v=r100-20261027" rel="stylesheet"/>'
CSS_INSERT = '<link href="/quiz.css?v=dpq-20261031" rel="stylesheet"/>'
JS_INSERT = '<script src="/quiz.mjs?v=dpq-20261031" type="module"></script>'
API_IMPORT = "import {validQuizCatalogRequest} from './quiz-channel-policy.mjs';"
API_PATCHES = (
  (
    "  const planInfo=value.purpose==='plan_info';\n"
    "  if(value.purpose!==undefined&&!planInfo)throw new Error('INVALID_PURPOSE');\n"
    "  if(planInfo&&(value.flow!=='callback'||!['telegram','max'].includes(contactChannel)))throw new Error('INVALID_PLAN_REQUEST_CHANNEL');\n"
    "  if(value.flow==='callback' && contactChannel!=='phone'&&!planInfo)throw new Error('CALLBACK_MUST_BE_PHONE');",
    "  const planInfo=value.purpose==='plan_info';\n"
    "  const quizCatalog=value.purpose==='quiz_catalog';\n"
    "  if(value.purpose!==undefined&&!planInfo&&!quizCatalog)throw new Error('INVALID_PURPOSE');\n"
    "  if(planInfo&&(value.flow!=='callback'||!['telegram','max'].includes(contactChannel)))throw new Error('INVALID_PLAN_REQUEST_CHANNEL');\n"
    "  if(quizCatalog&&!validQuizCatalogRequest(value,contactChannel))throw new Error('INVALID_QUIZ_REQUEST');\n"
    "  if(value.flow==='callback' && contactChannel!=='phone'&&!planInfo&&!quizCatalog)throw new Error('CALLBACK_MUST_BE_PHONE');",
  ),
  (
    "  const context=validateJourneyContext(value.journeyContext,value.flow,{finishLabels,roofLabels});if(context)lead.journeyContext=context;\n  if(planInfo){",
    "  const context=validateJourneyContext(value.journeyContext,value.flow,{finishLabels,roofLabels});if(context)lead.journeyContext=context;\n  if(quizCatalog)lead.purpose='quiz_catalog';\n  if(planInfo){",
  ),
  (
    "    'Тип: '+(lead.purpose==='plan_info'?'Подробности о планировке':lead.flow==='quote'?'Расчёт бани':'Обратный звонок'),",
    "    'Тип: '+(lead.purpose==='plan_info'?'Подробности о планировке':lead.purpose==='quiz_catalog'?'Подбор бань: планировки и комплектации':lead.flow==='quote'?'Расчёт бани':'Обратный звонок'),",
  ),
)

def abort(message): raise RuntimeError('QUIZ_RELEASE_STOP: '+message)
def sha(data): return hashlib.sha256(data).hexdigest()
def file_sha(path): return sha(path.read_bytes())
def guarded(root, rel):
    p=PurePosixPath(rel)
    if not rel or p.is_absolute() or '..' in p.parts or ':' in rel or '\\' in rel: abort('unsafe package path')
    target=root.joinpath(*p.parts)
    if target.is_symlink() or any(x.is_symlink() for x in list(target.parents)[:len(p.parts)-1]):
        abort('symlink in package path '+rel)
    return target
def active(link, folder):
    if not link.is_symlink(): abort('active path is not a symlink: '+str(link))
    target=link.resolve(strict=True)
    if target.parent!=folder or not target.is_dir(): abort('active release outside expected folder')
    return target
def switch(link, target):
    if target.parent!=link.parent/'releases' or not target.is_dir(): abort('unsafe release target')
    tmp=link.with_name(link.name+'.quiz-switch')
    if tmp.exists() or tmp.is_symlink(): abort('pending switch exists')
    tmp.symlink_to(target)
    os.replace(tmp,link)
def clone(src,dst):
    if dst.exists(): abort('stage already exists: '+str(dst))
    shutil.copytree(src,dst,symlinks=True)
    # Service-private files must retain the owner/group of the active release.
    for p in [src,*src.rglob('*')]:
        target=dst/p.relative_to(src); st=p.lstat()
        os.chown(target,st.st_uid,st.st_gid,follow_symlinks=False)
def patch_site(html):
    if CSS_INSERT in html or JS_INSERT in html: abort('quiz already installed: check active release before applying')
    if html.count(CSS_ANCHOR)!=1 or html.count('</body>')!=1: abort('unexpected live home page version')
    return html.replace(CSS_ANCHOR,CSS_ANCHOR+CSS_INSERT).replace('</body>',JS_INSERT+'\n</body>')
def patch_api(src):
    if API_IMPORT in src or "const quizCatalog=value.purpose==='quiz_catalog';" in src:
        abort('quiz API already present; do not duplicate patch')
    if "import {validateJourneyContext" not in src: abort('unrecognized relay imports')
    for before,after in API_PATCHES:
        if src.count(before)!=1: abort('API contract drift: required context was not found exactly once')
        src=src.replace(before,after)
    return API_IMPORT+'\n'+src
def health():
    for _ in range(12):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=2) as resp:
                if json.load(resp).get('ok') is True:return
        except Exception: time.sleep(.5)
    abort('service health failed')
def check_staged(rootweb,rootapi,manifest,files,static_patched,api_patched):
    for rel,expected in files.items():
        area,p=rel.split('/',1)
        root=rootweb if area=='web' else rootapi
        if file_sha(guarded(root,p))!=expected['sha256']: abort('staged file mismatch '+rel)
    for p,expected in manifest['protectedWeb'].items():
        if file_sha(guarded(rootweb,p))!=expected: abort('protected web changed during staging '+p)
    if file_sha(rootweb/'index.html')!=sha(static_patched.encode()):abort('staged index mismatch')
    if file_sha(rootapi/'server/garant-bani-relay.mjs')!=sha(api_patched.encode()):abort('staged relay mismatch')
    for f in ['quiz.mjs','quiz-engine.mjs']:
        subprocess.run(['node','--check',str(rootweb/f)],check=True)
    subprocess.run(['node','--check',str(rootapi/'server/garant-bani-relay.mjs')],check=True)
def load_bundle(here):
    path=here/'payload.zip'; manifest=json.loads((here/'manifest.json').read_text('utf8'))
    if not re.fullmatch(r'DPQUIZ-[0-9a-f]{12}',manifest.get('release','')):abort('release name invalid')
    if file_sha(path)!=manifest['payloadSha256']:abort('payload SHA mismatch')
    with zipfile.ZipFile(path) as z:
        files=manifest['files']
        if set(z.namelist())!=set(files):abort('ZIP file list mismatch')
        data={}
        for name,meta in files.items():
            if not name.startswith(('web/','api/')):abort('invalid bundle namespace')
            area,rel=name.split('/',1)
            guarded(Path('/tmp/'+area),rel)
            blob=z.read(name)
            if sha(blob)!=meta['sha256']:abort('tampered file '+name)
            data[name]=blob
    return manifest,files,data
def preflight(here):
    manifest,files,blobs=load_bundle(here)
    current_web,current_api=active(WEB,W_RELEASES),active(API,A_RELEASES)
    for name,digest in manifest['protectedWeb'].items():
        if file_sha(guarded(current_web,name))!=digest:abort('live WEB drift: '+name)
    for p in ['quiz.mjs','quiz.css','quiz-engine.mjs','data/quiz-v1.json']:
        if (current_web/p).exists():abort('quiz file already exists: '+p)
    if (current_api/'server/quiz-channel-policy.mjs').exists():abort('quiz policy already exists; inspect prior release')
    text=patch_site((current_web/'index.html').read_text('utf8'))
    api_text=patch_api((current_api/'server/garant-bani-relay.mjs').read_text('utf8'))
    for f in ['index.html','lead-client.mjs','phone-mask.mjs','analytics-runtime.mjs','data/site-settings.json']:
        if not (current_web/f).is_file():abort('required site dependency missing: '+f)
    for name,expected in manifest.get('additionalWeb',{}).items():
        if file_sha(guarded(current_web,name))!=expected:abort('dependency drift '+name)
    for key in files:
        area,path=key.split('/',1)
        root=current_web if area=='web' else current_api
        if (root/path).exists():abort('would overwrite an existing file: '+key)
    return manifest,files,blobs,current_web,current_api,text,api_text
def stage_release(result):
    m,files,blobs,oldweb,oldapi,html,api_text=result
    release=m['release'];newweb=W_RELEASES/release;newapi=A_RELEASES/release
    if newweb.exists() != newapi.exists():abort('incomplete prior stage')
    if not newweb.exists():
        clone(oldweb,newweb);clone(oldapi,newapi)
        try:
            for key,blob in blobs.items():
                area,rel=key.split('/',1);target=guarded(newweb if area=='web' else newapi,rel)
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(blob);target.chmod(0o644)
            (newweb/'index.html').write_text(html,'utf8')
            (newapi/'server/garant-bani-relay.mjs').write_text(api_text,'utf8')
            # Ownership follows each existing source file (avoid changing service access).
            for target,source in [(newweb/'index.html',oldweb/'index.html'),(newapi/'server/garant-bani-relay.mjs',oldapi/'server/garant-bani-relay.mjs')]:
                st=source.stat();os.chown(target,st.st_uid,st.st_gid)
            for key in blobs:
                area,rel=key.split('/',1);target=(newweb if area=='web' else newapi)/rel
                st=(oldweb if area=='web' else oldapi).stat();os.chown(target,st.st_uid,st.st_gid)
        except Exception:
            # Never leave a partially prepared release that looks ready.
            shutil.rmtree(newweb,ignore_errors=True);shutil.rmtree(newapi,ignore_errors=True);raise
    check_staged(newweb,newapi,m,files,html,api_text)
    # Import and validate the real staged API with its private, installed dependencies.
    source="import {pathToFileURL} from 'node:url';const m=await import(pathToFileURL(process.argv[1]).href);for(const channel of ['max','whatsapp','telegram']){const p={flow:'callback',purpose:'quiz_catalog',contactChannel:channel,phone:'+79990000001',consent:true,consentVersion:'2026-10-21',consentMethod:'submit-button-v2',comment:'Quiz smoke only'};const lead=m.validateBaniLead(p);if(lead.contactChannel!==channel||lead.purpose!=='quiz_catalog')throw Error('QUIZ_API_CHANNEL_MISMATCH')}const ordinary={flow:'callback',contactChannel:'whatsapp',phone:'+79990000001',consent:true,consentVersion:'2026-10-21',consentMethod:'submit-button-v2'};let rejected=false;try{m.validateBaniLead(ordinary)}catch{rejected=true}if(!rejected)throw Error('ORDINARY_CALLBACK_WEAKENED');console.log('QUIZ_STAGED_API_SMOKE=PASS; no lead submitted')"
    subprocess.run(['node','--input-type=module','-e',source,str(newapi/'server/garant-bani-relay.mjs')],check=True)
    return newweb,newapi
def rollback(state_file):
    state_file=state_file.resolve(strict=True)
    if state_file.parent.parent!=BACKUPS or state_file.name!='state.json':abort('invalid rollback state')
    st=json.loads(state_file.read_text('utf8'))
    if active(WEB,W_RELEASES)!=Path(st['newWeb']) or active(API,A_RELEASES)!=Path(st['newApi']):
        abort('another release already active; manual intervention required')
    switch(API,Path(st['oldApi']));subprocess.run(['systemctl','restart','garant-bani-relay.service'],check=True);health()
    switch(WEB,Path(st['oldWeb']))
    print('QUIZ_ROLLED_BACK=PASS; lead database unchanged')
def main():
    ap=argparse.ArgumentParser()
    g=ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check',action='store_true');g.add_argument('--stage',action='store_true')
    g.add_argument('--apply',action='store_true');g.add_argument('--rollback',type=Path)
    a=ap.parse_args()
    if not a.check and os.geteuid()!=0:abort('sudo required to stage/apply/rollback')
    if a.rollback:
        rollback(a.rollback);return
    result=preflight(Path(__file__).resolve().parent)
    manifest=result[0]
    if a.check:
        # Validate the candidate script syntax without any production writes.
        with tempfile.TemporaryDirectory(prefix='dp-quiz-check-') as tmp:
            p=Path(tmp)/'garant-bani-relay.mjs';p.write_text(result[6],'utf8')
            subprocess.run(['node','--check',str(p)],check=True)
        print('QUIZ_PREFLIGHT=PASS; current releases: WEB='+result[3].name+' API='+result[4].name+'; SQLite untouched')
        return
    newweb,newapi=stage_release(result)
    if a.stage:
        print('QUIZ_STAGED=PASS; '+manifest['release']+'; active WEB/API unchanged');return
    # Apply: only after a complete stage and a read-only preflight.
    oldweb,oldapi=result[3],result[4]
    backup=BACKUPS/manifest['release']
    BACKUPS.mkdir(parents=True,exist_ok=True);backup.mkdir(mode=0o700,exist_ok=False)
    state={'oldWeb':str(oldweb),'oldApi':str(oldapi),'newWeb':str(newweb),'newApi':str(newapi)}
    (backup/'state.json').write_text(json.dumps(state,indent=2),'utf8');(backup/'state.json').chmod(0o600)
    with sqlite3.connect('file:'+str(DB)+'?mode=ro',uri=True) as origin,sqlite3.connect(backup/'leads-before.sqlite') as dest:
        origin.backup(dest)
    (backup/'leads-before.sqlite').chmod(0o600)
    try:
        switch(API,newapi)
        subprocess.run(['systemctl','restart','garant-bani-relay.service'],check=True);health()
        switch(WEB,newweb)
        if file_sha(WEB/'index.html')!=sha(result[5].encode()):abort('website not switched correctly')
    except Exception:
        if active(WEB,W_RELEASES)==newweb:switch(WEB,oldweb)
        if active(API,A_RELEASES)==newapi:
            switch(API,oldapi)
            subprocess.run(['systemctl','restart','garant-bani-relay.service'],check=True);health()
        raise
    print('QUIZ_DEPLOY=PASS; release='+manifest['release']+'; lead SQLite not replaced')
    print('ROLLBACK: sudo python3 '+str(Path(__file__).resolve())+' --rollback '+str(backup/'state.json'))
if __name__=='__main__':
    try:
        if '--check' in sys.argv:main()
        else:
            with open(LOCK,'a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                main()
    except Exception as e:
        print('QUIZ_DEPLOY_ERROR='+str(e))
        raise SystemExit(1)
