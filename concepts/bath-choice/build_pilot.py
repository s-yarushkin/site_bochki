"""Blender-only: derive an editable, moving shelf pilot from the approved scene."""
import bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
SOURCE=Path(args[0]).resolve();OUT=Path(args[1]).resolve();WORK=Path(args[2]).resolve();OUT.mkdir(parents=True,exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'scenes/01-ДачаПар-интерактив.blend'))
spec=json.loads((SOURCE/'specs/01.json').read_text('utf8'))
verified=Path(__file__).resolve().parent.parent/'home-hero/layouts/specs/01.json'
spec['public_specification']=json.loads(verified.read_text('utf8'))['public_specification']
p=json.loads((SOURCE/'specs/01-dimension-source.json').read_text('utf8'))
main=bpy.data.objects['DachaPar_01'];lower=bpy.data.objects['DP01-O01']
for ob in list(lower.children_recursive):bpy.data.objects.remove(ob,do_unlink=True)
wood=next(m for m in bpy.data.materials if m.name=='lindenY')

def cube(name,center,size):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    ob=bpy.context.object;ob.name='Sliding '+name;ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.parent=lower;ob.data.materials.append(wood)
    bevel=ob.modifiers.new('Soft timber edges','BEVEL');bevel.width=.002;bevel.segments=2
    if not ob.data.uv_layers:ob.data.uv_layers.new()
    uv=ob.data.uv_layers.active
    for face in ob.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]))
        for li in face.loop_indices:
            q=ob.matrix_world@ob.data.vertices[ob.data.loops[li].vertex_index].co
            uv.data[li].uv=(q.y/1.8,q.x/.24) if axis==2 else (q.y/1.8,q.z/.24) if axis==0 else (q.x/.24,q.z/.24)
    return ob

# The moving seat is inset 100 mm at each end to clear the upper shelf's posts.
x,y,w,d=.645,.145,.300,1.810
for k in range(3):cube('seat slat '+str(k),(x+.048+k*.102,y+d/2,.4325),(.096,d,.035))
for xx in [x+.035,x+w-.035]:
    for yy in [y+.035,y+d-.035]:cube('leg',(xx,yy,.2075),(.042,.042,.415))
for xx in [x+.03,x+w-.03]:cube('long rail',(xx,y+d/2,.391),(.022,d-.06,.048))
for yy in [y+.03,y+d-.03]:cube('end rail',(x+w/2,yy,.391),(w-.06,.022,.048))
cube('central rail',(x+w/2,y+d/2,.391),(.022,d-.06,.048))
lower['sliding']=True;lower['slide_offset']=[-.330,0.0,0.0];lower['slide_label']='Нижний полок'
item=next(i for i in spec['items'] if i['id']=='DP01-O01')
item.update(xy_mm=[645,145],size_mm=[300,1810],label='Выдвижной нижний полок',plan_status='derived_parent_geometry_checked',sliding=True,slide_offset_mm=[-330,0,0])
item['source_record'].update(xy=[645,145],size=[300,1810],z=415,height=35)
p['objects'][0].update(xy=[645,145],size=[300,1810],z=415,height=35)
p['revision']='choice-v2-pilot-01';p['parent_revision']=spec['revision']
spec['revision']='choice-v2-pilot-01';spec['dimension_sha256']=hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest()
public=spec.get('public_specification')
if public:
    for row in public['items']:
        if row['code']=='НС1':row.update(label='Выдвижной нижний полок',dimensions='1810 × 300 мм')
main['revision']=spec['revision'];main['dimension_sha256']=spec['dimension_sha256']
lower['dimension_record']=json.dumps(item,ensure_ascii=False)

def role(ob):
    ancestor=ob
    while ancestor and not ancestor.get('spec_id'):ancestor=ancestor.parent
    return ancestor.get('kind') if ancestor else None
materials={};images={}
for name in ['wall','floor','furniture']:
    images[name]=bpy.data.images.load(str(WORK/(name+'.jpg')),check_existing=True);images[name].pack()
