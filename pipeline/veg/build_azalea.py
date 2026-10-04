# The tsutsuji atlas (4 x 2 cells; 6 is the Hirado mound in bloom, 7 a second leafy mound): sprays of Oomurasaki and Hirado azalea (ffish.asia / floraZia CC0 scans) on twigs, a
# dense mound of bloom, the evergreen leaves alone for the rest of the year, and the two sprays again out of flower
# (cells 4, 5: the same twigs, so a card keeps its place when it changes cell with the season).
# Blender -b --python build_azalea.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
SRC = {4: 0, 5: 1}.get(CELL, CELL)
R = random.Random(300 + SRC * 11)
SK = '../skfb/'
reset()
root = bpy.data.objects.new('root', None)
bpy.context.scene.collection.objects.link(root)


def cluster(uid, name):
    ob = load(SK + uid + '/scene.gltf', name=name)
    v = verts(ob)
    # stalk foot = lowest point; the cluster's head = mean of its upper half
    foot = v[v[:, 2].argmin()]
    head = v[v[:, 2] > np.percentile(v[:, 2], 50)].mean(axis=0)
    L = float(np.linalg.norm(head - foot))
    normalise(ob, foot, head, L)
    return ob


def leaves_of(ob, name):
    c = face_colours(ob)
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    lum = c.mean(axis=1)
    sat = c.max(axis=1) - c.min(axis=1)
    # petals and stamens are magenta to white; stems are brown (red over green, but little blue)
    petal = ((r > g * 1.12) & (b > g * 0.9)) | ((r > g * 1.35) & (lum > 0.22)) | ((lum > 0.5) & (sat < 0.3))
    return keep_faces(ob, ~petal, name)


OOM = 'f6fc34c6f0454eab9b6d332dec80593e'
HIR = '4b71e4fd4250439f85c1aebe01eb945f'


def place(part, p, d, s):
    c = inst(part, p, aim(d, R.uniform(0, 2 * math.pi)), s)
    c.parent = root
    return c


BASE = None
if SRC in (0, 1):
    fl = cluster(OOM if SRC == 0 else HIR, 'fl')
    lv = leaves_of(fl, 'lv')
    bare = CELL >= 4
    # a shoot across the card forking to leafy tips, each holding a truss of flowers
    p0 = Vector((-0.24, 0, -0.08))
    BASE = p0.copy()
    main = [p0]
    d = Vector((1, 0, 0.35)).normalized()
    for i in range(6):
        d = (d + Vector((R.uniform(-0.15, 0.15), 0, R.uniform(-0.1, 0.15)))).normalized()
        main.append(main[-1] + d * 0.06)
    twig(main, 0.0045, 0.0028, (0.09, 0.07, 0.05))
    tips = [main[-1]]
    for k in range(4):
        i = R.randint(2, 5)
        side = Vector((0, 0, 1 if k % 2 else -1))
        nd = ((main[i + 1] - main[i]).normalized() + side * R.uniform(0.6, 1.0) + Vector((0, R.uniform(-0.6, 0.6), 0))).normalized()
        br = [main[i], main[i] + nd * 0.05, main[i] + nd * 0.1 + Vector((0, 0, 0.02))]
        twig(br, 0.0028, 0.002, (0.09, 0.07, 0.05))
        tips.append(br[-1])
    for t in tips:
        place(lv if bare else fl, t, Vector((R.uniform(-0.3, 0.6), R.uniform(-0.5, 0.5), 1)), R.uniform(0.9, 1.1))
        extra = R.random() < 0.6
        q = (t + Vector((R.uniform(-0.03, 0.03), R.uniform(-0.03, 0.03), -0.02)), Vector((R.uniform(-1, 1), R.uniform(-1, 1), 0.6)), R.uniform(0.8, 1.0))
        if extra or bare:
            place(lv, *q)
    ext = 0.56
    render(OUT, CELL, ext, ext, 1024, 1024, cx=0.0, bottom=-ext / 2 + 0.02, ao_dist=0.02, lift=1.2, wb=(1.0, 1.0, 1.02))
else:
    flo = cluster(OOM, 'fo')
    flh = cluster(HIR, 'fh')
    lv = [leaves_of(flo, 'lo'), leaves_of(flh, 'lh')]
    # the face of a clipped mound: trusses packed on a low dome facing the viewer
    n = 30
    for i in range(n):
        a = R.uniform(0, 2 * math.pi)
        rr = 0.13 * math.sqrt(R.random())
        x, z = math.cos(a) * rr, math.sin(a) * rr
        y = -math.sqrt(max(0.0, 0.26 ** 2 - rr * rr)) + 0.1
        d = Vector((x, -0.25, z)).normalized() + Vector((0, -1, 0))
        if CELL in (2, 6):
            fl_, lv_ = (flo, lv[0]) if CELL == 2 else (flh, lv[1])
            place(fl_ if R.random() < 0.85 else lv_, Vector((x, y, z)), d, R.uniform(0.9, 1.15))
        else:
            # cell 7 is the paler, younger-leaved Hirado foliage
            pool = lv if CELL == 3 else [lv[1], lv[1], lv[0]]
            place(R.choice(pool), Vector((x, y, z)), d, R.uniform(0.95, 1.25))
            place(R.choice(pool), Vector((x * 0.8, y + 0.04, z * 0.8)), d, R.uniform(0.95, 1.2))
    ext = 0.5
    render(OUT, CELL, ext, ext, 1024, 1024, cx=0.0, bottom=-ext / 2 - 0.02, ao_dist=0.02, lift=1.2, wb=(1.0, 1.0, 1.02))
if BASE is not None:
    print('BASE', CELL, round((BASE.x + 0.28) / 0.56, 4), round((BASE.z - (-0.28 + 0.02)) / 0.56, 4))
