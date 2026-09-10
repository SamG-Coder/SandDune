"""Original goldfish asset by SamG-Coder. Run with Blender --background --python."""
import bpy, math, os
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'art-assets', 'goldfish')
OUT = os.path.join(ROOT, 'public', 'models')
os.makedirs(SOURCE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, rough=.35, alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,alpha)
    p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=rough
    p.inputs['Alpha'].default_value=alpha
    if alpha<1:m.surface_render_method='DITHERED'
    return m

# A UV scale atlas with staggered individual crescents, warmer shoulders and a
# pearlescent belly. Packed into the source .blend and embedded in the GLB.
N=2048
u,v=np.meshgrid(np.linspace(0,1,N,dtype=np.float32),np.linspace(0,1,N,dtype=np.float32))
row=np.floor(v*38);sx=np.mod(u*55+.5*np.mod(row,2),1)-.5;sy=np.mod(v*38,1)-.48
r=np.sqrt((sx/.56)**2+(sy/.64)**2)
edge=np.exp(-((r-.9)/.055)**2)*.19
shine=np.exp(-((r-.77)/.06)**2)*.10
belly=np.clip((-np.cos(v*2*np.pi)-.1)*1.2,0,1)
gold=np.stack([.91+belly*.07,.22+belly*.46,.025+belly*.24],axis=-1)
variation=(np.sin(u*131+v*17)*np.sin(v*173+u*31))*.022
rgb=np.clip(gold*(1-edge[...,None])+shine[...,None]+variation[...,None],0,1)
atlas=bpy.data.images.new('Goldfish scales 2K',width=N,height=N,alpha=True)
rgba=np.ones((N,N,4),dtype=np.float32);rgba[:,:,:3]=rgb
atlas.pixels.foreach_set(rgba.ravel());atlas.filepath_raw=os.path.join(SOURCE,'goldfish-scales.png');atlas.file_format='PNG';atlas.save();atlas.pack()
bodymat=material('Orange gold / pearlescent scales',(.95,.36,.03),.18,.31)
nodes=bodymat.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=atlas
bodymat.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
finmat=material('Thin amber fin membrane',(1,.34,.055),.04,.38,.68)
raymat=material('Golden fin rays',(1,.57,.15),.12,.32)
iris=material('Copper iris',(.48,.19,.035),.35,.2)
pupil=material('Glossy black eyes',(.009,.014,.012),.05,.12)
lipmat=material('Soft gold lips',(.9,.44,.14),.05,.42)
gillmat=material('Gill folds',(.38,.105,.016),.08,.4)

fish=[]
def mesh(name,verts,faces,mat,uvs=None,morph=False):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
    for p in data.polygons:p.use_smooth=True
    if uvs:
        layer=data.uv_layers.new(name='UVMap')
        for poly in data.polygons:
            for li in poly.loop_indices:layer.data[li].uv=uvs[data.loops[li].vertex_index]
    if morph:
        ob.shape_key_add(name='Basis');key=ob.shape_key_add(name='Fin stroke')
        for point in key.data:
            x,y,z=point.co;weight=max(0,min(1,(-x+.35)/2.6))
            point.co.y+=.29*weight*weight*math.sin((x+.3)*1.4)+.09*abs(z)*weight
    fish.append(ob);return ob

verts=[];faces=[];uvs=[];L=112;R=64
for i in range(L+1):
    t=i/L;x=-1.16+2.42*t
    fullness=max(.005,math.sin(math.pi*t))**.72
    width=.43*fullness*(.75+.4*t);height=.59*fullness
    for j in range(R+1):
        a=2*math.pi*j/R
        verts.append((x,width*math.sin(a),.035+height*math.cos(a)))
        uvs.append((t,j/R))
for i in range(L):
    for j in range(R):
        a=i*(R+1)+j;faces.append((a,a+1,a+R+2,a+R+1))
body=mesh('Sculpted goldfish body',verts,faces,bodymat,uvs,True)

def tube(name,points,radius,mat):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=1;c.resolution_u=2
    spline=c.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*co,1)
    ob=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False)
    fish.append(ob);return ob

def fin(name,origin,end_fn,rays=20,steps=18):
    vs=[];fs=[]
    for j in range(rays+1):
        a=j/rays;end=end_fn(a);anchor=origin(a) if callable(origin) else origin
        points=[]
        for i in range(steps+1):
            t=i/steps
            co=tuple(anchor[k]*(1-t)+end[k]*t for k in range(3))
            co=(co[0]-.12*math.sin(math.pi*t),co[1]+.025*math.sin(a*math.pi*8)*t*t,co[2])
            vs.append(co);points.append(co)
        if j%2==0:tube(name+' ray %02d'%j,points,.0035,raymat)
    for j in range(rays):
        for i in range(steps):
            a=j*(steps+1)+i;fs.append((a,a+steps+1,a+steps+2,a+1))
    return mesh(name,vs,fs,finmat,morph=True)

