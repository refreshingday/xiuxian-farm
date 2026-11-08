# Export skin weights of the Mixamo hero from hero_mx_rig.blend -> hero_mx_weights.json (next to the .blend).
# Run inside Blender (Scripting tab -> Alt+P) or:  blender -b hero_mx_rig.blend -P export_mx_weights.py
# The game (src/character.js) matches vertices by position (normalised to the mesh bounding box) and bones by name.
# Only weights are exported: don't rename / move / add bones, and don't change the mesh's vertices.
import bpy, os, json

obj = next(o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups)
gname = {g.index: g.name for g in obj.vertex_groups}
mw = obj.matrix_world
P = []
for v in obj.data.vertices:
    c = mw @ v.co
    P.append((c.x, c.z, -c.y))  # Blender -> game axes (Y up)
lo = [min(p[i] for p in P) for i in range(3)]
hi = [max(p[i] for p in P) for i in range(3)]
N = 100000
pos, idx, wt = [], [], []
bones, bi = [], {}
unweighted = 0
for v, p in zip(obj.data.vertices, P):
    pos += [round((p[i] - lo[i]) / (hi[i] - lo[i]) * N) for i in range(3)]
    ws = sorted(((gname[g.group], g.weight) for g in v.groups if g.group in gname and g.weight > 1e-4), key=lambda t: -t[1])[:4]
    tot = sum(w for _, w in ws)
    if tot <= 0:
        unweighted += 1
        ws, tot = [(next(iter(gname.values())), 1.0)], 1.0
    ws += [(ws[0][0], 0.0)] * (4 - len(ws))
    for name, w in ws:
        if name not in bi: bi[name] = len(bones); bones.append(name)
        idx.append(bi[name]); wt.append(round(w / tot, 4))

out = os.path.join(os.path.dirname(bpy.data.filepath), 'hero_mx_weights.json')
with open(out, 'w') as f:
    json.dump({'version': 1, 'n': N, 'bones': bones, 'pos': pos, 'idx': idx, 'wt': wt}, f, separators=(',', ':'))
print('Exported %d vertices, %d bones (%d vertices without weights) to %s' % (len(P), len(bones), unweighted, out))
