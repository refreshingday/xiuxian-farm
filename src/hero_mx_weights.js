// 可选：用 Blender 里手刷的权重覆盖 Mixamo 网格的蒙皮权重（assets/models/chibi_wuxia/hero_mx_rig.blend →
// scripts/blender/export_mx_weights.py 导出 hero_mx_weights.json）。文件不存在就什么都不做。
// 顶点按「包围盒归一化后的位置」最近邻匹配，骨骼按名字（去掉 : 之类字符）匹配，所以骨骼名/位置不能改，动画不受影响。
// 要在 makeFists / sharpenHair 之前调用（它们会改顶点位置）。
const clean = s => s.replace(/[^A-Za-z0-9_]/g, '');

export async function applyMxWeights(mesh, url) {
  let W;
  try { const r = await fetch(url); if (!r.ok) return null; W = await r.json(); } catch (e) { return null; }
  const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count;
  g.computeBoundingBox();
  const lo = g.boundingBox.min, hi = g.boundingBox.max, N = W.n, cell = 0.004;
  const boneAt = new Map(mesh.skeleton.bones.map((b, i) => [clean(b.name), i]));
  const bi = W.bones.map(nm => boneAt.get(clean(nm)));
  const grid = new Map(), m = W.pos.length / 3, key = (x, y, z) => x + ',' + y + ',' + z;
  for (let j = 0; j < m; j++) {
    const k = key(...[0, 1, 2].map(a => Math.floor(W.pos[j * 3 + a] / N / cell)));
    (grid.get(k) || grid.set(k, []).get(k)).push(j);
  }
  let miss = 0, worst = 0;
  for (let i = 0; i < n; i++) {
    const p = [(pos.getX(i) - lo.x) / (hi.x - lo.x), (pos.getY(i) - lo.y) / (hi.y - lo.y), (pos.getZ(i) - lo.z) / (hi.z - lo.z)];
    const c = p.map(v => Math.floor(v / cell));
    let best = -1, bd = 1e9;
    for (let d = 0; d < 27; d++) {
      const l = grid.get(key(c[0] + d % 3 - 1, c[1] + (d / 3 | 0) % 3 - 1, c[2] + (d / 9 | 0) - 1));
      if (l) for (const j of l) {
        const dd = (W.pos[j * 3] / N - p[0]) ** 2 + (W.pos[j * 3 + 1] / N - p[1]) ** 2 + (W.pos[j * 3 + 2] / N - p[2]) ** 2;
        if (dd < bd) { bd = dd; best = j; }
      }
    }
    if (best < 0 || bd > 1e-5) { miss++; continue; } // 距离 > ~0.3% 包围盒：认为没匹配上，保留原权重
    worst = Math.max(worst, bd);
    let ok = true; for (let k = 0; k < 4; k++) if (bi[W.idx[best * 4 + k]] === undefined) ok = false;
    if (!ok) { miss++; continue; }
    for (let k = 0; k < 4; k++) { si.setComponent(i, k, bi[W.idx[best * 4 + k]]); sw.setComponent(i, k, W.wt[best * 4 + k]); }
  }
  si.needsUpdate = sw.needsUpdate = true;
  console.log(`hero_mx_weights.json applied: ${n - miss}/${n} vertices matched (worst dist ${Math.sqrt(worst).toFixed(5)})`);
  return { matched: n - miss, total: n };
}
