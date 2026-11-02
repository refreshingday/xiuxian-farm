// 攻击动画：直接跑主游戏自己的 animCombo（comboAnim.js），在一个替身 chibi 上摆出姿势，
// 再把替身的肩 / 肘 / 腰 / 腿换算成 Mixamo 骨骼的世界对齐旋转。这样姿势和出手时间都和游戏一致。
import * as THREE from 'three';
import { animCombo } from './comboAnim.js';
import { KITS } from './comboKit.js';

const g = () => new THREE.Group();
function makeProxy() {
  const arms = [-1, 1].map(s => { const sh = g(); sh.rotation.order = 'YXZ'; return { sh, el: g(), hand: g(), s }; }); // arms[0] = 右手（x<0），arms[1] = 左手
  const hips = g(); hips.position.y = 0.55;
  return { arms, legs: [g(), g()], hips, body: g(), rig: g(), sword: null, phase: 0, flash: 0, mats: [] };
}
const proxy = makeProxy();
const DOWN = new THREE.Vector3(0, -1, 0), v = new THREE.Vector3(), w = new THREE.Vector3();

// 武器 → 招式列表。技能槽的招式和 combat.js 里一样，由 pose + 出手时刻拼成
export function attackList() {
  const out = [];
  for (const kit of KITS) {
    const seen = new Set();
    for (const id of Object.values(kit.tree)) {
      if (seen.has(id)) continue; seen.add(id);
      const m = kit.moves[id];
      out.push({ id: `atk:${kit.id}:${id}`, kit: kit.name, label: m.name, m });
    }
    for (const s of kit.skills) out.push({ id: `atk:${kit.id}:${s.id}`, kit: kit.name, label: s.name, skill: true, m: { id: s.id, name: s.name, pose: s.pose, hits: [{ t: s.ht }], cancel: 0.32, dur: 0.4 } });
  }
  return out;
}

// 在招式 m 的第 t 秒摆姿势。返回 null = 游戏里此刻不在出招（调用方走待机）
export function attackPose(m, t, dt) {
  const c = proxy;
  if (!animCombo(c, dt, m, t)) return null;
  const p = { y: (c.hips.position.y - 0.55) * 0.76, rot: {}, q: {} };
  const by = c.body.rotation.y;
  p.rot.root = [c.rig.rotation.x, c.rig.rotation.y, c.rig.rotation.z];
  p.rot.spine = [0, by * 0.4, 0]; p.rot.chest = [0, by * 0.6, 0];
  for (const A of c.arms) {
    const side = A.s < 0 ? 'N' : 'P', rest = v.set(A.s, 0, 0).clone();
    const dirU = DOWN.clone().applyQuaternion(A.sh.quaternion);
    const dirF = w.copy(DOWN).applyQuaternion(A.el.quaternion).applyQuaternion(A.sh.quaternion).clone();
    const qU = new THREE.Quaternion().setFromUnitVectors(rest, dirU), qF = new THREE.Quaternion().setFromUnitVectors(rest, dirF);
    p.q['a' + side + '1'] = qU;
    p.q['a' + side + '2'] = qU.clone().invert().multiply(qF);
  }
  p.legs = { upN: -c.legs[0].rotation.x, upP: -c.legs[1].rotation.x };
  return p;
}
