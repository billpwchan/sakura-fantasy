# garment building blocks: body-region shells, bands, sweeps, cloth-simulated panels
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from common import *


def link(o):
    bpy.context.scene.collection.objects.link(o)
    return o


def dominant(o):
    """vertex index -> name of the group with the largest weight"""
    gi = {g.index: g.name for g in o.vertex_groups}
    rig_bones = None
    out = {}
    for v in o.data.vertices:
        best, bw = None, 0
        for g in v.groups:
            n = gi[g.group]
            if g.weight > bw and n not in ('body', 'Mid', 'Left', 'Right') and not n.startswith(('helper', 'joint')):
                best, bw = n, g.weight
        out[v.index] = best
    return out


def region_copy(body, name, keep):
    """a copy of the body (world space, no modifiers) keeping only vertices whose dominant bone passes keep(bone, co)"""
    me = body.data.copy()
    o = link(bpy.data.objects.new(name, me))
    o.matrix_world = body.matrix_world.copy()
    dom = dominant(body)
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    mw = body.matrix_world
    kill = [v for v in bm.verts if not keep(dom[v.index], mw @ v.co)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(me); bm.free()
    o.vertex_groups.clear()
    apply_xf(o)
    return o


def apply_xf(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def inflate(o, d):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * d
    bm.to_mesh(o.data); bm.free()


def hull_of(points, name):
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me))


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def mod_apply(o, kind, **kw):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    m = o.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    bpy.ops.object.modifier_apply(modifier=m.name)


def voxel(o, size):
    o.data.remesh_voxel_size = size
    o.data.use_remesh_fix_poles = True
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.voxel_remesh()


def push_out(o, target, gap, max_dist=None):
    """move every vertex of o that is closer than gap to (or inside) target out to gap along the target normal;
    max_dist limits it to vertices near the target (needed for open targets, whose 'inside' is only local)"""
    bvh = BVHTree.FromObject(target, bpy.context.evaluated_depsgraph_get())
    mw_t = target.matrix_world
    inv_t = mw_t.inverted()
    for v in o.data.vertices:
        p = inv_t @ (o.matrix_world @ v.co)
        loc, n, i, d = bvh.find_nearest(p) if max_dist is None else bvh.find_nearest(p, max_dist)
        if loc is None:
            continue
        inside = (p - loc).dot(n) < 0
        if inside or d < gap:
            v.co = o.matrix_world.inverted() @ (mw_t @ (loc + n * gap))


def smooth(o, factor, iters):
    mod_apply(o, 'SMOOTH', factor=factor, iterations=iters)


def delete_where(o, fn):
    bm = bmesh.new(); bm.from_mesh(o.data)
    kill = [v for v in bm.verts if fn(o.matrix_world @ v.co)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(o.data); bm.free()


def transfer_weights(o, body, rig):
    """skin o to rig with the body's weights (nearest face, interpolated)"""
    for g in body.vertex_groups:
        if g.name in rig.data.bones:
            o.vertex_groups.new(name=g.name)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('wt', 'DATA_TRANSFER')
    m.object = body
    m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}
    m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'
    m.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.modifier_apply(modifier=m.name)
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    a = o.modifiers.new('Armature', 'ARMATURE')
    a.object = rig


def material(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def set_mat(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)


def grid_mesh(name, P, nu, nv, wrap_v=False, wrap_u=False, uv=None):
    """quad mesh from a point function P(i, j) on an (nu+1) x (nv+1) grid; optional wrap in v (closed tube) and uv(i, j)"""
    bm = bmesh.new()
    vs = {}
    ni = nu if wrap_u else nu + 1
    nj = nv if wrap_v else nv + 1
    for i in range(ni):
        for j in range(nj):
            vs[i, j] = bm.verts.new(P(i, j))
    uvl = bm.loops.layers.uv.new('UVMap')
    for i in range(nu):
        for j in range(nv):
            i1 = (i + 1) % ni; j1 = (j + 1) % nj
            f = bm.faces.new((vs[i, j], vs[i1, j], vs[i1, j1], vs[i, j1]))
            if uv:
                for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                    loop[uvl].uv = uv(a, b)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me))


# ---- shared by the figure dress scripts
def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def static_copy(src, name):
    """the evaluated (posed) mesh of src as a new object with its transform baked in (BVHTree works in local space)"""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(src.evaluated_get(dg))
    me.transform(src.matrix_world)
    return link(bpy.data.objects.new(name, me))


def bvh(o):
    assert o.matrix_world == Matrix(), o.name
    return BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())


def catmull(points, step):
    """resample a polyline through points as a Catmull-Rom curve at roughly step spacing"""
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


