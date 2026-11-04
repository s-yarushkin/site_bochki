"""Independent checks against the exported GLB vertex buffers and transforms."""
from pathlib import Path
import argparse,hashlib,itertools,json,struct,sys
HERE=Path(__file__).resolve().parent;OUT=HERE/'geometry'
parser=argparse.ArgumentParser();parser.add_argument('--numpy-path',type=Path);parser.add_argument('--plans',type=int,nargs='+',default=list(range(1,20)));args=parser.parse_args()
if args.numpy_path:sys.path.insert(0,str(args.numpy_path))
import numpy as np

def check(number):
    raw=(OUT/'models'/f'{number:02}.glb').read_bytes();assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
    size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size]);binary=raw[28+size:];nodes=g['nodes'];world={};parents={};bounds={}
    def local(node):
        if 'matrix' in node:return np.array(node['matrix']).reshape(4,4,order='F')
        x,y,z,w=node.get('rotation',[0,0,0,1]);r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        m=np.eye(4);m[:3,:3]=r@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
    def positions(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];assert a['componentType']==5126 and a['type']=='VEC3'
        return np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4)).astype(float)
    def visit(i,parent_matrix,parent=None):
        n=nodes[i];world[i]=parent_matrix@local(n);parents[i]=parent
        if 'mesh' in n:
            pts=np.vstack([positions(p['attributes']['POSITION']) for p in g['meshes'][n['mesh']]['primitives']]);pts=(world[i]@np.column_stack([pts,np.ones(len(pts))]).T).T[:,:3];bounds[i]=np.array([pts.min(axis=0),pts.max(axis=0)])
        for child in n.get('children',[]):visit(child,world[i],i)
    for i in g['scenes'][g.get('scene',0)]['nodes']:visit(i,np.eye(4))
    def meshes(i):
        result={i} if i in bounds else set()
        for child in nodes[i].get('children',[]):result.update(meshes(child))
        return result
    spec=json.loads((OUT/'specs'/f'{number:02}.json').read_text('utf8'));p=json.loads((OUT/'dimensions'/f'{number:02}.json').read_text('utf8'))
    assert spec['dimension_sha256']==hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest()
    main=next(n for n in nodes if n['name']==f'DachaPar_{number:02}');assert main['extras']['dimension_sha256']==spec['dimension_sha256']
    roots=[i for i,n in enumerate(nodes) if n.get('extras',{}).get('dimension_record') and n.get('extras',{}).get('spec_id')==n['name']]
    lookup={nodes[i]['name']:i for i in roots};assert set(lookup)=={it['id'] for it in spec['items']}
    maxerror=0
    for it in spec['items']:
        root=lookup[it['id']];parts=meshes(root);assert parts,it['id']
        b=np.array([np.min([bounds[i][0] for i in parts],axis=0),np.max([bounds[i][1] for i in parts],axis=0)])
        corners=np.array(list(itertools.product(*zip(b[0],b[1]))));plan=corners[:,[0,2,1]]*np.array([1,-1,1])*1000
        bplan=np.concatenate([plan.min(axis=0),plan.max(axis=0)]);error=float(np.max(np.abs(bplan-it['model_bounds_mm'])));maxerror=max(maxerror,error)
        assert error<.1,(number,it['id'],error)
        assert nodes[root]['extras']['dimension_record']==json.dumps(it,ensure_ascii=False)
    moving_roots=[i for i,n in enumerate(nodes) if n.get('extras',{}).get('sliding')];assert len(moving_roots)==1
    root=moving_roots[0];moving=meshes(root);assert len(moving)>=10
    item=next(it for it in spec['items'] if it.get('sliding'));assert nodes[root]['name']==item['id']
    shift=(world[parents[root]][:3,:3] if parents[root] is not None else np.eye(3))@np.array(nodes[root]['extras']['slide_offset'])
    expected=np.array(item['slide_offset_mm'])[[0,2,1]]*np.array([1,1,-1])/1000
    assert np.allclose(shift,expected,atol=1e-6),(shift,expected)
    collisions=[]
    for i in moving:
        b=bounds[i];s=np.array([np.minimum(b[0],b[0]+shift),np.maximum(b[1],b[1]+shift)])
        for j,b in bounds.items():
            if j not in moving and np.all(np.minimum(s[1],b[1])-np.maximum(s[0],b[0])>.0001):collisions.append([nodes[i]['name'],nodes[j]['name']])
    assert not collisions,(number,collisions)
    assert all('uri' not in image and 'bufferView' in image for image in g['images'])
    role_images={}
    for role in ['wall','floor','furniture']:
        selected=[m for m in g['materials'] if m.get('name','').startswith('Choice '+role+' ')];assert selected,role
        idx=selected[0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=g['images'][g['textures'][idx]['source']];view=g['bufferViews'][image['bufferView']]
        role_images[role]=hashlib.sha256(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]).hexdigest()
    assert len(set(role_images.values()))==3
    assert p['human_route']['all_rooms_reachable']
    report={'pass':True,'plan':number,'scope':'Independent exported GLB vertices, transforms, embedded textures, full swept bounds','assemblies':len(roots),'movingParts':len(moving),'stationaryParts':len(bounds)-len(moving),'collisionPairs':collisions,'maximumBoundsErrorMm':maxerror,'worldSlideMm':(shift*1000).round(3).tolist(),'threeDifferentEmbeddedTextures':True,'externalTextures':False,'dimensionSha256':spec['dimension_sha256'],'glbSha256':hashlib.sha256(raw).hexdigest(),'engineeringLoadApproval':False}
    (OUT/'qa'/f'{number:02}-export-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8');return report

reports=[check(number) for number in args.plans]
(OUT/'qa/export-audit.json').write_text(json.dumps({'pass':True,'models':len(reports),'reports':reports},ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps({'pass':True,'models':len(reports),'assemblies':sum(r['assemblies'] for r in reports),'collisionPairs':0,'maximumBoundsErrorMm':max(r['maximumBoundsErrorMm'] for r in reports)},ensure_ascii=False))
