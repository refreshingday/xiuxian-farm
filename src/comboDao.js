// 刀（GDD 第 4 节武器表：重击，范围劈砍）。比剑慢、更重，拼刀时更重（main.js KIT_W）。
// 刀和剑不走一个路子：剑是快斩、突刺、剑气；刀是砍进地里、拖刀、撩、舞花、肩撞、反手插地、蓄力霸劈——
// 每一招都"砸地"，刀光少、碎石 / 地裂 / 尘土多。
// 动作用关键帧 keys（comboAnim.js daoKeys）：每帧 { t, p:[肩x, 肩y, 肘, 腰扭], lean 前倾, hip 沉胯, st 弓步, sq 压扁/拉长,
//   spin 整个人转（弧度）, sw 刀相对手的角度（π 正握 / 0 反握）, one 左手松开（0 双手握 / 1 单手）, tr 抖, in 这一段加速劈下 }
const PI = Math.PI, TAU = PI * 2;
const cut = (t, o) => ({ t, shape: 'arc', range: 3.0, arc: 1.4, ...o });
// 常用姿势
const P = {
  ready: [-0.9, 0.3, -0.5, 0.2],                // 架势
  shoulderR: [-2.9, -1.2, -1.3, -0.9],          // 刀扛在右肩后
  ground: [-0.35, 0.75, -0.05, 0.65],           // 斜劈到底，刀尖砍进左前方地里
  overTop: [-3.35, -0.1, -1.55, -0.35],         // 双手举刀过顶、刀背贴背
  overDown: [-0.3, 0.05, -0.05, 0.1],           // 竖劈到底
  drag: [0.75, -0.5, -0.05, -0.9],              // 拖刀：刀垂在右后方，刀尖擦地
};
const k = (t, p, o = {}) => ({ t, p, ...o });

