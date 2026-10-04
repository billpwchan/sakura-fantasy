# Foliage atlas cells from photoscanned plants: the scan's own colour (unlit), ambient occlusion and the surface normal
# in the card's frame, each cell framed to a fixed size in metres so the game can draw its card at true scale.
# Cameras look along +y (image right = +x, image up = +z); arrangements are built around the origin.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Quaternion
import numpy as np
import OpenImageIO as oiio


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(src, keep=None, drop=('Material.001',), name='part', metric=True, alpha=None):
    """import a scan, keep only faces whose material name contains one of `keep` (all when None), joined into one
    mesh with transforms applied; returns the object (hidden from render, used as instance data)"""
    before = set(o.name for o in bpy.data.objects)
    # a second scan in the same scene would get its materials renamed (Material -> Material.001) and lose its body to
    # the checker filter: park the names already taken
    for m in bpy.data.materials:
        if not m.name.startswith('~'):
            m.name = '~' + m.name
    bpy.ops.import_scene.gltf(filepath=src)
    objs = [o for o in bpy.data.objects if o.name not in before and o.type == 'MESH']
    # the scans include a colour checker 1 cm across: it gives the scale in metres
    ck = None
    for o in objs:
        for f in o.data.polygons:
            m = o.data.materials[f.material_index] if f.material_index < len(o.data.materials) else None
            if m and 'Material.001' in m.name:
                pts = [o.matrix_world @ o.data.vertices[i].co for i in f.vertices]
                ck = pts if ck is None else ck + pts
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        mats = o.data.materials
        dead = []
        for f in bm.faces:
            m = mats[f.material_index] if f.material_index < len(mats) else None
            n = m.name if m else ''
            if any(d in n for d in drop) or (keep and not any(k in n for k in keep)):
                dead.append(f)
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        bm.to_mesh(o.data)
        bm.free()
    objs = [o for o in objs if len(o.data.polygons)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [x for x in bpy.data.objects if x.name not in before and x != ob]:
        bpy.data.objects.remove(o)
    if alpha:
        # an alpha map shipped beside the glTF rather than in it
        img = bpy.data.images.load(alpha)
        img.colorspace_settings.name = 'Non-Color'
        for m in ob.data.materials:
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            col = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and bsdf.inputs['Base Color'].is_linked and bsdf.inputs['Base Color'].links[0].from_node == n), None)
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = img
            if col and col.inputs['Vector'].is_linked:
                nt.links.new(col.inputs['Vector'].links[0].from_socket, t.inputs['Vector'])
            nt.links.new(t.outputs['Color'], bsdf.inputs['Alpha'])
    if ck and metric:
        a = Vector(map(min, *ck)) if len(ck) > 1 else ck[0]
        b = Vector(map(max, *ck))
        k = 0.01 / max(b - a)
        ob.data.transform(Matrix.Scale(k, 4))
        ob.data.update()
    ob.name = name
    ob.hide_render = True
    return ob


def islands(ob, gap):
    """split a part into plants: loose pieces whose bases (lowest points) lie within `gap` of each other join up
    (asset sheets lay several plants out in a row); each plant is re-centred on its base"""
    base = ob.name
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.mesh.separate(type='LOOSE')
    pieces = list(bpy.context.selected_objects)
    foot = []
    for o in pieces:
        v = verts(o)
        foot.append(v[v[:, 2].argmin()][:2].copy())
    foot = np.array(foot)
    lab = list(range(len(pieces)))

    def find(i):
        while lab[i] != i:
            lab[i] = lab[lab[i]]
            i = lab[i]
        return i
    for i in range(len(pieces)):
        d = np.linalg.norm(foot - foot[i], axis=1)
        for j in np.nonzero(d < gap)[0]:
            a, b = find(i), find(int(j))
            if a != b:
                lab[a] = b
    groups = {}
    for i, o in enumerate(pieces):
        groups.setdefault(find(i), []).append(o)
    out = []
    for i, g in enumerate(sorted(groups.values(), key=lambda g: min(verts(o)[:, 0].min() for o in g))):
        bpy.ops.object.select_all(action='DESELECT')
        for o in g:
            o.select_set(True)
        bpy.context.view_layer.objects.active = g[0]
        if len(g) > 1:
            bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = f'{base}{i}'
        j.hide_render = True
        recentre(j)
        out.append(j)
    return out


