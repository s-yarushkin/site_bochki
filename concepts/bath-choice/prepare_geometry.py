"""Prepare 19 dimensioned planning models from the existing 14 editable parents."""
from pathlib import Path
import argparse, copy, hashlib, json, math, sys

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--plans',type=int,nargs='+',default=list(range(1,20)))
args=parser.parse_args()
SOURCE=args.source.resolve();DIMENSIONS=SOURCE.parent/'3D-альбом-14-03-11-2026-v2'
sys.path.insert(0,str(DIMENSIONS/'python-libs'))
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, triangulate

OUT=HERE/'geometry';OUT.mkdir(exist_ok=True)
for name in ['dimensions','specs','models','scenes','previews','qa']:(OUT/name).mkdir(exist_ok=True)
REV='bath-choice-v4-2026-11-04'

def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
def polygons(g):
    if g.is_empty:return []
    if g.geom_type=='Polygon':return [g]
    return [p for c in g.geoms for p in polygons(c)]
def band(g,lo,hi):
    from shapely.geometry.polygon import orient
    ps=[orient(p,sign=1) for p in polygons(g) if p.area>.001]
    return {'z0':lo,'z1':hi,'polygons':[{'outer':list(p.exterior.coords)[:-1],'holes':[list(r.coords)[:-1] for r in p.interiors]} for p in ps],
            'triangles':[list(t.exterior.coords)[:-1] for p in ps for t in triangulate(p) if p.covers(t.representative_point()) and t.difference(p).area<.00001]}
def wall_polygon(w,thickness=None):
    return LineString([w['a'],w['b']]).buffer((thickness or w['thickness'])/2,cap_style=2)
def source_id(number,value):
    return f'v4_p{number}_{value}' if value and value not in ['front','rear','left','right'] else value
def clone_ids(p,number):
    for w in p['walls']:
        w['id']=source_id(number,w['id']);w['source_object']=source_id(number,w['source_object'])
    for group in ['objects','openings','doors']:
        for item in p[group]:
            for key in ['id','wall','source_object']:
                if key in item:item[key]=source_id(number,item[key])
    p['source_slide']=f'dp_p{number}'
def translate_record(o,dx,dy):
    for key in ['xy','center','hinge_xy','deployed_xy']:
        if key in o:o[key]=[o[key][0]+dx,o[key][1]+dy]
    for key in ['tunnel_bbox','source_bbox_mm']:
        if key in o:o[key]=[o[key][0]+dx,o[key][1]+dy,o[key][2]+dx,o[key][3]+dy]
    for key in ['leaf_polygon_open','leaf_polygon_at_90','sweep_polygon']:
        if key in o:o[key]=[[x+dx,y+dy] for x,y in o[key]]

def extend(parent,number):
    p=copy.deepcopy(parent);p['parent_plan']=parent['n'];p['n']=number
    house=number==17;delta=1000 if house else 500
    oldW,oldH=p['W'],p['H']
    lounge=next(r for r in p['rooms'] if r['kind']=='lounge')
    cut=1855 if house else max(x for x,y in lounge['polygon'] if x<oldW-46)
    def move(value):
        end=1855 if house else oldW-45
        start=45 if house else cut
        return value+delta*max(0,min(1,(value-start)/(end-start)))
    def point(q):return [q[0],move(q[1])] if house else [move(q[0]),q[1]]
    p['H' if house else 'W']+=delta
    for w in p['walls']:
        w['a']=point(w['a']);w['b']=point(w['b'])
    for r in p['rooms']:r['polygon']=[point(q) for q in r['polygon']]
    for group in ['openings','doors']:
        for o in p[group]:
            dx=dy=0
            if house:
                if o['center'][1]>=1855:dy=1000
                elif o.get('type')=='window':dy=500
            elif o['wall']=='right':dx=500
            translate_record(o,dx,dy)
    for o in p['objects']:
        if house:
            if o['xy'][1]>=1900:translate_record(o,0,1000)
            elif o['code']=='Л1':translate_record(o,0,1000);o['size'][0]=1800
            elif o['code']=='Л2':o['size'][0]=1800
            elif o['kind']=='table':o['xy']=[200,900];o['size']=[1800,1000]
        elif o['kind'] in ['bench','table'] and o['xy'][0]>=cut:
            o['size'][0]+=500
        elif o['kind'] in ['hanger','storage'] and o['xy'][0]>oldW-1500:
            translate_record(o,500,0)
    p['deformation']={'axis':'Y' if house else 'X','delta_mm':delta,'start_mm':45 if house else cut,'end_mm':1855 if house else oldW-45}
    clone_ids(p,number)
    return p

