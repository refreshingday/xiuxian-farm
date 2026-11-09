// 扇（GDD 第 4 节武器表：扇/铃·法宝，控场）。第五件武器。
// 和剑 / 刀 / 拳 / 符都不一样：扇不靠砍，靠风——把人扇开、卷过来、托在半空、关进旋风里、从天上压下去。
// 伤害偏低、控制最强；拼刀最轻（main.js KIT_W 0.8）。
// 动作：右手单手执扇，左手背在身后（书生架子），用 comboAnim.js 的关键帧 keys（字段说明见 comboDao.js 开头），
//   m.lp = 单手时左手的姿势（这里是背手），m.stance = 下盘用哪一族弓步（hero_attack.js ST）
// 命中参数：knock < 0 = 往判定中心吸（扇子往回卷）；lift = 空中挨打被托多高；spike = 往下压；h.ang = 风刃偏角
const PI = Math.PI, TAU = PI * 2;
const BACK = [0.55, -0.35, -1.9];          // 左手背在身后
const READY = [-1.0, 0.25, -1.3, 0.1];     // 扇子收在胸前
const k = (t, p, o = {}) => ({ t, p, one: 1, ...o });
const base = { lp: BACK, stance: 'throw', color: '#8fe8c0' };

export const FAN_MOVES = {
  // 扇风：手腕一抖，扇面从右往左扇出一股风，把人推开
  sh1: { ...base, name: '扇风', dur: 0.4, cancel: 0.26,
    keys: [k(0, READY), k(0.1, [-1.4, -1.45, -1.0, -0.6], { st: 0.3, lean: -0.05 }),
      k(0.14, [-1.5, 1.25, -0.12, 0.55], { in: 1, st: 0.7, lean: 0.15, sq: -0.04 }), k(0.24, [-1.48, 1.2, -0.15, 0.5], { st: 0.7, lean: 0.12 }),
      k(0.4, [-1.1, 0.5, -0.9, 0.2], { st: 0.3 })],
    hits: [{ t: 0.14, shape: 'arc', range: 3.8, arc: 0.9, dmg: 8, knock: 9, stop: 0.03, shake: 0.1 }] },
  // 回扇：反手扇回来
  sh2: { ...base, name: '回扇', qi: 4, dur: 0.4, cancel: 0.26,
    keys: [k(0, [-1.1, 0.5, -0.9, 0.2]), k(0.1, [-1.3, 1.55, -1.1, 0.7], { st: 0.3, lean: -0.05 }),
      k(0.14, [-1.45, -1.35, -0.12, -0.6], { in: 1, st: 0.7, lean: 0.15, sq: -0.04 }), k(0.24, [-1.42, -1.3, -0.15, -0.55], { st: 0.7, lean: 0.12 }),
      k(0.4, [-1.05, -0.3, -0.9, -0.2], { st: 0.3 })],
    hits: [{ t: 0.14, shape: 'arc', range: 3.8, arc: 0.9, dmg: 8, knock: 9, stop: 0.03, shake: 0.1 }] },
  // 风刃：扇子举到耳后，往前一甩，三道风刃散开飞出去
  sh3: { ...base, name: '风刃', qi: 8, dur: 0.52, cancel: 0.34,
    keys: [k(0, [-1.05, -0.3, -0.9, -0.2]), k(0.11, [-2.8, -0.6, -1.4, -0.45], { lean: -0.15, sq: 0.05, st: 0.3 }),
      k(0.16, [-1.5, 0.15, -0.05, 0.25], { in: 1, lean: 0.2, st: 0.8 }), k(0.3, [-1.5, 0.15, -0.08, 0.25], { lean: 0.18, st: 0.8 }), k(0.52, READY, { st: 0.3 })],
    hits: [-0.4, 0, 0.4].map((ang) => ({ t: 0.16, shape: 'wave', ang, len: 6, w: 1.0, dmg: 7, knock: 5, stop: 0.02, shake: 0.1 })) },
  // 狂风：往后拧身蓄满，扇面整个推出去——一大片风墙把所有人吹飞
  sh_gale: { ...base, name: '狂风', qi: 16, end: true, dur: 0.88, cancel: 0.66,
    keys: [k(0, READY), k(0.2, [-1.3, -1.85, -0.8, -1.25], { st: 0.5, lean: -0.12, sq: 0.04 }), k(0.31, [-1.32, -1.9, -0.8, -1.3], { st: 0.55, lean: -0.14, sq: 0.05, tr: 0.03 }),
      k(0.36, [-1.55, 0, -0.02, 0.35], { in: 1, lean: 0.3, st: 1, sq: -0.06, one: 0.4 }), k(0.56, [-1.55, 0, -0.04, 0.32], { lean: 0.28, st: 1, one: 0.4 }), k(0.88, READY, { st: 0.4 })],
    hits: [{ t: 0.36, shape: 'arc', range: 3.2, arc: 1.2, dmg: 6, knock: 20, stop: 0.05, shake: 0.3 },
      { t: 0.36, shape: 'wave', len: 8, w: 3.2, dmg: 18, knock: 24, stop: 0.05, shake: 0.35 }] },
  // 扶摇：扇子从脚边往上一撩，一股上升气流把人托上天，再扇两下托着不让落地
  sh_lift: { ...base, name: '扶摇', qi: 16, end: true, dur: 0.88, cancel: 0.68,
    keys: [k(0, READY), k(0.12, [-0.3, -0.6, -0.4, -0.45], { st: 0.8, hip: -0.1, lean: 0.2 }),
      k(0.2, [-3.0, 0.3, -0.1, 0.3], { in: 1, lean: -0.2, hip: 0.1, sq: 0.12, st: 0.2 }),
      k(0.3, [-2.4, 0.2, -0.6, 0.2], { lean: -0.12, st: 0.3 }), k(0.36, [-3.0, 0.3, -0.1, 0.3], { in: 1, lean: -0.2, hip: 0.06, sq: 0.06, st: 0.3 }),
      k(0.46, [-2.4, 0.2, -0.6, 0.2], { lean: -0.12, st: 0.3 }), k(0.52, [-3.0, 0.3, -0.1, 0.3], { in: 1, lean: -0.2, hip: 0.06, sq: 0.06, st: 0.3 }),
      k(0.88, READY, { st: 0.3 })],
    hits: [{ t: 0.2, shape: 'circle', at: 2, r: 2.4, dmg: 12, knock: 1, launch: 9, stop: 0.05, shake: 0.25 },
      ...[0.36, 0.52].map((t) => ({ t, shape: 'circle', at: 2, r: 2.8, dmg: 5, knock: -2, lift: 6, vr: 6, stop: 0.02, shake: 0.08 }))] },
  // 卷风：扇子伸到最远，往怀里一兜——远处的人被风卷到跟前
  sh_pull: { ...base, name: '卷风', qi: 8, dur: 0.56, cancel: 0.38,
    keys: [k(0, READY), k(0.16, [-1.5, 0.95, -0.05, 0.55], { lean: 0.25, st: 0.7 }),
      k(0.24, [-1.2, -0.6, -1.6, -0.45], { in: 1, lean: -0.1, st: 0.3, sq: 0.03 }), k(0.38, [-1.2, -0.6, -1.6, -0.45], { lean: -0.08, st: 0.3 }), k(0.56, READY, { st: 0.3 })],
    hits: [{ t: 0.24, shape: 'arc', range: 5.4, arc: 0.8, dmg: 8, knock: -12, stop: 0.03, shake: 0.12 }] },
  // 旋涡：执扇原地转两圈，四周的风往里卷，把人聚成一堆，最后一扇全部掀开
  sh_vortex: { ...base, name: '旋涡', qi: 16, end: true, dur: 0.96, cancel: 0.74,
    keys: [k(0, [-1.2, -0.6, -1.6, -0.45]), k(0.06, [-1.5, -0.9, -0.15, 0], { st: 0.6 }),
      k(0.5, [-1.5, -0.9, -0.15, 0], { lin: 1, spin: 2 * TAU, st: 0.6, lean: 0.05 }),
      k(0.6, [-1.35, -1.8, -0.8, -1.2], { spin: 2 * TAU, st: 0.6, lean: -0.08 }),
      k(0.66, [-1.5, 1.4, -0.08, 0.8], { in: 1, spin: 2 * TAU, st: 1, lean: 0.25, sq: -0.05 }), k(0.8, [-1.5, 1.4, -0.1, 0.8], { spin: 2 * TAU, st: 1, lean: 0.22 }),
      k(0.96, READY, { spin: 2 * TAU, st: 0.3 })],
    hits: [0.14, 0.3, 0.46].map((t) => ({ t, shape: 'circle', at: 0, r: 4.2, dmg: 5, knock: -7, stop: 0.02, shake: 0.08 }))
      .concat([{ t: 0.66, shape: 'circle', at: 0, r: 3.2, dmg: 14, knock: 16, launch: 4, stop: 0.06, shake: 0.3 }]) },
  // 定风：扇子指着前方画圈，那里起一团旋风把人关在里面转，最后往上一挑
  sh_bind: { ...base, name: '定风', qi: 16, end: true, dur: 1.06, cancel: 0.84,
    keys: [k(0, READY), k(0.12, [-1.55, -0.4, -0.1, 0.2], { st: 0.7, lean: 0.15 }),
      ...[0.2, 0.27, 0.34, 0.41, 0.48, 0.55, 0.62, 0.69].map((t, i) => k(t, [-1.55 + (i % 2 ? 0.25 : -0.15), i % 2 ? 0.4 : -0.4, -0.1, 0.2], { st: 0.7, lean: 0.15 })),
      k(0.74, [-1.0, 0.1, -0.6, 0.1], { st: 0.6 }), k(0.8, [-2.9, 0.1, -0.1, 0.2], { in: 1, st: 0.3, lean: -0.15, sq: 0.08 }),
      k(1.06, READY, { st: 0.3 })],
    hits: [0.2, 0.34, 0.48, 0.62].map((t) => ({ t, shape: 'circle', at: 3.2, r: 2.2, dmg: 5, knock: -5, launch: 2, stop: 0.02, shake: 0.06 }))
      .concat([{ t: 0.8, shape: 'circle', at: 3.2, r: 2.4, dmg: 14, knock: 8, launch: 8, stop: 0.06, shake: 0.3 }]) },
  // 落风：踮脚把扇子举到最高，往下一扇——一股下压的风从天上砸下来，空中的人直接拍到地上
  sh_down: { ...base, name: '落风', qi: 20, end: true, dur: 0.88, cancel: 0.66,
    keys: [k(0, READY), k(0.22, [-3.1, -0.2, -0.3, -0.2], { lean: -0.25, hip: 0.1, sq: 0.12, st: 0.2 }),
      k(0.3, [-0.6, 0.1, -0.1, 0.1], { in: 1, lean: 0.5, st: 1, hip: -0.2, sq: -0.12 }), k(0.5, [-0.6, 0.1, -0.12, 0.1], { lean: 0.45, st: 1, hip: -0.18 }),
      k(0.88, READY, { st: 0.3 })],
    hits: [{ t: 0.3, shape: 'circle', at: 2.2, r: 3.2, dmg: 22, knock: 6, spike: 14, vr: 6, stop: 0.08, shake: 0.45 }] },
};
for (const id in FAN_MOVES) FAN_MOVES[id].id = id;

