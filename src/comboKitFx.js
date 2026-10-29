// 拳 / 符的招式特效与音效（剑的在 comboFx.js / comboAir.js）。
// c = { cfx, fx, x, y, z, yaw, fx0/fz0 前方单位向量, color, cx, cz（圆形判定中心）}
// contact(c, d, h, i)：每个被这一下打中的木桩调用一次（冲击星打在木桩身上，而不是空气里）
const rand = (a, b) => a + Math.random() * (b - a);

// 角色前方 dist 米、往右手边偏 side 米、离地 y 的点
const at = (c, dist, side = 0, y = 0) => ({ x: c.x + c.fx0 * dist - Math.cos(c.yaw) * side, y: c.y + y, z: c.z + c.fz0 * dist + Math.sin(c.yaw) * side });
const DUST = '#c8b088', SPARK = '#fff3d0';

// 直拳：拳影 + 往前推的气环 + 速度线。side = 1 右手，-1 左手；big 0..1 越大越猛
function jab(c, side, big = 0) {
  c.cfx.fistShadow(c, c.yaw, c.color, { side: side * 0.22, len: 1.2 + big, size: 1 + big * 0.6 });
  c.cfx.airRing(at(c, 1.3 + big * 0.5, side * 0.15), c.yaw, c.color, { r0: 0.2, r1: 0.8 + big * 0.8, travel: 0.6 + big, dur: 0.18 + big * 0.06 });
  c.cfx.streaks(c, c.yaw, SPARK, { n: 3 + Math.round(big * 6), len: 0.8 + big });
}
// 拳风卷起的尘土：贴地往前喷
function dustCone(c, sp = 1) {
  const p = at(c, 0.8);
  for (let i = 0; i < 6 + sp * 4; i++) {
    const a = c.yaw + rand(-0.5, 0.5), v = rand(3, 7) * sp;
    c.fx.mote(p.x, 0.15, p.z, DUST, { vx: Math.sin(a) * v, vz: Math.cos(a) * v, vy: rand(0.3, 1.5), life: rand(0.35, 0.6), size: rand(0.8, 1.4), bright: 0.9, grav: -2 });
  }
}
const kick = (c) => c.fx.burst({ x: c.x - c.fx0 * 0.3, z: c.z - c.fz0 * 0.3 }, DUST, 6, { speed: 2, up: 1.5, life: 0.4, y: 0.1, bright: 1 });
const punchHit = (big) => (c, d) => c.cfx.star(d.pos, c.color, { size: 0.8 + big });
// 砸地：蛛网裂缝 + 贴地两道气环 + 气浪 + 碎石
function pound(c, x, z, r, big = 0) {
  const p = { x, y: 0, z };
  c.cfx.dent(x, z, r * 0.8, c.color);
  c.cfx.airRing(p, 0, c.color, { flat: true, y: 0.1, r0: 0.3, r1: r, travel: 0, dur: 0.3 });
  c.cfx.airRing(p, 0, c.color, { flat: true, y: 0.1, r0: 0.2, r1: r * 0.7, travel: 0, dur: 0.25, delay: 0.05, op: 0.4 });
  c.cfx.dome(x, z, r * 0.8, c.color, { dur: 0.25, op: 0.2 });
  c.cfx.star(p, c.color, { size: 0.8 + big * 0.3, y: 0.4 });
  c.fx.burst({ x, z }, '#b89a6a', 14 + big * 10, { speed: 5, up: 5, life: 0.6, y: 0.2, bright: 1 });
  if (big) c.cfx.flash(x, z, c.color, 12, 0.3);
}

