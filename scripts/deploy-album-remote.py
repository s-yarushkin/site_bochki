"""Apply the reviewed 96-file album overlay to an inventoried current web release.

Run --check as deploy, then --apply with sudo. Never modifies the lead service.
deployment.json and payload.zip must be placed beside this script.
"""
import argparse,concurrent.futures,fcntl,hashlib,json,os,re,shutil,struct,subprocess,tempfile,urllib.request,zipfile
from pathlib import Path,PurePosixPath

HERE=Path(__file__).resolve().parent
WEB=Path('/srv/sites/dachapar-preview/current')
RELEASES=WEB.parent/'releases'
API=Path('/srv/services/garant-bani-relay/current')
BACKUPS=Path('/var/backups/dachapar')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'

def fail(message):raise RuntimeError('ALBUM_STOP: '+message)
def digest(data):return hashlib.sha256(data).hexdigest()
def active(link,parent):
    if not link.is_symlink():fail('current is not a symlink: '+str(link))
    target=link.resolve(strict=True)
    if target.parent!=parent or not target.is_dir():fail('release outside expected parent')
    return target
def checked(root,name):
    rel=PurePosixPath(name)
    if rel.is_absolute() or not rel.parts or '..' in rel.parts or ':' in name or '\\' in name:fail('unsafe path')
    target=root.joinpath(*rel.parts)
    for p in [target,*list(target.parents)[:len(rel.parts)-1]]:
        if p.is_symlink():fail('symlink in web: '+name)
    return target
def tree(root):
    result={}
    for p in root.rglob('*'):
        if p.is_symlink():fail('symlink in web tree')
        if p.is_file():result[p.relative_to(root).as_posix()]=digest(p.read_bytes())
    return result
def health():
    with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=10) as response:
        if json.load(response).get('ok') is not True:fail('lead service is unhealthy')
def swap(destination):
    if destination.parent!=RELEASES or not destination.is_dir():fail('unsafe switch target')
    pending=WEB.with_name('current.album-switch')
    if pending.exists() or pending.is_symlink():fail('pending switch already exists')
    pending.symlink_to(destination);os.replace(pending,WEB)
def final_files(config,manifest):
    files=dict(config['baseline']['files'])
    files.update({r['path']:r['sha256'] for r in manifest['files']})
    return files
def archive_check(config,archive):
    if not re.fullmatch(r'ALBUM-[a-f0-9]{16}',config['release']):fail('invalid release name')
    if digest((HERE/'payload.zip').read_bytes())!=config['payload_sha256']:fail('payload checksum mismatch')
    manifest=json.loads(archive.read('manifest.json'))
    if manifest['source_commit']!=config['source_commit'] or manifest['plans']!=22 or manifest['file_count']!=96:fail('unexpected package version')
    index=json.loads(archive.read('site/home-hero/layouts/index.json'))
    if len(index['plans'])!=22 or len({p['number'] for p in index['plans']})!=22:fail('incomplete registry')
    allowed={'home-hero/'+n for n in ['layout-panel.mjs','layout-viewer.mjs','model-journey.mjs','hero.css','layouts/index.json']}
    allowed.update(['choice/app.mjs','choice/home-hero/layout-panel.mjs','choice/home-hero/hero.css'])
    for p in index['plans']:
        for key in ['drawing','model','spec','preview']:
            name='home-hero/layouts/'+p[key]
            checked(Path('/tmp/album-path-check'),name)
            allowed.add(name)
    names=[r['path'] for r in manifest['files']]
    if len(names)!=96 or set(names)!=allowed:fail('unexpected overlay file set')
    expected={'manifest.json','DEPLOY.md'}|{'site/'+n for n in names}
    if len(archive.namelist())!=len(expected) or set(archive.namelist())!=expected:fail('unexpected archive members')
    for row in manifest['files']:
        if not row['path'].startswith(('home-hero/','choice/')):fail('overlay outside reviewed folders')
        data=archive.read('site/'+row['path'])
        if len(data)!=row['bytes'] or digest(data)!=row['sha256']:fail('asset checksum mismatch: '+row['path'])
    return manifest
def baseline_check(config):
    baseline=config['baseline']
    web=active(WEB,RELEASES)
    api=active(API,API.parent/'releases')
    if str(web)!=baseline['web'] or str(api)!=baseline['api']:fail('active release changed since inventory')
    if tree(web)!=baseline['files']:fail('current web files changed since inventory')
    health();return web,api
