"""Prepare a reversible native Slides correction; does not send it to Google."""
from pathlib import Path
import copy,json,math
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
WORK=ROOT/'.local/source-album-v2'
source=json.loads((WORK/'presentation.json').read_text('utf8'));planned=copy.deepcopy(source)

def multiply(a,b):
    x,y,u,v,tx,ty=a;X,Y,U,V,TX,TY=b
    return [x*X+u*Y,y*X+v*Y,x*U+u*V,y*U+v*V,x*TX+u*TY+tx,y*TX+v*TY+ty]
def matrix(element):
    t=element.get('transform')
    if t is None:return [1,0,0,1,0,0]
    # Slides omits zero affine coefficients, including both scales on rotated shapes.
    unit=1 if t.get('unit','EMU')=='EMU' else 12700
    return [t.get('scaleX',0),t.get('shearY',0),t.get('shearX',0),t.get('scaleY',0),t.get('translateX',0)*unit,t.get('translateY',0)*unit]
def transform(value):
    a,b,c,d,x,y=value
    return {'scaleX':a,'shearY':b,'shearX':c,'scaleY':d,'translateX':x,'translateY':y,'unit':'EMU'}
def entries(elements,parent=None,ancestors=()):
    parent=parent or [1,0,0,1,0,0]
    for element in elements:
        world=multiply(parent,matrix(element));yield element,world,ancestors
        if 'elementGroup' in element:yield from entries(element['elementGroup']['children'],world,ancestors+(element['objectId'],))
def bbox(element,world):
    size=element.get('size');assert size
    w=size['width']['magnitude']*(12700 if size['width'].get('unit')=='PT' else 1)
    h=size['height']['magnitude']*(12700 if size['height'].get('unit')=='PT' else 1)
    a,b,c,d,x,y=world;points=[(a*X+c*Y+x,b*X+d*Y+y) for X,Y in [(0,0),(w,0),(w,h),(0,h)]]
    return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
def text(element):return ''.join(t.get('textRun',{}).get('content','') for t in element.get('shape',{}).get('text',{}).get('textElements',[])).strip()
def root_of(elements,target):
    mapping={e['objectId']:(e,m,anc) for e,m,anc in entries(elements)}
    e,m,anc=mapping[target];return mapping[anc[0]][0] if anc else e
def translate(element,delta):element['transform']=transform(multiply(delta,matrix(element)))

