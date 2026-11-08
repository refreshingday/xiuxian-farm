// 刀（GDD 第 4 节武器表：重击，范围劈砍）。比剑慢、刀光更宽更长、击退更狠，拼刀时更重（main.js KIT_W）。
// heavy = 出招时弓步沉身（comboAnim.js）；swings = 多段劈砍每刀的方向；H = 横扫
const PI = Math.PI;
const cut = (t, o) => ({ t, shape: 'arc', range: 3.0, arc: 1.4, ...o });

export const DAO_MOVES = {
  dao1: { name: '劈·一', pose: 'R', heavy: true, dur: 0.44, cancel: 0.3, color: '#ffb070', motion: [{ t0: 0, t1: 0.14, dist: 1.0, seek: true }],
    hits: [cut(0.15, { dmg: 13, knock: 8, stop: 0.04, shake: 0.2 })] },
  dao2: { name: '劈·二', pose: 'L', heavy: true, dur: 0.44, cancel: 0.3, color: '#ffb070', qi: 6, motion: [{ t0: 0, t1: 0.14, dist: 1.0, seek: true }],
    hits: [cut(0.15, { dmg: 13, knock: 8, stop: 0.04, shake: 0.2 })] },
  // 横扫千军：一刀扫过身前大半圈
  dao3: { name: '横扫', pose: 'H', heavy: true, dur: 0.5, cancel: 0.36, color: '#ffb070', qi: 10, motion: [{ t0: 0, t1: 0.12, dist: 0.6, seek: true }],
    hits: [cut(0.17, { range: 3.3, arc: 2.2, dmg: 14, knock: 12, stop: 0.05, shake: 0.3 })] },
  // 开山：慢招起手，举刀过顶直劈
  dao_cleave: { name: '开山', pose: 'over', heavy: true, dur: 0.62, cancel: 0.44, color: '#ff9a5a', qi: 12, motion: [{ t0: 0.05, t1: 0.22, dist: 0.9, seek: true }],
    hits: [cut(0.26, { range: 3.5, arc: 0.7, dmg: 22, knock: 14, stop: 0.08, shake: 0.4 })] },
  // 狂刀乱舞：边走边四刀，最后一刀劈飞
  dao_rage: { name: '狂刀乱舞', swings: ['R', 'L', 'H', 'over'], heavy: true, dur: 0.82, cancel: 0.66, end: true, color: '#ff9a5a', qi: 20,
    motion: [{ t0: 0, t1: 0.5, dist: 2.2, seek: true }],
    hits: [[0.1, 9, 3], [0.24, 9, 3], [0.38, 10, 4], [0.58, 18, 16]].map(([t, dmg, knock], i) =>
      cut(t, { range: 3.0, arc: i === 2 ? 2 : 1.3, dmg, knock, launch: i === 3 ? 3 : 0, stop: i === 3 ? 0.08 : 0.03, shake: i === 3 ? 0.45 : 0.15 })) },
  // 断岳：一刀劈进地里，刀罡顺着地面往前裂三段
  dao_quake: { name: '断岳', pose: 'over', heavy: true, dur: 0.86, cancel: 0.66, end: true, color: '#ff8a4a', qi: 22,
    hits: [cut(0.3, { range: 3.0, arc: 0.6, dmg: 20, knock: 6, stop: 0.06, shake: 0.35 })]
      .concat([[0.38, 3.4], [0.46, 4.8], [0.54, 6.2]].map(([t, at]) => ({ t, shape: 'circle', at, r: 1.8, dmg: 12, knock: 8, launch: 4, stop: 0.03, shake: 0.25 }))) },
  // 旋风刀：拖着刀转两大圈，第一圈把人卷进来，第二圈甩出去
  dao_whirl: { name: '旋风刀', pose: 'spin', dur: 0.72, cancel: 0.6, end: true, color: '#ffb070', qi: 18, moveSpd: 3,
    hits: [{ t: 0.16, shape: 'circle', at: 0, r: 3.2, dmg: 14, knock: -3, stop: 0.04, shake: 0.2 },
      { t: 0.44, shape: 'circle', at: 0, r: 3.4, dmg: 20, knock: 18, launch: 4, stop: 0.08, shake: 0.45 }] },
  // 回风斩：后撤半步，回身一刀扫满一圈
  dao_sweep: { name: '回风斩', pose: 'H', heavy: true, dur: 0.6, cancel: 0.46, end: true, color: '#ff9a5a', qi: 18,
    motion: [{ t0: 0, t1: 0.12, dist: 0.8, ang: PI }],
    hits: [{ t: 0.2, shape: 'circle', at: 0, r: 3.5, dmg: 22, knock: 18, launch: 2, stop: 0.08, shake: 0.45 }] },
  // 力劈华山：跃起，落地一刀劈开大地
  dao_heaven: { name: '力劈华山', pose: 'leap', dur: 0.92, cancel: 0.72, end: true, color: '#ff7a3a', qi: 30, iframe: 0.45,
    leap: { t0: 0.06, t1: 0.5, to: 'aim', max: 6, h: 2.4 },
    hits: [{ t: 0.5, shape: 'circle', at: 0, r: 3.2, dmg: 36, knock: 14, launch: 6, stop: 0.12, shake: 0.7 },
      { t: 0.6, shape: 'circle', at: 2.8, r: 1.9, dmg: 14, knock: 10, launch: 3, stop: 0.03, shake: 0.3 }] },
};
for (const k in DAO_MOVES) DAO_MOVES[k].id = k;

