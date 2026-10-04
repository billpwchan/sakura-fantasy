# A seamless turf texture seen from above, grown from the same CC0 grass clumps as the cards: clumps scattered
# periodically over a 2 m tile (each one repeated across the edges it overlaps), over damp soil.
# Blender -b --python build_turf.py -- <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

OUT = sys.argv[sys.argv.index('--') + 1:][0]
R = random.Random(77)
P = 2.0
reset()
low, tall = [], []
for g, short in (('grass_medium_01', 'm1'), ('grass_medium_02', 'm2'), ('grass_bermuda_01', 'bd')):
    for p in islands(load(f'../phm/{g}/{g}.gltf', name=short, metric=False, alpha=f'../phm/{g}/textures/{g}_alpha_2k.png'), 0.06):
        h = verts(p)[:, 2].max()
        if h < 0.03:
            continue
        if short == 'bd' and h < 0.08:
            continue
        (low if h < 0.2 else tall).append(p)
print('PARTS', len(low), len(tall))


def put(part, x, y, s, lean=0.6):
    rz = R.uniform(0, 2 * math.pi)
    # a lawn's blades are trodden and tangled: clumps lie over every which way
    q = Quaternion((1, 0, 0), R.uniform(-lean, lean)) @ Quaternion((0, 1, 0), R.uniform(-lean, lean)) @ Quaternion((0, 0, 1), rz)
    rad = 0.22 * s
    for ox in (-P, 0, P):
        for oy in (-P, 0, P):
            px, py = x + ox, y + oy
            if -rad < px < P + rad and -rad < py < P + rad:
                inst(part, (px, py, 0), q, s)


for i in range(int(P * P * 420)):
    put(R.choice(low), R.uniform(0, P), R.uniform(0, P), R.uniform(0.7, 1.3))
for i in range(int(P * P * 8)):
    put(R.choice(tall), R.uniform(0, P), R.uniform(0, P), R.uniform(0.7, 1.0), 0.3)
# white clover through the sward
cl = []
for k_ in ('W22-1', 'W22-3'):
    p_ = load('../skfb/98158fb9250c4a85a55925e69a220363/scene.gltf', keep=[k_], name='cl' + k_)
    recentre(p_)
    cl.append(p_)
for i in range(int(P * P * 30)):
    put(R.choice(cl), R.uniform(0, P), R.uniform(0, P), R.uniform(0.35, 0.55), 0.5)

sc = bpy.context.scene
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = P
cam.location = (P / 2, P / 2, 5)
cam.rotation_euler = (0, 0, 0)
import atlaslib
# render() frames from the side: reuse its passes with this camera by calling the internals
sc.render.engine = 'CYCLES'
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 2048
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '16'
sc.render.image_settings.color_mode = 'RGBA'
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
sc.cycles.max_bounces = 0
sc.cycles.transparent_max_bounces = 24
mats = set(m for o in sc.objects if o.type == 'MESH' for m in o.data.materials if m)
atlaslib.AO_DIST = 0.05
paths = {}
for kind, view, spp, den in (('col', 'Standard', 32, True), ('ao', 'Standard', 32, True), ('nrm', 'Raw', 12, False)):
    for m in mats:
        atlaslib._rebuild(m, kind)
    sc.view_settings.view_transform = view
    sc.cycles.samples = spp
    sc.cycles.use_denoising = den
    paths[kind] = f'{OUT}/turf_{kind}.png'
    sc.render.filepath = paths[kind]
    bpy.ops.render.render(write_still=True)

col = atlaslib._load(paths['col'])
ao = atlaslib._load(paths['ao'])[..., :1]
nrm = atlaslib._load(paths['nrm'])[..., :3]
a = col[..., 3:4]
# between the blades: damp dark soil and thatch, so gaps read as depth, not as holes
soil = np.array([0.1, 0.085, 0.05], dtype=np.float32)
rgb = col[..., :3] * (0.6 + 0.4 * ao) * a + soil * (1 - a)
atlaslib._write(f'{OUT}/turf_c.png', rgb, 3)
v = nrm * 2 - 1
v[..., 2] *= -1
v = v * a + np.array([0, 0, 1], dtype=np.float32) * (1 - a)
v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
atlaslib._write(f'{OUT}/turf_n.png', v * 0.5 + 0.5, 3)
print('TURF coverage', round(float(a.mean()), 3), 'mean', rgb.reshape(-1, 3).mean(axis=0).round(3))
