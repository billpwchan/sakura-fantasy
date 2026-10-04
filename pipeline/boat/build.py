# The tomabune, built plank by plank: hull, fittings, toma canopy, cargo, ro and bow lantern.
# Authored in the boat's three.js frame (x across, y up, z toward the bow, waterline y = 0) and converted to
# Blender's z-up on the way in, so the exported glTF lands back in that frame.
# usage: blender -b --factory-startup --python build.py -- <out.glb> [--nobake]
import bpy, bmesh, math, random, sys, json, os
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
BAKE = '--nobake' not in ARGS
TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex') + '/'
R = random.Random(11)

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)


def P(x, y, z): return Vector((x, -z, y))
def T3(v): return (v.x, v.z, -v.y)  # blender -> three
def ss(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t


# ---------------------------------------------------------------- hull lines
Z0, Z1G, Z1C = -4.15, 4.5, 3.78


def chine(s):
    z = Z0 + 0.06 + s * (Z1C - Z0 - 0.06)
    y = -0.2 + 0.07 * ss(0.12, 0.0, s) + 0.5 * ss(0.68, 1.0, s) ** 2
    w = (0.6 - 0.1 * ss(0.15, 0.0, s)) * (1 - ss(0.52, 1.0, s)) ** 0.75
    return max(w, 0.03), y, z


def gunwale(s):
    z = Z0 - 0.06 + s * (Z1G - Z0 + 0.06)
    y = 0.4 + 0.1 * ss(0.15, 0.0, s) + 0.72 * ss(0.6, 1.0, s) ** 2
    w = (0.82 - 0.08 * ss(0.15, 0.0, s)) * (1 - ss(0.58, 1.0, s)) ** 0.62
    return max(w, 0.04), y, z


BULGE = 0.014


def side(s, t, sx):
    cw, cy, cz = chine(s)
    gw, gy, gz = gunwale(s)
    x = lerp(cw, gw, t) + BULGE * math.sin(math.pi * t) * (1 - ss(0.8, 1.0, s))
    return Vector((sx * x, lerp(cy, gy, t), lerp(cz, gz, t)))


def side_at(z, y):
    """(s, t) of the side surface point at height y and station z"""
    t = 0.5
    for _ in range(40):
        lo, hi = 0.0, 1.0
        for _ in range(40):
            m = (lo + hi) / 2
            if side(m, t, 1).z < z: lo = m
            else: hi = m
        s = (lo + hi) / 2
        lo, hi = -0.3, 1.3
        for _ in range(40):
            m = (lo + hi) / 2
            if side(s, m, 1).y < y: lo = m
            else: hi = m
        t = (lo + hi) / 2
    return s, t


def half_width(z, y): return side(*side_at(z, y), 1).x


def gun_at(z):
    """the sheer at station z: (half-width, height)"""
    lo, hi = 0.0, 1.0
    for _ in range(50):
        m = (lo + hi) / 2
        if side(m, 1.0, 1).z < z: lo = m
        else: hi = m
    g = side((lo + hi) / 2, 1.0, 1)
    return g.x, g.y


# ---------------------------------------------------------------- mesh helpers
OBJS = []


def new_obj(name, bm, mat, col=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(MATS[mat])
    # per-part tint, carried in the vertex colours
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d in ca.data: d.color = (col[0], col[1], col[2], 1.0)
    ob['part'] = name
    OBJS.append(ob)
    return ob


def grid(name, rows, uvs, mat, col=(1, 1, 1), outward=None, closed_u=False):
    """rows: list of lists of three-frame points; uvs: same shape of (u, v)"""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    vs = [[bm.verts.new(P(*p)) for p in row] for row in rows]
    n = len(rows[0])
    for i in range(len(rows) - 1):
        for j in range(n - (0 if closed_u else 1)):
            j2 = (j + 1) % n
            f = bm.faces.new((vs[i][j], vs[i][j2], vs[i + 1][j2], vs[i + 1][j]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i, j2), (i + 1, j2), (i + 1, j))):
                u = uvs[a][b]
                if closed_u and b == 0 and j2 == 0: u = (u[0] + 1.0 * uvs[a][n - 1][0] / max(1e-6, (n - 1) / n), u[1])
                lp[uvl].uv = u
    bm.normal_update()
    if outward is not None:
        flip = 0
        for f in bm.faces:
            c = f.calc_center_median()
            flip += 1 if f.normal.dot(outward(c)) < 0 else -1
        if flip > 0:
            for f in bm.faces: f.normal_flip()
    return new_obj(name, bm, mat, col)


def solidify(ob, th, offset=-1.0, bevel=0.0035, seg=2):
    m = ob.modifiers.new('sol', 'SOLIDIFY')
    m.thickness = th; m.offset = offset; m.use_even_offset = True; m.use_quality_normals = True
    if bevel:
        b = ob.modifiers.new('bev', 'BEVEL')
        b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(50)
        b.harden_normals = False


def frame_along(pts, up_hint):
    """per-point tangent frames for sweeping a profile along a path (three coords)"""
    out = []
    n = len(pts)
    for i in range(n):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]
        t = (b - a).normalized()
        u = up_hint(pts[i]) if callable(up_hint) else up_hint
        nrm = (u - t * u.dot(t)).normalized()
        bi = t.cross(nrm)
        out.append((t, nrm, bi))
    return out


