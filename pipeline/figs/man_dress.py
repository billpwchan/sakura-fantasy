# the sendo's clothes over the posed body (man.blend, pose baked): momohiki, hanten with its collar band, kaku-obi,
# nejiri hachimaki, sugegasa, indigo tabi and waraji; then skin everything to the rig and export.
# Blender -b man.blend --python man_dress.py -- out.glb [check]
import bpy, bmesh, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from garment import *
from mathutils.bvhtree import BVHTree
from mathutils import Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
CHECK = 'check' in argv[1:]
NOHAT = 'nohat' in argv[1:]
rig = bpy.data.objects['man_rig']
body = bpy.data.objects['man']
faces = [bpy.data.objects['man_' + k] for k in ('eyes', 'brows', 'lashes')]
skin = static_copy(body, 'skin_static')
sk = bvh(skin)
dom = dominant(body)
parts = {}

PELVIS = head_w(rig, 'pelvis')
NECK = head_w(rig, 'neck_01')
Z_OBI = PELVIS.z + 0.055          # the kaku-obi sits low, on the hip bones
OBI_W = 0.088
Z_HEM = 0.70                      # hanten hem, upper thigh
ANK = {s: head_w(rig, 'foot_' + s) for s in 'lr'}
print('LANDMARKS pelvis', [round(v, 3) for v in PELVIS], 'neck', [round(v, 3) for v in NECK], 'obi', round(Z_OBI, 3))


def vcolor(o, rgba):
    me = o.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for d in me.color_attributes['Col'].data:
        d.color = rgba
    return o


def bone_is(b, *names):
    return b is not None and b.startswith(names)


# ---- momohiki: close-fitting cotton trousers from the waist to the ankle bone
TABI_TOP = 0.105


def keep_legs(b, co):
    return bone_is(b, 'pelvis', 'thigh', 'calf', 'spine_01', 'foot') and co.z < Z_OBI + 0.02 and co.z > ANK['l' if co.x > 0 else 'r'].z + 0.05
mom = region_copy(body, 'momohiki', keep_legs)
bm = bmesh.new(); bm.from_mesh(mom.data)
bm.normal_update()
for v in bm.verts:
    # cotton eases over the seat and thigh and is drawn close at the shin
    k = smoothstep(0.25, 0.6, v.co.z)
    v.co += v.normal * (0.006 + 0.008 * k)
bm.to_mesh(mom.data); bm.free()
smooth(mom, 0.6, 8)
push_out(mom, skin, 0.005)
# tucked into the tabi: drawn tight to the skin inside the cuff
for v in mom.data.vertices:
    A = ANK['l' if v.co.x > 0 else 'r']
    k = smoothstep(A.z + TABI_TOP + 0.035, A.z + TABI_TOP - 0.01, v.co.z)
    if k > 0:
        loc, n, _, _ = sk.find_nearest(v.co)
        v.co = v.co.lerp(loc + n * 0.0012, k)
parts['momohiki'] = mom

# ---- hanten: a boxy indigo jacket to the upper thigh, cinched by the obi, the collar band down both front edges
pts = []
mw = body.matrix_world
for v in body.data.vertices:
    b = dom[v.index]
    co = mw @ v.co
    if bone_is(b, 'spine', 'clavicle', 'pelvis') and co.z > Z_HEM - 0.04:
        pts.append(co)
    elif bone_is(b, 'thigh') and co.z > Z_HEM - 0.04:
        pts.append(co)
    elif bone_is(b, 'upperarm') and (co - head_w(rig, 'upperarm_' + b[-1])).length < 0.07:
        pts.append(co)
    elif bone_is(b, 'neck') and co.z < NECK.z + 0.02:
        pts.append(co)
torso = hull_of(pts, 'hanten')
voxel(torso, 0.01)
inflate(torso, 0.014)
smooth(torso, 0.6, 10)
push_out(torso, skin, 0.012)
# the obi gathers it in at the waist; above and below the cloth blouses out again
for v in torso.data.vertices:
    dz = abs(v.co.z - Z_OBI)
    w = 1 - smoothstep(0.03, 0.1, dz)
    if w <= 0:
        continue
    loc, n, _, _ = sk.find_nearest(v.co)
    v.co = v.co.lerp(loc + n * 0.016, w * 0.8)
smooth(torso, 0.4, 4)


# the opening: the collar round the back of the neck (an ellipse a little off the neck), a V down the chest to above
# the obi; cut along the zero line of one field so the edge is clean where the two meet
Z_NECK = NECK.z + 0.01
Z_V = Z_OBI + OBI_W / 2 + 0.095
NY = NECK.y
nk = []
for dvec in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))):
    o = Vector((NECK.x, NECK.y, NECK.z + 0.03))
    hit = sk.ray_cast(o, dvec, 0.2)
    nk.append((hit[0] - o).dot(dvec) if hit[0] else 0.06)
NCX = NECK.x + (nk[0] - nk[1]) / 2
NCY = NECK.y + (nk[2] - nk[3]) / 2
NAX = (nk[0] + nk[1]) / 2 + 0.024
NAY = (nk[2] + nk[3]) / 2 + 0.02
Z_VT = Z_NECK - 0.03
print('NECK section', [round(v, 3) for v in nk], 'centre', round(NCX, 3), round(NCY, 3), 'collar', round(NAX, 3), round(NAY, 3))


