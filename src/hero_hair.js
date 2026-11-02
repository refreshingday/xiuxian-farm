// 把头发发梢削尖：用贴图颜色认出头发顶点，在网格邻接上做「反平滑」（顶点沿「远离邻居重心」的方向推出去）。
// 平的发片 / 发管侧面几乎不动，圆钝的发梢顶点离邻居重心最远，被拉成尖。加载后调用一次。
import * as THREE from 'three';

export function sharpenHair(mesh, image, { iters = 2, k = 0.6, minLen = 0.004, maxStep = 0.012, down = 0.5 } = {}) {
  const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv;
  // 读贴图像素判断是不是头发（褐色、偏暗）
  const cv = document.createElement('canvas'); cv.width = image.width; cv.height = image.height;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(image, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  const isHair = i => {
    const x = Math.min(cv.width - 1, Math.max(0, Math.floor(uv.getX(i) * cv.width)));
    const y = Math.min(cv.height - 1, Math.max(0, Math.floor((1 - uv.getY(i)) * cv.height)));
    const o = (y * cv.width + x) * 4, r = px[o], gg = px[o + 1], b = px[o + 2];
    return r > gg && gg > b && r < 170 && r - b > 30 && gg < 110;
  };
  // 按位置合并重复顶点（网格是按面角展开的）
  const key = i => `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
  const id = new Map(), uid = new Int32Array(pos.count), P = [], hair = [];
  for (let i = 0; i < pos.count; i++) {
    const kk = key(i); let u = id.get(kk);
    if (u === undefined) { u = P.length; id.set(kk, u); P.push(new THREE.Vector3().fromBufferAttribute(pos, i)); hair.push(true); }
    uid[i] = u; if (!isHair(i)) hair[u] = false;
  }
  const nb = P.map(() => new Set());
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const a = uid[i], b = uid[i + 1], c = uid[i + 2];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  const d = new THREE.Vector3(), cen = new THREE.Vector3();
  let moved = 0;
  for (let it = 0; it < iters; it++) {
    const next = P.map(p => p.clone());
    for (let u = 0; u < P.length; u++) {
      if (!hair[u] || !nb[u].size) continue;
      cen.set(0, 0, 0); for (const n of nb[u]) cen.add(P[n]); cen.multiplyScalar(1 / nb[u].size);
      d.copy(P[u]).sub(cen); const len = d.length();
      if (len < minLen || d.y > -down * len) continue; // 只拉朝下的发梢
      d.multiplyScalar(Math.min(len * k, maxStep) / len);
      next[u].add(d); if (it === 0) moved++;
    }
    for (let u = 0; u < P.length; u++) P[u].copy(next[u]);
  }
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, P[uid[i]].x, P[uid[i]].y, P[uid[i]].z);
  pos.needsUpdate = true; g.computeBoundingSphere();
  return moved;
}
