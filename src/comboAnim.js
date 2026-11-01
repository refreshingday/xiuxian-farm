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

// ---- 拳 / 符：两只手都要摆 ----
// 每只手 [肩 x, 肩 y（往身体中线收）, 肘]。GUARD = 双拳护在下巴前，JAB = 直拳打满，SEAL = 掐诀护在胸前
const GUARD = [-1.0, 0.3, -1.9], JAB = [-1.62, 0.12, -0.05], SEAL = [-1.15, 0.55, -1.7];
function arm(A, [rx, ry, el], fwd = 0) { A.sh.rotation.set(rx, -A.s * ry, A.s * 0.15); A.el.rotation.x = el; A.sh.position.z = fwd; }
// 出手曲线：0 = 架势，1 = 打满。判定前加速打出去，停一拍再收
const strike = (t, h, back = 0.14) => (t < h ? (t / h) ** 2 : 1 - ease(clamp((t - h - 0.03) / back, 0, 1)));
// 弓步：前腿迈出、后腿蹬直、身体压低前倾
function stance(c, k, lean = 0.2) { c.legs[0].rotation.x = -0.7 * k; c.legs[1].rotation.x = 0.5 * k; c.hips.position.y -= 0.1 * k; c.rig.rotation.x = lean * k; }
const POSE2 = {
  jabL(c, m, t, h) { const [R, L] = c.arms, k = strike(t, h); arm(L, mix(GUARD, JAB, k), k * 0.1); arm(R, GUARD); c.body.rotation.y = -0.45 * k; },
  jabR(c, m, t, h) { const [R, L] = c.arms, k = strike(t, h); arm(R, mix(GUARD, JAB, k), k * 0.1); arm(L, GUARD); c.body.rotation.y = 0.45 * k; },
  crush(c, m, t, h) { // 崩拳：先收拳蓄力，再弓步打穿
    const [R, L] = c.arms, k = strike(t, h, 0.25), pre = t < h ? Math.sin(t / h * Math.PI) * 0.4 : 0;
    arm(R, mix(mix(GUARD, [-0.5, 0.2, -2.2], pre), JAB, k), k * 0.16); arm(L, mix(GUARD, [-0.5, 0.1, -2.3], k));
    c.body.rotation.y = 0.75 * k - pre * 0.5; stance(c, Math.max(k, pre), 0.25);
  },
  hook(c, m, t, h) { // 勾拳：从腰间往上掏
    const [R, L] = c.arms, k = t < h ? ease(t / h) : 1, back = clamp((t - h - 0.05) / 0.15, 0, 1);
    arm(R, mix(mix([-0.3, 0.35, -1.7], [-2.6, 0.2, -1.0], k), GUARD, ease(back))); arm(L, GUARD);
    c.body.rotation.y = -0.4 + 0.9 * k * (1 - back); c.hips.position.y += 0.08 * k * (1 - back); c.rig.rotation.x = -0.15 * k * (1 - back);
  },
  slam(c, m, t, h) { // 撼山 / 震拳：双拳举过头，砸地
    const [R, L] = c.arms, up = [-3.0, 0.4, -0.7], down = [-0.8, 0.35, -0.2];
    const k = t < h * 0.6 ? ease(t / (h * 0.6)) : 0, s = t < h * 0.6 ? 0 : ease(clamp((t - h * 0.6) / (h * 0.4), 0, 1));
    const p = t < h * 0.6 ? mix(GUARD, up, k) : mix(up, down, s);
    arm(R, p); arm(L, p);
    c.hips.position.y += t < h * 0.6 ? 0.06 * k : -0.18 * s; c.rig.rotation.x = 0.35 * s;
  },
  rush(c, m, t) { // 连环拳：离哪个判定近就出哪只手，左右交替
    const [R, L] = c.arms;
    let i = 0;
    m.hits.forEach((x, j) => { if (Math.abs(t - x.t) < Math.abs(t - m.hits[i].t)) i = j; });
    const k = clamp(1 - Math.abs(t - m.hits[i].t) / 0.075, 0, 1), A = i % 2 ? L : R, B = i % 2 ? R : L;
    arm(A, mix(GUARD, JAB, k), k * 0.12); arm(B, GUARD);
    c.body.rotation.y = (i % 2 ? -0.35 : 0.35) * k; stance(c, 0.6, 0.15);
  },
  bash(c, m, t, h) { // 八极靠 / 撞山：侧身、沉肩撞过去
    const [R, L] = c.arms, k = strike(t, h, 0.25);
    arm(R, mix(GUARD, [-0.4, 0.1, -2.3], k)); arm(L, mix(GUARD, [0.4, -0.3, -0.8], k));
    c.body.rotation.y = 1.2 * k; stance(c, k, 0.3);
  },
  brace(c, m, t, h) { // 金钟罩：沉腰、双拳收在腰间
    const [R, L] = c.arms, k = ease(clamp(t / h, 0, 1));
    arm(R, mix(GUARD, [-0.3, 0.2, -2.0], k)); arm(L, mix(GUARD, [-0.3, 0.2, -2.0], k));
    c.hips.position.y -= 0.12 * k; c.legs[0].rotation.x = -0.3 * k; c.legs[1].rotation.x = 0.3 * k;
  },
  throw(c, m, t, h) { // 甩符：右手从耳后甩出，左手掐诀
    const [R, L] = c.arms, k = t < h ? ease(t / h) : 1, back = clamp((t - h - 0.04) / 0.16, 0, 1);
    arm(R, mix(mix([-2.7, 0.6, -1.6], [-1.5, -0.25, -0.05], k), [-1.3, 0.2, -0.6], ease(back)), k * 0.1 * (1 - back)); arm(L, SEAL);
    c.body.rotation.y = -0.4 + 0.8 * k - 0.3 * back;
  },
  cast(c, m, t, h) { // 布阵：双手合在胸前，再往前下方一推
    const [R, L] = c.arms, k = t < h ? 0 : ease(clamp((t - h) / 0.08, 0, 1)), p = mix(SEAL, [-1.3, 0.3, -0.3], k);
    arm(R, p, k * 0.08); arm(L, p, k * 0.08); c.hips.position.y -= 0.05 * k;
  },
  raise(c, m, t, h) { // 符雨 / 镇煞：右手剑指指天
    const [R, L] = c.arms, k = ease(clamp(t / h, 0, 1));
    arm(R, mix(SEAL, [-3.05, 0.1, -0.15], k)); arm(L, SEAL);
    c.body.rotation.y = 0.2 * k; c.rig.rotation.x = -0.1 * k;
  },
  snap(c, m, t, h) { // 引爆：剑指往旁边一划
    const [R, L] = c.arms, k = t < h ? ease(t / h) : 1;
    arm(R, mix([-1.4, -0.7, -0.4], [-1.55, 0.8, -0.1], k)); arm(L, SEAL);
    c.body.rotation.y = -0.3 + 0.6 * k;
  },
};

// 招式进行中返回 true（已摆好姿势）；不在出招时返回 false，由调用方走普通动画
export function animCombo(c, dt, m, t) {
  const [R, L] = c.arms;
  R.sh.position.z = 0; L.sh.position.z = 0;
  if (!m || t > m.cancel + 0.06) return false;
  const base = { move: 0, attack: -1, combo: 0, cast: 0, spin: 0, work: 0 };
  const h0 = m.hits[0]?.t ?? m.lunge?.[1] ?? 0.2;
  if (POSE2[m.pose]) {
    animChibi(c, dt, base);
    POSE2[m.pose](c, m, t, h0);
  } else if (SWING[m.pose]) {
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
