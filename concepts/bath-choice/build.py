"""Build the isolated choice prototype. No deployment or changes to live data."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,re,shutil,xml.etree.ElementTree as ET
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
OUT=ROOT/'output/bath-choice-prototype'
LEGACY=HERE.parent/'home-hero'

def clean_drawing(path):
    tree=ET.parse(path);root=tree.getroot()
    for parent in root.iter():
        for element in list(parent):
            if element.tag.endswith('text') and any(term in ''.join(element.itertext()).lower() for term in ['принята','приняты','чистый пол','x вправо']):parent.remove(element)
    ET.register_namespace('','http://www.w3.org/2000/svg')
    tree.write(path,encoding='utf-8',xml_declaration=True)

def main():
    captured_book=ROOT/'.local/renewal-baseline/catalog-pricebook.json'
    parser=argparse.ArgumentParser();parser.add_argument('--pricebook',type=Path,default=captured_book if captured_book.is_file() else ROOT/'web/data/catalog-pricebook.json');args=parser.parse_args()
    if not args.pricebook.is_file():raise RuntimeError('Capture the current public pricebook first')
    (OUT/'choice/assets').mkdir(parents=True,exist_ok=True);(OUT/'data').mkdir(exist_ok=True)
    for name in ['app.mjs','state.mjs','packages.mjs','choice.css']:shutil.copy2(HERE/name,OUT/'choice'/name)
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
    for name in ['catalog.mjs','roof-points.mjs','layout-panel.mjs','layout-viewer.mjs','model-request.mjs','hero.css']:shutil.copy2(LEGACY/name,OUT/'home-hero'/name)
    for drawing in (OUT/'home-hero/layouts/drawings').glob('*.svg'):clean_drawing(drawing)
    registry=json.loads((LEGACY/'layouts/index.json').read_text('utf8'))
    for plan in registry['plans']:
        if plan['number'] in [12,13]:plan['models']=['parus','viking']
    pilot=HERE/'pilot'
    if (pilot/'01.glb').is_file():
        destination=OUT/'home-hero/layouts/pilot';destination.mkdir(parents=True,exist_ok=True)
        for name in ['01.glb','01.json','01.svg','01.webp']:shutil.copy2(pilot/name,destination/name)
        for name in ['01-dimension-source.json','01-geometry-check.json','01-export-audit.json']:
            (destination/name).unlink(missing_ok=True)
        first=registry['plans'][0];first['model']='pilot/01.glb';first['spec']='pilot/01.json';first['drawing']='pilot/01.svg';first['preview']='pilot/01.webp'
        first['sha256']=hashlib.sha256((pilot/'01.glb').read_bytes()).hexdigest()
        first['dimension_sha256']=json.loads((pilot/'01.json').read_text('utf8'))['dimension_sha256']
        first['revision']='choice-v2-pilot-01'
    registry['version']='bath-choice-v2-pilot-2026-11-04'
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
    chosen={'kvadro':['kq-08','kq-12','kq-13'],'parus':['02_exterior','02_steam','02_lounge'],'viking':['cream-outside','cream-steam','cream-lounge'],'kvadro-house':['kh7-07','kh7-06','kh7-08']}
    photos={model:[next(p for p in references if p['model']==model and p['photoId']==ident) for ident in ids] for model,ids in chosen.items()}
    (OUT/'choice/photos.json').write_text(json.dumps(photos,ensure_ascii=False,indent=2),'utf8')
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
