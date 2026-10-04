# the sendo: a weathered boatman standing at the stern, feet staggered, both hands on the ro at mid-stroke. This
# pose becomes the bind pose; the game turns his spine, head and arms from it (two-bone IK to the ro each frame).
# Blender -b --python man.py -- out.glb
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
clear()
body, rig = human('man', {"gender": 1.0, "age": 0.74, "muscle": 0.82, "weight": 0.58, "proportions": 0.55, "height": 0.52,
                          "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0}}, 'middleage_asian_male', 'eyebrow010')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('HEIGHT', round(max((rig.matrix_world @ v.co).z for v in body.data.vertices), 3))
for n in ('pelvis', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'upperarm_l', 'hand_l', 'head'):
    print('BONE', n, [round(v, 3) for v in head_w(rig, n)], [round(v, 3) for v in tail_w(rig, n)])

# feet flat as they are at rest; remember their world rotation to restore after the legs are bent
foot_rest = {s: (pbone_world(rig, 'foot_' + s).to_3x3().copy(), pbone_world(rig, 'ball_' + s).to_3x3().copy()) for s in 'lr'}
ank0 = {s: head_w(rig, 'foot_' + s) for s in 'lr'}

# stance: right foot forward, left foot back and turned out, knees a little bent, hips down 4 cm
FOOT = {'r': Vector((-0.12, -0.17, 0.0)), 'l': Vector((0.13, 0.16, 0.0))}
TOE_OUT = {'r': 10, 'l': 28}
rig.location.z -= 0.04
rig.location.y += 0.0
bpy.context.view_layer.update()
for s, sx in (('l', 1), ('r', -1)):
    a = ank0[s].copy()
    tgt = Vector((FOOT[s].x, FOOT[s].y, a.z))
    knee_pole = head_w(rig, 'calf_' + s) + Vector((sx * 0.08, -0.5, 0.0))
    two_bone(rig, 'thigh_' + s, 'calf_' + s, tgt, knee_pole)
    Rz = Matrix.Rotation(math.radians(sx * TOE_OUT[s]), 3, 'Z')
    for bn, R in (('foot_' + s, foot_rest[s][0]), ('ball_' + s, foot_rest[s][1])):
        h = head_w(rig, bn)
        M = Matrix.Translation(h) @ (Rz @ R).to_4x4()
        rig.pose.bones[bn].matrix = rig.matrix_world.inverted() @ M
        bpy.context.view_layer.update()
print('FEET', [round(v, 3) for v in head_w(rig, 'foot_l')], [round(v, 3) for v in head_w(rig, 'foot_r')])

# a working back: bent a little forward from the hips, the chest turned toward the ro
rot_local(rig, 'spine_01', (1, 0, 0), 7)
rot_local(rig, 'spine_02', (1, 0, 0), 4)
rot_local(rig, 'spine_03', (0, 1, 0), -4)
rot_local(rig, 'neck_01', (1, 0, 0), -6)
rot_local(rig, 'head', (1, 0, 0), -2)

# hands on the ro at mid-stroke: right on the grip, left on the loom; both overhand, knuckles forward
HR = Vector((0.0, -0.48, 1.05))
HL = Vector((0.23, -0.4, 0.95))
for s, H, pole in (('r', HR, Vector((-0.35, 0.1, -0.5))), ('l', HL, Vector((0.35, 0.1, -0.5)))):
    F = Vector((0.0, -1.0, -0.15)).normalized()
    N = Vector((0.0, 0.0, -1.0))
    N = (N - F * N.dot(F)).normalized()
    wrist = H + N * 0.03 - F * (hand_len(rig, s) * 0.7)
    two_bone(rig, 'upperarm_' + s, 'lowerarm_' + s, wrist, head_w(rig, 'upperarm_' + s) + pole)
    orient_hand(rig, s, F, N)
    curl(rig, s, 72, thumb=0.7)
print('WRISTS', [round(v, 3) for v in head_w(rig, 'hand_l')], [round(v, 3) for v in head_w(rig, 'hand_r')])
print('SHOULDERS', [round(v, 3) for v in head_w(rig, 'upperarm_l')], [round(v, 3) for v in head_w(rig, 'upperarm_r')])
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
bpy.context.view_layer.update()
bake_pose(rig, meshes)
print('MINZ', round(min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices), 3))
export(OUT, [rig] + meshes)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