def ribbon(name, path, width, tree, off, s, ncross=8, steps=4, offi=None):
    """a band whose inner edge follows path, laid across the surface by walking away from the edge in small steps;
    uv: u = metres along the path, v = 0..1 across"""
    offf = off if callable(off) else (lambda p, _o=off: _o)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rows = []
    along = [0.0]
    for i in range(1, len(path)):
        along.append(along[-1] + (path[i] - path[i - 1]).length)
    for i, p in enumerate(path):
        a = path[max(i - 1, 0)]; b = path[min(i + 1, len(path) - 1)]
        t = (b - a).normalized()
        q, n = on_surface(tree, p, 0.0)
        o_ = offi(i) if offi else offf(p)
        row = [bm.verts.new(q + n * o_)]
        h = width / (ncross * steps)
        for k in range(ncross * steps):
            side = (n.cross(t) * s)
            side = (side - n * side.dot(n)).normalized()
            q, n = on_surface(tree, q + side * h, 0.0)
            if (k + 1) % steps == 0:
                row.append(bm.verts.new(q + n * o_))
        rows.append(row)
    for i in range(len(rows) - 1):
        for k in range(ncross):
            vs = (rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1])
            uvs = ((along[i], k / ncross), (along[i + 1], k / ncross), (along[i + 1], (k + 1) / ncross), (along[i], (k + 1) / ncross))
            if s < 0:
                vs, uvs = vs[::-1], uvs[::-1]
            f = bm.faces.new(vs)
            for lp, uv in zip(f.loops, uvs):
                lp[uvl].uv = uv
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


def rbox(name, c, size, e=0.35, n=24, uvh=0.1):
    """a rounded box (superellipsoid), uv in uvh units"""
    def P(i, j):
        th = i / n * math.pi
        ph = j / n * 2 * math.pi
        return c + Vector((spow(math.sin(th) * math.cos(ph), e) * size[0] / 2, spow(math.sin(th) * math.sin(ph), e) * size[1] / 2,
                           spow(math.cos(th), e) * size[2] / 2))
    return grid_mesh(name, P, n, n, wrap_v=True, uv=lambda i, j: (j / n * (size[0] + size[1]) * 2 / uvh, 1 - i / n * size[2] / uvh))


def ellipsoid(name, c, ax, n=28):
    """ax: list of (axis vector, radius)"""
    def P(i, j):
        th = i / n * math.pi
        ph = j / n * 2 * math.pi
        a, b, cc = ax
        return c + a[0] * a[1] * math.sin(th) * math.cos(ph) + b[0] * b[1] * math.sin(th) * math.sin(ph) + cc[0] * cc[1] * math.cos(th)
    return grid_mesh(name, P, n, n, wrap_v=True, uv=lambda i, j: (j / n, i / n))


def tilt(v, axis, deg):
    from mathutils import Quaternion
    return (Quaternion(axis, math.radians(deg)) @ v).normalized()


def cut(o, co, no, region=None):
    """remove the part of o on the +no side of the plane through co, cutting faces cleanly along it; region(p)
    limits the cut to faces whose vertices all pass it (world = local here)"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    if region:
        fs = [f for f in bm.faces if all(region(v.co) for v in f.verts)]
        es = list({e for f in fs for e in f.edges})
        vs = list({v for f in fs for v in f.verts})
        geom = vs + es + fs
    else:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True, dist=1e-5)
    bm.to_mesh(o.data); bm.free()


def cut_field(o, f):
    """remove where f(p) > 0, splitting the faces along the zero isoline so the new edge is clean"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    val = {v: f(v.co) for v in bm.verts}
    for v, x in val.items():
        if abs(x) < 1e-7:
            val[v] = -1e-7
    zero = []
    for e in list(bm.edges):
        a, b = e.verts
        fa, fb = val[a], val[b]
        if (fa > 0) != (fb > 0):
            _, nv = bmesh.utils.edge_split(e, a, fa / (fa - fb))
            val[nv] = 0.0
            zero.append(nv)
    for fc in list(bm.faces):
        zs = [v for v in fc.verts if val[v] == 0.0]
        if len(zs) == 2:
            bmesh.utils.face_split(fc, zs[0], zs[1])
    bmesh.ops.delete(bm, geom=[fc for fc in bm.faces if sum(val[v] for v in fc.verts) > 0], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free()


def boundary_loops(o):
    """ordered vertex positions of each boundary loop"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    nb = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts
            nb.setdefault(a.index, []).append(b.index)
            nb.setdefault(b.index, []).append(a.index)
    co = {v.index: v.co.copy() for v in bm.verts}
    bm.free()
    seen, loops = set(), []
    for start in nb:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while cur not in seen:
            seen.add(cur); loop.append(co[cur])
            nxt = [n for n in nb[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
        loops.append(loop)
    return loops


def resample(path, step, closed=False):
    pts = path + ([path[0]] if closed else [])
    out = [pts[0].copy()]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        L = (b - a).length
        while acc + L >= step:
            t = (step - acc) / L
            a = a.lerp(b, t)
            L = (b - a).length
            out.append(a.copy())
            acc = 0.0
        acc += L
    return out
