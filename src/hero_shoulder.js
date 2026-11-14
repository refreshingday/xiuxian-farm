// 溜肩修正：Mixamo 模型的锁骨（LeftShoulder / RightShoulder）原本不动，手一放下来，肩膀顶跟着塌下去。
// 按上臂的方向抬锁骨：手垂下时把肩头往上撑一点、往后收一点（挺胸、方肩）；手举过头时再耸一点（真人举手锁骨也会抬）。
// 上臂同时反转同样的角度，所以手臂指向完全不变，只是肩关节的位置变高了。
// q：骨名 → 四元数（相对「世界对齐」的静止姿态，和 drive 公式同一套），会就地改 aP1 / aN1 并写入 sP / sN。
import * as THREE from 'three';

// minOut：上臂往外张的最小值（方向的 x 分量）。宽袖子手一贴身就插进衣服里，垂手时至少张开这么多
export const SHOULDER = { down: 0.34, back: 0.12, up: 0.25, minOut: 0.5 };
const _z = new THREE.Vector3(0, 0, 1), _r = new THREE.Quaternion();
const _d = new THREE.Vector3(), _c = new THREE.Quaternion(), _e = new THREE.Euler();

export function shoulderFix(q, o = SHOULDER) {
  for (const [s, sg] of [['P', 1], ['N', -1]]) {
    const a = q['a' + s + '1']; if (!a) continue;
    _d.set(sg, 0, 0).applyQuaternion(a); // 上臂方向：y<0 垂下，y>0 举起
    // 袖子别插进身体：手垂下、又太贴身时，绕身体前后轴把上臂往外抬到 minOut（只改往外的那一点，前后摆不动）
    const out = _d.x * sg;
    if (o.minOut > 0 && _d.y < 0 && out < o.minOut) {
      const h = Math.hypot(_d.x, _d.y), want = Math.min(o.minOut, h * 0.98); // 在 xy 平面里的长度不变，只转角度
      const ang = Math.acos(Math.max(-1, Math.min(1, out / h))) - Math.acos(want / h);
      const w = Math.min(1, Math.max(0, (-_d.y - 0.55) / 0.25)); // 只管垂着的手；出招时横在胸前的手不动
      if (ang > 0 && w > 0) { a.premultiply(_r.setFromAxisAngle(_z, sg * ang * w)); _d.set(sg, 0, 0).applyQuaternion(a); }
    }
    const dn = Math.max(0, -_d.y), up = Math.max(0, _d.y);
    const lift = o.down * dn + o.up * up * up, back = o.back * dn;
    _c.setFromEuler(_e.set(0, sg * back, sg * lift, 'XYZ'));
    (q['s' + s] ||= new THREE.Quaternion()).copy(_c);
    a.premultiply(_c.invert()); // 上臂 = 锁骨⁻¹ × 原来，世界方向不变
  }
  return q;
}