export const DAO_MOVES = {
  // 斩：刀从右肩后斜着砍进地里（剑是挥空，刀是砍到底）
  dao1: { name: '斩', heavy: true, dur: 0.46, cancel: 0.32, color: '#ffb070', motion: [{ t0: 0.04, t1: 0.17, dist: 1.0, seek: true }],
    keys: [k(0, P.ready), k(0.12, P.shoulderR, { lean: -0.15, st: 0.3, sq: 0.05, hip: 0.04 }),
      k(0.17, P.ground, { in: 1, lean: 0.45, st: 1, hip: -0.15, sq: -0.1 }), k(0.3, P.ground, { lean: 0.42, st: 1, hip: -0.14 }), k(0.46, P.ready, { st: 0.5, lean: 0.15 })],
    hits: [cut(0.17, { range: 3.1, arc: 1.2, dmg: 13, knock: 7, stop: 0.05, shake: 0.22 })] },
  // 回刀：把刀从地里拔出来，顺势从左下往右上反撩，挑起一点
  dao2: { name: '回刀', heavy: true, dur: 0.46, cancel: 0.32, color: '#ffb070', qi: 6, motion: [{ t0: 0.04, t1: 0.17, dist: 0.8, seek: true }],
    keys: [k(0, P.ground, { lean: 0.4, st: 1, hip: -0.12 }), k(0.11, [-0.12, 1.05, -0.2, 1.0], { lean: 0.5, st: 1, hip: -0.16, sq: -0.04 }),
      k(0.17, [-2.85, -1.1, -0.2, -0.85], { in: 1, lean: -0.25, st: 0.4, hip: 0.05, sq: 0.1 }), k(0.3, [-2.8, -1.05, -0.25, -0.8], { lean: -0.2, st: 0.4 }),
      k(0.46, [-1.3, -0.4, -0.6, -0.3], { st: 0.5 })],
    hits: [cut(0.17, { range: 3.0, arc: 1.3, dmg: 13, knock: 5, launch: 2.5, stop: 0.05, shake: 0.2 })] },
  // 拖刀撩：刀拖在身后贴地冲过去（一路火星），冲到跟前一刀往上撩飞
  dao3: { name: '拖刀撩', heavy: true, dur: 0.75, cancel: 0.56, color: '#ff9a5a', qi: 10, motion: [{ t0: 0.08, t1: 0.4, dist: 2.8, seek: true }],
    keys: [k(0, [-1.3, -0.4, -0.6, -0.3]), k(0.1, P.drag, { lean: 0.45, st: 0.8, hip: -0.1 }), k(0.36, P.drag, { lean: 0.55, st: 0.9, hip: -0.12, sq: -0.03 }),
      k(0.42, [-2.95, 0.4, -0.15, 0.65], { in: 1, lean: -0.3, st: 0.3, hip: 0.08, sq: 0.12 }), k(0.56, [-2.9, 0.4, -0.2, 0.6], { lean: -0.25, st: 0.3 }),
      k(0.75, [-1.4, 0.2, -0.6, 0.2], { st: 0.5 })],
    hits: [0.16, 0.26, 0.35].map((t) => ({ t, shape: 'circle', at: 0.6, r: 1.3, dmg: 3, knock: 0.5, stop: 0, shake: 0.06, drag: true }))
      .concat([cut(0.42, { range: 3.0, arc: 1.2, dmg: 16, knock: 4, launch: 7, stop: 0.08, shake: 0.4 })]) },
  // 开山：刀举过顶、刀背贴背憋劲（会抖），再整个人压下去竖劈
  dao_cleave: { name: '开山', heavy: true, dur: 0.72, cancel: 0.5, color: '#ff9a5a', qi: 12, motion: [{ t0: 0.24, t1: 0.36, dist: 0.9, seek: true }],
    keys: [k(0, P.ready), k(0.18, P.overTop, { lean: -0.3, st: 0.3, hip: 0.06, sq: 0.08 }), k(0.3, P.overTop, { lean: -0.34, st: 0.35, hip: 0.07, sq: 0.1, tr: 0.05 }),
      k(0.36, P.overDown, { in: 1, lean: 0.55, st: 1, hip: -0.2, sq: -0.14 }), k(0.52, P.overDown, { lean: 0.5, st: 1, hip: -0.18 }), k(0.72, [-0.8, 0, -0.4, 0.05], { st: 0.6, lean: 0.2 })],
    hits: [cut(0.36, { range: 3.6, arc: 0.7, dmg: 22, knock: 14, stop: 0.09, shake: 0.45 })] },
  // 镇岳：刀在手里翻成反握举起，整个人蹲下把刀插进地里——一圈一圈地刺往外炸，先把人吸过来再掀飞
  dao_plant: { name: '镇岳', heavy: true, dur: 0.98, cancel: 0.76, end: true, color: '#ff8a4a', qi: 18,
    keys: [k(0, [-1.3, -0.4, -0.6, -0.3], { sw: PI }), k(0.18, [-2.7, 0.1, -0.3, 0], { sw: 0, lean: -0.2, hip: 0.1, sq: 0.1, st: 0.2 }),
      k(0.32, [-2.75, 0.1, -0.3, 0], { sw: 0, lean: -0.22, hip: 0.11, sq: 0.12, st: 0.2, tr: 0.04 }),
      k(0.38, [-0.95, 0.1, -0.1, 0], { sw: 0, in: 1, lean: 0.7, hip: -0.3, st: 1, sq: -0.16 }), k(0.75, [-0.95, 0.1, -0.1, 0], { sw: 0, lean: 0.66, hip: -0.28, st: 1 }),
      k(0.98, [-0.95, 0.1, -0.3, 0], { sw: 0, lean: 0.3, hip: -0.1, st: 0.6 })],
    hits: [{ t: 0.38, shape: 'circle', at: 0.8, r: 2.2, dmg: 18, knock: 2, pull: 0.5, stop: 0.1, shake: 0.5 },
      { t: 0.5, shape: 'circle', at: 0, r: 3.4, dmg: 12, knock: 6, launch: 5, stop: 0.03, shake: 0.3 },
      { t: 0.62, shape: 'circle', at: 0, r: 5.0, dmg: 12, knock: 12, launch: 4, stop: 0.03, shake: 0.35 }] },
  // 盘龙刀：单手把刀在头顶舞两圈（刀平着转，扫一整圈），最后双手收回过顶一刀砸下
  dao_wheel: { name: '盘龙刀', heavy: true, dur: 1.02, cancel: 0.8, end: true, color: '#ff9a5a', qi: 20, moveSpd: 2,
    keys: [k(0, [-1.4, 0.2, -0.6, 0.2]), k(0.1, [-3.0, -1.2, -1.5, 0], { lean: -0.1, st: 0.4, hip: 0.05, one: 1 }),
      k(0.46, [-3.0, -1.2 + 2 * TAU, -1.5, 0], { lin: 1, lean: -0.1, st: 0.5, hip: 0.04, one: 1, sq: 0.04 }),
      k(0.54, [-3.35, 2 * TAU - 0.1, -1.55, -0.35], { lean: -0.32, st: 0.35, hip: 0.08, sq: 0.1 }),
      k(0.62, [-0.3, 2 * TAU + 0.05, -0.05, 0.1], { in: 1, lean: 0.62, st: 1, hip: -0.22, sq: -0.16 }), k(0.8, [-0.3, 2 * TAU + 0.05, -0.05, 0.1], { lean: 0.58, st: 1, hip: -0.2 }),
      k(1.02, [-0.8, 2 * TAU, -0.4, 0.05], { st: 0.6, lean: 0.2 })],
    hits: [0.2, 0.38].map((t) => ({ t, shape: 'circle', at: 0, r: 3.0, dmg: 11, knock: -2, stop: 0.04, shake: 0.18 }))
      .concat([cut(0.62, { range: 3.8, arc: 0.9, dmg: 26, knock: 16, launch: 4, stop: 0.1, shake: 0.55 })]) },
  // 铁山靠·劈：刀收在身后、侧身用肩膀撞过去，把人撞得一顿，再追上一步举刀劈下
  dao_bash: { name: '铁山靠', heavy: true, dur: 1.0, cancel: 0.78, end: true, color: '#ff8a4a', qi: 20,
    motion: [{ t0: 0.04, t1: 0.22, dist: 2.6, seek: true }, { t0: 0.42, t1: 0.6, dist: 1.2, seek: true }],
    keys: [k(0, [-1.4, 0.2, -0.6, 0.2]), k(0.1, [0.5, -0.6, -0.4, 1.3], { lean: 0.3, st: 0.6, hip: -0.05, one: 1 }),
      k(0.22, [0.55, -0.6, -0.4, 1.45], { in: 1, lean: 0.45, st: 1, hip: -0.12, sq: -0.1, one: 1 }), k(0.32, [0.55, -0.6, -0.4, 1.4], { lean: 0.4, st: 1, hip: -0.1, one: 1 }),
      k(0.52, P.overTop, { lean: -0.32, st: 0.3, hip: 0.08, sq: 0.1 }),
      k(0.6, P.overDown, { in: 1, lean: 0.6, st: 1, hip: -0.22, sq: -0.15 }), k(0.78, P.overDown, { lean: 0.55, st: 1, hip: -0.2 }), k(1.0, [-0.8, 0, -0.4, 0.05], { st: 0.6, lean: 0.2 })],
    hits: [{ t: 0.22, shape: 'circle', at: 0.9, r: 1.6, dmg: 10, knock: 3, stop: 0.08, shake: 0.35, bash: true },
      cut(0.6, { range: 3.6, arc: 0.8, dmg: 26, knock: 16, launch: 3, stop: 0.1, shake: 0.55 })] },
  // 拖刀计：佯退——拖着刀往后撤，突然原地拧身一整圈，刀贴着地横扫一圈
  dao_feint: { name: '拖刀计', heavy: true, dur: 0.96, cancel: 0.74, end: true, color: '#ff9a5a', qi: 18, iframe: 0.3,
    motion: [{ t0: 0.04, t1: 0.36, dist: 1.8, ang: PI }],
    keys: [k(0, [-0.8, 0, -0.4, 0.05]), k(0.12, P.drag, { lean: 0.2, st: 0.6, hip: -0.06 }), k(0.38, P.drag, { lean: 0.3, st: 0.7, hip: -0.08 }),
      k(0.44, [-1.45, -1.8, -0.5, -1.2], { st: 0.8, hip: -0.1, lean: 0.15, one: 1 }),
      k(0.52, [-1.3, 1.6, -0.1, 0.9], { in: 1, spin: TAU, st: 1, hip: -0.18, lean: 0.3, sq: -0.08, one: 1 }), k(0.68, [-1.3, 1.6, -0.1, 0.9], { spin: TAU, st: 1, hip: -0.16, lean: 0.28, one: 1 }),
      k(0.96, [-0.9, 0.3, -0.5, 0.2], { spin: TAU, st: 0.5, lean: 0.1 })],
    hits: [0.18, 0.3].map((t) => ({ t, shape: 'circle', at: -0.6, r: 0.9, dmg: 2, knock: 0, stop: 0, shake: 0.04, drag: true }))
      .concat([{ t: 0.5, shape: 'circle', at: 0, r: 3.9, dmg: 24, knock: 18, launch: 2, stop: 0.1, shake: 0.5 }]) },
  // 霸刀：举刀过顶憋足劲（刀身越来越亮、整个人在抖），一刀劈下，身前落下一道巨大的刀影，砸出大坑
  dao_break: { name: '霸刀', heavy: true, dur: 1.18, cancel: 0.9, end: true, color: '#ff6a2a', qi: 30, charge: 0.64,
    motion: [{ t0: 0.54, t1: 0.64, dist: 1.0, seek: true }],
    keys: [k(0, [-0.8, 0, -0.4, 0.05]), k(0.2, [-3.4, -0.2, -1.6, -0.4], { lean: -0.35, hip: 0.08, sq: 0.1, st: 0.3 }),
      k(0.56, [-3.45, -0.2, -1.6, -0.45], { lean: -0.4, hip: 0.1, sq: 0.13, st: 0.35, tr: 0.06 }),
      k(0.64, [-0.25, 0.05, -0.05, 0.1], { in: 1, lean: 0.75, st: 1, hip: -0.3, sq: -0.2 }), k(0.92, [-0.25, 0.05, -0.05, 0.1], { lean: 0.7, st: 1, hip: -0.28 }),
      k(1.18, [-0.8, 0, -0.4, 0.05], { st: 0.6, lean: 0.2 })],
    hits: [cut(0.64, { range: 4.0, arc: 0.9, dmg: 40, knock: 10, stop: 0.16, shake: 0.9 }),
      { t: 0.7, shape: 'circle', at: 3.0, r: 2.6, dmg: 18, knock: 12, launch: 6, stop: 0.04, shake: 0.4 }] },
};
for (const id in DAO_MOVES) DAO_MOVES[id].id = id;

