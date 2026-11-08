# Build assets/models/chibi_wuxia/hero_mx_rig.blend from the Mixamo FBX the game actually uses (anim/idle.fbx).
# Run:  blender -b -P scripts/blender/build_mx_rig.py
import bpy, os

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'assets', 'models', 'chibi_wuxia')
bpy.ops.wm.read_factory_settings(use_empty=True)
fbx = os.path.join(DIR, 'anim', 'idle.fbx')
if hasattr(bpy.ops.import_scene, 'fbx'): bpy.ops.import_scene.fbx(filepath=fbx)
else: bpy.ops.wm.fbx_import(filepath=fbx)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
print('meshes', [(m.name, len(m.data.vertices)) for m in meshes], 'rigs', [r.name for r in rigs])
# game texture
img = bpy.data.images.load(os.path.join(DIR, 'hero_basecolor.jpg'))
for m in meshes:
    mat = bpy.data.materials.new('hero_mat'); mat.use_nodes = True
    n = mat.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
    mat.node_tree.links.new(n.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    m.data.materials.clear(); m.data.materials.append(mat)
for r in rigs: r.show_in_front = True
# stop idle animation from moving the pose while painting
for r in rigs:
    r.animation_data_clear()
    r.data.pose_position = 'REST'

txt = bpy.data.texts.new('export_mx_weights.py')
txt.write(open(os.path.join(HERE, 'export_mx_weights.py'), encoding='utf-8').read())
bpy.ops.object.select_all(action='DESELECT')
for o in rigs + meshes: o.select_set(True)
if meshes: bpy.context.view_layer.objects.active = meshes[0]
out = os.path.join(DIR, 'hero_mx_rig.blend')
bpy.ops.wm.save_as_mainfile(filepath=out)
print('Saved', out)
