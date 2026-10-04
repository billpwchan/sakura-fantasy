# Janome wagasa: oiled washi over 48 split-bamboo ribs, stretchers from a runner, kagari-ito at the head and the
# runner, rattan-wrapped grip. Shaft along +Z, the bottom of the grip at the origin (three.js: +Y).
# Blender -b --python wagasa.py -- out.glb [figure.blend]
import sys, os, math, bpy, bmesh
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from garment import link, join, grid_mesh, mod_apply

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

N = 48                 # ribs
R = 0.56               # rim radius
DROP = 0.25            # head to rim
HEAD_Z = 1.04          # top of the ribs at the head
RIB_W, RIB_T = 0.0042, 0.0026
F_JOINT = 0.42         # where the stretchers meet the ribs
STR_LEN = 0.30
SHAFT_R = 0.0085
GRIP = (0.012, 0.25)
GRIP_AT = 0.12         # where her hand holds it
TAU = 2 * math.pi


def surf(th, f):
    r = R * f
    return Vector((r * math.cos(th), r * math.sin(th), HEAD_Z - DROP * f ** 1.4))


def normal(th, f):
    # outward-up normal of the canopy (paper top)
    dzdr = -DROP * 1.4 * max(f, 1e-4) ** 0.4 / R
    return Vector((-dzdr * math.cos(th), -dzdr * math.sin(th), 1)).normalized()


def vcol(o, idv):
    me = o.data
    a = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for d in a.data:
        d.color = (idv, 0, 0, 1)
    return o


# ---- the canopy: each panel a shallow V between two ribs (the fold it closes on), taut toward the ribs; the rim
# turns under a few millimetres where the edge paper is folded round
NP, NF = 6, 40
F0 = 0.03


def canopy_p(i, j):
    k, t = divmod(i, NP)
    t /= NP
    f = F0 + (1 - F0) * (j / NF) ** 0.85
    th0, th1 = k / N * TAU, (k + 1) / N * TAU
    a, b = surf(th0, f), surf(th1, f)
    p = a.lerp(b, t)
    thm = (th0 + th1) / 2
    chord = (b - a).length
    sag = chord * (0.05 * (1 - abs(2 * t - 1)) + 0.025 * 4 * t * (1 - t)) * min(1, f / 0.25)
    p -= normal(thm, f) * sag
    if j == NF:
        p -= normal(thm, f) * 0.0025
        p -= Vector((math.cos(thm), math.sin(thm), 0)) * 0.001
    return p


canopy = grid_mesh('canopy', canopy_p, N * NP, NF, wrap_u=True,
                   uv=lambda i, j: (i / (N * NP), F0 + (1 - F0) * (min(j, NF) / NF) ** 0.85))
vcol(canopy, 0.1)

# the head papers: a stack of round paper caps over the top, the uppermost tied with a cord
HC = []
for k, (r0, h) in enumerate(((0.075, 0.003), (0.052, 0.006), (0.034, 0.010))):
    def cap_p(i, j, r0=r0, h=h):
        th = i / 64 * TAU
        f = (j / 10) * r0 / R
        p = surf(th, f)
        return p + Vector((0, 0, h * (1 - (j / 10) ** 3) + 0.0012))
    c = grid_mesh('cap%d' % k, cap_p, 64, 10, wrap_u=True, uv=lambda i, j: (i / 64, j / 10 * 0.2))
    HC.append(c)
caps = join(HC, 'caps')
cz = surf(0, 0.034 / R).z + 0.0105
bpy.ops.mesh.primitive_torus_add(major_radius=0.034, minor_radius=0.0013, major_segments=64, minor_segments=6,
                                 location=(0, 0, cz))
cord_o = bpy.context.object
vcol(caps, 0.15)


# ---- a swept rectangle along a path (ribs and stretchers)
def sweep(name, pts, ups, w, t, uv_len=1.0):
    n = len(pts)
    def P(i, j):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]
        tg = (b - a).normalized()
        up = (ups[i] - tg * ups[i].dot(tg)).normalized()
        sd = tg.cross(up).normalized()
        ww = w(i / (n - 1)) / 2; tt = t(i / (n - 1)) / 2
        # rounded rectangle: 8 points
        c = [(1, 1), (0, 1.2), (-1, 1), (-1, -1), (0, -1.2), (1, -1)][j % 6]
        return pts[i] + sd * ww * c[0] + up * tt * c[1]
    o = grid_mesh(name, P, n - 1, 6, wrap_v=True, uv=lambda i, j: (i / (n - 1) * uv_len, j / 6))
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.to_mesh(o.data); bm.free()
    return o