export const KIT_FX = {
  // ---------- 拳 ----------
  ft_jab1: { hit: (c) => jab(c, -1), contact: punchHit(0) },
  ft_jab2: { hit: (c) => jab(c, 1), contact: punchHit(0.1) },
  ft_crush: {
    start: kick,
    hit(c) {
      jab(c, 1, 1);
      c.cfx.airRing(at(c, 1.6, 0.15), c.yaw, c.color, { r0: 0.4, r1: 1.6, travel: 1.6, delay: 0.04, op: 0.45 });
      dustCone(c, 1.2);
      c.cfx.flash(c.x + c.fx0 * 1.5, c.z + c.fz0 * 1.5, c.color, 10, 0.2, 1.2 + c.y);
    },
    contact: punchHit(0.6),
  },
  ft_hook: {
    hit(c) {
      c.cfx.fistShadow(c, c.yaw, c.color, { side: 0.2, len: 0.9, rise: 1.4, size: 1.2, y: 0.6 });
      c.cfx.airRing(at(c, 1.2, 0.1, 0.6), c.yaw, c.color, { pitch: -Math.PI / 2, y: 0, r0: 0.3, r1: 1.1, travel: 1.6 });
      c.cfx.streaks(c, c.yaw, SPARK, { up: true, n: 6 });
      c.fx.burst(at(c, 1.3), DUST, 8, { speed: 2, up: 6, life: 0.4, y: 0.2, bright: 0.9 });
    },
    contact: (c, d) => c.cfx.star(d.pos, c.color, { size: 1, y: 1.5 }),
  },
  ft_quake: { hit: (c, h, i) => pound(c, c.cx, c.cz, h.r, i) },
  ft_flurry: {
    hit(c, h, i) {
      const sd = i % 2 ? -1 : 1, last = i === 4;
      c.cfx.fistShadow(c, c.yaw + rand(-0.15, 0.15), c.color, { side: sd * rand(0.1, 0.45), y: rand(0.75, 1.4), len: last ? 2 : rand(1, 1.5), size: last ? 1.6 : 0.85 });
      if (!last) c.cfx.fistShadow(c, c.yaw + rand(-0.2, 0.2), c.color, { side: -sd * rand(0.1, 0.45), y: rand(0.7, 1.4), len: rand(0.9, 1.3), size: 0.7, delay: 0.035 });
      if (i % 2 || last) c.cfx.airRing(at(c, 1.5), c.yaw, c.color, { r0: 0.2, r1: last ? 1.6 : 0.7, travel: last ? 1.4 : 0.5 });
      if (last) { c.cfx.streaks(c, c.yaw, SPARK, { n: 10, len: 1.4 }); dustCone(c, 1); }
    },
    contact: (c, d, h, i) => c.cfx.star(d.pos, c.color, { size: i === 4 ? 1.4 : 0.6 }),
  },
  ft_bagua: {
    start: kick,
    hit(c) {
      c.cfx.dome(c.cx, c.cz, 2.4, c.color, { dur: 0.32, op: 0.55 });
      c.cfx.airRing(at(c, 0.9), c.yaw, c.color, { r0: 0.6, r1: 2, travel: 1.4, dur: 0.24 });
      c.cfx.airRing(at(c, 0.9), c.yaw, '#ffffff', { r0: 0.4, r1: 1.4, travel: 2, dur: 0.22, delay: 0.05, op: 0.5 });
      c.cfx.dent(c.x, c.z, 1.3, c.color, { n: 6 });
      c.cfx.streaks(c, c.yaw, SPARK, { n: 10, len: 1.3 });
      c.cfx.flash(c.cx, c.cz, c.color, 22, 0.3);
      dustCone(c, 1);
    },
    contact: punchHit(0.8),
  },
  ft_crush2: {
    start: kick,
    hit(c) {
      c.cfx.fistShadow(c, c.yaw, c.color, { side: 0.22, len: 3, size: 2.2, dur: 0.22 });
      [0, 1, 2].forEach((k) => c.cfx.airRing(at(c, 1.2 + k, 0.1), c.yaw, k ? c.color : '#ffffff', { r0: 0.3, r1: 1.1 + k * 0.5, travel: 0.6, delay: k * 0.05, dur: 0.22 }));
      c.cfx.streaks(c, c.yaw, SPARK, { n: 12, len: 1.8 });
      c.cfx.dent(c.x, c.z, 1.4, c.color, { n: 7 });
      dustCone(c, 1.6);
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 26, 0.3, 1.2 + c.y);
    },
    contact: punchHit(1.1),
  },

  // ---------- 符（飞符、陷阱本体在 arena.js，这里是出手时的灵光） ----------
  tl_throw: { hit: (c) => c.fx.burst(at(c, 0.6, 0.2), c.color, 5, { speed: 2, up: 1, life: 0.25, y: 1.2 }) },
  tl_fan: { hit: (c, h, i) => { if (!i) c.fx.burst(at(c, 0.6, 0.2), c.color, 8, { speed: 3, up: 1, life: 0.25, y: 1.2 }); } },
  tl_lightning: { start: (c) => c.fx.burst(at(c, 0.3, 0.2), '#ffffff', 6, { speed: 2, up: 3, life: 0.2, y: 1.4, grav: 0 }), hit: (c) => c.fx.burst(at(c, 0.6, 0.2), c.color, 10, { speed: 4, up: 1, life: 0.2, y: 1.2 }) },
  tl_trap: { start: (c) => seal(c) },
  tl_root: { start: (c) => seal(c) },
  // 符雨 / 镇煞：天上先开一个大法阵，符从阵里落下来
  tl_rain: { start: (c) => seal(c), hit: (c, h) => skySigil(c, h.spread + 1.2, 1.2) },
  tl_seal: { start: (c) => seal(c), hit: (c, h) => skySigil(c, h.r, 1.1, 9) },
  tl_det: { hit: (c) => c.fx.burst(at(c, 0.7, 0.3), c.color, 10, { speed: 3, up: 2, life: 0.25, y: 1.2 }) },
};
// 掐诀：身边灵气往上飘
function seal(c) {
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; c.fx.mote(c.x + Math.cos(a) * 0.7, c.y + 0.2, c.z + Math.sin(a) * 0.7, c.color, { vy: rand(1.5, 3), life: 0.5, size: 0.7 }); }
}
function skySigil(c, r, dur, y = 7) {
  const s = c.cfx.sigil(c.color);
  s.position.set(c.cx, y, c.cz); s.scale.setScalar(r);
  c.cfx.spawn(s, dur, (k, dt) => { s.rotation.y += dt * 2; s.material.opacity = 0.8 * Math.sin(Math.min(1, k * 1.4) * Math.PI); }, { mats: [s.material] });
}

