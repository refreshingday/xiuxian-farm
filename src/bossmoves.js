// 妖王各自的招式（GDD 第 4 节：多阶段、前摇清晰、以闪避为主；只有破绽时能被技能打断，打断后倒地）。
// 每个妖王在通用的砸地 / 弹幕 / 冲锋 / 召唤之外，还有 BOSSES[*].sig 里列的自己的招。
// 招式 = (en, e, toP, p2) => 设好 e.state = 'act'、e.st（持续）、e.tick（每帧，可以没有）、e.open（收招后的破绽秒数）。
import { angDiff } from './util.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// 只在这只妖王没被打断过的时候执行（打断后排好的后续招作废；已经画在地上的红圈照样落下）
function later(en, e, t, fn) { const gen = e.gen; en.game.after(t, () => { if (e.alive && e.gen === gen) fn(); }); }
function act(e, dur, open, tick = null) { e.state = 'act'; e.st = dur; e.open = open; e.tick = tick; }
const inR = (P, x, z, r) => Math.hypot(P.pos.x - x, P.pos.z - z) < r + P.r;
const lead = (P, k = 0.3) => ({ x: P.pos.x + P.vel.x * k, z: P.pos.z + P.vel.z * k });
function hit(P, dmg, x, z, knock, slow) { if (P.hurt(dmg, x, z, knock) && slow) P.slowT = Math.max(P.slowT || 0, slow); }

// 地面一击：红圈前摇，落下时圈里的挨打。o.zone = 留下一片持续伤害 / 减速的地；o.slow = 打中后减速几秒
function strike(en, e, x, z, r, dur, dmg, o = {}) {
  const g = en.game, P = g.player, col = o.color || e.T.c[2];
  g.fx.circle(x, z, r, dur, () => {
    if (!e.alive) return;
    g.fx.shockRing(x, z, r * 1.15, col); g.fx.burst({ x, z }, col, o.n ?? 14, { speed: 5, y: 0.2, up: 3 });
    g.shake(o.shake ?? 0.3);
    if (inR(P, x, z, r)) hit(P, dmg, x, z, o.knock ?? 8, o.slow);
    if (o.zone) en.zone({ x, z, r: o.zone.r ?? r, life: o.zone.life ?? 4, dmg: o.zone.dmg ?? 0, slow: o.zone.slow, pull: o.zone.pull, color: o.zone.color || col });
    o.done?.();
  });
}
// 直线一击：从 (x, z) 朝 yaw 方向一条长 len、宽 w 的预警带
function beam(en, e, x, z, yaw, len, w, dur, dmg, o = {}) {
  const g = en.game, P = g.player, col = o.color || e.T.c[2], s = Math.sin(yaw), c = Math.cos(yaw);
  g.fx.line(x, z, yaw, len, w, dur, () => {
    if (!e.alive) return;
    for (let d = 0; d < len; d += 1.4) g.fx.burst({ x: x + s * d, z: z + c * d }, col, 2, { speed: 3, up: 3, y: 0.2, life: 0.4 });
    const px = P.pos.x - x, pz = P.pos.z - z, along = px * s + pz * c, side = Math.abs(px * c - pz * s);
    if (along > -P.r && along < len + P.r && side < w / 2 + P.r) hit(P, dmg, x + s * along, z + c * along, o.knock ?? 9, o.slow);
    g.shake(o.shake ?? 0.25);
  });
}
// 一圈弹：gap = 留一个缺口的方向（从缺口钻过去）
function ringShots(en, e, x, z, n, spd, dmg, a0 = 0, gap = null, size = 1.5) {
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU;
    if (gap !== null && Math.abs(angDiff(a, gap)) < 0.42) continue;
    en.shoot(x, z, a, spd, dmg, e.T.shot || e.T.c[2], size);
  }
}
// 连续扑击：每次先画一条线，停一下再冲。trail = 冲过的地方留下火 / 冰
function dashes(en, e, n, o) {
  const g = en.game, P = g.player; let i = 0, t = 0.05, ph = 'aim', trail = 0;
  act(e, 99, o.open ?? 1.2, (dt, mv, dist, toP) => {
    t -= dt;
    if (ph === 'aim') { if (t <= 0) { e.chargeDir = toP; g.fx.line(e.pos.x, e.pos.z, toP, o.spd * o.dur + 2, o.w ?? 2.6, o.wind); ph = 'wind'; t = o.wind; } return; }
    mv.face = e.chargeDir;
    if (ph === 'wind') { if (t <= 0) { ph = 'dash'; t = o.dur; e.hitOnce = false; g.shake(0.25); } return; }
    mv.mx = Math.sin(e.chargeDir); mv.mz = Math.cos(e.chargeDir); mv.spd = o.spd;
    g.fx.mote(e.pos.x + rnd(-1, 1), 0.3, e.pos.z + rnd(-1, 1), o.color || e.T.c[2], { life: 0.5, size: 1.4 });
    if (o.trail && (trail -= dt) <= 0) { trail = 0.1; en.zone({ x: e.pos.x, z: e.pos.z, r: 1.4, life: o.trail.life ?? 4, dmg: o.trail.dmg ?? 0, slow: o.trail.slow, color: o.trail.color }); }
    if (!e.hitOnce && dist < e.r + P.r + 0.3) { e.hitOnce = true; P.hurt(e.dmg * (o.mul ?? 1), e.pos.x, e.pos.z, 12); }
    if (t <= 0) { if (++i >= n) e.st = 0; else { ph = 'aim'; t = o.gap ?? 0.15; } }
  });
}
// 跳到某处砸下来（身子用 e.hop 抬高，落地前不碰人）
function leap(en, e, x, z, dur, r, dmg, o = {}) {
  const x0 = e.pos.x, z0 = e.pos.z; let t = 0;
  strike(en, e, x, z, r, dur, dmg, { shake: 0.7, knock: 12, n: 26, ...o });
  return (dt) => {
    t = Math.min(dur, t + dt); const k = t / dur;
    e.pos.x = x0 + (x - x0) * k; e.pos.z = z0 + (z - z0) * k; e.hop = Math.sin(k * Math.PI) * (o.h ?? 2.4);
    if (k >= 1) e.hop = 0;
  };
}

