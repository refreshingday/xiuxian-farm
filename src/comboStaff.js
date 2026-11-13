// 棍（GDD 第 4 节武器表：拳/杖）。第六件武器。
// 一寸长一寸强：够得最远的近战——点、扫、舞花、撑杆、砸。棍子是「如意」的：大招时会伸长变粗（关键帧的 ext，见 comboAnim.js）。
// 伤害中等、范围最大、多段；没有剑的位移和空战，也没有刀的单发重击。拼刀重量 1.2（main.js KIT_W）。
// 动作用 comboAnim.js 的关键帧 keys（字段说明见 comboDao.js 开头），多一个 ext = 棍子伸长多少倍（0 = 原长）
const PI = Math.PI, TAU = PI * 2;
const READY = [-0.9, 0.3, -0.5, 0.2];
const COIL = [-0.9, -0.35, -1.9, -0.55];   // 棍收在右腰
const POKE = [-1.5, 0.1, -0.05, 0.45];     // 戳到底
const HR = [-1.45, -1.6, -0.5, -0.85], HL = [-1.45, 1.5, -0.1, 0.85]; // 横扫：右 / 左
const TOP = [-3.2, -0.1, -1.3, -0.3], DOWN = [-0.45, 0.05, -0.05, 0.1]; // 举过顶 / 砸到底
const k = (t, p, o = {}) => ({ t, p, ...o });
const C = '#b9a4ff';
const base = { color: C };