ribs, strs, joints = [], [], []
for k in range(N):
    th = k / N * TAU
    fs = [0.02 + (1.006 - 0.02) * (s / 24) ** 0.9 for s in range(25)]
    pts = [surf(th, f) - normal(th, f) * (RIB_T / 2 + 0.0002) for f in fs]
    pts[0] = Vector((0.018 * math.cos(th), 0.018 * math.sin(th), HEAD_Z - 0.006))
    ups = [normal(th, f) for f in fs]
    ribs.append(sweep('rib', pts, ups, lambda u: RIB_W * (1.25 - 0.35 * u), lambda u: RIB_T * (1.3 - 0.45 * u), 0.6))
    # the tip, lacquered, just proud of the paper edge
    tip = surf(th, 1.006) - normal(th, 1.0) * (RIB_T / 2)
    joints.append((th, tip))

# the runner sits where the stretchers, at full length, reach the joints
jp0 = surf(0, F_JOINT) - normal(0, F_JOINT) * (RIB_T + 0.002)
RUN_R = 0.017
dz = math.sqrt(STR_LEN ** 2 - (jp0.x - RUN_R) ** 2)
RUN_Z = jp0.z - dz
print('RUNNER_Z', round(RUN_Z, 3))
for k in range(N):
    th = k / N * TAU
    jp = surf(th, F_JOINT) - normal(th, F_JOINT) * (RIB_T + 0.002)
    a = Vector((RUN_R * math.cos(th), RUN_R * math.sin(th), RUN_Z + 0.02))
    pts = [a.lerp(jp, s / 6) for s in range(7)]
    tg = (jp - a).normalized()
    side = Vector((-math.sin(th), math.cos(th), 0))
    ups = [side.cross(tg).normalized() * -1 for _ in pts]
    strs.append(sweep('str', pts, ups, lambda u: 0.0034, lambda u: 0.0024, 0.3))
    # the joint: a small block where the stretcher is pinned under the rib
    jb = []
    for s in range(3):
        jb.append(jp + tg * (s - 1) * 0.006 + normal(th, F_JOINT) * 0.001)
    strs.append(sweep('jnt', jb, [normal(th, F_JOINT)] * 3, lambda u: 0.006, lambda u: 0.0042))

ribs_o = vcol(join(ribs, 'ribs'), 0.3)
strs_o = vcol(join(strs, 'stretchers'), 0.35)
tips = []
for th, p in joints:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=0.0028, location=p)
    tips.append(bpy.context.object)
tips_o = vcol(join(tips, 'tips'), 0.4)


# ---- kagari-ito: a band of coloured thread worked round the ribs under the head, and a second round the
# stretchers above the runner. The band wraps each rib; between ribs it hangs a hair below the paper.
def kagari_head_p(i, j, nk=8, ns=10):
    k, t = divmod(i, nk); t /= nk
    f = 0.07 + 0.13 * j / ns
    th = (k + t) / N * TAU
    onrib = max(0.0, 1 - min(t, 1 - t) * nk / 1.5)
    p = surf(th, f) - normal(th, f) * (0.0016 + RIB_T * (0.45 + 0.75 * onrib))
    return p


kh = grid_mesh('kagari_h', kagari_head_p, N * 8, 10, wrap_u=True, uv=lambda i, j: (i / (N * 8), j / 10))
vcol(kh, 0.75)


def kagari_run_p(i, j, nk=6, ns=8):
    k, t = divmod(i, nk); t /= nk
    s = 0.07 + 0.22 * j / ns
    th = (k + t) / N * TAU
    jp = surf(th, F_JOINT) - normal(th, F_JOINT) * (RIB_T + 0.002)
    a = Vector((RUN_R * math.cos(th), RUN_R * math.sin(th), RUN_Z + 0.02))
    p = a.lerp(jp, s)
    onrib = max(0.0, 1 - min(t, 1 - t) * nk / 1.5)
    return p - Vector((0, 0, 0.0016 + 0.0012 * onrib))


kr = grid_mesh('kagari_r', kagari_run_p, N * 6, 8, wrap_u=True, uv=lambda i, j: (i / (N * 6), 1 + j / 8))
vcol(kr, 0.85)


# ---- turned wood: the head (atama-rokuro), the runner (te-moto-rokuro) and the end cap; bamboo shaft; rattan grip
def lathe(name, prof, n=32, uvz=1.0):
    def P(i, j):
        th = i / n * TAU
        r, z = prof[j]
        return Vector((r * math.cos(th), r * math.sin(th), z))
    return grid_mesh(name, P, n, len(prof) - 1, wrap_u=True, uv=lambda i, j: (i / n, prof[min(j, len(prof) - 1)][1] * uvz))


head = lathe('head', [(0.0, HEAD_Z - 0.03), (0.012, HEAD_Z - 0.03), (0.017, HEAD_Z - 0.022), (0.021, HEAD_Z - 0.01),
                      (0.021, HEAD_Z + 0.002), (0.016, HEAD_Z + 0.006), (0.0, HEAD_Z + 0.007)])
