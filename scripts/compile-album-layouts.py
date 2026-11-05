"""Compile the approved dimension records to paired GLB/specification files.

Furniture materials and detailing come from the reviewed v14 source GLBs.
Walls are rebuilt around the current, dimensioned openings. No prices are read.
"""
import copy,csv,hashlib,json,math,struct,subprocess,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'engineering/layouts/album-2026-11-05.json'
OUT=ROOT/'concepts/home-hero/layouts'
BASE_REF='3c624236baf2cd2eff2d80250b021494c5ce50be'
TEMPLATES={15:1,16:2,17:6,18:14,19:12,20:1,21:1,22:8}
CACHE={}
def git_bytes(path):
    return subprocess.check_output(['git','show',BASE_REF+':'+path],cwd=ROOT)
def source_model(no):
    if no in CACHE:return CACHE[no]
    data=git_bytes(f'concepts/home-hero/layouts/models/{no:02}.glb')
    length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+length]);offset=20+length
    size=struct.unpack_from('<I',data,offset)[0];binary=data[offset+8:offset+8+size]
    spec=json.loads(git_bytes(f'concepts/home-hero/layouts/specs/{no:02}.json'))
    CACHE[no]=(g,binary,spec);return CACHE[no]

class Bundle:
    def __init__(self):
        self.g={'asset':{'version':'2.0','generator':'DachaPar dimension compiler 2026-11-05'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'textures':[],'images':[],'samplers':[],'buffers':[{'byteLength':0}]}
        self.bin=bytearray();self.memo={};self.extensions=set()
    def view(self,data,target=None):
        while len(self.bin)%4:self.bin.append(0)
        obj={'buffer':0,'byteOffset':len(self.bin),'byteLength':len(data)}
        if target:obj['target']=target
        self.bin.extend(data);i=len(self.g['bufferViews']);self.g['bufferViews'].append(obj);return i
    def array(self,data,kind='VEC3',component=5126):
        fmt={5126:'f',5123:'H',5125:'I'}[component];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind]
        flat=[v for row in data for v in row] if data and isinstance(data[0],(tuple,list)) else data
        vi=self.view(struct.pack('<'+fmt*len(flat),*flat),34963 if kind=='SCALAR' else 34962)
        a={'bufferView':vi,'componentType':component,'count':len(flat)//n,'type':kind}
        if kind=='VEC3':a.update(min=[min(flat[j::3]) for j in range(3)],max=[max(flat[j::3]) for j in range(3)])
        i=len(self.g['accessors']);self.g['accessors'].append(a);return i
    def import_ref(self,no,kind,idx):
        key=(no,kind,idx)
        if key in self.memo:return self.memo[key]
        src,binary,_=source_model(no);v=copy.deepcopy(src[kind][idx]);new=len(self.g[kind]);self.memo[key]=new;self.g[kind].append(v)
        if kind=='bufferViews':
            offset=v.get('byteOffset',0);vv=self.view(binary[offset:offset+v['byteLength']],v.get('target'))
            # view() appended one extra entry. Keep the reserved index.
            v.update(self.g['bufferViews'].pop());v['buffer']=0
        elif kind=='accessors':
            if 'bufferView'in v:v['bufferView']=self.import_ref(no,'bufferViews',v['bufferView'])
            if 'sparse'in v:
                for k in ['indices','values']:v['sparse'][k]['bufferView']=self.import_ref(no,'bufferViews',v['sparse'][k]['bufferView'])
        elif kind=='images':
            if 'bufferView'in v:v['bufferView']=self.import_ref(no,'bufferViews',v['bufferView'])
            assert 'uri'not in v,'Embedded source images required'
        elif kind=='textures':
            if 'source'in v:v['source']=self.import_ref(no,'images',v['source'])
            if 'sampler'in v:v['sampler']=self.import_ref(no,'samplers',v['sampler'])
        elif kind=='materials':
            def textures(x):
                if isinstance(x,dict):
                    for k,c in x.items():
                        if k.endswith('Texture') and isinstance(c,dict) and 'index'in c:c['index']=self.import_ref(no,'textures',c['index'])
                        else:textures(c)
                elif isinstance(x,list):
                    for c in x:textures(c)
            textures(v)
        elif kind=='meshes':
            for p in v['primitives']:
                p['attributes']={k:self.import_ref(no,'accessors',j) for k,j in p['attributes'].items()}
                if 'indices'in p:p['indices']=self.import_ref(no,'accessors',p['indices'])
                if 'material'in p:p['material']=self.import_ref(no,'materials',p['material'])
        elif kind=='nodes':
            if 'mesh'in v:v['mesh']=self.import_ref(no,'meshes',v['mesh'])
            if 'children'in v:v['children']=[self.import_ref(no,'nodes',j) for j in v['children']]
            # Keep hinge mechanics, but never carry old specification IDs into a new plan.
            source_extra=v.pop('extras',{})
            if source_extra.get('door_pivot') is True:
                v['extras']={key:source_extra[key] for key in ['door_pivot','closed_radians','open_sign','max_angle_radians']}
        self.extensions.update(src.get('extensionsUsed',[]));return new
    def node(self,obj):
        i=len(self.g['nodes']);self.g['nodes'].append(obj);return i
    def material(self,name,color,roughness=.75,alpha=1):
        i=len(self.g['materials']);m={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,alpha],'metallicFactor':0,'roughnessFactor':roughness}}
        if alpha<1:m.update(alphaMode='BLEND',doubleSided=True)
        self.g['materials'].append(m);return i
    def box(self,center,dimensions,mat,angle=0):
        w,h,d=dimensions;positions=[];normals=[];uv=[];indices=[]
        faces=[([1,0,0],[(.5,-.5,-.5),(.5,.5,-.5),(.5,.5,.5),(.5,-.5,.5)]),([-1,0,0],[(-.5,-.5,.5),(-.5,.5,.5),(-.5,.5,-.5),(-.5,-.5,-.5)]),([0,1,0],[(-.5,.5,-.5),(-.5,.5,.5),(.5,.5,.5),(.5,.5,-.5)]),([0,-1,0],[(-.5,-.5,.5),(-.5,-.5,-.5),(.5,-.5,-.5),(.5,-.5,.5)]),([0,0,1],[(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5),(-.5,-.5,.5)]),([0,0,-1],[(-.5,-.5,-.5),(-.5,.5,-.5),(.5,.5,-.5),(.5,-.5,-.5)])]
        for n,ps in faces:
            off=len(positions);positions.extend([[x*w,y*h,z*d] for x,y,z in ps]);normals.extend([n]*4);uv.extend([[0,0],[0,max(h,d)*.7],[max(w,d)*.7,max(h,d)*.7],[max(w,d)*.7,0]]);indices += [off,off+1,off+2,off,off+2,off+3]
        mesh={'primitives':[{'attributes':{'POSITION':self.array(positions),'NORMAL':self.array(normals),'TEXCOORD_0':self.array(uv,'VEC2')},'indices':self.array(indices,'SCALAR',5123),'material':mat}]}
        mi=len(self.g['meshes']);self.g['meshes'].append(mesh)
        return self.node({'mesh':mi,'translation':center,'rotation':[0,math.sin(angle/2),0,math.cos(angle/2)]})
    def floor(self,points,mat):
        ps=[q for i,q in enumerate(points) if i==0 or math.dist(q,points[i-1])>.1]
        if math.dist(ps[0],ps[-1])<.1:ps.pop()
        signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ps,ps[1:]+ps[:1]))
        if signed<0:ps.reverse()
        def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        remaining=list(range(len(ps)));tri=[]
        for _ in range(len(ps)**2):
            if len(remaining)==3:tri+=remaining;break
            found=False
            for j,mid in enumerate(remaining):
                a,b,c=remaining[j-1],mid,remaining[(j+1)%len(remaining)]
                if cross(ps[a],ps[b],ps[c])<1e-4:continue
                if any(cross(ps[a],ps[b],ps[k])>-.01 and cross(ps[b],ps[c],ps[k])>-.01 and cross(ps[c],ps[a],ps[k])>-.01 for k in remaining if k not in [a,b,c]):continue
                tri += [a,b,c];remaining.pop(j);found=True;break
            if not found:raise ValueError('Non-simple room polygon')
        verts=[[x/1000,.003,-y/1000] for x,y in ps];mesh={'primitives':[{'attributes':{'POSITION':self.array(verts),'NORMAL':self.array([[0,1,0]]*len(ps)),'TEXCOORD_0':self.array([[x/1200,y/1200] for x,y in ps],'VEC2')},'indices':self.array(tri,'SCALAR',5123),'material':mat}]}
        mi=len(self.g['meshes']);self.g['meshes'].append(mesh);return self.node({'mesh':mi})
    def save(self,path,root,extras):
        self.g['scenes'][0]['nodes']=[self.node({'name':'DachaPar_'+str(extras['plan']),'children':root,'extras':extras})]
        self.g['extensionsUsed']=sorted(self.extensions);self.g['buffers'][0]['byteLength']=len(self.bin)
        js=json.dumps(self.g,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4);self.bin.extend(b'\0'*((-len(self.bin))%4));total=12+8+len(js)+8+len(self.bin)
        path.write_bytes(struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(self.bin),0x004e4942)+self.bin)

