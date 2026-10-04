# The conifer atlas (2048 x 2048, four 1024 px cells) from ffish.asia / floraZia CC0 scans: kuromatsu branchlets
# with their needle tufts turned up (cells 0, 1) and sugi fronds (cells 2, 3), each on a twig entering at a printed
# base point on the card's left edge.
# Blender -b --python build_conifer.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
R = random.Random(500 + CELL * 13)
SK = '../skfb/'
EXT = 0.7
# cells are 2:1, as are the cards that show them: (pine, sugi) frame bottoms
BOT = (-0.07, -0.25)
reset()


def place(part, p, d, s, roll=None):
    return inst(part, p, aim(d, R.uniform(0, 2 * math.pi) if roll is None else roll), s)


def pine_tuft():
    ob = load(SK + 'c834dd713c384e60b1b943b82cd8d8a7/scene.gltf', name='tuft')
    v = verts(ob)
    foot = v[v[:, 2].argmin()]
    top = v[v[:, 2] > np.percentile(v[:, 2], 80)].mean(axis=0)
    normalise(ob, foot, top, float(np.linalg.norm(top - foot)))
    # the scan carries two conelets at the base of the needles: one on every tuft would repeat across the atlas
    me = ob.data
    c = np.array([sum((me.vertices[i].co for i in f.vertices), Vector()) / len(f.vertices) for f in me.polygons])
    h = verts(ob)[:, 2].max()
    rad = np.linalg.norm(c[:, :2], axis=1)
    col = face_colours(ob)
    lum = col.mean(axis=1)
    cone = (c[:, 2] > 0.22 * h) & (c[:, 2] < 0.62 * h) & (rad < 0.05) & ((lum > 0.2) | (col[:, 0] > col[:, 1]))
    # and the bare cut end of the shoot below the needles: on the tree the needles run right down to the bough
    stem = (c[:, 2] < 0.3 * h) & (rad < 0.025) & (col[:, 0] > col[:, 1] * 1.05)
    print('CONE faces', int(cone.sum()), 'stem', int(stem.sum()), 'of', len(c))
    t = keep_faces(ob, ~(cone | stem), 'tuft2')
    v = verts(t)
    z0 = np.percentile(v[:, 2], 1.5)
    t.data.transform(Matrix.Translation((0, 0, -z0)))
    t.data.update()
    return t


def sugi_spray():
    ob = load(SK + '930e1a9369a04c9a85281b4085e44507/scene.gltf', name='sugi')
    me = ob.data
    c = np.array([sum((me.vertices[i].co for i in f.vertices), Vector()) / len(f.vertices) for f in me.polygons])
    v = verts(ob)
    cx = (v[:, 0].min() + v[:, 0].max()) / 2
    col = face_colours(ob)
    r, g, b = col[:, 0], col[:, 1], col[:, 2]
    # the frond alone: not the cone cluster beside it, nor the orange pollen cones along its tips
    pollen = (r > g * 1.12) & (r > b * 1.6)
    keep = (c[:, 0] < cx + 0.01) & ~pollen
    print('SUGI keep', int(keep.sum()), 'pollen', int(pollen.sum()))
    fr = keep_faces(ob, keep, 'frond')
    v = verts(fr)
    foot = v[v[:, 2].argmax()]
    tip = v[v[:, 2] < np.percentile(v[:, 2], 25)].mean(axis=0)
    normalise(fr, foot, tip, float(np.linalg.norm(tip - foot)))
    return fr


p0 = Vector((-EXT / 2 + 0.03, 0, 0.0))
if CELL < 2:
    tu = pine_tuft()
    # a branchlet running out from the bough: side shoots fork off it, every tip ends in an upturned tuft
    main = [p0]
    d = Vector((1, 0, 0.08)).normalized()
    for i in range(6):
        d = (d + Vector((0, R.uniform(-0.08, 0.08), R.uniform(-0.04, 0.06)))).normalized()
        main.append(main[-1] + d * 0.07)
    twig(main, 0.007, 0.004, (0.11, 0.075, 0.055))
    tips = [(main[-1], d)]
    for k in range(6 if CELL == 0 else 8):
        i = 1 + k % 5
        sd = (main[i + 1] - main[i]).normalized() + Vector((0, R.uniform(-0.9, 0.9), R.uniform(0.2, 0.7)))
        sd.normalize()
        L = R.uniform(0.06, 0.12)
        br = [main[i], main[i] + sd * L * 0.5 + Vector((0, 0, 0.01)), main[i] + sd * L]
        twig(br, 0.004, 0.003, (0.11, 0.075, 0.055))
        tips.append((br[-1], sd))
    for t, td in tips:
        up = Vector((td.x * 0.35, td.y * 0.5, 1)).normalized()
        place(tu, t, up, R.uniform(0.95, 1.25))
        if R.random() < 0.5:
            place(tu, t - td * 0.02, (up + Vector((R.uniform(-0.4, 0.4), R.uniform(-0.4, 0.4), 0))).normalized(), R.uniform(0.75, 0.95))
    render(OUT, CELL, EXT, EXT / 2, 1024, 512, cx=0.0, bottom=BOT[0], ao_dist=0.03, lift=1.15, wb=(1.0, 1.0, 1.0), ao_k=0.3)
else:
    fr = sugi_spray()
    # a frond: the axis droops away from the bough and turns up at its tip; foliage crowds it on every side, the
    # side sprays sweeping forward and drooping, so from the side it reads as one dense, feathery mass
    main = [p0]
    d = Vector((1, 0, 0.04)).normalized()
    n = 6
    for i in range(n):
        d = (d + Vector((0, R.uniform(-0.05, 0.05), -0.06 + 0.03 * i))).normalized()
        main.append(main[-1] + d * 0.07)
    twig(main, 0.006, 0.0025, (0.1, 0.075, 0.05))
    per = 4 if CELL == 2 else 6
    for i in range(1, n + 1):
        a, b = main[i - 1], main[i]
        ax = (b - a).normalized()
        for k in range(per):
            ang = (k / per) * 2 * math.pi + R.uniform(-0.4, 0.4)
            out = Vector((0, math.cos(ang) * 0.55, math.sin(ang) * 0.4 - 0.18))
            dd = (ax * R.uniform(0.7, 1.1) + out).normalized()
            place(fr, a.lerp(b, R.uniform(0.1, 0.9)), dd, R.uniform(1.2, 1.65) * (1.0 - 0.05 * i))
    place(fr, main[-1], (d + Vector((0, 0, 0.12))).normalized(), 1.3)
    place(fr, main[-1], (d + Vector((0, 0.4, -0.1))).normalized(), 1.1)
    render(OUT, CELL, EXT, EXT / 2, 1024, 512, cx=0.0, bottom=BOT[1], ao_dist=0.03, lift=1.15, wb=(1.0, 1.0, 1.0), ao_k=0.3)
bottom = BOT[0 if CELL < 2 else 1]
print('BASE', CELL, round((p0.x + EXT / 2) / EXT, 4), round((p0.z - bottom) / (EXT / 2), 4))