export const STAFF_MOVES = {
  // 点：棍从腰间直直戳出去，够得比剑远一大截
  gn1: { ...base, name: '点', dur: 0.36, cancel: 0.24, motion: [{ t0: 0.02, t1: 0.12, dist: 0.6, seek: true }],
    keys: [k(0, READY), k(0.07, COIL, { lean: -0.05, st: 0.3 }), k(0.12, POKE, { in: 1, lean: 0.25, st: 0.9, ext: 0.25 }), k(0.22, POKE, { lean: 0.22, st: 0.9, ext: 0.2 }), k(0.36, READY, { st: 0.3 })],
    hits: [{ t: 0.12, shape: 'arc', range: 4.4, arc: 0.4, dmg: 9, knock: 4, stop: 0.03, shake: 0.1 }] },
  // 扫：横着抡一大圈弧
  gn2: { ...base, name: '扫', qi: 5, dur: 0.42, cancel: 0.28, motion: [{ t0: 0.04, t1: 0.15, dist: 0.5, seek: true }],
    keys: [k(0, READY), k(0.09, HR, { lean: -0.05, st: 0.4 }), k(0.16, HL, { in: 1, lean: 0.15, st: 0.8, sq: -0.04 }), k(0.27, HL, { lean: 0.12, st: 0.8 }), k(0.42, [-1.2, 0.8, -0.5, 0.4], { st: 0.4 })],
    hits: [{ t: 0.15, shape: 'arc', range: 4.0, arc: 1.7, dmg: 9, knock: 5, stop: 0.04, shake: 0.15 }] },
  // 拨：反手贴地扫回来，把脚拨起来
  gn3: { ...base, name: '拨', qi: 8, dur: 0.44, cancel: 0.3, motion: [{ t0: 0.04, t1: 0.15, dist: 0.5, seek: true }],
    keys: [k(0, [-1.2, 0.8, -0.5, 0.4]), k(0.09, [-0.75, 1.5, -0.2, 0.85], { lean: 0.3, st: 0.8, hip: -0.12 }),
      k(0.16, [-0.8, -1.5, -0.1, -0.85], { in: 1, lean: 0.4, st: 1, hip: -0.18, sq: -0.05 }), k(0.28, [-0.8, -1.45, -0.12, -0.8], { lean: 0.36, st: 1, hip: -0.16 }), k(0.44, COIL, { st: 0.4 })],
    hits: [{ t: 0.15, shape: 'arc', range: 4.0, arc: 1.7, dmg: 9, knock: 2, launch: 3.5, stop: 0.04, shake: 0.15 }] },
  // 舞花：棍在身前竖着转成一个轮子，一边转一边往前压，最后一棍伸长戳穿
  gn_flower: { ...base, name: '舞花', qi: 18, end: true, dur: 0.98, cancel: 0.76, moveSpd: 2.5,
    keys: [k(0, COIL), k(0.08, [-1.35, 0.25, -0.7, 0.2], { st: 0.5, lean: 0.1, one: 1 }),
      k(0.54, [-1.35, 0.25, -0.7, 0.2], { lin: 1, sw: PI + 3 * TAU, st: 0.6, lean: 0.15, one: 1 }),
      k(0.62, COIL, { sw: PI + 3 * TAU, st: 0.4, lean: -0.08 }),
      k(0.68, POKE, { in: 1, sw: PI + 3 * TAU, lean: 0.35, st: 1, ext: 0.7, sq: -0.05 }), k(0.8, POKE, { sw: PI + 3 * TAU, lean: 0.3, st: 1, ext: 0.6 }),
      k(0.98, READY, { sw: PI + 3 * TAU, st: 0.3 })],
    hits: [0.14, 0.23, 0.32, 0.41, 0.5].map((t) => ({ t, shape: 'circle', at: 1.7, r: 2.0, dmg: 4, knock: 0.6, stop: 0.02, shake: 0.06 }))
      .concat([{ t: 0.68, shape: 'arc', range: 6.0, arc: 0.4, dmg: 16, knock: 18, stop: 0.07, shake: 0.35 }]) },
  // 挑山：棍头插到脚下往上一撬，把人挑上天，再伸长了从头顶砸下来拍回地上
  gn_heave: { ...base, name: '挑山', qi: 18, end: true, dur: 0.96, cancel: 0.74,
    keys: [k(0, COIL), k(0.1, [-0.35, 0.2, -0.2, 0.2], { lean: 0.45, st: 0.9, hip: -0.18 }),
      k(0.18, [-2.9, 0.1, -0.2, 0], { in: 1, lean: -0.25, hip: 0.08, sq: 0.1, st: 0.3 }), k(0.36, TOP, { lean: -0.3, hip: 0.1, sq: 0.1, st: 0.3, ext: 0.5 }),
      k(0.46, TOP, { lean: -0.32, hip: 0.1, sq: 0.12, st: 0.3, ext: 0.6, tr: 0.04 }),
      k(0.52, DOWN, { in: 1, lean: 0.55, st: 1, hip: -0.2, sq: -0.14, ext: 0.6 }), k(0.72, DOWN, { lean: 0.5, st: 1, hip: -0.18, ext: 0.3 }), k(0.96, READY, { st: 0.4 })],
    hits: [{ t: 0.18, shape: 'circle', at: 2.2, r: 2.3, dmg: 10, knock: 0, launch: 10, stop: 0.05, shake: 0.25 },
      { t: 0.52, shape: 'circle', at: 2.6, r: 2.5, dmg: 18, knock: 6, spike: 16, vr: 6, stop: 0.09, shake: 0.5 }] },
  // 横扫千军：棍伸长，整个人转两圈，四周一大圈全扫到，最后一圈扫飞
  gn_sweep: { ...base, name: '横扫千军', qi: 18, end: true, dur: 0.92, cancel: 0.7,
    keys: [k(0, [-1.2, 0.8, -0.5, 0.4]), k(0.1, HR, { st: 0.6, hip: -0.06, ext: 0.3, one: 1 }),
      k(0.56, HR, { lin: 1, spin: 2 * TAU, st: 0.7, hip: -0.08, lean: 0.08, ext: 0.45, one: 1 }),
      k(0.66, HL, { spin: 2 * TAU, st: 1, lean: 0.2, hip: -0.12, ext: 0.3, sq: -0.05 }), k(0.92, READY, { spin: 2 * TAU, st: 0.4 })],
    hits: [0.2, 0.38].map((t) => ({ t, shape: 'circle', at: 0, r: 4.6, dmg: 8, knock: 2, stop: 0.03, shake: 0.14 }))
      .concat([{ t: 0.56, shape: 'circle', at: 0, r: 4.6, dmg: 14, knock: 17, launch: 3, stop: 0.07, shake: 0.4 }]) },
  // 劈：棍举过头顶，一棍直直砸下去，前面一长条都砸到
  gn_smash: { ...base, name: '劈', qi: 10, dur: 0.62, cancel: 0.44, motion: [{ t0: 0.18, t1: 0.3, dist: 0.7, seek: true }],
    keys: [k(0, READY), k(0.2, TOP, { lean: -0.28, hip: 0.07, sq: 0.08, st: 0.3 }), k(0.3, DOWN, { in: 1, lean: 0.5, st: 1, hip: -0.18, sq: -0.12, ext: 0.2 }),
      k(0.44, DOWN, { lean: 0.46, st: 1, hip: -0.16, ext: 0.15 }), k(0.62, [-0.8, 0, -0.4, 0.05], { st: 0.5, lean: 0.15 })],
    hits: [{ t: 0.3, shape: 'arc', range: 4.8, arc: 0.45, dmg: 20, knock: 3, stop: 0.08, shake: 0.4 }] },
  // 撑杆：棍往地上一杵，人撑着荡过去，落地一脚踹开一圈
  gn_vault: { ...base, name: '撑杆', qi: 18, end: true, dur: 0.9, cancel: 0.68, iframe: 0.34,
    motion: [{ t0: 0.12, t1: 0.42, dist: 4.6, seek: true }],
    keys: [k(0, [-0.8, 0, -0.4, 0.05], { sw: PI }), k(0.1, [-1.3, 0, -0.3, 0], { sw: 0.3, lean: 0.2, st: 0.5, hip: -0.1 }),
      k(0.27, [-2.6, 0, -0.2, 0], { sw: 0, lean: -0.5, hip: 0.95, sq: 0.1 }), k(0.4, [-0.6, 0, -0.6, 0], { sw: 0.6, lean: 0.5, hip: 0.25 }),
      k(0.46, [-0.5, 0.3, -0.8, 0.3], { in: 1, sw: PI, lean: 0.3, hip: -0.24, st: 1, sq: -0.16 }), k(0.66, [-0.5, 0.3, -0.8, 0.3], { lean: 0.25, hip: -0.2, st: 1 }),
      k(0.9, READY, { st: 0.4 })],
    hits: [{ t: 0.44, shape: 'circle', at: 0.4, r: 3.0, dmg: 22, knock: 14, launch: 3, stop: 0.08, shake: 0.5 }] },
  // 定海：棍举过头顶越长越粗，憋足了劲一棍砸下——前面一长溜地面一段段炸开
  gn_pillar: { ...base, name: '定海', qi: 30, end: true, dur: 1.16, cancel: 0.9, charge: 0.56,
    keys: [k(0, [-0.8, 0, -0.4, 0.05]), k(0.2, TOP, { lean: -0.3, hip: 0.08, sq: 0.1, st: 0.3, ext: 0.6 }),
      k(0.56, [-3.3, -0.1, -1.4, -0.35], { lean: -0.38, hip: 0.1, sq: 0.13, st: 0.35, ext: 2.0, tr: 0.06 }),
      k(0.64, [-0.3, 0.05, -0.05, 0.1], { in: 1, lean: 0.7, st: 1, hip: -0.28, sq: -0.2, ext: 2.0 }), k(0.88, [-0.3, 0.05, -0.05, 0.1], { lean: 0.65, st: 1, hip: -0.26, ext: 1.2 }),
      k(1.16, [-0.8, 0, -0.4, 0.05], { st: 0.6, lean: 0.2 })],
    hits: [{ t: 0.64, shape: 'circle', at: 2.6, r: 2.2, dmg: 30, knock: 6, launch: 3, stop: 0.14, shake: 0.85 },
      { t: 0.68, shape: 'circle', at: 5.2, r: 2.2, dmg: 16, knock: 8, launch: 4, stop: 0.03, shake: 0.4 },
      { t: 0.72, shape: 'circle', at: 7.8, r: 2.2, dmg: 16, knock: 12, launch: 6, stop: 0.03, shake: 0.4 }] },
};
for (const id in STAFF_MOVES) STAFF_MOVES[id].id = id;

