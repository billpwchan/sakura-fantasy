# The tall-flora atlas (2048 x 2048, eight 512 x 1024 cells, 0.9 x 1.8 m each) from ffish.asia / floraZia CC0 scans:
# reed stands in the shallows (cells 0-3) and susuki clumps on the banks (4-7). Cells 0, 1 / 4, 5 carry plumes; 2, 3 /
# 6, 7 are the same plants before they flower. The shader turns the green to straw through autumn and winter.
# Blender -b --python build_tall.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
R = random.Random(700 + (CELL % 2) * 17 + (CELL // 4) * 5)
SK = '../skfb/'
W_M, H_M = 0.9, 1.8
plumed = (CELL % 4) < 2
reset()


def classify(ob):
    col = face_colours(ob)
    r, g, b = col[:, 0], col[:, 1], col[:, 2]
    return col, r, g, b


def parts_reed():
    ob = load(SK + '91f546fb238149ff9e99a8594a3a2b58/scene.gltf', name='reed')
    col, r, g, b = classify(ob)
    me = ob.data
    c = np.array([sum((me.vertices[i].co for i in f.vertices), Vector()) / len(f.vertices) for f in me.polygons])
    v = verts(ob)
    z0, z1 = v[:, 2].min(), v[:, 2].max()
    # the plume is the tan top; the blade is the green below it
    plume = (r > g * 0.95) & (c[:, 2] > z0 + 0.35 * (z1 - z0))
    pl = keep_faces(ob, plume, 'plume')
    lf = keep_faces(ob, ~plume & (g >= r * 0.95), 'blade')
    for o in (pl, lf):
        vv = verts(o)
        foot = vv[vv[:, 2].argmin()]
        o.data.transform(Matrix.Translation(-Vector(foot)))
        o.data.update()
    return pl, lf


def parts_susuki():
    lf = load(SK + '99f88f1b9a6b4313bc2380addee29791/scene.gltf', keep=['leaf'], name='sleaf')
    fl = [load(SK + '99f88f1b9a6b4313bc2380addee29791/scene.gltf', keep=[k], name='s' + k) for k in ('flower1', 'flower2')]
    for o in [lf] + fl:
        vv = verts(o)
        foot = vv[vv[:, 2].argmin()]
        o.data.transform(Matrix.Translation(-Vector(foot)))
        o.data.update()
    return lf, fl


def length(o):
    v = verts(o)
    return float(np.linalg.norm(v - v[v[:, 2].argmin()], axis=1).max())


def stem(pts, r0, r1, col):
    return twig(pts, r0, r1, col)


if CELL < 4:
    pl, _ = parts_reed()
    # the reed scan's own blades are torn fragments; yoshi's are broad and long, held out from the culm and drooping,
    # much as the susuki leaf is, so that leaf stands in for them
    lf, _ = parts_susuki()
    L_leaf = length(lf)
    # a stand of culms, each with its blades held out alternately and drooping at the tips
    n = R.randint(9, 12)
    for k in range(n):
        x = R.uniform(-0.32, 0.32)
        y = R.uniform(-0.12, 0.12)
        H = R.uniform(1.1, 1.42) * (1.0 if plumed else 1.1)
        lean = Vector((R.uniform(-0.08, 0.08), R.uniform(-0.05, 0.05), 1)).normalized()
        top = Vector((x, y, 0)) + lean * H
        stem([Vector((x, y, -0.02)), Vector((x, y, 0)) + lean * H * 0.5, top], 0.0055, 0.003, (0.24, 0.25, 0.13))
        nl = R.randint(7, 10)
        for i in range(nl):
            t = 0.1 + 0.78 * i / nl
            p = Vector((x, y, 0)) + lean * H * t
            a = R.uniform(0, 2 * math.pi) if i == 0 else a + math.pi + R.uniform(-0.6, 0.6)
            d = Vector((math.cos(a) * 0.9, math.sin(a) * 0.55, R.uniform(0.35, 1.0))).normalized()
            s = (R.uniform(0.32, 0.46) / max(L_leaf, 1e-3)) * (1.0 - 0.35 * t)
            inst(lf, p, aim(d, R.uniform(0, 2 * math.pi)), s)
        if plumed:
            inst(pl, top - lean * 0.02, aim(lean + Vector((R.uniform(-0.3, 0.3), 0, 0)), R.uniform(0, 2 * math.pi)), R.uniform(2.0, 2.6))
    render(OUT, CELL, W_M, H_M, 512, 1024, cx=0.0, bottom=-0.03, ao_dist=0.03, lift=1.1, wb=(1.0, 1.0, 1.0), ao_k=0.3)
else:
    lf, fl = parts_susuki()
    L_leaf = length(lf)
    # a fountain: leaves rising from one crown and arching out on every side, the flowering stems standing above them
    for k in range(R.randint(38, 48)):
        a = R.uniform(0, 2 * math.pi)
        tilt = R.uniform(0.15, 0.75)
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt) * 0.6, math.cos(tilt))).normalized()
        s = (R.uniform(0.75, 1.15) / max(L_leaf, 1e-3))
        inst(lf, Vector((R.uniform(-0.06, 0.06), R.uniform(-0.03, 0.03), 0)), aim(d, R.uniform(0, 2 * math.pi)), s)
    if plumed:
        for k in range(R.randint(6, 9)):
            o = R.choice(fl)
            d = Vector((R.uniform(-0.3, 0.3), R.uniform(-0.15, 0.15), 1)).normalized()
            s = (R.uniform(1.25, 1.6) / max(length(o), 1e-3))
            inst(o, Vector((R.uniform(-0.05, 0.05), R.uniform(-0.03, 0.03), 0)), aim(d, R.uniform(0, 2 * math.pi)), s)
    render(OUT, CELL, W_M, H_M, 512, 1024, cx=0.0, bottom=-0.03, ao_dist=0.03, lift=1.1, wb=(1.0, 1.0, 1.0), ao_k=0.3)
