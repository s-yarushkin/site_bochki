"""Prepare native Slides edits and five duplicates from the existing album.

The diagrams remain editable Google shapes; site images come from their PDF.
This file only prepares reviewable requests. It does not call Google.
"""
from pathlib import Path
import copy,gzip,json,math,re
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=ROOT/'.local/source-album-v4'
before=json.loads((WORK/'raw-before.json').read_text('utf8'))['structuredContent'];planned=copy.deepcopy(before)
requests=[];review=[];changes=[]

def mul(a,b):
    x,y,u,v,tx,ty=a;X,Y,U,V,TX,TY=b
    return [x*X+u*Y,y*X+v*Y,x*U+u*V,y*U+v*V,x*TX+u*TY+tx,y*TX+v*TY+ty]
def matrix(e):
    t=e.get('transform')
    if t is None:return [1,0,0,1,0,0]
    unit=12700 if t.get('unit')=='PT' else 1
    return [t.get('scaleX',0),t.get('shearY',0),t.get('shearX',0),t.get('scaleY',0),t.get('translateX',0)*unit,t.get('translateY',0)*unit]
def transform(m):return dict(zip(['scaleX','shearY','shearX','scaleY','translateX','translateY'],m),unit='EMU')
def inverse(m):
    a,b,c,d,x,y=m;det=a*d-b*c
    return [d/det,-b/det,-c/det,a/det,(c*y-d*x)/det,(b*x-a*y)/det]
def entries(elements,parent=None,ancestors=()):
    for e in elements:
        m=mul(parent or [1,0,0,1,0,0],matrix(e));yield e,m,ancestors
        if 'elementGroup' in e:yield from entries(e['elementGroup']['children'],m,ancestors+(e['objectId'],))
def bbox(e,m):
    if 'elementGroup' in e:
        bs=[bbox(c,w) for c,w,_ in entries(e['elementGroup']['children'],m) if 'size' in c]
        return [min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs)]
    size=e['size'];w=size['width']['magnitude']*(12700 if size['width'].get('unit')=='PT' else 1);h=size['height']['magnitude']*(12700 if size['height'].get('unit')=='PT' else 1)
    a,b,c,d,x,y=m;pts=[(a*X+c*Y+x,b*X+d*Y+y) for X,Y in [(0,0),(w,0),(w,h),(0,h)]]
    return [min(q[0] for q in pts),min(q[1] for q in pts),max(q[0] for q in pts),max(q[1] for q in pts)]
def text(e):return ''.join(t.get('textRun',{}).get('content','') for t in e.get('shape',{}).get('text',{}).get('textElements',[])).strip()
def set_text(e,new):
    old=text(e)
    if old==new:return
    prefix=0
    while prefix<min(len(old),len(new)) and old[prefix]==new[prefix]:prefix+=1
    suffix=0
    while suffix<min(len(old)-prefix,len(new)-prefix) and old[-suffix-1]==new[-suffix-1]:suffix+=1
    end=len(old)-suffix;insert=new[prefix:len(new)-suffix if suffix else len(new)]
    if end>prefix:requests.append({'deleteText':{'objectId':e['objectId'],'textRange':{'type':'FIXED_RANGE','startIndex':prefix,'endIndex':end}}})
    if insert:requests.append({'insertText':{'objectId':e['objectId'],'insertionIndex':prefix,'text':insert}})
    # Only expected joined text is needed by local audit. Native API keeps styles.
    runs=[r for r in e['shape']['text']['textElements'] if 'textRun' in r]
    for i,r in enumerate(runs):r['textRun']['content']=new+'\n' if i==0 else ''
    changes.append({'objectId':e['objectId'],'before':old,'after':new})
def apply(e,affine):
    e['transform']=transform(mul(affine,matrix(e)))
def fit(old,target):
    rx=(target[2]-target[0])/(old[2]-old[0]) if abs(old[2]-old[0])>1 else 1
    ry=(target[3]-target[1])/(old[3]-old[1]) if abs(old[3]-old[1])>1 else 1
    return [rx,0,0,ry,target[0]-rx*old[0],target[1]-ry*old[1]]
