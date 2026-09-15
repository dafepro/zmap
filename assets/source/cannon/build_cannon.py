"""Zoomap ball cannon: run through the interactive Blender MCP.

World coordinates in authoring helpers are X right, Y up, +Z muzzle.
Builds a dedicated scene, never clears or saves over another user scene.
Concept: assets/concepts/cannon/turnaround.png. See docs/cannon-workflow.md.
"""
import bpy, bmesh, math, json, struct, re
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'examples/hub/public/models/ball-cannon.glb'
EVIDENCE = ROOT / 'docs/evidence/cannon'
SCENE_NAME = 'Zoomap · cannon study'
VERSION = 3

def co(p): return (p[0], -p[2], p[1])
def srgb(c): return ((c+.055)/1.055)**2.4 if c>.04045 else c/12.92

def build():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    # Each iteration is retained as its own scene until explicitly reviewed.
    scene = bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    collection = bpy.data.collections.new('Cannon · authored components')
    scene.collection.children.link(collection)
    def link(obj): collection.objects.link(obj); return obj
    def empty(name, pos=(0,0,0), parent=None):
        o=link(bpy.data.objects.new(name,None)); o.location=co(pos);o.parent=parent;return o
    def mat(name,hexcolor,rough=.8):
        rgb=tuple(srgb(int(hexcolor[i:i+2],16)/255) for i in (0,2,4))
        m=bpy.data.materials.new('Cannon · '+name);m.diffuse_color=(*rgb,1);m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
        return m
    ink=mat('ink','102f3a'); rubber=mat('rubber','25363e'); rubber_hi=mat('tread faces','3c4b50')
    teal=mat('teal paint','109a9b'); teal_light=mat('lit teal plane','27bbba'); teal_dark=mat('shadow teal plane','08747e')
    mint=mat('mint edge ink','9debd3'); gold=mat('gold paint','eeb33d');gold_light=mat('lit gold bevel','ffdc72'); gold_dark=mat('gold shadow','a56d25')
    cream=mat('cream markings','fff1cc');steel=mat('exposed steel','657e83',.4); amber=mat('amber window','ff953f'); green=mat('mint window','b5f09b'); rope=mat('braided fuse','bdad7d')
    black=mat('barrel interior','102b34'); dark_gold=mat('warm seam ink','5f441c')
    allmats=[ink,rubber,rubber_hi,teal,teal_light,teal_dark,mint,gold,gold_light,gold_dark,cream,steel,amber,green,rope,black,dark_gold]
    root=empty('ball_cannon')
    root['assetVersion']=VERSION;root['concept']='assets/concepts/cannon/turnaround.png'
    root['forwardAxis']='+Z';root['unit']='metre'
    chassis=empty('chassis',parent=root)
    barrel=empty('barrel_recoil',parent=root)
    empty('intake',(0,.85,-1.12),root);empty('muzzle',(0,.85,1.32),root)
    def mesh(name,verts,faces,material,parent=chassis):
        m=bpy.data.meshes.new(name);m.from_pydata([co(v) for v in verts],[],faces);m.update()
        bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(m);bm.free()
        o=link(bpy.data.objects.new(name,m));o.parent=parent
        for material_ in material if isinstance(material,list) else [material]:m.materials.append(material_)
        return o
    def select(o):
        for item in bpy.context.selected_objects:item.select_set(False)
        o.select_set(True);bpy.context.view_layer.objects.active=o
    def box(name,pos,size,material,parent=chassis,bevel=.012):
        x,y,z=pos;a,b,c=[v/2 for v in size]
        verts=[(x+i*a,y+j*b,z+k*c) for i,j,k in [(-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1),(1,-1,-1),(1,-1,1),(1,1,1),(1,1,-1)]]
        o=mesh(name,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2),(0,3,7,4)],material,parent)
        if bevel:
            select(o);b=o.modifiers.new('Crafted edge bevel','BEVEL');b.width=bevel;b.segments=1;b.affect='EDGES';bpy.ops.object.modifier_apply(modifier=b.name)
        return o
    def ring(name,profile,material,parent=barrel,n=32,center=(0,.85,0),axis='z',polygon=None):
        # Closed radial section supports actual hollow apertures, never capped cylinders.
        verts=[]
        for radius,d in profile:
            for i in range(n):
                a=2*math.pi*i/n+math.pi/8
                r=radius
                if polygon and radius>=polygon[1]:
                    sides=polygon[0];a0=(a+math.pi/sides)%(2*math.pi/sides)-math.pi/sides
                    r=radius*math.cos(math.pi/sides)/math.cos(a0)
                p=(r*math.cos(a),r*math.sin(a),d) if axis=='z' else (d,r*math.sin(a),r*math.cos(a))
                verts.append(tuple(p[j]+center[j] for j in range(3)))
        faces=[]
        for j in range(len(profile)):
            for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i))
        o=mesh(name,verts,faces,material,parent)
        return o
    def cylinder(name,pos,r,depth,material,parent=chassis,axis='x',n=20):
        return ring(name,[(r,-depth/2),(r,depth/2),(.0001,depth/2),(.0001,-depth/2)],material,parent,n,pos,axis)
    def path(name,points,radius,material,parent=barrel,n=6):
        verts=[]
        for i,p in enumerate(points):
            tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
            tangent.normalize();a=tangent.cross(Vector((0,1,0)))
            if a.length<.01:a=tangent.cross(Vector((0,0,1)))
            a.normalize();b=tangent.cross(a).normalized()
            for k in range(n):verts.append(tuple(Vector(p)+radius*(a*math.cos(k*2*math.pi/n)+b*math.sin(k*2*math.pi/n))))
        faces=[tuple(range(n-1,-1,-1))]
        for j in range(len(points)-1):
            for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
        faces.append(tuple((len(points)-1)*n+i for i in range(n)))
        return mesh(name,verts,faces,material,parent)
    # Long, broad teal silhouette, separate tube wall and dark inner lining.
    shell=ring('Twelve broad painted barrel planes',[(.545,-.99),(.57,-.85),(.59,.83),(.56,.96),(.50,.96),(.50,-.99)],[teal,teal_light,teal_dark],n=12)
    for p in shell.data.polygons:
        j=p.index//12;i=p.index%12
        p.material_index=1 if i in [1,2,3] and j in[0,1] else 2 if i in[7,8,9] or j>=3 else 0
    ring('Deep through-bore',[(.461,-1.23),(.466,1.29),(.452,1.29),(.447,-1.23)],black,n=32)
    ring('Rear open rolled intake',[(.55,-.96),(.582,-1.02),(.586,-1.22),(.556,-1.28),(.46,-1.28),(.448,-1.23),(.45,-1.01)], [ink,steel],n=24)
    ring('Rear intake edge highlight',[(.565,-1.265),(.565,-1.28),(.548,-1.284),(.548,-1.27)],steel,n=24)
    for z,r in [(-.90,.573),(.81,.606)]:
        ring('Raised teal barrel band',[(r-.018,z-.065),(r,z-.044),(r,z+.044),(r-.018,z+.065),(r-.032,z+.062),(r-.032,z-.062)],teal_dark,n=12)
        ring('Band edge mint highlight',[(r+.002,z-.047),(r+.002,z-.033),(r-.003,z-.033),(r-.003,z-.047)],mint,n=12)
    ring('Telescoping recoil sleeve',[(.563,.87),(.57,1.075),(.47,1.075),(.469,.87)],ink,n=16)
    for z in [.94,1.025]:ring('Recoil piston ring',[(.575,z-.014),(.581,z),(.575,z+.014),(.568,z+.014),(.568,z-.014)],teal_light,n=16)
    # Broad octagonal gold muzzle: carved inner bevel + ink joints + bright rim.
    muzzle=ring('Octagonal flared gold muzzle',[(.605,1.04),(.74,1.22),(.758,1.285),(.732,1.32),(.548,1.32),(.488,1.265),(.47,1.065)], [gold,gold_light,gold_dark],n=32,polygon=(8,.59))
    for p in muzzle.data.polygons:
        strip=p.index//32;i=p.index%32
        p.material_index=1 if strip in[1,2] or (i<16 and strip==3) else 2 if strip>=4 or i>=16 else 0
    ring('Muzzle rear ink seam',[(.61,1.035),(.616,1.054),(.594,1.059),(.59,1.04)],dark_gold,n=32,polygon=(8,.59))
    ring('Front opening dark reveal',[(.55,1.322),(.549,1.33),(.535,1.33),(.532,1.315)],dark_gold,n=32)
    # Cradle cheeks are cut-out A frames with beveled thick cast edges.
    for side in [-1,1]:
        a=side*.60;b=side*.67
        contour=[(-.93,.26),(-.85,.42),(-.35,.78),(-.24,.8),(.13,.48),(.58,.36),(.62,.25)]
        cut=[(-.49,.4),(-.23,.64),(.0,.4)]
        # Build bars around true triangular open window, no painted fake hole.
        path('Cradle rising arm',[(a,.30,-.89),(a,.73,-.29)],.115,gold,chassis,4)
        path('Cradle falling arm',[(a,.73,-.29),(a,.30,.37)],.115,gold,chassis,4)
        box('Cradle sill',(a,.28,-.15),(.19,.14,1.55),gold,chassis,.025)
        cylinder('Black trunnion bearing',(b,.72,-.29),.126,.055,ink)
        cylinder('Gold trunnion rim',(b+side*.028,.72,-.29),.093,.035,gold_light)
        cylinder('Steel trunnion axle',(b+side*.052,.72,-.29),.055,.04,steel)
        for z in[-.79,.37]:cylinder('Cradle rivet',(b+side*.02,.30,z),.025,.024,steel,n=8)
    box('Golden cross axle housing',(0,.30,.19),(1.47,.13,.18),gold,chassis,.025)
    cylinder('Exposed cross axle',(0,.36,.18),.035,1.57,steel)
    box('Rear stabilizer crossbar',(0,.17,-.86),(1.23,.1,.18),ink,chassis,.018)
    for side in[-1,1]:
        box('Rear stable rubber foot',(side*.47,.06,-.88),(.25,.12,.29),rubber,chassis,.025)
        box('Rear foot gold cap',(side*.47,.14,-.87),(.20,.07,.21),gold,chassis,.012)
    for side,label in[(-1,'left'),(1,'right')]:
        wheel=empty('wheel_'+label,(side*.70,.36,.18),chassis)
        wheel.scale=(1,.36/.38,.36/.38)
        tire=ring('Chunky rubber tire '+label,[(.29,-.125),(.36,-.12),(.38,-.075),(.38,.075),(.36,.12),(.29,.125),(.22,.10),(.22,-.10)],rubber,wheel,n=32,center=(0,0,0),axis='x')
        for k in range(24):
            a=k*2*math.pi/24
            # Two zig-zag lanes sit flush on the tire instead of blocky floating studs.
            for lane in[-1,1]:
                y,z=.38*math.sin(a),.38*math.cos(a)
                o=box('Chevron rubber tread',(lane*.063,y,z),(.108,.052,.014),rubber_hi,wheel,.004)
                # Local cylinder axis X, rotate around it to radial placement.
                # Box points already at radial location; orient only its own geometry around center.
                for v in o.data.vertices:
                    p=Vector((v.co.x,v.co.z,-v.co.y));d=p-Vector((lane*.063,y,z))
                    d=Vector((d.x,d.y*math.cos(a)+d.z*math.sin(a),-d.y*math.sin(a)+d.z*math.cos(a)))
                    v.co=co(Vector((lane*.063,y,z))+d)
        outer=side*.126
        ring('Gold inset wheel hub',[(.282,outer-side*.009),(.285,outer+side*.009),(.25,outer+side*.03),(.105,outer+side*.03),(.093,outer),(.093,outer-side*.009)],gold,wheel,n=24,center=(0,0,0),axis='x')
        ring('Wheel hub bright lip',[(.28,outer+side*.012),(.272,outer+side*.021),(.252,outer+side*.032),(.251,outer+side*.014)],gold_light,wheel,n=24,center=(0,0,0),axis='x')
        cylinder('Hub inset dark boss',(outer+side*.035,0,0),.102,.035,ink,wheel)
        cylinder('Hub hex bolt',(outer+side*.036,0,0),.061,.024,steel,wheel,n=6)
        for k in range(6):
            a=k*math.pi/3
            cylinder('Wheel rivet',(outer+side*.032,.20*math.sin(a),.20*math.cos(a)),.014,.018,gold_light,wheel,n=6)
    # Clean conformal side graphics. Each panel follows the actual tube facet.
    def side_decal(name,side,points,material):
        # Split painted polygons wherever the surface normal changes. Merely
        # projecting outer vertices leaves the interior cutting through a facet.
        def clip(poly,level,above):
            out=[]
            for a,b in zip(poly,poly[1:]+poly[:1]):
                ina=(a[1]>=level) if above else (a[1]<=level)
                inb=(b[1]>=level) if above else (b[1]<=level)
                if ina:out.append(a)
                if ina!=inb:
                    t=(level-a[1])/(b[1]-a[1]);out.append((a[0]+t*(b[0]-a[0]),level))
            return out
        def project(z,y):
            r=.57+(z+.85)/1.68*.02
            section=[(r*math.cos(2*math.pi*k/12+math.pi/8),r*math.sin(2*math.pi*k/12+math.pi/8)) for k in range(12)]
            candidates=[]
            for a,b in zip(section,section[1:]+section[:1]):
                if min(a[1],b[1])<=y<=max(a[1],b[1]):candidates.append(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]))
            return (side*(max(candidates)+.007),.85+y,z)
        # Sloped facet breaks vary slightly with z; extra bands keep paint flush.
        levels=sorted(set([-.60,.60]+[.58*math.sin(2*math.pi*k/12+math.pi/8) for k in range(12)]))
        verts=[];faces=[]
        for lo,hi in zip(levels,levels[1:]):
            poly=clip(clip(points,lo,True),hi,False)
            if len(poly)<3:continue
            start=len(verts);verts.extend(project(z,y) for z,y in poly);faces.append(tuple(range(start,len(verts))))
        return mesh(name,verts,faces,material,barrel)
    for side in[-1,1]:
        side_decal('Cream forward chevron',side,[(-.18,.29),(.02,.29),(.35,.08),(.02,-.13),(-.18,-.13),(.13,.08)],cream)
        side_decal('Mint long painted highlight',side,[(-.68,.37),(.54,.37),(.60,.33),(-.57,.335)],mint)
        for z,y in [(-.57,-.12),(.54,.14),(-.25,.16)]:
            side_decal('Restrained paint nick',side,[(z,y),(z+.10,y+.005),(z+.06,y-.011)],teal_light)
    # Raised pressure gauge. Local XY is the dial, local +Z its normal.
    gauge=empty('pressure_gauge',(.31,1.355,-.61),barrel)
    # Mapping canonical glTF Y rotation to Blender Z rotation.
    gauge.rotation_euler.z=math.pi/3
    gauge.rotation_euler.x=math.pi/5
    cylinder('Gauge dark rim',(0,0,0),.13,.075,ink,gauge,axis='z',n=24)
    cylinder('Gauge steel bezel',(0,0,.047),.117,.024,steel,gauge,axis='z',n=24)
    cylinder('Gauge cream face',(0,0,.062),.102,.009,cream,gauge,axis='z',n=24)
    for k in range(9):
        a=(-.75+k/8*1.5)*math.pi
        p1=(.078*math.sin(a),.078*math.cos(a),.070);p2=(.094*math.sin(a),.094*math.cos(a),.070)
        path('Gauge tick mark',[p1,p2],.0035,ink,gauge,n=4)
    needle=empty('gauge_needle',(0,0,.077),gauge)
    mesh('Pressure needle',[(-.008,-.018,0),(.008,-.018,0),(.003,.078,0),(-.003,.078,0)],[(0,1,2,3)],amber,needle)
    cylinder('Needle pivot',(0,0,.003),.016,.015,ink,needle,axis='z',n=12)
    # Gauge and lamps sit on sockets outside the tube, not embedded decals.
    for i,z in enumerate([-.35,-.10,.15]):
        box('Indicator dark socket',(.12,1.426,z),(.22,.085,.20),ink,barrel,.025)
        box('indicator_'+str(i),(.12,1.47,z),(.16,.04,.139),[green,gold_light,amber][i],barrel,.019)
    cylinder('Fuse collar',(-.08,1.42,-.80),.065,.07,gold_dark,barrel,axis='z',n=12)
    fuse_points=[(-.08,1.41,-.80),(-.16,1.47,-.84),(-.22,1.55,-.95),(-.23,1.60,-1.10),(-.22,1.58,-1.22)]
    path('Fuse dark winding',fuse_points,.029,ink)
    for strand in range(2):
        points=[]
        for k in range(41):
            t=k/40*(len(fuse_points)-1);i=min(int(t),len(fuse_points)-2);f=t-i
            p=Vector(fuse_points[i]).lerp(Vector(fuse_points[i+1]),f)
            p.x+=math.cos(k*.7+strand*math.pi)*.025;p.y+=math.sin(k*.7+strand*math.pi)*.022
            points.append(tuple(p))
        path('Braided fibre strand',points,.012,rope)
    empty('fuse_tip',fuse_points[-1],barrel)
    # Named dimensions make the file self-describing to consumers and asset tests.
    root['intakeRadius']=.447;root['muzzleRadius']=.532;root['recoilTravel']=.20
    scene['asset']='ball-cannon';scene['iteration']=VERSION
    # Packed concept reference stays in editable source, omitted from runtime export.
    reference=bpy.data.images.load(str(ROOT/'assets/concepts/cannon/turnaround.png'),check_existing=True);reference.pack()
    ref=empty('Concept · front side rear top',(-4,1.4,0));ref.empty_display_type='IMAGE';ref.data=reference;ref.empty_display_size=4.5;ref.hide_render=True
    # A controlled lit-paper review scene. Freestyle uses the actual mesh silhouettes.
    floor=box('Review floor',(0,-.045,0),(200,.08,200),mat('paper','eee9d7'),None,0)
    world=bpy.data.worlds.new('Cannon · paper studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.80,.75,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
    for name,p,energy,size in [('Key',(-3,7,4),650,4),('Fill',(4,3,-2),230,5)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
        o=link(bpy.data.objects.new(name,data));o.location=co(p);o.rotation_euler=(Vector(co((0,.6,0)))-o.location).to_track_quat('-Z','Y').to_euler()
    cameras={}
    for name,p,scale in [('hero',(4.2,2.7,5.2),4.1),('front',(0,.85,7),3.2),('rear',(0,.85,-7),3.2),('side',(7,.85,0),3.6),('top',(0,7,0),3.6)]:
        data=bpy.data.cameras.new('Cannon '+name);o=link(bpy.data.objects.new('Cannon '+name,data));o.location=co(p)
        target=co((0,.80,0));o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=scale;cameras[name]=o
    scene.camera=cameras['hero'];scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.render.image_settings.file_format='PNG';scene.render.use_freestyle=True
    fs=scene.view_layers[0].freestyle_settings;fs.crease_angle=math.radians(100)
    line=fs.linesets[0] if len(fs.linesets) else fs.linesets.new('Cannon ink')
    line.select_crease=False;line.select_border=True;line.select_silhouette=True;line.linestyle.color=(.018,.033,.035);line.linestyle.thickness=1.4
    EVIDENCE.mkdir(parents=True,exist_ok=True);OUT.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.view_layer.update()
    bpy.app.driver_namespace['zmap_cannon']={'scene':scene,'root':root,'cameras':cameras,'collection':collection,'floor':floor}
    return {'scene':scene.name,'objects':len(root.children_recursive),'revision':VERSION}

def export():
    context=bpy.app.driver_namespace['zmap_cannon'];scene=context['scene'];root=context['root'];bpy.context.window.scene=scene
    meshes=[o for o in root.children_recursive if o.type=='MESH'];tris=0
    for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
    # Merge only export copies by rigid parent. Editable source retains every part.
    export_collection=bpy.data.collections.new('Cannon · temporary export');scene.collection.children.link(export_collection)
    copies={}
    for o in [root]+list(root.children_recursive):
        c=o.copy();c.data=o.data.copy() if o.data else None;c['runtimeName']=re.sub(r'\.\d+$','',o.name);export_collection.objects.link(c);copies[o]=c
    for o,c in copies.items():
        c.parent=copies.get(o.parent);c.matrix_local=o.matrix_local.copy()
    for pivot in [c for c in copies.values() if c.type=='EMPTY']:
        children=[c for c in pivot.children if c.type=='MESH' and not c['runtimeName'].startswith('indicator_')]
        if len(children)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for c in children:c.select_set(True)
        bpy.context.view_layer.objects.active=children[0];bpy.ops.object.join();children[0]['runtimeName']=pivot['runtimeName']+'_mesh'
    bpy.ops.object.select_all(action='DESELECT')
    for c in export_collection.objects:c.select_set(True)
    bpy.context.view_layer.objects.active=copies[root]
    bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_extras=True)
    # Blender names are global across scenes. Stable ABI names come from extras,
    # so retaining an earlier review iteration cannot change the exported contract.
    raw=OUT.read_bytes();length,kind=struct.unpack_from('<II',raw,12);gltf=json.loads(raw[20:20+length])
    for node in gltf['nodes']:
        if 'runtimeName' in node.get('extras',{}):node['name']=node['extras'].pop('runtimeName')
    encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    tail=raw[20+length:];OUT.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),kind)+encoded+tail)
    runtime_meshes=len(gltf['meshes']);primitives=sum(len(m['primitives']) for m in gltf['meshes'])
    for c in list(export_collection.objects):bpy.data.objects.remove(c,do_unlink=True)
    bpy.data.collections.remove(export_collection)
    metadata={'revision':VERSION,'blender':bpy.app.version_string,'file':'models/ball-cannon.glb','bytes':OUT.stat().st_size,'triangles':tris,'sourceMeshes':len(meshes),'runtimeMeshes':runtime_meshes,'drawPrimitives':primitives,'source':str(Path(__file__).relative_to(ROOT)),'concept':'assets/concepts/cannon/turnaround.png','anchors':{'intake':[0,.85,-1.12],'muzzle':[0,.85,1.32]},'namedMotion':['barrel_recoil','gauge_needle','indicator_0','indicator_1','indicator_2','fuse_tip']}
    (ROOT/'assets/source/cannon/manifest.json').write_text(json.dumps(metadata,indent=2)+'\n')
    bpy.data.libraries.write(str(ROOT/'assets/source/cannon/ball-cannon.blend'),{scene},fake_user=True,compress=True)
    return metadata

def render(name='hero',suffix=''):
    data=bpy.app.driver_namespace['zmap_cannon'];scene=data['scene'];bpy.context.window.scene=scene;scene.camera=data['cameras'][name]
    data['floor'].hide_render=name in ['front','rear','side']
    scene.render.filepath=str(EVIDENCE/(name+suffix+'.png'));bpy.ops.render.render(write_still=True)
    return {'render':scene.render.filepath}

if __name__=='__main__':
    print(build());print(export());print(render())
