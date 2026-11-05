"""Four-file fix over the reviewed release; restore the good full baseline first."""
from pathlib import Path
import hashlib,json,shutil,zipfile
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
OLD=ROOT/'output/bath-choice-deploy/package';OUT=ROOT/'output/callback-fix';PACKAGE=OUT/'package'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    original=json.loads((OLD/'manifest.json').read_text('utf8'))
    for p,h in original['overlay'].items():assert sha(OLD/'site'/p)==h,p
    shutil.copytree(OLD,PACKAGE,dirs_exist_ok=True)
    changes={
      'index.html':('/choice/app.mjs"','/choice/app.mjs?v=phone-callback-20261105"'),
      'choice/app.mjs':("'./continuation.mjs'","'./continuation.mjs?v=phone-callback-20261105'"),
      'choice/continuation.mjs':("'./continuation-state.mjs'","'./continuation-state.mjs?v=phone-callback-20261105'"),
      'choice/continuation-state.mjs':("payload.purpose='quiz_catalog';payload.contactChannel=values.channel;","payload.contactChannel=values.channel;\n if(values.channel!=='phone')payload.purpose='quiz_catalog';")}
    for p,(old,new) in changes.items():
        file=PACKAGE/'site'/p;text=file.read_text('utf8');assert text.count(old)==1,p
        file.write_text(text.replace(old,new),'utf8',newline='\n')
    overlay={p.relative_to(PACKAGE/'site').as_posix():sha(p) for p in sorted((PACKAGE/'site').rglob('*')) if p.is_file()}
    assert {p for p in overlay if overlay[p]!=original['overlay'][p]}==set(changes)
    manifest={**original,'overlay':overlay,'frontendBaseCommit':original['frontendCommit'],'hotfix':'phone-callback-purpose-20261105',
      'hotfixSourceSha256':sha(HERE/'continuation-state.mjs'),'restoreGoodBaselineFirst':True}
    manifest.pop('frontendCommit')
    (PACKAGE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n','utf8')
    shutil.copy2(HERE/'apply_callback_fix.py',PACKAGE/'apply_fix.py')
    digest=sha(PACKAGE/'manifest.json')[:16];archive=OUT/f'callback-fix-{digest}.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(PACKAGE.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(PACKAGE).as_posix())
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    info={'id':digest,'archive':str(archive),'sha256':sha(archive),'changedFiles':sorted(changes),
      'remote':f'/tmp/dachapar-callback-fix-{digest}','candidate':f'/srv/sites/dachapar-preview/releases/BC-{digest}'}
    (OUT/'package-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(info,ensure_ascii=False))
if __name__=='__main__':main()
