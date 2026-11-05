"""Package the reviewed home above an exact live baseline; never deploy a preview."""
from pathlib import Path
import hashlib,json,re,shutil,zipfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
OUT=ROOT/'output/bath-choice-deploy'
BASE=OUT/'baseline'
PREVIEW=ROOT/'output/bath-choice-prototype'
EXPECTED='/srv/sites/dachapar-preview/releases/SPEC-CLEAN-be544b9fb6464bd4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    assert sha(BASE/'index.html')=='5a259b7e4a6827b75853fe22063b396e62f9e429c43a8f765d9f70cfefc86fab'
    assert sha(BASE/'catalog-pricebook.json')=='bf03c6da29c2cd7d102431d4dd208f818b81be19c69957fb9d4a73a3cd5fa28e'
    baseline=(BASE/'index.html').read_text('utf8')
    captured=(HERE/'baseline-v5/index.html').read_text('utf8')
    assert baseline.replace('\r\n','\n')==captured.replace('\r\n','\n'),'Live home changed since the reviewed lower-page capture'
    site=OUT/'package/site';site.mkdir(parents=True,exist_ok=True)
    prerequisites={}
    for src in sorted(PREVIEW.rglob('*')):
        if not src.is_file():continue
        rel=src.relative_to(PREVIEW).as_posix()
        if rel=='data/catalog-pricebook.json':dest='choice/catalog-pricebook.json'
        elif rel=='index.html' or rel.startswith('choice/'):dest=rel
        elif rel.startswith('home-hero/'):dest='choice/'+rel
        else:
            prerequisites[rel]=sha(src);continue
        target=site/dest;target.parent.mkdir(parents=True,exist_ok=True)
        if src.suffix in {'.html','.mjs','.css'}:
            text=src.read_text('utf8')
            text=text.replace('/home-hero/','/choice/home-hero/')
            if dest.startswith('choice/') and not dest.startswith('choice/home-hero/'):
                text=text.replace("'../home-hero/","'./home-hero/")
            if dest=='choice/app.mjs':
                assert text.count("json('/data/catalog-pricebook.json')")==1
                text=text.replace("json('/data/catalog-pricebook.json')","json('/choice/catalog-pricebook.json')")
            if dest=='index.html':
                # Preserve the existing canonical, metadata, structured data and icons.
                head=re.search(r'<head\b[^>]*>(.*?)</head>',baseline,re.S|re.I)[1]
                tags=re.findall(r'<title\b[^>]*>.*?</title>|<script\b[^>]*application/ld\+json[^>]*>.*?</script>|<meta\b[^>]*>|<link\b[^>]*>',head,re.S|re.I)
                seo=[t for t in tags if t.lower().startswith(('<title','<script')) or (t.lower().startswith('<meta') and re.search(r'(?:description|robots|og:|twitter:|verification)',t,re.I)) or (t.lower().startswith('<link') and re.search(r'canonical|icon',t,re.I))]
                text=re.sub(r'<meta name="robots"[^>]*>|<title>.*?</title>','',text,flags=re.S)
                text=text.replace('</head>','\n'+''.join(seo)+'\n</head>')
                assert 'noindex' not in text.split('</head>')[0]
                assert 'rel="canonical"' in text or 'rel="canonical"' in head
            target.write_text(text,'utf8',newline='\n')
        else:shutil.copy2(src,target)
    # These server files are prerequisites, never overlay contents.
    prerequisites.update({'index.html':sha(BASE/'index.html'),'data/catalog-pricebook.json':sha(BASE/'catalog-pricebook.json'),
      'data/site-settings.json':'db1a0af013ef24642702fa4b9ef547009b58f6469dcae82de661dd513ebc7a99'})
    overlay={p.relative_to(site).as_posix():sha(p) for p in sorted(site.rglob('*')) if p.is_file()}
    assert all(p=='index.html' or p.startswith('choice/') for p in overlay)
    assert len([p for p in overlay if p.endswith('.glb')])==19
    manifest={'baseline':EXPECTED,'frontendCommit':'565c59c7d45c8e033a9b8f1c6ca3fa180cd59e4e','overlay':overlay,'prerequisites':prerequisites,
      'stagingWaivedByOwner':True,'realLeadsOwnerWillTest':True,'geometryCount':19,'protectedRuntimeUnchanged':True}
    package=site.parent
    (package/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n','utf8')
    shutil.copy2(HERE/'install_release.py',package/'install.py')
    digest=sha(package/'manifest.json')[:16]
    archive=OUT/f'bath-choice-{digest}.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for path in sorted(package.rglob('*')):
            if path.is_file():z.write(path,path.relative_to(package).as_posix())
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    info={'archive':str(archive),'sha256':sha(archive),'manifestId':digest,'remote':f'/tmp/dachapar-bath-choice-{digest}',
      'candidate':f'/srv/sites/dachapar-preview/releases/BC-{digest}','files':len(overlay),'prerequisites':len(prerequisites)}
    (OUT/'package-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(info,ensure_ascii=False))

if __name__=='__main__':main()
