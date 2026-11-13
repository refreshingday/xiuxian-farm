// 铃（GDD 第 4 节武器表：扇/铃·法宝，控场）。第七件武器。
// 不砍不砸，靠声音：摇一下一圈音波出去。伤害最低，但几乎每条路线的终结都能把人「定」住（h.hold = 定身几秒，妖王只吃三成）——
// 定住了换别的兵器接着打，或者趁机拉开。和扇一样可以边走边放（kit.free）。拼刀重量 0.75（main.js KIT_W）。
// 动作用 comboAnim.js 的关键帧 keys（字段说明见 comboDao.js 开头）；ext = 铃铛鼓起来多少（摇响的那一下）
import * as THREE from 'three';
const PI = Math.PI, TAU = PI * 2;
const SEAL = [-0.95, 0.45, -1.9];          // 左手在胸前掐诀
const READY = [-1.1, 0.2, -1.5, 0.1];      // 铃提在胸前
const UP = [-2.7, -0.2, -0.9, -0.2];       // 举过头顶
const OUT = [-1.5, 0.05, -0.1, 0.3];       // 往前一递
const k = (t, p, o = {}) => ({ t, p, one: 1, ...o });
const C = '#ff9ad2';
const base = { lp: SEAL, stance: 'throw', color: C };

