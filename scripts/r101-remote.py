"""Guarded web-only deployment. API, service, database and secrets are never changed."""
import argparse,fcntl,hashlib,json,os,re,shutil,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path,PurePosixPath
WEB=Path('/srv/sites/dachapar-preview/current');WEB_RELEASES=WEB.parent/'releases'
API=Path('/srv/services/garant-bani-relay/current');API_RELEASES=API.parent/'releases'
BACKUPS=Path('/var/backups/dachapar');ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
HERE=Path(__file__).resolve().parent
def fail(message):raise RuntimeError('R101_STOP: '+message)
def digest(data):return hashlib.sha256(data).hexdigest()
def checked(root,name):
    rel=PurePosixPath(name)
    if not rel.parts or rel.is_absolute() or '..' in rel.parts or ':' in name or '\\' in name:fail('unsafe path')
    target=root.joinpath(*rel.parts)
    for p in [target,*list(target.parents)[:len(rel.parts)-1]]:
        if p.is_symlink():fail('symlink inside web: '+name)
    return target
def active(link,parent):
    if not link.is_symlink():fail('current is not a symlink')
    result=link.resolve(strict=True)
    if result.parent!=parent or not result.is_dir():fail('active path outside releases')
    return result
def tree(root):
    result={}
    for p in root.rglob('*'):
        if p.is_symlink():fail('unexpected symlink in web')
        if p.is_file():result[p.relative_to(root).as_posix()]=digest(p.read_bytes())
    return result
def swap(destination):
    if destination.parent!=WEB_RELEASES or not destination.is_dir():fail('unsafe switch target')
    tmp=WEB.with_name('current.r101-switch')
    if tmp.exists() or tmp.is_symlink():fail('pending switch exists')
    tmp.symlink_to(destination);os.replace(tmp,WEB)
def health():
    with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=5) as r:
        if json.load(r).get('ok') is not True:fail('lead service is unhealthy')
def smoke(web,api):
    subprocess.run(['node',str(HERE/'r101-smoke.mjs'),str(web),str(api)],check=True,timeout=40)
def overlay(destination,manifest,archive):
    for entry in manifest['files']:
        path=checked(destination,entry['path']);path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(archive.read(entry['path']));path.chmod(0o644)
    for entry in manifest['remove']:checked(destination,entry['path']).unlink(missing_ok=True)
def final_files(manifest):
    result=dict(manifest['baselineWeb'])
    for e in manifest['files']:result[e['path']]=e['newSha256']
    for e in manifest['remove']:result.pop(e['path'],None)
    return result
def public_check(manifest):
    expected=final_files(manifest)
    for name in ['index.html','r101/site.mjs','r101/visual.css','data/site-settings.json','data/catalog-pricebook.json','robots.txt','manager.html']:
        path='/' if name=='index.html' else '/'+name
        request=urllib.request.Request(ORIGIN+path+'?release_check='+manifest['release'],headers={'Cache-Control':'no-cache','User-Agent':'DachaPar-release-check'})
        with urllib.request.urlopen(request,timeout=15) as response:
            if digest(response.read())!=expected[name]:fail('served file differs: '+name)
    health()
def validate(manifest,archive):
    if not re.fullmatch(r'R101-V3-[a-f0-9]{12}',manifest['release']):fail('invalid release name')
    if manifest['expectedWeb']!=str(WEB_RELEASES/'R100-CRO-0a7d323b55c3') or manifest['expectedApi']!=str(API_RELEASES/'R100-CRO-0a7d323b55c3'):fail('unexpected baseline')
    if digest((HERE/'payload.zip').read_bytes())!=manifest['payloadSha256']:fail('payload digest')
    names=[e['path'] for e in manifest['files']]
    if len(names)!=len(set(names)) or len(archive.namelist())!=len(names) or set(archive.namelist())!=set(names):fail('unexpected archive contents')
    if set(e['path'] for e in manifest['remove'])!={'assets/plans/r93/'+p+s+'.webp' for p in ['p9','p11'] for s in ['','_mirror']}:fail('unexpected removal')
    for e in manifest['files']:
        checked(Path('/tmp/r101-path-check'),e['path'])
        if digest(archive.read(e['path']))!=e['newSha256']:fail('archive entry digest')
    oldweb=active(WEB,WEB_RELEASES);oldapi=active(API,API_RELEASES)
    if str(oldweb)!=manifest['expectedWeb'] or str(oldapi)!=manifest['expectedApi']:fail('active release changed')
    if tree(oldweb)!=manifest['baselineWeb']:fail('public web changed after inventory')
    for n,h in manifest['protectedWeb'].items():
        if final_files(manifest).get(n)!=h or digest(checked(oldweb,n).read_bytes())!=h:fail('protected file differs: '+n)
    health();return oldweb,oldapi
