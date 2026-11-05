"""Verified overlay, atomic publication, full rollback. No Caddy/API/data changes."""
from pathlib import Path,PurePosixPath
import concurrent.futures,fcntl,hashlib,json,os,shutil,sys,urllib.request,urllib.error

SITE=Path('/srv/sites/dachapar-preview')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file()}
def activate(site,target):
    temporary=site/('.current-bc-'+str(os.getpid()))
    assert not temporary.exists() and not temporary.is_symlink()
    temporary.symlink_to(target);os.replace(temporary,site/'current')

class Installer:
    def __init__(self,package,site=SITE):
        self.package=Path(package);self.site=Path(site)
        self.manifest=json.loads((self.package/'manifest.json').read_text('utf8'))
        self.id=sha(self.package/'manifest.json')[:16]
        self.previous=Path(self.manifest['baseline'])
        assert self.previous.parent==self.site/'releases'
        self.target=self.site/'releases'/('BC-'+self.id)
        self.state=self.site/('.bath-choice-'+self.id+'.json')
        self.overlay=self.manifest['overlay']
        assert self.overlay and 'index.html' in self.overlay
        for p in self.overlay:
            path=PurePosixPath(p)
            assert not path.is_absolute() and '..' not in path.parts
            assert p=='index.html' or p.startswith('choice/')
        assert len([p for p in self.overlay if p.endswith('.glb')])==self.manifest['geometryCount']==19
    def current(self):return (self.site/'current').resolve()
    def check(self):
        assert self.current()==self.previous,'Active release changed; prepare a fresh baseline'
        for p,h in self.manifest['prerequisites'].items():assert sha(self.previous/p)==h,'Prerequisite differs: '+p
        for p,h in self.overlay.items():assert sha(self.package/'site'/p)==h,'Overlay differs: '+p
        settings=json.loads((self.previous/'data/site-settings.json').read_text('utf8'))
        assert settings['lead']['enabled'] is True and settings['lead']['endpoint']=='/api/lead'
        assert ORIGIN in settings['lead']['allowedOrigins']
        print('BASELINE=PASS '+str(self.previous),flush=True)
        print('OVERLAY=PASS '+str(len(self.overlay))+'; LEAD_SETTINGS=PASS; PROTECTED_RUNTIME=UNCHANGED',flush=True)
    def public_verify(self):
        def verify(row):
            p,h=row;url=ORIGIN+('/' if p=='index.html' else '/'+p)+'?bc_verify='+self.id
            request=urllib.request.Request(url,headers={'Cache-Control':'no-cache'})
            with urllib.request.urlopen(request,timeout=20) as r:
                assert hashlib.sha256(r.read()).hexdigest()==h,'Public hash differs: '+p
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(verify,self.overlay.items()))
        with urllib.request.urlopen('http://127.0.0.1:3301/health',timeout=10) as r:assert json.load(r)['ok'] is True
        try:urllib.request.urlopen(ORIGIN+'/api/lead',timeout=10)
        except urllib.error.HTTPError as e:assert e.code==405 and 'POST' in e.headers.get('Allow',''),'Public lead route differs'
        else:raise AssertionError('Public lead route must require POST')
        print('PUBLIC_HASHES=PASS '+str(len(self.overlay))+'; RELAY_HEALTH=PASS; PUBLIC_LEAD_ROUTE=PASS',flush=True)
    def apply(self):
        if self.current()==self.target:
            self.public_verify();print('ALREADY_ACTIVE=PASS '+str(self.target),flush=True);return
        self.check()
        assert not self.target.exists(),'Candidate already exists; inspect it before retrying'
        before=inventory(self.previous)
        shutil.copytree(self.previous,self.target,symlinks=True)
        for p in self.overlay:
            dest=self.target/p
            assert dest.resolve().is_relative_to(self.target.resolve()),'Unsafe overlay destination'
            dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(self.package/'site'/p,dest);dest.chmod(0o644)
        after=inventory(self.target)
        assert set(before)<=set(after)
        changed={p for p in after if before.get(p)!=after[p]}
        assert changed<=set(self.overlay),'Unexpected changes outside the overlay'
        assert all(after[p]==h for p,h in self.overlay.items())
        assert inventory(self.previous)==before and self.current()==self.previous
        saved={'previous':str(self.previous),'candidate':str(self.target),'previous_inventory':before,'candidate_inventory':after,'phase':'prepared'}
        self.state.write_text(json.dumps(saved,sort_keys=True,indent=2)+'\n','utf8');self.state.chmod(0o644)
        activate(self.site,self.target)
        try:
            self.public_verify()
            assert inventory(self.previous)==before
            assert inventory(self.target)==after
        except BaseException:
            activate(self.site,self.previous)
            saved['phase']='automatic_rollback';self.state.write_text(json.dumps(saved,sort_keys=True,indent=2)+'\n','utf8')
            print('POSTCHECK=FAIL; FULL_ROLLBACK=PASS '+str(self.previous),flush=True)
            raise
        saved['phase']='active';self.state.write_text(json.dumps(saved,sort_keys=True,indent=2)+'\n','utf8')
        print('ACTIVE='+str(self.target),flush=True)
        print('ROLLBACK: sudo python3 '+str(self.package/'install.py')+' --rollback',flush=True)
    def rollback(self):
        saved=json.loads(self.state.read_text('utf8'))
        assert self.current()==self.target,'Current changed; refusing rollback'
        assert inventory(self.previous)==saved['previous_inventory'],'Previous release changed'
        activate(self.site,self.previous)
        saved['phase']='rolled_back';self.state.write_text(json.dumps(saved,sort_keys=True,indent=2)+'\n','utf8')
        print('FULL_ROLLBACK=PASS '+str(self.previous),flush=True)

def main():
    mode=sys.argv[1] if len(sys.argv)>1 else '--check'
    assert mode in {'--check','--apply','--rollback','--status'}
    app=Installer(Path(__file__).resolve().parent)
    if mode=='--status':
        print('ACTIVE='+str(app.current()));print('CANDIDATE='+str(app.target))
        print('STATE='+str(json.loads(app.state.read_text())['phase']) if app.state.exists() else 'STATE=not_prepared')
        return
    if mode=='--check':app.check();return
    assert os.geteuid()==0,'Run with sudo'
    with (app.site/'.bath-choice-deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        app.apply() if mode=='--apply' else app.rollback()

if __name__=='__main__':main()
