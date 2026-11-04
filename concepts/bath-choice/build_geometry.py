"""Blender: extend the editable parent scenes, detail sliding shelves, export GLB.

Dimension preparation is independent of Blender. The saved master is full height;
only its subsequent preview render uses foreground wall cuts.
"""
import argparse, bpy, bmesh, hashlib, json, math, sys, types
from pathlib import Path
from mathutils import Matrix, Vector

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];OUT=HERE/'geometry'
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--plans',type=int,nargs='+',required=True)
parser.add_argument('--skip-render',action='store_true')
opt=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
SOURCE=opt.source.resolve();DIMENSIONS=SOURCE.parent/'3D-альбом-14-03-11-2026-v2'
WORK=ROOT/'.local/geometry-v4';WORK.mkdir(parents=True,exist_ok=True)
(WORK/'previews').mkdir(exist_ok=True)

def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
def attach(ob,parent):
    world=ob.matrix_world.copy();ob.parent=parent;ob.matrix_world=world
def clear(root):
    for ob in reversed(list(root.children_recursive)):bpy.data.objects.remove(ob,do_unlink=True)
    root.matrix_world=Matrix.Identity(4)
def ancestor(ob):
    while ob and not ob.get('spec_id'):ob=ob.parent
    return ob
def overlap(a,b,eps=.0001):return all(min(a[k+3],b[k+3])-max(a[k],b[k])>eps for k in range(3))
def actual_bounds(ob,deps):
    evaluated=ob.evaluated_get(deps);mesh=evaluated.to_mesh()
    if not mesh or not mesh.vertices:
        evaluated.to_mesh_clear();return None
    pts=[ob.matrix_world@v.co for v in mesh.vertices]
    result=[min(v[k] for v in pts) for k in range(3)]+[max(v[k] for v in pts) for k in range(3)]
    evaluated.to_mesh_clear();return result