def mechanical_changes(p):
    n=p.get('parent_plan',p['n']);objects=p['objects']
    if n==6:
        low=next(o for o in objects if o['code']=='СТ1');upper=next(o for o in objects if o['code']=='ВП2')
        low['xy']=[upper['xy'][0]+upper['size'][0],upper['xy'][1]];low['size']=[300,upper['size'][1]]
        cross=next(o for o in objects if o['code']=='НС1');cross['xy'][0]=low['xy'][0]+300
    if n==12:
        low=next(o for o in objects if o['code']=='СТ1')
        low['xy']=[745,45];low['size']=[300,1910]
        retired=next((o for o in objects if o['code']=='СТ2'),None)
        if retired:
            p['retired_source_objects']=[retired['source_object']]
            p['objects']=[o for o in objects if o is not retired];objects=p['objects']
    if n==14:
        low=next(o for o in objects if o['code']=='НС1');low['size']=[300,2310]
    primary=max((o for o in objects if o['kind']=='lower'),key=lambda o:max(o['size']))
    axis=0 if primary['size'][0]>=primary['size'][1] else 1;cross=1-axis
    candidates=[o for o in objects if o['kind']=='upper' and o['size'][axis]>o['size'][cross] and o['size'][axis]>=primary['size'][axis]-1]
    upper=min(candidates,key=lambda o:abs((o['xy'][cross]+o['size'][cross]/2)-(primary['xy'][cross]+primary['size'][cross]/2)))
    toward=primary['xy'][cross]+primary['size'][cross]/2>upper['xy'][cross]+upper['size'][cross]/2
    target=upper['xy'][cross]+upper['size'][cross]-primary['size'][cross]-30 if toward else upper['xy'][cross]+30
    offset=[0,0,0];offset[cross]=round(target-primary['xy'][cross],3)
    primary.update(sliding=True,slide_offset_mm=offset,slide_target_upper=upper['source_object'])
    p['moving_source_object']=primary['source_object']
    return primary

def rebuild(p):
    for w in p['walls']:
        dx=w['b'][0]-w['a'][0];dy=w['b'][1]-w['a'][1];w['length']=math.hypot(dx,dy);w['u']=[dx/w['length'],dy/w['length']];w['angle_deg']=math.degrees(math.atan2(dy,dx))
    walls={w['id']:w for w in p['walls']}
    for group in ['openings','doors']:
        for o in p[group]:
            w=walls[o['wall']];s=sum((o['center'][k]-w['a'][k])*w['u'][k] for k in [0,1]);o.update(s0=s-o['width']/2,s1=s+o['width']/2,u=w['u'])
            assert LineString([w['a'],w['b']]).distance(Point(o['center']))<1,(p['n'],o['id'],'opening is off its wall')
            assert o['s0']>-.1 and o['s1']<w['length']+.1,(p['n'],o['id'],'opening exceeds wall')
    for r in p['rooms']:r['area_m2']=round(Polygon(r['polygon']).area/1e6,4)
    union=unary_union([wall_polygon(w) for w in p['walls']]);slots=[]
    for o in p['openings']:
        w=walls[o['wall']];a=[w['a'][k]+w['u'][k]*o['s0'] for k in [0,1]];b=[w['a'][k]+w['u'][k]*o['s1'] for k in [0,1]]
        slots.append({'poly':LineString([a,b]).buffer(90,cap_style=2),'z0':o.get('sill_z',0),'z1':o.get('top_z',o.get('height',2000))})
    stove=next(o for o in p['objects'] if o['kind']=='stove')
    slots.append({'poly':box(*stove['tunnel_bbox']).buffer(2),'z0':stove['firebox_bottom']+15,'z1':stove['firebox_top']-15})
    levels=sorted({0,p['height_mm'],750,1100,*[s[k] for s in slots for k in ['z0','z1']]})
    p['wall_bands_full']=[]
    for lo,hi in zip(levels,levels[1:]):
        cuts=unary_union([s['poly'] for s in slots if s['z0']<=lo+.01 and s['z1']>=hi-.01])
        p['wall_bands_full'].append(band(union.difference(cuts).intersection(box(0,0,p['W'],p['H'])),lo,hi))
    # A 600 mm person must be able to reach every room in the deployed plan.
    doorcuts=unary_union([s['poly'] for s in slots[:-1] if s['z0']==0])
    fixtures=unary_union([box(*o['xy'],o['xy'][0]+o['size'][0],o['xy'][1]+o['size'][1]).buffer(25 if o['kind']=='stove' else 0) for o in p['objects'] if o['kind']!='shower'])
    leaves=unary_union([Polygon(d['leaf_polygon_open']) for d in p['doors']])
    free=box(0,0,p['W'],p['H']).difference(union.difference(doorcuts).union(fixtures).union(leaves)).buffer(-300)
    entry=next(d for d in p['doors'] if d['kind']=='entry');seed=Point([entry['center'][k]-entry['outward'][k]*360 for k in [0,1]])
    components=polygons(free);component=min(components,key=lambda g:g.distance(seed)) if components else Polygon()
    reached=[r['kind'] for r in p['rooms'] if component.intersection(Polygon(r['polygon'])).area>20000]
    p['human_route']={'body_diameter_mm':600,'reachable_rooms':reached,'all_rooms_reachable':len(reached)==len(p['rooms']) and component.distance(seed)<100}
    return union