def opening(p):
    f = -1.0
    if p.z > Z_NECK - 0.2:
        f = (1 - math.hypot((p.x - NCX) / NAX, (p.y - NCY) / NAY)) * 0.08 - max(0.0, Z_NECK - 0.07 - p.z)
    if p.y < NCY and p.z > Z_V - 0.02:
        hw = NAX * 0.92 * max(0.0, (p.z - Z_V) / (Z_VT - Z_V))
        f = max(f, hw - abs(p.x - NCX))
    return f


cut(torso, Vector((0, 0, Z_HEM)), Vector((0, 0, -1)))
cut_field(torso, opening)
parts['hanten'] = torso

# the collar band (eri) along the cut edge: from under the outer panel at the crossing, up the inner panel's side of
# the V, round the back of the neck, down the outer panel's side and on down its front edge to the hem
ht = bvh(torso)
loops = boundary_loops(torso)
op = max(loops, key=lambda l: sum(p.z for p in l) / len(l))
i0 = min(range(len(op)), key=lambda i: op[i].z if (abs(op[i].x - NCX) < 0.03 and op[i].y < NCY) else 9)
op = op[i0:] + op[:i0]
if op[6].x > op[-6].x:
    op = [op[0]] + op[1:][::-1]
op = resample(op, 0.004)
tip = op[0]
bdir = (op[12] - tip).normalized()
adir = (tip - op[-12]).normalized()
ext = [tip - bdir * 0.03, tip - bdir * 0.015]
FX = (tip + adir * 0.05).x - 0.01
cont = [tip + adir * 0.025, tip + adir * 0.05, Vector((FX, tip.y, Z_OBI + 0.035)), Vector((FX - 0.002, tip.y, Z_OBI)),
        Vector((FX - 0.004, tip.y, (Z_OBI + Z_HEM) / 2)), Vector((FX - 0.006, tip.y, Z_HEM + 0.0005))]
cont = [on_surface(ht, q, 0.0)[0] for q in cont]
path = catmull(ext + op + [tip] + cont, 0.006)
arc = [0.0]
for i in range(1, len(path)):
    arc.append(arc[-1] + (path[i] - path[i - 1]).length)
# which side of the edge is cloth: step off it both ways and see which stays on the surface
mid = len(path) // 2
t_ = (path[mid + 1] - path[mid - 1]).normalized()
n_ = on_surface(ht, path[mid], 0.0)[1]
side = n_.cross(t_).normalized()
S_ERI = 1 if (on_surface(ht, path[mid] + side * 0.01, 0.0)[0] - (path[mid] + side * 0.01)).length < \
    (on_surface(ht, path[mid] - side * 0.01, 0.0)[0] - (path[mid] - side * 0.01)).length else -1


def u_at(pred):
    return next(arc[i] for i in range(len(path)) if pred(i))


U_BACK = arc[max(range(len(path)), key=lambda i: path[i].y if path[i].z > Z_NECK - 0.1 else -9)]
U_TIP2 = arc[len(ext) + len(op)] if False else u_at(lambda i: arc[i] > U_BACK and path[i].z < tip.z + 0.002)
U_B = u_at(lambda i: arc[i] > 0.05 and path[i].z > Z_NECK - 0.06)
print('ERI_U total', round(arc[-1], 3), 'tip', round(arc[len(ext)], 3), 'b_top', round(U_B, 3), 'back', round(U_BACK, 3),
      'tip2', round(U_TIP2, 3), 'side', S_ERI)
for zq in (Z_V + 0.16, Z_V + 0.12, Z_V + 0.08, Z_V + 0.04):
    ub = u_at(lambda i: path[i].z > zq)
    ua = u_at(lambda i: arc[i] > U_BACK and path[i].z < zq)
    print('ERI_Z', round(zq - Z_V, 2), 'b', round(ub, 3), 'a', round(ua, 3))


def eri_off(i):
    # the inner panel's band lies under the outer one where they cross
    return 0.0022 + 0.0013 * smoothstep(0.06, 0.16, arc[i])


eri = ribbon('eri', path, 0.05, ht, None, S_ERI, ncross=6, steps=3, offi=eri_off)
smooth(eri, 0.4, 2)
thicken(eri, 0.0016, offset=1.0, sub=0)
parts['eri'] = eri

CUT_AT = {}
# sleeves: loose tube sleeves (tsutsu-sode) to mid-forearm, attached under the shoulder of the body
for s in 'lr':
    E = head_w(rig, 'lowerarm_' + s)
    W = head_w(rig, 'hand_' + s)
    S = head_w(rig, 'upperarm_' + s)
    ax = (W - E).normalized()
    cut_at = 0.55 * (W - E).length
    CUT_AT[s] = (E, ax, cut_at)

    def keep_arm(b, co, s=s, E=E, ax=ax, cut_at=cut_at):
        if bone_is(b, 'upperarm_' + s):
            return True
        if bone_is(b, 'lowerarm_' + s):
            return (co - E).dot(ax) < cut_at + 0.02
        return False
    sl = region_copy(body, 'sleeve_' + s, keep_arm)
    bm = bmesh.new(); bm.from_mesh(sl.data)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.to_mesh(sl.data); bm.free()
    inflate(sl, 0.02)
    voxel(sl, 0.006)
    smooth(sl, 0.6, 12)
    push_out(sl, skin, 0.014)
    # open the cuff: cut square across the forearm, and the shoulder end inside the body shell
    cut(sl, E + ax * cut_at, ax)
    parts['sleeve_' + s] = sl