def affine(old,new,rotate=False):
    ox,oy=old['xy_mm'];ow,oh=old['size_mm'];nx,ny=new['xy_mm'];nw,nh=new['size_mm'];oz=old.get('z_mm',0);nz=new.get('z_mm',oz);zscale=1
    if new['kind']=='coffee_table':zscale=.6
    if rotate:
        ax=nw/oh;by=nh/ow
        if rotate=='ccw':
            return [0,0,-by,0,0,zscale,0,0,ax,0,0,0,(nx+nw+oy*ax)/1000,(nz-oz*zscale)/1000,(-ny+ox*by)/1000,1]
        return [0,0,by,0,0,zscale,0,0,-ax,0,0,0,(nx-oy*ax)/1000,(nz-oz*zscale)/1000,(-ny-(ox+ow)*by)/1000,1]
    sx=nw/ow;sy=nh/oh
    return [sx,0,0,0,0,zscale,0,0,0,0,sy,0,(nx-ox*sx)/1000,(nz-oz*zscale)/1000,(-ny+oy*sy)/1000,1]

def item_template(base,item):
    g,bb,spec=source_model(base);kind=item['kind'];code=item['code']
    candidates=[i for i in spec['items'] if i['kind']==kind and i['code']==code]
    if not candidates:candidates=[i for i in spec['items'] if i['kind']==kind]
    if not candidates:
        fallback={'sofa':(10,'sofa'),'coffee_table':(1,'table'),'bench':(1,'bench'),'storage':(1,'open_storage'),'open_storage':(1,'open_storage'),'hanger':(14,'hanger'),'lower':(1,'lower')}
        no,originalkind=fallback[kind];g,bb,spec=source_model(no);candidates=[i for i in spec['items'] if i['kind']==originalkind];base=no
    old=candidates[0]
    matches=[j for j,n in enumerate(g['nodes']) if n.get('extras',{}).get('spec_id')==old['id'] and n.get('extras',{}).get('kind')==old['kind']]
    assert matches,(base,old['id'])
    return base,old,matches[-1]