def specification(p,parent_spec):
    n=p['n'];parent=p.get('parent_plan',n);s=copy.deepcopy(parent_spec)
    def ident(old):return old.replace(f'DP{parent:02}',f'DP{n:02}')
    s['plan']=n;s['parent_plan']=parent;s['revision']=REV;s['title']=p['name'];s['outer_mm']=[p['W'],p['H'],p['height_mm']]
    s['native_slide']=f'p{n}' if n<15 else f'dp_p{n}'
    s['native_source']='https://docs.google.com/presentation/d/1GuLDnKUWfHckXYGTN2Ux5ItNFVd8GAPmY6Qklr7E7b8/edit#slide=id.'+s['native_slide']
    objects={o['code']:o for o in p['objects']};walls={w['id']:w for w in p['walls']};items=[];wall_parts=[];mapping={}
    for it in s['items']:
        it['id']=ident(it['id']);old_source=it.get('source_object')
        if n!=parent and old_source:it['source_object']=source_id(n,old_source)
        if it['category']=='objects':
            o=objects.get(it['code'])
            if o is None:continue
            it.update(xy_mm=o['xy'],size_mm=o['size'],source_record=o,surface_z_mm=o['z']+o['height'])
            if o.get('sliding'):it.update(sliding=True,slide_offset_mm=o['slide_offset_mm'],label='Выдвижной нижний полок',z_mm=0,height_mm=o['z']+o['height'])
            if o['kind']=='stove':it.update(tunnel_bbox_mm=o['tunnel_bbox'])
        elif it['kind']=='door':
            d=next(d for d in p['doors'] if d['source_object']==it['source_object']);c=d['center'];u=d['u'];sz=[abs(u[0])*d['width']+abs(u[1])*45,abs(u[1])*d['width']+abs(u[0])*45]
            it.update(center_mm=c,xy_mm=[c[k]-sz[k]/2 for k in [0,1]],size_mm=sz,hinge_xy_mm=d['hinge_xy'],leaf_polygon_open=d['leaf_polygon_open'],source_record=d)
        elif it['kind']=='window':
            d=next(d for d in p['openings'] if d['source_object']==it['source_object']);c=d['center'];u=d['u'];sz=[abs(u[0])*d['width']+abs(u[1])*45,abs(u[1])*d['width']+abs(u[0])*45]
            it.update(center_mm=c,xy_mm=[c[k]-sz[k]/2 for k in [0,1]],size_mm=sz,source_record=d)
        elif it['kind']=='wall':
            key=source_id(n,it['wall_id']) if n!=parent else it['wall_id'];w=walls[key];b=wall_polygon(w).bounds
            it.update(wall_id=w['id'],a_mm=w['a'],b_mm=w['b'],length_mm=w['length'],xy_mm=list(b[:2]),size_mm=[b[2]-b[0],b[3]-b[1]],source_record=w)
            wall_parts.append({'id':it['id'],'wall_id':w['id'],'external':w['external'],'a':w['a'],'b':w['b'],'u':w['u'],'polygon':wall_polygon(w),'bands':[]})
        elif it['kind']=='floor':
            r=next(r for r in p['rooms'] if r['number']==int(it['id'].split('-R')[1]));b=Polygon(r['polygon']).bounds
            it.update(xy_mm=list(b[:2]),size_mm=[b[2]-b[0],b[3]-b[1]],area_m2=r['area_m2'],polygon_mm=r['polygon'])
        items.append(it)
        if it.get('source_object'):mapping[it['source_object']]=it['id']
    for layer in p['wall_bands_full']:
        remaining=unary_union([Polygon(q['outer'],q.get('holes',[])) for q in layer['polygons']])
        for part in wall_parts:
            chunk=remaining.intersection(part['polygon']);remaining=remaining.difference(part['polygon'])
            if not chunk.is_empty:part['bands'].append(band(chunk,layer['z0'],layer['z1']))
        assert remaining.area<.02
    for part in wall_parts:del part['polygon']
    s.update(items=items,mapping=mapping,rooms=p['rooms'],human_route=p['human_route'])
    s['dimension_sha256']=hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest()
    s['public_specification']={'rooms':[{'label':r['kind'],'area_m2':r['area_m2']} for r in p['rooms']],
        'items':[{'code':it['code'],'label':'Печь' if it['kind']=='stove' else it['label'],'dimensions':str(it.get('opening_width_mm',''))+' мм' if it['kind'] in ['door','window'] else '' if it['kind']=='stove' else ' × '.join(f'{x:g}' for x in it['size_mm'])+' мм'} for it in items if it['kind'] not in ['wall','floor','accessory']]}
    return s,wall_parts

