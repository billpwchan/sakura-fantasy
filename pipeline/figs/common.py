# shared helpers for the figure builds (MPFB bodies posed by world-space aiming, garments, export)
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Quaternion

bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.services.rigservice import RigService

D = LocationService.get_user_data()
HERE = os.path.dirname(os.path.abspath(__file__))


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def human(name, macro, skin, brow, eye='brown', lashes='eyelashes02'):
    bm = HumanService.create_human(macro_detail_dict=macro)
    bm.name = name
    # the rig first, so the face assets below are skinned to it as they are fitted
    HumanService.add_builtin_rig(bm, 'game_engine')
    rig = bm.parent
    rig.name = name + '_rig'
    HumanService.set_character_skin(os.path.join(D, 'skins', skin, skin + '.mhmat'), bm, skin_type='MAKESKIN', material_instances=False)
    parts = {}
    for key, f, t in (('eyes', 'eyes/low-poly/low-poly.mhclo', 'Eyes'), ('brows', 'eyebrows/%s/%s.mhclo' % (brow, brow), 'Eyebrows'),
                      ('lashes', 'eyelashes/%s/%s.mhclo' % (lashes, lashes), 'Eyelashes')):
        before = set(bpy.data.objects)
        HumanService.add_mhclo_asset(os.path.join(D, f), bm, asset_type=t, subdiv_levels=0, material_type='MAKESKIN')
        o = [x for x in bpy.data.objects if x not in before and x.type == 'MESH'][0]
        o.name = name + '_' + key
        o.data.materials[0].name = name + '_' + key
        parts[key] = o
    set_image(parts['eyes'].data.materials[0], os.path.join(D, 'eyes/materials', eye + '_eye.png'))
    # brows and lashes are alpha cards
    for k in ('brows', 'lashes'):
        m = parts[k].data.materials[0]
        m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else None
        nt = m.node_tree
        bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
        tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
        if not bsdf.inputs['Alpha'].is_linked:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    # skin and eyes are opaque: a linked alpha exports as BLEND, and without depth writes the mouth and eye sockets
    # show through the face
    for m in (bm.data.materials[0], parts['eyes'].data.materials[0]):
        opaque(m)
    # every body face on the one skin material: the lips/nails/ears slots export with the wrong mapping
    for p in bm.data.polygons:
        p.material_index = 0
    while len(bm.data.materials) > 1:
        bm.data.materials.pop(index=len(bm.data.materials) - 1)
    bm.data.materials[0].name = name + '_skin'
    # bake the shape (macro targets) and the helper mask so only the plain body remains
    bpy.context.view_layer.objects.active = bm
    if bm.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(bm.modifiers):
        if m.type == 'MASK':
            bpy.ops.object.modifier_apply(modifier=m.name)
    for o in parts.values():
        print('PART', o.name, o.parent and o.parent.name, [m.type for m in o.modifiers], len(o.vertex_groups))
    return bm, rig


def opaque(m):
    nt = m.node_tree
    for n in nt.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for l in list(n.inputs['Alpha'].links):
                nt.links.remove(l)
            n.inputs['Alpha'].default_value = 1.0
    if hasattr(m, 'blend_method'):
        m.blend_method = 'OPAQUE'
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'


def set_image(mat, path):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'eye' in n.image.name.lower() and 'normal' not in n.image.name.lower():
            n.image = bpy.data.images.load(path, check_existing=True)
            return


def pbone_world(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].matrix


def head_w(rig, name):
    return (pbone_world(rig, name)).translation.copy()


def tail_w(rig, name):
    pb = rig.pose.bones[name]
    return rig.matrix_world @ pb.tail