export const FAN_TREE = {
  '': 'sh1', F: 'sh2', S: 'sh_pull',
  FF: 'sh3', FS: 'sh_vortex',
  FFF: 'sh_gale', FFS: 'sh_lift',
  SF: 'sh_bind', SS: 'sh_down',
};
export const FAN_ROUTES = [
  { name: '狂风', seq: 'FFF', tag: '4连 · 风刃 → 风墙吹飞' },
  { name: '扶摇', seq: 'FFS', tag: '4连 · 托上天' },
  { name: '旋涡', seq: 'FS', tag: '3连 · 聚怪 → 掀开' },
  { name: '风刃', seq: 'FF', tag: '3连 · 三道风刃' },
  { name: '定风', seq: 'SF', tag: '3连 · 卷过来 → 旋风困住' },
  { name: '落风', seq: 'SS', tag: '3连 · 卷过来 → 下压拍地' },
];

export const FAN_SKILLS = [
  { id: 'sh_tornado', name: '龙卷', qi: 30, cd: 8, pose: 'raise', ht: 0.15 },
  { id: 'sh_wall', name: '风墙', qi: 20, cd: 6, pose: 'cast', ht: 0.1 },
  { id: 'sh_blades', name: '风刃', qi: 25, cd: 5, pose: 'throw', ht: 0.12 },
];