export const STAFF_TREE = {
  '': 'gn1', F: 'gn2', S: 'gn_smash',
  FF: 'gn3', FS: 'gn_sweep',
  FFF: 'gn_flower', FFS: 'gn_heave',
  SF: 'gn_vault', SS: 'gn_pillar',
};
export const STAFF_ROUTES = [
  { name: '舞花', seq: 'FFF', tag: '4连 · 棍轮连打 → 伸长戳穿' },
  { name: '挑山', seq: 'FFS', tag: '4连 · 挑上天 → 砸回地' },
  { name: '横扫千军', seq: 'FS', tag: '3连 · 转两圈 · 大范围' },
  { name: '拨', seq: 'FF', tag: '3连 · 贴地扫 · 拨起' },
  { name: '撑杆', seq: 'SF', tag: '3连 · 撑杆荡过去 · 落地踹开' },
  { name: '定海', seq: 'SS', tag: '3连 · 蓄力 · 巨棍砸一长溜' },
];

export const STAFF_SKILLS = [
  { id: 'gn_wheel', name: '棍花', qi: 30, cd: 6, pose: 'spin', ht: 0.1 },
  { id: 'gn_pierce', name: '贯虹', qi: 25, cd: 5, pose: 'thrust', ht: 0.12 },
  { id: 'gn_drop', name: '镇海', qi: 35, cd: 9, pose: 'raise', ht: 0.18 },
];

