// 连招动作：在共享骨架动画上叠加各招式姿势。试炼场和主游戏共用。
import { clamp } from './util.js';
import { animChibi } from './chibi.js';

// 关键帧 [肩 x, 肩 y, 肘, 身体扭转]：from = 蓄力位，to = 挥完位。斜劈 = 肩 x/y 同时变化
const SWING = {
  R: { from: [-2.7, -1.1, -1.1, -0.6], to: [-0.8, 1.0, -0.15, 0.55] },   // 右上 → 左下
  L: { from: [-2.5, 1.1, -1.2, 0.55], to: [-0.8, -1.1, -0.15, -0.6] },   // 左上 → 右下
  U: { from: [-0.6, -1.2, -0.9, -0.6], to: [-2.6, 0.9, -0.15, 0.5] },    // 右下 → 左上（撩）
  over: { from: [-3.1, -0.15, -1.4, -0.2], to: [-0.5, 0.05, -0.1, 0.1] }, // 竖劈
};
const REST = [-0.2, 0, -0.3, 0];
const ease = (k) => k * k * (3 - 2 * k);
const mix = (A, B, k) => A.map((x, i) => x + (B[i] - x) * k);
function setPose(c, [rx, ry, el, by]) {
  const [R, L] = c.arms;
  R.sh.rotation.set(rx, ry, R.s * 0.15); R.el.rotation.x = el;
  L.sh.rotation.set(-0.5, 0, L.s * 0.45); L.el.rotation.x = -0.9;
  c.body.rotation.y = by;
  if (c.sword) c.sword.rotation.x = Math.PI;
}
// 蓄力（hit 前 40%）→ 快速挥过（到 hit 稍后）→ 停在收势
function swingPose(kf, t, h0) {
  const w = h0 * 0.4, e = h0 * 1.1;
  return t < w ? mix(REST, kf.from, 1 - (1 - t / w) ** 2) : mix(kf.from, kf.to, ease(clamp((t - w) / (e - w), 0, 1)));
}

// 招式进行中返回 true（已摆好姿势）；不在出招时返回 false，由调用方走普通动画
export function animCombo(c, dt, m, t) {
  const [R] = c.arms;
  R.sh.position.z = 0;
  if (!m || t > m.cancel + 0.06) return false;
  const base = { move: 0, attack: -1, combo: 0, cast: 0, spin: 0, work: 0 };
  const h0 = m.hits[0]?.t ?? m.lunge?.[1] ?? 0.2;
  if (SWING[m.pose]) {
    animChibi(c, dt, base);
    setPose(c, swingPose(SWING[m.pose], t, h0));
  } else if (m.pose === 'leap') {
    const L = m.leap, k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1);
    animChibi(c, dt, base);
    setPose(c, k < 0.55 ? mix(REST, SWING.over.from, ease(k / 0.55)) : mix(SWING.over.from, SWING.over.to, ease((k - 0.55) / 0.45)));
    c.legs[0].rotation.x = -0.9 * Math.sin(k * Math.PI); c.legs[1].rotation.x = -0.4 * Math.sin(k * Math.PI);
  } else if (m.pose === 'spin') {
    animChibi(c, dt, { ...base, spin: Math.min(1, t / m.cancel) * 0.5 });
    setPose(c, [-1.5, -0.9, -0.1, 0]);
  } else { // thrust / dash：肘部收回再刺出
    animChibi(c, dt, { ...base, dash: m.pose === 'dash' && t < m.lunge[1] });
    const jab = m.pose === 'thrust' ? Math.abs(Math.sin(t / 0.09 * Math.PI)) : 1;
    setPose(c, [-1.35 - jab * 0.25, 0.15, -1.3 * (1 - jab), -0.4 * jab]);
    R.sh.position.z = jab * 0.12;
  }
  return true;
}