// ---------- 特效：风——淡青的气流线、风环、卷起的落叶，不用刀光 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const LEAF = '#7cc46a', WIND = '#c8f5de';
const leaves = (c, x, z, n = 8, o = {}) => c.fx.burst({ x, z }, LEAF, n, { speed: 3, up: 2, life: 0.9, y: 0.6, grav: -2, drag: 1.5, bright: 1.2, ...o });
// 一股风：往前推的风环 + 气流线 + 落叶
function gust(c, yaw, o = {}) {
  const s = o.scale ?? 1;
  c.cfx.airRing({ x: c.x, y: c.y, z: c.z }, yaw, c.color, { r0: 0.5 * s, r1: 1.8 * s, travel: 2.6 * s, dur: 0.3, op: 0.55 });
  c.cfx.airRing({ x: c.x, y: c.y, z: c.z }, yaw, WIND, { r0: 0.3 * s, r1: 1.3 * s, travel: 3.4 * s, dur: 0.36, op: 0.35, delay: 0.04 });
  c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, yaw, WIND, { n: o.n ?? 7, len: 1.6 * s, dur: 0.26 });
  c.cfx.arc(c, yaw, c.color, { y: 1.05 + c.y, tilt: o.tilt ?? 0, flip: o.flip, scale: 1.2 * s, sweep: 1.2, opacity: 0.16, dur: 0.24 });
  leaves(c, c.x + Math.sin(yaw) * 1.5, c.z + Math.cos(yaw) * 1.5, o.leaves ?? 6);
}
// 旋风柱：一摞横着转的风环（越往上越大），叶子绕着往上飘
export function tornado(c, x, z, dur = 0.3, r = 1.6) {
  for (let i = 0; i < 4; i++) {
    c.cfx.airRing({ x, y: 0, z }, rand(0, TAU), i % 2 ? WIND : c.color, { flat: true, y: 0.3 + i * 0.75, r0: r * (0.5 + i * 0.18), r1: r * (0.7 + i * 0.22), travel: 0, dur, op: 0.5, delay: i * 0.03 });
  }
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), rr = rand(0.4, r);
    c.fx.mote(x + Math.cos(a) * rr, rand(0.2, 2.6), z + Math.sin(a) * rr, LEAF, { vx: -Math.sin(a) * 3, vz: Math.cos(a) * 3, vy: 2, life: 0.6, size: 0.9, bright: 1.2 });
  }
}
// 吸：四周的气流线朝中心收
function suck(c, x, z, r) {
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + rand(-0.3, 0.3);
    c.cfx.streaks({ x: x + Math.sin(a) * r, y: 0, z: z + Math.cos(a) * r }, a + PI, WIND, { n: 2, len: 1.2, dur: 0.25 });
  }
  c.cfx.airRing({ x, y: 0, z }, 0, c.color, { flat: true, y: 0.2, r0: r, r1: r * 0.3, travel: 0, dur: 0.3, op: 0.5 });
}
const puff = (c, d) => { c.fx.burst(d.pos, WIND, 6, { speed: 4, up: 2, life: 0.3, y: 1.1 }); leaves(c, d.pos.x, d.pos.z, 3); };

