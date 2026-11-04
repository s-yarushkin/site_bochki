from pathlib import Path
from PIL import Image,ImageOps
import argparse,ast,json,html,math,xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('--finish',action='store_true');args=parser.parse_args()
work=HERE.parents[1]/'.local/pilot-01';out=HERE/'pilot';work.mkdir(parents=True,exist_ok=True);out.mkdir(exist_ok=True)
if not args.finish:
    tones={'wall':('pine','#c3baa6','#eee6d2'),'floor':('floor','#514f45','#898373'),'furniture':('linden','#815326','#c9964c')}
    for name,(source,dark,light) in tones.items():
        texture=Image.open(args.source/'textures'/f'{source}.jpg').convert('RGB')
        ImageOps.colorize(ImageOps.grayscale(texture),dark,light).save(work/f'{name}.jpg',quality=92)
    print('PILOT_TEXTURES_READY')
else:
    Image.open(work/'01-preview.png').convert('RGB').save(out/'01.webp',quality=90,method=5)
    p=json.loads((out/'01-dimension-source.json').read_text('utf8'));s=json.loads((out/'01.json').read_text('utf8'))
    s['public_specification']=json.loads((HERE.parent/'home-hero/layouts/specs/01.json').read_text('utf8'))['public_specification']
    for row in s['public_specification']['items']:
        if row['code']=='НС1':row.update(label='Выдвижной нижний полок',dimensions='1810 × 300 мм')
    (out/'01.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),'utf8')
    tree=ast.parse((args.source/'prepare_pilot.py').read_text('utf8'))
    function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='drawing')
    namespace={'html':html,'math':math,'TITLES':{1:'Квадро 4 м'},'ROOM':{'steam':'Парная','lounge':'Комната отдыха'}}
    exec(compile(ast.Module(body=[function],type_ignores=[]),'drawing_function','exec'),namespace)
    drawing=namespace['drawing'](p,s)
    svg=ET.fromstring(drawing)
    for parent in svg.iter():
        for child in list(parent):
            if child.tag.endswith('title') or child.tag.endswith('text') and any(term in ''.join(child.itertext()).lower() for term in ['принята','чистый пол']):parent.remove(child)
    ET.register_namespace('','http://www.w3.org/2000/svg');ET.ElementTree(svg).write(out/'01.svg',encoding='utf8',xml_declaration=True)
    print('PILOT_DRAWING_AND_PREVIEW_READY')
