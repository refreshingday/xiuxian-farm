// 把 Mixamo 蒙皮网格上的手改成握拳：按「手 / 食指」骨骼权重找到手部顶点，
// 沿前臂方向缩短、横向鼓圆，权重越高变形越多，腕口平滑过渡。直接改 geometry，只需在加载后调用一次。
import * as THREE from 'three';

export function makeFists(mesh, { shorten = 0.62, puff = 1.6, round = 0.85, size = 1.35 } = {}) {
  const sk = mesh.skeleton, g = mesh.geometry;
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  sk.bones.forEach(b => b.updateMatrixWorld(true));
  const bindPos = i => new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
  const find = re => sk.bones.findIndex(b => re.test(b.name));
  for (const side of ['Left', 'Right']) {
    const isHand = new Set(sk.bones.map((b, i) => (new RegExp(`${side}Hand`).test(b.name) ? i : -1)).filter(i => i >= 0));
    const hand = find(new RegExp(`${side}Hand$`)), fore = find(new RegExp(`${side}ForeArm$`));
    if (hand < 0 || fore < 0) continue;
    const ph = bindPos(hand), axis = ph.clone().sub(bindPos(fore)).normalize();
    const w = new Float32Array(pos.count), v = new THREE.Vector3();
    const cen = new THREE.Vector3(); let wsum = 0, umax = 0;
    for (let i = 0; i < pos.count; i++) {
      for (let k = 0; k < 4; k++) if (isHand.has(si.getComponent(i, k))) w[i] += sw.getComponent(i, k);
      if (w[i] > 0.5) { v.fromBufferAttribute(pos, i).sub(ph); const u = v.dot(axis); cen.addScaledVector(v.clone().addScaledVector(axis, -u), 1); wsum++; umax = Math.max(umax, u); }
    }
    if (!wsum) continue;
    cen.multiplyScalar(1 / wsum);
    const um = umax * 0.5, hc = ph.clone().add(cen).addScaledVector(axis, um);
    // 第一遍：缩短 + 横向鼓大；第二遍：再往球面上推，让拳头更圆更大
    const nvs = [], idxs = []; let rsum = 0, rn = 0;
    for (let i = 0; i < pos.count; i++) {
      if (w[i] < 0.01) continue;
      v.fromBufferAttribute(pos, i).sub(ph);
      const u = v.dot(axis), r = v.clone().addScaledVector(axis, -u).sub(cen);
      const nv = new THREE.Vector3().copy(cen).add(r.multiplyScalar(puff)).addScaledVector(axis, um + (u - um) * shorten).add(ph);
      nvs.push(nv); idxs.push(i);
      if (w[i] > 0.5) { rsum += nv.distanceTo(hc); rn++; }
    }
    const R = (rsum / rn) * size;
    idxs.forEach((i, j) => {
      const d = nvs[j].clone().sub(hc), len = d.length() || 1e-6;
      const nv = hc.clone().addScaledVector(d, THREE.MathUtils.lerp(len, R, round) / len);
      v.fromBufferAttribute(pos, i).lerp(nv, w[i]);
      pos.setXYZ(i, v.x, v.y, v.z);
    });
  }
  pos.needsUpdate = true; g.computeBoundingSphere();
}