// ---------- 特效：棍影是一道宽而钝的弧（没有白刃线），打中是一圈气浪 + 木屑尘土 ----------
const DUST = '#b89a6a';
const sweepFx = (c, o = {}) => {
  const y = (o.y ?? 1.0) + c.y, s = o.scale ?? 1.7;
  c.cfx.arc(c, o.yaw ?? c.yaw, c.color, { ...o, y, scale: s, sweep: o.sweep ?? 1.6, opacity: 0.5, dur: 0.3 });
  c.cfx.arc(c, o.yaw ?? c.yaw, '#efe6ff', { ...o, y, scale: s * 0.96, sweep: (o.sweep ?? 1.6) * 0.9, opacity: 0.22, dur: 0.2 });
};
const poke = (c, len = 4.4) => { c.cfx.stab(c, c.yaw, c.color, 0, 1.1 + c.y, len); c.cfx.airRing({ x: c.x + c.fx0 * len * 0.8, y: 1.1 + c.y, z: c.z + c.fz0 * len * 0.8 }, c.yaw, '#efe6ff', { r0: 0.2, r1: 0.9, travel: 0.8, dur: 0.22, op: 0.5 }); };
const dust = (c, x, z, n = 10, o = {}) => c.fx.burst({ x, z }, DUST, n, { speed: 4, up: 3, life: 0.45, y: 0.15, bright: 1, ...o });
const thud = (c, d, n = 6) => { c.cfx.star(d.pos, c.color, { size: 0.8 + n * 0.04 }); c.fx.burst(d.pos, '#efe6ff', n, { speed: 5, up: 2, life: 0.25, y: 1.1 }); };
// 棍砸地：一条裂缝 + 坑 + 尘
function pound(c, x, z, r = 1.4, big = 0) {
  c.cfx.dent(x, z, r, c.color, { n: 5 + big * 3 });
  c.fx.shockRing(x, z, r + 0.8, c.color, 0.3);
  dust(c, x, z, 12 + big * 8, { speed: 6 });
}

