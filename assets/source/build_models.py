"""Original Zoomap kit. Run with Blender --background --factory-startup --python this_file.
World conventions in helpers: X right, Y up, Z facing; glTF exports preserve them.
Only this disposable background scene is modified. No user blend file is opened.
"""
import bpy, math, json, os
from mathutils import Vector
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'examples/hub/public/models'
OUT.mkdir(parents=True, exist_ok=True)
for obj in list(bpy.context.scene.objects): bpy.data.objects.remove(obj, do_unlink=True)
def coord(p): return (p[0], -p[2], p[1])
def material(name, color, rough=.82):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Roughness'].default_value=rough
    return m
kit=material('kit',(0.24,.025,.066)); trim=material('trim',(.91,.83,.65)); skin=material('skin',(.55,.29,.14)); hair=material('hair',(.038,.022,.015)); sole=material('sole',(.86,.82,.69)); dark=material('charcoal',(.025,.039,.041)); white=material('ivory',(.91,.88,.77)); wood=material('cedar',(.42,.20,.075)); leaf=material('leaf',(.13,.25,.09)); leaf_light=material('leaf_light',(.29,.39,.12)); ceramic=material('ceramic',(.31,.36,.29)); soil=material('soil',(.046,.032,.018))
def empty(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=coord(pos);o.parent=parent;return o
def finish(o,name,pos,scale,mat,parent=None):
    o.name=name;o.location=coord(pos);o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.parent=parent;return o
def box(name,pos,size,mat,parent=None,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1);o=finish(bpy.context.object,name,pos,size,mat,parent)
    if bevel:
        mod=o.modifiers.new('Soft crafted edges','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def sphere(name,pos,size,mat,parent=None,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1);return finish(bpy.context.object,name,pos,size,mat,parent)
def cylinder(name,pos,r1,r2,depth,mat,parent=None,vertices=8):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth)
    return finish(bpy.context.object,name,pos,(1,1,1),mat,parent)
def join_parts(root):
    # Merge each rigid joint into one mesh; keep named pivots for the runtime animation adapter.
    for pivot in [root]+[o for o in root.children_recursive if o.type == "EMPTY"]:
        parts=[o for o in pivot.children if o.type=='MESH']
        if len(parts)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();parts[0].name=pivot.name+'_mesh'
def export(root,filename):
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=root;bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
    meshes=[o for o in root.children_recursive if o.type=='MESH']; triangles=0
    for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    return {'file':filename,'bytes':(OUT/filename).stat().st_size,'triangles':triangles,'meshes':len(meshes)}
athlete=empty('Athlete')
# Tapered athletic jersey, collar, side panels, crest.
cylinder('Jersey',(0,1.09,0),.255,.31,.52,kit,athlete,8)
box('Shoulders',(0,1.28,0),(.54,.12,.3),kit,athlete,.045)
box('Collar',(0,1.35,.015),(.22,.035,.22),trim,athlete,.015)
box('Chest badge',(-.13,1.2,.269),(.09,.10,.024),trim,athlete,.01)
box('Hem',(0,.83,0),(.43,.035,.32),trim,athlete,.008)
for side,label in [(-1,'L'),(1,'R')]:
    leg=empty('leg_'+label,(side*.145,.77,0),athlete)
    box('Shorts',(0,-.055,0),(.245,.26,.32),dark,leg,.03)
    box('Knee',(0,-.24,.006),(.15,.19,.18),skin,leg,.025)
    box('Sock',(0,-.44,.015),(.16,.26,.18),white,leg,.018)
    for y in [-.34,-.385]:box('Sock stripe',(0,y,.018),(.165,.018,.185),kit,leg,.003)
    box('Trainer',(0,-.66,.072),(.225,.14,.38),dark,leg,.037)
    box('Sole',(0,-.73,.076),(.236,.055,.39),sole,leg,.017)
    box('Toe cap',(0,-.63,.19),(.2,.055,.14),white,leg,.022)
    for z in [.05,.09,.13]:box('Lace',(0,-.58,z),(.13,.013,.018),white,leg,.003)
    arm=empty('arm_'+label,(side*.32,1.28,0),athlete)
    box('Sleeve',(side*.045,-.08,0),(.21,.22,.28),kit,arm,.03)
    box('Sleeve trim',(side*.045,-.18,.003),(.205,.035,.27),trim,arm,.007)
    box('Forearm',(side*.05,-.32,.009),(.135,.3,.155),skin,arm,.03)
    box('Hand',(side*.05,-.49,.022),(.15,.15,.17),skin,arm,.035)
    if side==-1:box('Wristband',(side*.05,-.41,.013),(.146,.04,.167),trim,arm,.008)
sphere('Neck',(0,1.38,0),(.115,.13,.12),skin,athlete,2)
head=empty('head',(0,1.62,0),athlete)
sphere('Face',(0,0,.01),(.305,.335,.283),skin,head,2)
for x in [-.29,.29]:sphere('Ear',(x,-.01,0),(.062,.105,.057),skin,head,1)
for x in [-.108,.108]:
    box('Eye white',(x,.025,.265),(.092,.076,.028),white,head,.011)
    box('Eye iris',(x,.022,.284),(.046,.056,.019),dark,head,.006)
    box('Eye glint',(x-.008,.033,.296),(.012,.017,.006),white,head,.001)
    brow=box('Eyebrow',(x,.095,.264),(.109,.027,.035),hair,head,.007);brow.rotation_euler.y=x*.5
sphere('Nose',(0,-.035,.29),(.05,.054,.05),skin,head,1)
box('Smile',(0,-.13,.251),(.11,.018,.015),dark,head,.006)
# Angular clumps give hair a readable swept silhouette instead of a round cap.
sphere('Hair cap',(0,.19,-.035),(.322,.205,.292),hair,head,2)
for i,(x,y,z) in enumerate([(-.24,.22,.1),(-.13,.33,.13),(.015,.34,.10),(.16,.29,.07),(.26,.17,-.03)]):
    tuft=sphere('Swept tuft',(x,y,z),(.15,.13,.19),hair,head,1);tuft.rotation_euler.y=-.35
join_parts(athlete)
# Geometrically correct truncated-icosahedron ball: 12 pentagons, 20 hexagons.
ball=empty('MatchBall');bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);ico=bpy.context.object
v=[p.co.copy() for p in ico.data.vertices];faces=[list(p.vertices) for p in ico.data.polygons];bpy.data.objects.remove(ico,do_unlink=True)
neighbors={i:set() for i in range(len(v))}
for f in faces:
    for i in range(3):neighbors[f[i]].update([f[(i+1)%3],f[(i+2)%3]])