for side in [-1,1]:
    fin('Veil tail '+str(side),(-1.1,side*.045,.03),lambda a,s=side:(-2.25-.4*math.sin(math.pi*a),s*(.12+.23*math.sin(math.pi*a)),(a-.5)*2.15+.03),28,24)
def dorsal_root(a):
    x=.65-1.55*a;t=(x+1.16)/2.42
    return (x,0,.035+.59*math.sin(math.pi*t)**.72)
fin('High dorsal fin',dorsal_root,lambda a:(dorsal_root(a)[0],0,dorsal_root(a)[2]+.62*math.sin(math.pi*a)**.6),22,18)
for side in [-1,1]:
    fin('Pectoral fin '+str(side),(.47,side*.33,-.08),lambda a,s=side:(.24-.76*a,s*(.46+.36*math.sin(math.pi*a)),-.15-.5*math.sin(math.pi*a)),16,18)
    fin('Pelvic fin '+str(side),(-.34,side*.2,-.39),lambda a,s=side:(-.28-.62*a,s*(.2+.2*math.sin(math.pi*a)),-.4-.39*math.sin(math.pi*a)),12,14)

def sphere(name,loc,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc)
    ob=bpy.context.object;ob.name=name;ob.scale=scale;ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in ob.data.polygons:p.use_smooth=True
    fish.append(ob);ob.select_set(False);return ob
for side in [-1,1]:
    sphere('Raised iris '+str(side),(.88,side*.278,.18),(.145,.062,.145),iris)
    sphere('Black pupil '+str(side),(.89,side*.325,.18),(.087,.028,.094),pupil)
    tube('Curved gill crease '+str(side),[(.53-.08*math.sin(a),side*(.35+.045*math.sin(a)),.39-.67*t/24) for t in range(25) for a in [t/24*math.pi]],.009,gillmat)
tube('Small open mouth',[(1.248,.052*math.sin(a),.035+.062*math.cos(a)) for a in np.linspace(0,2*math.pi,33)],.012,lipmat)
sphere('Mouth cavity',(1.246,0,.035),(.014,.043,.051),gillmat)

# Combine decorative fin rays by material to keep browser draw calls bounded.
ray_objects=[o for o in fish if ' ray ' in o.name]
bpy.ops.object.select_all(action='DESELECT')
for o in ray_objects:o.select_set(True)
bpy.context.view_layer.objects.active=ray_objects[0];bpy.ops.object.join()
rays=bpy.context.object;rays.name='Fine fin ray structure';fish=[o for o in fish if o not in ray_objects]+[rays]
rays.shape_key_add(name='Basis');key=rays.shape_key_add(name='Fin stroke')
for point in key.data:
    x,y,z=point.co;w=max(0,min(1,(-x+.35)/2.6));point.co.y+=.29*w*w*math.sin((x+.3)*1.4)+.09*abs(z)*w
# Seven material batches per fish, sharing meshes/textures between instances.
for mat in [finmat,iris,pupil,gillmat,lipmat]:
    group=[o for o in fish if o.data.materials and o.data.materials[0]==mat]
    if len(group)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
    joined=bpy.context.object;fish=[o for o in fish if o not in group]+[joined]
bpy.ops.object.select_all(action='DESELECT')
for o in fish:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'goldfish.glb'),export_format='GLB',use_selection=True,export_morph=True,export_animations=False,export_copyright='SamG-Coder')

# Source scene includes a studio portrait for reviewing silhouette and materials.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world.color=(.11,.11,.11)
def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4.1,-7,2.6));cam=bpy.context.object;aim(cam,(-.55,0,0));cam.data.type='ORTHO';cam.data.ortho_scale=4.8;scene.camera=cam
for name,loc,power,size in [('Soft key',(1,-4,5),700,5),('Fin rim',(-2,3,2),950,3),('Fill',(3,1,-1),220,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(-.4,0,0))
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(ROOT,'.artifacts','goldfish-blender.png')
scene.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'goldfish.blend'),compress=True)
bpy.ops.render.render(write_still=True)
print('Goldfish GLB and Blender source exported for SamG-Coder')