base={};registry=json.loads((HERE.parent/'home-hero/layouts/index.json').read_text('utf8'))['plans'];plans=[]
for n in range(1,15):
    pilot=n==1
    p=json.loads(((HERE/'pilot/01-dimension-source.json') if pilot else SOURCE/'specs'/f'{n:02}-dimension-source.json').read_text('utf8'))
    p['revision']=REV;p['parent_plan']=n
    mechanical_changes(p);base[n]=p
    r=copy.deepcopy(next(r for r in registry if r['number']==n));r['models']=['parus','viking'] if n in [12,13,14] else r['models'];plans.append(r)
for n,parent,size,models,title in [(15,1,'450',['kvadro'],'Квадро 4,5 м'),(16,2,'550',['kvadro'],'Квадро 5,5 м'),(17,6,'5x4',['kvadro-house'],'Квадро Хаус 4×5 м'),(18,14,'450',['parus','viking'],'Парус / Викинг 4,5 м'),(19,12,'550',['parus','viking'],'Парус / Викинг 5,5 м')]:
    p=extend(base[parent],n);p['name']=title;mechanical_changes(p);base[n]=p
    plans.append({'id':f'dp3d-{n:02}','number':n,'models':models,'size':size,'label':title})
summary=[]
for n,p in base.items():
    rebuild(p);parent=p['parent_plan'];parent_spec=json.loads(((HERE/'pilot/01.json') if parent==1 else HERE.parent/'home-hero/layouts/specs'/f'{parent:02}.json').read_text('utf8'))
    spec,walls=specification(p,parent_spec)
    if n in args.plans:
        write(OUT/'dimensions'/f'{n:02}.json',p);write(OUT/'specs'/f'{n:02}.json',spec);write(OUT/'specs'/f'{n:02}-walls.json',walls)
    moving=next(o for o in p['objects'] if o.get('sliding'))
    summary.append({'number':n,'parent':parent,'route':p['human_route'],'sliding':moving['code'],'size_mm':moving['size'],'offset_mm':moving['slide_offset_mm']})
    row=next(r for r in plans if r['number']==n);row.update(revision=REV,dimension_sha256=spec['dimension_sha256'],parent=parent)
write(OUT/'index-draft.json',{'version':REV,'plans':plans});write(OUT/'qa/dimension-review.json',summary)
print(json.dumps({'geometries':len(plans),'coveredPairs':len({(m,p['size']) for p in plans for m in p['models']}),'routesPassed':sum(s['route']['all_rooms_reachable'] for s in summary),'written':args.plans},ensure_ascii=False))