def recentre(ob):
    """origin to the plant's foot: the centre of its lowest few millimetres, at ground level"""
    v = verts(ob)
    z0 = v[:, 2].min()
    low = v[v[:, 2] < z0 + 0.01]
    c = low.mean(axis=0)
    ob.data.transform(Matrix.Translation(Vector((-c[0], -c[1], -z0))))
    ob.data.update()
    ob.location = (0, 0, 0)


def verts(ob):
    co = np.empty(len(ob.data.vertices) * 3, dtype=np.float32)
    ob.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def normalise(ob, foot, tip, length, roll=0.0):
    """move `foot` to the origin, point foot->tip along +z, scale so that distance is `length` metres"""
    foot, tip = Vector(foot), Vector(tip)
    axis = tip - foot
    q = axis.normalized().rotation_difference(Vector((0, 0, 1)))
    M = Matrix.Rotation(roll, 4, 'Z') @ Matrix.Scale(length / axis.length, 4) @ q.to_matrix().to_4x4() @ Matrix.Translation(-foot)
    ob.data.transform(M)
    ob.data.update()


def inst(ob, loc=(0, 0, 0), rot=None, s=1.0):
    """a linked copy of a part; rot is a Quaternion"""
    c = bpy.data.objects.new(ob.name + '_i', ob.data)
    bpy.context.scene.collection.objects.link(c)
    c.rotation_mode = 'QUATERNION'
    c.rotation_quaternion = rot or Quaternion()
    c.location = loc
    c.scale = (s, s, s)
    return c


def aim(d, roll):
    """rotation taking +z to d, then turned by roll about d"""
    d = Vector(d).normalized()
    return Quaternion(d, roll) @ Vector((0, 0, 1)).rotation_difference(d)