def mapping(slide):return {e['objectId']:(e,m,anc) for e,m,anc in entries(slide['pageElements'])}
def root_for(slide,ident):
    flat=mapping(slide);e,m,anc=flat[ident];return flat[anc[0]][0] if anc else e
def anchor_bounds(slide,ident):
    flat=mapping(slide);bs=[bbox(*flat[key][:2]) for key in ident.split('+')]
    return [min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs)]
def source_id(n,ident):return f'v4_p{n}_{ident}'
def dims(o):
    a,b=o['size'];return f'{max(a,b):.0f} × {min(a,b):.0f}'
ROOM={'steam':'Парная','lounge':'Комната отдыха','wash':'Помывочная','wc':'Санузел','bedroom':'Спальня','shower':'Душевая'}

def adjust(slide,n,parent):
    original=copy.deepcopy(slide);old_top={e['objectId']:e for e in original['pageElements']}
    p=json.loads((HERE/'geometry/dimensions'/f'{n:02}.json').read_text('utf8'))
    spec=json.loads((HERE/'geometry/specs'/f'{n:02}.json').read_text('utf8'))
    oldp=json.loads((HERE/'pilot/01-dimension-source.json' if parent==1 else ROOT.parent.parent/'Планировки/3D-каталог-14-03-11-2026-v1/specs'/f'{parent:02}-dimension-source.json').read_text('utf8'))
    flat=mapping(slide);outer_id=next(it['source_object'] for it in spec['items'] if it['kind']=='wall')
    outer=bbox(*flat[outer_id][:2]);oldW,oldH=oldp['W'],oldp['H'];sx=(outer[2]-outer[0])/oldW;sy=(outer[3]-outer[1])/oldH
    target_outer=outer.copy();nsx,nsy=sx,sy
    if n!=parent:
        nsx=nsy=min((outer[2]-outer[0])/p['W'],(outer[3]-outer[1])/p['H'])
        cx,cy=(outer[0]+outer[2])/2,(outer[1]+outer[3])/2
        target_outer=[cx-p['W']*nsx/2,cy-p['H']*nsy/2,cx+p['W']*nsx/2,cy+p['H']*nsy/2]
        info=p['deformation'];axis=0 if info['axis']=='X' else 1
        def point(x,y):
            physical=[(x-outer[0])/sx,oldH-(y-outer[1])/sy]
            v=physical[axis];physical[axis]+=info['delta_mm']*max(0,min(1,(v-info['start_mm'])/(info['end_mm']-info['start_mm'])))
            return [target_outer[0]+physical[0]*nsx,target_outer[1]+(p['H']-physical[1])*nsy]
        # Existing diagram shapes, hatches, dimension lines and labels are kept.
        for e in slide['pageElements']:
            b=bbox(e,matrix(e));cx,cy=(b[0]+b[2])/2,(b[1]+b[3])/2
            if outer[0]-85*12700<=cx<=outer[2]+65*12700 and outer[1]-100*12700<=cy<=outer[3]+65*12700:
                corners=[point(b[0],b[1]),point(b[2],b[3])];target=[min(q[0] for q in corners),min(q[1] for q in corners),max(q[0] for q in corners),max(q[1] for q in corners)]
                apply(e,fit(b,target))
    # Exact furniture positions override the lounge deformation, preserving the
    # parent steam/wash rooms and source stove tunnel symbol.
    for it in spec['items']:
        if it['category']!='objects':continue
        flat=mapping(slide);ident=it['source_object'];b=anchor_bounds(slide,ident)
        x,y=it['xy_mm'];w,h=it['size_mm']
        target=[target_outer[0]+x*nsx,target_outer[1]+(p['H']-y-h)*nsy,target_outer[0]+(x+w)*nsx,target_outer[1]+(p['H']-y)*nsy]
        if max(abs(a-bb) for a,bb in zip(b,target))<.02*12700:continue
        affine=fit(b,target)
        roots={root_for(slide,key)['objectId']:root_for(slide,key) for key in ident.split('+')}
        for root in roots.values():apply(root,affine)
        # Added source objects sometimes have a separate code label.
        if not any(flat[key][2] for key in ident.split('+')):
            for candidate in slide['pageElements']:
                if text(candidate)!=it['code']:continue
                cb=bbox(candidate,matrix(candidate));cx=(cb[0]+cb[2])/2;cy=(cb[1]+cb[3])/2
                if b[0]-100*nsx<=cx<=b[2]+100*nsx and b[1]-100*nsy<=cy<=b[3]+100*nsy:apply(candidate,affine)
        review.append({'slide':n,'code':it['code'],'sourceObject':ident,'targetMm':[x,y,w,h]})
    if n!=parent:
        # Keep the original door/window symbols and their actual opening widths.
        # A room extension must not stretch a door or shift the entrance.
        oldslide=before['slides'][parent-1];oldflat=mapping(oldslide)
        oldspec=json.loads((HERE/'pilot/01.json' if parent==1 else HERE.parent/'home-hero/layouts/specs'/f'{parent:02}.json').read_text('utf8'))
        oldouter_id=next(it['source_object'] for it in oldspec['items'] if it['kind']=='wall')
        oldouter=bbox(*oldflat[oldouter_id][:2]);osx=(oldouter[2]-oldouter[0])/oldW;osy=(oldouter[3]-oldouter[1])/oldH
        for it in spec['items']:
            if it['kind'] not in ['door','window']:continue
            oldit=next(o for o in oldspec['items'] if o['id']==it['id'].replace(f'DP{n:02}',f'DP{parent:02}'))
            b=anchor_bounds(oldslide,oldit['source_object'])
            x=(b[0]-oldouter[0])/osx;y=oldH-(b[3]-oldouter[1])/osy;w=(b[2]-b[0])/osx;h=(b[3]-b[1])/osy
            dx,dy=[it['center_mm'][k]-oldit['center_mm'][k] for k in [0,1]]
            target=[target_outer[0]+(x+dx)*nsx,target_outer[1]+(p['H']-y-dy-h)*nsy,target_outer[0]+(x+dx+w)*nsx,target_outer[1]+(p['H']-y-dy)*nsy]
            current=anchor_bounds(slide,it['source_object']);apply(root_for(slide,it['source_object']),fit(current,target))
    # Retire the second step now replaced by one continuous sliding lower shelf.
    if parent==12:
        retired_old=json.loads((ROOT.parent.parent/'Планировки/3D-каталог-14-03-11-2026-v1/specs/12-dimension-source.json').read_text('utf8'))
        retired=next(o for o in retired_old['objects'] if o['code']=='СТ2')['source_object'];retired=source_id(n,retired) if n!=parent else retired
        if retired in mapping(slide):
            root=root_for(slide,retired);slide['pageElements'].remove(root);requests.append({'deleteObject':{'objectId':root['objectId']}})
        to_delete=[]
        for e in slide['pageElements']:
            if text(e).startswith('СТ2  '):
                by=bbox(e,matrix(e))[1];to_delete.append(e)
                to_delete.extend(q for q in slide['pageElements'] if q is not e and abs(bbox(q,matrix(q))[1]-by)<12700 and text(q)=='940 × 300')
        for e in to_delete:slide['pageElements'].remove(e);requests.append({'deleteObject':{'objectId':e['objectId']}})
    # Update existing legend rows, dimension chains, titles and page numbers.
    flat=list(entries(slide['pageElements']));right=[e for e,m,a in flat if 'size' in e and bbox(e,m)[0]>900*12700 and text(e)]
    objects={o['code']:o for o in p['objects']}
    for e in right:
        t=text(e);code=t.split('  ')[0]
        if code not in objects:continue
        o=objects[code];b=bbox(e,matrix(e));row=[q for q in right if bbox(q,matrix(q))[0]>1160*12700 and abs(bbox(q,matrix(q))[1]-b[1])<12700]
        if row and o['kind']!='stove':set_text(row[0],dims(o))
        if o.get('sliding'):set_text(e,code+'  Выдвижной полок')
    for room in p['rooms']:
        matches=[e for e in right if re.match(str(room['number'])+r'\s+',text(e))]
        if not matches:continue
        e=matches[0];set_text(e,f"{room['number']}  {ROOM[room['kind']]} · {room['area_m2']:.2f} м²".replace('.',','))
        b=bbox(e,matrix(e));near=[q for q in right if abs(bbox(q,matrix(q))[1]-b[1]-24*12700)<12700]
        if near and '×' in text(near[0]):
            xs=[q[0] for q in room['polygon']];ys=[q[1] for q in room['polygon']]
            set_text(near[0],f'{max(xs)-min(xs):.0f} × {max(ys)-min(ys):.0f} мм')
    if n!=parent:
        title=next(e for e,m,a in flat if text(e).startswith(('Квадро ','Парус / Викинг ')) and bbox(e,m)[1]<120*12700)
        family='Квадро Хаус' if n==17 else 'Квадро' if n in [15,16] else 'Парус / Викинг'
        set_text(title,f"{family} {p['W']/1000:g} × {p['H']/1000:g} м".replace('.',','))
        for e,m,a in flat:
            t=text(e)
            if t==f'{parent:02}' and bbox(e,m)[1]>840*12700:set_text(e,f'{n:02}')
            if not t.isdigit() or not 1000<=int(t)<=6000 or bbox(e,m)[0]>900*12700:continue
            value=int(t)
            # Parent native dimension labels: overall and lounge clear span.
            if value==oldW and n!=17:set_text(e,str(p['W']))
            elif value==oldH and n==17 and bbox(e,m)[3]-bbox(e,m)[1]>bbox(e,m)[2]-bbox(e,m)[0]:set_text(e,str(p['H']))
            elif n in [15,16,18] and value==oldW-45-min(x for r in oldp['rooms'] if r['kind']=='lounge' for x,y in r['polygon']):set_text(e,str(value+500))
            elif n==19 and value==1600:set_text(e,'2100')
    # Only top-level transforms are sent; children retain their editable structure.
    for e in slide['pageElements']:
        old=old_top.get(e['objectId'])
        if old and matrix(old)!=matrix(e):requests.append({'updatePageElementTransform':{'objectId':e['objectId'],'transform':e['transform'],'applyMode':'ABSOLUTE'}})
    # A longer bench or room must not stretch code letters or numbered circles.
    # Retain each native caption's original proportions and centre it where its
    # resized parent placed it. Only the whole diagram's uniform fit is applied.
    reference=mapping(before['slides'][parent-1]);current=mapping(slide)
    uniform=min(nsx/sx,nsy/sy)
    for ident,(e,m,anc) in list(current.items()):
        if not text(e) or 'size' not in e:continue
        oldid=ident.removeprefix(f'v4_p{n}_') if n!=parent else ident
        if oldid not in reference:continue
        olde,oldm,olda=reference[oldid];ob=bbox(olde,oldm);cx,cy=(ob[0]+ob[2])/2,(ob[1]+ob[3])/2
        oldframe=bbox(*reference[next(i['source_object'] for i in json.loads((HERE/'pilot/01.json' if parent==1 else HERE.parent/'home-hero/layouts/specs'/f'{parent:02}.json').read_text('utf8'))['items'] if i['kind']=='wall')][:2])
        if not (oldframe[0]-85*12700<=cx<=oldframe[2]+65*12700 and oldframe[1]-100*12700<=cy<=oldframe[3]+65*12700):continue
        width=e['size']['width']['magnitude']*(12700 if e['size']['width'].get('unit')=='PT' else 1);height=e['size']['height']['magnitude']*(12700 if e['size']['height'].get('unit')=='PT' else 1)
        center=[m[0]*width/2+m[2]*height/2+m[4],m[1]*width/2+m[3]*height/2+m[5]]
        wanted=[oldm[k]*uniform for k in range(4)]+[0,0]
        wanted[4]=center[0]-wanted[0]*width/2-wanted[2]*height/2;wanted[5]=center[1]-wanted[1]*width/2-wanted[3]*height/2
        parent_matrix=current[anc[-1]][1] if anc else [1,0,0,1,0,0]
        local=mul(inverse(parent_matrix),wanted)
        if max(abs(a-b) for a,b in zip(matrix(e),local))>.0001:
            e['transform']=transform(local)
            # The read resource stores a group-relative matrix, but an ABSOLUTE
            # update request is interpreted in page coordinates by Slides.
            requests.append({'updatePageElementTransform':{'objectId':ident,'transform':transform(wanted),'applyMode':'ABSOLUTE'}})
    # Every actual footprint must match the numerical 3D source.
    flat=mapping(slide)
    for it in spec['items']:
        if it['category']!='objects':continue
        b=anchor_bounds(slide,it['source_object']);actual=[(b[0]-target_outer[0])/nsx,p['H']-(b[3]-target_outer[1])/nsy,(b[2]-b[0])/nsx,(b[3]-b[1])/nsy]
        desired=it['xy_mm']+it['size_mm'];assert max(abs(a-b) for a,b in zip(actual,desired))<1,(n,it['code'],actual,desired)

