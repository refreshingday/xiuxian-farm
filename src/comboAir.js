// 试炼场实验招式表：边打边位移、击退、挑空、空中追击、坠地。只在 arena.html 用，手感定了再搬回 combo.js
import { MOVES, ROUTES } from './combo.js';
import { MOVE_FX } from './comboFx.js';
import { MOVE_SFX } from './comboSfx.js';

// 在 combo.js 的字段之外新增：
//   motion: [{ t0, t1, dist, ang, seek }] 出招时位移。ang = 相对面向的角度（π 后撤，±π/2 侧移）；seek = 贴到目标身前为止
//   leap.y1: 落点高度。'air' = 跳到最近的浮空目标身边（to:'air'），没有就往前上方跳
//   hang: 出招期间悬停在空中（不受重力）
//   hits[]: launch 挑飞初速 | lift 空中命中时托住的初速 | spike 砸向地面的初速 | pull 把目标吸到身前 | vr 上下判定范围
const PI = Math.PI;
const arc = (t, o) => ({ t, shape: 'arc', range: 2.6, arc: 1.1, ...o });
export const AIR_MOVES = {
  slash1: { ...MOVES.slash1, motion: [{ t0: 0, t1: 0.12, dist: 1.2, seek: true }], lunge: null,
    hits: [arc(0.11, { dmg: 10, knock: 6 })] },
  // 斩二、斩三斜着走位：左右之字绕着目标砍
  slash2: { ...MOVES.slash2, motion: [{ t0: 0, t1: 0.13, dist: 1.3, ang: 0.75 }], lunge: null,
    hits: [arc(0.11, { dmg: 11, knock: 6 })] },
  slash3: { ...MOVES.slash3, motion: [{ t0: 0, t1: 0.15, dist: 1.5, ang: -0.75 }], lunge: null,
    hits: [arc(0.12, { range: 2.8, arc: 1.2, dmg: 12, knock: 9, launch: 4.5 })] },
  flurry: { ...MOVES.flurry, motion: [{ t0: 0, t1: 0.36, dist: 1.6, seek: true }], lunge: null,
    hits: [0.06, 0.15, 0.24, 0.33].map((t, i) => arc(t, { range: 3.0, arc: 0.45, dmg: 5, knock: i < 3 ? 1 : 12, pull: i < 3 ? 0.6 : 0, stop: 0.02 })) },
  // 先后撤一步拉开，再放剑气
  gale: { ...MOVES.gale, motion: [{ t0: 0, t1: 0.16, dist: 1.6, ang: PI }],
    hits: [{ ...MOVES.gale.hits[0], knock: 22, launch: 5 }] },
  thunder: { ...MOVES.thunder, hits: [{ ...MOVES.thunder.hits[0], knock: 10, launch: 9 }] },
  // 前三圈把人往里卷，最后一圈甩飞
  whirl: { ...MOVES.whirl, moveSpd: 5,
    hits: [0.1, 0.24, 0.38, 0.52].map((t, i) => ({ t, shape: 'circle', r: 2.8, at: 0, dmg: i < 3 ? 7 : 12, knock: i < 3 ? -2.5 : 16, launch: i < 3 ? 0 : 7, stop: 0.03, shake: i < 3 ? 0.15 : 0.35 })) },
  // 穿身而过、顺手挑起；不再收招，可接回马斩 / 破军
  pierce: { ...MOVES.pierce, end: false, sweep: { ...MOVES.pierce.sweep, knock: 5, launch: 6.5 } },
  backslash: { name: '回马斩', pose: 'L', dur: 0.5, cancel: 0.38, end: true, color: '#9ef0ff', iframe: 0.2, scale: 1.2,
    motion: [{ t0: 0.02, t1: 0.17, dist: 5, seek: true }],
    hits: [arc(0.17, { range: 3.0, arc: 1.3, dmg: 26, knock: 18, launch: 3, stop: 0.08, shake: 0.4 })] },
  quake: { ...MOVES.quake, hits: MOVES.quake.hits.map((h, i) => ({ ...h, knock: 10, launch: i === 3 ? 9 : 3 })) },
  meteor: { ...MOVES.meteor, hits: [{ ...MOVES.meteor.hits[0], knock: 16, launch: 8 }] },

  // ---- 浮空线 ----
  rise: { name: '挑天', pose: 'U', dur: 0.46, cancel: 0.3, color: '#bfe8ff', scale: 1.2,
    motion: [{ t0: 0, t1: 0.1, dist: 0.9, seek: true }],
    leap: { t0: 0.12, t1: 0.42, dist: 0.3, h: 0.7 },
    hits: [arc(0.13, { range: 2.8, arc: 1.05, vr: 1.6, dmg: 14, knock: 1.2, launch: 12.5, stop: 0.06, shake: 0.25 })] },
  chase: { name: '追月', pose: 'R', dur: 0.42, cancel: 0.28, color: '#bfe8ff', air: true, hang: true,
    leap: { t0: 0.02, t1: 0.16, to: 'air', max: 8, h: 0.4, y1: 'air' },
    hits: [arc(0.16, { vr: 2, dmg: 12, knock: 1, lift: 6.5, pull: 0.8, stop: 0.05, shake: 0.2 })] },
  airFlurry: { name: '空·连斩', pose: 'L', dur: 0.44, cancel: 0.34, color: '#bfe8ff', air: true, hang: true,
    hits: [0.05, 0.13, 0.21, 0.29].map((t) => arc(t, { range: 2.6, arc: 1.3, vr: 2, dmg: 6, knock: 0.5, lift: 5.5, pull: 0.8, stop: 0.025 })) },
  spike: { name: '坠龙', pose: 'over', dur: 0.7, cancel: 0.55, end: true, color: '#ffd27a', air: true, hang: true, scale: 1.25,
    leap: { t0: 0.14, t1: 0.27, dist: 0.6, h: 0.35, y1: 0 },
    hits: [arc(0.13, { range: 2.8, arc: 1.2, vr: 2.4, dmg: 18, knock: 3, spike: 26, stop: 0.07, shake: 0.3 }),
      { t: 0.27, shape: 'circle', r: 2.6, at: 0.6, vr: 1.4, dmg: 12, knock: 9, launch: 6, stop: 0.1, shake: 0.65 }] },
  skyspin: { name: '天旋', pose: 'spin', dur: 0.62, cancel: 0.48, end: true, color: '#bfe8ff', air: true, hang: true,
    hits: [0.08, 0.18, 0.28].map((t) => ({ t, shape: 'circle', r: 2.6, at: 0, vr: 2.2, dmg: 7, knock: -1, lift: 5, stop: 0.025, shake: 0.12 }))
      .concat({ t: 0.4, shape: 'circle', r: 3.0, at: 0, vr: 2.4, dmg: 18, knock: 24, launch: 4, stop: 0.09, shake: 0.5 }) },
};
for (const k in AIR_MOVES) AIR_MOVES[k].id = k;

