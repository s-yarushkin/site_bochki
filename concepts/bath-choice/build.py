"""Build the isolated choice prototype. No deployment or changes to live data."""
from pathlib import Path
import argparse,copy,hashlib,importlib.util,json,re,shutil
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
OUT=ROOT/'output/bath-choice-prototype'
LEGACY=HERE.parent/'home-hero'

def main():
    captured_book=ROOT/'.local/renewal-baseline/catalog-pricebook.json'
    parser=argparse.ArgumentParser();parser.add_argument('--pricebook',type=Path,default=captured_book if captured_book.is_file() else ROOT/'web/data/catalog-pricebook.json');args=parser.parse_args()
    if not args.pricebook.is_file():raise RuntimeError('Capture the current public pricebook first')
    (OUT/'choice/assets').mkdir(parents=True,exist_ok=True);(OUT/'data').mkdir(exist_ok=True)
    for name in ['app.mjs','state.mjs','packages.mjs','gallery.mjs','comparison.mjs','choice.css','ritual.css']:shutil.copy2(HERE/name,OUT/'choice'/name)
    page=(HERE/'index.html').read_text('utf8')
    original=(LEGACY/'baseline/index.html').read_text('utf8')
    ritual=re.search(r'<section class="ritual"[^>]*>.*?</section>',original,re.S)[0]
    page=page.replace('{{ritual}}',ritual)
    # Reuse the original ritual without the unrelated catalogue and form code.
    script=(ROOT/'r101/site.mjs').read_text('utf8')
    start=script.index('function ritual(');end=script.index(' const re=new IntersectionObserver',start)
    (OUT/'choice/ritual.mjs').write_text("const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],reduce=matchMedia('(prefers-reduced-motion:reduce)');\n"+script[start:end]+"}\n",'utf8')
    for src in re.findall(r'(?:src|srcset)="([^"]+)"',ritual):
        for part in src.split(','):
            path=Path(part.strip().split()[0].lstrip('/'));source=ROOT/'web'/path
            if not source.is_file():source=ROOT/path
            target=OUT/path;target.parent.mkdir(parents=True,exist_ok=True)
            if source.is_file():shutil.copy2(source,target)
            else:
                stem=re.sub(r'-(640|960)$','',path.stem);png=ROOT/'r101/assets'/f'{stem}.png'
                if not png.is_file():raise RuntimeError('Missing original ritual asset: '+str(path))
                # Same source photograph and encoding recipe as r101/build.py.
                width_match=re.search(r'-(640|960)$',path.stem);width=int(width_match[1]) if width_match else 1536
                picture=Image.open(png);picture.thumbnail((width,width));picture.save(target,quality=80 if width_match else 86)
    roof=re.search(r"kvadro: '([^']+)'",(LEGACY/'roof-points.mjs').read_text('utf8'))[1]
    (OUT/'index.html').write_text(page.replace('{{roof}}',roof),encoding='utf8',newline='\n')
    for name in ['kvadro','parus','viking','house']:
        image=Image.open(LEGACY/'assets'/f'{name}.png').convert('RGB')
        for width in [640,1280,1920]:
            target=OUT/'choice/assets'/f'{name}-{width}.webp'
            if not target.exists():image.resize((width,round(image.height*width/image.width)),Image.Resampling.LANCZOS).save(target,quality=85,method=5)
    book=json.loads(args.pricebook.read_text('utf8'))
    # Refresh only this isolated prototype from the verified public retail bases.
    # The production pricebook and the original R117 files are never rewritten.
    bases=json.loads((HERE/'pricing/public-package-base.json').read_text('utf8'))['models']
    assert sum(len(row) for row in bases.values())==20
    for model,sizes in bases.items():
        for size,prices in sizes.items():
            row=book['r85']['models'][model]['sizes'][size]
            row['priceRub']=prices['comfortCents']/100
            row['deluxe']['priceRub']=prices['deluxeCents']/100
    (OUT/'data/catalog-pricebook.json').write_text(json.dumps(book,ensure_ascii=False,indent=2)+'\n','utf8')
    geometry=HERE/'geometry';layout_root=OUT/'home-hero/layouts'
    assert json.loads((geometry/'qa/export-audit.json').read_text('utf8'))['models']==19
    assert json.loads((geometry/'qa/native-album-audit.json').read_text('utf8'))['pass']
    shutil.copytree(LEGACY/'layouts/vendor',layout_root/'vendor',dirs_exist_ok=True)
    for name in ['catalog.mjs','roof-points.mjs','layout-panel.mjs','layout-story.mjs','layout-viewer.mjs','model-request.mjs','hero.css']:shutil.copy2(LEGACY/name,OUT/'home-hero'/name)
    registry=json.loads((geometry/'index-draft.json').read_text('utf8'))
    for plan in registry['plans']:
        number=f"{plan['number']:02}"
        for key,folder,extension in [('model','models','glb'),('spec','specs','json'),('preview','previews','webp')]:
            relative=f'{folder}/{number}.{extension}';target=layout_root/relative;target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(geometry/relative,target);plan[key]=relative
        checked=json.loads((geometry/plan['spec']).read_text('utf8'))
        plan['sha256']=hashlib.sha256((geometry/plan['model']).read_bytes()).hexdigest();plan['dimension_sha256']=checked['dimension_sha256']
        for model in plan['models']:
            expected=([int(x)*1000 for x in plan['size'].split('x')] if 'x' in plan['size'] else [int(plan['size'])*10,round(book['models'][model]['widthM']*1000)])
            assert plan['size'] in book['prices'][model] and sorted(checked['outer_mm'][:2])==sorted(expected)
    # Remove only obsolete generated prototype files. Historical sources stay in Git.
    old=json.loads((LEGACY/'layouts/index.json').read_text('utf8'))
    stale=[p['drawing'] for p in old['plans']]+['pilot/01.glb','pilot/01.json','pilot/01.webp']
    for relative in stale:
        target=(layout_root/relative).resolve();target.relative_to(layout_root.resolve());target.unlink(missing_ok=True)
    album=json.loads((HERE/'album/manifest.json').read_text('utf8'))
    assert len(album['plans'])==len(registry['plans'])==19
    canonical=OUT/'home-hero/layouts/album';canonical.mkdir(parents=True,exist_ok=True)
    for plan in registry['plans']:
        page=next(p for p in album['plans'] if p['number']==plan['number'])
        original=HERE/'album'/page['drawing']
        if hashlib.sha256(original.read_bytes()).hexdigest()!=page['sha256']:raise RuntimeError('Native album image changed')
        shutil.copy2(original,canonical/page['drawing'])
        plan['drawing']='album/'+page['drawing']
        plan['drawing_source']={'presentationId':album['presentationId'],'revisionId':album['revisionId'],'slideId':page['slideId'],'sha256':page['sha256']}
    registry['version']='bath-choice-v4-native-album-19-2026-11-04'
    # Keep a complete source registry with current GLB hashes, independently of
    # the preparation draft inherited from the original fourteen models.
    source_registry=copy.deepcopy(registry)
    for row in source_registry['plans']:row['drawing']='../album/'+Path(row['drawing']).name
    (geometry/'index.json').write_text(json.dumps(source_registry,ensure_ascii=False,indent=2)+'\n','utf8')
    for plan in registry['plans']:
        folder=OUT/'home-hero/layouts'
        for key in ['model','spec','drawing','preview']:
            if not (folder/plan[key]).is_file():raise RuntimeError('Missing layout asset: '+plan[key])
        checked=json.loads((folder/plan['spec']).read_text('utf8'))
        if not checked.get('public_specification',{}).get('items'):raise RuntimeError('Missing public specification: '+plan['id'])
        if checked['dimension_sha256']!=plan['dimension_sha256']:raise RuntimeError('Dimension revision mismatch: '+plan['id'])
        if hashlib.sha256((folder/plan['model']).read_bytes()).hexdigest()!=plan['sha256']:raise RuntimeError('GLB hash mismatch: '+plan['id'])
    registry_text=json.dumps(registry,ensure_ascii=False,indent=2)
    (OUT/'choice/layouts.json').write_text(registry_text,'utf8')
    (OUT/'home-hero/layouts/index.json').write_text(registry_text,'utf8')
    references=json.loads((ROOT/'web/data/photo-references.json').read_text('utf8'))
    chosen={'kvadro':['kq-06','kq-08','kq-13','kq-12','kq-10','kq-09'],'parus':['02_exterior','02_lounge','02_steam','03_evening','03_day','04_stove'],'viking':['cream-outside','cream-lounge','cream-steam','deck-outside','deck-side','brown-steam'],'kvadro-house':['kh7-07','kh7-06','kh7-08','kh7-04','kh7-01','kh7-03']}
    photos={model:[next(p for p in references if p['model']==model and p['photoId']==ident) for ident in ids] for model,ids in chosen.items()}
    for collection in photos.values():
        for photo in collection:
            relative=Path(photo['image'].lstrip('/'));source=ROOT/'web'/relative
            if not source.is_file():raise RuntimeError('Missing selected photo: '+str(relative))
            destination=OUT/relative;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
            for key,suffixes in [('thumbnail',['-480.webp']),('largeImage',['-1600.webp','-full.webp'])]:
                for suffix in suffixes:
                    candidate=Path(str(relative).replace('-960.webp',suffix))
                    if (ROOT/'web'/candidate).is_file():
                        photo[key]='/'+candidate.as_posix();target=OUT/candidate;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'web'/candidate,target);break
    (OUT/'choice/photos.json').write_text(json.dumps(photos,ensure_ascii=False,indent=2),'utf8')
    mood={'ritual-stones-960.webp':ROOT/'web/assets/detail-stove-p2-960.webp','ritual-oak-960.webp':ROOT/'r101/assets/oak-steam.png','ritual-rest-960.webp':ROOT/'r101/assets/conifer-rest.png','tea-1600.webp':ROOT/'r101/assets/tea-editorial.png'}
    for name,src in mood.items():
        picture=Image.open(src).convert('RGB');width=min(1600 if name.startswith('tea-') else 960,picture.width)
        picture.resize((width,round(picture.height*width/picture.width)),Image.Resampling.LANCZOS).save(OUT/'choice/assets'/name,quality=88,method=5)
    baseline=HERE/'baseline';metadata=json.loads((baseline/'metadata.json').read_text('utf8'))
    for origin,files in [(baseline,metadata['files']),(ROOT/'web',metadata['sharedFiles'])]:
        for entry in files:
            src=origin/entry['path']
            if hashlib.sha256(src.read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Public runtime snapshot changed: '+entry['path'])
            if entry['path']=='data/catalog-pricebook.json':continue
            dst=OUT/entry['path'];dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    captured=baseline/'quiz.mjs'
    covered={(model,p['size']) for p in registry['plans'] for model in p['models']}
    assert len(covered)==20
    manifest={'published':False,'prototype':True,'deploymentReady':False,'deploymentBlocks':['release_review_pending'],
              'sourcePublicPricebookSha256':hashlib.sha256(args.pricebook.read_bytes()).hexdigest(),
              'pricebookSha256':hashlib.sha256((OUT/'data/catalog-pricebook.json').read_bytes()).hexdigest(),
              'prototypePackageBasesSource':'pricing/public-package-base.json','layoutPricesOnPublicPage':False,'quizSourceUnchanged':True,
              'quizSha256':hashlib.sha256(captured.read_bytes()).hexdigest(),'modelSizePairs':sum(len(m['sizes']) for m in book['r85']['models'].values()),
              'coveredModelSizePairs':len(covered),'newGeometryCoverageComplete':True,'geometryCount':19,'nativeAlbumRevision':album['revisionId'],'files':[]}
    for p in sorted(OUT.rglob('*')):
        if p.is_file():manifest['files'].append({'path':p.relative_to(OUT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
    (ROOT/'output/bath-choice-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
    print(json.dumps({'output':str(OUT),'files':len(manifest['files']),'modelSizePairs':manifest['modelSizePairs'],'published':False}))

if __name__=='__main__':main()
