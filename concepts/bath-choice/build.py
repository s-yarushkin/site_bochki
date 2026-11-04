"""Build the isolated choice prototype. No deployment or changes to live data."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,re,shutil
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
    for name in ['app.mjs','state.mjs','packages.mjs','gallery.mjs','comparison.mjs','choice.css']:shutil.copy2(HERE/name,OUT/'choice'/name)
    page=(HERE/'index.html').read_text('utf8')
    roof=re.search(r"kvadro: '([^']+)'",(LEGACY/'roof-points.mjs').read_text('utf8'))[1]
    (OUT/'index.html').write_text(page.replace('{{roof}}',roof),encoding='utf8',newline='\n')
    for name in ['kvadro','parus','viking','house']:
        image=Image.open(LEGACY/'assets'/f'{name}.png').convert('RGB')
        for width in [640,1280,1920]:
            target=OUT/'choice/assets'/f'{name}-{width}.webp'
            if not target.exists():image.resize((width,round(image.height*width/image.width)),Image.Resampling.LANCZOS).save(target,quality=85,method=5)
    shutil.copy2(args.pricebook,OUT/'data/catalog-pricebook.json')
    book=json.loads(args.pricebook.read_text('utf8'))
    spec=importlib.util.spec_from_file_location('legacy_builder',LEGACY/'build.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    mod.copy_layouts(OUT/'home-hero/layouts',book)
    for name in ['catalog.mjs','roof-points.mjs','layout-panel.mjs','layout-story.mjs','layout-viewer.mjs','model-request.mjs','hero.css']:shutil.copy2(LEGACY/name,OUT/'home-hero'/name)
    registry=json.loads((LEGACY/'layouts/index.json').read_text('utf8'))
    for plan in registry['plans']:
        if plan['number'] in [12,13]:plan['models']=['parus','viking']
    pilot=HERE/'pilot'
    if (pilot/'01.glb').is_file():
        destination=OUT/'home-hero/layouts/pilot';destination.mkdir(parents=True,exist_ok=True)
        for name in ['01.glb','01.json','01.webp']:shutil.copy2(pilot/name,destination/name)
        for name in ['01-dimension-source.json','01-geometry-check.json','01-export-audit.json']:
            (destination/name).unlink(missing_ok=True)
        first=registry['plans'][0];first['model']='pilot/01.glb';first['spec']='pilot/01.json';first['preview']='pilot/01.webp'
        first['sha256']=hashlib.sha256((pilot/'01.glb').read_bytes()).hexdigest()
        first['dimension_sha256']=json.loads((pilot/'01.json').read_text('utf8'))['dimension_sha256']
        first['revision']='choice-v2-pilot-01'
    album=json.loads((HERE/'album/manifest.json').read_text('utf8'))
    assert len(album['plans'])==14
    canonical=OUT/'home-hero/layouts/album';canonical.mkdir(parents=True,exist_ok=True)
    for plan in registry['plans']:
        page=next(p for p in album['plans'] if p['number']==plan['number'])
        original=HERE/'album'/page['drawing']
        if hashlib.sha256(original.read_bytes()).hexdigest()!=page['sha256']:raise RuntimeError('Native album image changed')
        shutil.copy2(original,canonical/page['drawing'])
        plan['drawing']='album/'+page['drawing']
        plan['drawing_source']={'presentationId':album['presentationId'],'revisionId':album['revisionId'],'slideId':page['slideId'],'sha256':page['sha256']}
    registry['version']='bath-choice-v3-native-album-2026-11-04'
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
    manifest={'published':False,'prototype':True,'deploymentReady':False,'deploymentBlocks':['incomplete_geometry_coverage','visual_review_pending','layout_prices_unapproved'],
              'pricebookSha256':hashlib.sha256(args.pricebook.read_bytes()).hexdigest(),'quizSourceUnchanged':True,
              'quizSha256':hashlib.sha256(captured.read_bytes()).hexdigest(),'modelSizePairs':sum(len(m['sizes']) for m in book['r85']['models'].values()),
              'coveredModelSizePairs':len(covered),'newGeometryCoverageComplete':False,'files':[]}
    for p in sorted(OUT.rglob('*')):
        if p.is_file():manifest['files'].append({'path':p.relative_to(OUT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
    (ROOT/'output/bath-choice-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
    print(json.dumps({'output':str(OUT),'files':len(manifest['files']),'modelSizePairs':manifest['modelSizePairs'],'published':False}))

if __name__=='__main__':main()