export const STAFF_FX = {
  gn1: { hit: (c) => poke(c, 4.2), contact: thud },
  gn2: { hit: (c) => sweepFx(c, { tilt: -0.05 }), contact: thud },
  gn3: { hit: (c) => { sweepFx(c, { tilt: 0.05, flip: true, y: 0.35 }); dust(c, c.x + c.fx0 * 2, c.z + c.fz0 * 2, 10); }, contact: thud },
  gn_flower: {
    hit(c, h, i) {
      if (i < 5) { c.cfx.arc(c, c.yaw, i % 2 ? '#efe6ff' : c.color, { y: 1.1 + c.y, tilt: PI / 2, flip: i % 2 === 1, scale: 1.25, sweep: 2.6, opacity: 0.4, dur: 0.2 }); return; }
      poke(c, 6); c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw, '#efe6ff', { n: 8, len: 2.2, dur: 0.28 });
    },
    contact: (c, d, h, i) => thud(c, d, i === 5 ? 12 : 4),
  },
  gn_heave: {
    hit(c, h, i) {
      const x = c.cx, z = c.cz;
      if (!i) { sweepFx(c, { tilt: PI / 2, scale: 1.5, sweep: 1.4, y: 1.3 }); dust(c, x, z, 14, { up: 7 }); c.cfx.streaks({ x, y: 0, z }, c.yaw, '#efe6ff', { up: true, n: 7, len: 2.2, dur: 0.3 }); return; }
      sweepFx(c, { tilt: -PI / 2, scale: 1.9, sweep: 1.3, y: 1.3 }); pound(c, x, z, 1.8, 1);
      c.cfx.crack(c.x + c.fx0, c.z + c.fz0, c.x + c.fx0 * 4.4, c.z + c.fz0 * 4.4, c.color, 0.5, 0.8);
    },
    contact: (c, d, h, i) => thud(c, d, i ? 12 : 6),
  },
  gn_sweep: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.cancel * 0.75); },
    hit(c, h, i) {
      for (let j = 0; j < 3; j++) sweepFx(c, { tilt: 0.03, scale: 2.0, sweep: 2.2, yaw: c.yaw + j * 2.1, y: 0.9, delay: j * 0.03 });
      c.fx.burst({ x: c.x, z: c.z }, DUST, i === 2 ? 22 : 10, { speed: 8, up: 1.5, life: 0.45, y: 0.15, bright: 1 });
      if (i === 2) c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.9, r0: 1, r1: 5, travel: 0, dur: 0.32 });
    },
    contact: (c, d, h, i) => thud(c, d, i === 2 ? 10 : 5),
  },
  gn_smash: {
    hit(c) {
      sweepFx(c, { tilt: -PI / 2, scale: 1.7, sweep: 1.3, y: 1.2 });
      c.cfx.crack(c.x + c.fx0, c.z + c.fz0, c.x + c.fx0 * 4.8, c.z + c.fz0 * 4.8, c.color, 0.45, 0.8);
      pound(c, c.x + c.fx0 * 3.6, c.z + c.fz0 * 3.6, 1.2);
    },
    contact: (c, d) => thud(c, d, 10),
  },
  gn_vault: {
    start(c) { dust(c, c.x + c.fx0 * 0.8, c.z + c.fz0 * 0.8, 10); },
    hit(c) {
      pound(c, c.x, c.z, 2.2, 1);
      c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, '#efe6ff', { flat: true, y: 0.4, r0: 0.6, r1: 3.4, travel: 0, dur: 0.3 });
    },
    contact: (c, d) => thud(c, d, 10),
  },
  gn_pillar: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.charge); c.fx.burst(c, c.color, 20, { speed: 2, up: 6, life: m.charge, y: 0.2 }); },
    hit(c, h, i) {
      const x = c.cx, z = c.cz;
      if (!i) {
        sweepFx(c, { tilt: -PI / 2, scale: 3.2, sweep: 1.2, y: 2.4 });
        c.cfx.crack(c.x + c.fx0, c.z + c.fz0, c.x + c.fx0 * 9.5, c.z + c.fz0 * 9.5, c.color, 1.0, 1.2);
        c.cfx.flash(x, z, c.color, 30, 0.35);
      }
      pound(c, x, z, 2.2, 1); c.cfx.pillar(x, z, 0.9, i === 2 ? 5 : 3, c.color, 0.35); c.cfx.shards(x, z, 6, 1.2);
    },
    contact: (c, d, h, i) => thud(c, d, i ? 8 : 14),
  },
};

