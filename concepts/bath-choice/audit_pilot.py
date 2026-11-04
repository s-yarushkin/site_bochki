"""Independently verify the exported GLB, not Blender's pre-export objects."""
from pathlib import Path
import hashlib,itertools,json,struct
import numpy as np

HERE=Path(__file__).resolve().parent
pilot=HERE/'pilot'
raw=(pilot/'01.glb').read_bytes()
assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
size=struct.unpack_from('<I',raw,12)[0]
g=json.loads(raw[20:20+size])
offset=20+size
binary=raw[offset+8:]
nodes=g['nodes'];world={};parents={};mesh_bounds={}

def local(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape(4,4,order='F')
    x,y,z,w=node.get('rotation',[0,0,0,1])
    rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                       [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                       [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    matrix=np.eye(4);matrix[:3,:3]=rotation@np.diag(node.get('scale',[1,1,1]))
    matrix[:3,3]=node.get('translation',[0,0,0]);return matrix

def positions(index):
    accessor=g['accessors'][index];view=g['bufferViews'][accessor['bufferView']]
    assert accessor['componentType']==5126 and accessor['type']=='VEC3'
    start=view.get('byteOffset',0)+accessor.get('byteOffset',0)
    stride=view.get('byteStride',12)
    return np.ndarray((accessor['count'],3),dtype='<f4',buffer=binary,offset=start,strides=(stride,4)).astype(float)

def visit(index,parent_matrix,parent=None):
    node=nodes[index];parents[index]=parent;world[index]=parent_matrix@local(node)
    if 'mesh' in node:
        points=np.vstack([positions(p['attributes']['POSITION']) for p in g['meshes'][node['mesh']]['primitives']])
        transformed=(world[index]@np.column_stack([points,np.ones(len(points))]).T).T[:,:3]
        mesh_bounds[index]=np.array([transformed.min(axis=0),transformed.max(axis=0)])
    for child in node.get('children',[]):visit(child,world[index],index)

for root in g['scenes'][g.get('scene',0)]['nodes']:visit(root,np.eye(4))
moving_root=next(i for i,n in enumerate(nodes) if n.get('extras',{}).get('sliding'))
assert nodes[moving_root]['name']=='DP01-O01'
moving=set()
def collect(index):
    if index in mesh_bounds:moving.add(index)
    for child in nodes[index].get('children',[]):collect(child)
collect(moving_root)
shift=np.array(nodes[moving_root]['extras']['slide_offset'])
parent=parents[moving_root]
world_shift=(world[parent][:3,:3] if parent is not None else np.eye(3))@shift
assert np.allclose(world_shift,[-.33,0,0],atol=1e-6)
collisions=[]
for i in moving:
    bounds=mesh_bounds[i]
    swept=np.array([np.minimum(bounds[0],bounds[0]+world_shift),np.maximum(bounds[1],bounds[1]+world_shift)])
    for j,b in mesh_bounds.items():
        if j in moving:continue
        overlap=np.minimum(swept[1],b[1])-np.maximum(swept[0],b[0])
        if np.all(overlap>.0001):collisions.append([nodes[i]['name'],nodes[j]['name']])
assert not collisions,collisions
bounds=np.array([np.min([mesh_bounds[i][0] for i in moving],axis=0),np.max([mesh_bounds[i][1] for i in moving],axis=0)])
# glTF Y-up coordinates map back to the original millimetre plan: X, -Z, Y.
corners=np.array(list(itertools.product(*zip(bounds[0],bounds[1]))))
plan=corners[:,[0,2,1]]*np.array([1,-1,1])*1000
plan_bounds=np.concatenate([plan.min(axis=0),plan.max(axis=0)])
spec=json.loads((pilot/'01.json').read_text('utf8'))
dimensions=json.loads((pilot/'01-dimension-source.json').read_text('utf8'))
item=next(i for i in spec['items'] if i['id']=='DP01-O01')
assert np.allclose(plan_bounds,item['model_bounds_mm'],atol=.02)
assert np.allclose(plan_bounds[:2],item['xy_mm'],atol=.02)
assert np.allclose(plan_bounds[3:5]-plan_bounds[:2],item['size_mm'],atol=.02)
assert spec['dimension_sha256']==hashlib.sha256(json.dumps(dimensions,sort_keys=True).encode()).hexdigest()
assert nodes[moving_root]['extras']['dimension_record']==json.dumps(item,ensure_ascii=False)
assert all(any(m.get('name','').startswith('Choice '+role+' ') for m in g['materials']) for role in ['wall','floor','furniture'])
report={'pass':True,'scope':'exported GLB vertices and transforms; continuous swept bounds',
        'movingParts':len(moving),'stationaryParts':len(mesh_bounds)-len(moving),'collisionPairs':collisions,
        'deployedBoundsPlanMm':plan_bounds.round(3).tolist(),'worldSlideMm':(world_shift*1000).round(3).tolist(),
        'dimensionSha256':spec['dimension_sha256'],'glbSha256':hashlib.sha256(raw).hexdigest(),
        'engineeringLoadApproval':False}
(pilot/'01-export-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(report,ensure_ascii=False))