def overlay(candidate,manifest,archive):
    for row in manifest['files']:
        target=checked(candidate,row['path'])
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(archive.read('site/'+row['path']));target.chmod(0o644)
def candidate_check(candidate,config,manifest):
    if tree(candidate)!=final_files(config,manifest):fail('candidate inventory mismatch')
    for name in ['layout-panel.mjs','layout-viewer.mjs','model-journey.mjs']:
        subprocess.run(['node','--check',str(candidate/'home-hero'/name)],check=True,capture_output=True,timeout=20)
    for name in ['choice/app.mjs','choice/home-hero/layout-panel.mjs']:
        subprocess.run(['node','--check',str(candidate/name)],check=True,capture_output=True,timeout=20)
    base=candidate/'home-hero/layouts';index=json.loads((base/'index.json').read_text())
    for p in index['plans']:
        data=(base/p['model']).read_bytes()
        if data[:4]!=b'glTF' or digest(data)!=p['sha256']:fail('invalid GLB: '+p['id'])
        length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length])
        spec=json.loads((base/p['spec']).read_text())
        pivots=[n for n in gltf['nodes'] if n.get('extras',{}).get('door_pivot')]
        doors=[i for i in spec['items'] if i['kind']=='door']
        if len(pivots)!=len(doors) or not pivots:fail('missing hinges: '+p['id'])
        for n in pivots:
            e=n['extras']
            if e['open_sign'] not in [-1,1] or not 0<e['max_angle_radians']<=3.142:fail('invalid hinge')
        if spec['dimension_sha256']!=p['dimension_sha256']:fail('dimension mismatch')
    if 'model-request.mjs?v=all-forms-20261105' not in (candidate/'home-hero/model-journey.mjs').read_text():fail('current forms import version lost')
    app=(candidate/'choice/app.mjs').read_text()
    if '/home-hero/layouts/index.json?album=22-20261105' not in app:fail('active choice registry is outdated')
    if "model-request.mjs?v=all-forms-20261105" not in app:fail('active choice form import lost')
def public_check(config,manifest):
    expected=final_files(config,manifest)
    protected=['index.html','home-hero/model-request.mjs','choice/home-hero/model-request.mjs','choice/catalog-pricebook.json','lead-client.mjs','phone-mask.mjs','data/site-settings.json','data/catalog-pricebook.json','quote.mjs','quiz-v1/quiz.mjs']
    names=sorted({r['path'] for r in manifest['files']}|{n for n in protected if n in expected})
    def check(name):
        request=urllib.request.Request(ORIGIN+'/'+name+'?album_check='+config['source_commit'],headers={'Cache-Control':'no-cache','User-Agent':'DachaPar-album-deployment'})
        with urllib.request.urlopen(request,timeout=40) as response:
            if digest(response.read())!=expected[name]:fail('served file mismatch: '+name)
        return name
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(check,names))
    if str(active(API,API.parent/'releases'))!=config['baseline']['api']:fail('lead service release changed')
    health();return results
def rollback(config):
    if os.geteuid()!=0:fail('sudo required')
    state_path=BACKUPS/config['release']/'state.json'
    state=json.loads(state_path.read_text())
    if str(active(WEB,RELEASES))!=state['new_web']:fail('another web release is active')
    if str(active(API,API.parent/'releases'))!=config['baseline']['api']:fail('another API release is active')
    old=Path(state['old_web'])
    if old.parent!=RELEASES or tree(old)!=config['baseline']['files']:fail('rollback source changed')
    swap(old);health();print('ROLLED_BACK; API and database unchanged',flush=True)
def main():
    parser=argparse.ArgumentParser();modes=parser.add_mutually_exclusive_group(required=True)
    for name in ['check','apply','rollback']:modes.add_argument('--'+name,action='store_true')
    args=parser.parse_args();config=json.loads((HERE/'deployment.json').read_text())
    if args.rollback:return rollback(config)
    with zipfile.ZipFile(HERE/'payload.zip') as archive:
        manifest=archive_check(config,archive)
        old,api=baseline_check(config)
        if args.check:
            with tempfile.TemporaryDirectory(prefix='dachapar-album-check-') as temp:
                candidate=Path(temp)/'web';shutil.copytree(old,candidate);overlay(candidate,manifest,archive)
                candidate_check(candidate,config,manifest)
            print('PREFLIGHT=PASS; 96 assets; 22 GLB; active choice wired; forms and API unchanged',flush=True);return
        if os.geteuid()!=0:fail('sudo required')
        with open('/run/lock/dachapar-album-deploy.lock','w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            old,api=baseline_check(config)
            new=RELEASES/config['release']
            if new.is_symlink():fail('stage is a symlink')
            if not new.exists():shutil.copytree(old,new);overlay(new,manifest,archive)
            candidate_check(new,config,manifest)
            backup=BACKUPS/config['release'];backup.mkdir(parents=True,exist_ok=True,mode=0o700)
            state={'old_web':str(old),'new_web':str(new),'api':str(api),'source_commit':config['source_commit']}
            state_path=backup/'state.json';state_path.write_text(json.dumps(state,indent=2)+'\n');state_path.chmod(0o600)
            swap(new)
            try:
                verified=public_check(config,manifest)
                if tree(new)!=final_files(config,manifest):fail('published release inventory changed')
            except Exception:
                swap(old);health();print('AUTOMATIC_ROLLBACK=PASS',flush=True);raise
            result={**state,'release':config['release'],'verified_public_files':len(verified),'overlay_files':96,'plans':22,'api_unchanged':True,'all_other_web_files_unchanged':True}
            (HERE/'deployment-result.json').write_text(json.dumps(result,indent=2)+'\n')
            print(json.dumps(result),flush=True)
            print('ROLLBACK: sudo python3 '+str(Path(__file__).resolve())+' --rollback',flush=True)
if __name__=='__main__':main()
