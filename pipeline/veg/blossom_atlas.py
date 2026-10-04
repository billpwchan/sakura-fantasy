# Somei Yoshino blossom sprays for the sakura's foliage cards, rendered from the CC0 photoscanned flower cluster
# (ffish.asia / floraZia, Sketchfab e3317fd3): clusters set along modelled twigs, rendered orthographic in Cycles with
# the scan's own colour (unlit) and ambient occlusion; one 1024 px cell per arrangement.
# Blender -b --python blossom_atlas.py -- <scene.gltf> <outdir> <cell index> <seed> <kind: spray|mass|bud> [leaf scan]
# With a leaf scan (run.sh passes the Japanese zelkova) the same seed lays out the same twigs and the same framing, but each
# cluster becomes a whorl of summer leaves: the leaf atlas a card swaps to out of bloom, its twig still in place.
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix, Quaternion
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, CELL, SEED, KIND = args[0], args[1], int(args[2]), int(args[3]), args[4]
LEAF = args[5] if len(args) > 5 else None
R = random.Random(SEED)
R2 = random.Random(SEED + 1)
LEAF_P = {'spray': 0.5, 'bud': 0.5, 'mass': 0.4}[KIND]
BASE = None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    if any(m and m.name.startswith('Material.001') for m in o.data.materials):
        bpy.data.objects.remove(o)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.join()
cl = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [x for x in bpy.data.objects if x != cl]:
    bpy.data.objects.remove(o)