def twig(pts, r0, r1, col=(0.075, 0.06, 0.055)):
    cu = bpy.data.curves.new('twig', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 3
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
        sp.points[i].radius = r0 + (r1 - r0) * i / (len(pts) - 1)
    o = bpy.data.objects.new('twig', cu)
    bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new('bark')
    m.use_nodes = True
    o.data.materials.append(m)
    m['flat'] = col
    return o


# ------------------------------------------------------------------ passes

def _sources(m):
    """(colour source socket or None, alpha source socket or None, normal source socket or None, flat colour)"""
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if 'flat' in m:
        return None, None, None, m['flat']
    if bsdf is None:
        # KHR_materials_unlit, as the scans come: an emission fed by the base colour image
        img = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
        return (img.outputs['Color'] if img else None), None, None, (0.5, 0.5, 0.5)
    bc = bsdf.inputs['Base Color']
    col = bc.links[0].from_socket if bc.is_linked else None
    al = bsdf.inputs['Alpha'].links[0].from_socket if bsdf.inputs['Alpha'].is_linked else None
    nr = bsdf.inputs['Normal'].links[0].from_socket if bsdf.inputs['Normal'].is_linked else None
    flat = tuple(bc.default_value)[:3]
    return col, al, nr, flat


def _rebuild(m, kind):
    nt = m.node_tree
    if 'src' not in m:
        col, al, nr, flat = _sources(m)
        m['src'] = 1
        m['_flat'] = flat
        # keep references by naming the source nodes
        for tag, s in (('C', col), ('A', al), ('N', nr)):
            if s is not None:
                s.node.label = s.node.label + tag
                m['sock' + tag] = [s.node.name, s.name]
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    for n in [n for n in nt.nodes if n.get('pass')]:
        nt.nodes.remove(n)

    def sock(tag):
        k = 'sock' + tag
        if k not in m:
            return None
        nn, sn = m[k]
        return nt.nodes[nn].outputs[sn]

    def node(t):
        n = nt.nodes.new(t)
        n['pass'] = 1
        return n

    em = node('ShaderNodeEmission')
    if kind == 'col':
        c = sock('C')
        if c is not None:
            nt.links.new(c, em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = (*m['_flat'], 1)
    elif kind == 'ao':
        ao = node('ShaderNodeAmbientOcclusion')
        ao.inputs['Distance'].default_value = AO_DIST
        ao.samples = 16
        nt.links.new(ao.outputs['AO'], em.inputs['Color'])
    else:
        geo = node('ShaderNodeNewGeometry')
        nsrc = sock('N') or geo.outputs['Normal']
        vt = node('ShaderNodeVectorTransform')
        vt.vector_type = 'NORMAL'
        vt.convert_from = 'WORLD'
        vt.convert_to = 'CAMERA'
        nt.links.new(nsrc, vt.inputs['Vector'])
        sg = node('ShaderNodeMath')
        sg.operation = 'MULTIPLY_ADD'
        nt.links.new(geo.outputs['Backfacing'], sg.inputs[0])
        sg.inputs[1].default_value = -2.0
        sg.inputs[2].default_value = 1.0
        fl = node('ShaderNodeVectorMath')
        fl.operation = 'SCALE'
        nt.links.new(vt.outputs['Vector'], fl.inputs[0])
        nt.links.new(sg.outputs[0], fl.inputs['Scale'])
        enc = node('ShaderNodeVectorMath')
        enc.operation = 'MULTIPLY_ADD'
        nt.links.new(fl.outputs['Vector'], enc.inputs[0])
        enc.inputs[1].default_value = (0.5, 0.5, 0.5)
        enc.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(enc.outputs['Vector'], em.inputs['Color'])
    a = sock('A')
    if a is not None:
        mix = node('ShaderNodeMixShader')
        tr = node('ShaderNodeBsdfTransparent')
        # alpha-clipped like the game will draw it
        cl = node('ShaderNodeMath')
        cl.operation = 'GREATER_THAN'
        cl.inputs[1].default_value = 0.5
        nt.links.new(a, cl.inputs[0])
        nt.links.new(cl.outputs[0], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(em.outputs[0], out.inputs['Surface'])


AO_DIST = 0.025


def render(out, cell, w_m, h_m, px_w, px_h, cx=0.0, bottom=0.0, samples=48, ao_dist=0.025, lift=1.35, wb=(1.0, 1.01, 1.06),
           ao_k=0.28, lum_lo=0.4):
    """render the scene's visible objects into a cell framed w_m x h_m metres: x centred on cx, z from `bottom`"""
    global AO_DIST
    AO_DIST = ao_dist
    sc = bpy.context.scene
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w_m, h_m)
    cam.location = (cx, -5.0, bottom + h_m / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.data.clip_end = 20
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU' if bpy.context.preferences.addons.get('cycles') else 'CPU'
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = px_w, px_h
    sc.render.pixel_aspect_x = sc.render.pixel_aspect_y = 1
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '16'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    sc.cycles.max_bounces = 0
    sc.cycles.transparent_max_bounces = 16
    mats = set()
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE') and not o.hide_render:
            for m in o.data.materials:
                if m:
                    mats.add(m)
    paths = {}
    for kind, view, spp, den in (('col', 'Standard', samples, True), ('ao', 'Standard', samples, True), ('nrm', 'Raw', 16, False)):
        for m in mats:
            _rebuild(m, kind)
        sc.view_settings.view_transform = view
        sc.cycles.samples = spp
        sc.cycles.use_denoising = den
        paths[kind] = f'{out}/c{cell}_{kind}.png'
        sc.render.filepath = paths[kind]
        bpy.ops.render.render(write_still=True)
    post(out, cell, paths, lift, wb, ao_k, lum_lo)


def _load(p):
    return oiio.ImageBuf(p).get_pixels(oiio.FLOAT)


def _bleed(rgb, alpha):
    H, W = alpha.shape
    levels = [(rgb * alpha[..., None], alpha)]
    while min(levels[-1][1].shape) > 4:
        c, a = levels[-1]
        h, w = c.shape[0] // 2, c.shape[1] // 2
        levels.append((c[:h * 2, :w * 2].reshape(h, 2, w, 2, 3).mean(axis=(1, 3)), a[:h * 2, :w * 2].reshape(h, 2, w, 2).mean(axis=(1, 3))))
    fill = levels[-1][0] / np.maximum(levels[-1][1][..., None], 1e-6)
    for c, a in reversed(levels[:-1]):
        fill = np.repeat(np.repeat(fill, 2, axis=0), 2, axis=1)[:c.shape[0], :c.shape[1]]
        here = c / np.maximum(a[..., None], 1e-6)
        w = np.clip(a * 4.0, 0, 1)[..., None]
        fill = here * w + fill * (1 - w)
    return fill


def _write(p, arr, ch):
    H, W = arr.shape[:2]
    b = oiio.ImageBuf(oiio.ImageSpec(W, H, ch, oiio.UINT8))
    b.set_pixels(oiio.ROI(0, W, 0, H, 0, 1, 0, ch), np.ascontiguousarray(arr.astype(np.float32)))
    b.write(p)


def post(out, cell, paths, lift, wb, ao_k, lum_lo):
    col = _load(paths['col'])
    aoi = _load(paths['ao'])
    nrm = _load(paths['nrm'])[..., :3]
    alpha = col[..., 3]
    rgb = col[..., :3].copy()
    lum = rgb.mean(axis=2, keepdims=True)
    # the scan carries the shade it was photographed in: lift the lit surfaces, leave the dark parts their own colour
    fl = np.clip((lum - lum_lo) / 0.25, 0, 1)
    up = (1 - (1 - rgb) ** lift) * np.array(wb, dtype=np.float32)
    rgb = np.clip(rgb + (up - rgb) * fl, 0, 1) * ((1 - ao_k) + ao_k * aoi[..., :1])
    fill = _bleed(rgb, alpha)
    rgb = np.where(alpha[..., None] > 0.002, rgb, fill)
    _write(f'{out}/c{cell}.png', np.concatenate([rgb, alpha[..., None]], axis=2), 4)
    v = nrm * 2 - 1
    v[..., 2] *= -1  # Cycles' camera space looks down +z
    v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
    w = np.clip(alpha, 0, 1)[..., None]
    v = v * w + np.array([0, 0, 1], dtype=np.float32) * (1 - w)
    v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
    _write(f'{out}/c{cell}_n.png', v * 0.5 + 0.5, 3)
    o = rgb[alpha > 0.99]
    print('CELL', cell, 'coverage', round(float(alpha.mean()), 3), 'mean', o.mean(axis=0).round(3) if len(o) else '-')


def face_colours(ob, size=1024):
    """per-face colour sampled from each face's base-colour image at its UV centroid"""
    me = ob.data
    nl = len(me.loops)
    uv = np.empty(nl * 2, dtype=np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), dtype=np.int32)
    lt = np.empty(len(me.polygons), dtype=np.int32)
    mi = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('loop_start', ls)
    me.polygons.foreach_get('loop_total', lt)
    me.polygons.foreach_get('material_index', mi)
    cu = np.add.reduceat(uv, ls, axis=0) / lt[:, None]
    out = np.zeros((len(me.polygons), 3), dtype=np.float32)
    for k, m in enumerate(me.materials):
        src = _sources(m)[0]
        if src is None or src.node.type != 'TEX_IMAGE':
            continue
        path = bpy.path.abspath(src.node.image.filepath)
        buf = oiio.ImageBufAlgo.resize(oiio.ImageBuf(path), roi=oiio.ROI(0, size, 0, size, 0, 1, 0, 3))
        px = buf.get_pixels(oiio.FLOAT)
        sel = mi == k
        x = np.clip((cu[sel, 0] % 1.0) * size, 0, size - 1).astype(int)
        y = np.clip((1 - cu[sel, 1] % 1.0) * size, 0, size - 1).astype(int)
        out[sel] = px[y, x, :3]
    return out


def keep_faces(ob, mask, name):
    """a copy of a part with only the faces where mask is true"""
    me = ob.data.copy()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.nonzero(~mask)[0]], context='FACES')
    bm.to_mesh(me)
    bm.free()
    o.hide_render = True
    return o