corrections=[]
for n,slide in enumerate(planned['slides'],1):
    spec=json.loads((HERE/'pilot/01.json' if n==1 else HERE.parent/'home-hero/layouts/specs'/f'{n:02}.json').read_text('utf8'))
    elements=slide['pageElements'];flat={e['objectId']:(e,m,anc) for e,m,anc in entries(elements)}
    outer_id=next(i['source_object'] for i in spec['items'] if i['kind']=='wall')
    outer=bbox(*flat[outer_id][:2]);W,H=spec['outer_mm'][:2];sx=(outer[2]-outer[0])/W;sy=(outer[3]-outer[1])/H
    if n==13:
        moved=[]
        for element in elements:
            if element['objectId'] in [outer_id,'top_13_0001']:continue
            if 'elementGroup' in element:
                children=[bbox(e,m) for e,m,_ in entries([element]) if 'size' in e]
                bounds=[min(b[0] for b in children),min(b[1] for b in children),max(b[2] for b in children),max(b[3] for b in children)]
            elif 'size' in element:bounds=bbox(element,matrix(element))
            else:continue
            cx=((bounds[0]+bounds[2])/2-outer[0])/sx;cy=H-((bounds[1]+bounds[3])/2-outer[1])/sy
            if -100<=cx<=W+150 and -150<=cy<=H+150:
                translate(element,[1,0,0,1,-35.886*sx,0]);moved.append(element['objectId'])
        corrections.append({'slide':n,'change':'Previously approved 35.886 mm X correction','elements':moved})
    for item in spec['items']:
        if item['kind'] not in ['bench','lower','upper','table','storage','open_storage','wash_bench','sink']:continue
        ident=item.get('source_object');flat={e['objectId']:(e,m,anc) for e,m,anc in entries(elements)}
        if ident not in flat:continue
        e,m,anc=flat[ident];old=bbox(e,m);x,y=item['xy_mm'];w,h=item['size_mm']
        original=[(old[0]-outer[0])/sx,H-(old[3]-outer[1])/sy,(old[2]-old[0])/sx,(old[3]-old[1])/sy]
        delta=[x-original[0],y-original[1],w-original[2],h-original[3]]
        if max(abs(d) for d in delta)<=1:continue
        target=[outer[0]+x*sx,outer[1]+(H-y-h)*sy,outer[0]+(x+w)*sx,outer[1]+(H-y)*sy]
        rx=(target[2]-target[0])/(old[2]-old[0]) if abs(delta[2])>1 else 1
        ry=(target[3]-target[1])/(old[3]-old[1]) if abs(delta[3])>1 else 1
        affine=[rx,0,0,ry,target[0]-rx*old[0],target[1]-ry*old[1]]
        root=root_of(elements,ident);translate(root,affine);moved=[root['objectId']]
        if not anc and item['kind']=='sink':
            for candidate in elements:
                if candidate.get('shape',{}).get('shapeType')=='ELLIPSE':
                    cb=bbox(candidate,matrix(candidate))
                    if cb[0]>=old[0]-sx and cb[1]>=old[1]-sy and cb[2]<=old[2]+sx and cb[3]<=old[3]+sy:
                        translate(candidate,affine);moved.append(candidate['objectId'])
                    continue
                if text(candidate)!=item['code']:continue
                cb=bbox(candidate,matrix(candidate));cx=(cb[0]+cb[2])/2;cy=(cb[1]+cb[3])/2
                if old[0]-100*sx<=cx<=old[2]+100*sx and old[1]-100*sy<=cy<=old[3]+100*sy:
                    translate(candidate,affine);moved.append(candidate['objectId'])
        corrections.append({'slide':n,'code':item['code'],'sourceObject':ident,'oldMm':[round(v,3) for v in original],'targetMm':[x,y,w,h],'elements':moved})

requests=[];rollback=[]
for before,after in zip(source['slides'],planned['slides']):
    original={e['objectId']:e for e in before['pageElements']}
    for element in after['pageElements']:
        old=original[element['objectId']]
        if matrix(element)!=matrix(old):
            requests.append({'updatePageElementTransform':{'objectId':element['objectId'],'transform':element['transform'],'applyMode':'ABSOLUTE'}})
            rollback.append({'updatePageElementTransform':{'objectId':old['objectId'],'transform':old.get('transform',{'scaleX':1,'scaleY':1,'unit':'EMU'}),'applyMode':'ABSOLUTE'}})
legend=next(e for e in planned['slides'][0]['pageElements'] if e['objectId']=='top_1_0013')
assert text(legend)=='2010 × 300'
requests += [{'deleteText':{'objectId':legend['objectId'],'textRange':{'type':'FIXED_RANGE','startIndex':0,'endIndex':4}}},{'insertText':{'objectId':legend['objectId'],'insertionIndex':0,'text':'1810'}}]
rollback += [{'deleteText':{'objectId':legend['objectId'],'textRange':{'type':'FIXED_RANGE','startIndex':0,'endIndex':4}}},{'insertText':{'objectId':legend['objectId'],'insertionIndex':0,'text':'2010'}}]
for element in legend['shape']['text']['textElements']:
    if 'textRun' in element:element['textRun']['content']=element['textRun']['content'].replace('2010','1810')
assert {c['slide'] for c in corrections}=={1,7,9,11,13}
for name,data in [('sync-requests.json',requests),('sync-rollback.json',rollback),('sync-review.json',corrections),('presentation-planned.json',planned)]:
    (WORK/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'requests':len(requests),'corrections':corrections,'sourceRevision':source['revisionId']},ensure_ascii=False))