def rotate_obj(o, c, axis, deg):
    R = Matrix.Rotation(math.radians(deg), 4, axis)
    M = Matrix.Translation(c) @ R @ Matrix.Translation(-c)
    o.data.transform(M)


# ---- kaku-obi: a stiff narrow sash, wound twice round the hips over the hanten, the kai-no-kuchi knot at the back
NA = 128
OC = Vector((PELVIS.x, PELVIS.y + 0.01, 0))
under = [bvh(torso), bvh(eri)]


def ring_r(z):
    out = []
    for i in range(NA):
        a = i / NA * 2 * math.pi
        dvec = Vector((math.sin(a), -math.cos(a), 0))
        o = Vector((OC.x, OC.y, z))
        r = 0.12
        for t in under:
            hit = t.ray_cast(o + dvec * 0.5, -dvec)
            if hit[0]:
                r = max(r, (o - hit[0]).length)
        out.append(r)
    return out


RO = [max(rs) + 0.0015 for rs in zip(*[ring_r(Z_OBI + OBI_W * (k / 6 - 0.5)) for k in range(7)])]
for _ in range(4):
    RO = [(RO[i - 1] + 2 * RO[i] + RO[(i + 1) % NA]) / 4 for i in range(NA)]
OBI_T = 0.005
PROF = [(0.0, -0.5), (0.003, -0.5), (0.0045, -0.48), (OBI_T, -0.44), (OBI_T, 0.44), (0.0045, 0.48), (0.003, 0.5), (0.0, 0.5)]


def ro_at(a):
    f = (a / (2 * math.pi) % 1.0) * NA
    i = int(f)
    t = f - i
    return RO[i % NA] * (1 - t) + RO[(i + 1) % NA] * t


def ring_pt(a, z, r):
    return Vector((OC.x + math.sin(a) * r, OC.y - math.cos(a) * r, z))


def obi_p(i, j):
    a = i / NA * 2 * math.pi
    t, h = PROF[j]
    return ring_pt(a, Z_OBI + h * OBI_W, RO[i % NA] + t)


A_PER_M = 1 / 0.17
parts['obi'] = grid_mesh('obi', obi_p, NA, len(PROF) - 1, wrap_u=True,
                         uv=lambda i, j: (i / NA * 2 * math.pi * ro_at(i / NA * 2 * math.pi), j / (len(PROF) - 1)))


def obi_strip(name, a0, z0, phi, L, w, layer, back=0.0, nu=24, nv=6, fold=0.0):
    """a flat length of obi lying on the wound sash: from (a0, z0) for L metres at phi (0 = towards +a, 90 = up),
    w wide; `back` starts it that far behind the origin; `fold` curls the far end down onto the sash"""
    c, sn = math.cos(math.radians(phi)), math.sin(math.radians(phi))

    def P(i, j):
        u = -back + (L + back) * i / nu
        v = (j / nv - 0.5) * w
        da = u * c - v * sn
        dz = u * sn + v * c
        a = a0 + da / ro_at(a0)
        lift = layer + OBI_T - fold * smoothstep(L * 0.75, L, u) * 0.6
        return ring_pt(a, z0 + dz, ro_at(a) + lift)
    o = grid_mesh(name, P, nu, nv, uv=lambda i, j: (-back + (L + back) * i / nu, j / nv))
    thicken(o, 0.0035, offset=-1.0, sub=0)
    return o


# kai-no-kuchi from behind: the folded te pointing up and out to his left, the tare across it to his right, both
# held by the turn of the tare round the crossing
AK = math.pi - 0.16
ZK = Z_OBI + 0.004
te = obi_strip('obi_te', AK, ZK, 145, 0.105, 0.042, 0.002, back=0.02, fold=0.004)
tare = obi_strip('obi_tare', AK, ZK - 0.004, -8, 0.115, 0.07, 0.0058, back=0.025, fold=0.004)
wrap = obi_strip('obi_wrap', AK - 0.012 / ro_at(AK), ZK - OBI_W * 0.62, 90, OBI_W * 1.24, 0.05, 0.0098, nu=20)
for o_, c_ in ((te, 0.55), (tare, 0.55), (wrap, 0.58)):
    vcolor(o_, (c_, 0, 0, 1))
parts['obi_knot'] = join([te, tare, wrap], 'obi_knot')

# a tenugui folded over the obi at his right hip, hanging
AT = 2 * math.pi - 0.95
TW, TL_ = 0.075, 0.24


def tenugui_p(i, j):
    u = i / 28
    v = (j / 6 - 0.5) * TW
    z_top = Z_OBI + OBI_W / 2
    a = AT + v / ro_at(AT)
    if u < 0.08:
        # over the top lip of the obi
        t = u / 0.08
        th = t * math.pi / 2
        r = ro_at(a) + OBI_T * 0.5 + 0.004 * math.sin(th)
        return ring_pt(a, z_top - 0.006 + 0.008 * math.sin(th), r - 0.003 + 0.007 * (1 - math.cos(th)))
    zz = z_top + 0.002 - (u - 0.08) / 0.92 * TL_
    hit_r = ro_at(a) + OBI_T + 0.004
    if zz < Z_OBI - OBI_W / 2:
        o = Vector((OC.x, OC.y, zz))
        dvec = Vector((math.sin(a), -math.cos(a), 0))
        h = under[0].ray_cast(o + dvec * 0.5, -dvec)
        surf = (o - h[0]).length + 0.004 if h[0] else hit_r
        k = smoothstep(Z_OBI - OBI_W / 2, Z_OBI - OBI_W / 2 - 0.05, zz)
        hit_r = hit_r * (1 - k) + max(surf, hit_r - 0.01) * k
    sway = 0.006 * math.sin(u * 5.0) * (u - 0.08)
    return ring_pt(a + sway, zz, hit_r + 0.002 * math.sin(v / TW * math.pi * 3) * u)