def sweep(name, pts, prof, mat, col=(1, 1, 1), up=Vector((0, 1, 0)), cap=True, uscale=1.0, vscale=1.0, uoff=0.0, voff=0.0, scale=None):
    """pts: path in three coords (Vectors); prof: closed list of (a, b) offsets along (nrm, binormal)"""
    fr = frame_along(pts, up)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rings = []
    for i, (p, (t, nrm, bi)) in enumerate(zip(pts, fr)):
        k = scale(i / (len(pts) - 1)) if scale else 1.0
        rings.append([bm.verts.new(P(*(p + nrm * a * k + bi * b * k))) for a, b in prof])
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    per = [0.0]
    for k in range(1, len(prof) + 1):
        a0, b0 = prof[k - 1]; a1, b1 = prof[k % len(prof)]
        per.append(per[-1] + math.hypot(a1 - a0, b1 - b0))
    m = len(prof)
    for i in range(len(pts) - 1):
        for k in range(m):
            k2 = (k + 1) % m
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            for lp, (ii, kk) in zip(f.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                lp[uvl].uv = (uoff + per[kk] * uscale, voff + L[ii] * vscale)
    if cap:
        for ring in (rings[0], rings[-1][::-1]):
            f = bm.faces.new(ring[::-1] if ring is rings[0] else ring)
            for lp in f.loops: lp[uvl].uv = (uoff + lp.vert.co.x * uscale, voff + lp.vert.co.z * vscale)
    bm.normal_update()
    # outward check on the first ring
    c = sum((v.co for v in rings[0]), Vector()) / m
    bm.faces.ensure_lookup_table()
    f0 = bm.faces[0]
    if f0.normal.dot(f0.calc_center_median() - c) < 0:
        for f in bm.faces: f.normal_flip()
    return new_obj(name, bm, mat, col)


def rect(w, h, r=0.0):
    """rectangle profile, optionally with chamfered corners"""
    if r <= 0: return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for k in range(3):
            a = math.radians(a0 + k * 45)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circ(r, n=10): return [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def box(name, c, size, mat, col=(1, 1, 1), rot=None, uv_scale=0.8):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    uvl = bm.loops.layers.uv.verify()
    sx, sy, sz = size
    M = Matrix.Diagonal((sx, sz, sy, 1.0))  # three (x, y, z) sizes -> blender (x, -z, y)
    if rot is not None: M = rot @ M
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    # box-project UVs in metres, the grain (texture v) running along the part's longest side
    bm.normal_update()
    ext = (sx, sz, sy)
    off = (R.random(), R.random())
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        i, j = [k for k in range(3) if k != ax]
        ua, va = (i, j) if ext[j] >= ext[i] else (j, i)
        for lp in f.loops:
            co = lp.vert.co
            lp[uvl].uv = (off[0] + co[ua] * uv_scale, off[1] + co[va] * uv_scale)
    ob = new_obj(name, bm, mat, col)
    b = ob.modifiers.new('bev', 'BEVEL')
    b.width = min(0.006, min(size) * 0.18); b.segments = 2; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(50)
    return ob


def tint(base, var=0.08):
    k = 1 + R.uniform(-var, var)
    return (base[0] * k, base[1] * k * R.uniform(0.97, 1.03), base[2] * k * R.uniform(0.95, 1.05))


# ---------------------------------------------------------------- materials
MATS = {}


def img(path, colour=True):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return im


def pbr(name, diff=None, nor=None, rough=None, rough_val=0.8, metal=0.0, normal_strength=1.0, alpha=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    if diff:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(diff)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        nt.links.new(t.outputs['Color'], mix.inputs['A']); nt.links.new(vc.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    else:
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    if rough:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(rough, False)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = rough_val
    bsdf.inputs['Metallic'].default_value = metal
    if nor:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(nor, False)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    MATS[name] = m
    return m


pbr('wood', TEX + 'rough_wood_diff_2k.jpg', TEX + 'rough_wood_nor_gl_2k.jpg', TEX + 'rough_wood_rough_2k.jpg')
pbr('iron', TEX + 'rust_coarse_01_diff_2k.jpg', TEX + 'rust_coarse_01_nor_gl_2k.jpg', TEX + 'rust_coarse_01_rough_2k.jpg', metal=0.4)
pbr('toma', TEX + 'toma_color.jpg', TEX + 'Wicker013/Wicker013_2K-JPG_NormalGL.jpg', TEX + 'Wicker013/Wicker013_2K-JPG_Roughness.jpg')
pbr('straw', TEX + 'straw_color.jpg', TEX + 'ThatchedRoof002A/ThatchedRoof002A_2K-JPG_NormalGL.jpg', TEX + 'ThatchedRoof002A/ThatchedRoof002A_2K-JPG_Roughness.jpg')
pbr('rope', TEX + 'Rope001/Rope001_2K-JPG_Color.jpg', TEX + 'Rope001/Rope001_2K-JPG_NormalGL.jpg', TEX + 'Rope001/Rope001_2K-JPG_Roughness.jpg')
pbr('bamboo', TEX + 'bamboo_color.jpg', TEX + 'rough_wood_nor_gl_2k.jpg', None, rough_val=0.42, normal_strength=0.2)
pbr('cloth', TEX + 'rough_linen_diff_2k.jpg', TEX + 'rough_linen_nor_gl_2k.jpg', TEX + 'rough_linen_rough_2k.jpg')
pbr('lacquer', None, None, None, rough_val=0.28)
pbr('paper', TEX + 'chochin_paper.png', None, None, rough_val=0.7)

WOOD = (0.82, 0.74, 0.66)      # weathered sugi, a touch warmer than the grey of the texture
WOOD_FLOOR = (0.95, 0.88, 0.78)  # floor boards, scrubbed pale by feet
WOOD_DARK = (0.5, 0.42, 0.36)  # beams and rails, darkened with handling
IRON = (0.32, 0.27, 0.24)
TOMA = (0.94, 0.94, 0.94)
BAMBOO = (1.0, 1.0, 1.0)
ROPE = (0.86, 0.78, 0.62)
STRAW = (0.94, 0.94, 0.94)  # colour lives in the texture: COLOR_0 is u8, anything over 1 clamps

# ---------------------------------------------------------------- planks
NS = 150


TEX_M = 0.65  # wood texture tiles per metre


def strake(name, t0, t1, sx, voff):
    rows, uvs = [], []
    zoff = R.random() * 5
    for i in range(NS + 1):
        s = i / NS
        h = (side(s, t1, sx) - side(s, t0, sx)).length
        row, uvr = [], []
        for k in range(5):
            t = lerp(t0, t1, k / 4)
            p = side(s, t, sx)
            row.append(p)
            uvr.append((voff + k / 4 * h * TEX_M, zoff + p.z * TEX_M))
        rows.append(row); uvs.append(uvr)
    ob = grid(name, rows, uvs, 'wood', tint(WOOD), outward=lambda c: Vector((sx, 0, 0)))
    solidify(ob, 0.032, -1.0)
    return ob


SEAM = 0.5
for sx in (-1, 1):
    strake('side_lo_%d' % sx, 0.0, SEAM, sx, R.random())
    strake('side_hi_%d' % sx, SEAM, 1.0, sx, R.random())

# bottom: three planks laid lengthwise
for k in range(3):
    rows, uvs = [], []
    off = R.random()
    for i in range(NS + 1):
        s = i / NS
        cw, cy, cz = chine(s)
        row, uvr = [], []
        for j in range(3):
            a = lerp(-1 + k * 2 / 3, -1 + (k + 1) * 2 / 3, j / 2)
            row.append(Vector((a * cw, cy, cz)))
            uvr.append((off + a * cw * TEX_M, off * 3 + cz * TEX_M))
        rows.append(row); uvs.append(uvr)
    ob = grid('bottom_%d' % k, rows, uvs, 'wood', tint(WOOD), outward=lambda c: Vector((0, 0, -1)))
    solidify(ob, 0.045, -1.0)

# transom: three boards across the stern, top board standing proud of the sheer
for k in range(3):
    t0, t1 = k / 3, (k + 1) / 3 + (0.12 if k == 2 else 0)
    rows, uvs = [], []
    for j in range(3):
        t = lerp(t0, t1, j / 2)
        a, b = side(0, min(t, 1.0), -1), side(0, min(t, 1.0), 1)
        if t > 1.0:
            a = a + Vector((-0.02, (t - 1) * 0.6, -(t - 1) * 0.1)); b = b + Vector((0.02, (t - 1) * 0.6, -(t - 1) * 0.1))
        row = [a.lerp(b, q / 6) for q in range(7)]
        rows.append(row)
        uvs.append([(t * 0.25 + k * 0.37, lerp(a.x, b.x, q / 6) * TEX_M) for q in range(7)])
    ob = grid('transom_%d' % k, rows, uvs, 'wood', tint(WOOD_DARK, 0.05), outward=lambda c: Vector((0, 1, 0)))
    solidify(ob, 0.05, -1.0)

# stem post: the misaki, from the forefoot up past the sheer, with an iron cap
s_top = gunwale(1.0)
stem_pts = []
for k in range(13):
    u = k / 12
    p = side(1.0, u * 1.18, 1)
    stem_pts.append(Vector((0, p.y, p.z + 0.035)))
STEM_K = lambda u: 1.0 - 0.22 * ss(0.55, 1.0, u)
sweep('stem', stem_pts, rect(0.085, 0.11, 0.016), 'wood', tint(WOOD_DARK, 0.04), up=Vector((1, 0, 0)), uscale=0.5, vscale=0.5, scale=STEM_K)
# an iron collar where the sheer strakes end on the stem, and a slanted iron cap on its head
for u0, u1 in ((0.8, 0.86), (0.93, 1.0)):
    i0, i1 = int(u0 * 12), int(u1 * 12)
    seg = [stem_pts[0].lerp(stem_pts[-1], u0), stem_pts[0].lerp(stem_pts[-1], u1)]
    sweep('stem_iron', seg, rect(0.091, 0.117, 0.016), 'iron', IRON, up=Vector((1, 0, 0)), uscale=0.6, vscale=0.6, scale=lambda u, a=u0, b=u1: STEM_K(a + (b - a) * u) * 1.0)

# gunwale rails over the sheer strake
for sx in (-1, 1):
    pts = [side(i / NS, 1.0, sx) + Vector((sx * -0.004, 0.022, 0)) for i in range(NS + 1)]
    sweep('rail_%d' % sx, pts, rect(0.06, 0.045, 0.01), 'wood', tint(WOOD_DARK, 0.04), up=Vector((0, 1, 0)), uscale=TEX_M, vscale=TEX_M, uoff=R.random())

# funabari: crossbeams through both sides, their ends standing proud with a wedge
BEAMS = [-3.62, -2.6, -0.4, 1.1, 2.95]
for zb in BEAMS:
    yg = gun_at(zb)[1]
    yb = yg - 0.085
    hw = half_width(zb, yb)
    box('beam_%.2f' % zb, (0, yb, zb), (2 * hw + 0.13, 0.075, 0.095), 'wood', tint(WOOD_DARK, 0.05))
    for sx in (-1, 1):
        box('wedge', (sx * (hw + 0.05), yb + 0.0, zb + 0.06), (0.03, 0.06, 0.025), 'wood', tint(WOOD_DARK))

# floor: boards on low sleepers, butt-jointed in staggered lengths
FLOOR_Y = -0.05


def bottom_top(z):
    """height of the bottom planks' inner face at station z"""
    lo, hi = 0.0, 1.0
    for _ in range(50):
        m = (lo + hi) / 2
        if chine(m)[2] < z: lo = m
        else: hi = m
    return chine((lo + hi) / 2)[1] + 0.045


# the floor runs forward only as far as the rising bottom leaves room under it
FLOOR_END = -3.95
while bottom_top(FLOOR_END + 0.05) < FLOOR_Y - 0.03: FLOOR_END += 0.05
print('FLOOR_END', round(FLOOR_END, 2))
for zs in (-3.5, -2.8, -2.1, -1.4, -0.7, 0.0, 0.7, 1.4, 2.1, 2.7):
    if bottom_top(zs) > -0.15: continue
    hw = half_width(zs, -0.13) - 0.03
    box('sleeper', (0, -0.115, zs), (2 * hw, 0.07, 0.06), 'wood', tint(WOOD_DARK))
BW, GAP = 0.175, 0.008
for k in range(-4, 5):
    x0 = k * (BW + GAP) - BW / 2
    x1 = x0 + BW
    z = -3.95
    while z < FLOOR_END - 0.1:
        L = R.uniform(1.4, 2.6)
        z1 = min(z + L, FLOOR_END)
        rows, uvs = [], []
        zz = [lerp(z, z1, q / 16) for q in range(17)]
        ok = []
        for zq in zz:
            hw = half_width(zq, FLOOR_Y - 0.025) - 0.012
            a, b = max(x0, -hw), min(x1, hw)
            if b - a > 0.03: ok.append((zq, a, b))
        if len(ok) > 2:
            off = R.random()
            for zq, a, b in ok:
                rows.append([Vector((lerp(a, b, q / 2), FLOOR_Y, zq)) for q in range(3)])
                uvs.append([(off + lerp(a, b, q / 2) * TEX_M, zq * TEX_M) for q in range(3)])
            ob = grid('floor', rows, uvs, 'wood', tint(WOOD_FLOOR, 0.07), outward=lambda c: Vector((0, 0, 1)))
            solidify(ob, 0.024, -1.0, bevel=0.003)
        z = z1 + 0.006

# stern deck (ro-dai) and fore deck at the sheer
def deck(name, z0, z1, ylift):
    rows, uvs = [], []
    for q in range(9):
        zq = lerp(z0, z1, q / 8)
        y = gun_at(zq)[1] - ylift
        hw = half_width(zq, y) - 0.004
        rows.append([Vector((lerp(-hw, hw, j / 6), y, zq)) for j in range(7)])
        uvs.append([(lerp(-hw, hw, j / 6) * TEX_M, zq * TEX_M) for j in range(7)])
    ob = grid(name, rows, uvs, 'wood', tint(WOOD_FLOOR, 0.05), outward=lambda c: Vector((0, 0, 1)))
    solidify(ob, 0.035, -1.0)
    return ob


deck('stern_deck', -4.12, -3.58, 0.03)
deck('fore_deck', 3.3, 4.2, 0.03)

# the ro-beso: thole pin on its block at the stern quarter, a ball head the ro's socket rides on
PIN = Vector((0.42, 0.0, -3.85))
deck_y = gun_at(PIN.z)[1] - 0.03
box('pin_block', (PIN.x, deck_y + 0.03, PIN.z), (0.14, 0.06, 0.2), 'wood', tint(WOOD_DARK))
sweep('pin', [Vector((PIN.x, deck_y + 0.05, PIN.z)), Vector((PIN.x, 0.555, PIN.z))], circ(0.022, 12), 'wood', tint(WOOD_DARK), up=Vector((1, 0, 0)), uscale=0.5, vscale=0.5)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=0.032, calc_uvs=True)
bmesh.ops.translate(bm, vec=P(PIN.x, 0.57, PIN.z), verts=bm.verts)
new_obj('pin_head', bm, 'wood', tint(WOOD_DARK))
# an iron eye in the floor for the hayao
ROPE_FOOT = Vector((0.4, -0.04, -2.86))
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.03, radius2=0.03, depth=0.008)
bmesh.ops.translate(bm, vec=P(ROPE_FOOT.x, FLOOR_Y + 0.004, ROPE_FOOT.z), verts=bm.verts)
new_obj('eye_plate', bm, 'iron', IRON)
ring = [Vector((ROPE_FOOT.x + 0.022 * math.cos(a), FLOOR_Y + 0.012 + 0.022 * (1 + math.sin(a)), ROPE_FOOT.z)) for a in [k * math.pi / 8 - math.pi / 2 for k in range(17)]]
sweep('eye', ring, circ(0.005, 6), 'iron', IRON, up=Vector((0, 0, 1)), cap=False)

# nails: square heads in rows along the chine, the strake seam, the transom and the beam ends
NAILS = []
def nail(p, n):
    NAILS.append((p.copy(), n.copy()))
for sx in (-1, 1):
    for i in range(3, NS - 2, 4):
        s = i / NS
        for t in (0.035, SEAM - 0.03, SEAM + 0.03, 0.965):
            if t in (SEAM - 0.03, SEAM + 0.03) and (i // 4) % 2: continue
            p = side(s, t, sx)
            n = (side(s, t, sx) - side(s, t, sx * 0.999)).normalized() if False else Vector((sx, 0, 0))
            dp = side(s + 0.002, t, sx) - side(s, t, sx); dt = side(s, t + 0.01, sx) - side(s, t, sx)
            n = dp.cross(dt).normalized()
            if n.x * sx < 0: n = -n
            nail(p + n * 0.0015, n)
for k in range(9):
    for sx in (-1, 1):
        t = 0.06 + k * 0.11
        if t > 1.0: continue
        p = side(0.0, t, sx)
        p = p + Vector((-sx * 0.035, 0, -0.05))
        nail(p, Vector((0, 0, -1)))
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
for p, n in NAILS:
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r['verts']
    up = Vector((0, 1, 0)) if abs(n.y) < 0.9 else Vector((1, 0, 0))
    a = up.cross(n).normalized(); b = n.cross(a)
    rot = R.uniform(-0.3, 0.3)
    a, b = a * math.cos(rot) + b * math.sin(rot), b * math.cos(rot) - a * math.sin(rot)
    for v in vs:
        lx, ly, lz = v.co
        q = p + a * lx * 0.017 + b * ly * 0.017 + n * (lz + 0.5) * 0.004
        v.co = P(*q)
for f in bm.faces:
    for lp in f.loops: lp[uvl].uv = (lp.vert.co.x * 3, lp.vert.co.z * 3 + lp.vert.co.y * 3)
bm.normal_update()
new_obj('nails', bm, 'iron', IRON)

# ---------------------------------------------------------------- toma canopy
HOOPS = [-1.65, -0.85, -0.05, 0.75]
CAN_H = 0.86


def arch(z, lift=0.0, out=0.0, n=40, drop=0.0):
    gy = gun_at(z)[1]
    hw = half_width(z, gy) - 0.035 + out
    y0 = gy + 0.04
    pts = []
    for k in range(n + 1):
        a = math.pi * k / n
        x = -hw * math.cos(a)
        # a slightly flattened arch: steeper sides, broad crown
        y = y0 + (CAN_H + lift) * math.sin(a) ** 0.82 - drop * (1 - math.sin(a)) ** 4
        x *= 1 + lift * 0.4
        pts.append(Vector((x, y, z)))
    return pts


for z in HOOPS:
    pts = arch(z, 0.0)
    sweep('hoop', pts, circ(0.017, 8), 'bamboo', tint(BAMBOO, 0.06), up=Vector((0, 0, 1)), uscale=0.2, vscale=0.6)
    # nodes along the culm
    L = 0.0
    for k in range(1, len(pts) - 1):
        L += (pts[k] - pts[k - 1]).length
        if k % 9 == 4:
            sweep('node', [pts[k] - (pts[k + 1] - pts[k - 1]).normalized() * 0.006, pts[k] + (pts[k + 1] - pts[k - 1]).normalized() * 0.006], circ(0.0205, 10), 'bamboo', tint(BAMBOO, 0.04), up=Vector((0, 0, 1)))

# mats: four overlapping toma, shingled from the bow back so the rain runs aft, sagging between hoops
MAT_Z = [(-1.98, -1.02), (-1.18, -0.22), (-0.38, 0.58), (0.42, 1.05)]
FRINGE = []
for m, (za, zb) in enumerate(MAT_Z):
    rows, uvs = [], []
    nz = 24
    off = R.random()
    for q in range(nz + 1):
        z = lerp(za, zb, q / nz)
        sag = 0.0
        for h in HOOPS:
            pass
        d = min(abs(z - h) for h in HOOPS)
        sag = 0.018 * min(1.0, d / 0.4) ** 2
        lift = 0.03 + m % 2 * 0.012 - sag
        pts = arch(z, lift, out=0.035 + lift * 0.3, n=40, drop=0.06)
        rows.append(pts)
        L = 0.0
        uvr = []
        for k, p in enumerate(pts):
            if k: L += (p - pts[k - 1]).length
            uvr.append((off + L * 0.9, z * 0.9))
        uvs.append(uvr)
    ob = grid('toma_%d' % m, rows, uvs, 'toma', tint(TOMA, 0.06), outward=lambda c: Vector((0, 0, 1)))
    solidify(ob, 0.012, -1.0, bevel=0)
    # the cut ends of the reeds along both edges of every mat
    for q in (0, nz):
        for k in range(len(rows[q]) - 1):
            a, b = rows[q][k], rows[q][k + 1]
            for j in range(9):
                p = a.lerp(b, (j + R.random()) / 9)
                FRINGE.append((p, (1 if q == nz else -1), m))

bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
for p, d, m in FRINGE:
    L = R.uniform(0.025, 0.06)
    w = R.uniform(0.0025, 0.004)
    dirz = Vector((R.uniform(-0.25, 0.25), R.uniform(-0.6, -0.1), d)).normalized()
    side_v = Vector((1, 0, 0)) if abs(p.x) < 0.5 else Vector((0, 1, 0))
    q0 = p - side_v * w / 2; q1 = p + side_v * w / 2
    q2 = q1 + dirz * L; q3 = q0 + dirz * L
    vs = [bm.verts.new(P(*v)) for v in (q0, q1, q2, q3)]
    f = bm.faces.new(vs)
    u0 = R.random()
    for lp, uv in zip(f.loops, ((u0, 0), (u0 + 0.004, 0), (u0 + 0.004, L * 0.9), (u0, L * 0.9))): lp[uvl].uv = uv
bm.normal_update()
new_obj('toma_fringe', bm, 'toma', tint(TOMA, 0.02))

# straw rope ties over the mats at every hoop, and a bamboo ridge pole along the crown
for z in HOOPS:
    pts = arch(z + 0.02, 0.058, out=0.05, n=40, drop=0.06)
    sweep('tie', pts, circ(0.0095, 8), 'rope', ROPE, up=Vector((0, 0, 1)), uscale=9.0, vscale=5.0)
ridge = [Vector((0, arch(z, 0.07, n=2)[1].y, z)) for z in [lerp(-2.0, 1.06, k / 20) for k in range(21)]]
sweep('ridge', ridge, circ(0.02, 10), 'bamboo', tint(BAMBOO), up=Vector((0, 1, 0)), uscale=0.2, vscale=0.6)

# ---------------------------------------------------------------- cargo
def tawara(c, axis_rot):
    """a rice bale: a barrel of straw, round lids at both ends, three bands and two running ropes"""
    rot = Matrix.Rotation(axis_rot, 4, 'Z')  # blender z = three y: turns the bale in plan
    def X(p): return Vector(T3(rot @ P(*p))) + c
    prof = []
    rows, uvs = [], []
    nL, nA = 16, 24
    for i in range(nL + 1):
        u = i / nL
        zz = lerp(-0.3, 0.3, u)
        r = 0.152 + 0.025 * math.sin(math.pi * u) ** 0.7
        row, uvr = [], []
        for k in range(nA + 1):
            a = 2 * math.pi * k / nA
            row.append(X(Vector((r * math.cos(a), r * math.sin(a), zz))))
            uvr.append((k / nA * 1.0, u * 0.6))
        rows.append(row); uvs.append(uvr)
    grid('bale', rows, uvs, 'straw', tint(STRAW, 0.06), outward=lambda p: p - c)
    for e in (-1, 1):
        rows, uvs = [], []
        for i in range(5):
            r = 0.155 * (1 - i / 4)
            zz = e * (0.3 + 0.03 * (1 - (i / 4) ** 2))
            row, uvr = [], []
            for k in range(nA + 1):
                a = 2 * math.pi * k / nA
                row.append(X(Vector((r * math.cos(a), r * math.sin(a), zz))))
                uvr.append((k / nA, 0.2 + r * 2))
            rows.append(row); uvs.append(uvr)
        grid('lid', rows, uvs, 'straw', tint(STRAW, 0.05), outward=lambda p, e=e: Vector(T3(rot @ P(0, 0, e))))
    for zz in (-0.2, 0.0, 0.2):
        r = 0.152 + 0.025 * math.sin(math.pi * (zz + 0.3) / 0.6) ** 0.7 + 0.006
        pts = [X(Vector((r * math.cos(a), r * math.sin(a), zz))) for a in [2 * math.pi * k / 32 for k in range(33)]]
        sweep('band', pts, circ(0.008, 6), 'rope', ROPE, up=lambda p: p - c, cap=False, uscale=9.0, vscale=5.0)
    for a in (0.6, 0.6 + math.pi):
        pts = []
        for i in range(17):
            u = i / 16
            zz = lerp(-0.34, 0.34, u)
            r = (0.152 + 0.025 * math.sin(math.pi * min(max((zz + 0.3) / 0.6, 0), 1)) ** 0.7 + 0.008) if abs(zz) < 0.3 else 0.16 * (1 - (abs(zz) - 0.3) / 0.06)
            pts.append(X(Vector((r * math.cos(a), r * math.sin(a), zz))))
        sweep('rope', pts, circ(0.007, 6), 'rope', ROPE, up=lambda p: p - c, cap=True, uscale=9.0, vscale=5.0)


tawara(Vector((-0.24, FLOOR_Y + 0.17, -1.15)), 0.04)
tawara(Vector((0.23, FLOOR_Y + 0.17, -1.05)), -0.06)
tawara(Vector((0.0, FLOOR_Y + 0.17, -0.35)), 1.52)

# a furoshiki bundle tied at the top
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)
for v in bm.verts:
    x, y, z = v.co
    k = 1 - 0.18 * (abs(x * 2) ** 4 + abs(y * 2) ** 4) * 0.5
    v.co = Vector((x * 0.34 * k, y * 0.28 * k, (z + 0.5) * 0.17))
bmesh.ops.translate(bm, vec=P(0.05, FLOOR_Y, 0.3), verts=bm.verts)
uvl = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    for lp in f.loops: lp[uvl].uv = (lp.vert.co.x * 2 + lp.vert.co.z, lp.vert.co.y * 2)
bm.normal_update()
new_obj('bundle', bm, 'cloth', (0.2, 0.24, 0.36))
for sx in (-1, 1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0, calc_uvs=True)
    bmesh.ops.scale(bm, vec=(0.045, 0.02, 0.03), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(sx * 0.6, 3, 'Y'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=P(0.05 + sx * 0.04, FLOOR_Y + 0.19, 0.3), verts=bm.verts)
    new_obj('knot', bm, 'cloth', (0.2, 0.24, 0.36))

# ---------------------------------------------------------------- lantern pole and arm on the fore deck
LANT = Vector((0, 1.82, 4.18))
POLE_Z = 3.75
pole_y0 = gun_at(POLE_Z)[1] - 0.03
sweep('lpole', [Vector((0, pole_y0 - 0.05, POLE_Z)), Vector((0, 2.2, POLE_Z))], circ(0.024, 10), 'bamboo', tint(BAMBOO), up=Vector((1, 0, 0)), uscale=0.2, vscale=0.6)
sweep('larm', [Vector((0, 2.15, POLE_Z - 0.03)), Vector((0, 2.15, 4.24))], circ(0.016, 8), 'bamboo', tint(BAMBOO), up=Vector((1, 0, 0)), uscale=0.2, vscale=0.6)
sweep('llash', [Vector((0.026 * math.cos(a), 2.15 + 0.026 * math.sin(a), POLE_Z)) for a in [k * math.pi / 6 for k in range(13)]], circ(0.005, 6), 'rope', ROPE, up=Vector((0, 0, 1)), cap=False, uscale=9.0, vscale=5.0)
sweep('lcord', [Vector((0, 2.14, 4.18)), Vector((0, 2.07, 4.18))], circ(0.003, 5), 'rope', (0.3, 0.25, 0.2), up=Vector((1, 0, 0)))

hull_objs = list(OBJS)

# ---------------------------------------------------------------- the lantern itself (its own node: it glows)
OBJS.clear()
rows, uvs = [], []
nH, nA = 48, 32
for i in range(nH + 1):
    u = i / nH
    y = lerp(1.62, 2.02, u)
    r = 0.095 + 0.075 * math.sin(math.pi * u) ** 0.8
    r += 0.0035 * (0.5 + 0.5 * math.cos(u * 22 * 2 * math.pi))  # the bamboo ribs under the paper
    row, uvr = [], []
    for k in range(nA + 1):
        a = 2 * math.pi * k / nA
        row.append(Vector((LANT.x + r * math.cos(a), y, LANT.z + r * math.sin(a))))
        uvr.append((k / nA, u))
    rows.append(row); uvs.append(uvr)
grid('lantern_paper', rows, uvs, 'paper', (1, 1, 1), outward=lambda p: Vector(T3(p)) - Vector((LANT.x, Vector(T3(p)).y, LANT.z)))
lantern_objs = list(OBJS)
OBJS.clear()
for y0, y1 in ((1.585, 1.63), (2.01, 2.055)):
    pts = [Vector((LANT.x, y0, LANT.z)), Vector((LANT.x, y1, LANT.z))]
    sweep('lring', pts, circ(0.1, 24), 'lacquer', (0.035, 0.03, 0.03), up=Vector((1, 0, 0)))
handle = [Vector((LANT.x + 0.09 * math.cos(a), 2.055 + 0.03 * math.sin(a), LANT.z)) for a in [k * math.pi / 10 for k in range(11)]]
sweep('lhandle', handle, circ(0.004, 5), 'iron', IRON, up=Vector((0, 0, 1)), cap=True)
hull_objs += OBJS

# ---------------------------------------------------------------- the ro (its own node, pivot at the origin)
OBJS.clear()
def cr(pts, n=6):
    """catmull-rom through pts"""
    out = []
    P_ = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P_) - 2):
        p0, p1, p2, p3 = P_[i - 1], P_[i], P_[i + 1], P_[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


ude = cr([Vector((0, 0.38, 0.97)), Vector((0, 0.2, 0.5)), Vector((0, 0.0, 0.0)), Vector((0, -0.6, -1.7)), Vector((0, -0.7, -1.95))], 8)
side_up = Vector((1, 0, 0))
prof = rect(0.048, 0.062, 0.012)
sweep('ude', ude, prof, 'wood', tint((0.9, 0.82, 0.72), 0.03), up=side_up, uscale=0.5, vscale=0.5)
# the ireko: a block under the loom at the pivot, hollowed where the pin's ball sits
box('ireko', (0, -0.028, 0.0), (0.06, 0.05, 0.2), 'wood', tint(WOOD_DARK), rot=Matrix.Rotation(math.atan2(0.36, 0.92), 4, 'X'))
# the ro-zuka: the peg at the head the left hand pulls on
sweep('rozuka', [Vector((0, 0.3, 0.92)), Vector((0, 0.43, 0.925))], circ(0.017, 10), 'wood', tint(WOOD_DARK), up=side_up)
# the blade: a long board scarfed onto the loom, lashed and banded at the joint
blade_dir = (Vector((0, -1.25, -3.1)) - Vector((0, -0.6, -1.7))).normalized()
nrm = Vector((1, 0, 0)).cross(blade_dir).normalized()
b0 = Vector((0, -0.6, -1.7)) - blade_dir * 0.25
rows, uvs = [], []
for i in range(25):
    u = i / 24
    c = b0 + blade_dir * (u * 1.8)
    w = 0.06 + 0.11 * ss(0.0, 0.3, u) - 0.03 * ss(0.85, 1.0, u)
    th = 0.03 - 0.012 * u
    row = []
    for a, b in ((-th / 2, -w / 2), (th / 2, -w / 2), (th / 2, w / 2), (-th / 2, w / 2)):
        row.append(c + Vector((a, 0, 0)) + nrm * b)
    rows.append(row)
    uvs.append([(0.0, u * 0.9), (0.02, u * 0.9), (0.12, u * 0.9), (0.14, u * 0.9)])
ob = grid('ha', rows, uvs, 'wood', tint((0.78, 0.7, 0.62), 0.03), closed_u=True)
for k, d in enumerate((0.0, 0.08, 0.16)):
    c = Vector((0, -0.6, -1.7)) - blade_dir * (0.18 - d)
    pts = [c + Vector((0.03 * math.cos(a), 0, 0)) + nrm * (0.05 * math.sin(a)) for a in [j * math.pi / 8 for j in range(17)]]
    sweep('lash', pts, circ(0.006, 6), 'rope', ROPE, up=blade_dir, cap=False, uscale=9.0, vscale=5.0)
for d in (-0.05, 0.26):
    c = Vector((0, -0.6, -1.7)) - blade_dir * d
    pts = [c + Vector((0.029 * math.cos(a), 0, 0)) + nrm * (0.045 * math.sin(a)) for a in [j * math.pi / 8 for j in range(17)]]
    sweep('band', pts, rect(0.004, 0.022), 'iron', IRON, up=blade_dir, cap=False)
ro_objs = list(OBJS)

# ---------------------------------------------------------------- apply, join, shade
def finish(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        # one UV set per part, all under the same name, so the join doesn't spawn extra layers
        uvs = o.data.uv_layers
        if len(uvs) == 0: uvs.new(name='UVMap')
        keep = uvs[0]
        for l in list(uvs)[1:]: uvs.remove(l)
        uvs[0].name = 'UVMap'
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    return ob


hull = finish(hull_objs, 'hull')
lantern = finish(lantern_objs, 'lantern')
ro = finish(ro_objs, 'ro')
# the ro bakes into its own small atlas, so it wears its own copies of the shared materials
for i, m in enumerate(ro.data.materials):
    c = m.copy(); c.name = 'ro_' + m.name
    ro.data.materials[i] = c

# ---------------------------------------------------------------- ambient occlusion baked into a second UV set
if BAKE:
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable', e)
    sc.cycles.samples = 96
    for ob in (hull, ro):
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        uv = ob.data.uv_layers.new(name='AO')
        ob.data.uv_layers.active = uv
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(margin=0.003)
        bpy.ops.object.mode_set(mode='OBJECT')
        size = 2048 if ob is hull else 512
        aoimg = bpy.data.images.new(ob.name + '_ao', size, size, alpha=False, float_buffer=False)
        aoimg.colorspace_settings.name = 'Non-Color'
        for mat in ob.data.materials:
            nt = mat.node_tree
            n = nt.nodes.new('ShaderNodeTexImage'); n.image = aoimg; n.name = 'AOBAKE'
            uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'AO'
            nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
            nt.nodes.active = n
        uv_main = ob.data.uv_layers['UVMap']
        uv_main.active_render = True
        sc.render.bake.margin = 6
        bpy.ops.object.bake(type='AO')
        aoimg.filepath_raw = OUT.replace('.glb', '_%s_ao.png' % ob.name)
        aoimg.file_format = 'PNG'
        aoimg.save()
        # glTF occlusion: a 'glTF Material Output' group with the AO image on the second UV set
        grp = bpy.data.node_groups.get('glTF Material Output')
        if grp is None:
            grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
            grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        for mat in ob.data.materials:
            nt = mat.node_tree
            n = nt.nodes['AOBAKE']
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(n.outputs['Color'], sep.inputs['Color'])
            g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp
            nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
        uv_main.active = True

# ---------------------------------------------------------------- report and export
info = {}
for ob in (hull, lantern, ro):
    me = ob.data
    info[ob.name] = {'tris': sum(len(p.vertices) - 2 for p in me.polygons), 'mats': [m.name for m in me.materials]}
# the waterline: the hull's outer half-width at y = 0 along its length, for the river's discard
wl = []
for k in range(36):
    z = lerp(-4.1, 4.2, k / 35)
    try:
        s, t = side_at(z, 0.0)
        wl.append(round(side(s, t, 1).x if 0 <= t <= 1 and 0 <= s <= 1 else 0.0, 3))
    except Exception:
        wl.append(0.0)
info['waterline'] = {'z0': -4.1, 'z1': 4.2, 'hw': wl}
info['pin_top'] = 0.6
print('BOATINFO ' + json.dumps(info))
json.dump(info, open(OUT.replace('.glb', '_info.json'), 'w'))
bpy.ops.object.select_all(action='DESELECT')
for ob in (hull, lantern, ro): ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_image_format='AUTO',
                          export_texcoords=True, export_normals=True, export_materials='EXPORT')
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