export const FAN_FX = {
  sh1: { hit: (c) => gust(c, c.yaw, { tilt: -0.1 }), contact: puff },
  sh2: { hit: (c) => gust(c, c.yaw, { tilt: 0.1, flip: true }), contact: puff },
  sh3: { hit: (c, h) => { c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw + h.ang, WIND, { n: 3, len: 2, dur: 0.22 }); if (!h.ang) leaves(c, c.x, c.z, 6); }, contact: puff },
  sh_gale: {
    hit(c, h, i) {
      if (i) return;
      gust(c, c.yaw, { scale: 1.7, n: 12, leaves: 16 });
      for (const a of [-0.5, 0.5]) c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw + a, WIND, { n: 6, len: 2.4, dur: 0.32 });
      c.fx.burst({ x: c.x + c.fx0 * 2, z: c.z + c.fz0 * 2 }, '#c8b89a', 18, { speed: 7, up: 1.5, life: 0.5, y: 0.1, bright: 1 });
    },
    contact: puff,
  },
  sh_lift: {
    hit(c, h, i) {
      const x = c.x + c.fx0 * 2, z = c.z + c.fz0 * 2;
      c.cfx.streaks({ x, y: 0, z }, c.yaw, WIND, { up: true, n: i ? 4 : 9, len: i ? 1.4 : 2.4, dur: 0.3 });
      tornado(c, x, z, i ? 0.25 : 0.4, 1.4);
      if (!i) leaves(c, x, z, 14, { up: 8 });
    },
    contact: puff,
  },
  sh_pull: {
    hit(c) {
      const x = c.x + c.fx0 * 3.5, z = c.z + c.fz0 * 3.5;
      suck(c, x, z, 2.2);
      c.cfx.streaks({ x, y: c.y, z }, c.yaw + PI, WIND, { n: 8, len: 2, dur: 0.3 }); // 气流往怀里收
      leaves(c, x, z, 8);
    },
    contact: puff,
  },
  sh_vortex: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.cancel * 0.7); },
    hit(c, h, i) {
      if (i < 3) { suck(c, c.x, c.z, 4.2); tornado(c, c.x, c.z, 0.25, 1.2); return; }
      c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.3, r0: 0.6, r1: 4, travel: 0, dur: 0.35 });
      c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, WIND, { flat: true, y: 1.1, r0: 0.4, r1: 3.4, travel: 0, dur: 0.3 });
      leaves(c, c.x, c.z, 22, { speed: 8 });
    },
    contact: puff,
  },
  sh_bind: {
    hit(c, h, i) {
      tornado(c, c.cx, c.cz, i === 4 ? 0.45 : 0.3, i === 4 ? 2.2 : 1.8);
      if (i === 4) { c.cfx.streaks({ x: c.cx, y: 0, z: c.cz }, c.yaw, WIND, { up: true, n: 10, len: 2.6, dur: 0.35 }); leaves(c, c.cx, c.cz, 16, { up: 8 }); }
    },
    contact: puff,
  },
  sh_down: {
    hit(c) {
      const x = c.cx, z = c.cz;
      for (let i = 0; i < 3; i++) c.cfx.airRing({ x, y: 0, z }, 0, i % 2 ? WIND : c.color, { flat: true, y: 3 - i * 1.2, r0: 3.2 - i * 0.4, r1: 1.6, travel: 0, dur: 0.22, delay: i * 0.05 });
      c.cfx.airRing({ x, y: 0, z }, 0, c.color, { flat: true, y: 0.12, r0: 0.6, r1: 3.6, travel: 0, dur: 0.35, delay: 0.12 });
      c.fx.burst({ x, z }, '#c8b89a', 22, { speed: 7, up: 1, life: 0.5, y: 0.1, bright: 1 });
      leaves(c, x, z, 12, { speed: 6, up: 1 });
    },
    contact: (c, d) => { puff(c, d); c.cfx.star(d.pos, c.color, { size: 0.9 }); },
  },
};