export const BELL_MOVES = {
  // 摇铃：手腕一抖，一道音波直着出去
  ln1: { ...base, name: '摇铃', dur: 0.4, cancel: 0.26,
    keys: [k(0, READY), k(0.09, [-1.6, -0.2, -1.5, -0.1], { st: 0.2, lean: -0.04 }), k(0.14, OUT, { in: 1, st: 0.6, lean: 0.14, ext: 0.5 }),
      k(0.24, OUT, { st: 0.6, lean: 0.12, ext: 0.15 }), k(0.4, READY, { st: 0.2 })],
    hits: [{ t: 0.14, shape: 'wave', len: 5.5, w: 1.4, dmg: 8, knock: 2, stop: 0.02, shake: 0.08 }] },
  // 回音：反手再摇一下，音波散成一片
  ln2: { ...base, name: '回音', qi: 4, dur: 0.4, cancel: 0.26,
    keys: [k(0, READY), k(0.09, [-1.4, 1.2, -1.3, 0.5], { st: 0.2, lean: -0.04 }), k(0.14, [-1.45, -0.9, -0.2, -0.4], { in: 1, st: 0.6, lean: 0.14, ext: 0.5 }),
      k(0.24, [-1.45, -0.85, -0.25, -0.4], { st: 0.6, lean: 0.12, ext: 0.15 }), k(0.4, READY, { st: 0.2 })],
    hits: [{ t: 0.14, shape: 'arc', range: 4.4, arc: 1.2, dmg: 8, knock: 3, stop: 0.02, shake: 0.08 }] },
  // 震：铃举到头顶一顿，一圈音波从脚下荡开，把贴身的推出去
  ln3: { ...base, name: '震', qi: 8, dur: 0.5, cancel: 0.34,
    keys: [k(0, READY), k(0.12, UP, { lean: -0.1, sq: 0.05, st: 0.2 }), k(0.18, [-2.4, -0.2, -1.3, -0.2], { in: 1, sq: -0.06, st: 0.5, ext: 0.7 }),
      k(0.32, [-2.4, -0.2, -1.3, -0.2], { st: 0.5, ext: 0.2 }), k(0.5, READY, { st: 0.2 })],
    hits: [{ t: 0.18, shape: 'circle', at: 0, r: 3.8, dmg: 9, knock: 7, stop: 0.03, shake: 0.14 }] },
  // 定魂：对着前面连摇三下，一下比一下沉，第三下把那一片的人全定住
  ln_lull: { ...base, name: '定魂', qi: 16, end: true, dur: 0.9, cancel: 0.7,
    keys: [k(0, READY), k(0.14, [-1.7, -0.3, -1.4, -0.1], { st: 0.3 }), k(0.2, OUT, { in: 1, st: 0.6, lean: 0.12, ext: 0.4 }),
      k(0.3, [-1.7, -0.3, -1.4, -0.1], { st: 0.4 }), k(0.36, OUT, { in: 1, st: 0.7, lean: 0.14, ext: 0.5 }),
      k(0.46, [-1.9, -0.3, -1.4, -0.1], { st: 0.4, lean: -0.05 }), k(0.54, OUT, { in: 1, st: 0.9, lean: 0.2, ext: 0.9, sq: -0.05 }),
      k(0.7, OUT, { st: 0.9, lean: 0.18, ext: 0.3 }), k(0.9, READY, { st: 0.3 })],
    hits: [0.2, 0.36].map((t) => ({ t, shape: 'circle', at: 3.2, r: 3.0, dmg: 5, knock: -3, stop: 0.02, shake: 0.06 }))
      .concat([{ t: 0.54, shape: 'circle', at: 3.2, r: 3.2, dmg: 12, knock: 0, hold: 2.0, stop: 0.05, shake: 0.25 }]) },
  // 碎魄：铃声往回一收把四周的人摄到身边，再猛地一震全部震飞
  ln_shatter: { ...base, name: '碎魄', qi: 16, end: true, dur: 0.92, cancel: 0.7,
    keys: [k(0, READY), k(0.14, [-1.5, 0.6, -0.2, 0.3], { st: 0.5, lean: 0.1 }), k(0.22, [-1.0, -0.3, -2.0, -0.2], { in: 1, st: 0.3, lean: -0.08, ext: 0.4 }),
      k(0.44, UP, { lean: -0.16, sq: 0.08, st: 0.3, tr: 0.03 }), k(0.52, [-2.2, -0.2, -1.2, -0.2], { in: 1, sq: -0.1, st: 0.8, ext: 1.1 }),
      k(0.7, [-2.2, -0.2, -1.2, -0.2], { st: 0.8, ext: 0.3 }), k(0.92, READY, { st: 0.3 })],
    hits: [{ t: 0.22, shape: 'circle', at: 0, r: 5.5, dmg: 6, knock: -11, stop: 0.02, shake: 0.08 },
      { t: 0.52, shape: 'circle', at: 0, r: 4.4, dmg: 22, knock: 18, launch: 4, stop: 0.07, shake: 0.4 }] },
  // 回声：转着身子连摇，音波一道接一道往四面散，最后一道又宽又远
  ln_echo: { ...base, name: '回声', qi: 16, end: true, dur: 0.96, cancel: 0.74,
    keys: [k(0, READY), k(0.1, [-1.5, -0.9, -0.2, -0.3], { st: 0.5, ext: 0.3 }),
      k(0.46, [-1.5, -0.9, -0.2, -0.3], { lin: 1, spin: TAU, st: 0.5, lean: 0.05, ext: 0.3 }),
      k(0.56, [-1.8, -0.3, -1.5, -0.2], { spin: TAU, st: 0.4, lean: -0.08 }), k(0.64, OUT, { in: 1, spin: TAU, st: 1, lean: 0.22, ext: 1.0, sq: -0.05 }),
      k(0.8, OUT, { spin: TAU, st: 1, lean: 0.2, ext: 0.3 }), k(0.96, READY, { spin: TAU, st: 0.3 })],
    hits: [...[-0.6, 0, 0.6].map((ang) => ({ t: 0.18, shape: 'wave', ang, len: 6, w: 1.2, dmg: 6, knock: 2, stop: 0.01, shake: 0.06 })),
      ...[-0.3, 0.3].map((ang) => ({ t: 0.38, shape: 'wave', ang, len: 6, w: 1.2, dmg: 6, knock: 2, stop: 0.01, shake: 0.06 })),
      { t: 0.64, shape: 'wave', len: 9, w: 2.8, dmg: 15, knock: 14, stop: 0.06, shake: 0.3 }] },
  // 撞钟：铃往后一荡再撞出去，又慢又沉的一大道音波
  ln_toll: { ...base, name: '撞钟', qi: 10, dur: 0.62, cancel: 0.44,
    keys: [k(0, READY), k(0.2, [-1.3, -1.7, -0.9, -1.0], { st: 0.4, lean: -0.1, sq: 0.04 }), k(0.3, OUT, { in: 1, st: 0.9, lean: 0.25, ext: 0.9, sq: -0.05 }),
      k(0.44, OUT, { st: 0.9, lean: 0.22, ext: 0.3 }), k(0.62, READY, { st: 0.3 })],
    hits: [{ t: 0.3, shape: 'wave', len: 7, w: 2.4, dmg: 20, knock: 9, stop: 0.06, shake: 0.3 }] },
  // 罩：铃往天上一抛，一口大钟从天上扣下来，把前面那一圈人罩在里面动不了
  ln_cage: { ...base, name: '罩', qi: 18, end: true, dur: 0.9, cancel: 0.68,
    keys: [k(0, READY), k(0.14, [-0.6, 0, -0.6, 0], { st: 0.5, hip: -0.08, lean: 0.1 }), k(0.24, UP, { in: 1, lean: -0.2, sq: 0.1, st: 0.2, ext: 0.4 }),
      k(0.4, UP, { lean: -0.2, sq: 0.08, st: 0.2 }), k(0.48, [-0.7, 0, -0.3, 0.1], { in: 1, lean: 0.3, st: 0.9, sq: -0.08 }),
      k(0.68, [-0.7, 0, -0.3, 0.1], { lean: 0.26, st: 0.9 }), k(0.9, READY, { st: 0.3 })],
    hits: [{ t: 0.48, shape: 'circle', at: 4, r: 2.9, dmg: 20, knock: 0, spike: 10, vr: 8, hold: 2.6, stop: 0.08, shake: 0.5 }] },
  // 梵音：举铃蓄满，一声长鸣——前面一大片扇形里的人全被震得定在原地
  ln_dirge: { ...base, name: '梵音', qi: 28, end: true, dur: 1.14, cancel: 0.88, charge: 0.56,
    keys: [k(0, READY), k(0.2, UP, { lean: -0.18, sq: 0.08, st: 0.3, ext: 0.3 }), k(0.56, [-2.9, -0.2, -0.8, -0.2], { lean: -0.24, sq: 0.12, st: 0.3, ext: 1.2, tr: 0.05 }),
      k(0.64, OUT, { in: 1, lean: 0.35, st: 1, sq: -0.12, ext: 1.6 }), k(0.88, OUT, { lean: 0.3, st: 1, ext: 0.6 }), k(1.14, READY, { st: 0.4 })],
    hits: [{ t: 0.64, shape: 'arc', range: 9, arc: 0.8, dmg: 32, knock: 0, hold: 1.6, stop: 0.12, shake: 0.7 }] },
};
for (const id in BELL_MOVES) BELL_MOVES[id].id = id;