def build(number):
    p=json.loads((OUT/'dimensions'/f'{number:02}.json').read_text('utf8'))
    spec=json.loads((OUT/'specs'/f'{number:02}.json').read_text('utf8'));parent=p['parent_plan']
    old_spec=json.loads((HERE/'pilot/01.json' if parent==1 else SOURCE/'specs'/f'{parent:02}.json').read_text('utf8'))
    path=HERE/'pilot/01.blend' if parent==1 else SOURCE/'scenes'/f'{parent:02}-ДачаПар-интерактив.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path));scene=bpy.context.scene
    main=bpy.data.objects[f'DachaPar_{parent:02}'];main.name=f'DachaPar_{number:02}'
    h=types.ModuleType('scene_helpers');h.__file__=str(DIMENSIONS/'render_scenes.py')
    argv=sys.argv;sys.argv=['blender']
    exec(compile((DIMENSIONS/'render_scenes.py').read_text('utf8').split('\nfor no in opt.plans:')[0],h.__file__,'exec'),h.__dict__)
    sys.argv=argv;h.BASE=WORK;h.P=p;h.ACTIVE=main.users_collection[0];h.CURRENT=None
    used={m for ob in main.children_recursive if ob.type in ['MESH','CURVE'] for m in ob.data.materials if m}
    h.materials()
    for key,material in h.M.items():
        basename=material.name.split('.')[0]
        existing=[m for m in used if m.name.split('.')[0]==basename]
        if existing:h.M[key]=max(existing,key=lambda m:sum(n.type=='TEX_IMAGE' for n in m.node_tree.nodes))
    assemblies={};old_items={it['id'].replace(f'DP{parent:02}',f'DP{number:02}'):it for it in old_spec['items']}
    valid={it['id'] for it in spec['items']}
    for ob in list(main.children):
        if not ob.get('spec_id'):continue
        ident=ob['spec_id'].replace(f'DP{parent:02}',f'DP{number:02}')
        if ident not in valid:
            clear(ob);bpy.data.objects.remove(ob,do_unlink=True);continue
        ob.name=ident;ob['spec_id']=ident;assemblies[ident]=ob
        for child in ob.children_recursive:
            if child.get('spec_id'):child['spec_id']=ident
            if child.get('door_pivot'):child.name='Hinge_'+ident
        if 'sliding' in ob:del ob['sliding']
    assert set(assemblies)==valid,(number,valid-set(assemblies))

    def deform_world(point):
        if number==parent:return point
        info=p['deformation'];axis=0 if info['axis']=='X' else 1;v=point[axis]*1000
        q=point.copy();q[axis]+=info['delta_mm']/1000*max(0,min(1,(v-info['start_mm'])/(info['end_mm']-info['start_mm'])))
        return q
    def deform(root):
        for ob in root.children_recursive:
            inverse=ob.matrix_world.inverted()
            if ob.type=='MESH':
                ob.data=ob.data.copy()
                for vertex in ob.data.vertices:vertex.co=inverse@deform_world(ob.matrix_world@vertex.co)
                ob.data.update()
            elif ob.type=='CURVE':
                ob.data=ob.data.copy()
                for spline in ob.data.splines:
                    for point in spline.points:
                        q=inverse@deform_world(ob.matrix_world@Vector(point.co[:3]));point.co=(*q,point.co.w)
                    for point in spline.bezier_points:
                        for attr in ['co','handle_left','handle_right']:setattr(point,attr,inverse@deform_world(ob.matrix_world@getattr(point,attr)))

    # Wall openings and wall lengths are rebuilt from exact dimension bands.
    for part in json.loads((OUT/'specs'/f'{number:02}-walls.json').read_text('utf8')):
        root=assemblies[part['id']];clear(root);h.CURRENT=root
        root['wall_id']=part['wall_id'];root['external']=part['external'];root['axis_u']=part['u']
        for j,layer in enumerate(part['bands']):
            ob=h.extrude_band(f'Wall {part["wall_id"]} band {j}',layer,'wall');ob.parent=root
            ob['wall_part']=True;ob['z0_mm']=layer['z0'];ob['z1_mm']=layer['z1']

    moving_item=next(it for it in spec['items'] if it.get('sliding'))
    for it in spec['items']:
        root=assemblies[it['id']];old=old_items[it['id']]
        if it['kind']=='wall':continue
        if it['kind'] in ['floor','accessory']:
            deform(root);continue
        if it is moving_item:continue
        dx,dy=[it['xy_mm'][k]-old['xy_mm'][k] for k in [0,1]]
        resized=any(abs(it['size_mm'][k]-old['size_mm'][k])>.01 for k in [0,1])
        if resized and it['kind'] in ['lower','upper','bench','wash_bench','table']:
            clear(root);h.CURRENT=root
            (h.table if it['kind']=='table' else h.seat)(it['source_record'])
            attach(h.CURRENT,root)
        elif abs(dx)+abs(dy)>.001:root.location+=Vector((dx/1000,dy/1000,0))

    # A complete moving frame, in the exact deployed footprint from the plan.
    lower=assemblies[moving_item['id']];clear(lower);h.CURRENT=lower
    x,y=moving_item['xy_mm'];w,d=moving_item['size_mm'];top=moving_item['surface_z_mm']
    h.board_deck('Sliding seat',x,y,w,d,top,35,'linden',6,96)
    for xx in [x+35,x+w-35]:
        for yy in [y+35,y+d-35]:h.cube('Sliding frame leg',[xx,yy,(top-35)/2],[42,42,top-35],'lindenY',2)
    for xx in [x+30,x+w-30]:h.cube('Sliding frame side rail',[xx,y+d/2,top-59],[22,d-60,48],'lindenY',2)
    for yy in [y+30,y+d-30]:h.cube('Sliding frame end rail',[x+w/2,yy,top-59],[w-60,22,48],'lindenX',2)
    source_shift=[v/1000 for v in moving_item['slide_offset_mm']]
    lower['sliding']=True;lower['slide_offset']=[source_shift[0],source_shift[2],-source_shift[1]];lower['slide_label']='Нижний полок'
    lower['slide_offset_coordinate_system']='glTF +Y up; source displacement is in the dimension record'
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    moving=[ob for ob in lower.children_recursive if ob.type in ['MESH','CURVE']]
    shift=source_shift;sweeps=[]
    for ob in moving:
        b=actual_bounds(ob,deps)
        sweeps.append([min(b[k],b[k]+shift[k]) for k in range(3)]+[max(b[k+3],b[k+3]+shift[k]) for k in range(3)])

    # Floor posts in the swept volume are replaced by elevated wall supports.
    # These are geometry proposals, not a structural load certification.
    replaced=[];affected=set()
    for ob in list(main.children_recursive):
        if not ob.name.startswith('Upper shelf leg'):continue
        b=actual_bounds(ob,deps)
        if any(overlap(s,b) for s in sweeps):
            root=ancestor(ob);affected.add(root['spec_id']);replaced.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)
    for ident in affected:
        it=next(it for it in spec['items'] if it['id']==ident);h.CURRENT=assemblies[ident]
        ux,uy=it['xy_mm'];uw,ud=it['size_mm'];axis=0 if uw>=ud else 1
        facing=h.room_facing(it['source_record']);cross=1-axis
        low=[ux,uy];size=[uw,ud]
        # The wall side is opposite the room-facing normal.
        wall_side=low[cross]+35 if facing[cross]>=0 else low[cross]+size[cross]-35
        front_side=low[cross]+size[cross]-35 if facing[cross]>=0 else low[cross]+35
        for pos in [low[axis]+70,low[axis]+size[axis]-70]:
            a=Vector((0,0,560));b=Vector((0,0,805));a[axis]=b[axis]=pos;a[cross]=wall_side;b[cross]=front_side
            delta=b-a;ob=h.cube('Elevated shelf wall brace',list((a+b)/2),[38,38,delta.length],'lindenY',2)
            ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler()

    # Three clear material roles. Existing glazing, steel, fabric and props stay.
    textures={}
    for role in ['wall','floor','furniture']:
        im=bpy.data.images.load(str(ROOT/'.local/pilot-01'/f'{role}.jpg'),check_existing=True);im.pack();textures[role]=im
    materials={};wallmats=set()
    for ob in main.children_recursive:
        if ob.type not in ['MESH','CURVE']:continue
        root=ancestor(ob);kind=root.get('kind') if root else None
        for slot in ob.material_slots:
            old=slot.material
            if not old:continue
            woodlike=old.name.lower().startswith(('choice wall','choice floor','choice furniture','pine','linden','floor','pale pine'))
            role='wall' if kind=='wall' else 'floor' if kind=='floor' else 'furniture' if woodlike else None
            if role is None:continue
            key=(old.name,role)
            if key not in materials:
                mat=old.copy();mat.name=f'Choice {role} '+old.name.replace('Choice furniture ','').replace('Choice wall ','').replace('Choice floor ','')
                nt=mat.node_tree;nodes=nt.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');bs=nodes.new('ShaderNodeBsdfPrincipled');nt.links.new(bs.outputs[0],out.inputs['Surface'])
                tex=nodes.new('ShaderNodeTexImage');tex.image=textures[role];tex.extension='REPEAT'
                uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';nt.links.new(uv.outputs[0],tex.inputs['Vector']);nt.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.63
                materials[key]=mat
            slot.material=materials[key]
            if role=='wall':wallmats.add(slot.material.name)

    # Metric UVs remain consistent when a room or a piece of furniture grows.
    bpy.context.view_layer.update()
    for ob in main.children_recursive:
        if ob.type!='MESH':continue
        mesh=ob.data;uv=mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
        for f in mesh.polygons:
            mat=mesh.materials[f.material_index] if f.material_index<len(mesh.materials) else None
            is_wall=mat and mat.name in wallmats;axis=max(range(3),key=lambda k:abs(f.normal[k]))
            for li in f.loop_indices:
                q=ob.matrix_world@mesh.vertices[mesh.loops[li].vertex_index].co
                if is_wall:v=(q.z/1.8,(q.x if axis==1 else q.y)/.24) if axis!=2 else (q.x/1.8,q.y/.24)
                elif axis==2:v=(q.y/1.8,q.x/.24) if mat and mat.name.split('.')[0].endswith('Y') else (q.x/1.8,q.y/.24)
                elif axis==1:v=(q.x/1.8,q.z/.24)
                else:v=(q.y/1.8,q.z/.24)
                uv.data[li].uv=v

    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    bounds={ob:actual_bounds(ob,deps) for ob in main.children_recursive if ob.type in ['MESH','CURVE']}
    bounds={ob:b for ob,b in bounds.items() if b};collisions=[]
    for ob,swept in zip(moving,sweeps):
        for other,b in bounds.items():
            if other not in moving and overlap(swept,b):collisions.append([ob.name,other.name])
    report={'plan':number,'parent':parent,'sliding':moving_item['id'],'slide_offset_mm':moving_item['slide_offset_mm'],'moving_parts':len(moving),'stationary_parts':len(bounds)-len(moving),'collision_pairs':collisions,'replaced_floor_posts':replaced,'human_route':p['human_route'],'engineering_load_approval':False}
    write(OUT/'qa'/f'{number:02}-geometry.json',report)
    assert not collisions,(number,collisions)
    audit=[]
    for it in spec['items']:
        root=assemblies[it['id']];parts=[ob for ob in root.children_recursive if ob in bounds]
        assert parts,('No geometry',it['id'])
        b=[min(bounds[ob][k] for ob in parts)*1000 for k in range(3)]+[max(bounds[ob][k+3] for ob in parts)*1000 for k in range(3)]
        it.update(model_bounds_mm=[round(v,3) for v in b],mesh_count=len(parts))
        root['code']=it['code'];root['label']=it['label'];root['kind']=it['kind'];root['category']=it['category'];root['dimension_record']=json.dumps(it,ensure_ascii=False)
        audit.append({'id':it['id'],'bounds_mm':it['model_bounds_mm'],'parts':len(parts)})
    main['plan']=number;main['revision']=spec['revision'];main['dimension_sha256']=spec['dimension_sha256']
    scene['project']='ДачаПар · '+spec['title'];scene['revision']=spec['revision'];scene['specification']=f'../specs/{number:02}.json'
    write(OUT/'specs'/f'{number:02}.json',spec)
    scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.film_transparent=False
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.shading.type='MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'scenes'/f'{number:02}.blend'),compress=True)
    for ob in scene.objects:ob.select_set(False)
    main.select_set(True)
    for ob in main.children_recursive:ob.select_set(True)
    bpy.context.view_layer.objects.active=main
    target=OUT/'models'/f'{number:02}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=88,export_normals=True)
    report.update(pass_=True,assemblies=audit,glb_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),glb_bytes=target.stat().st_size)
    write(OUT/'qa'/f'{number:02}-geometry.json',report)
    print('GEOMETRY_EXPORTED '+str(number)+' '+str(target.stat().st_size),flush=True)
    if opt.skip_render:return
    # Preview only: retain the rear/left walls and cut foreground partitions.
    for ob in main.children_recursive:
        root=ancestor(ob)
        if ob.type!='MESH' or not root or root.get('kind')!='wall' or root.get('wall_id') in ['rear','left']:continue
        ob.data=ob.data.copy();bm=bmesh.new();bm.from_mesh(ob.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=ob.matrix_world.inverted()@Vector((0,0,.75)),plane_no=ob.matrix_world.to_3x3().transposed()@Vector((0,0,1)),clear_outer=True,clear_inner=False)
        bm.to_mesh(ob.data);bm.free()
    allowed={main,*main.children_recursive}
    for ob in scene.objects:
        if ob not in allowed and ob.type not in ['CAMERA','LIGHT']:ob.hide_render=True
    camera=scene.camera;W,H=p['W']/1000,p['H']/1000
    camera.location=(W*1.5,-H*1.5,max(W,H)*1.6);camera.rotation_euler=(Vector((W/2,H/2,.45))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=max(W,H)
    bpy.context.view_layer.update();inverse=camera.matrix_world.inverted()
    projected=[inverse@(ob.matrix_world@v.co) for ob in main.children_recursive if ob.type=='MESH' for v in ob.data.vertices]
    center=Vector(((min(q.x for q in projected)+max(q.x for q in projected))/2,(min(q.y for q in projected)+max(q.y for q in projected))/2,0));camera.location+=camera.matrix_world.to_3x3()@center
    bpy.context.view_layer.update()
    from bpy_extras.object_utils import world_to_camera_view
    screen=[world_to_camera_view(scene,camera,ob.matrix_world@v.co) for ob in main.children_recursive if ob.type=='MESH' for v in ob.data.vertices]
    camera.data.ortho_scale*=max(max(v.x for v in screen)-min(v.x for v in screen),max(v.y for v in screen)-min(v.y for v in screen))*1.1
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(WORK/'previews'/f'{number:02}.png')
    bpy.ops.render.render(write_still=True)
    print('PREVIEW_RENDERED '+str(number),flush=True)

for number in opt.plans:build(number)