// 刀的节奏和分量：整张表统一放慢 slow 倍（前摇、出招、位移、关键帧都拉长），伤害 / 击退 / 顿帧 / 震屏加重。
// 上面写的是基础数，调手感改这里
const DAO_TUNE = { slow: 1.3, dmg: 1.35, knock: 1.2, stop: 1.7, shake: 1.4 };
for (const m of Object.values(DAO_MOVES)) {
  const s = DAO_TUNE.slow;
  m.dur *= s; m.cancel *= s;
  if (m.iframe) m.iframe *= s;
  if (m.charge) m.charge *= s;
  if (m.keys) m.keys = m.keys.map((f) => ({ ...f, t: f.t * s }));
  if (m.motion) m.motion = m.motion.map((x) => ({ ...x, t0: x.t0 * s, t1: x.t1 * s }));
  m.hits = m.hits.map((h) => (h.drag ? { ...h, t: h.t * s } : { ...h, t: h.t * s, dmg: Math.round(h.dmg * DAO_TUNE.dmg), knock: h.knock * DAO_TUNE.knock,
    stop: Math.min(0.2, Math.max(0.05, (h.stop || 0) * DAO_TUNE.stop)), shake: Math.min(1, (h.shake ?? 0.15) * DAO_TUNE.shake) }));
}