for n,slide in enumerate(planned['slides'],1):adjust(slide,n,n)
for n,parent in [(15,1),(16,2),(17,6),(18,14),(19,12)]:
    base=planned['slides'][parent-1];duplicate=copy.deepcopy(base)
    ids={base['objectId']:f'dp_p{n}'}
    ids.update({e['objectId']:source_id(n,e['objectId']) for e,m,a in entries(base['pageElements'])})
    duplicate['objectId']=f'dp_p{n}'
    for e,m,a in entries(duplicate['pageElements']):e['objectId']=ids[e['objectId']]
    requests.append({'duplicateObject':{'objectId':base['objectId'],'objectIds':ids}})
    planned['slides'].append(duplicate);adjust(duplicate,n,parent)
archive=HERE/'album/archive-v3';archive.mkdir(exist_ok=True)
for name in ['native-presentation.json.gz','native-album.pdf','manifest.json','audit.json']:
    target=archive/name
    if not target.exists():target.write_bytes((HERE/'album'/name).read_bytes())
for name,data in [('requests.json',requests),('planned.json',planned),('review.json',{'nativeSlides':19,'parentMapping':{15:1,16:2,17:6,18:14,19:12},'geometryCorrections':review,'textChanges':changes,'sourceRevision':before['revisionId']})]:
    (WORK/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps({'requests':len(requests),'slides':len(planned['slides']),'footprintsVerified':sum(len(json.loads((HERE/'geometry/specs'/f'{n:02}.json').read_text('utf8'))['mapping']) for n in range(1,20)),'textChanges':len(changes),'sourceRevision':before['revisionId']},ensure_ascii=False))

