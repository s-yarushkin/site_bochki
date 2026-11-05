import hashlib,json,math,struct,unittest
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'concepts/home-hero/layouts'
REGISTRY=json.loads((ASSETS/'index.json').read_text('utf8'))
SPECS={p['number']:json.loads((ASSETS/p['spec']).read_text('utf8')) for p in REGISTRY['plans']}
def item(number,code):
    return next(i for i in SPECS[number]['items'] if i['category']=='objects' and i['code']==code)
def glb(path):
    data=path.read_bytes();magic,version,total=struct.unpack_from('<III',data)
    assert magic==0x46546c67 and version==2 and total==len(data)
    length=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+length]),data
class AlbumLayoutsTest(unittest.TestCase):
    def test_every_catalogue_size_has_its_own_complete_bundle(self):
        book=json.loads((ROOT/'web/data/catalog-pricebook.json').read_text('utf8'))
        self.assertEqual(len(REGISTRY['plans']),22)
        for model,sizes in book['prices'].items():
            for size in sizes:
                plans=[p for p in REGISTRY['plans'] if model in p['models'] and p['size']==size]
                self.assertTrue(plans,(model,size))
        for p in REGISTRY['plans']:
            self.assertEqual(p['id'],f"dp3d-{p['number']:02}")
            for k in ['drawing','model','spec','preview']:self.assertTrue((ASSETS/p[k]).is_file())
            self.assertEqual(hashlib.sha256((ASSETS/p['model']).read_bytes()).hexdigest(),p['sha256'])
            with Image.open(ASSETS/p['preview']) as image:self.assertGreaterEqual(image.width,1600)

    def test_approved_furniture_and_new_variants(self):
        for no in [1,15,20,21]:
            self.assertEqual(item(no,'НС1')['size_mm'],[300,2010])
            self.assertEqual(item(no,'Ш1')['size_mm'][1],400)
        for no in [2,16]:self.assertEqual(item(no,'Ш1')['size_mm'],[500,500])
        self.assertEqual(item(16,'Л3')['size_mm'],[1000,350])
        for no in [20,21]:
            steam=next(i for i in SPECS[no]['items'] if i['kind']=='floor' and i['room_kind']=='steam')
            self.assertEqual(steam['size_mm'],[1700,2010])
            self.assertFalse(any(i['category']=='objects' and i['code']=='Л3' for i in SPECS[no]['items']))
        self.assertEqual(item(21,'Л1')['size_mm'][0],1700)
        a,b=item(21,'Л1'),item(21,'Ш1')
        self.assertLessEqual(b['xy_mm'][0]+b['size_mm'][0],a['xy_mm'][0])
        self.assertTrue(any(i['kind']=='window' and i['code']=='О2' and i['opening_width_mm']==300 and i['xy_mm'][0]==0 for i in SPECS[3]['items']))
        for no,depth in [(14,400),(18,450),(12,450),(19,450),(13,450)]:
            self.assertEqual(item(no,'Л1')['size_mm'][1],depth)
            self.assertEqual(item(no,'Л2')['size_mm'][1],depth)
        for no in [12,13,19]:
            self.assertFalse(any(i['category']=='objects' and i['code']=='ОБ' for i in SPECS[no]['items']))
            self.assertEqual(item(no,'В1')['size_mm'],[400,350])
        self.assertFalse(any(i['category']=='objects' and i['code']=='Г1' for i in SPECS[7]['items']))
        self.assertEqual(item(22,'ДВ1')['size_mm'],[850,2100])
        self.assertFalse(any(i['kind']in ['kitchen','kitchen_sink'] for i in SPECS[22]['items']))
        door=next(i for i in SPECS[11]['items'] if i['kind']=='door' and i['code']=='Д1')
        self.assertLess(door['xy_mm'][1]+door['size_mm'][1],item(11,'НС1')['xy_mm'][1])

    def test_glb_resources_dimensions_and_moving_bench(self):
        for p in REGISTRY['plans']:
            model,data=glb(ASSETS/p['model'])
            root=model['nodes'][model['scenes'][0]['nodes'][0]]
            self.assertEqual(root['extras']['dimension_sha256'],p['dimension_sha256'])
            self.assertEqual(root['extras']['outer_mm'],SPECS[p['number']]['outer_mm'])
            moving=[n for n in model['nodes'] if n.get('extras',{}).get('retract_vector')]
            self.assertTrue(moving,p['id'])
            for n in moving:
                self.assertEqual(n['extras']['kind'],'lower')
                self.assertTrue(0<sum(x*x for x in n['extras']['retract_vector'])<1)
            length=model['buffers'][0]['byteLength']
            for v in model['bufferViews']:self.assertLessEqual(v.get('byteOffset',0)+v['byteLength'],length)
            for m in model['meshes']:
                for primitive in m['primitives']:
                    for accessor in primitive['attributes'].values():self.assertLess(accessor,len(model['accessors']))

    def test_specs_contain_no_price_data(self):
        for spec in SPECS.values():
            self.assertNotIn('price',spec)
            self.assertEqual(len(spec['public_specification']['rooms']),len(spec['rooms']))
            self.assertTrue(spec['public_specification']['items'])

    def test_every_door_retains_its_own_hinge_and_motion(self):
        for p in REGISTRY['plans']:
            model,_=glb(ASSETS/p['model'])
            nodes=model['nodes']
            parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])}
            pivots=[(i,n['extras']) for i,n in enumerate(nodes) if n.get('extras',{}).get('door_pivot')]
            doors={i['code'] for i in SPECS[p['number']]['items'] if i['kind']=='door'}
            self.assertEqual(len(pivots),len(doors),p['id'])
            owners=set()
            for idx,e in pivots:
                self.assertEqual(set(e),{'door_pivot','closed_radians','open_sign','max_angle_radians'})
                self.assertTrue(math.isfinite(e['closed_radians']))
                self.assertIn(e['open_sign'],[-1,1])
                self.assertTrue(0<e['max_angle_radians']<=math.pi)
                while nodes[idx].get('extras',{}).get('kind')!='door':idx=parents[idx]
                owners.add(nodes[idx]['extras']['code'])
            self.assertEqual(owners,doors,p['id'])
if __name__=='__main__':unittest.main()