tg = grid_mesh('tenugui_hip', tenugui_p, 28, 6, uv=lambda i, j: (i / 28, j / 6))
thicken(tg, 0.0016, offset=-1.0, sub=0)
parts['tenugui_hip'] = tg

# ---- head frame
hb = pbone_world(rig, 'head')
HU = (hb.to_3x3() @ Vector((0, 1, 0))).normalized()
HX = Vector((1, 0, 0))
HF = HU.cross(HX).normalized()
if HF.y > 0:
    HF = -HF
HX = HF.cross(HU).normalized()
if HX.x < 0:
    HX = -HX
HC = hb.translation + HU * 0.09 + HF * 0.004
head_only = static_copy(body, 'head_only')
delete_where(head_only, lambda p: not ((p - HC).length < 0.16 and p.z > HC.z - 0.12))
hot = bvh(head_only)


def skull_r(dvec):
    hit = hot.ray_cast(HC + dvec * 0.3, -dvec)
    return (hit[0] - HC).length if hit[0] else 0.08


def dir_ang(dvec):
    f, u, x = dvec.dot(HF), dvec.dot(HU), dvec.dot(HX)
    return math.degrees(math.atan2(x, f)), math.degrees(math.atan2(u, math.hypot(f, x)))


def hdir(az, el):
    a, e = math.radians(az), math.radians(el)
    return (HF * math.cos(e) * math.cos(a) + HX * math.cos(e) * math.sin(a) + HU * math.sin(e)).normalized()


# ---- hair: cropped short, greying; a shell on the scalp down to a man's hairline (receding a little at the temples)
HAIRLINE = [(0, 26), (18, 24), (30, 18), (42, 16), (55, 6), (66, -2), (74, -14), (80, -16), (86, -4), (100, -6), (112, -22),
            (130, -34), (150, -40), (180, -42)]


def e_hair(az):
    a = abs(az)
    for (a0, e0), (a1, e1) in zip(HAIRLINE, HAIRLINE[1:]):
        if a <= a1:
            t = (a - a0) / (a1 - a0)
            t = t * t * (3 - 2 * t)
            return e0 + (e1 - e0) * t
    return HAIRLINE[-1][1]


NSH = 96
def hair_p(i, j):
    th = i / NSH * math.pi
    ph = j / NSH * 2 * math.pi
    dvec = (HU * math.cos(th) + (HF * math.cos(ph) + HX * math.sin(ph)) * math.sin(th)).normalized()
    return HC + dvec * (skull_r(dvec) + 0.0028)


hair = grid_mesh('hair', hair_p, NSH, NSH, wrap_v=True, uv=lambda i, j: (i / NSH * math.pi * 4, j / NSH * 6))
delete_where(hair, lambda p: dir_ang((p - HC).normalized())[1] < e_hair(dir_ang((p - HC).normalized())[0]) - 0.5)
bm = bmesh.new(); bm.from_mesh(hair.data)
for v in [v for v in bm.verts if v.is_boundary]:
    az, el = dir_ang((v.co - HC).normalized())
    dv = hdir(az, e_hair(az))
    v.co = HC + dv * (skull_r(dv) + 0.0012)
bm.to_mesh(hair.data); bm.free()
parts['hair'] = hair

# ---- nejiri hachimaki: a tenugui twisted into a rope round the brow, knotted at the front right
NBND = 160
brows = static_copy(faces[1], 'brows_s')
BROW_Z = max(v.co.z for v in brows.data.vertices)
bpy.data.objects.remove(brows)
ZF = BROW_Z + 0.019
print('BROW_Z', round(BROW_Z, 3))


def band_c(k):
    az = k / NBND * 360.0
    z = ZF - 0.014 * (1 - math.cos(math.radians(az)))
    hd = (HF * math.cos(math.radians(az)) + HX * math.sin(math.radians(az)))
    hd.z = 0
    hd.normalize()
    o = Vector((HC.x, HC.y, z))
    hit = hot.ray_cast(o + hd * 0.3, -hd)
    p = hit[0] if hit[0] else o + hd * 0.09
    n = hit[1] if hit[0] else hd
    n = (n - Vector((0, 0, n.z * 0.5))).normalized()
    return p + n * 0.0072, n


cs = [band_c(k) for k in range(NBND)]
strands = []
for st in range(2):
    path = []
    for k in range(NBND):
        c, dv = cs[k]
        t = (cs[(k + 1) % NBND][0] - cs[k - 1][0]).normalized()
        b = t.cross(dv).normalized()
        ph = k / NBND * 2 * math.pi * 11 + st * math.pi
        path.append(c + (dv * math.cos(ph) + b * math.sin(ph)) * 0.0036)
    strands.append(tube('band%d' % st, path, 0.005, 8, closed=True, uvs=1 / NBND))
