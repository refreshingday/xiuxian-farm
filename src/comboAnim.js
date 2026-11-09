// 连招动作：在共享骨架动画上叠加各招式姿势。试炼场和主游戏共用。
import { clamp } from './util.js';
import { animChibi } from './chibi.js';

// 关键帧 [肩 x, 肩 y, 肘, 身体扭转]：from = 蓄力位，to = 挥完位。斜劈 = 肩 x/y 同时变化
const SWING = {
  R: { from: [-2.7, -1.1, -1.1, -0.6], to: [-0.8, 1.0, -0.15, 0.55] },   // 右上 → 左下
  L: { from: [-2.5, 1.1, -1.2, 0.55], to: [-0.8, -1.1, -0.15, -0.6] },   // 左上 → 右下
  U: { from: [-0.6, -1.2, -0.9, -0.6], to: [-2.6, 0.9, -0.15, 0.5] },    // 右下 → 左上（撩）
  over: { from: [-3.1, -0.15, -1.4, -0.2], to: [-0.5, 0.05, -0.1, 0.1] }, // 竖劈
  H: { from: [-1.45, -1.6, -0.5, -0.8], to: [-1.45, 1.5, -0.1, 0.8] },  // 横扫：右 → 左，腰跟着拧
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

// ---- 刀：重劈 ----
// 节奏：蓄力拉得比剑更开 → 顶点再往后憋一下劲 → 极快劈下、劈过头（overshoot）→ 停在收势好一会儿 → 慢慢收刀。
// 身体：蓄力时后仰、踮起、拧腰；劈下时弓步压身、胯往下沉；双手握刀；整个人蓄力时拉长、命中那一下压扁（squash & stretch）
const HEAVY = { open: 1.2, coil: 1.32, over: 1.15, hold: 0.15, twist: 1.4 };
function heavyPose(c, kf, t, h0, end) {
  const s = Math.min(0.09, h0 * 0.3), w1 = h0 - s;      // w1：开始劈下的时刻
  const from = mix(kf.to, kf.from, HEAVY.open), coil = mix(kf.to, kf.from, HEAVY.coil), over = mix(kf.from, kf.to, HEAVY.over);
  let p, kw = 0, ki = 0;
  if (t < w1) {                                          // 蓄力：前 70% 拉开，后 30% 憋劲再往后一点
    const k = t / w1;
    p = k < 0.7 ? mix(REST, from, 1 - (1 - k / 0.7) ** 3) : mix(from, coil, ease((k - 0.7) / 0.3));
    kw = Math.min(1, k / 0.7);
  } else if (t < h0 + 0.015) {                           // 劈下：加速（k²），一口气劈过头
    const k = clamp((t - w1) / (h0 + 0.015 - w1), 0, 1);
    p = mix(coil, over, k * k); kw = 1 - k; ki = k;
  } else if (t < h0 + HEAVY.hold) { p = over; ki = 1; }   // 停住：让这一刀"砍实"
  else {                                                 // 收刀：慢慢回一半
    const k = ease(clamp((t - h0 - HEAVY.hold) / Math.max(0.05, end - h0 - HEAVY.hold), 0, 1));
    p = mix(over, REST, k * 0.75); ki = 1 - k;
  }
  setPose(c, [p[0], p[1], p[2], p[3] * HEAVY.twist]);
  const [R, L] = c.arms; // 左手也握上刀柄
  L.sh.rotation.set(p[0] * 0.95, p[1] - L.s * 0.3, L.s * 0.15); L.el.rotation.x = p[2] - 0.35;
  stance(c, Math.max(ki, kw * 0.35), 0);
  c.rig.rotation.x = -0.2 * kw + 0.42 * ki;
  c.hips.position.y += 0.06 * kw - 0.18 * ki;
  const sq = t >= h0 ? Math.max(0, 1 - (t - h0) / 0.14) : 0; // 命中瞬间压扁，0.14 秒弹回
  squash(c, 0.06 * kw - 0.12 * sq);
}
// 落地重劈（力劈华山）：落下那一刻压扁、弓步、胯沉到底，再慢慢起身
function heavyLand(c, dt0, end) {
  const ki = dt0 < HEAVY.hold ? 1 : 1 - ease(clamp((dt0 - HEAVY.hold) / Math.max(0.05, end), 0, 1));
  stance(c, ki, 0); c.rig.rotation.x = 0.5 * ki; c.hips.position.y -= 0.2 * ki;
  squash(c, -0.16 * Math.max(0, 1 - dt0 / 0.16));
}
// a > 0 拉长，a < 0 压扁（体积大致不变）。改的是 root 的缩放，主角新模型也会跟着变；招式结束在 animCombo 开头复原
function squash(c, a) {
  if (!c._sqOn) { c._sqOn = true; c._sqBase = c.root.scale.x; }
  const b = c._sqBase; c.root.scale.set(b * (1 - a * 0.5), b * (1 + a), b * (1 - a * 0.5));
}

// ---- 刀：关键帧动作（comboDao.js 的 keys）----
// m.lp = 单手时左手放哪（扇：背在身后），缺省张开压平衡
// 每段之间默认平滑过渡；in = 这一段加速（k²）劈下；lin = 匀速（舞刀转圈）。数值字段缺省为 0，sw 缺省 π（正握）
const KF = ['lean', 'hip', 'st', 'sq', 'spin', 'one', 'tr'];
const FREE_L = [-0.9, 0.2, -0.5]; // 单手时左手张开压住平衡
function keyAt(m, t) {
  const K = m.keys;
  let i = 0;
  while (i < K.length - 1 && t >= K[i + 1].t) i++;
  const A = K[i], B = K[i + 1] || A;
  let k = B === A ? 0 : clamp((t - A.t) / (B.t - A.t), 0, 1);
  k = B.in ? k * k : B.lin ? k : ease(k);
  const o = { p: mix(A.p, B.p, k), sw: (A.sw ?? Math.PI) + ((B.sw ?? Math.PI) - (A.sw ?? Math.PI)) * k };
  for (const f of KF) o[f] = (A[f] || 0) + ((B[f] || 0) - (A[f] || 0)) * k;
  return o;
}
export const daoKeyVal = (m, t, f) => keyAt(m, t)[f];
function daoKeys(c, m, t) {
  const o = keyAt(m, t), p = o.p.slice();
  if (o.tr) { const j = Math.sin(t * 90) * o.tr; p[0] += j; p[3] += j * 0.5; } // 憋劲发抖
  setPose(c, p);
  const [R, L] = c.arms;
  const g = [p[0] * 0.95, p[1] - L.s * 0.3, p[2] - 0.35]; // 左手握刀柄
  const l = mix(g, m.lp || FREE_L, o.one);
  L.sh.rotation.set(l[0], l[1], L.s * (0.15 + 0.3 * o.one)); L.el.rotation.x = l[2];
  if (c.sword) c.sword.rotation.x = o.sw;
  c.legs[0].rotation.x = -0.7 * o.st; c.legs[1].rotation.x = 0.5 * o.st;
  c.hips.position.y += o.hip - 0.1 * o.st;
  c.rig.rotation.x = o.lean; c.rig.rotation.y = o.spin;
  squash(c, o.sq);
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
  if (c._sqOn) { c.root.scale.setScalar(c._sqBase); c._sqOn = false; } // 刀的压扁 / 拉长复原
  if (!m || t > m.dur) return false; // 姿势撑满整招（原来 cancel+0.06 就收，收招段会提前变回待机）
  const base = { move: 0, attack: -1, combo: 0, cast: 0, spin: 0, work: 0 };
  const h0 = m.hits[0]?.t ?? m.lunge?.[1] ?? 0.2;
  if (m.keys) {
    animChibi(c, dt, base);
    daoKeys(c, m, t);
  } else if (POSE2[m.pose]) {
    animChibi(c, dt, base);
    POSE2[m.pose](c, m, t, h0);
  } else if (m.swings) { // 多段劈砍（狂刀）：每个判定一刀，方向按 swings 轮换，上一刀收势处接下一刀蓄力
    animChibi(c, dt, base);
    let i = 0;
    while (i < m.hits.length - 1 && t > m.hits[i].t + 0.03) i++;
    const t0 = i ? m.hits[i - 1].t + 0.03 : 0, kf = SWING[m.swings[i % m.swings.length]];
    if (m.heavy) heavyPose(c, kf, t - t0, m.hits[i].t - t0, (m.hits[i + 1]?.t ?? m.dur) - t0);
    else setPose(c, swingPose(kf, t - t0, m.hits[i].t - t0));
  } else if (SWING[m.pose]) {
    animChibi(c, dt, base);
    if (m.heavy) heavyPose(c, SWING[m.pose], t, h0, m.dur); // 刀
    else setPose(c, swingPose(SWING[m.pose], t, h0));
  } else if (m.pose === 'leap') {
    const L = m.leap, k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1);
    animChibi(c, dt, base);
    const top = m.heavy ? mix(SWING.over.to, SWING.over.from, HEAVY.coil) : SWING.over.from, cut = m.heavy ? 0.75 : 0.55; // 刀：空中把刀举得更高，最后才劈
    setPose(c, k < cut ? mix(REST, top, ease(k / cut)) : mix(top, m.heavy ? mix(SWING.over.from, SWING.over.to, HEAVY.over) : SWING.over.to, ((k - cut) / (1 - cut)) ** 2));
    c.legs[0].rotation.x = -0.9 * Math.sin(k * Math.PI); c.legs[1].rotation.x = -0.4 * Math.sin(k * Math.PI);
    if (m.heavy && k < 1) { c.rig.rotation.x = -0.25 * Math.sin(k * Math.PI); squash(c, 0.08 * Math.sin(k * Math.PI)); }
    if (m.heavy && t >= L.t1) heavyLand(c, t - L.t1, m.dur - L.t1);
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