export const DAO_TREE = {
  '': 'dao1', F: 'dao2', S: 'dao_cleave',
  FF: 'dao3', FS: 'dao_plant',
  FFF: 'dao_wheel', FFS: 'dao_bash',
  SF: 'dao_feint', SS: 'dao_break',
};
export const DAO_ROUTES = [
  { name: '盘龙刀', seq: 'FFF', tag: '4连 · 拖刀撩 → 头顶舞刀 → 砸' },
  { name: '铁山靠', seq: 'FFS', tag: '4连 · 肩撞 → 追劈' },
  { name: '镇岳', seq: 'FS', tag: '3连 · 反手插地 · 吸人地刺' },
  { name: '拖刀撩', seq: 'FF', tag: '3连 · 贴地冲 · 撩飞' },
  { name: '拖刀计', seq: 'SF', tag: '3连 · 佯退回身满圈' },
  { name: '霸刀', seq: 'SS', tag: '3连 · 蓄力 · 巨刀影' },
];

export const DAO_SKILLS = [
  { id: 'dao_storm', name: '刀轮', qi: 30, cd: 6, pose: 'spin', ht: 0.12 },
  { id: 'dao_wave', name: '刀罡', qi: 25, cd: 5, pose: 'over', ht: 0.18 },
  { id: 'dao_split', name: '开天', qi: 35, cd: 9, pose: 'over', ht: 0.2 },
];