export const BELL_TREE = {
  '': 'ln1', F: 'ln2', S: 'ln_toll',
  FF: 'ln3', FS: 'ln_echo',
  FFF: 'ln_lull', FFS: 'ln_shatter',
  SF: 'ln_cage', SS: 'ln_dirge',
};
export const BELL_ROUTES = [
  { name: '定魂', seq: 'FFF', tag: '4连 · 连摇三下 → 定住一片' },
  { name: '碎魄', seq: 'FFS', tag: '4连 · 摄到身边 → 震飞' },
  { name: '回声', seq: 'FS', tag: '3连 · 音波四散 → 一道大的' },
  { name: '震', seq: 'FF', tag: '3连 · 一圈音波推开' },
  { name: '罩', seq: 'SF', tag: '3连 · 大钟扣下 · 定身最久' },
  { name: '梵音', seq: 'SS', tag: '3连 · 蓄力 · 大扇形定身' },
];

export const BELL_SKILLS = [
  { id: 'ln_lure', name: '摄魂', qi: 30, cd: 8, pose: 'cast', ht: 0.1 },
  { id: 'ln_wave', name: '音波', qi: 25, cd: 5, pose: 'thrust', ht: 0.12 },
  { id: 'ln_bind', name: '镇魂', qi: 35, cd: 10, pose: 'raise', ht: 0.18 },
];