const FIRE = '#ff7a2a', ICE = '#9ee8ff', POISON = '#7aff4a', WATER = '#5ab8ff', DARK = '#b07aff';

export const SIG = {
  // ---- 赤岩妖王：地裂（六道裂缝从脚下炸开）、岩浆（扔岩浆团，落地烧一片） ----
  quake(en, e, toP, p2) {
    const n = p2 ? 8 : 6;
    act(e, 1.5, 1.6); en.game.fx.shockRing(e.pos.x, e.pos.z, 3, FIRE);
    for (let i = 0; i < n; i++) beam(en, e, e.pos.x, e.pos.z, toP + i / n * TAU, 15, 1.8, 1.0, e.dmg, { color: FIRE, shake: 0.12 });
  },
  magma(en, e, toP, p2) {
    const n = p2 ? 5 : 3, P = en.game.player;
    act(e, n * 0.4 + 1.2, 0.8);
    for (let i = 0; i < n; i++) later(en, e, i * 0.4, () => { const p = lead(P, 0.5); strike(en, e, p.x, p.z, 2.2, 1.0, e.dmg * 0.8, { color: FIRE, zone: { r: 2.2, life: 5, dmg: e.dmg * 0.15 } }); });
  },
  // ---- 狼王们：三连扑（每扑一次重新瞄）、狼嚎（震开 + 叫狼，自己加速） ----
  pounce(en, e, toP, p2) { dashes(en, e, p2 ? 4 : 3, { wind: p2 ? 0.38 : 0.48, dur: 0.32, spd: 24, open: 1.4 }); },
  howl(en, e, toP, p2) {
    const g = en.game;
    act(e, 1.2, 0);
    strike(en, e, e.pos.x, e.pos.z, 4.5, 0.9, e.dmg * 0.5, { knock: 18, done: () => { e.hasteT = 8; g.toast(`${e.T.name} 长嚎，狼群应声而来`, 1.8); } });
    later(en, e, 1.0, () => en.bossStart(e, 'summon', toP, p2));
  },
  // ---- 冰系：冰爆（身边一大圈，打中冻慢、留冰面）、冰冲（冲过的地结冰）、冰锥（一排冰锥一路砸过来） ----
  frostnova(en, e, toP, p2) {
    act(e, 1.4, 1.2);
    strike(en, e, e.pos.x, e.pos.z, p2 ? 7 : 6, 1.1, e.dmg, { color: ICE, slow: 2.5, zone: { life: 4, slow: true, color: ICE } });
  },
  icecharge(en, e, toP, p2) { dashes(en, e, p2 ? 2 : 1, { wind: 0.8, dur: 0.8, spd: 18, open: 1.2, color: ICE, trail: { slow: true, life: 5, color: ICE } }); },
  icicles(en, e, toP, p2) {
    const rows = p2 ? [-0.45, 0, 0.45] : [0];
    act(e, 2.2, 1.0);
    for (const da of rows) for (let i = 0; i < 9; i++) later(en, e, i * 0.12, () => {
      const d = 3 + i * 2.2, a = toP + da;
      strike(en, e, e.pos.x + Math.sin(a) * d, e.pos.z + Math.cos(a) * d, 1.4, 0.6, e.dmg * 0.7, { color: ICE, slow: 1.5, shake: 0.08, n: 6 });
    });
  },
  // ---- 蛇 / 毒：吐毒（几团毒落在你身边，留毒雾）、缠绞（一圈弹从四面往里收，要冲出去） ----
  venom(en, e, toP, p2) {
    const n = p2 ? 5 : 3, P = en.game.player;
    act(e, 1.6, 0.9);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), d = i ? rnd(1.5, 4) : 0, p = lead(P, 0.4);
      strike(en, e, p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 1.8, 0.9 + i * 0.12, e.dmg * 0.6, { color: POISON, zone: { life: 6, dmg: e.dmg * 0.12, color: POISON } });
    }
  },
  constrict(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 26 : 20, R = 7.5, cx = P.pos.x, cz = P.pos.z;
    act(e, 2.4, 1.4);
    for (let i = 0; i < n; i++) { const a = i / n * TAU; en.game.fx.mote(cx + Math.sin(a) * R, 1, cz + Math.cos(a) * R, e.T.shot || POISON, { life: 0.8, size: 1.4, vy: 0, bright: 3 }); }
    later(en, e, 0.8, () => { for (let i = 0; i < n; i++) { const a = i / n * TAU; en.shoot(cx + Math.sin(a) * R, cz + Math.cos(a) * R, a + Math.PI, 4.2, e.dmg * 0.6, e.T.shot || POISON, 1.4); } });
  },
  // ---- 毒蛛后：蛛网（几团慢弹，打中寸步难行）、产卵（趴着产卵＝长破绽，卵落地孵出小蛛） ----
  web(en, e, toP, p2) {
    act(e, 1.2, 0.6);
    for (let i = -2; i <= 2; i++) { const p = en.shoot(e.pos.x, e.pos.z, toP + i * 0.28, 6, e.dmg * 0.4, '#f0f0ff', 1.8); p.slow = 2.5; }
  },
  eggs(en, e, toP, p2) {
    const n = p2 ? 4 : 3;
    act(e, 0.4, 2.4); en.game.toast(`${e.T.name} 伏下身子产卵——趁现在！`, 1.8);
    for (let i = 0; i < n; i++) {
      const a = toP + (i - (n - 1) / 2) * 0.9, x = e.pos.x + Math.sin(a) * 5, z = e.pos.z + Math.cos(a) * 5;
      strike(en, e, x, z, 1.2, 2.6, e.dmg * 0.4, { color: POISON, shake: 0.1, done: () => { en.spawn(e.T.minion, x, z, Math.max(0, e.lvl - 3)).state = 'chase'; } });
    }
  },
  // ---- 火：火线冲锋、喷发（三圈火从里往外炸）、流星火雨 ----
  firetrail(en, e, toP, p2) { dashes(en, e, p2 ? 2 : 1, { wind: 0.7, dur: 0.75, spd: 20, open: 1.0, color: FIRE, trail: { dmg: e.dmg * 0.15, life: 4, color: FIRE } }); },
  eruption(en, e, toP, p2) {
    act(e, 2.3, 1.2);
    for (let ring = 0; ring < 3; ring++) later(en, e, ring * 0.55, () => {
      const r = 3 + ring * 3, n = 6 + ring * 4, off = ring * 0.4;
      for (let i = 0; i < n; i++) { const a = off + i / n * TAU; strike(en, e, e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, 1.6, 0.7, e.dmg * 0.8, { color: FIRE, shake: 0.06, n: 5 }); }
    });
  },
  meteor(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 16 : 11;
    act(e, 3.6, 1.8); en.game.toast('天降火雨！', 1.4);
    for (let i = 0; i < n; i++) later(en, e, i * 0.2, () => { const a = rnd(0, TAU), d = rnd(0, 8); strike(en, e, P.pos.x + Math.cos(a) * d, P.pos.z + Math.sin(a) * d, 2, 0.9, e.dmg * 0.7, { color: FIRE, shake: 0.12, zone: { life: 2.5, dmg: e.dmg * 0.12, color: FIRE } }); });
    later(en, e, n * 0.2, () => strike(en, e, P.pos.x, P.pos.z, 5, 1.5, e.dmg * 1.5, { color: '#ffd03a', shake: 0.9, knock: 16 }));
  },
  // ---- 傀儡：旋风（转着追你三秒，转完晕头＝长破绽）、跳砸 ----
  whirl(en, e, toP, p2) {
    const g = en.game, P = g.player; let cd = 0, shot = 0;
    act(e, p2 ? 3.6 : 3, 2.2, (dt, mv, dist, toP) => {
      mv.mx = Math.sin(toP); mv.mz = Math.cos(toP); mv.spd = p2 ? 5 : 4.2; mv.face = e.yaw + 1.5; // 一直往前转
      if (Math.random() < 0.6) g.fx.mote(e.pos.x + rnd(-2.5, 2.5), 0.8, e.pos.z + rnd(-2.5, 2.5), e.T.c[2], { life: 0.3, size: 1.2 });
      if ((cd -= dt) <= 0 && dist < e.r + P.r + 1.2) { cd = 0.5; P.hurt(e.dmg * 0.6, e.pos.x, e.pos.z, 14); }
      if (e.type === 'swordpuppet' && (shot -= dt) <= 0) { shot = 0.35; en.shoot(e.pos.x, e.pos.z, e.yaw, 9, e.dmg * 0.45, e.T.c[2], 1.2); }
    });
    later(en, e, e.st, () => g.toast(`${e.T.name} 转晕了！`, 1.4));
  },
  stomp(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 2 : 1; let step = null;
    act(e, n * 1.2 + 0.1, 1.3, (dt) => step?.(dt));
    for (let i = 0; i < n; i++) later(en, e, i * 1.2, () => { const p = lead(P, 0.6); step = leap(en, e, p.x, p.z, 1.1, 3.6, e.dmg * 1.2); });
  },
  // ---- 鬼：闪现背刺（瞬移到你身后砸一下，连几次）、群魂（一圈魂火挨个射过来）、摄魂（把你往它身边吸，再炸开） ----
  blink(en, e, toP, p2) {
    const g = en.game, P = g.player, n = p2 ? 3 : 2;
    act(e, n * 0.95 + 0.3, 1.2);
    for (let i = 0; i < n; i++) later(en, e, i * 0.95, () => {
      g.fx.burst(e.pos, DARK, 24, { speed: 4, up: 3 });
      const a = P.yaw + Math.PI + rnd(-0.6, 0.6), x = P.pos.x + Math.sin(a) * 3.2, z = P.pos.z + Math.cos(a) * 3.2;
      e.pos.x = x; e.pos.z = z; g.fx.burst(e.pos, DARK, 24, { speed: 4, up: 3 });
      strike(en, e, x, z, 3, 0.65, e.dmg, { color: DARK });
    });
  },
  souls(en, e, toP, p2) {
    const g = en.game, P = g.player, n = p2 ? 9 : 6;
    act(e, 0.6 + n * 0.22 + 0.3, 1.0);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      later(en, e, 0.6 + i * 0.22, () => { const x = e.pos.x + Math.sin(a) * 2.5, z = e.pos.z + Math.cos(a) * 2.5; en.shoot(x, z, Math.atan2(P.pos.x - x, P.pos.z - z), 11, e.dmg * 0.5, e.T.shot || DARK, 1.3, 2); });
    }
    for (let i = 0; i < n; i++) { const a = i / n * TAU; g.fx.mote(e.pos.x + Math.sin(a) * 2.5, 2, e.pos.z + Math.cos(a) * 2.5, e.T.shot || DARK, { life: 0.6 + i * 0.22, size: 1.6, vy: 0, bright: 3 }); }
  },
  soulpull(en, e, toP, p2) {
    const g = en.game, P = g.player;
    act(e, 1.8, 1.4, (dt, mv, dist) => {
      mv.spd = 0;
      if (e.st > 0.2 && dist < 16 && dist > 0.5) { const k = (p2 ? 52 : 40) * dt; P.kx += (e.pos.x - P.pos.x) / dist * k; P.kz += (e.pos.z - P.pos.z) / dist * k; }
      if (Math.random() < 0.8) { const a = rnd(0, TAU), r = rnd(4, 9); g.fx.mote(e.pos.x + Math.sin(a) * r, 0.6, e.pos.z + Math.cos(a) * r, DARK, { life: 0.5, size: 1, vx: -Math.sin(a) * r * 1.6, vz: -Math.cos(a) * r * 1.6, vy: 0 }); }
    });
    strike(en, e, e.pos.x, e.pos.z, 4.5, 1.6, e.dmg * 1.3, { color: DARK, knock: 16, shake: 0.6 });
  },
  // ---- 水：浪（三道大浪推过来）、漩涡（脚下一片往中间吸）、海啸（三圈水弹，每圈留一个缺口） ----
  tidewave(en, e, toP, p2) {
    act(e, 2.0, 1.2);
    for (let i = 0; i < 3; i++) later(en, e, i * 0.35, () => { const a = toP + Math.PI / 2, o = (i - 1) * 3.2; beam(en, e, e.pos.x + Math.sin(a) * o, e.pos.z + Math.cos(a) * o, toP, 18, 3, 0.85, e.dmg * 0.8, { color: WATER, knock: 18 }); });
  },
  whirlpool(en, e, toP, p2) {
    const P = en.game.player;
    act(e, 1.0, 0.6);
    strike(en, e, P.pos.x, P.pos.z, 3.8, 0.9, e.dmg * 0.4, { color: WATER, zone: { r: 3.8, life: 5, dmg: e.dmg * 0.1, pull: p2 ? 5 : 3.5, color: WATER } });
    later(en, e, 1.1, () => ringShots(en, e, e.pos.x, e.pos.z, 12, 6, e.dmg * 0.5, rnd(0, TAU)));
  },
  tsunami(en, e, toP, p2) {
    const n = p2 ? 4 : 3;
    act(e, 0.6 + n * 0.7, 1.5); en.game.fx.shockRing(e.pos.x, e.pos.z, 6, WATER);
    for (let i = 0; i < n; i++) later(en, e, 0.6 + i * 0.7, () => { ringShots(en, e, e.pos.x, e.pos.z, 30, 6.5, e.dmg * 0.6, i * 0.1, toP + rnd(-1.4, 1.4), 1.7); en.game.shake(0.2); });
  },
  // ---- 火鸦王：俯冲（飞起来标三处，挨个扎下去） ----
  dive(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 4 : 3; let step = null;
    act(e, n * 0.75 + 0.2, 1.4, (dt) => step?.(dt));
    for (let i = 0; i < n; i++) later(en, e, i * 0.75, () => { const p = lead(P, 0.4); step = leap(en, e, p.x, p.z, 0.72, 2.6, e.dmg, { h: 3.2, color: e.T.c[2], zone: e.elem === '火' ? { life: 2.5, dmg: e.dmg * 0.12, color: FIRE } : null }); });
  },
  // ---- 沙蝎王：遁地（钻进沙里追你，从脚下冒出来）、毒刺 ----
  burrow(en, e, toP, p2) {
    const g = en.game, P = g.player; let t = 0, up = false;
    e.hidden = true; e.root.visible = false; g.fx.burst(e.pos, '#d8a850', 40, { speed: 6, up: 4 });
    act(e, 3, 1.6, (dt, mv, dist, toP) => {
      t += dt;
      if (!up) {
        mv.mx = Math.sin(toP); mv.mz = Math.cos(toP); mv.spd = dist > 1 ? 9 : 0;
        if (Math.random() < 0.9) g.fx.mote(e.pos.x + rnd(-1, 1), 0.15, e.pos.z + rnd(-1, 1), '#d8a850', { life: 0.6, size: 1.3, vy: 1.5 });
        if (t > (p2 ? 1.2 : 1.6)) {
          up = true; const x = P.pos.x, z = P.pos.z;
          e.pos.x = x; e.pos.z = z;
          strike(en, e, x, z, 3, 0.8, e.dmg * 1.3, { color: '#ffa03a', knock: 14, shake: 0.7, done: () => { e.hidden = false; e.root.visible = true; } });
          e.st = 0.85;
        }
      } else mv.spd = 0;
    });
  },
  tailstab(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 4 : 3;
    act(e, n * 0.45 + 0.6, 0.8);
    for (let i = 0; i < n; i++) later(en, e, i * 0.45, () => { const p = lead(P, 0.35); strike(en, e, p.x, p.z, 1.4, 0.5, e.dmg * 0.8, { color: POISON, n: 8, zone: { life: 3, dmg: e.dmg * 0.1, color: POISON } }); });
  },
  // ---- 尸王：鬼手（一片格子从地里抓上来，抓住动不了）、起尸 ----
  grasp(en, e, toP, p2) {
    const P = en.game.player;
    act(e, 1.9, 1.3);
    const grid = (ox, oz, t) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) strike(en, e, ox + i * 3.2, oz + j * 3.2, 1.5, t, e.dmg * 0.7, { color: '#d0ff8a', slow: 2.5, shake: 0.06, n: 6 }); };
    grid(P.pos.x, P.pos.z, 1.0);
    if (p2) later(en, e, 0.6, () => grid(P.pos.x + 1.6, P.pos.z + 1.6, 0.8));
  },
  raise(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 4 : 3;
    act(e, 0.3, 2.2); en.game.toast(`${e.T.name} 念咒起尸——趁它施法打断它！`, 1.8);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, x = P.pos.x + Math.sin(a) * 5, z = P.pos.z + Math.cos(a) * 5;
      strike(en, e, x, z, 1.4, 1.4, e.dmg * 0.4, { color: '#d0ff8a', shake: 0.1, done: () => { en.spawn(e.T.minion, x, z, Math.max(0, e.lvl - 3)).state = 'chase'; } });
    }
  },
  // ---- 雪妖王：冰旋（转着喷冰弹） ----
  spiral(en, e, toP, p2) {
    let a = toP, cd = 0; const arms = p2 ? 3 : 2;
    act(e, 2.6, 1.2, (dt, mv) => {
      mv.spd = 0; a += dt * 2.2;
      if ((cd -= dt) <= 0) { cd = 0.11; for (let k = 0; k < arms; k++) en.shoot(e.pos.x, e.pos.z, a + k / arms * TAU, 7.5, e.dmg * 0.45, e.T.shot || ICE, 1.2); }
    });
  },
  // ---- 九尾妖狐：狐火（九团火挨个射）、分身（两个假的跟着一起冲，一碰就散） ----
  foxfire(en, e, toP, p2) {
    const g = en.game, P = g.player, n = 9;
    act(e, 0.5 + n * 0.16 + 0.4, 1.0);
    for (let i = 0; i < n; i++) later(en, e, 0.5 + i * (p2 ? 0.12 : 0.16), () => {
      const a = (i / n) * Math.PI - Math.PI / 2 + e.yaw, x = e.pos.x + Math.sin(a) * 2.2, z = e.pos.z + Math.cos(a) * 2.2, p = lead(P, 0.25);
      en.shoot(x, z, Math.atan2(p.x - x, p.z - z), 12, e.dmg * 0.45, '#ff6aff', 1.3, 2.2);
    });
  },
  clones(en, e, toP, p2) {
    const g = en.game, n = p2 ? 3 : 2;
    g.fx.burst(e.pos, '#ff6aff', 40, { speed: 6, up: 4 });
    for (let i = 0; i < n; i++) {
      const a = toP + (i % 2 ? 1 : -1) * (1.2 + Math.floor(i / 2) * 0.8), c = en.spawn('foxclone', e.pos.x + Math.sin(a) * 5, e.pos.z + Math.cos(a) * 5, e.lvl);
      c.root.scale.setScalar(e.T.scale); c.fake = true; c.dmg = e.dmg * 0.6; c.state = 'chase'; c.cd = 0.4; c.speed = 6; c.life = 9;
    }
    dashes(en, e, 1, { wind: 0.9, dur: 0.6, spd: 22, open: 1.0, color: '#ff6aff' });
  },
  // ---- 古剑傀：万剑归宗（八道剑光从四面八方扎向你） ----
  swordrain(en, e, toP, p2) {
    const P = en.game.player, n = p2 ? 12 : 8;
    act(e, 2.4, 1.4);
    for (let i = 0; i < n; i++) later(en, e, Math.floor(i / 2) * 0.28, () => {
      const a = (i / n) * TAU + rnd(-0.1, 0.1), x = P.pos.x + Math.sin(a) * 11, z = P.pos.z + Math.cos(a) * 11;
      beam(en, e, x, z, a + Math.PI, 22, 1.3, 0.85, e.dmg * 0.8, { color: '#9ef0ff', shake: 0.08 });
    });
  },
  // ---- 太古雷鹏：追雷（雷一下一下追着你劈）、雷暴（十字雷光扫过全场） ----
  thunder(en, e, toP, p2) {
    const g = en.game, P = g.player, n = p2 ? 9 : 6;
    act(e, n * 0.32 + 1, 1.2);
    for (let i = 0; i < n; i++) later(en, e, i * 0.32, () => { const p = lead(P, 0.45); strike(en, e, p.x, p.z, 2, 0.55, e.dmg * 0.8, { color: '#e8e0ff', shake: 0.2, n: 10, done: () => g.realm?.sfx?.((s) => s.thunderClap?.()) }); });
  },
  storm(en, e, toP, p2) {
    const P = en.game.player, sets = p2 ? 3 : 2;
    act(e, sets * 0.9 + 1.2, 1.5);
    for (let s = 0; s < sets; s++) later(en, e, s * 0.9, () => {
      for (let k = 0; k < 4; k++) { const a = toP + s * 0.4 + k / 4 * Math.PI; beam(en, e, P.pos.x - Math.sin(a) * 13, P.pos.z - Math.cos(a) * 13, a, 26, 1.6, 1.0, e.dmg, { color: '#d8c8ff', shake: 0.15 }); }
    });
  },
};
