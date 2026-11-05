"""Package only the reviewed homepage layout assets, never a captured site baseline."""
import hashlib,json,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    base=ROOT/'concepts/home-hero';registry=json.loads((base/'layouts/index.json').read_text('utf8'))
    assert len(registry['plans'])==22
    files=[base/name for name in ['layout-panel.mjs','layout-viewer.mjs','model-journey.mjs','hero.css']]
    files.append(base/'layouts/index.json')
    for plan in registry['plans']:
        spec=json.loads((base/'layouts'/plan['spec']).read_text('utf8'))
        assert spec['dimension_sha256']==plan['dimension_sha256']
        assert hashlib.sha256((base/'layouts'/plan['model']).read_bytes()).hexdigest()==plan['sha256']
        files += [base/'layouts'/plan[key] for key in ['drawing','model','spec','preview']]
    assert len(files)==len(set(files))==93
    records=[]
    for f in files:
        target='home-hero/'+f.relative_to(base).as_posix()
        records.append({'path':target,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
    manifest={'version':'album-review-2026-11-05','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'file_count':len(files),'plans':22,'files':records}
    out=ROOT/'output';out.mkdir(exist_ok=True);target=out/'album-layouts-update-20261105.zip'
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for f,r in zip(files,records):z.write(f,'site/'+r['path'])
        z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        z.write(ROOT/'docs/album-update-20261105.md','DEPLOY.md')
    (out/'album-layouts-update-20261105-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'archive':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(files)},ensure_ascii=False))
if __name__=='__main__':main()