// ---------- 特效：音波——一圈圈荡开的环 + 飘起来的光点，没有刃光 ----------
const PALE = '#ffe0f0', GOLD = '#ffd98a';
const rand = (a, b) => a + Math.random() * (b - a);
const motes = (c, x, z, n = 6, r = 1) => { for (let i = 0; i < n; i++) c.fx.mote(x + rand(-r, r), rand(0.3, 1.6), z + rand(-r, r), i % 2 ? GOLD : PALE, { vy: rand(1, 2.5), life: 0.6, size: 0.8, bright: 1.3 }); };
// 往前送的一串音环
function beam(c, yaw, s = 1, n = 3) {
  for (let i = 0; i < n; i++) c.cfx.airRing({ x: c.x, y: c.y, z: c.z }, yaw, i % 2 ? PALE : c.color, { r0: 0.3 * s, r1: (0.9 + i * 0.25) * s, travel: (2.4 + i * 1.2) * s, dur: 0.3 + i * 0.05, op: 0.6, delay: i * 0.05 });
}
// 贴地荡开的音环
function pulse(c, x, z, r, n = 2, y = 0.5) {
  for (let i = 0; i < n; i++) c.cfx.airRing({ x, y: 0, z }, 0, i % 2 ? PALE : c.color, { flat: true, y: y + i * 0.5, r0: r * 0.2, r1: r * (1 - i * 0.15), travel: 0, dur: 0.36, op: 0.6, delay: i * 0.06 });
}
// 往里收的环（摄）
const draw = (c, x, z, r) => { for (let i = 0; i < 2; i++) c.cfx.airRing({ x, y: 0, z }, 0, i ? PALE : c.color, { flat: true, y: 0.4 + i * 0.6, r0: r, r1: r * 0.2, travel: 0, dur: 0.3, op: 0.5, delay: i * 0.07 }); };
// 一口大钟扣下来罩住，dur 秒后淡掉（s = 放大几倍；comboFx 的 bell 是按人的尺寸做的金钟罩）
export function bigBell(c, x, z, s, dur) {
  const m = c.cfx.mat(GOLD, 1.5), g = new THREE.Mesh(c.cfx.geo('bell'), m);
  c.cfx.spawn(g, dur, (q) => {
    const t = q * dur, drop = Math.min(1, t / 0.14), e = 1 - (1 - drop) ** 3;
    g.position.set(x, (1 - e) * 7, z); g.scale.set(s, s * (1 + (1 - drop) * 0.3), s);
    m.opacity = (0.26 + 0.06 * Math.sin(t * 14)) * Math.min(1, t / 0.08) * (q > 0.8 ? (1 - q) / 0.2 : 1);
  }, { mats: [m] });
}
const hum = (c, d) => { c.fx.burst(d.pos, PALE, 5, { speed: 3, up: 3, life: 0.35, y: 1.1 }); };

export const BELL_FX = {
  ln1: { hit: (c) => beam(c, c.yaw, 1, 2), contact: hum },
  ln2: { hit: (c) => { for (const a of [-0.6, 0, 0.6]) beam(c, c.yaw + a, 0.8, 2); }, contact: hum },
  ln3: { hit: (c) => { pulse(c, c.x, c.z, 3.8); motes(c, c.x, c.z, 8, 2); }, contact: hum },
  ln_lull: {
    hit(c, h, i) {
      pulse(c, c.cx, c.cz, 3 + i * 0.2, i === 2 ? 3 : 1, 0.3);
      if (i === 2) { c.cfx.disc(c.cx, c.cz, 3.2, c.color, 0.5, 0.35); motes(c, c.cx, c.cz, 14, 2.6); }
    },
    contact: hum,
  },
  ln_shatter: {
    hit(c, h, i) {
      if (!i) { draw(c, c.x, c.z, 5.5); return; }
      pulse(c, c.x, c.z, 4.6, 3); c.cfx.flash(c.x, c.z, c.color, 10, 0.3); motes(c, c.x, c.z, 16, 3);
      c.fx.burst({ x: c.x, z: c.z }, PALE, 20, { speed: 9, up: 2, life: 0.4, y: 0.6 });
    },
    contact: (c, d, h, i) => { hum(c, d); if (i) c.cfx.star(d.pos, c.color, { size: 1 }); },
  },
  ln_echo: {
    hit(c, h, i) { if (i < 5) beam(c, c.yaw + h.ang, 0.8, 2); else { beam(c, c.yaw, 1.8, 4); motes(c, c.x + c.fx0 * 2, c.z + c.fz0 * 2, 10, 1.5); } },
    contact: hum,
  },
  ln_toll: { hit: (c) => { beam(c, c.yaw, 1.6, 3); motes(c, c.x + c.fx0 * 1.5, c.z + c.fz0 * 1.5, 6, 1); }, contact: (c, d) => { hum(c, d); c.cfx.star(d.pos, c.color, { size: 0.9 }); } },
  ln_cage: {
    hit(c, h) {
      const x = c.cx, z = c.cz;
      bigBell(c, x, z, 2.2, h.hold); c.cfx.dent(x, z, 2.6, c.color, { n: 8 }); pulse(c, x, z, 3.6, 2, 0.2);
      c.fx.burst({ x, z }, '#c8b89a', 20, { speed: 7, up: 2, life: 0.5, y: 0.1, bright: 1 }); c.cfx.flash(x, z, GOLD, 9, 0.25);
    },
    contact: hum,
  },
  ln_dirge: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.charge); c.fx.burst(c, PALE, 18, { speed: 2, up: 5, life: m.charge, y: 0.2 }); },
    hit(c) {
      for (const a of [-0.5, 0, 0.5]) beam(c, c.yaw + a, 2.2, 3);
      pulse(c, c.x, c.z, 3, 1); c.cfx.flash(c.x + c.fx0 * 3, c.z + c.fz0 * 3, c.color, 10, 0.3);
      for (let i = 1; i <= 3; i++) motes(c, c.x + c.fx0 * i * 2.4, c.z + c.fz0 * i * 2.4, 8, 2.4);
    },
    contact: (c, d) => { hum(c, d); c.cfx.star(d.pos, c.color, { size: 1.1 }); },
  },
};