KZ_AZ = -38
kc, kdv = band_c(int((KZ_AZ % 360) / 360 * NBND))
knot = ellipsoid('hknot', kc + kdv * 0.006, [(kdv, 0.009), (HU, 0.012), (kdv.cross(HU).normalized(), 0.014)], 16)
tails = []
side = kdv.cross(HU).normalized()
for k, (du, dsx) in enumerate(((0.75, 0.66), (0.2, -0.98))):
    dirv = (HU * du + side * dsx).normalized()
    flat = dirv.cross(kdv).normalized()

    def tail_p(i, j, dirv=dirv, flat=flat):
        t = i / 8
        w = 0.0045 + 0.0055 * t
        a = j / 10 * 2 * math.pi
        # out from the knot, curling back onto the head as it goes
        c = kc + kdv * (0.009 - 0.006 * t * t) + dirv * (0.006 + 0.032 * t)
        return c + flat * math.cos(a) * w + kdv * math.sin(a) * 0.0018
    tails.append(grid_mesh('htail%d' % k, tail_p, 8, 10, wrap_v=True, uv=lambda i, j: (i / 8, j / 10)))
parts['hachimaki'] = join(strands + [knot] + tails, 'hachimaki')

# ---- sugegasa: a shallow cone of split sedge on a bamboo rim, riding on the head; the chin cord down past the ears
RK, HK = 0.24, 0.135
KU = tilt(HU, HX, -5)                      # tipped back a little
KX = HX
KF = KU.cross(KX).normalized()
if KF.dot(HF) < 0:
    KF = -KF
KX = KF.cross(KU).normalized()
if KX.dot(HX) < 0:
    KX = -KX


def kasa_z(r):
    return HK * (1 - (r / RK) ** 1.22)


# rest it on whatever is highest under it: the hair and the twisted band
h0 = -1
for o in (hair, parts['hachimaki']):
    for v in o.data.vertices:
        q = v.co - HC
        r = (q - KU * q.dot(KU)).length
        if r < RK:
            h0 = max(h0, q.dot(KU) - kasa_z(r) + 0.006)
K0 = HC + KU * h0
print('KASA h0', round(h0, 3), 'rim z', round(K0.z, 3))
NKA, NKR = 128, 28


def kasa_p(i, j):
    a = i / NKA * 2 * math.pi
    r = RK * (j / NKR) ** 0.8
    return K0 + (KF * math.cos(a) + KX * math.sin(a)) * r + KU * (kasa_z(r) + (0.004 * (1 - j / NKR) ** 6))


kasa = grid_mesh('kasa', kasa_p, NKA, NKR, wrap_u=True, uv=lambda i, j: (i / NKA, (j / NKR) ** 0.8))
mod_apply(kasa, 'SOLIDIFY', thickness=0.004, offset=-1.0, use_rim=True, use_even_offset=False)
rim = tube('kasa_rim', [K0 + (KF * math.cos(i / NKA * 2 * math.pi) + KX * math.sin(i / NKA * 2 * math.pi)) * (RK + 0.001) - KU * 0.002 for i in range(NKA)],
           0.0035, 8, closed=True)
# the head ring under it (atama-ate), resting on the band
ring = tube('kasa_ring', [K0 + (KF * math.cos(i / 48 * 2 * math.pi) + KX * math.sin(i / 48 * 2 * math.pi)) * 0.075 + KU * (kasa_z(0.075) - 0.012) for i in range(48)],
            0.006, 8, closed=True)
for o_, c_ in ((kasa, 0.1), (rim, 0.2), (ring, 0.25)):
    vcolor(o_, (c_, 0, 0, 1))
parts['kasa'] = join([kasa, rim, ring], 'kasa')
# chin cord: from the ring above each ear, in front of the ear, under the jaw to a knot under the chin
cords = []
chin = HC + HF * 0.06 - HU * 0.12
for sx in (1, -1):
    pts = [K0 + (KF * 0.0 + KX * sx * 0.075) + KU * (kasa_z(0.075) - 0.012)]
    for az, el in ((sx * 82, -2), (sx * 78, -18), (sx * 72, -34), (sx * 55, -48), (sx * 25, -58)):
        dv = hdir(az, el)
        pts.append(HC + dv * (skull_r(dv) + 0.004))
    pts.append(chin + HX * sx * 0.008)
    cords.append(tube('cord', catmull(pts, 0.008), 0.0016, 6))
cords.append(ellipsoid('cord_knot', chin, [(HX, 0.008), (HF, 0.006), (HU, 0.006)], 10))
parts['chin_cord'] = join(cords, 'chin_cord')