export const AIR_TREE = {
  '': 'slash1',
  F: 'slash2', S: 'rise',
  FF: 'slash3', FS: 'pierce',
  FFF: 'flurry', FFS: 'whirl',
  FFFF: 'gale', FFFS: 'thunder',
  FSF: 'backslash', FSS: 'quake',
  SF: 'chase', SS: 'meteor',
  SFF: 'airFlurry', SFS: 'spike',
  SFFF: 'spike', SFFS: 'skyspin',
};

export const AIR_ROUTES = [
  ...ROUTES.filter((r) => r.seq[0] === 'F' && r.seq !== 'FS'),
  { name: '回马斩', seq: 'FSF', tag: '4连 · 穿身回砍' },
  { name: '破军', seq: 'FSS', tag: '4连 · 突进地裂' },
  { name: '浮空·坠龙', seq: 'SFFF', tag: '5连 · 挑空追击砸地' },
  { name: '浮空·天旋', seq: 'SFFS', tag: '5连 · 空中甩飞' },
  { name: '追月坠', seq: 'SFS', tag: '4连 · 挑空砸地' },
  { name: '流星坠', seq: 'SS', tag: '3连 · 跃击' },
];

// 特效：c.y = 出招时角色离地高度
const sl = (c, o) => c.cfx.arc(c, o.yaw ?? c.yaw, c.color, { ...o, y: (o.y ?? 1.05) + c.y });
export const AIR_FX = {
  ...MOVE_FX,
  slash3: { hit(c, h, i) { MOVE_FX.slash3.hit(c, h, i); c.fx.burst({ x: c.x + c.fx0 * 1.8, z: c.z + c.fz0 * 1.8 }, '#ffffff', 6, { speed: 2, up: 7, life: 0.35, y: 0.6 }); } },
  backslash: {
    start(c) { c.cfx.crack(c.x, c.z, c.x + c.fx0 * 5, c.z + c.fz0 * 5, c.color, 0.7, 0.4); c.fx.shockRing(c.x, c.z, 1.6, c.color, 0.25); },
    hit(c) {
      sl(c, { tilt: 0.55, flip: true, scale: 1.3, sweep: 1.3 });
      sl(c, { tilt: -0.3, scale: 1.1, opacity: 0.35, delay: 0.04 });
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 14, 0.25);
    },
  },
  rise: {
    hit(c) {
      sl(c, { tilt: 1.2, scale: 1.25, sweep: 1.2 });
      const ex = c.x + c.fx0 * 1.8, ez = c.z + c.fz0 * 1.8;
      c.cfx.pillar(ex, ez, 0.8, 4, c.color, 0.3);
      c.fx.burst({ x: ex, z: ez }, c.color, 14, { speed: 2, up: 9, life: 0.45, y: 0.4 });
      c.fx.shockRing(ex, ez, 1.4, c.color, 0.25);
    },
  },
  chase: {
    start(c) { c.fx.burst(c, c.color, 12, { speed: 3, up: 4, life: 0.3, y: 0.3 }); c.fx.shockRing(c.x, c.z, 1.3, c.color, 0.2); },
    hit(c) { sl(c, { tilt: -0.7, scale: 1.1 }); },
  },
  airFlurry: {
    hit(c, h, i) {
      sl(c, { tilt: [0.7, -0.7, 1.3, -1.3][i], flip: i % 2 === 0, scale: 0.95, dur: 0.16 });
      c.fx.burst({ x: c.x + c.fx0 * 1.6, y: c.y, z: c.z + c.fz0 * 1.6 }, '#ffffff', 3, { speed: 3, life: 0.2, y: 1 });
    },
  },
  spike: {
    hit(c, h, i) {
      if (i === 0) { sl(c, { tilt: -PI / 2, scale: 1.3, sweep: 1.3 }); return; }
      c.cfx.disc(c.cx, c.cz, 2.8, c.color, 0.3, 0.5);
      c.cfx.shards(c.cx, c.cz, 7, 2.2);
      c.cfx.flash(c.cx, c.cz, c.color, 25, 0.3);
      c.fx.shockRing(c.cx, c.cz, 3.2, c.color, 0.35);
      c.fx.burst({ x: c.cx, z: c.cz }, '#b89a6a', 22, { speed: 6, up: 6, life: 0.6, y: 0.2, bright: 1 });
    },
  },
  skyspin: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.cancel, c.getY); },
    hit(c, h, i) {
      sl(c, { tilt: i % 2 ? 0.3 : -0.3, flip: i % 2 === 1, scale: i === 3 ? 1.4 : 1.05, yaw: c.yaw + i * 1.9 });
      if (i === 3) { c.cfx.flash(c.x, c.z, c.color, 20, 0.3, 1.5 + c.y); c.fx.burst({ x: c.x, y: c.y, z: c.z }, c.color, 20, { speed: 9, up: 1, life: 0.4, y: 1 }); }
    },
  },
};

export const AIR_SFX = {
  ...MOVE_SFX,
  backslash: { start: (s, m, lead) => { s.pierce(); s.swing({ lead, pitch: 0.9, size: 1.2 }); } },
  rise: { start: (s, m, lead) => s.swing({ lead, pitch: 1.05, size: 1.2 }), hit: (s) => s.leap(0.2) },
  chase: { start: (s, m, lead) => { s.leap(lead); s.swing({ lead, pitch: 1.15 }); } },
  airFlurry: { hit: (s, h, i) => s.swing({ lead: 0.02, pitch: 1.1 + i * 0.07, size: 0.8 }) },
  spike: { start: (s, m, lead) => s.swing({ lead, pitch: 0.7, size: 1.3 }), hit: (s, h, i) => { if (i) s.slam(1); } },
  skyspin: { start: (s, m, lead) => s.spin(lead), hit: (s, h, i) => { if (i === 3) s.galeRelease(); } },
};