def motion(item,items):
    if item['kind']!='lower':return None
    x,y=item['xy_mm'];w,h=item['size_mm'];vertical=h>w;best=None
    for upper in items:
        if upper['kind']!='upper':continue
        xx,yy=upper['xy_mm'];ww,hh=upper['size_mm']
        if (hh>ww)!=vertical:continue
        overlap=min(y+h,yy+hh)-max(y,yy) if vertical else min(x+w,xx+ww)-max(x,xx)
        if overlap < (min(h,hh) if vertical else min(w,ww))*.45:continue
        gap=abs((xx+ww/2)-(x+w/2))-(w+ww)/2 if vertical else abs((yy+hh/2)-(y+h/2))-(h+hh)/2
        if abs(gap)>100:continue
        dist=abs((xx+ww/2)-(x+w/2)) if vertical else abs((yy+hh/2)-(y+h/2))
        if best is None or dist<best[0]:
            if vertical:vec=[math.copysign(max(0,w-40),xx+ww/2-x-w/2)/1000,0,0]
            else:vec=[0,0,-math.copysign(max(0,h-40),yy+hh/2-y-h/2)/1000]
            best=(dist,vec)
    return best[1] if best else None

def compile_model(spec):
    no=spec['plan'];base=TEMPLATES.get(no,no);B=Bundle();root=[];g,_,_=source_model(base)
    pine=next(i for i,m in enumerate(g['materials']) if 'pine'in m.get('name','').lower())
    wood=B.import_ref(base,'materials',pine)
    floor_material=None
    for ix,mat in enumerate(g['materials']):
        ti=mat.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')
        if ti is not None and g['images'][g['textures'][ti]['source']].get('name')=='floor':floor_material=ix;break
    floor=B.import_ref(base,'materials',floor_material) if floor_material is not None else wood
    wet=B.material('wet_floor',[.69,.75,.70]);foundation=B.material('foundation',[.34,.29,.23]);items=spec['items'];L,W,H=spec['outer_mm']
    root.append(B.box([L/2000,-.055,-W/2000],[L/1000,.1,W/1000],foundation))
    for r in spec['rooms']:root.append(B.floor(r['polygon'],wet if r['kind'] in ['wash','wc','shower'] else floor))
    for item in items:
        if item['kind'] in ['wall','floor','accessory']:continue
        src,old,node=item_template(base,item);ref=B.import_ref(src,'nodes',node)
        extra={k:item[k] for k in ['id','code','kind','label']};extra['spec_id']=item['id'];extra['size_mm']=item['size_mm']
        vec=motion(item,items)
        if vec:extra['retract_vector']=vec
        rotation='cw' if item['kind']=='sofa' and no==22 else 'ccw' if item['kind']=='hanger' and no==18 else None
        root.append(B.node({'name':item['code']+' '+item['kind'],'children':[ref],'matrix':affine(old,item,rotate=rotation),'extras':extra}))
    openings=[i for i in items if i['kind'] in ['door','window']]
    for wall in [i for i in items if i['kind']=='wall']:
        a,b=wall['a_mm'],wall['b_mm'];length=math.dist(a,b);u=[(b[j]-a[j])/length for j in [0,1]];angle=math.atan2(u[1],u[0]);th=wall['thickness_mm'];cuts=[]
        for opening in openings:
            if opening.get('source_record',{}).get('wall')!=wall['wall_id']:continue
            center=opening['center_mm'];s=sum((center[j]-a[j])*u[j] for j in [0,1]);width=opening['opening_width_mm'];cuts.append((max(0,s-width/2),min(length,s+width/2),opening))
        sections=[];cursor=0
        def section(lo,hi,z0,z1):
            if hi-lo<.5 or z1-z0<.5:return
            mid=(lo+hi)/2;cx=a[0]+u[0]*mid;cy=a[1]+u[1]*mid
            sections.append(B.box([cx/1000,(z0+z1)/2000,-cy/1000],[(hi-lo)/1000,(z1-z0)/1000,th/1000],wood,angle))
        for lo,hi,op in sorted(cuts,key=lambda c:c[0]):
            section(cursor,lo,0,H)
            bottom=op.get('z_mm',0) if op['kind']=='window' else 0;top=bottom+op['height_mm']
            if bottom:section(lo,hi,0,bottom)
            section(lo,hi,top,H);cursor=max(cursor,hi)
        section(cursor,length,0,H)
        root.append(B.node({'name':wall['code']+' wall','children':sections,'extras':{'kind':'wall','wall_id':wall['wall_id'],'spec_id':wall['id']}}))
    target=OUT/f'models/{no:02}.glb';target.parent.mkdir(exist_ok=True)
    B.save(target,root,{'plan':no,'revision':spec['revision'],'dimension_sha256':spec['dimension_sha256'],'source_units':'mm','export_units':'metres; +Y up','native_slide':spec['native_slide'],'outer_mm':spec['outer_mm']})
    return hashlib.sha256(target.read_bytes()).hexdigest()