# ---- tabi (indigo, split toe, brass kohaze up the inside of the ankle) over the momohiki, and waraji
tabi = region_copy(body, 'tabi', lambda b, co: bone_is(b, 'foot', 'ball') or (bone_is(b, 'calf') and co.z < ANK[b[-1]].z + TABI_TOP))
inflate(tabi, 0.003)
bm = bmesh.new(); bm.from_mesh(tabi.data)
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
bm.to_mesh(tabi.data); bm.free()
voxel(tabi, 0.0028)
smooth(tabi, 0.5, 6)
push_out(tabi, skin, 0.002)
# cut the cuff open square, then the toe split between the big toe and the rest
FOOT_AX = {}
for s_, sx in (('l', 1), ('r', -1)):
    A = ANK[s_]
    b1 = tail_w(rig, 'ball_' + s_)
    fwd = b1 - A; fwd.z = 0; fwd.normalize()
    med = Vector((-sx, 0, 0)); med = (med - fwd * med.dot(fwd)).normalized()
    FOOT_AX[s_] = (fwd, med)
    b0 = head_w(rig, 'ball_' + s_)
    for v in tabi.data.vertices:
        q = v.co - b0
        along = q.dot(fwd)
        if (v.co - A).length > 0.3 or along < -0.005:
            continue
        lat = q.dot(med) - 0.017
        if abs(lat) < 0.006:
            k = (1 - abs(lat) / 0.006) ** 1.5 * smoothstep(-0.005, 0.025, along)
            v.co -= v.normal * 0.005 * k
mod_apply(tabi, 'DECIMATE', ratio=0.3)
for s_ in 'lr':
    A = ANK[s_]
    cut(tabi, Vector((0, 0, A.z + TABI_TOP - 0.006)), Vector((0, 0, 1)), lambda p, A=A: (p - A).length < 0.2)
for v in tabi.data.vertices:
    if v.co.z < 0.004:
        v.co.z = -0.002 + max(0.0, v.co.z + 0.002) * 0.3
push_out(tabi, skin, 0.0022)
parts['tabi'] = tabi
tb = bvh(tabi)
kz = []
for s_ in 'lr':
    A = ANK[s_]
    fwd, med = FOOT_AX[s_]
    for k in range(4):
        q, n = on_surface(tb, A + med * 0.02 - fwd * 0.04 + Vector((0, 0, 0.004 + k * 0.022)), 0.0012)
        kz.append(rbox('kohaze', q, (0.011, 0.0035, 0.007), 0.3, 8))
parts['kohaze'] = join(kz, 'kohaze')

