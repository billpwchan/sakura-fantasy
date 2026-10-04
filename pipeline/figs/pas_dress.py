# the passenger's furisode: kimono shell over torso and lap, cloth-simulated sleeves, then collar, obi and the rest
# run: Blender -b pas_pose.blend --python pas_dress.py -- out.glb
import bpy, bmesh, sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from garment import *
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
STAGE = argv[1] if len(argv) > 1 else 'all'
rig = bpy.data.objects['pas_rig']
body = bpy.data.objects['pas']
face_parts = [o for o in bpy.data.objects if o.type == 'MESH' and o is not body]
sc = bpy.context.scene
ZT = 0.06


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---- the final pose, and a static copy of the posed body to build on
final = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}
final_loc = rig.location.copy()


def posed_copy(name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o = link(bpy.data.objects.new(name, me))
    o.matrix_world = body.matrix_world.copy()
    for g in body.vertex_groups:
        o.vertex_groups.new(name=g.name)
    return o


posed = posed_copy('posed')
dom = dominant(posed)
mw = posed.matrix_world


def pts(bones, pred=lambda p: True):
    return [mw @ v.co for v in posed.data.vertices if dom[v.index] in bones and pred(mw @ v.co)]


# ---- shell: the kimono is a cylinder over the torso (convex, like a dressed figure) and a mound over the folded legs
NECK = head_w(rig, 'neck_01')
t0 = time.time()
torso = hull_of(pts({'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'}), 'torso_hull')
lap = hull_of(pts({'pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}), 'lap_hull')
for o in (torso, lap):
    voxel(o, 0.008)
    inflate(o, 0.012)
shell = join([torso, lap], 'kimono')
voxel(shell, 0.007)
smooth(shell, 0.6, 12)
push_out(shell, posed, 0.008)
smooth(shell, 0.5, 4)
print('SHELL', len(shell.data.polygons), round(time.time() - t0, 1))

# ---- rest the right hand on the kimono over her thigh (the pose put it on the bare thigh)
sbvh = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
Fr = Vector((0.22, -1.0, -0.12)).normalized()
palm = Vector((-0.07, -0.21, 1.0))
hit, n, _, _ = sbvh.ray_cast(palm, Vector((0, 0, -1)))
palm = hit + Vector((0, 0, 0.012))
wr = palm - Fr * (hand_len(rig, 'r') * 0.55) + Vector((0, 0, 0.022))
two_bone(rig, 'upperarm_r', 'lowerarm_r', wr, head_w(rig, 'upperarm_r') + Vector((-0.25, 0.15, -0.3)))
orient_hand(rig, 'r', Fr, Vector((0, 0, -1)))
final = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}
print('RHAND', [round(v, 3) for v in hit], [round(v, 3) for v in head_w(rig, 'hand_r')])

# ---- zabuton and floor (colliders for the drape)
zab = link(bpy.data.objects.new('zabuton', bpy.data.meshes.new('zabuton')))
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(0.55, 0.59, 0.07), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0, -0.12, 0.035), verts=bm.verts)
bm.to_mesh(zab.data); bm.free()
floor = link(bpy.data.objects.new('floor', bpy.data.meshes.new('floor')))
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=2.0)
bm.to_mesh(floor.data); bm.free()

if STAGE == 'shell':
    export(OUT, [shell, posed, zab])
    sys.exit(0)

# ---- sleeves: hung from a T-pose, standing, then carried down into the pose as cloth. The T-pose becomes the rest
# pose, so the sleeve tops can ride the arm bones from frame 1 without a double transform.
def depth(pb):
    return len(pb.parent_recursive)


final_arm = {pb.name: pb.matrix.copy() for pb in rig.pose.bones}
rest_loc = Vector((0, 0, 0))
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix()
rig.location = rest_loc
bpy.context.view_layer.update()
for side, sx in (('l', 1), ('r', -1)):
    d = Vector((sx, -0.6, 0.1))
    for n in ('upperarm_', 'lowerarm_', 'hand_'):
        aim(rig, n + side, d)
bake_pose(rig, [body] + face_parts)
bpy.context.view_layer.update()


def set_final():
    for k in sorted(set(depth(pb) for pb in rig.pose.bones)):
        for pb in rig.pose.bones:
            if depth(pb) == k:
                pb.matrix = final_arm[pb.name]
        bpy.context.view_layer.update()


def key(f, pose_final):
    if pose_final:
        rig.location = final_loc
        bpy.context.view_layer.update()
        set_final()
    else:
        for pb in rig.pose.bones:
            pb.matrix_basis = Matrix()
        rig.location = rest_loc
    for pb in rig.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=f)
        pb.keyframe_insert('location', frame=f)
    rig.keyframe_insert('location', frame=f)


F_START, F_POSE, F_END = 12, 84, 140
key(1, False)
key(F_START, False)
key(F_POSE, True)
sc.frame_start, sc.frame_end = 1, F_END
sc.frame_set(1)

SL_W = 0.32 + 0.15  # sleeve width plus the shoulder piece of the body panel it hangs from
SL_H = 0.85         # chu-furisode sleeve length
SL_OPEN = 0.21      # sode-guchi: the hand opening at the top of the outer edge
STEP = 0.012