// 袖子缩短：宽袖在 T 字静止姿态里往下垂的那一片（手放下来就正好朝着身体），往手臂轴线收。
// 只动「轴线下方超过 r0」的部分：d → r0 + (d − r0) × k；肩窝那头渐入，不扯到腋下。按权重混合，袖口 / 手不动形。
// 在模型的绑定空间里改顶点（加载时做一次）。返回 set(on)，查看器拿来开关对比。
export const SLEEVE = { k: 0.3, r0: 0.04, fade: 0.04 };
export function trimSleeves(mesh, o = SLEEVE) {
  const sk = mesh.skeleton, g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = sk.bones.map(b => b.name.replace(/^mixamorig:?/, ''));
  const bp = sk.boneInverses.map(bi => new THREE.Vector3().setFromMatrixPosition(bi.clone().invert()));
  const orig = pos.array.slice(), out = pos.array.slice();
  const inv = mesh.bindMatrix.clone().invert(), v = new THREE.Vector3(), u = new THREE.Vector3(), c = new THREE.Vector3();
  let moved = 0;
  for (const side of ['Left', 'Right']) {
    const ids = new Set(['Arm', 'ForeArm'].map(n => names.indexOf(side + n)));
    const A = bp[names.indexOf(side + 'Arm')], H = bp[names.indexOf(side + 'Hand')]; if (!A || !H) continue;
    u.subVectors(H, A); const len = u.length(); u.normalize();
    for (let i = 0; i < pos.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (ids.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
      if (w < 0.05) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
      const t = v.clone().sub(A).dot(u); if (t <= 0 || t >= len) continue;
      c.copy(A).addScaledVector(u, t);
      const d = c.y - v.y; if (d <= o.r0) continue; // 只管轴线下面垂出来的
      const fade = Math.min(1, t / (len * o.fade / 0.18 + 1e-6)) * Math.min(1, w); // 肩窝那头渐入
      v.y = c.y - (o.r0 + (d - o.r0) * (1 - (1 - o.k) * fade));
      v.applyMatrix4(inv); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; moved++;
    }
  }
  const set = on => { pos.array.set(on ? out : orig); pos.needsUpdate = true; g.computeBoundingSphere(); };
  set(true);
  return { moved, set };
}

// 肩头权重修正：Mixamo 自动绑的权重里，锁骨（Shoulder）一点权重都没有，肩头那一圈（一直到脖子根）全是上臂 100%，
// 手臂从 T 字放下来 80°，肩头跟着一起塌下去、斜下来 = 垮肩。
// 把「肩关节内侧 + 肩头上方」那一圈顶点的上臂权重挪给锁骨：锁骨静止时跟着胸走，肩头就留在原地（方肩的转角），
// shoulderFix 抬锁骨的时候肩头也跟着抬。越靠外（离肩关节越远）、越往下（腋下）挪得越少，腋下 / 袖子仍旧跟着手臂。
// 在模型的绑定空间里改权重（加载时做一次）。返回 set(on)，查看器 / 预览页拿来开关对比。
export const SHOULDER_W = { reach: 0.08, top0: -0.04, top1: 0.02, max: 1, ext: 0.0 };
export function fixShoulderWeights(mesh, o = SHOULDER_W) {
  const sk = mesh.skeleton, g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = sk.bones.map(b => b.name.replace(/^mixamorig:?/, ''));
  const bp = sk.boneInverses.map(bi => new THREE.Vector3().setFromMatrixPosition(bi.clone().invert()));
  const origI = si.array.slice(), origW = sw.array.slice();
  const v = new THREE.Vector3(), ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let moved = 0;
  for (const side of ['Left', 'Right']) {
    const arm = names.indexOf(side + 'Arm'), sh = names.indexOf(side + 'Shoulder'); if (arm < 0 || sh < 0) continue;
    const A = bp[arm], sgn = Math.sign(A.x) || 1;
    for (let i = 0; i < pos.count; i++) {
      let wa = 0, ka = -1; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === arm) { wa = sw.getComponent(i, k); ka = k; }
      if (wa < 0.01) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
      if (v.x * sgn < 0) continue; // 另一侧
      const out = (v.x - A.x) * sgn; // 在肩关节外侧多远
      const f = (1 - ss(o.ext, o.ext + o.reach, out)) * ss(o.top0, o.top1, v.y - A.y) * o.max;
      if (f <= 0.001) continue;
      const mv = wa * f;
      let ks = -1; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === sh) ks = k;
      if (ks < 0) { // 没有锁骨的槽：用权重最小的那个（不是上臂自己）
        let mi = -1, mw = 9; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (k !== ka && w < mw) { mw = w; mi = k; } }
        ks = mi; si.setComponent(i, ks, sh); sw.setComponent(i, ks, 0);
      }
      sw.setComponent(i, ka, wa - mv); sw.setComponent(i, ks, sw.getComponent(i, ks) + mv);
      let sum = 0; for (let k = 0; k < 4; k++) sum += sw.getComponent(i, k);
      if (sum > 0) for (let k = 0; k < 4; k++) sw.setComponent(i, k, sw.getComponent(i, k) / sum);
      moved++;
    }
  }
  const outI = si.array.slice(), outW = sw.array.slice();
  const set = on => { si.array.set(on ? outI : origI); sw.array.set(on ? outW : origW); si.needsUpdate = sw.needsUpdate = true; };
  return { moved, set };
}