def aim(rig, name, direction, twist_to=None):
    """rotate a pose bone about its head so its y axis points along direction (world); optionally roll its z axis
    toward twist_to (world vector, projected)"""
    M = pbone_world(rig, name)
    head = M.translation.copy()
    cur = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(direction.normalized())
    R = q.to_matrix().to_4x4()
    newM = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M
    if twist_to is not None:
        y = (newM.to_3x3() @ Vector((0, 1, 0))).normalized()
        z = (newM.to_3x3() @ Vector((0, 0, 1))).normalized()
        t = (twist_to - y * twist_to.dot(y)).normalized()
        ang = z.angle(t)
        if z.cross(t).dot(y) < 0:
            ang = -ang
        Rt = Quaternion(y, ang).to_matrix().to_4x4()
        newM = Matrix.Translation(head) @ Rt @ Matrix.Translation(-head) @ newM
    rig.pose.bones[name].matrix = rig.matrix_world.inverted() @ newM
    bpy.context.view_layer.update()


def rot_local(rig, name, axis, deg):
    pb = rig.pose.bones[name]
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(Vector(axis), math.radians(deg))
    bpy.context.view_layer.update()


def two_bone(rig, upper, lower, target, pole):
    """place the joint between upper and lower so the end of lower lands on target, bending toward pole"""
    S = head_w(rig, upper)
    E = head_w(rig, lower)
    end = tail_w(rig, lower)
    a = (E - S).length
    b = (end - E).length
    d = target - S
    dist = min(d.length, (a + b) * 0.999)
    dn = d.normalized()
    ca = max(-1, min(1, (a * a + dist * dist - b * b) / (2 * a * dist)))
    sa = math.sqrt(1 - ca * ca)
    pl = pole - S
    pl = (pl - dn * pl.dot(dn)).normalized()
    elbow = S + dn * (a * ca) + pl * (a * sa)
    aim(rig, upper, elbow - S)
    aim(rig, lower, (S + dn * dist) - head_w(rig, lower))


def curl(rig, side, amount, thumb=0.6):
    for f in ('index', 'middle', 'ring', 'pinky'):
        for k, w in ((1, 0.8), (2, 1.0), (3, 0.7)):
            rot_local(rig, '%s_0%d_%s' % (f, k, side), (1, 0, 0), amount * w)
    for k in (2, 3):
        rot_local(rig, 'thumb_0%d_%s' % (k, side), (1, 0, 0), amount * thumb * 0.6)


def bake_pose(rig, meshes):
    """apply the pose to the meshes and make it the rest pose, keeping the skin binding"""
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        for m in o.modifiers:
            if m.type == 'ARMATURE':
                name = m.name
                bpy.ops.object.modifier_copy(modifier=name)
                bpy.ops.object.modifier_apply(modifier=name)
                break
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes:
        for m in o.modifiers:
            if m.type == 'ARMATURE':
                m.name = 'Armature'


def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                              export_skins=True, export_animations=False, export_texcoords=True, export_normals=True,
                              export_vertex_color='ACTIVE')


def orient_hand(rig, side, F, N):
    """turn hand_<side> so its knuckles point along F and its palm faces N (world), about the wrist"""
    hn = 'hand_' + side
    M = pbone_world(rig, hn)
    w = M.translation.copy()
    f = (head_w(rig, 'middle_01_' + side) - w).normalized()
    n = (M.to_3x3() @ Vector((0, 0, 1))).normalized()
    n = (n - f * n.dot(f)).normalized()
    F = F.normalized()
    N = (N - F * N.dot(F)).normalized()
    B0 = Matrix((f, n, f.cross(n))).transposed()
    B1 = Matrix((F, N, F.cross(N))).transposed()
    R = (B1 @ B0.transposed()).to_4x4()
    newM = Matrix.Translation(w) @ R @ Matrix.Translation(-w) @ M
    rig.pose.bones[hn].matrix = rig.matrix_world.inverted() @ newM
    bpy.context.view_layer.update()


def hand_len(rig, side):
    return (head_w(rig, 'middle_01_' + side) - head_w(rig, 'hand_' + side)).length