def rollback(state_path):
    if os.geteuid()!=0:fail('sudo required')
    path=state_path.resolve(strict=True)
    if path.name!='state.json' or path.parent.parent!=BACKUPS:fail('invalid rollback file')
    state=json.loads(path.read_text())
    if active(WEB,WEB_RELEASES)!=Path(state['newWeb']) or active(API,API_RELEASES)!=Path(state['api']):fail('another release is active')
    old=Path(state['oldWeb'])
    if tree(old)!=state['oldFiles']:fail('rollback source changed')
    swap(old);health();print('ROLLED_BACK; API, database and notifications untouched')
def main():
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check',action='store_true');group.add_argument('--apply',action='store_true');group.add_argument('--rollback',type=Path)
    args=parser.parse_args()
    if args.rollback:return rollback(args.rollback)
    manifest=json.loads((HERE/'manifest.json').read_text())
    with zipfile.ZipFile(HERE/'payload.zip') as archive:
        oldweb,oldapi=validate(manifest,archive)
        if args.check:
            with tempfile.TemporaryDirectory(prefix='dachapar-r101-check-') as temp:
                candidate=Path(temp)/'web';shutil.copytree(oldweb,candidate);overlay(candidate,manifest,archive)
                if tree(candidate)!=final_files(manifest):fail('candidate inventory mismatch')
                smoke(candidate,oldapi)
            print('PREFLIGHT=PASS; web-only; protected='+str(len(manifest['protectedWeb']))+'; production unchanged');return
        if os.geteuid()!=0:fail('sudo required')
        with open('/run/lock/dachapar-r101.lock','w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            # Repeat after locking to avoid racing another release.
            oldweb,oldapi=validate(manifest,archive)
            newweb=WEB_RELEASES/manifest['release']
            if newweb.is_symlink():fail('stage must be a real directory')
            if newweb.exists():
                if tree(newweb)!=final_files(manifest):fail('existing stage differs')
            else:
                shutil.copytree(oldweb,newweb);overlay(newweb,manifest,archive)
            for p in [newweb,*newweb.rglob('*')]:
                os.chown(p,0,0);p.chmod(0o755 if p.is_dir() else 0o644)
            if tree(newweb)!=final_files(manifest):fail('staged web differs')
            smoke(newweb,oldapi)
            backup=BACKUPS/manifest['release'];backup.mkdir(parents=True,exist_ok=True,mode=0o700)
            state={'oldWeb':str(oldweb),'newWeb':str(newweb),'api':str(oldapi),'oldFiles':manifest['baselineWeb'],'release':manifest['release']}
            statepath=backup/'state.json';statepath.write_text(json.dumps(state,indent=2)+'\n');statepath.chmod(0o600)
            swap(newweb)
            try:public_check(manifest)
            except Exception:
                swap(oldweb);health();print('AUTOMATIC_ROLLBACK=PASS; public verification failed');raise
            print('DEPLOYED='+manifest['release']+'; WEB_ONLY; API_AND_DATABASE_UNCHANGED')
            print('rollback: sudo python3 '+str(HERE/'r101-remote.py')+' --rollback '+str(statepath))
if __name__=='__main__':main()
