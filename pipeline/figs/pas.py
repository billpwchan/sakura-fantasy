# the passenger: a young woman in seiza on a zabuton, holding a wagasa in her left hand, right hand in her lap
import bpy, sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
clear()
body, rig = human('pas', {"gender": 0.0, "age": 0.46, "muscle": 0.4, "weight": 0.45, "proportions": 0.62, "height": 0.56, "cupsize": 0.4,
                          "firmness": 0.5, "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0}}, 'young_asian_female', 'eyebrow004')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for n in ('thigh_l', 'calf_l', 'foot_l', 'upperarm_l', 'lowerarm_l', 'hand_l'):
    print('BONE', n, [round(v, 3) for v in head_w(rig, n)], [round(v, 3) for v in tail_w(rig, n)])
print('HEIGHT', max((rig.matrix_world @ v.co).z for v in body.data.vertices))

# seat frame (Blender): zabuton top at z = ZT, she faces -y; hips over her heels
ZT = 0.06
Lt = (head_w(rig, 'calf_l') - head_w(rig, 'thigh_l')).length
Ls = (head_w(rig, 'foot_l') - head_w(rig, 'calf_l')).length
zk, zh = ZT + 0.055, ZT + 0.215
dy = math.sqrt(max(Lt * Lt - (zh - zk) ** 2, 0.01))
H = head_w(rig, 'thigh_l')
target_h = Vector((H.x, 0.0, zh))
rig.location += target_h - H
bpy.context.view_layer.update()
for s, sx in (('l', 1), ('r', -1)):
    h = head_w(rig, 'thigh_' + s)
    knee = Vector((h.x + sx * 0.01, h.y - dy, zk))
    aim(rig, 'thigh_' + s, knee - h)
    ank = Vector((knee.x - sx * 0.015, knee.y + Ls * 0.99, ZT + 0.05))
    aim(rig, 'calf_' + s, ank - head_w(rig, 'calf_' + s))
    # soles up, toes pointing back and in
    aim(rig, 'foot_' + s, Vector((-sx * 0.25, 0.9, -0.3)), twist_to=Vector((0, 0, 1)))
    aim(rig, 'ball_' + s, Vector((-sx * 0.2, 1.0, -0.05)))
# an upright back, chin a little down
rot_local(rig, 'spine_01', (1, 0, 0), 4)
rot_local(rig, 'spine_03', (1, 0, 0), -3)
rot_local(rig, 'neck_01', (1, 0, 0), 6)
rot_local(rig, 'head', (1, 0, 0), 4)
# left hand round the wagasa shaft, thumb up, the shaft resting back against her shoulder; right hand palm down
# on her right thigh
HAND = Vector((0.14, -0.24, 0.42))
F = Vector((-0.3, -1.0, 0.05)).normalized()
N = Vector((-1.0, 0.25, 0.0)).normalized()
N = (N - F * N.dot(F)).normalized()
wrist = HAND - N * 0.035 - F * (hand_len(rig, 'l') * 0.75)
two_bone(rig, 'upperarm_l', 'lowerarm_l', wrist, head_w(rig, 'upperarm_l') + Vector((0.3, 0.15, -0.3)))
orient_hand(rig, 'l', F, N)
curl(rig, 'l', 80)
Fr = Vector((0.22, -1.0, -0.3)).normalized()
wr = Vector((-0.085, -0.11, 0.3))
two_bone(rig, 'upperarm_r', 'lowerarm_r', wr, head_w(rig, 'upperarm_r') + Vector((-0.25, 0.15, -0.3)))
orient_hand(rig, 'r', Fr, Vector((0, 0, -1)))
curl(rig, 'r', 14, thumb=0.3)
print('WRISTS', [round(v, 3) for v in head_w(rig, 'hand_l')], [round(v, 3) for v in head_w(rig, 'hand_r')])
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
bpy.context.view_layer.update()
# the posed, unbaked rig: the garment pass animates from a T-pose to this pose to drape the sleeves
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '_pose.blend'))
bake_pose(rig, meshes)
print('MINZ', min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices))
export(OUT, [rig] + meshes)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