export const DAO_TREE = {
  '': 'dao1', F: 'dao2', S: 'dao_cleave',
  FF: 'dao3', FS: 'dao_whirl',
  FFF: 'dao_rage', FFS: 'dao_quake',
  SF: 'dao_sweep', SS: 'dao_heaven',
};
export const DAO_ROUTES = [
  { name: '狂刀乱舞', seq: 'FFF', tag: '4连 · 连劈' },
  { name: '断岳', seq: 'FFS', tag: '4连 · 地裂' },
  { name: '旋风刀', seq: 'FS', tag: '3连 · 卷入甩飞' },
  { name: '横扫', seq: 'FF', tag: '3连 · 大范围' },
  { name: '回风斩', seq: 'SF', tag: '3连 · 回身满圈' },
  { name: '力劈华山', seq: 'SS', tag: '3连 · 跃起重劈' },
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
function slash(c, o) {
  const y = (o.y ?? 1.05) + c.y, yaw = o.yaw ?? c.yaw, s = o.scale ?? 1.35;
  c.cfx.arc(c, yaw, c.color, { ...o, y, scale: s, sweep: o.sweep ?? 1.1, opacity: 0.6, dur: 0.26 });
  c.cfx.arc(c, yaw, '#ff6a2a', { ...o, y, scale: s * 1.18, sweep: o.sweep ?? 1.1, opacity: 0.28, dur: 0.3, delay: 0.03 });
}
const sparks = (c, d, n = 6) => c.fx.burst({ x: d.pos.x, y: d.pos.y, z: d.pos.z }, '#ffd8a0', n, { speed: 5, up: 3, life: 0.25, y: 1.1 });
const chip = (c, x, z, n = 10) => c.fx.burst({ x, z }, DUST, n, { speed: 4, up: 4, life: 0.5, y: 0.2, bright: 1 });
// 刀砍进地面：一道光缝 + 碎石
function bite(c, x, z, len, w = 0.5) {
  c.cfx.crack(x, z, x + c.fx0 * len, z + c.fz0 * len, c.color, w, 0.8);
  chip(c, x + c.fx0 * 0.5, z + c.fz0 * 0.5, 12);
}

export const DAO_FX = {
  dao1: { hit: (c) => slash(c, { tilt: R }), contact: (c, d) => sparks(c, d) },
  dao2: { hit: (c) => slash(c, { tilt: L, flip: true }), contact: (c, d) => sparks(c, d) },
  dao3: {
    hit(c) { slash(c, { tilt: 0.08, scale: 1.5, sweep: 1.8, y: 0.95 }); c.cfx.streaks(c, c.yaw, '#ffe0b0', { n: 6, len: 1.2 }); },
    contact: (c, d) => sparks(c, d, 8),
  },
  dao_cleave: {
    hit(c) {
      slash(c, { tilt: -PI / 2, scale: 1.45, sweep: 1.3, y: 1.2 });
      bite(c, c.x + c.fx0 * 1.2, c.z + c.fz0 * 1.2, 3);
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 16, 0.25);
    },
    contact: (c, d) => { sparks(c, d, 10); c.cfx.star(d.pos, c.color, { size: 1 }); },
  },
  dao_rage: {
    hit(c, h, i) {
      const tilt = [R, L, 0.08, -PI / 2][i];
      slash(c, { tilt, flip: i === 1, scale: i === 3 ? 1.55 : 1.25, sweep: i === 2 ? 1.7 : 1.1, y: i === 3 ? 1.2 : 1.05 });
      if (i === 3) { bite(c, c.x + c.fx0, c.z + c.fz0, 3.5, 0.6); c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 20, 0.3); }
    },
    contact: (c, d, h, i) => sparks(c, d, i === 3 ? 12 : 5),
  },
  dao_quake: {
    hit(c, h, i) {
      if (i === 0) { slash(c, { tilt: -PI / 2, scale: 1.5, sweep: 1.3, y: 1.2 }); bite(c, c.x + c.fx0, c.z + c.fz0, 7, 0.6); return; }
      c.cfx.dent(c.cx, c.cz, 1.4, c.color, { n: 5 });
      c.cfx.pillar(c.cx, c.cz, 0.7, 2.5 + i * 0.5, c.color, 0.3);
      chip(c, c.cx, c.cz, 14);
      if (i === 3) c.cfx.flash(c.cx, c.cz, c.color, 18, 0.3);
    },
  },
  dao_whirl: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.cancel); },
    hit(c, h, i) {
      slash(c, { tilt: 0.1, scale: 1.6, sweep: 2.4, yaw: c.yaw + i * PI, y: 0.9 });
      chip(c, c.x, c.z, 8);
      if (i) { c.cfx.flash(c.x, c.z, c.color, 18, 0.3, 1.2 + c.y); c.fx.burst(c, c.color, 16, { speed: 8, up: 1, life: 0.35, y: 1 }); }
    },
    contact: (c, d) => sparks(c, d),
  },
  dao_sweep: {
    hit(c) {
      for (let k = 0; k < 3; k++) slash(c, { tilt: 0.06, scale: 1.55, sweep: 2.2, yaw: c.yaw + k * 2.1, y: 0.95, delay: k * 0.03 });
      c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.15, r0: 0.8, r1: 3.6, travel: 0, dur: 0.3 });
      chip(c, c.x, c.z, 12);
    },
    contact: (c, d) => sparks(c, d, 8),
  },
  dao_heaven: {
    start(c) { c.fx.burst(c, c.color, 16, { speed: 3, up: 5, life: 0.35, y: 0.3 }); },
    hit(c, h, i) {
      if (i === 0) {
        slash(c, { tilt: -PI / 2, scale: 1.8, sweep: 1.4, y: 1.4 });
        c.cfx.dent(c.x, c.z, 2.4, c.color, { n: 8 });
        c.cfx.disc(c.x, c.z, 3.2, c.color, 0.3, 0.45);
        bite(c, c.x, c.z, 6, 0.8);
        c.cfx.flash(c.x, c.z, c.color, 30, 0.35, 2);
        c.fx.shockRing(c.x, c.z, 3.8, c.color, 0.35);
        c.fx.burst({ x: c.x, z: c.z }, DUST, 26, { speed: 7, up: 6, life: 0.6, y: 0.2, bright: 1 });
        return;
      }
      c.cfx.pillar(c.cx, c.cz, 0.9, 3.5, c.color, 0.3);
      chip(c, c.cx, c.cz, 14);
    },
    contact: (c, d) => { sparks(c, d, 10); c.cfx.star(d.pos, c.color, { size: 1.2 }); },
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
const heavySwing = (pitch = 0.75, size = 1.4) => (s, m, lead) => s.swing({ lead, pitch: pitch * rand(0.97, 1.03), size, send: 0.12 });
export const DAO_SFX = {
  dao1: { start: heavySwing(0.78) },
  dao2: { start: heavySwing(0.84) },
  dao3: { start: heavySwing(0.7, 1.6) },
  dao_cleave: { start: (s, m, lead) => { s.stomp(); heavySwing(0.62, 1.6)(s, m, lead); }, hit: (s) => s.slam(0) },
  dao_rage: { hit: (s, h, i) => { s.swing({ lead: 0.02, pitch: 0.8 + i * 0.04, size: i === 3 ? 1.5 : 1.1 }); if (i === 3) s.slam(0.3); } },
  dao_quake: { start: heavySwing(0.6, 1.6), hit: (s, h, i) => (i ? s.groundBoom(i === 3 ? 0.8 : 0.2) : s.slam(0.4)) },
  dao_whirl: { start: (s, m, lead) => s.spin(lead), hit: (s, h, i) => { if (i) s.slam(0.2); } },
  dao_sweep: { start: heavySwing(0.66, 1.7), hit: (s) => s.airPop(0.6) },
  dao_heaven: { start: (s, m, lead) => s.leap(lead), hit: (s, h, i) => (i ? s.groundBoom(0.5) : s.slam(1)) },
};