// ---------- 特效：刀光比剑光宽、长，外面再拖一道暗橙的余光 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const R = -0.6, L = 0.6;
const DUST = '#b89a6a';
// 刀光：彩色宽弧 + 白色刃线 + 外面一道拖得更久的暗橙余光。整体比剑光大一圈（刀身更长），停留更久
function slash(c, o) {
  const y = (o.y ?? 1.05) + c.y, yaw = o.yaw ?? c.yaw, s = (o.scale ?? 1.35) * 1.22;
  c.cfx.arc(c, yaw, c.color, { ...o, y, scale: s, sweep: o.sweep ?? 1.1, opacity: 0.7, dur: 0.34 });
  c.cfx.arc(c, yaw, '#ff6a2a', { ...o, y, scale: s * 1.2, sweep: o.sweep ?? 1.1, opacity: 0.32, dur: 0.42, delay: 0.03 });
  c.cfx.arc(c, yaw, '#ffffff', { ...o, y, scale: s * 0.92, sweep: (o.sweep ?? 1.1) * 0.9, opacity: 0.35, dur: 0.18 });
}
// 砍中：火星 + 冲击星 + 脚下扬尘，每一刀都"砍实"
const sparks = (c, d, n = 6) => {
  c.fx.burst({ x: d.pos.x, y: d.pos.y, z: d.pos.z }, '#ffd8a0', n * 2, { speed: 7, up: 4, life: 0.32, y: 1.1 });
  c.cfx.star(d.pos, c.color, { size: 0.9 + n * 0.05 });
  c.fx.burst({ x: d.pos.x, z: d.pos.z }, '#b89a6a', 6, { speed: 3, up: 2, life: 0.4, y: 0.1, bright: 1 });
};
const chip = (c, x, z, n = 10) => c.fx.burst({ x, z }, DUST, n, { speed: 4, up: 4, life: 0.5, y: 0.2, bright: 1 });
// 刀砍进地面：一道光缝 + 碎石
function bite(c, x, z, len, w = 0.5) {
  c.cfx.crack(x, z, x + c.fx0 * len, z + c.fz0 * len, c.color, w, 0.8);
  chip(c, x + c.fx0 * 0.5, z + c.fz0 * 0.5, 12);
}

// 刀砍出 / 拔出地面时往上溅的碎石
const kick = (c, x, z, n = 10) => c.fx.burst({ x, z }, DUST, n, { speed: 3, up: 7, life: 0.55, y: 0.2, bright: 1 });
// 拖刀：刀尖在身后擦地，一路火星 + 一小截光缝
function scrape(c, back = 0.9) {
  const x = c.x - c.fx0 * back, z = c.z - c.fz0 * back;
  c.fx.burst({ x, z }, '#ffc070', 8, { speed: 4, up: 2.5, life: 0.25, y: 0.12 });
  c.cfx.crack(x, z, x - c.fx0 * 0.9, z - c.fz0 * 0.9, c.color, 0.22, 0.45);
}
// 一圈地刺：圆周上一簇簇石刺冒出来
function spikeRing(c, x, z, r, n, delay = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand(-0.2, 0.2);
    c.cfx.shards(x + Math.cos(a) * r, z + Math.sin(a) * r, 3, 0.5, delay);
  }
  c.fx.shockRing(x, z, r + 0.6, c.color, 0.35);
}

