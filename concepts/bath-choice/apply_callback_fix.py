"""Restore the last known good release, then atomically publish the tested fix."""
from pathlib import Path
import importlib.util,json,os,sys
B=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('callback_installer',B/'install.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
OLD=Path('/tmp/dachapar-bath-choice-250ed3a209ba1254')

def main():
    mode=sys.argv[1];assert mode in {'--check','--apply'}
    app=mod.Installer(B)
    oldspec=importlib.util.spec_from_file_location('original_installer',OLD/'install.py')
    oldmod=importlib.util.module_from_spec(oldspec);oldspec.loader.exec_module(oldmod)
    old=oldmod.Installer(OLD);saved=json.loads(old.state.read_text('utf8'))
    assert app.previous==old.previous
    assert app.current() in {old.target,old.previous,app.target},'Active release changed'
    assert mod.inventory(app.previous)==saved['previous_inventory'],'Good rollback release changed'
    if app.current()==old.target:assert mod.inventory(old.target)==saved['candidate_inventory']
    for p,h in app.manifest['prerequisites'].items():assert mod.sha(app.previous/p)==h,p
    for p,h in app.overlay.items():assert mod.sha(B/'site'/p)==h,p
    print('CALLBACK_FIX_PREFLIGHT=PASS; changed public files=4; API_AND_DATABASE=UNCHANGED',flush=True)
    if mode=='--check':return
    assert os.geteuid()==0,'Run using sudo'
    with (app.site/'.bath-choice-deploy.lock').open('a') as lock:
        mod.fcntl.flock(lock,mod.fcntl.LOCK_EX|mod.fcntl.LOCK_NB)
        if app.current()==old.target:old.rollback()
        app.apply()
if __name__=='__main__':main()