runner = lathe('runner', [(SHAFT_R + 0.0005, RUN_Z - 0.03), (0.014, RUN_Z - 0.028), (0.017, RUN_Z - 0.015),
                          (0.0185, RUN_Z + 0.01), (0.018, RUN_Z + 0.03), (0.014, RUN_Z + 0.036),
                          (SHAFT_R + 0.0005, RUN_Z + 0.038)])
endcap = lathe('endcap', [(0.0, 0.0), (0.0095, 0.0), (0.0118, 0.003), (0.0122, GRIP[0]), (0.011, GRIP[0] + 0.002),
                          (SHAFT_R, GRIP[0] + 0.003)])
wood = vcol(join([head, runner, endcap], 'turned'), 0.45)
# the bamboo, with a node every 22 cm
prof = []
z = GRIP[1] - 0.004
while z < HEAD_Z - 0.03:
    zn = (z - 0.12) % 0.22
    bump = 0.0009 * math.exp(-(min(zn, 0.22 - zn) / 0.004) ** 2)
    prof.append((SHAFT_R + bump, z))
    z += 0.004
shaft = vcol(lathe('shaft', prof, 16, 1.0), 0.55)
grip = vcol(lathe('grip', [(SHAFT_R, GRIP[0]), (0.0104, GRIP[0] + 0.002)] +
                  [(0.0106, GRIP[0] + (GRIP[1] - GRIP[0]) * s / 40) for s in range(1, 40)] +
                  [(0.0104, GRIP[1] - 0.002), (SHAFT_R, GRIP[1])], 24, 1.0), 0.65)
# a loop of cord through the end cap (to hang it by)
bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.0016, major_segments=24, minor_segments=6,
                                 location=(0, 0, -0.009), rotation=(math.pi / 2, 0, 0))
loop_o = vcol(bpy.context.object, 0.9)

for o in bpy.data.objects:
    for p in o.data.polygons:
        p.use_smooth = True


def mat(name, culling=True):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_backface_culling = culling
    return m


Mp, Mw, Mt = mat('wagasa_paper', False), mat('wagasa_wood'), mat('wagasa_thread', False)
for o, m in ((canopy, Mp), (caps, Mp), (ribs_o, Mw), (strs_o, Mw), (tips_o, Mw), (wood, Mw), (shaft, Mw), (grip, Mw),
             (loop_o, Mt), (kh, Mt), (kr, Mt), (cord_o, Mt)):
    o.data.materials.clear(); o.data.materials.append(m)
paper = join([canopy, caps], 'wagasa_paper')
frame = join([ribs_o, strs_o, tips_o, wood, shaft, grip], 'wagasa_frame')
vcol(cord_o, 0.95)
thread = join([kh, kr, loop_o, cord_o], 'wagasa_thread')
tot = 0
for o in (paper, frame, thread):
    t = sum(len(p.vertices) - 2 for p in o.data.polygons)
    tot += t
    print('TRIS', o.name, t)
print('TOTAL', tot)

# clearance against the figure: the umbrella in her left hand, the grip 15 cm above its end
if len(argv) > 1:
    with bpy.data.libraries.load(argv[1]) as (src, dst):
        dst.objects = [n for n in src.objects if n in ('pas', 'pas_hair', 'pas_kanzashi', 'pas_kimono')]
    figs = [link(o) for o in dst.objects]
    HAND = Vector((0.14, -0.24, 0.42))
    D = Vector((0.04, 0.374, 0.927)).normalized()
    M = Matrix.Translation(HAND - D * GRIP_AT) @ D.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    dg = bpy.context.evaluated_depsgraph_get()
    for fo in figs:
        me = fo.evaluated_get(dg).to_mesh()
        pts = [fo.matrix_world @ v.co for v in me.vertices]
        tree = BVHTree.FromPolygons(pts, [tuple(p.vertices) for p in me.polygons])
        for uo in (paper, frame):
            best = (9, None, None)
            for v in uo.data.vertices:
                q = M @ v.co
                hit = tree.find_nearest(q)
                if hit[0] is not None and hit[3] < best[0]:
                    best = (hit[3], v.co.copy(), q)
            print('CLEAR', fo.name, uo.name, round(best[0], 4), 'local', best[1] and tuple(round(x, 3) for x in best[1]),
                  'world', best[2] and tuple(round(x, 3) for x in best[2]))
        fo.to_mesh_clear()

bpy.ops.object.select_all(action='DESELECT')
for o in (paper, frame, thread):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_texcoords=True,
                          export_normals=True, export_vertex_color='ACTIVE', export_apply=False)
print('EXPORTED', OUT)