def point(a,b):return ((v[a]*2+v[b])/3).normalized()
polygons=[]
for a,ns in neighbors.items():
    n=v[a].normalized();axis=n.cross(Vector((0,0,1)))
    if axis.length<.01:axis=n.cross(Vector((0,1,0)))
    axis.normalize();other=n.cross(axis)
    points=[point(a,b) for b in ns];points.sort(key=lambda p:math.atan2(p.dot(other),p.dot(axis)));polygons.append((points,0))
for a,b,c in faces:polygons.append(([point(a,b),point(b,a),point(b,c),point(c,b),point(c,a),point(a,c)],1))
verts=[];tris=[];mats=[]
for poly,mi in polygons:
    center=sum(poly,Vector())/len(poly);center.normalize();poly=[(p*.975+center*.025).normalized() for p in poly]
    for k in range(len(poly)):
        a,b,c=center,poly[k],poly[(k+1)%len(poly)];n=4;idx={}
        for i in range(n+1):
            for j in range(n+1-i):idx[i,j]=len(verts);verts.append(tuple((a*(1-(i+j)/n)+b*(i/n)+c*(j/n)).normalized()*.38))
        for i in range(n):
            for j in range(n-i):
                tris.append((idx[i,j],idx[i+1,j],idx[i,j+1]));mats.append(mi)
                if i+j<n-1:tris.append((idx[i+1,j],idx[i+1,j+1],idx[i,j+1]));mats.append(mi)
mesh=bpy.data.meshes.new('Stitched panels');mesh.from_pydata(verts,[],tris);mesh.materials.append(dark);mesh.materials.append(white)
o=bpy.data.objects.new('32 stitched panels',mesh);bpy.context.collection.objects.link(o);o.parent=ball
for p,mi in zip(mesh.polygons,mats):p.material_index=mi;p.use_smooth=True
sphere('Seam core',(0,0,0),(.376,.376,.376),dark,ball,3)
join_parts(ball)
bench=empty('GardenBench')
for z in [-.23,0,.23]:box('Seat slat',(0,.57,z),(2,.12,.18),wood,bench,.025)
for y in [.9,1.12]:box('Back slat',(0,y,-.36),(2,.17,.095),wood,bench,.02)
for x in [-.76,.76]:
    box('Leg',(x,.29,0),(.1,.58,.54),dark,bench,.016);box('Back support',(x,.61,-.39),(.1,1.06,.1),dark,bench,.012)
    for y in [.9,1.12]:sphere('Bolt',(x,y,-.295),(.017,.017,.009),trim,bench,1)
join_parts(bench)
planter=empty('Planter')
cylinder('Pot',(0,.32,0),.32,.46,.64,ceramic,planter,8)
cylinder('Rim',(0,.63,0),.48,.48,.08,ceramic,planter,8)
cylinder('Earth',(0,.677,0),.425,.425,.016,soil,planter,8)
for i in range(9):
    angle=i*2.399; p=(math.cos(angle)*.2, .94+(i%3)*.14, math.sin(angle)*.2)
    leafobj=sphere('Leaf',p,(.12,.35,.055),leaf if i%2 else leaf_light,planter,1);leafobj.rotation_euler=(math.cos(angle)*.5,math.sin(angle)*.5,angle)
join_parts(planter)
metadata=[export(athlete,'athlete-v1.glb'),export(ball,'match-ball-v1.glb'),export(bench,'bench-v1.glb'),export(planter,'planter-v1.glb')]
# Editable presentation scene retained with the source assets.
athlete.location=coord((-1.4,0,0));bench.location=coord((1.15,0,-.3));ball.location=coord((-.5,.38,.65));planter.location=coord((2.6,0,-.2))
box('Studio floor',(0,-.1,0),(200,.15,200),material('Backdrop',(.69,.72,.65)),bevel=0)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.69,.73,.67,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,energy,size in [('Key',(-3,-4,7),550,5),('Fill',(4,1,5),300,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc);lamp=bpy.context.object;lamp.name=name;lamp.data.energy=energy;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-7,4));camera=bpy.context.object;camera.name='ShowcaseCamera';camera.rotation_euler=(Vector((.4,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=5.8
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.filepath=str(ROOT/'docs/evidence/blender-kit.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/zoomap-kit.blend'))
(ROOT/'assets/source/manifest.json').write_text(json.dumps({'blender':bpy.app.version_string,'assets':metadata},indent=2)+'\n')
bpy.ops.render.render(write_still=True)
print('ZOOMAP_ASSETS',json.dumps(metadata))
