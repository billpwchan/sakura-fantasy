# The ground-flora atlas (2048 x 2048, 512 px slots): eight grass tufts from Poly Haven's CC0 grass, spring and
# autumn wildflowers from ffish.asia / floraZia's CC0 scans. Each cell is a natural group seen from a little above.
# Blender -b --python build_ground.py -- <cell> <outdir>
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlaslib import *

argv = sys.argv[sys.argv.index('--') + 1:]
CELL, OUT = int(argv[0]), argv[1]
R = random.Random(1000 + CELL * 7)
SK = '../skfb/'
TILT = math.radians(10)
reset()
root = bpy.data.objects.new('root', None)
bpy.context.scene.collection.objects.link(root)


def put(part, x, y, s=1.0, rz=None, lean=0.0):
    rz = R.uniform(0, 2 * math.pi) if rz is None else rz
    q = Quaternion((1, 0, 0), lean * R.uniform(-1, 1)) @ Quaternion((0, 1, 0), lean * R.uniform(-1, 1)) @ Quaternion((0, 0, 1), rz)
    c = inst(part, (x, y, 0), q, s)
    c.parent = root
    return c


def scatter(parts, n, rx, ry, s0, s1, lean=0.08, weights=None):
    for i in range(n):
        p = R.choices(parts, weights=weights)[0] if weights else R.choice(parts)
        put(p, R.uniform(-rx, rx), R.uniform(-ry, ry), R.uniform(s0, s1), lean=lean)


def grass():
    m1 = islands(load('../phm/grass_medium_01/grass_medium_01.gltf', name='m1', metric=False, alpha='../phm/grass_medium_01/textures/grass_medium_01_alpha_2k.png'), 0.06)
    m2 = islands(load('../phm/grass_medium_02/grass_medium_02.gltf', name='m2', metric=False, alpha='../phm/grass_medium_02/textures/grass_medium_02_alpha_2k.png'), 0.06)
    bd = islands(load('../phm/grass_bermuda_01/grass_bermuda_01.gltf', name='bd', metric=False, alpha='../phm/grass_bermuda_01/textures/grass_bermuda_01_alpha_2k.png'), 0.03)
    low = [p for p in m1 if verts(p)[:, 2].max() < 0.2]
    tall1 = [p for p in m1 if verts(p)[:, 2].max() >= 0.2]
    small = [p for p in bd if verts(p)[:, 2].max() > 0.06]
    return low, tall1, m2, small


# cell -> (atlas rect x, y, w, h in px with y from the top, extent in metres w, h); the game reads the same table
CELLS = [((i % 4) * 512, (i // 4) * 256, 512, 256, 0.6, 0.3) for i in range(8)] \
    + [((i % 4) * 512, 512, 512, 512, 0.6, 0.6) for i in range(4)] \
    + [((i % 4) * 512, 1024 + (i // 4) * 512, 512, 512, 0.6, 0.6) for i in range(8)]
x0, y0, PW, PH, WM, HM = CELLS[CELL]
print('RECT', CELL, x0, y0, PW, PH, WM, HM)

if CELL < 8:
    # a close lawn tuft: short clumps overlapping along the card, runners at their feet, now and then a taller blade
    low, tall1, m2, small = grass()
    scatter(low, 15, 0.17, 0.12, 0.85, 1.3)
    scatter(small, 12, 0.22, 0.12, 0.9, 1.35)
    if CELL % 3 == 1:
        scatter(tall1, 1, 0.18, 0.08, 0.6, 0.8)
elif CELL < 12:
    # taller meadow grass: a big tussock with lower grass at its feet
    low, tall1, m2, small = grass()
    big = sorted(m2, key=lambda p: verts(p)[:, 2].max())
    put(big[-1 if CELL % 2 else -2], R.uniform(-0.06, 0.06), 0, R.uniform(0.95, 1.2))
    scatter(big[:3], 3, 0.22, 0.1, 0.8, 1.1)
    scatter(tall1, 2, 0.22, 0.1, 0.8, 1.0)
    scatter(low, 9, 0.18, 0.1, 0.9, 1.25)
else:
    low, tall1, m2, small = grass()
    k = (CELL - 12) % 4 if CELL < 16 else [4, 5, 0, 2][CELL - 16]
    if k == 0:
        # tanpopo: rosettes on the ground, flowers up on their stalks, buds coming
        d = load(SK + '1cbd818a50c4404fb971fee0bcb45679/scene.gltf', name='dandelion')
        recentre(d)
        for x in ((-0.14, 0.13) if CELL < 16 else (-0.18, 0.02, 0.2)):
            put(d, x + R.uniform(-0.03, 0.03), R.uniform(-0.05, 0.05), R.uniform(0.9, 1.15), lean=0.1)
        scatter(low, 8, 0.2, 0.1, 0.8, 1.1)
    elif k == 1:
        v = load(SK + '2de6ba287e7242cfacf8bdadd5344012/scene.gltf', name='violet')
        recentre(v)
        scatter([v], 12, 0.2, 0.1, 1.0, 1.35, lean=0.12)
        scatter(small, 8, 0.22, 0.1, 0.8, 1.1)
    elif k == 2:
        # the scan holds four separate stalks: two flower heads (the longer stalks) and two leaves
        parts = []
        for k_ in ('W22-1', 'W22-2', 'W22-3', 'W22-4'):
            p_ = load(SK + '98158fb9250c4a85a55925e69a220363/scene.gltf', keep=[k_], name='cl' + k_)
            recentre(p_)
            parts.append(p_)
        parts.sort(key=lambda p: verts(p)[:, 2].max())
        leaves, flowers = parts[:2], parts[2:]
        print('CLOVER', len(flowers), len(leaves))
        # white clover: a mat of leaves held low on their stalks, the heads above them
        for i in range(34):
            put(R.choice(leaves), R.uniform(-0.2, 0.2), R.uniform(-0.1, 0.1), R.uniform(0.55, 0.75), lean=0.25)
        for i in range(8 if CELL < 16 else 12):
            put(R.choice(flowers), R.uniform(-0.18, 0.18), R.uniform(-0.08, 0.08), R.uniform(0.7, 0.9), lean=0.15)
        scatter(small, 6, 0.22, 0.1, 0.8, 1.0)
    elif k == 3:
        bu = load(SK + '2d54c54618da4b1c8c0240119299f1c6/scene.gltf', keep=['W14-1all'], name='buttercup')
        recentre(bu)
        put(bu, -0.06, 0, 1.0, lean=0.05)
        put(bu, 0.15, 0.05, 0.8, lean=0.1)
        scatter(low, 8, 0.2, 0.1, 0.8, 1.15)
    else:
        # higanbana come up in clumps: bare stems, the flower heads near level with each other
        hg = load(SK + '9a0bac3fb3b8475caf15b9697572178c/scene.gltf', name='higan')
        recentre(hg)
        v = verts(hg)
        k_ = 0.5 / v[:, 2].max()
        for i in range(4 if k == 4 else 3):
            put(hg, R.uniform(-0.15, 0.15), R.uniform(-0.08, 0.08), k_ * R.uniform(0.85, 1.05), lean=0.06)

root.rotation_euler = (TILT, 0, 0)
if CELL < 12:
    render(OUT, CELL, WM, HM, PW, PH, bottom=-0.02, ao_dist=0.03, lift=1.0, wb=(1, 1, 1), ao_k=0.35)
else:
    render(OUT, CELL, WM, HM, PW, PH, bottom=-0.02, ao_dist=0.03)