// 拳的技能特效（伤害在 arena.js 的 SKILLS）。c 同上，cx / cz = 判定中心
export const SKILL_FX = {
  ft_shock(c) { // 震拳：双拳砸地，一圈气浪往外推
    pound(c, c.x, c.z, 3, 1);
    c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.15, r0: 1, r1: 4, travel: 0, dur: 0.4, delay: 0.06, op: 0.35 });
    dustCone(c, 0.6);
  },
  ft_charge(c) { // 撞山：撞上去那一下，气浪往前炸开
    c.cfx.dome(c.cx, c.cz, 2.4, c.color, { dur: 0.3, op: 0.5 });
    c.cfx.airRing(at(c, 0.8), c.yaw, c.color, { r0: 0.6, r1: 2.2, travel: 1.8, dur: 0.24 });
    c.cfx.airRing(at(c, 0.8), c.yaw, '#ffffff', { r0: 0.4, r1: 1.5, travel: 2.2, dur: 0.22, delay: 0.05, op: 0.5 });
    c.cfx.streaks(c, c.yaw, SPARK, { n: 12, len: 1.6 });
    c.cfx.star({ x: c.cx, y: c.y, z: c.cz }, c.color, { size: 1.6 });
    c.cfx.flash(c.cx, c.cz, c.color, 24, 0.3);
    dustCone(c, 1.4);
  },
  ft_bell(c) { // 金钟：罩下来时地面一圈尘
    c.fx.burst(c, DUST, 14, { speed: 4, up: 1, life: 0.5, y: 0.1, bright: 0.9 });
    c.cfx.airRing({ x: c.x, y: 0, z: c.z }, 0, c.color, { flat: true, y: 0.08, r0: 0.6, r1: 2.4, travel: 0, dur: 0.35, delay: 0.1 });
  },
};

// lead = 从出招到第一次判定的真实秒数
export const KIT_SFX = {
  ft_jab1: { start: (s, m, lead) => s.fistWhoosh({ lead }), hit: (s) => s.airPop(0) },
  ft_jab2: { start: (s, m, lead) => s.fistWhoosh({ lead, pitch: 1.1 }), hit: (s) => s.airPop(0.1) },
  ft_crush: { start: (s, m, lead) => { s.stomp(); s.fistWhoosh({ lead, size: 1.4, pitch: 0.8 }); }, hit: (s) => s.airPop(0.8) },
  ft_hook: { start: (s, m, lead) => s.fistWhoosh({ lead, pitch: 1.25 }), hit: (s) => s.airPop(0.4) },
  ft_quake: { start: (s, m, lead) => s.fistWhoosh({ lead, size: 1.3, pitch: 0.7 }), hit: (s, h, i) => s.groundBoom(i ? 1 : 0.4) },
  ft_flurry: { hit: (s, h, i) => { s.fistWhoosh({ lead: 0.02, size: 0.6, pitch: 1.2 }); s.airPop(i === 4 ? 0.8 : 0); } },
  ft_bagua: { start: (s, m, lead) => { s.stomp(); s.fistWhoosh({ lead, size: 1.3, pitch: 0.75 }); }, hit: (s) => { s.airPop(1); s.groundBoom(0); } },
  ft_crush2: { start: (s, m, lead) => { s.stomp(); s.fistWhoosh({ lead, size: 1.5, pitch: 0.7 }); }, hit: (s) => { s.airPop(1); s.groundBoom(0.5); } },
  tl_throw: { start: (s, m, lead) => s.paper(lead) },
  tl_fan: { start: (s, m, lead) => s.paper(lead) },
  tl_lightning: { start: (s, m, lead) => s.paper(lead), hit: (s) => s.zap() },
  tl_trap: { start: (s, m, lead) => s.chant(lead) },
  tl_root: { start: (s, m, lead) => s.chant(lead) },
  tl_rain: { start: (s, m, lead) => s.chant(lead) },
  tl_det: { start: (s, m, lead) => s.chant(lead * 0.5) },
  tl_seal: { start: (s, m, lead) => s.chant(lead) },
};