# waraji: a woven straw sole under each foot (the figure stands SOLE_T higher in the boat), the front cord from between
# the toes back to the side loops, crossed over the instep, round the back of the ankle and tied at the outside
SOLE_T = 0.012
sandals, straps = [], []
for s_, sx in (('l', 1), ('r', -1)):
    A = ANK[s_]
    fwd, med = FOOT_AX[s_]
    lat = -med
    b1 = tail_w(rig, 'ball_' + s_)
    heel = Vector((A.x, A.y, 0)) - fwd * 0.062
    toe = Vector((b1.x, b1.y, 0)) - fwd * 0.012
    Lf = (toe - heel).dot(fwd)
    mid = (heel + toe) / 2
    HW = [(0.0, 0.034), (0.3, 0.036), (0.62, 0.043), (0.85, 0.045), (1.0, 0.04)]

    def hw(t):
        for (t0, w0), (t1, w1) in zip(HW, HW[1:]):
            if t <= t1:
                return w0 + (w1 - w0) * (t - t0) / (t1 - t0)
        return HW[-1][1]
    outline = []
    for k in range(80):
        th = k / 80 * 2 * math.pi
        ct, st = spow(math.cos(th), 0.55), spow(math.sin(th), 0.7)
        t = 0.5 + 0.5 * ct
        outline.append(heel + fwd * (t * Lf) + lat * (st * hw(t)))
    ring_f = [(0.0, -0.0025), (0.96, -0.0025), (1.0, -0.006), (0.98, -0.0105 - 0.002), (0.0, -0.0145)]

    def sole_p(i, j, outline=outline, mid=mid):
        f, z = ring_f[j]
        return mid + (outline[i % 80] - mid) * f + Vector((0, 0, z))
    so = grid_mesh('waraji', sole_p, 80, len(ring_f) - 1, wrap_u=True,
                   uv=lambda i, j, outline=outline, heel=heel, fwd=fwd, lat=lat, mid=mid: (
                       (mid + (outline[i % 80] - mid) * ring_f[j][0] - heel).dot(fwd), (mid + (outline[i % 80] - mid) * ring_f[j][0] - heel).dot(lat)))
    bm = bmesh.new(); bm.from_mesh(so.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(so.data); bm.free()
    sandals.append(so)

    def surf(p, off=0.0028):
        return on_surface(tb, p, off)[0]
    tp = heel + fwd * (Lf * 0.86) + med * 0.016
    side_m = heel + fwd * (Lf * 0.6) + med * 0.048 + Vector((0, 0, 0.012))
    side_l = heel + fwd * (Lf * 0.58) + lat * 0.05 + Vector((0, 0, 0.012))
    side_m2 = heel + fwd * (Lf * 0.36) + med * 0.044 + Vector((0, 0, 0.016))
    side_l2 = heel + fwd * (Lf * 0.36) + lat * 0.047 + Vector((0, 0, 0.016))
    back = heel + fwd * 0.012 + Vector((0, 0, 0.03))
    front_ank = A + fwd * 0.045 + Vector((0, 0, 0.005))
    tie = A + lat * 0.042 + fwd * 0.02 + Vector((0, 0, 0.012))
    for seq in ([tp + Vector((0, 0, 0.012)), tp + fwd * -0.02 + Vector((0, 0, 0.03)), side_m],
                [tp + Vector((0, 0, 0.012)), tp + fwd * -0.02 + lat * 0.02 + Vector((0, 0, 0.032)), side_l],
                [side_m, side_m + fwd * -0.03 + lat * 0.04 + Vector((0, 0, 0.04)), side_l2],
                [side_l, side_l + fwd * -0.03 + med * 0.04 + Vector((0, 0, 0.04)), side_m2],
                [side_m2, side_m2 - fwd * 0.03 + Vector((0, 0, 0.02)), back, back + lat * 0.03 + Vector((0, 0, 0.02)), tie],
                [side_l2, side_l2 - fwd * 0.03 + Vector((0, 0, 0.02)), back + med * 0.01],
                [back, back + med * 0.035 + Vector((0, 0, 0.03)), A + med * 0.04 + Vector((0, 0, 0.025)), front_ank + Vector((0, 0, 0.02)), tie]):
        pts = [surf(q) for q in seq]
        straps.append(tube('strap', catmull(pts, 0.005), 0.0026, 6))
    for q in (side_m, side_l, side_m2, side_l2):
        q = surf(q, 0.002)
        straps.append(ellipsoid('chichi', q, [(fwd, 0.007), (Vector((0, 0, 1)), 0.005), (fwd.cross(Vector((0, 0, 1))), 0.004)], 8))
    tq = surf(tie, 0.004)
    straps.append(ellipsoid('strap_knot', tq, [(fwd, 0.008), (Vector((0, 0, 1)), 0.006), (lat, 0.005)], 10))
    for k, dvec in enumerate((fwd + Vector((0, 0, -0.8)), -fwd + Vector((0, 0, -1.0)))):
        dvec.normalize()
        straps.append(tube('strap_end', [tq + dvec * (0.004 * m) + lat * (0.0015 * m) for m in range(7)], lambda i: 0.0024 - i * 0.0002, 6))
parts['waraji'] = join(sandals, 'waraji')
parts['straps'] = join(straps, 'straps')


def covered(b, co):
    """skin that no camera can see under the clothes: legs and feet, the trunk below the V, the arm inside the sleeve"""
    if bone_is(b, 'thigh', 'calf', 'foot', 'ball'):
        return True
    if bone_is(b, 'pelvis', 'spine'):
        return co.z < Z_V - 0.04
    if bone_is(b, 'upperarm'):
        return True
    if bone_is(b, 'lowerarm'):
        E, ax, cut_at = CUT_AT[b[-1]]
        return (co - E).dot(ax) < cut_at - 0.08
    return False


def drop_covered(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    mw = o.matrix_world
    kill = [v for v in bm.verts if covered(dom[v.index], mw @ v.co)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(o.data); bm.free()
    print('DROPPED', len(kill), 'of', len(dom))


def export_check():
    mats = {
        'hanten': material('hanten_chk', (0.03, 0.05, 0.14), 0.85), 'sleeve_l': None, 'sleeve_r': None,
        'momohiki': material('momo_chk', (0.02, 0.03, 0.08), 0.85),
        'eri': material('eri_chk', (0.01, 0.01, 0.01), 0.6),
        'obi': material('obi_chk', (0.12, 0.06, 0.03), 0.6), 'obi_knot': None,
        'tenugui_hip': material('teng_chk', (0.8, 0.8, 0.75), 0.8), 'hachimaki': None,
        'hair': material('hair_chk', (0.03, 0.03, 0.03), 0.6),
        'kasa': material('straw_chk', (0.55, 0.42, 0.22), 0.8), 'waraji': None, 'straps': None,
        'chin_cord': material('cord_chk', (0.15, 0.08, 0.04), 0.7),
        'tabi': material('tabi_chk', (0.03, 0.04, 0.1), 0.8), 'kohaze': material('brass_chk', (0.8, 0.6, 0.2), 0.3, 1.0),
    }
    mats['obi_knot'] = mats['obi']; mats['hachimaki'] = mats['tenugui_hip']; mats['waraji'] = mats['kasa']; mats['straps'] = mats['kasa']
    if NOHAT:
        for k in ('kasa', 'chin_cord'):
            bpy.data.objects.remove(parts.pop(k))
    for k, o in parts.items():
        m = mats.get(k) or mats['hanten']
        set_mat(o, m)
    drop_covered(skin)
    export(OUT, [skin] + list(parts.values()) + [static_copy(f, f.name + '_s') for f in faces])
    print('EXPORTED', OUT)


if CHECK:
    export_check()
    raise SystemExit

# ---- final assembly: ids, merge by material, skin to the rig
CLOTH = {'hanten': 0.05, 'sleeve_l': 0.1, 'sleeve_r': 0.1, 'eri': 0.2, 'momohiki': 0.3, 'tabi': 0.4, 'obi': 0.5,
         'obi_knot': None, 'tenugui_hip': 0.65, 'hachimaki': 0.75}
STRAW = {'kasa': None, 'waraji': 0.4, 'straps': 0.5, 'chin_cord': 0.7, 'kohaze': 0.9}
for k, c in list(CLOTH.items()) + list(STRAW.items()):
    if c is not None:
        vcolor(parts[k], (c, 0, 0, 1))
M = {'cloth': material('man_cloth', (0.03, 0.05, 0.14), 0.85), 'straw': material('man_straw', (0.55, 0.42, 0.22), 0.8),
     'hair': material('man_hair', (0.03, 0.03, 0.03), 0.6)}
# the collar lettering rides on the cloth material as its base-colour image (the shader samples it as a mask)
mt_ = M['cloth']
nt_ = mt_.node_tree
img_ = nt_.nodes.new('ShaderNodeTexImage')
img_.image = bpy.data.images.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'eri_kanji.png'))
nt_.links.new(img_.outputs['Color'], next(n for n in nt_.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'])
for k, o in parts.items():
    print('PART', k, len(o.data.polygons))
groups = {'cloth': [parts[k] for k in CLOTH], 'straw': [parts[k] for k in STRAW], 'hair': [parts['hair']]}
vcolor(parts['hair'], (0.0, 0, 0, 1))
merged = {}
for name, objs in groups.items():
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
        set_mat(o, M[name])
    merged[name] = join(objs, 'man_' + name)
    print('MERGED', name, len(merged[name].data.polygons))

# split what rides on the head (hat, cord, band) from what deforms with the body
def split_off(o, pred, name):
    # read through the attribute API (linear, as vcolor wrote it): bmesh hands back the raw sRGB byte, which put the
    # obi (0.5, 0.55 linear) inside the band's 0.75 window
    ca = o.data.color_attributes['Col']
    sel_ids = {p.index for p in o.data.polygons if pred(ca.data[p.loop_start].color[0])}
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    keep_me = o.data.copy()
    o2 = link(bpy.data.objects.new(name, keep_me))
    bm2 = bm.copy()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in sel_ids], context='FACES')
    bm.to_mesh(o.data); bm.free()
    bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.index not in sel_ids], context='FACES')
    bm2.to_mesh(keep_me); bm2.free()
    o2.data.materials.clear(); o2.data.materials.append(o.data.materials[0])
    return o2