// 技能特效（伤害在 arena.js / combat.js 的 SKILLS）
export const STAFF_SKILL_FX = {
  gn_wheel(c, last) {
    for (let j = 0; j < 3; j++) sweepFx(c, { tilt: 0.03, scale: last ? 2.1 : 1.6, sweep: 2.2, yaw: c.yaw + j * 2.1 + Math.random() * TAU, y: 1.0 });
    if (last) { c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.9, r0: 1, r1: 4.6, travel: 0, dur: 0.32 }); dust(c, c.x, c.z, 20, { speed: 8 }); }
  },
  gn_pierce(c) { poke(c, 10); c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw, '#efe6ff', { n: 10, len: 3, dur: 0.3 }); dust(c, c.x, c.z, 10); },
  gn_drop_mark(c, x, z) { c.cfx.disc(x, z, 3.2, c.color, 0.4, 0.3); },
  gn_drop(c, x, z) {
    c.cfx.pillar(x, z, 1.3, 10, c.color, 0.5); c.cfx.pillar(x, z, 0.7, 12, '#efe6ff', 0.35);
    pound(c, x, z, 3.0, 2); c.cfx.shards(x, z, 10, 2.4); c.cfx.flash(x, z, c.color, 40, 0.4);
    for (let j = 0; j < 5; j++) { const a = j / 5 * TAU + 0.3; c.cfx.crack(x, z, x + Math.cos(a) * 3.6, z + Math.sin(a) * 3.6, c.color, 0.4, 1); }
  },
};

// 音效：棍风低而钝（拳风那一路），打中是闷闷的“咚”。只用低通噪声 + 现成的闷响，不用 ring / 高频
const wind = (pitch = 0.8, size = 1.3) => (s, m, lead) => s.fistWhoosh({ lead, pitch, size });
const tok = (s, g = 0.3) => s.noise({ dur: 0.1, type: 'lowpass', f0: 900, f1: 250, q: 0.3, gain: g });
export const STAFF_SFX = {
  gn1: { start: wind(1.0, 1.0), hit: (s) => tok(s, 0.22) },
  gn2: { start: wind(0.85, 1.4), hit: (s) => tok(s, 0.26) },
  gn3: { start: wind(0.8, 1.4), hit: (s) => tok(s, 0.26) },
  gn_flower: { start: (s) => s.spin(0.05), hit: (s, h, i) => (i === 5 ? (s.fistWhoosh({ lead: 0.01, pitch: 0.7, size: 1.6 }), s.airPop(0.7)) : tok(s, 0.2)) },
  gn_heave: { start: wind(0.75, 1.4), hit: (s, h, i) => (i ? s.slam(0.4) : s.airPop(0.5)) },
  gn_sweep: { start: (s) => s.spin(0.05), hit: (s, h, i) => (i === 2 ? s.airPop(0.8) : s.fistWhoosh({ lead: 0.01, pitch: 0.7, size: 1.6 })) },
  gn_smash: { start: (s, m, lead) => { s.stomp(); wind(0.65, 1.6)(s, m, lead); }, hit: (s) => s.slam(0.2) },
  gn_vault: { start: (s) => s.stomp(), hit: (s) => { s.airPop(0.6); s.groundBoom(0.2); } },
  gn_pillar: { start: (s) => s.stomp(), hit: (s, h, i) => (i ? s.groundBoom(i === 2 ? 0.7 : 0.3) : s.slam(1)) },
};
export const STAFF_SKILL_SFX = { tok };