export const DAO_FX = {
  dao1: {
    hit(c) { slash(c, { tilt: R, y: 1.0 }); bite(c, c.x + c.fx0 * 1.6 - c.fz0 * 0.5, c.z + c.fz0 * 1.6 + c.fx0 * 0.5, 1.2, 0.35); },
    contact: (c, d) => sparks(c, d),
  },
  dao2: { // 反撩：刀光从左下往右上，地上溅起碎石
    hit(c) { slash(c, { tilt: 0.9, flip: true, y: 1.2 }); kick(c, c.x + c.fx0 * 1.4 + c.fz0 * 0.5, c.z + c.fz0 * 1.4 - c.fx0 * 0.5, 10); },
    contact: (c, d) => sparks(c, d),
  },
  dao3: {
    start(c) { c.fx.burst({ x: c.x, z: c.z }, DUST, 12, { speed: 4, up: 2, life: 0.5, y: 0.1, bright: 1 }); },
    hit(c, h, i) {
      if (h.drag) { scrape(c); return; }
      slash(c, { tilt: PI / 2, scale: 1.5, sweep: 1.4, y: 1.4 }); // 竖着往上撩
      kick(c, c.x + c.fx0, c.z + c.fz0, 16);
      c.cfx.pillar(c.x + c.fx0 * 1.4, c.z + c.fz0 * 1.4, 0.6, 3, c.color, 0.3);
      c.cfx.streaks(c, c.yaw, '#ffe0b0', { n: 5, len: 1.4 });
    },
    contact: (c, d, h) => (h.drag ? c.fx.burst(d.pos, '#ffc070', 5, { speed: 4, up: 2, life: 0.2, y: 0.8 }) : sparks(c, d, 10)),
  },
  dao_cleave: {
    hit(c) {
      slash(c, { tilt: -PI / 2, scale: 1.5, sweep: 1.3, y: 1.2 });
      bite(c, c.x + c.fx0 * 1.2, c.z + c.fz0 * 1.2, 3.2, 0.6);
      c.cfx.shards(c.x + c.fx0 * 2.4, c.z + c.fz0 * 2.4, 6, 0.9);
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 16, 0.25);
    },
    contact: (c, d) => { sparks(c, d, 10); c.cfx.star(d.pos, c.color, { size: 1 }); },
  },
  dao_plant: {
    start(c) { c.fx.burst(c, c.color, 10, { speed: 2, up: 3, life: 0.4, y: 1.8 }); },
    hit(c, h, i) {
      const x = c.x + c.fx0 * 0.8, z = c.z + c.fz0 * 0.8;
      if (i === 0) { // 刀插进地里
        c.cfx.dent(x, z, 1.6, c.color, { n: 6 }); c.cfx.disc(x, z, 2.2, c.color, 0.35, 0.4);
        c.cfx.flash(x, z, c.color, 24, 0.3, 0.6); kick(c, x, z, 18);
        for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; c.cfx.crack(x, z, x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4, c.color, 0.3, 0.9); }
        return;
      }
      spikeRing(c, x, z, i === 1 ? 2.6 : 4.4, i === 1 ? 7 : 11);
      kick(c, x, z, 8);
    },
    contact: (c, d) => sparks(c, d, 6),
  },
  dao_wheel: {
    hit(c, h, i) {
      if (i < 2) { // 头顶平着舞一圈
        slash(c, { tilt: 0, scale: 1.4, sweep: 2.6, yaw: c.yaw + i * PI, y: 2.1 });
        c.fx.burst({ x: c.x, z: c.z }, DUST, 10, { speed: 5, up: 1, life: 0.4, y: 0.15, bright: 1 });
        return;
      }
      slash(c, { tilt: -PI / 2, scale: 1.6, sweep: 1.3, y: 1.25 });
      bite(c, c.x + c.fx0, c.z + c.fz0, 3.8, 0.65);
      c.cfx.dent(c.x + c.fx0 * 2.2, c.z + c.fz0 * 2.2, 1.6, c.color, { n: 6 });
      c.cfx.shards(c.x + c.fx0 * 2.4, c.z + c.fz0 * 2.4, 7, 1.1);
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 22, 0.3);
    },
    contact: (c, d, h, i) => sparks(c, d, i === 2 ? 12 : 5),
  },
  dao_bash: {
    start(c) { c.fx.burst({ x: c.x, z: c.z }, DUST, 14, { speed: 4, up: 2, life: 0.5, y: 0.1, bright: 1 }); },
    hit(c, h, i) {
      if (i === 0) { // 肩撞：前面一圈气浪 + 扬尘
        c.cfx.airRing({ x: c.x + c.fx0 * 0.9, y: 1, z: c.z + c.fz0 * 0.9 }, c.yaw, '#ffe0b0', { r0: 0.4, r1: 1.6, travel: 1.2, dur: 0.25 });
        c.fx.burst({ x: c.x, z: c.z }, DUST, 14, { speed: 5, up: 2, life: 0.45, y: 0.15, bright: 1 });
        return;
      }
      slash(c, { tilt: -PI / 2, scale: 1.55, sweep: 1.3, y: 1.25 });
      bite(c, c.x + c.fx0, c.z + c.fz0, 3.6, 0.6);
      c.cfx.shards(c.x + c.fx0 * 2.2, c.z + c.fz0 * 2.2, 6, 1);
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 20, 0.3);
    },
    contact: (c, d, h, i) => { if (i === 0) { c.cfx.star(d.pos, '#ffe0b0', { size: 1.1 }); c.fx.burst(d.pos, '#ffe0b0', 10, { speed: 6, up: 2, life: 0.25, y: 1 }); } else sparks(c, d, 12); },
  },
  dao_feint: {
    hit(c, h, i) {
      if (h.drag) { scrape(c, -0.6); return; }
      for (let k = 0; k < 3; k++) slash(c, { tilt: 0.04, scale: 1.65, sweep: 2.3, yaw: c.yaw + k * 2.1, y: 0.55, delay: k * 0.03 }); // 贴地一整圈
      c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.12, r0: 0.8, r1: 4.2, travel: 0, dur: 0.32 });
      c.fx.burst({ x: c.x, z: c.z }, DUST, 22, { speed: 8, up: 2, life: 0.5, y: 0.15, bright: 1 });
    },
    contact: (c, d) => sparks(c, d, 8),
  },
  dao_break: {
    start(c, m) { // 憋劲：刀上聚光、脚下冒火星、身上一圈气
      c.cfx.whirl(c.getPos, c.color, m.charge);
      c.fx.burst(c, c.color, 20, { speed: 2, up: 5, life: m.charge, y: 0.2 });
      c.fx.burst({ x: c.x, z: c.z }, DUST, 16, { speed: 3, up: 1, life: 0.6, y: 0.1, bright: 1 });
    },
    hit(c, h, i) {
      if (i === 0) { // 巨大刀影竖着落下
        slash(c, { tilt: -PI / 2, scale: 3.0, sweep: 1.2, y: 2.4 });
        bite(c, c.x + c.fx0 * 0.8, c.z + c.fz0 * 0.8, 7, 1.0);
        c.cfx.dent(c.x + c.fx0 * 2.4, c.z + c.fz0 * 2.4, 2.6, c.color, { n: 9 });
        c.cfx.shards(c.x + c.fx0 * 2.6, c.z + c.fz0 * 2.6, 12, 1.8);
        c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 34, 0.4, 2);
        c.fx.shockRing(c.x + c.fx0 * 2.4, c.z + c.fz0 * 2.4, 4.2, c.color, 0.4);
        c.fx.burst({ x: c.x + c.fx0 * 2.4, z: c.z + c.fz0 * 2.4 }, DUST, 30, { speed: 7, up: 7, life: 0.7, y: 0.2, bright: 1 });
        return;
      }
      c.cfx.pillar(c.cx, c.cz, 1.1, 4, c.color, 0.35);
      spikeRing(c, c.cx, c.cz, 1.6, 6);
    },
    contact: (c, d) => { sparks(c, d, 12); c.cfx.star(d.pos, c.color, { size: 1.4 }); },
  },
};