for ob in list(main.children_recursive):
    if ob.type!='MESH':continue
    kind=role(ob)
    for slot in ob.material_slots:
        old=slot.material
        if not old:continue
        woodlike=old.name.lower().startswith(('pine','linden','floor','pale pine'))
        purpose='wall' if kind=='wall' else 'floor' if kind=='floor' else 'furniture' if woodlike else None
        if purpose is None:continue
        key=(old.name,purpose)
        if key not in materials:
            mat=old.copy();mat.name='Choice '+purpose+' '+old.name;mat.use_nodes=True
            bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            for link in list(bs.inputs['Base Color'].links):mat.node_tree.links.remove(link)
            texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=images[purpose]
            mat.node_tree.links.new(texture.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.63
            materials[key]=mat
        slot.material=materials[key]

bpy.context.view_layer.update()
def bounds(ob):
    points=[ob.matrix_world@Vector(q) for q in ob.bound_box]
    return [min(p[i] for p in points) for i in range(3)]+[max(p[i] for p in points) for i in range(3)]
moving=[ob for ob in lower.children_recursive if ob.type=='MESH']
stationary=[ob for ob in main.children_recursive if ob.type=='MESH' and ob not in moving]
collisions=[];eps=.0001
for ob in moving:
    swept=bounds(ob);swept[0]-=.330
    for other in stationary:
        b=bounds(other)
        if all(min(swept[k+3],b[k+3])-max(swept[k],b[k])>eps for k in range(3)):collisions.append([ob.name,other.name])
assert not collisions,collisions
points=[ob.matrix_world@Vector(q) for ob in moving for q in ob.bound_box]
item['model_bounds_mm']=[round(min(v[i] for v in points)*1000,3) for i in range(3)]+[round(max(v[i] for v in points)*1000,3) for i in range(3)]
lower['dimension_record']=json.dumps(item,ensure_ascii=False)
report={'pass':True,'revision':spec['revision'],'moving_assembly':'DP01-O01','slide_offset_mm':[-330,0,0],'deployed_bounds_mm':item['model_bounds_mm'],'full_swept_aabb_clear':True,'collision_pairs':collisions,'moving_parts':len(moving),'stationary_parts':len(stationary),'engineering_load_approval':False}
(OUT/'01.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),'utf8')
(OUT/'01-dimension-source.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),'utf8')
(OUT/'01-geometry-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'01-выдвижной-полок.blend'))
for ob in bpy.context.scene.objects:ob.select_set(False)
main.select_set(True)
for ob in main.children_recursive:ob.select_set(True)
bpy.context.view_layer.objects.active=main
bpy.ops.export_scene.gltf(filepath=str(OUT/'01.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=88)
print('PILOT_GEOMETRY='+json.dumps(report),flush=True)

# A cutaway render is generated after saving/exporting the full editable geometry.
for ob in list(main.children_recursive):
    if ob.type!='MESH' or role(ob)!='wall':continue
    ancestor=ob
    while ancestor and not ancestor.get('spec_id'):ancestor=ancestor.parent
    if ancestor.get('wall_id') in ['rear','left']:continue
    ob.data=ob.data.copy();bm=bmesh.new();bm.from_mesh(ob.data)
    plane=ob.matrix_world.inverted()@Vector((0,0,.75))
    normal=ob.matrix_world.to_3x3().transposed()@Vector((0,0,1))
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=plane,plane_no=normal,clear_outer=True,clear_inner=False)
    bm.to_mesh(ob.data);bm.free()
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.film_transparent=False
camera=scene.camera;camera.location=(6,-5,7);camera.rotation_euler=(Vector((2,1.05,.45))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.25
bpy.context.view_layer.update()
inverse=camera.matrix_world.inverted()
projected=[inverse@(ob.matrix_world@v.co) for ob in main.children_recursive if ob.type=='MESH' for v in ob.data.vertices]
center=Vector(((min(v.x for v in projected)+max(v.x for v in projected))/2,(min(v.y for v in projected)+max(v.y for v in projected))/2,0))
camera.location+=camera.matrix_world.to_3x3()@center
bpy.context.view_layer.update()
from bpy_extras.object_utils import world_to_camera_view
screen_points=[world_to_camera_view(scene,camera,ob.matrix_world@v.co) for ob in main.children_recursive if ob.type=='MESH' for v in ob.data.vertices]
span=max(max(v.x for v in screen_points)-min(v.x for v in screen_points),max(v.y for v in screen_points)-min(v.y for v in screen_points))
camera.data.ortho_scale*=span*1.10
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(WORK/'01-preview.png')
bpy.ops.render.render(write_still=True)
print('PILOT_RENDER_COMPLETE',flush=True)