me = cl.data
co = np.empty(len(me.vertices) * 3, dtype=np.float32)
me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
# the stalk's foot is the lowest point; the head is the flowers' centroid
foot = co[co[:, 2].argmin()]
top = co[co[:, 2] > np.percentile(co[:, 2], 60)].mean(axis=0)
axis = Vector(top - foot)
L = axis.length
# origin at the foot, stalk along +Z, 11 cm from foot to the flowers' centre
q = axis.normalized().rotation_difference(Vector((0, 0, 1)))
M = Matrix.Scale(0.11 / L, 4) @ q.to_matrix().to_4x4() @ Matrix.Translation(-Vector(foot))
me.transform(M)
cl.name = 'cluster'
# unlit scan colour: the image straight to an emission shader
for m in me.materials:
    nt = m.node_tree
    img = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(img.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
cl.hide_render = True
rme = me
LEAVES = []
if LEAF:
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import atlaslib
    lo = atlaslib.load(LEAF, name='oshima')
    # the zelkova scan (024e8b42) is a twig with three alternate leaves in autumn colour, keyaki's leaf the shape of
    # a cherry's: the whole twig is the unit, its cut end at the origin and its leaves toward +Z, their plane facing -Y
    me_ = lo.data
    cen_ = np.empty(len(me_.polygons) * 3, dtype=np.float32)
    me_.polygons.foreach_get('center', cen_)
    cen_ = cen_.reshape(-1, 3)
    mid = cen_.mean(axis=0)
    u, sv, vt = np.linalg.svd(cen_ - mid, full_matrices=False)
    foot = cen_[np.linalg.norm(cen_ - mid, axis=1).argmax()]
    Z = Vector(mid - foot).normalized()
    Nn = Vector(vt[2])
    Y = (Nn - Z * Nn.dot(Z)).normalized()
    X = Y.cross(Z)
    me_.transform(Matrix.Scale(1.15, 4) @ Matrix((X, Y, Z)).to_4x4() @ Matrix.Translation(-Vector(foot)))
    me_.update()
    LEAVES.append(lo)
    print('LEAFUNIT faces', len(cen_), 'reach_cm', round(float(np.linalg.norm(mid - foot)) * 115, 1))
    for m in LEAVES[0].data.materials:
        src = atlaslib._sources(m)[0]
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(src, em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    lme = LEAVES[0].data
    rme = lme
    stalk = bpy.data.materials.new('stalk')
    stalk.use_nodes = True
    em_ = stalk.node_tree.nodes.new('ShaderNodeEmission')
    em_.inputs['Color'].default_value = (0.2, 0.17, 0.07, 1)
    stalk.node_tree.links.new(em_.outputs['Emission'], stalk.node_tree.nodes['Material Output'].inputs['Surface'])

bark = bpy.data.materials.new('bark')
bark.use_nodes = True
bn = bark.node_tree
em = bn.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.075, 0.06, 0.055, 1)
bn.links.new(em.outputs['Emission'], bn.nodes['Material Output'].inputs['Surface'])


def twig(pts, r0, r1):
    cu = bpy.data.curves.new('twig', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 3
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
        sp.points[i].radius = r0 + (r1 - r0) * i / (len(pts) - 1)
    o = bpy.data.objects.new('twig', cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(bark)
    return o


def path(p0, d, length, n, bend):
    pts = [Vector(p0)]
    d = Vector(d).normalized()
    for i in range(n):
        d = (d + Vector((R.uniform(-bend, bend), 0, R.uniform(-bend, bend)))).normalized()
        pts.append(pts[-1] + d * (length / n))
    return pts


def place(p, out, s=1.0):
    """a cluster at p, its stalk leaning along out, turned at random about it"""
    c = bpy.data.objects.new('c', me)
    bpy.context.scene.collection.objects.link(c)
    out = Vector(out).normalized()
    qq = Vector((0, 0, 1)).rotation_difference(out)
    roll = Quaternion(out, R.uniform(0, 2 * math.pi))
    c.rotation_mode = 'QUATERNION'
    c.rotation_quaternion = roll @ qq
    c.location = p
    c.scale = (s, s, s)
    if LEAF:
        # the flower cluster stays for the framing only; a leaf on its stalk takes its place, its blade turned to
        # the light (the camera), some of the clusters bare twig as a summer spray has gaps
        c.hide_render = True
        c['frame'] = 1
        if R2.random() < LEAF_P:
            d = (out + Vector((R2.uniform(-0.3, 0.3), 0, R2.uniform(-0.1, 0.3)))).normalized()
            pl = 0.0
            Z = d
            Y = Vector((0, 1, 0)) - Z * Z.y
            if Y.length < 1e-3:
                Y = Vector((1, 0, 0)) - Z * Z.x
            Y.normalize()
            Y = Quaternion(Z, R2.uniform(-0.8, 0.8)) @ Y
            X = Y.cross(Z)
            lw_ = bpy.data.objects.new('l', R2.choice(LEAVES).data)
            bpy.context.scene.collection.objects.link(lw_)
            # the twigs reach past the flower clusters that frame the cell: kept a little smaller, and in the
            # dome pulled in toward its heart
            pp = Vector(p) * (0.72 if KIND == 'mass' else 1.0)
            k_ = 0.7 if KIND == 'mass' else 0.86
            lw_.matrix_world = Matrix.Translation(pp) @ Matrix((X, Y, Z)).transposed().to_4x4() @ Matrix.Scale(R2.uniform(0.8, 1.05) * s * k_, 4)
            lw_['noframe'] = 1
    return c


def spray(main_len, nside, spacing, buds=False):
    # a twig across the card, gently curved, with side twiglets; clusters on short spurs along all of them
    p0 = Vector((-main_len * 0.5, 0, -main_len * 0.12))
    main = path(p0, (1, 0, R.uniform(0.1, 0.35)), main_len, 8, 0.18)
    global BASE
    BASE = main[0].copy()
    twig(main, 0.0034, 0.0012)
    branches = [main]
    for k in range(nside):
        t = R.uniform(0.25, 0.8)
        i = int(t * (len(main) - 1))
        side = 1 if k % 2 == 0 else -1
        d = (main[i + 1] - main[i]).normalized()
        nd = (d + Vector((0, 0, side * R.uniform(0.7, 1.3)))).normalized()
        b = path(main[i], nd, main_len * R.uniform(0.25, 0.45), 5, 0.25)
        twig(b, 0.0019, 0.0009)
        branches.append(b)
    for b in branches:
        acc = R.uniform(0.0, spacing)
        for a, c in zip(b, b[1:]):
            seg = (c - a).length
            while acc < seg:
                p = a.lerp(c, acc / seg)
                d = (c - a).normalized()
                # spurs leave the twig to either side and toward the viewer or away, with a forward lean
                side = Vector((R.uniform(-1, 1), R.uniform(-0.9, 0.9), R.uniform(-1, 1)))
                side -= d * side.dot(d)
                place(p, (side.normalized() * 1.0 + d * 0.5), R.uniform(0.95, 1.3) * (0.75 if buds and R.random() < 0.3 else 1.0))
                acc += spacing * R.uniform(0.7, 1.3)
            acc -= seg
        # a cluster at the tip
        place(b[-1], (b[-1] - b[-2]).normalized(), R.uniform(0.85, 1.05))


def mass(n):
    # a dense clump, as the inside of a crown in full bloom: clusters on a squashed dome facing the viewer, their
    # stalks' feet buried inside it so no spokes show
    for i in range(n):
        dvec = Vector((R.gauss(0, 1), -abs(R.gauss(0, 1)) * 1.1 - 0.15, R.gauss(0, 0.8))).normalized()
        r = 0.24 * (0.55 + 0.45 * R.random() ** 0.5)
        s_ = R.uniform(0.95, 1.25)
        place(dvec * (r - 0.1 * s_), dvec + Vector((R.uniform(-0.3, 0.3), 0, R.uniform(-0.1, 0.4))), s_)


if KIND == 'spray':
    spray(0.5, 4, 0.032)
elif KIND == 'bud':
    spray(0.46, 3, 0.04, buds=True)
else:
    mass(190)

# frame the arrangement
sc = bpy.context.scene
bpy.context.view_layer.update()
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in sc.objects:
    if o.type not in ('MESH', 'CURVE') or (o.hide_render and 'frame' not in o) or 'noframe' in o:
        continue
    for cc in o.bound_box:
        w = o.matrix_world @ Vector(cc)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2
span = max(mx.x - mn.x, mx.z - mn.z) * 1.04
print('SPAN', round(span, 3), 'm')
if BASE is not None:
    print('BASE', CELL, round((BASE.x - (ctr.x - span / 2)) / span, 4), round((BASE.z - (ctr.z - span / 2)) / span, 4))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = span
cam.location = (ctr.x, -2.0, ctr.z)
cam.rotation_euler = (math.pi / 2, 0, 0)
sc.render.engine = 'CYCLES'
sc.cycles.samples = 48
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '16'
sc.render.image_settings.color_mode = 'RGBA'
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
sc.render.filepath = f'{OUT}/cell{CELL}_col.png'
bpy.ops.render.render(write_still=True)

# second pass: ambient occlusion over the same geometry, so the clusters keep their depth on a flat card
ao = bpy.data.materials.new('ao')
ao.use_nodes = True
an = ao.node_tree
aon = an.nodes.new('ShaderNodeAmbientOcclusion')
aon.inputs['Distance'].default_value = 0.025
aon.samples = 16
em2 = an.nodes.new('ShaderNodeEmission')
an.links.new(aon.outputs['AO'], em2.inputs['Color'])
an.links.new(em2.outputs['Emission'], an.nodes['Material Output'].inputs['Surface'])
for mm in [rme] + [o.data for o in LEAVES]:
    for i in range(len(mm.materials)):
        mm.materials[i] = ao
for o in sc.objects:
    if o.type == 'CURVE':
        o.data.materials[0] = ao
sc.render.filepath = f'{OUT}/cell{CELL}_ao.png'
bpy.ops.render.render(write_still=True)


# third pass: the surface normal in the camera's frame (x right, y up, z toward the camera), petals' backs flipped to
# face the camera as a card's normal map does; raw values, no view transform
nm = bpy.data.materials.new('nrm')
nm.use_nodes = True
nn = nm.node_tree
geo = nn.nodes.new('ShaderNodeNewGeometry')
vt = nn.nodes.new('ShaderNodeVectorTransform')
vt.vector_type = 'NORMAL'
vt.convert_from = 'WORLD'
vt.convert_to = 'CAMERA'
nn.links.new(geo.outputs['Normal'], vt.inputs['Vector'])
sgn = nn.nodes.new('ShaderNodeMath')
sgn.operation = 'MULTIPLY_ADD'
nn.links.new(geo.outputs['Backfacing'], sgn.inputs[0])
sgn.inputs[1].default_value = -2.0
sgn.inputs[2].default_value = 1.0
fl_ = nn.nodes.new('ShaderNodeVectorMath')
fl_.operation = 'SCALE'
nn.links.new(vt.outputs['Vector'], fl_.inputs[0])
nn.links.new(sgn.outputs[0], fl_.inputs['Scale'])
enc = nn.nodes.new('ShaderNodeVectorMath')
enc.operation = 'MULTIPLY_ADD'
nn.links.new(fl_.outputs['Vector'], enc.inputs[0])
enc.inputs[1].default_value = (0.5, 0.5, 0.5)
enc.inputs[2].default_value = (0.5, 0.5, 0.5)
em3 = nn.nodes.new('ShaderNodeEmission')
nn.links.new(enc.outputs['Vector'], em3.inputs['Color'])
nn.links.new(em3.outputs['Emission'], nn.nodes['Material Output'].inputs['Surface'])
for mm in [rme] + [o.data for o in LEAVES]:
    for i in range(len(mm.materials)):
        mm.materials[i] = nm
for o in sc.objects:
    if o.type == 'CURVE':
        o.data.materials[0] = nm
sc.view_settings.view_transform = 'Raw'
sc.cycles.use_denoising = False
sc.cycles.samples = 16
sc.render.filepath = f'{OUT}/cell{CELL}_nrm.png'
bpy.ops.render.render(write_still=True)

import OpenImageIO as oiio


def load(path):
    # raw file values (sRGB-encoded, straight alpha), rows top-down, no colour management in the way
    return oiio.ImageBuf(path).get_pixels(oiio.FLOAT)


col = load(f'{OUT}/cell{CELL}_col.png')
aoi = load(f'{OUT}/cell{CELL}_ao.png')
alpha = col[..., 3]
rgb = col[..., :3].copy()
lum = rgb.mean(axis=2, keepdims=True)
# the scan carries the shade it was photographed in and a warm cast: lift the petals toward the white they are, leave
# the stalks and twigs their own colour
fl = np.clip((lum - 0.4) / 0.25, 0, 1) * (0.0 if LEAF else 1.0)
lift = 1 - (1 - rgb) ** 1.35
lift = lift * np.array([1.0, 1.01, 1.06], dtype=np.float32)
rgb = rgb + (lift - rgb) * fl
rgb = np.clip(rgb, 0, 1) * (0.72 + 0.28 * aoi[..., :1])
# bleed: fill each transparent pixel from the nearest coarser level that has colour there, so mips don't fringe
levels = [(rgb * alpha[..., None], alpha)]
while levels[-1][1].shape[0] > 4:
    c, a_ = levels[-1]
    h = c.shape[0] // 2
    levels.append((c.reshape(h, 2, h, 2, 3).mean(axis=(1, 3)), a_.reshape(h, 2, h, 2).mean(axis=(1, 3))))
fill = levels[-1][0] / np.maximum(levels[-1][1][..., None], 1e-6)
for c, a_ in reversed(levels[:-1]):
    fill = np.repeat(np.repeat(fill, 2, axis=0), 2, axis=1)
    here = c / np.maximum(a_[..., None], 1e-6)
    w = np.clip(a_ * 4.0, 0, 1)[..., None]
    fill = here * w + fill * (1 - w)
out = np.where(alpha[..., None] > 0.002, rgb, fill)
res = np.ascontiguousarray(np.concatenate([out, alpha[..., None]], axis=2).astype(np.float32))
ob = oiio.ImageBuf(oiio.ImageSpec(1024, 1024, 4, oiio.UINT8))
ob.set_pixels(oiio.ROI(0, 1024, 0, 1024, 0, 1, 0, 4), res)
ob.write(f'{OUT}/cell{CELL}.png')
# the normal map, its empty texels flat so mips fade the relief out instead of tilting it
nrm = load(f'{OUT}/cell{CELL}_nrm.png')[..., :3]
v = nrm * 2 - 1
v[..., 2] *= -1  # Cycles' camera space looks down +z
v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
w = np.clip(alpha, 0, 1)[..., None]
v = v * w + np.array([0, 0, 1], dtype=np.float32) * (1 - w)
v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
nb = oiio.ImageBuf(oiio.ImageSpec(1024, 1024, 3, oiio.UINT8))
nb.set_pixels(oiio.ROI(0, 1024, 0, 1024, 0, 1, 0, 3), np.ascontiguousarray((v * 0.5 + 0.5).astype(np.float32)))
nb.write(f'{OUT}/cell{CELL}_n.png')
o = rgb[alpha > 0.99]
print('CELL', CELL, 'coverage', round(float(alpha.mean()), 3), 'mean', o.mean(axis=0).round(3))
