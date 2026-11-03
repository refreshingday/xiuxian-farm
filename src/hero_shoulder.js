// 溜肩修正：Mixamo 模型的锁骨（LeftShoulder / RightShoulder）原本不动，手一放下来，肩膀顶跟着塌下去。
// 按上臂的方向抬锁骨：手垂下时把肩头往上撑一点、往后收一点（挺胸、方肩）；手举过头时再耸一点（真人举手锁骨也会抬）。
// 上臂同时反转同样的角度，所以手臂指向完全不变，只是肩关节的位置变高了。
// q：骨名 → 四元数（相对「世界对齐」的静止姿态，和 drive 公式同一套），会就地改 aP1 / aN1 并写入 sP / sN。
import * as THREE from 'three';

export const SHOULDER = { down: 0.34, back: 0.12, up: 0.25 };
const _d = new THREE.Vector3(), _c = new THREE.Quaternion(), _e = new THREE.Euler();

export function shoulderFix(q, o = SHOULDER) {
  for (const [s, sg] of [['P', 1], ['N', -1]]) {
    const a = q['a' + s + '1']; if (!a) continue;
    _d.set(sg, 0, 0).applyQuaternion(a); // 上臂方向：y<0 垂下，y>0 举起
    const dn = Math.max(0, -_d.y), up = Math.max(0, _d.y);
    const lift = o.down * dn + o.up * up * up, back = o.back * dn;
    _c.setFromEuler(_e.set(0, sg * back, sg * lift, 'XYZ'));
    (q['s' + s] ||= new THREE.Quaternion()).copy(_c);
    a.premultiply(_c.invert()); // 上臂 = 锁骨⁻¹ × 原来，世界方向不变
  }
  return q;
}