# A bounded repair after visual QA can be sent without duplicating slides again.
if (WORK/'raw-final.json').exists():
    latest=WORK/'raw-repaired.json' if (WORK/'raw-repaired.json').exists() else WORK/'raw-final.json'
    actual=json.loads(latest.read_text('utf8'))['structuredContent'];requests=[];changes=[]
    for wanted,readback in zip(planned['slides'],actual['slides']):
        a=mapping(wanted);b=mapping(readback);assert a.keys()==b.keys()
        for ident,(e,m,anc) in a.items():
            other=b[ident][0];oldmatrix=matrix(other);newmatrix=matrix(e)
            world_change=max(abs(x-y) for x,y in zip(bbox(e,m),bbox(*b[ident][:2]))) if 'size' in e or 'elementGroup' in e else 0
            local_change=max(abs(x-y) for x,y in zip(oldmatrix[:4],newmatrix[:4]))>1e-7 or max(abs(x-y) for x,y in zip(oldmatrix[4:],newmatrix[4:]))>.1
            if world_change>.05*12700 and local_change:
                requests.append({'updatePageElementTransform':{'objectId':ident,'transform':transform(m),'applyMode':'ABSOLUTE'}})
            if text(e)!=text(other):set_text(other,text(e))
    (WORK/'repair-requests.json').write_text(json.dumps(requests,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({'repairRequests':len(requests),'textRepairs':len(changes),'sourceRevision':actual['revisionId']},ensure_ascii=False))