// 技能特效（伤害在 arena.js / combat.js 的 SKILLS）
export const BELL_SKILL_FX = {
  ln_lure(c, last) { if (last) { pulse(c, c.x, c.z, 3.6, 3); motes(c, c.x, c.z, 14, 2.5); c.cfx.flash(c.x, c.z, c.color, 9, 0.3); } else draw(c, c.x, c.z, 7); },
  ln_wave(c, r) { pulse(c, c.x, c.z, r, 2, 0.6); },
  ln_bind_mark(c, x, z) { c.cfx.disc(x, z, 3.4, c.color, 0.4, 0.3); },
  ln_bind(c, x, z, dur) {
    bigBell(c, x, z, 2.7, dur); c.cfx.dent(x, z, 3.2, c.color, { n: 10 }); pulse(c, x, z, 4.4, 3, 0.2);
    c.fx.burst({ x, z }, '#c8b89a', 26, { speed: 8, up: 3, life: 0.6, y: 0.1, bright: 1 }); c.cfx.flash(x, z, GOLD, 11, 0.3); motes(c, x, z, 16, 3);
  },
};

// 音效：铜铃是低而圆的“咚——嗡”，不是“叮”。只用 660Hz 以下的正弦（基音 + 两个低泛音）、慢起音（≥12ms），加一点低通噪声当槌声；
// 不用 ring()、不用高音 sine / triangle、不用 2kHz 以上的噪声（“叮 / tin”的金属声已被否决，见 CLAUDE.md）
export function dong(s, { f = 200, dur = 0.7, gain = 0.3, t = 0 } = {}) {
  s.noise({ t, dur: 0.07, type: 'lowpass', f0: 1100, f1: 300, q: 0.3, gain: gain * 0.6 });
  s.tone({ t, f0: f, dur, gain, attack: 0.012, send: 0.35 });
  s.tone({ t, f0: f * 2, dur: dur * 0.55, gain: gain * 0.35, attack: 0.014, send: 0.35 });
  s.tone({ t, f0: f * 2.76, dur: dur * 0.35, gain: gain * 0.16, attack: 0.016, send: 0.35 });
}
const air = (s, dur = 0.3, gain = 0.2) => s.noise({ dur, type: 'lowpass', f0: 900, f1: 300, q: 0.3, gain, attack: dur * 0.4, send: 0.2 });
export const BELL_SFX = {
  ln1: { hit: (s) => dong(s, { f: 220, dur: 0.45, gain: 0.22 }) },
  ln2: { hit: (s) => dong(s, { f: 196, dur: 0.45, gain: 0.22 }) },
  ln3: { hit: (s) => { dong(s, { f: 165, dur: 0.7, gain: 0.28 }); air(s); } },
  ln_lull: { hit: (s, h, i) => dong(s, { f: [220, 185, 147][i], dur: i === 2 ? 1.3 : 0.4, gain: i === 2 ? 0.34 : 0.2 }) },
  ln_shatter: { hit: (s, h, i) => (i ? (dong(s, { f: 131, dur: 1.2, gain: 0.38 }), s.airPop(0.6)) : air(s, 0.35, 0.3)) },
  ln_echo: { hit: (s, h, i) => { if (i === 0) dong(s, { f: 220, dur: 0.4, gain: 0.2 }); else if (i === 3) dong(s, { f: 196, dur: 0.4, gain: 0.2 }); else if (i === 5) { dong(s, { f: 147, dur: 1.1, gain: 0.34 }); air(s, 0.4, 0.3); } } },
  ln_toll: { start: (s) => air(s, 0.3, 0.18), hit: (s) => dong(s, { f: 147, dur: 1.0, gain: 0.36 }) },
  ln_cage: { start: (s) => air(s, 0.4, 0.2), hit: (s) => { dong(s, { f: 98, dur: 1.8, gain: 0.4 }); s.groundBoom(0.3); } },
  ln_dirge: { start: (s) => air(s, 0.56, 0.25), hit: (s) => { dong(s, { f: 110, dur: 2.0, gain: 0.42 }); dong(s, { f: 165, dur: 1.4, gain: 0.2, t: 0.02 }); air(s, 0.6, 0.35); } },
};
export const BELL_SKILL_SFX = { dong, air };