// 刀的技能特效（伤害在 arena.js / combat.js 的 SKILLS）
export const DAO_SKILL_FX = {
  dao_storm(c) { // 刀轮：刀光绕身三圈
    c.cfx.whirl(c.getPos, c.color, 0.5);
    for (let k = 0; k < 3; k++) slash(c, { tilt: 0.1, scale: 1.7, sweep: 2.4, yaw: c.yaw + k * 2.1, y: 1, delay: k * 0.05 });
    c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.15, r0: 1, r1: 4, travel: 0, dur: 0.35 });
    chip(c, c.x, c.z, 14);
  },
  dao_wave(c) { // 刀罡：竖劈出手
    slash(c, { tilt: -PI / 2, scale: 1.5, sweep: 1.3, y: 1.2 });
    c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 16, 0.25);
  },
  dao_split(c) { // 开天：一刀劈下，地面裂开一长道
    slash(c, { tilt: -PI / 2, scale: 1.7, sweep: 1.4, y: 1.3 });
    c.cfx.crack(c.x, c.z, c.x + c.fx0 * 9, c.z + c.fz0 * 9, c.color, 0.8, 1.1);
    c.cfx.flash(c.x + c.fx0 * 3, c.z + c.fz0 * 3, c.color, 24, 0.35);
    chip(c, c.x + c.fx0, c.z + c.fz0, 16);
  },
  // 开天裂地的每一段：地面炸起一柱
  dao_split_seg(c, x, z, last) {
    c.cfx.pillar(x, z, 0.9, last ? 5 : 3, c.color, 0.35);
    c.cfx.dent(x, z, 1.4, c.color, { n: 5 });
    chip(c, x, z, 12);
    if (last) c.cfx.flash(x, z, c.color, 20, 0.3);
  },
};

