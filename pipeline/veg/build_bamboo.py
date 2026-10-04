# The bamboo atlas (2048 x 2048, four 1024 px cells) from the ffish.asia / floraZia CC0 hoteichiku scan (42f5747a):
# its two whole leaves cut free, set in the loose drooping fans that end every bamboo branchlet, along a branch that
# leaves the culm rising and bends down under its leaves. The twig enters at a printed base point on the left edge.
# Blender -b --python build_bamboo.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
R = random.Random(1700 + CELL * 37)
SK = '../skfb/42f5747a9e1a474ba9922342ab86dc6f/scene.gltf'
EXT = 0.7
reset()


def leaves():
    ob = load(SK, name='hoteichiku')
    me = ob.data
    col = face_colours(ob)
    r, g, b = col[:, 0], col[:, 1], col[:, 2]
    mask = (g > r * 1.12) & (col.mean(axis=1) < 0.42)
    # connected pieces of leaf (vertices welded by position: the glTF splits them along UV seams)
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    _, vid = np.unique(np.round(co.reshape(-1, 3) * 2e4).astype(np.int64), axis=0, return_inverse=True)
    vid = vid.ravel()
    ls = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get('loop_start', ls)
    lv = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', lv)
    fv = vid[lv]
    fs = ls[mask]
    e0 = np.concatenate([fv[fs], fv[fs + 1], fv[fs + 2]])
    e1 = np.concatenate([fv[fs + 1], fv[fs + 2], fv[fs]])
    lab = np.arange(vid.max() + 1)
    for _ in range(2000):
        m = np.minimum(lab[e0], lab[e1])
        old = lab.copy()
        np.minimum.at(lab, e0, m)
        np.minimum.at(lab, e1, m)
        lab = lab[lab]
        if np.array_equal(old, lab):
            break
    fl = np.full(len(me.polygons), -1)
    fl[mask] = lab[fv[fs]]
    cen = np.empty(len(me.polygons) * 3, dtype=np.float32)
    me.polygons.foreach_get('center', cen)
    cen = cen.reshape(-1, 3)
    ids, cnt = np.unique(fl[mask], return_counts=True)
    out = []
    for k in ids[np.argsort(-cnt)[:6]]:
        sel = fl == k
        c = cen[sel]
        mid = c.mean(axis=0)
        u, sv, vt = np.linalg.svd(c - mid, full_matrices=False)
        ln = (c - mid) @ vt[0]
        span = ln.max() - ln.min()
        if not (0.05 < span < 0.14) or sv[2] / sv[0] > 0.2:
            continue
        # the base is the broad end, the tip the long drawn-out point
        wd = np.abs((c - mid) @ vt[1])
        w_lo = wd[ln < ln.min() + 0.25 * span].mean()
        w_hi = wd[ln > ln.max() - 0.25 * span].mean()
        base, tip = (c[ln.argmin()], c[ln.argmax()]) if w_lo > w_hi else (c[ln.argmax()], c[ln.argmin()])
        Z = Vector(tip - base).normalized()
        Nn = Vector(vt[2])
        Y = (Nn - Z * Nn.dot(Z)).normalized()
        X = Y.cross(Z)
        part = keep_faces(ob, sel, 'leaf%d' % len(out))
        # madake's leaves run larger than hoteichiku's
        part.data.transform(Matrix.Scale(1.35, 4) @ Matrix((X, Y, Z)).to_4x4() @ Matrix.Translation(-Vector(base)))
        part.data.update()
        print('LEAF', len(out), 'faces', int(sel.sum()), 'len_cm', round(float(span) * 135, 1))
        out.append(part)
    return out


LV = leaves()
TWIG = (0.2, 0.2, 0.09)


def leaf_at(p, d, s):
    # its blade turned to the light (the camera), within a loose turn either way
    d = Vector(d).normalized()
    Y = Vector((0, 1, 0)) - d * d.y
    Y.normalize()
    Y = Quaternion(d, R.uniform(-0.7, 0.7)) @ Y
    X = Y.cross(d)
    o = bpy.data.objects.new('l', R.choice(LV).data)
    bpy.context.scene.collection.objects.link(o)
    o.matrix_world = Matrix.Translation(p) @ Matrix((X, Y, d)).transposed().to_4x4() @ Matrix.Scale(s, 4)


def fan(p, d, n):
    # a palm of leaves splayed from the branchlet's tip, hanging under their own weight
    d = Vector(d).normalized()
    for i in range(n):
        a = (i - (n - 1) / 2) * R.uniform(0.42, 0.6) + R.uniform(-0.12, 0.12)
        dd = Quaternion((0, 1, 0), a) @ d
        dd = (dd + Vector((0, R.uniform(-0.5, 0.5), -R.uniform(0.08, 0.3)))).normalized()
        leaf_at(p + dd * 0.006, dd, R.uniform(0.8, 1.1))


p0 = Vector((-EXT / 2 + 0.03, 0, 0.0))
main = [p0]
d = Vector((1, 0, 0.32)).normalized()
for i in range(7):
    d = (d + Vector((0, R.uniform(-0.06, 0.06), -0.1))).normalized()
    main.append(main[-1] + d * 0.08)
twig(main, 0.0035, 0.0018, TWIG)
dense = CELL < 2
for i in range(1, 7):
    a, b = main[i], main[i + 1]
    ax = (b - a).normalized()
    for side in ((1, -1) if dense or i % 2 else (-1,)):
        sd = (ax + Vector((0, R.uniform(-0.6, 0.6), side * R.uniform(0.5, 0.9)))).normalized()
        L = R.uniform(0.07, 0.15)
        br = [a, a + sd * L * 0.5, a + sd * L + Vector((0, 0, -0.01))]
        twig(br, 0.0018, 0.0012, TWIG)
        tip_d = (sd + Vector((0, 0, -0.3))).normalized()
        fan(br[-1], tip_d, R.randint(5, 7) if dense else R.randint(4, 6))
    if R.random() < (0.7 if dense else 0.4):
        fan(a.lerp(b, 0.5), (ax * 0.5 + Vector((0, R.uniform(-0.5, 0.5), -0.8))).normalized(), R.randint(2, 3))
fan(main[-1], (d + Vector((0, 0, -0.2))).normalized(), R.randint(6, 8) if dense else 5)
render(OUT, CELL, EXT, EXT, 1024, 1024, cx=0.0, bottom=-EXT / 2, ao_dist=0.02, lift=1.15, wb=(1.0, 1.0, 1.0), ao_k=0.3)
print('BASE', CELL, round((p0.x + EXT / 2) / EXT, 4), round((p0.z + EXT / 2) / EXT, 4))
