# The momiji atlas (2048 x 2048, four 1024 px cells) from the ffish.asia / floraZia CC0 iromomiji scan: sprays of
# green leaves (0, 1) and the same sprays turned red (2, 3; cell 3 is regraded to orange when composed). Iromomiji
# holds its leaves in flat tiers, so the sprays are seen from above, the twig entering at a printed base point.
# Blender -b --python build_maple.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
SRC = CELL % 2
R = random.Random(900 + SRC * 31)
SK = '../skfb/889aca0c32e64d84b03c1630246b4d7b/scene.gltf'
EXT = 0.6
reset()
root = bpy.data.objects.new('root', None)
bpy.context.scene.collection.objects.link(root)


def unit(keep, name):
    ob = load(SK, keep=keep, name=name)
    col = face_colours(ob)
    me = ob.data
    c = np.array([sum((me.vertices[i].co for i in f.vertices), Vector()) / len(f.vertices) for f in me.polygons])
    cen = c.mean(axis=0)
    r, g, b = col[:, 0], col[:, 1], col[:, 2]
    # the twig is the brown that is neither leaf green nor leaf red
    twig_f = (np.abs(r - g) < 0.08) & (r < 0.45) & (r > b)
    pts = c[twig_f] if twig_f.sum() > 20 else c
    foot = pts[np.argmax(np.linalg.norm(pts - cen, axis=1))]
    ob.data.transform(Matrix.Translation(-Vector(foot)))
    d = cen - foot
    ang = math.atan2(d[1], d[0])
    ob.data.transform(Matrix.Rotation(-ang, 4, 'Z'))
    ob.data.update()
    print('UNIT', name, 'twig faces', int(twig_f.sum()), 'reach', round(float(np.linalg.norm(d[:2])), 3))
    return ob


u = unit(['red1'] if CELL >= 2 else ['green2'], 'u')


def put(p, ang, s):
    q = Quaternion((0, 0, 1), ang) @ Quaternion((1, 0, 0), R.uniform(-0.25, 0.25)) @ Quaternion((0, 1, 0), R.uniform(-0.2, 0.2))
    # the red scan's leaves sit on longer stalks: a little smaller, the spray stays inside its cell
    c = inst(u, p, q, s * (0.82 if CELL >= 2 else 1.0))
    c.parent = root
    return c


# the spray, built lying flat (leaves up, +z): a twig along +x forking in opposite pairs, a leafy shoot at each fork
p0 = Vector((-EXT / 2 + 0.03, 0, 0))
main = [p0]
d = Vector((1, 0, 0))
for i in range(5):
    d = (d + Vector((0, R.uniform(-0.15, 0.15), 0))).normalized()
    main.append(main[-1] + d * 0.075)
tw = twig(main, 0.0035, 0.002, (0.16, 0.08, 0.06))
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