// 音效：剑风压低、拉长，砍中加一记闷响（刀不用 ring / 高频）
const heavySwing = (pitch = 0.66, size = 1.6) => (s, m, lead) => s.swing({ lead, pitch: pitch * rand(0.97, 1.03), size, send: 0.12 });
// 拖刀擦地：低通噪声"沙——"（不要高频金属声）
const grind = (s) => s.noise({ dur: 0.16, type: 'lowpass', f0: 1600, f1: 700, q: 0.3, gain: 0.22, attack: 0.02 });
export const DAO_SFX = {
  dao1: { start: heavySwing(0.68), hit: (s) => { s.airPop(0.4); s.slam(0); } },
  dao2: { start: heavySwing(0.74), hit: (s) => s.airPop(0.4) },
  dao3: { start: (s) => s.stomp(), hit: (s, h) => (h.drag ? grind(s) : (s.swing({ lead: 0.01, pitch: 0.7, size: 1.7 }), s.airPop(0.7))) },
  dao_cleave: { start: (s, m, lead) => { s.stomp(); heavySwing(0.6, 1.7)(s, m, lead); }, hit: (s) => s.slam(0.3) },
  dao_plant: { start: (s) => s.swing({ lead: 0.2, pitch: 0.6, size: 1.3 }), hit: (s, h, i) => (i ? s.groundBoom(i === 2 ? 0.7 : 0.3) : s.slam(0.6)) },
  dao_wheel: { start: (s, m) => s.spin(0.05), hit: (s, h, i) => (i === 2 ? (s.swing({ lead: 0.01, pitch: 0.62, size: 1.8 }), s.slam(0.5)) : s.swing({ lead: 0.01, pitch: 0.75, size: 1.3 })) },
  dao_bash: { start: (s) => s.stomp(), hit: (s, h, i) => (i ? s.slam(0.5) : (s.airPop(0.8), s.groundBoom(0))) },
  dao_feint: { hit: (s, h) => (h.drag ? grind(s) : (s.swing({ lead: 0.01, pitch: 0.6, size: 1.9 }), s.airPop(0.6))) },
  dao_break: { start: (s) => s.stomp(), hit: (s, h, i) => (i ? s.groundBoom(0.8) : (s.slam(1), s.explode())) },
};
