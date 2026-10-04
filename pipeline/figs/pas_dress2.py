# second pass over the draped furisode: collar layers, obi and its knot, hair, tabi, zabuton; then bake and export
# run: Blender -b dress_drape.blend --python pas_dress2.py -- out.glb
import bpy, bmesh, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from garment import *
from mathutils.bvhtree import BVHTree
from mathutils import Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
rig = bpy.data.objects['pas_rig']
body = bpy.data.objects['pas']
shell = bpy.data.objects['kimono']
for n in ('posed', 'floor'):
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n])
for o in bpy.data.objects:
    for m in list(getattr(o, 'modifiers', [])):
        if m.type == 'COLLISION':
            o.modifiers.remove(m)
sleeves = [bpy.data.objects['sleeve_l_d'], bpy.data.objects['sleeve_r_d']]
zab = bpy.data.objects['zabuton']


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def posed_static(name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
    me.transform(body.matrix_world)
    return link(bpy.data.objects.new(name, me))


skin = posed_static('skin_static')


def bvh(o):
    assert o.matrix_world == Matrix(), o.name
    return BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())


def catmull(points, step):
    """resample a polyline through points as a centripetal-ish Catmull-Rom curve at roughly step spacing"""
    P = [points[0] + (points[0] - points[1])] + list(points) + [points[-1] + (points[-1] - points[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int((p2 - p1).length / step))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(points[-1].copy())
    return out


def on_surface(tree, p, off):
    loc, n, _, _ = tree.find_nearest(p)
    return loc + n * off, n


# ---- collar: the opening is a loop round the neck, low at the back (emon-nuki), crossing left over right at the
# throat; the left (upper) panel's collar runs on down to the obi
OBI_TOP, OBI_BOT = 0.565, 0.405
X_CROSS = 0.68


def collar_path(s, cross=X_CROSS, back=0.735, lift=0.0, tail=True):
    pts = [Vector((0, 0.075, back + lift)), Vector((s * 0.045, 0.065, back + 0.012 + lift)), Vector((s * 0.068, 0.035, 0.762 + lift)),
           Vector((s * 0.074, -0.008, 0.775 + lift)), Vector((s * 0.06, -0.05, 0.758 + lift * 0.5)), Vector((s * 0.03, -0.08, (0.72 + cross) / 2 + 0.01)),
           Vector((0, -0.1, cross))]
    if tail:
        pts += [Vector((-s * 0.04, -0.13, cross - 0.06)), Vector((-s * 0.078, -0.145, OBI_TOP + 0.012))]
    return pts


def z_front(ax):
    return X_CROSS + ax / 0.074 * (0.775 - X_CROSS)


def z_back(ax):
    return 0.735 + (ax / 0.074) ** 2 * (0.775 - 0.735)


def inside_opening(p):
    ax = abs(p.x)
    if ax > 0.074 or p.z < X_CROSS - 0.005:
        return False
    return p.z > (z_front(ax) if p.y < -0.02 else z_back(ax))


# pull the kimono in to hug the body round the collar, then cut the opening
sk = bvh(skin)
guide = catmull(collar_path(1, tail=False), 0.01) + catmull(collar_path(-1, tail=False), 0.01)
for v in shell.data.vertices:
    p = shell.matrix_world @ v.co
    if p.z < X_CROSS - 0.02:
        continue
    d = min((p - g).length for g in guide)
    w = (1 - smoothstep(0.02, 0.06, d)) * smoothstep(X_CROSS - 0.02, X_CROSS + 0.03, p.z)
    if w <= 0:
        continue
    loc, n, _, _ = sk.find_nearest(p)
    tgt = loc + n * 0.006
    if (p - loc).dot(n) > 0.006:
        v.co = shell.matrix_world.inverted() @ p.lerp(tgt, w)
smooth(shell, 0.3, 2)
# the hull leaves a ridge over each collarbone; relax the shoulder line round the neck
g = shell.vertex_groups.new(name='neckline')
for v in shell.data.vertices:
    p = shell.matrix_world @ v.co
    w = smoothstep(0.66, 0.72, p.z) * (1 - smoothstep(0.13, 0.17, abs(p.x)))
    if w > 0:
        g.add([v.index], w, 'REPLACE')
mod_apply(shell, 'SMOOTH', factor=0.8, iterations=25, vertex_group='neckline')
full = link(bpy.data.objects.new('shell_full', shell.data.copy()))
full.matrix_world = shell.matrix_world.copy()
sf = bvh(full)
delete_where(shell, inside_opening)
smooth(shell, 0.3, 2)
sb = bvh(shell)


def ribbon(name, path, width, tree, off, s, ncross=8, steps=4):
    offf = off if callable(off) else (lambda p, _o=off: _o)
    """a band whose inner edge follows path, laid across the surface by walking away from the edge in small steps"""
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(path):
        a = path[max(i - 1, 0)]; b = path[min(i + 1, len(path) - 1)]
        t = (b - a).normalized()
        q, n = on_surface(tree, p, 0.0)
        off = offf(p)
        row = [bm.verts.new(q + n * off)]
        h = width / (ncross * steps)
        for k in range(ncross * steps):
            side = (n.cross(t) * s)
            side = (side - n * side.dot(n)).normalized()
            q, n = on_surface(tree, q + side * h, 0.0)
            if (k + 1) % steps == 0:
                row.append(bm.verts.new(q + n * off))
        rows.append(row)
    for i in range(len(rows) - 1):
        for k in range(ncross):
            f = (rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1])
            bm.faces.new(f if s > 0 else f[::-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.0005)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    for p in me.polygons:
        p.use_smooth = True
    return o


def thicken(o, t, offset=1.0, sub=1):
    mod_apply(o, 'SOLIDIFY', thickness=t, offset=offset, use_rim=True, use_even_offset=False)
    if sub:
        mod_apply(o, 'SUBSURF', levels=sub, render_levels=sub)


def loop(cross, lift, tail):
    """one continuous edge: the right panel's edge up from under the left panel, round the back of the neck, and down
    the left panel's edge across to the obi"""
    r = collar_path(-1, cross=cross, lift=lift)
    l = collar_path(1, cross=cross, lift=lift)
    def cut(pts):
        # keep the tail only down to `tail` metres below the crossing
        out = []
        for p in pts:
            if p.z < cross - tail:
                break
            out.append(p)
        return out
    return catmull(cut(r)[::-1] + cut(l)[1:], 0.006)


def layered(cross, base, top, hidden=-0.004):
    X = Vector((0, -0.1, cross))
    def f(p):
        d = (p - X).length
        if p.z < cross:
            if p.x > 0:
                return base + (hidden - base) * smoothstep(0.0, 0.025, d)
            return top
        if p.x > 0:
            return base + (top - base) * (1 - smoothstep(0.01, 0.05, d))
        return base
    return f


parts = {}
# kimono collar (tomo-eri), left over right; date-eri showing along its inner edge; han-eri on the juban beneath,
# a finger higher at the back
parts['collar'] = ribbon('collar', loop(X_CROSS, 0.0, 0.2), 0.05, sf, layered(X_CROSS, 0.003, 0.0065), 1)
parts['date'] = ribbon('date', loop(X_CROSS + 0.008, 0.004, 0.2), 0.03, sf, layered(X_CROSS + 0.008, 0.0015, 0.0045), 1, 5)
parts['haneri'] = ribbon('haneri', loop(X_CROSS + 0.03, 0.016, 0.05), 0.04, sf, layered(X_CROSS + 0.03, -0.0005, 0.001, -0.006), 1)
for k, o in parts.items():
    thicken(o, 0.004 if k.startswith('collar') else 0.002)


# ---- obi: a stiff band (the obi-ita flattens the front), fukura-suzume at the back, obiage and obijime
C = Vector((0, -0.02, 0))
NA = 120
OBI_H = OBI_TOP - OBI_BOT


def ring_radius(tree, z):
    out = []
    for i in range(NA):
        a = i / NA * 2 * math.pi
        d = Vector((math.sin(a), -math.cos(a), 0))   # a = 0 is the front (-y), increasing toward her left (+x)
        o = Vector((C.x, C.y, z)) + d * 0.5
        hit = tree.ray_cast(o, -d)
        out.append((Vector((C.x, C.y, z)) + d * 0.5 - hit[0]).length if hit[0] else 0.0)
    return [0.5 - r for r in out]


sb = bvh(shell)
R = [max(rs) for rs in zip(*[ring_radius(sb, OBI_BOT + OBI_H * k / 6) for k in range(7)])]
# the obi-ita: a flat front across the middle third
fy = min(C.y - R[i] * math.cos(i / NA * 2 * math.pi) for i in range(NA) if abs(math.sin(i / NA * 2 * math.pi)) < 0.5)
OBI_T = 0.016


def obi_xy(i, extra=0.0):
    a = i / NA * 2 * math.pi
    d = Vector((math.sin(a), -math.cos(a), 0))
    r = R[i % NA] + OBI_T + extra
    p = Vector((C.x, C.y, 0)) + d * r
    if p.y < fy - OBI_T - extra:
        p = Vector((C.x, C.y, 0)) + d * ((fy - OBI_T - extra - C.y) / d.y)
    return p


# profile across the band: rolled top and bottom edges (the obi is folded in half lengthwise, the fold at the bottom)
prof = []
for k in range(25):
    t = k / 24
    z = OBI_BOT + t * OBI_H
    e = min(t, 1 - t) * OBI_H
    inset = 0.006 * (1 - min(1, e / 0.006)) ** 2
    prof.append((z, -inset))
prof = [(OBI_BOT + 0.002, -0.012)] + prof + [(OBI_TOP - 0.002, -0.012)]
LEN = sum((obi_xy(i + 1) - obi_xy(i)).length for i in range(NA))


def obi_p(i, j):
    z, ins = prof[j]
    p = obi_xy(i, ins)
    return Vector((p.x, p.y, z))


acc = [0.0]
for i in range(NA):
    acc.append(acc[-1] + (obi_xy(i + 1) - obi_xy(i)).length)
parts['obi'] = grid_mesh('obi', obi_p, NA, len(prof) - 1, wrap_u=True,
                         uv=lambda i, j: (acc[i] / OBI_H, (prof[min(j, len(prof) - 1)][0] - OBI_BOT) / OBI_H))
print('OBI', round(fy, 3), round(LEN, 3), 'back r', round(R[NA // 2], 3))

# obijime: a round braided cord round the middle of the obi, a flat knot in front
ZJ = OBI_BOT + OBI_H * 0.47
cord = [obi_xy(i, 0.004) + Vector((0, 0, ZJ)) for i in range(NA)]


def tube(name, path, r, nr=10, closed=False, uvs=1.0):
    n = len(path)
    frames = []
    for i in range(n):
        a = path[(i - 1) % n] if closed or i > 0 else path[0]
        b = path[(i + 1) % n] if closed or i < n - 1 else path[-1]
        t = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        nx = t.cross(up).normalized(); ny = nx.cross(t).normalized()
        frames.append((nx, ny))
    def P(i, j):
        nx, ny = frames[i % n]
        a = j / nr * 2 * math.pi
        rr = r(i) if callable(r) else r
        return path[i % n] + nx * math.cos(a) * rr + ny * math.sin(a) * rr
    return grid_mesh(name, P, n if closed else n - 1, nr, wrap_v=True, wrap_u=closed, uv=lambda i, j: (i * uvs, j / nr))


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def rounded_box(name, c, size, e=0.35, n=32, bulge=0.0, ripple=None):
    def P(i, j):
        th = i / n * math.pi
        ph = j / n * 2 * math.pi
        x = spow(math.sin(th) * math.cos(ph), e) * size[0] / 2
        y = spow(math.sin(th) * math.sin(ph), e) * size[1] / 2
        z = spow(math.cos(th), e) * size[2] / 2
        y *= 1 + bulge * (1 - (2 * x / size[0]) ** 2) * (1 - (2 * z / size[2]) ** 2)
        if ripple:
            y += ripple(x, z) * (1 if y > 0 else -1)
        return c + Vector((x, y, z))
    return grid_mesh(name, P, n, n, wrap_v=True, uv=lambda i, j: (j / n * (size[0] + size[1]) * 2 / OBI_H, 1 - i / n * size[2] / OBI_H))


parts['obijime'] = tube('obijime', cord, 0.0045, 10, closed=True)
# the knot: a short twisted bar across the front, the ends tucked into the cord either side
kn = obi_xy(0, 0.009) + Vector((0, 0, ZJ))
knot = [kn + Vector((x, 0, 0.004 * math.sin(x * 60))) for x in [k * 0.006 - 0.027 for k in range(10)]]
parts['obijime_knot'] = rounded_box('obijime_knot', kn + Vector((0, -0.004, 0)), (0.03, 0.016, 0.02), 0.6, 20, 0.0,
                                     lambda x, z: 0.0015 * math.sin((x + z) / 0.03 * math.pi * 4))

# obiage: gathered silk showing a finger's width above the obi in front, sinking behind it toward the sides,
# tucked in at the centre
OA = []
for i in range(-28, 29):
    p = obi_xy(i % NA, -0.009)
    w = 1 - smoothstep(12, 28, abs(i))
    OA.append(Vector((p.x, p.y, OBI_TOP - 0.004 + 0.009 * w)))
def oa_r(i):
    k = i - 28
    w = 1 - smoothstep(10, 28, abs(k))
    tuck = 1 - 0.35 * math.exp(-(k / 2.5) ** 2)
    return (0.003 + 0.0085 * w) * tuck * (1 + 0.06 * math.sin(k * 0.9) + 0.04 * math.sin(k * 2.3 + 1))
parts['obiage'] = tube('obiage', OA, oa_r, 14)


# ---- fukura-suzume: two pleated wings fanning out from a gathered centre, a puffed drum (tare) below
BACK_Y = C.y + R[NA // 2] + OBI_T
KC = Vector((0, BACK_Y + 0.028, OBI_TOP - 0.012))


def wing(sx, L=0.235, n_s=40, n_phi=56, Ht=0.125, off=Vector((0, 0, 0)), name='wing'):
    def P(i, j):
        t = i / n_s
        ph = j / n_phi * 2 * math.pi
        H = 0.055 + Ht * smoothstep(0.0, 0.75, t)
        D = 0.014 + 0.032 * math.sin(math.pi / 2 * min(1.0, t / 0.55))
        if t > 0.82:
            D *= math.sqrt(max(0.0, 1 - ((t - 0.82) / 0.18) ** 2))
        cy, cz = math.sin(ph), math.cos(ph)
        y = D / 2 * spow(cy, 0.35)
        zn = spow(cz, 0.7)
        z = H / 2 * zn
        # accordion pleats, deep at the gathered root, opening out toward the fold at the tip
        a = 0.008 * (1 - smoothstep(0.05, 0.9, t)) + 0.0025
        y += math.copysign(1, cy) * a * math.sin(zn * math.pi * 3.0 + 0.4) * abs(cy) ** 0.5
        x = t * L + 0.006 * math.cos(ph) ** 2 * t
        # the wing lifts toward its tip, sweeps back a little and curls its far edge down
        z += x * 0.32 - 0.25 * x * x
        y += x * 0.12 + 0.02 * smoothstep(0.6, 1.0, t)
        return KC + off + Vector((sx * (x + 0.03), y, z))
    o = grid_mesh(name + ('_l' if sx > 0 else '_r'), P, n_s, n_phi, wrap_v=True,
                  uv=lambda i, j: (i / n_s * L / OBI_H, 0.5 + 0.5 * math.cos(j / n_phi * 2 * math.pi)))
    if sx < 0:
        for f in o.data.polygons:
            f.flip()
    return o


parts['wing_l'] = wing(1)
parts['wing_r'] = wing(-1)
# a second, shorter fold under each wing: the layered fan of the sparrow
parts['wing2_l'] = wing(1, 0.2, Ht=0.09, off=Vector((0, -0.016, -0.055)), name='wing2')
parts['wing2_r'] = wing(-1, 0.2, Ht=0.09, off=Vector((0, -0.016, -0.055)), name='wing2')
parts['knot'] = rounded_box('knot', KC + Vector((0, 0.012, -0.004)), (0.075, 0.06, 0.095), 0.45, 28, 0.12,
                            lambda x, z: 0.003 * math.sin(x / 0.075 * math.pi * 7) * (1 - abs(2 * z / 0.095)))
def tare_p(i, j, n=40):
    th = i / n * math.pi
    ph = j / n * 2 * math.pi
    zn = math.cos(th)
    w = 0.13 + 0.035 * (1 - zn) / 2           # wider toward the bottom
    x = spow(math.sin(th) * math.cos(ph), 0.4) * w
    y = spow(math.sin(th) * math.sin(ph), 0.5) * (0.022 + 0.018 * (1 - zn) / 2)
    z = spow(zn, 0.55) * 0.085
    y *= 1 + 0.4 * (1 - (x / w) ** 2)
    return Vector((0, BACK_Y + 0.03, OBI_BOT + 0.07)) + Vector((x, y, z))
parts['tare'] = grid_mesh('tare', tare_p, 40, 40, wrap_v=True, uv=lambda i, j: (j / 40 * 0.7 / OBI_H, 1 - i / 40 * 0.17 / OBI_H))


# ---- nihongami (yuiwata): the hair combed up from a clean hairline into a front puff (maegami), side wings (bin)
# and a nape puff (tabo), all gathered into a shimada-style mage on the crown tied with red kanoko cloth
hb = pbone_world(rig, 'head')
HU = (hb.to_3x3() @ Vector((0, 1, 0))).normalized()          # up along the head bone
HX = Vector((1, 0, 0))
HF = HU.cross(HX).normalized()                                 # forward (-y side)
if HF.y > 0:
    HF = -HF
HX = HF.cross(HU).normalized()
if HX.x < 0:
    HX = -HX
HC = Vector((0, -0.062, 0.93))


def hp(f, u, x=0.0):
    return HC + HF * f + HU * u + HX * x


head_only = link(bpy.data.objects.new('head_only', skin.data.copy()))
delete_where(head_only, lambda p: not (p.z > 0.8 and abs(p.x) < 0.1 and -0.18 < p.y < 0.06))
ht = bvh(head_only)


def dir_ang(d):
    """azimuth (0 = front, + toward her left) and elevation of a direction in the head frame, degrees"""
    f, u, x = d.dot(HF), d.dot(HU), d.dot(HX)
    return math.degrees(math.atan2(x, f)), math.degrees(math.atan2(u, math.hypot(f, x)))


HAIRLINE = [(0, 15.5), (20, 13), (32, 8), (42, 0), (52, -12), (62, -22), (72, -30), (79, -27), (85, -21), (98, -21), (106, -33), (115, -38), (130, -44), (148, -50), (163, -55), (172, -52), (180, -54)]


def e_hair(az):
    a = abs(az)
    for (a0, e0), (a1, e1) in zip(HAIRLINE, HAIRLINE[1:]):
        if a <= a1:
            t = (a - a0) / (a1 - a0)
            t = t * t * (3 - 2 * t)
            return e0 + (e1 - e0) * t
    return HAIRLINE[-1][1]


def skull_r(d):
    o = HC + d * 0.3
    hit = ht.ray_cast(o, -d)
    return (hit[0] - HC).length if hit[0] else 0.06


# the skull as a closed star-shaped solid, 4 mm proud of the scalp
NS = 64
def skull_p(i, j):
    th = i / NS * math.pi
    ph = j / NS * 2 * math.pi
    d = (HU * math.cos(th) + (HF * math.cos(ph) + HX * math.sin(ph)) * math.sin(th)).normalized()
    return HC + d * (skull_r(d) + 0.004)
cap = grid_mesh('hair_cap', skull_p, NS, NS, wrap_v=True)


def ellipsoid(name, c, ax, n=28):
    """ax: list of (axis vector, radius)"""
    def P(i, j):
        th = i / n * math.pi
        ph = j / n * 2 * math.pi
        a, b, cc = ax
        return c + a[0] * a[1] * math.sin(th) * math.cos(ph) + b[0] * b[1] * math.sin(th) * math.sin(ph) + cc[0] * cc[1] * math.cos(th)
    return grid_mesh(name, P, n, n, wrap_v=True)


def tilt(v, axis, deg):
    return (Quaternion(axis, math.radians(deg)) @ v).normalized()


front_r = skull_r(HF)
puffs = [
    ellipsoid('maegami', hp(front_r - 0.03, 0.048), [(HX, 0.05), (tilt(HF, HX, 35), 0.03), (tilt(HU, HX, 35), 0.026)]),
]
for sx in (1, -1):
    side_r = skull_r(HX * sx)
    puffs.append(ellipsoid('bin', hp(-0.02, 0.0, sx * (side_r - 0.016)), [(HX, 0.026), (tilt(HF, HX, -15), 0.06), (tilt(HU, HX, -15), 0.036)]))
back_r = skull_r(-HF)
puffs.append(ellipsoid('tabo', hp(-(back_r - 0.014), -0.056), [(HX, 0.052), (tilt(HF, HX, 30), 0.032), (tilt(HU, HX, 30), 0.03)]))
hair = join([cap] + puffs, 'hair')
voxel(hair, 0.0025)
smooth(hair, 0.7, 30)
push_out(hair, head_only, 0.0035)


def below_hairline(p):
    az, el = dir_ang((p - HC).normalized())
    return el < e_hair(az)


delete_where(hair, below_hairline)
# snap the hairline onto the smooth curve e_hair(az), on the scalp; relax the ring next to it
def hair_dir(az, el):
    a, e = math.radians(az), math.radians(el)
    return (HF * math.cos(e) * math.cos(a) + HX * math.cos(e) * math.sin(a) + HU * math.sin(e)).normalized()


def on_scalp(d, off):
    hit = ht.ray_cast(HC + d * 0.3, -d)
    return hit[0] + hit[1] * off if hit[0] else None


bm = bmesh.new(); bm.from_mesh(hair.data)
edge = [v for v in bm.verts if v.is_boundary]
for it in range(3):
    for v in edge:
        az, el = dir_ang((v.co - HC).normalized())
        p = on_scalp(hair_dir(az, e_hair(az)), 0.0006)
        if p is not None:
            v.co = p
    # even out the spacing along the loop
    new = {}
    for v in edge:
        nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
        if len(nb) == 2:
            new[v] = (v.co * 2 + nb[0].co + nb[1].co) / 4
    for v, c in new.items():
        v.co = c
for v in edge:
    az, el = dir_ang((v.co - HC).normalized())
    p = on_scalp(hair_dir(az, e_hair(az)), 0.0006)
    if p is not None:
        v.co = p
# the next two rings in from the edge slope down to it
ring = set()
for v in edge:
    for e in v.link_edges:
        o = e.other_vert(v)
        if not o.is_boundary:
            ring.add(o)
for v in ring:
    nb = [e.other_vert(v) for e in v.link_edges]
    v.co = v.co * 0.5 + sum((n.co for n in nb), Vector()) / len(nb) * 0.5
bm.to_mesh(hair.data); bm.free()
mod_apply(hair, 'SMOOTH', factor=0.4, iterations=3)
inside0 = 0
skin_t = bvh(head_only)
for v in hair.data.vertices:
    loc, n, _, _ = skin_t.find_nearest(v.co)
    if (v.co - loc).dot(n) < 0.0008:
        inside0 += 1
print('HAIR_INSIDE', inside0, len(hair.data.vertices))
push_out(hair, head_only, 0.0012)
print('HAIR', len(hair.data.vertices))
mins = {}
for v in hair.data.vertices:
    az, el = dir_ang((v.co - HC).normalized())
    k = int(round(az / 10)) * 10
    mins[k] = min(mins.get(k, 99), el)
print('HAIRMIN', sorted((k, round(e, 1), round(e_hair(k), 1)) for k, e in mins.items()))
import collections
bins = collections.Counter()
for v in hair.data.vertices:
    az, el = dir_ang((v.co - HC).normalized())
    if 100 <= abs(az) <= 125:
        bins[int(el // 4) * 4] += 1
print('BEHIND_EAR', sorted(bins.items()))
for az in (105, 115):
    for el in (-10, -18, -24, -30):
        d = (HF * math.cos(math.radians(el)) * math.cos(math.radians(az)) + HX * math.cos(math.radians(el)) * math.sin(math.radians(az)) + HU * math.sin(math.radians(el))).normalized()
        hit = ht.ray_cast(HC + d * 0.3, -d)
        print('RAY', az, el, round(skull_r(d), 3), hit[0] and [round(x, 3) for x in hit[0]])

parts['hair'] = hair

# the mage: a front and a back loop of hair folded over the crown, pinched at the middle where the kanoko cloth ties it
TOP = skull_r(HU) + 0.004
MC = hp(-0.034, TOP - 0.008)


def loop_tube(name, c, af, au, hw, ht, n=48, m=24, pinch_at=None):
    """a closed tube along an ellipse (semi-axes af along HF, au along HU) with a flat-oval section (hw across, ht
    radial); u runs along the loop (the strands)"""
    def P(i, j):
        a = i / n * 2 * math.pi
        b = j / m * 2 * math.pi
        cen = c + HF * af * math.cos(a) + HU * au * math.sin(a)
        rad = (HF * af * math.cos(a) / af ** 2 + HU * au * math.sin(a) / au ** 2).normalized()
        k = 1.0
        if pinch_at is not None:
            d = abs(((a - pinch_at + math.pi) % (2 * math.pi)) - math.pi)
            k = 1 - 0.45 * math.exp(-(d / 0.5) ** 2)
        return cen + HX * hw * k * spow(math.cos(b), 0.7) + rad * ht * k * spow(math.sin(b), 0.8)
    return grid_mesh(name, P, n, m, wrap_v=True, wrap_u=True, uv=lambda i, j: (i / n * 3.0, j / m))


mage_f = loop_tube('mage_f', MC + HF * 0.03 + HU * 0.012, 0.032, 0.014, 0.03, 0.0145, pinch_at=math.pi)
mage_b = loop_tube('mage_b', MC - HF * 0.031 + HU * 0.01, 0.034, 0.014, 0.031, 0.0145, pinch_at=0.0)
# nemoto: the root of the mage where it rises from the crown
nemoto = ellipsoid('nemoto', MC, [(HX, 0.024), (HF, 0.026), (HU, 0.016)], 20)
parts['mage_f'] = mage_f; parts['mage_b'] = mage_b; parts['nemoto'] = nemoto
def tilt_about(o, c, axis, deg):
    q = Quaternion(axis, math.radians(deg)).to_matrix()
    for v in o.data.vertices:
        v.co = c + q @ (v.co - c)
for k in ('mage_f', 'mage_b', 'nemoto'):
    tilt_about(parts[k], MC, HX, 18)
# kanoko: red tie-dyed silk tied round the middle of the mage
parts['kanoko'] = rounded_box('kanoko', MC + HU * 0.016, (0.072, 0.03, 0.036), 0.5, 24, 0.15,
                              lambda x, z: 0.0012 * math.sin(x * 900) * math.sin(z * 700))
# rotate the kanoko into the head frame: rounded_box is axis-aligned (x across, y front-back, z up)
R3 = Matrix((HX, -HF, HU)).transposed()
def reframe(o, c):
    for v in o.data.vertices:
        v.co = c + R3 @ (v.co - c)
reframe(parts['kanoko'], MC + HU * 0.016)
# kushi: a lacquered half-moon comb set upright across the head between the maegami and the mage
KU = hp(0.036, TOP - 0.012)
def kushi_p(i, j, n=32):
    a = math.pi * i / n
    t = j / 6
    r = 0.046 - 0.004 * t
    w = 0.003 * (1 - abs(2 * t - 1) ** 2) + 0.0012
    return KU + HX * (-math.cos(a) * r) + HU * (math.sin(a) * 0.032 * (1 - 0.5 * t)) + HF * ((t - 0.5) * 0.007)
parts['kushi'] = grid_mesh('kushi', kushi_p, 32, 6, uv=lambda i, j: (i / 32, j / 6))
mod_apply(parts['kushi'], 'SOLIDIFY', thickness=0.004, offset=0.0, use_rim=True)
# kogai: a long bar through the mage, ends flaring
kg = [MC + HX * (k * 0.008 - 0.084) + HU * 0.012 - HF * 0.012 for k in range(22)]
parts['kogai'] = tube('kogai', kg, lambda i: 0.0032 * (1.5 if i in (0, 21) else 1.0), 10)
tilt_about(parts['kanoko'], MC, HX, 18)
tilt_about(parts['kogai'], MC, HX, 18)

# tsumami kanzashi: folded-silk sakura on her left above the bin, with strands of small blossoms hanging below
def blossom(c, nrm, size, rot=0.0, cup=0.35):
    a0 = nrm.orthogonal().normalized()
    b0 = nrm.cross(a0).normalized()
    objs = []
    for k in range(5):
        th = rot + k / 5 * 2 * math.pi
        dirv = a0 * math.cos(th) + b0 * math.sin(th)
        side = nrm.cross(dirv).normalized()
        def P(i, j, dirv=dirv, side=side):
            t = i / 8                     # root to tip
            w = (j / 6 - 0.5) * 2         # across the petal
            half = size * 0.36 * math.sin(math.pi * min(1, t * 1.15)) ** 0.6
            notch = 0.12 * size * math.exp(-(w / 0.25) ** 2) * smoothstep(0.75, 1.0, t)
            r = size * 0.5 * t - notch
            lift = cup * size * 0.5 * t * t + 0.06 * size * w * w
            return c + dirv * r + side * (w * half) + nrm * lift
        objs.append(grid_mesh('petal', P, 8, 6, uv=lambda i, j: (i / 8, j / 6)))
    ctr = ellipsoid('stamen', c + nrm * size * 0.06, [(a0, size * 0.09), (b0, size * 0.09), (nrm, size * 0.05)], 8)
    return objs, ctr


KZ = hp(0.004, TOP - 0.022, 0.058)
kn_n = (HX * 0.75 + HU * 0.55 + HF * 0.35).normalized()
petals, centres = [], []
rng = __import__('random').Random(7)
for (df, du, dx, sz) in ((0, 0, 0, 0.03), (0.018, 0.012, -0.004, 0.022), (-0.02, 0.008, -0.002, 0.022), (0.006, -0.018, 0.002, 0.022),
                         (-0.012, -0.016, 0.004, 0.018), (0.024, -0.008, 0.0, 0.015), (-0.026, -0.006, 0.0, 0.015)):
    c = KZ + HF * df + HU * du + HX * dx
    ps, ct = blossom(c, kn_n, sz, rng.random() * 6)
    petals += ps; centres.append(ct)
# bira: four strands of small blossoms swaying below the cluster
for k in range(4):
    top = KZ + HF * (0.012 - k * 0.008) - HU * 0.02 + HX * 0.004
    chain = [top - HU * (0.012 * m) + HX * (0.0015 * m) for m in range(7)]
    parts['bira%d' % k] = tube('bira%d' % k, chain, 0.0007, 5)
    for m in range(1, 7):
        ps, ct = blossom(chain[m], (HX + HF * 0.2).normalized(), 0.009, rng.random() * 6, 0.25)
        petals += ps; centres.append(ct)
parts['tsumami'] = join(petals, 'tsumami')
parts['tsumami_c'] = join(centres, 'tsumami_c')



# ---- sleeves: lay the shoulder end onto the kimono (no ledge where the sleeve meets the body), keep them clear of
# the obi and its knot
sb_full = bvh(full)
for sl in sleeves:
    ua = sl.data.attributes['u'].data
    inv = sl.matrix_world.inverted()
    for v in sl.data.vertices:
        u = ua[v.index].value
        w = 1 - smoothstep(0.0, 0.06, u)
        if w <= 0:
            continue
        p = sl.matrix_world @ v.co
        loc, n, _, d = sb_full.find_nearest(p)
        if d > 0.05:
            continue
        v.co = inv @ p.lerp(loc + n * 0.003, w)
    push_out(sl, skin, 0.003, 0.03)
    for k in ('obi', 'knot', 'tare', 'wing_l', 'wing_r', 'wing2_l', 'wing2_r'):
        push_out(sl, parts[k], 0.003, 0.025)
    mod_apply(sl, 'SMOOTH', factor=0.3, iterations=2)

# ---- tabi: white cotton socks over the feet, the big toe in its own pocket
dom_b = dominant(body)
foot_ids = set()
sk_me = skin.data
ank = {s_: head_w(rig, 'foot_' + s_) for s_ in ('l', 'r')}
for v in sk_me.vertices:
    b = dom_b[v.index]
    if b in ('foot_l', 'ball_l', 'foot_r', 'ball_r'):
        foot_ids.add(v.index)
    elif b in ('calf_l', 'calf_r') and (v.co - ank[b[-1]]).length < 0.06:
        foot_ids.add(v.index)
tabi = link(bpy.data.objects.new('tabi', sk_me.copy()))
bm = bmesh.new(); bm.from_mesh(tabi.data)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in foot_ids], context='VERTS')
bm.to_mesh(tabi.data); bm.free()
inflate(tabi, 0.0025)
# a closed solid for the remesh: cap the opening at the ankle
bm = bmesh.new(); bm.from_mesh(tabi.data)
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
bm.to_mesh(tabi.data); bm.free()
voxel(tabi, 0.003)
smooth(tabi, 0.5, 6)
mod_apply(tabi, 'DECIMATE', ratio=0.45)
push_out(tabi, skin, 0.0015)
# the split between the big toe and the rest: a groove pressed in from the tip back to the ball of the foot
for s_, sx in (('l', 1), ('r', -1)):
    b0 = head_w(rig, 'ball_' + s_); b1 = tail_w(rig, 'ball_' + s_)
    fwd = (b1 - b0).normalized()
    side = Vector((sx, 0, 0)); side = (side - fwd * side.dot(fwd)).normalized()
    for v in tabi.data.vertices:
        q = v.co - b0
        along = q.dot(fwd)
        if along < -0.005 or along > (b1 - b0).length + 0.03:
            continue
        lat = q.dot(side) + 0.018       # the groove sits ~1.8 cm in from the inner edge
        if abs(lat) < 0.006:
            k = (1 - abs(lat) / 0.006) * smoothstep(-0.005, 0.02, along)
            v.co -= v.normal * 0.004 * k
# drop the part of the sock above the ankle that the kimono hides
delete_where(tabi, lambda p: False)
parts['tabi'] = tabi

# ---- zabuton: a plump silk cushion pressed down where she kneels, tufted at the centre, tassels at the corners
ZW, ZD, ZH = 0.55, 0.59, 0.075
ZC = Vector((0, -0.12, 0))
bodies = bvh(shell)
def zab_p(i, j, n=48, m=48):
    u = i / n * 2 - 1; v = j / m * 2 - 1
    x = ZC.x + u * ZW / 2; y = ZC.y + v * ZD / 2
    edge = max(abs(u), abs(v))
    puff = ZH * (1 - smoothstep(0.82, 1.0, edge) * 0.55) * (1 - 0.06 * (u * u + v * v))
    hit = bodies.ray_cast(Vector((x, y, -0.05)), Vector((0, 0, 1)))
    if hit[0] is not None and hit[0].z < puff + 0.02:
        puff = min(puff, max(hit[0].z - 0.002, ZH * 0.55))
    # tuft: the centre stitch pulls the top down a little
    puff -= 0.008 * math.exp(-((u / 0.08) ** 2 + (v / 0.08) ** 2))
    return Vector((x, y, puff))
top = grid_mesh('zab_top', zab_p, 48, 48, uv=lambda i, j: (i / 48 * ZW / 0.2, j / 48 * ZD / 0.2))
# sides and bottom: extrude the rim down to the floor, rounded
bm = bmesh.new(); bm.from_mesh(top.data)
rim = [e for e in bm.edges if e.is_boundary]
ext = bmesh.ops.extrude_edge_only(bm, edges=rim)
nv = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
for v in nv:
    v.co.z = 0.0
    d = Vector((v.co.x - ZC.x, v.co.y - ZC.y, 0))
    v.co += d.normalized() * 0.006 if d.length > 0 else Vector()
bm.to_mesh(top.data); bm.free()
parts['zabuton'] = top
bpy.data.objects.remove(zab)
tassels = []
for cx in (-1, 1):
    for cy in (-1, 1):
        c = Vector((ZC.x + cx * ZW / 2 * 0.99, ZC.y + cy * ZD / 2 * 0.99, ZH * 0.42))
        out = Vector((cx, cy, 0)).normalized()
        tassels.append(ellipsoid('tassel', c + out * 0.006, [(out, 0.006), (Vector((-cy, cx, 0)).normalized(), 0.005), (Vector((0, 0, 1)), 0.006)], 10))
        tassels.append(tube('tassel', [c + out * (0.01 + k * 0.006) - Vector((0, 0, k * 0.007)) for k in range(6)], lambda i: 0.0045 * (1 + i * 0.12), 8))
parts['tassels'] = join(tassels, 'tassels')
parts['tuft'] = ellipsoid('tuft', Vector((ZC.x, ZC.y, ZH - 0.006)), [(Vector((1, 1, 0)).normalized(), 0.012), (Vector((1, -1, 0)).normalized(), 0.012), (Vector((0, 0, 1)), 0.003)], 12)

if len(argv) > 1 and argv[1] == 'collar':
    km = material('kimono_chk', (0.75, 0.32, 0.38), 0.7); km.use_backface_culling = False
    wm = material('haneri_chk', (0.9, 0.88, 0.84), 0.7)
    gm = material('date_chk', (0.8, 0.6, 0.15), 0.4)
    for o in [shell] + sleeves + [parts['collar']]:
        set_mat(o, km)
    set_mat(parts['haneri'], wm)
    set_mat(parts['date'], gm)
    for k in ('obi', 'obijime_knot', 'wing_l', 'wing_r', 'wing2_l', 'wing2_r', 'knot', 'tare'):
        set_mat(parts[k], gm)
    hm = material('hair_chk', (0.02, 0.02, 0.025), 0.35); hm.use_backface_culling = False
    set_mat(hair, hm)
    parts['hair'] = hair
    for k in ('mage_f', 'mage_b', 'nemoto'):
        set_mat(parts[k], hm)
    set_mat(parts['kanoko'], material('kanoko_chk', (0.7, 0.03, 0.05), 0.8))
    set_mat(parts['kushi'], material('kushi_chk', (0.02, 0.015, 0.012), 0.2))
    set_mat(parts['kogai'], material('kogai_chk', (0.35, 0.15, 0.05), 0.3))
    pm = material('tsumami_chk', (0.95, 0.6, 0.7), 0.6); pm.use_backface_culling = False
    set_mat(parts['tsumami'], pm)
    set_mat(parts['tsumami_c'], material('stamen_chk', (0.9, 0.75, 0.2), 0.4))
    set_mat(parts['tabi'], material('tabi_chk', (0.92, 0.92, 0.9), 0.8))
    zm = material('zab_chk', (0.25, 0.06, 0.2), 0.6)
    for k in ('zabuton', 'tassels', 'tuft'):
        set_mat(parts[k], zm)
    om = material('obiage_chk', (0.85, 0.2, 0.3), 0.8)
    for k in ('obiage', 'obijime'):
        set_mat(parts[k], om)
    bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
    bpy.data.objects.remove(full)
    dg = bpy.context.evaluated_depsgraph_get()
    faces = []
    for n in ('pas_eyes', 'pas_brows', 'pas_lashes'):
        ob = bpy.data.objects[n]
        fme = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        fme.transform(ob.matrix_world)
        fo = link(bpy.data.objects.new(n + '_s', fme))
        faces.append(fo)
    for o in (head_only,):
        bpy.data.objects.remove(o)
    export(OUT, [shell, skin] + sleeves + list(parts.values()) + faces)
    sys.exit(0)

# ======== final assembly: merge by material, mark parts, skin to the rig, bake the pose as the bind pose, export
def vcolor(o, rgba):
    me = o.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    a = me.color_attributes['Col']
    for d in a.data:
        d.color = rgba
    return o


def solid_lining(o, t):
    """thicken a cloth sheet; the back shell and rims take material slot 1 (the lining)"""
    m = o.modifiers.new('sol', 'SOLIDIFY')
    m.thickness = t; m.offset = 0.0; m.use_rim = True; m.material_offset = 1; m.material_offset_rim = 1
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    return m


M = {k: mat(k) for k in ('kimono', 'kimono_lining', 'cloth', 'obi', 'hair', 'kanzashi')}
M['kimono_lining'].use_backface_culling = False
M['kanzashi'].use_backface_culling = False
for sl in sleeves:
    for p in sl.data.polygons:
        p.use_smooth = True
    sl.data.materials.clear()
    sl.data.materials.append(M['kimono']); sl.data.materials.append(M['kimono_lining'])
    sl.matrix_world = sl.matrix_world  # keep
    bpy.ops.object.select_all(action='DESELECT'); sl.select_set(True); bpy.context.view_layer.objects.active = sl
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # the cloth sim leaves no guarantee which side the normals face; the kimono must be outside, the lining in
    me = sl.data
    c = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    out = sum((p.normal.dot(p.center - c) for p in me.polygons))
    print('SLEEVE_OUT', sl.name, round(out, 3))
    if out < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(me); bm.free()
    solid_lining(sl, 0.0025)
for o in (shell, parts['collar']):
    set_mat(o, M['kimono'])
for o in sleeves + [shell, parts['collar']]:
    if len(o.data.materials) < 2:
        o.data.materials.append(M['kimono_lining'])

# part ids for the shaders, in vertex colour: r = part, g/b/a free per part
CLOTH_IDS = {'haneri': 0.05, 'date': 0.15, 'obiage': 0.25, 'obijime': 0.35, 'obijime_knot': 0.35, 'kanoko': 0.45,
             'tabi': 0.55, 'zabuton': 0.65, 'tassels': 0.75, 'tuft': 0.75}
for k, idv in CLOTH_IDS.items():
    set_mat(parts[k], M['cloth']); vcolor(parts[k], (idv, 0, 0, 1))
for k in ('obi', 'wing_l', 'wing_r', 'wing2_l', 'wing2_r', 'knot', 'tare'):
    set_mat(parts[k], M['obi']); vcolor(parts[k], (0.1 if k == 'obi' else 0.5, 0, 0, 1))
KZ_IDS = {'kushi': 0.1, 'kogai': 0.3, 'tsumami': 0.5, 'tsumami_c': 0.7}
for k, idv in KZ_IDS.items():
    set_mat(parts[k], M['kanzashi']); vcolor(parts[k], (idv, 0, 0, 1))
for k in list(parts):
    if k.startswith('bira'):
        set_mat(parts[k], M['kanzashi']); vcolor(parts[k], (0.9, 0, 0, 1))


# hair: uv along the strands. Everything is combed toward the root of the mage: u = angle from the root's axis
# (hairline -> root), v = azimuth round it. The mage loops already run u along their loops.
ROOT = MC
def hair_uv(o):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uvl = me.uv_layers[0].data
    for poly in me.polygons:
        vals = []
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co - ROOT
            ang = math.acos(max(-1, min(1, p.normalized().dot(HU))))
            az = math.atan2(p.dot(HX), p.dot(HF)) / (2 * math.pi)
            vals.append([ang * 4.0, az])
        azs = [v[1] for v in vals]
        if max(azs) - min(azs) > 0.5:
            for v in vals:
                if v[1] < 0:
                    v[1] += 1
        for li, v in zip(poly.loop_indices, vals):
            uvl[li].uv = (v[0], v[1] * 6.0)


hair_uv(hair)
for k in ('hair', 'mage_f', 'mage_b', 'nemoto'):
    set_mat(parts[k], M['hair'])
hair_uv(parts['nemoto'])

groups = {
    'kimono': [shell, parts['collar']] + sleeves,
    'cloth': [parts[k] for k in CLOTH_IDS],
    'obi': [parts[k] for k in ('obi', 'wing_l', 'wing_r', 'wing2_l', 'wing2_r', 'knot', 'tare')],
    'hair': [parts[k] for k in ('hair', 'mage_f', 'mage_b', 'nemoto')],
    'kanzashi': [parts[k] for k in list(KZ_IDS) + [k for k in parts if k.startswith('bira')]],
}
merged = {}
for name, objs in groups.items():
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
        if 'Col' not in o.data.color_attributes:
            vcolor(o, (0, 0, 0, 1))
    merged[name] = join(objs, 'pas_' + name)
    print('MERGED', name, len(merged[name].data.polygons))

# the posed body becomes the bind pose
face_objs_pre = [bpy.data.objects[n] for n in ('pas_eyes', 'pas_brows', 'pas_lashes')]
keep = set([body] + face_objs_pre + list(merged.values()))
for o in [x.name for x in bpy.data.objects if x.type == 'MESH' and x not in keep]:
    if o in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[o])
face_objs = [bpy.data.objects[n] for n in ('pas_eyes', 'pas_brows', 'pas_lashes')]
bake_pose(rig, [body] + face_objs)
bpy.context.view_layer.update()


def bind(o, bone):
    o.vertex_groups.clear()
    g = o.vertex_groups.new(name=bone)
    g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    a = o.modifiers.new('Armature', 'ARMATURE'); a.object = rig


for name, o in merged.items():
    bind(o, 'head' if name in ('hair', 'kanzashi') else 'spine_03')
# the scalp mask for the skin shader: 1 under the hair, fading over 8 mm below the hairline
me = body.data
if 'Col' not in me.color_attributes:
    me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
ca = me.color_attributes['Col']
for v in me.vertices:
    p = body.matrix_world @ v.co
    d = (p - HC)
    m = 0.0
    if d.length < 0.16 and p.z > 0.8:
        az, el = dir_ang(d.normalized())
        m = smoothstep(-6.0, 0.5, el - e_hair(az))
    ca.data[v.index].color = (m, 0, 0, 1)
print('BONES', len(rig.data.bones))
out_objs = [rig, body] + face_objs + list(merged.values())
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '_final.blend'))
export(OUT, out_objs)
print('EXPORTED', OUT)