def main():
    specs=json.loads(SOURCE.read_text(encoding='utf8'));plans=[]
    for no,spec in sorted(((int(k),v) for k,v in specs.items())):
        keys=['code','kind','xy_mm','size_mm','z_mm','height_mm','a_mm','b_mm','thickness_mm','polygon_mm','opening_width_mm']
        fingerprint={'outer_mm':spec['outer_mm'],'rooms':spec['rooms'],'items':[{k:i[k] for k in keys if k in i} for i in spec['items']]}
        spec['dimension_sha256']=hashlib.sha256(json.dumps(fingerprint,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        sha=compile_model(spec)
        p=OUT/f'specs/{no:02}.json';p.write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        with p.with_suffix('.csv').open('w',encoding='utf-8-sig',newline='') as fp:
            writer=csv.writer(fp,delimiter=';');writer.writerow(['code','label','kind','x_mm','y_mm','width_mm','depth_mm','height_mm'])
            for i in spec['items']:writer.writerow([i['code'],i['label'],i['kind'],*i['xy_mm'],*i['size_mm'],i.get('height_mm','')])
        dims=spec['outer_mm'][:2]
        if no in [6,7,8,9,10,11,17,22]:models=['kvadro-house'];size='x'.join(str(int(v/1000)) for v in sorted(dims,reverse=True))
        elif no in [12,13,14,18,19]:models=['parus','viking'];size=str(round(dims[0]/10))
        else:models=['kvadro'];size=str(round(dims[0]/10))
        ds=' × '.join(f'{v/1000:g}'.replace('.',',') for v in dims)+' м'
        suffix=' · парная 1,7 м' if no in [20,21] else ' · с диваном' if no==22 else ''
        plans.append({'id':f'dp3d-{no:02}','number':no,'models':models,'size':size,'drawing':f'drawings/{no:02}.svg','model':f'models/{no:02}.glb','spec':f'specs/{no:02}.json','preview':f'previews/{no:02}.webp','sha256':sha,'dimension_sha256':spec['dimension_sha256'],'label':f'{no:02} · '+ds+suffix,'source_slide':spec['native_slide']})
        print(f'Compiled DP3D-{no:02}: {sha[:12]}')
    (OUT/'index.json').write_text(json.dumps({'version':'album-review-2026-11-05','plans':plans},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':main()