// 扇的技能特效（伤害在 arena.js / combat.js 的 SKILLS）
export const FAN_SKILL_FX = {
  sh_tornado: (c, x, z, last) => { tornado(c, x, z, last ? 0.5 : 0.32, last ? 2.6 : 2.2); if (last) leaves(c, x, z, 20, { up: 9, speed: 6 }); },
  sh_wall(c) {
    for (let i = 0; i < 3; i++) c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, i % 2 ? WIND : c.color, { flat: true, y: 0.3 + i * 0.6, r0: 0.6, r1: 4.2, travel: 0, dur: 0.4, delay: i * 0.04 });
    leaves(c, c.x, c.z, 24, { speed: 9, up: 3 });
  },
  sh_blades(c) { for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw + a, WIND, { n: 2, len: 2, dur: 0.22 }); leaves(c, c.x, c.z, 8); },
};

// 音效：风声。只用低通 / 带通噪声，不要带音高的哨音（扇子不是剑，不要"咻"的金属感）
const whoosh = (s, { t = 0, dur = 0.28, f0 = 500, f1 = 1600, gain = 0.32 } = {}) => s.noise({ t, dur, type: 'bandpass', f0, f1, q: 0.6, gain, attack: dur * 0.4, send: 0.15 });
const gale = (s, big = 0) => { whoosh(s, { dur: 0.5 + big * 0.3, f0: 300, f1: 1200, gain: 0.4 + big * 0.2 }); s.noise({ t: 0.05, dur: 0.6 + big * 0.4, type: 'lowpass', f0: 900, f1: 200, q: 0.3, gain: 0.3 + big * 0.2, send: 0.3 }); };
const swirl = (s, dur = 0.6) => s.noise({ dur, type: 'bandpass', f0: 300, f1: 900, fm: 1300, q: 0.5, gain: 0.3, attack: dur * 0.5, send: 0.25 });
export const FAN_SFX = {
  sh1: { start: (s) => whoosh(s, { dur: 0.2, f0: 700, f1: 1500, gain: 0.25 }), hit: (s) => s.noise({ dur: 0.18, type: 'lowpass', f0: 1200, f1: 300, q: 0.3, gain: 0.25 }) },
  sh2: { start: (s) => whoosh(s, { dur: 0.2, f0: 750, f1: 1400, gain: 0.25 }), hit: (s) => s.noise({ dur: 0.18, type: 'lowpass', f0: 1200, f1: 300, q: 0.3, gain: 0.25 }) },
  sh3: { hit: (s, h) => { if (!h.ang) whoosh(s, { dur: 0.3, f0: 900, f1: 400, gain: 0.35 }); } },
  sh_gale: { start: (s) => whoosh(s, { dur: 0.35, f0: 300, f1: 700, gain: 0.2 }), hit: (s, h, i) => { if (!i) gale(s, 1); } },
  sh_lift: { hit: (s, h, i) => (i ? whoosh(s, { dur: 0.2, f0: 500, f1: 1100, gain: 0.2 }) : (gale(s, 0), s.airPop(0.3))) },
  sh_pull: { hit: (s) => whoosh(s, { dur: 0.35, f0: 1400, f1: 400, gain: 0.32 }) },
  sh_vortex: { start: (s) => swirl(s, 0.7), hit: (s, h, i) => { if (i === 3) { gale(s, 0.5); s.airPop(0.5); } } },
  sh_bind: { start: (s) => swirl(s, 0.9), hit: (s, h, i) => { if (i === 4) { gale(s, 0.3); s.airPop(0.4); } } },
  sh_down: { start: (s) => whoosh(s, { dur: 0.3, f0: 400, f1: 900, gain: 0.2 }), hit: (s) => { gale(s, 0.6); s.groundBoom(0.2); } },
};
export const FAN_SKILL_SFX = { tornado: (s) => swirl(s, 2.4), gale, whoosh };
