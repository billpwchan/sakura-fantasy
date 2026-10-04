# The broadleaf atlas (2048 x 2048, four 1024 px cells) from the ffish.asia / floraZia CC0 konara oak scan: leafy
# sprays (0, 1) and the same sprays again (2, 3) that the compose step regrades to the oak's autumn tan and rust.
# Blender -b --python build_broad.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
SRC = CELL % 2
R = random.Random(1300 + SRC * 31)
SK = '../skfb/afa028430ce34862a91dff24b1797745/scene.gltf'
EXT = 0.6
reset()
root = bpy.data.objects.new('root', None)
bpy.context.scene.collection.objects.link(root)


def units():
    ob = load(SK, name='konara')
    me = ob.data
    cen = np.empty(len(me.polygons) * 3, dtype=np.float32)
    me.polygons.foreach_get('center', cen)
    cen = cen.reshape(-1, 3)
    # the scan is two leaf whorls side by side: split them by connectivity, so no leaf of one is cut off into the
    # other (vertices welded by position first, as the glTF splits them along UV seams)
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    _, vid = np.unique(np.round(co.reshape(-1, 3) * 2e4).astype(np.int64), axis=0, return_inverse=True)
    vid = vid.ravel()
    ls = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get('loop_start', ls)
    lv = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', lv)
    lv = vid[lv]
    e0 = np.concatenate([lv[ls], lv[ls + 1], lv[ls + 2]])
    e1 = np.concatenate([lv[ls + 1], lv[ls + 2], lv[ls]])
    lab_v = np.arange(vid.max() + 1)
    for it in range(500):
        m = np.minimum(lab_v[e0], lab_v[e1])
        old = lab_v.copy()
        np.minimum.at(lab_v, e0, m)
        np.minimum.at(lab_v, e1, m)
        lab_v = lab_v[lab_v]
        if np.array_equal(old, lab_v):
            break
    fl = lab_v[lv[ls]]
    ids, cnt = np.unique(fl, return_counts=True)
    order = np.argsort(-cnt)
    print('COMPONENTS', len(ids), 'largest', cnt[order[:4]].tolist(), 'iters', it)
    big = ids[order[:2]]
    a, b = cen[fl == big[0]].mean(axis=0), cen[fl == big[1]].mean(axis=0)
    # every smaller piece (a loose leaf, a crumb) goes with the whorl it lies nearest
    comp_c = {k: cen[fl == k].mean(axis=0) for k in ids[cnt > 50]}
    lab = np.zeros(len(cen), dtype=bool)
    for k, c in comp_c.items():
        lab[fl == k] = np.linalg.norm(c - a) > np.linalg.norm(c - b)
    keep = np.isin(fl, list(comp_c.keys()))
    col = face_colours(ob)
    r, g, bl = col[:, 0], col[:, 1], col[:, 2]
    twig_f = (r > g * 0.95) & (r > bl)
    out = []
    for i, m in enumerate((~lab & keep, lab & keep)):
        part = keep_faces(ob, m, 'whorl%d' % i)
        c = cen[m]
        mid = c.mean(axis=0)
        tw = cen[m & twig_f]
        pts = tw if len(tw) > 20 else c
        foot = pts[np.argmax(np.linalg.norm(pts - mid, axis=1))]
        part.data.transform(Matrix.Translation(-Vector(foot)))
        d = mid - foot
        part.data.transform(Matrix.Rotation(-math.atan2(d[1], d[0]), 4, 'Z'))
        part.data.update()
        print('UNIT', i, 'faces', int(m.sum()), 'twig faces', len(tw), 'reach', round(float(np.linalg.norm(d[:2])), 3))
        out.append(part)
    return out


us = units()


def put(p, ang, s):
    q = Quaternion((0, 0, 1), ang) @ Quaternion((1, 0, 0), R.uniform(-0.25, 0.25)) @ Quaternion((0, 1, 0), R.uniform(-0.2, 0.2))
    c = inst(R.choice(us), p, q, s)
    c.parent = root
    return c


# the spray, built lying flat (leaves up, +z): a twig along +x forking in opposite pairs, a leafy shoot at each fork
p0 = Vector((-EXT / 2 + 0.03, 0, 0))
main = [p0]
d = Vector((1, 0, 0))
for i in range(5):
    d = (d + Vector((0, R.uniform(-0.15, 0.15), 0))).normalized()
    main.append(main[-1] + d * 0.075)
tw = twig(main, 0.004, 0.0024, (0.13, 0.1, 0.075))
tw.parent = root
for i in range(1, 6):
    a = math.atan2((main[i] - main[i - 1]).y, (main[i] - main[i - 1]).x)
    for side in (-1, 1):
        if i == 5 and side == 1:
            continue
        put(main[i], a + side * R.uniform(0.6, 1.1), R.uniform(0.95, 1.25) * (1.05 - 0.04 * i))
put(main[-1], math.atan2(d.y, d.x) + R.uniform(-0.2, 0.2), 1.2)
# seen from above: the flat spray stood up to face the camera (+z becomes -y, toward it)
root.rotation_euler = (math.pi / 2, 0, 0)
render(OUT, CELL, EXT, EXT, 1024, 1024, cx=0.0, bottom=-EXT / 2, ao_dist=0.02, lift=1.2, wb=(1.0, 1.0, 1.0), ao_k=0.3)
print('BASE', CELL, round((p0.x + EXT / 2) / EXT, 4), round((0 - (-EXT / 2)) / EXT, 4))