def build_sleeve(side, sx):
    S = head_w(rig, 'upperarm_' + side)
    W = head_w(rig, 'hand_' + side)
    ax = (W - S).normalized()
    up = Vector((0, 0, 1)); up = (up - ax * up.dot(ax)).normalized()
    fw = Vector((0, -1, 0)); fw = (fw - ax * fw.dot(ax) - up * fw.dot(up)).normalized()
    L = (W - S).length + 0.02
    u0 = L - SL_W
    R = 0.08
    nu = round(SL_W / STEP); nw = round(SL_H / STEP)
    bm = bmesh.new()
    lw = bm.verts.layers.float.new('w')
    lu = bm.verts.layers.float.new('u')
    grid = {}
    arc = math.pi / 2 * R
    for i in range(nu + 1):
        u = i / nu * SL_W
        for j in range(-nw, nw + 1):
            w = j / nw * SL_H
            a = abs(w)
            if a < arc:
                th = a / R
                y, z = R * math.sin(th), R * math.cos(th)
            else:
                y = R - (R - 0.006) * smoothstep(arc + R, arc + R + 0.15, a)
                z = -(a - arc)
            close = smoothstep(SL_H - 0.04, SL_H, a)
            if a > SL_OPEN:
                close = max(close, smoothstep(SL_W - 0.03, SL_W, u))
            y *= (1 - close)
            p = S + ax * (u0 + u) + up * z + fw * (y * (1 if w >= 0 else -1))
            p += ax * (max(-z, 0) * 0.12)
            v = bm.verts.new(p)
            v[lw] = a
            v[lu] = u
            grid[i, j] = v
    for i in range(nu):
        for j in range(-nw, nw):
            bm.faces.new((grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)
    me = bpy.data.meshes.new('sleeve_' + side)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('sleeve_' + side, me))
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    # the top of the sleeve rides the arm (weights from the body under it); the rest hangs free
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    dt = o.modifiers.new('wt', 'DATA_TRANSFER')
    dt.object = body
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'NEAREST'
    dt.layers_vgroup_select_src = 'ALL'
    dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    wa = me.attributes['w'].data
    top = arc * 0.8
    pin = o.vertex_groups.new(name='pin')
    keep = set(rig.data.bones.keys())
    for v in me.vertices:
        a = wa[v.index].value
        if a > top:
            for g in list(v.groups):
                o.vertex_groups[g.group].remove([v.index])
        else:
            pin.add([v.index], 1.0 - smoothstep(arc * 0.35, top, a), 'REPLACE')
    for g in list(o.vertex_groups):
        if g.name not in keep and g.name != 'pin':
            o.vertex_groups.remove(g)
    arm = o.modifiers.new('Armature', 'ARMATURE'); arm.object = rig
    c = o.modifiers.new('cloth', 'CLOTH')
    cs = c.settings
    cs.quality = 12
    cs.mass = 0.25
    cs.air_damping = 2.0
    cs.tension_stiffness = 25; cs.compression_stiffness = 25; cs.shear_stiffness = 10
    cs.bending_stiffness = 2.0
    cs.vertex_group_mass = 'pin'
    cs.pin_stiffness = 2.0
    cc = c.collision_settings
    cc.collision_quality = 5
    cc.distance_min = 0.004
    cc.use_self_collision = True
    cc.self_distance_min = 0.003
    cc.self_friction = 5
    c.point_cache.frame_start = 1
    c.point_cache.frame_end = F_END
    print('SLEEVE', side, len(me.vertices), 'u0', round(u0, 3), 'groups', len(o.vertex_groups))
    return o


sleeves = [build_sleeve('l', 1), build_sleeve('r', -1)]
for o, th in ((body, 0.005), (zab, 0.003), (floor, 0.003)):
    m = o.modifiers.new('collision', 'COLLISION')
    o.collision.thickness_outer = th
    o.collision.cloth_friction = 8
# start check: nothing of the sleeves inside the body
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)
inv = body.matrix_world.inverted()
for o in sleeves:
    bad = 0
    for v in o.data.vertices:
        p = inv @ (o.matrix_world @ v.co)
        loc, n, i, dd = bvh.find_nearest(p)
        if loc is not None and (p - loc).dot(n) < 0.002:
            bad += 1
    print('START_INSIDE', o.name, bad)

t0 = time.time()
for f in range(1, F_END + 1):
    sc.frame_set(f)
    if f % 20 == 0:
        print('FRAME', f, round(time.time() - t0, 1), flush=True)

dg = bpy.context.evaluated_depsgraph_get()
statics = []
for o in sleeves:
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    s = link(bpy.data.objects.new(o.name + '_d', me))
    s.matrix_world = o.matrix_world.copy()
    for p in me.polygons:
        p.use_smooth = True
    statics.append(s)
    print('SLEEVE_Z', s.name, round(min((s.matrix_world @ v.co).z for v in me.vertices), 3), round(max((s.matrix_world @ v.co).z for v in me.vertices), 3))
for o in sleeves:
    bpy.data.objects.remove(o)
rig.animation_data_clear()
rig.location = final_loc
bpy.context.view_layer.update()
set_final()
for s in statics:
    push_out(s, shell, 0.004)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '_drape.blend'))
if STAGE == 'drape':
    km = material('kimono_chk', (0.75, 0.32, 0.38), 0.7)
    km.use_backface_culling = False
    for o in statics + [shell]:
        set_mat(o, km)
    posed2 = posed_copy('posed2')
    export(OUT, [shell, posed2, zab] + statics)
    sys.exit(0)