band = split_off(merged['cloth'], lambda r: abs(r - 0.75) < 0.02, 'man_band')
hat = split_off(merged['straw'], lambda r: r < 0.3 or abs(r - 0.7) < 0.02, 'man_hat')

for o in [x for x in bpy.data.objects if x.type == 'MESH' and x not in set([body] + faces + list(merged.values()) + [band, hat])]:
    bpy.data.objects.remove(o)


def bind(o, bone):
    o.vertex_groups.clear()
    g = o.vertex_groups.new(name=bone)
    g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    a = o.modifiers.new('Armature', 'ARMATURE'); a.object = rig


transfer_weights(merged['cloth'], body, rig)
transfer_weights(merged['straw'], body, rig)
for o in (merged['hair'], band, hat):
    bind(o, 'head')
# the band and hat rejoin the materials they belong to once each is skinned
for a_, b_ in ((merged['cloth'], band), (merged['straw'], hat)):
    for m_ in list(b_.modifiers):
        b_.modifiers.remove(m_)
    for g in a_.vertex_groups:
        if g.name not in b_.vertex_groups:
            b_.vertex_groups.new(name=g.name)
    for m_ in list(a_.modifiers):
        if m_.type == 'ARMATURE':
            a_.modifiers.remove(m_)
    bpy.ops.object.select_all(action='DESELECT')
    a_.select_set(True); b_.select_set(True); bpy.context.view_layer.objects.active = a_
    bpy.ops.object.join()
    am = a_.modifiers.new('Armature', 'ARMATURE'); am.object = rig



# the hat, its cord and the head band ride the head alone. Pinned by their vertex colour after the join: any of
# their vertices left to the body's weights (the brim reaches back over the neck and shoulders) is dragged by the
# arms into spikes off the brim
def pin_to_head(o, pred):
    me = o.data
    ca = me.color_attributes['Col']
    sel = sorted({l.vertex_index for li, l in enumerate(me.loops) if pred(ca.data[li].color[0])})
    for g in o.vertex_groups:
        if g.name != 'head':
            g.remove(sel)
    o.vertex_groups['head'].add(sel, 1.0, 'REPLACE')
    return len(sel)


print('PIN hat', pin_to_head(merged['straw'], lambda r: r < 0.3 or abs(r - 0.7) < 0.02))
print('PIN band', pin_to_head(merged['cloth'], lambda r: abs(r - 0.75) < 0.02))

# only now, with every garment skinned from the whole body, drop the skin they hide
drop_covered(body)

# skin masks for the shader: r = hair shadow on the scalp, g = beard stubble
me = body.data
if 'Col' not in me.color_attributes:
    me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
ca = me.color_attributes['Col']
for v in me.vertices:
    p = body.matrix_world @ v.co
    d = p - HC
    r = g = 0.0
    if d.length < 0.17 and p.z > 1.2:
        az, el = dir_ang(d.normalized())
        r = smoothstep(-5.0, 0.5, el - e_hair(az))
        # jaw, chin and upper lip; not the cheekbones
        f = d.dot(HF)
        u = d.dot(HU)
        g = smoothstep(-0.02, 0.02, f) * smoothstep(-0.005, -0.04, u) * smoothstep(-0.125, -0.10, u)
        g *= 1 - smoothstep(0.035, 0.07, abs(d.dot(HX))) * smoothstep(-0.06, -0.035, u)
    ca.data[v.index].color = (r, g, 0, 1)
out_objs = [rig, body] + faces + list(merged.values())
for o in out_objs:
    print('OUT', o.name, len(o.data.polygons) if o.type == 'MESH' else '', [m.type for m in o.modifiers] if o.type == 'MESH' else '')
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '_final.blend'))
export(OUT, out_objs)
print('EXPORTED', OUT)
