// 弓（GDD 第 4 节武器表之外的第八件武器：远程，和符不同——符靠陷阱 / 贴符 / 引爆，弓靠一支支射得准、射得远、能穿）。
// 左手持弓（chibi.js gong），右手拉弦；关键帧 dr = 弦拉开多少（0..1），l = 左手姿势（见 comboAnim.js bowDraw）。
// 打法：边退边射（射箭时能慢慢走，方向不变）、蓄力穿透、箭雨覆盖、后跃射拉开距离。伤害中等偏高、单体，近身最弱；拼刀重量 0.85（main.js KIT_W）。
// 箭是新的判定形状 shape: 'arrow'（arena.js / combat.js 用这里的 Arrows 飞）：
//   spd 米/秒，range 射程，ang 偏角，pierce 穿透，w 判定半径（缺省 0.35），home 每秒能拐多少弧度追最近的敌人，
//   boom = 落点 / 打中处炸一圈 { r, dmg, knock, launch }，dy = 往下射（后跃射从空中往前下方射）
import * as THREE from 'three';
const PI = Math.PI;
const C = '#9be36a', PALE = '#e6ffd0';
// 姿势：右手 [肩x, 肩y, 肘, 腰扭]，左手 l = [肩x, 肩y, 肘]。侧身开弓：腰往右拧 0.9，两只手的肩 y 补回来对准前方
const TW = -0.9;
const DRAW = [-1.45, 1.1, -2.2, TW], BOWL = [-1.55, 0.85, 0];     // 拉满
const NOCK = [-1.4, 0.7, -0.6, TW * 0.7], BOWN = [-1.4, 0.7, -0.1]; // 刚搭上箭（弦还没拉）
const REL = [-1.3, 1.45, -1.2, TW], RELL = [-1.6, 0.85, 0];        // 撒放：右手往后甩开
const HIGH = [-2.5, 0.8, -2.0, TW * 0.6], HIGHL = [-2.5, 0.6, 0];  // 朝天开弓（箭雨）
const READY = [-0.5, 0.2, -0.6, 0], READYL = [-0.6, 0.1, -0.3];
const k = (t, p, l, o = {}) => ({ t, p, l, ...o });
const base = { color: C, moveSpd: 2.5 };
const arrow = (t, o = {}) => ({ t, shape: 'arrow', spd: 38, range: 15, dmg: 9, knock: 3, stop: 0.02, shake: 0.06, ...o });
// 一发：搭箭 → 拉开 → 撒放 → 收
const shot = (tn, td, tr, end, o = {}) => [k(0, READY, READYL), k(tn, NOCK, BOWN, { st: 0.4 }), k(td, DRAW, BOWL, { dr: 1, st: 0.6, lean: -0.04, tr: o.tr || 0 }),
  k(tr, REL, RELL, { in: 1, st: 0.6, lean: 0.06 }), k(end, READY, READYL, { st: 0.2 })];

export const BOW_MOVES = {
  // 射：搭箭就放，一支快箭
  gw1: { ...base, name: '射', dur: 0.42, cancel: 0.28, keys: shot(0.05, 0.12, 0.15, 0.42), hits: [arrow(0.14)] },
  // 连珠：一口气两支
  gw2: { ...base, name: '连珠', qi: 4, dur: 0.48, cancel: 0.32,
    keys: [k(0, READY, READYL), k(0.06, DRAW, BOWL, { dr: 0.8, st: 0.5 }), k(0.09, REL, RELL, { in: 1, st: 0.5 }),
      k(0.16, DRAW, BOWL, { dr: 0.8, st: 0.5 }), k(0.2, REL, RELL, { in: 1, st: 0.5, lean: 0.05 }), k(0.48, READY, READYL, { st: 0.2 })],
    hits: [arrow(0.08, { dmg: 6, ang: -0.03 }), arrow(0.19, { dmg: 6, ang: 0.03 })] },
  // 三星：一弦搭三支，散开射出
  gw3: { ...base, name: '三星', qi: 8, dur: 0.52, cancel: 0.34, keys: shot(0.06, 0.16, 0.2, 0.52),
    hits: [-0.16, 0, 0.16].map((ang) => arrow(0.19, { ang, dmg: 8, knock: 4 })) },
  // 穿云：拉满憋住，一箭穿过一整排
  gw_pierce: { ...base, name: '穿云', qi: 16, end: true, dur: 0.86, cancel: 0.64, moveSpd: 0, keys: shot(0.08, 0.4, 0.46, 0.86, { tr: 0.03 }),
    hits: [arrow(0.45, { spd: 60, range: 22, w: 0.6, pierce: true, dmg: 26, knock: 12, stop: 0.07, shake: 0.35 })] },
  // 箭雨：朝天射一支，一会儿前面那片落下一阵箭
  gw_rain: { ...base, name: '箭雨', qi: 16, end: true, dur: 1.0, cancel: 0.5,
    keys: [k(0, READY, READYL), k(0.1, HIGH, HIGHL, { dr: 0.3, st: 0.5, lean: -0.2 }), k(0.24, HIGH, HIGHL, { dr: 1, st: 0.6, lean: -0.26 }),
      k(0.28, [-2.4, 1.3, -1.0, TW * 0.6], HIGHL, { in: 1, st: 0.6, lean: -0.22 }), k(0.6, READY, READYL, { st: 0.2 })],
    hits: [{ t: 0.27, shape: 'arrow', up: true, spd: 30, range: 0, dmg: 0 },
      ...[0.58, 0.68, 0.78, 0.88].map((t, i) => ({ t, shape: 'circle', at: 6, r: 2.7, dmg: 6, knock: 1, stop: 0.01, shake: i === 3 ? 0.2 : 0.06, rain: true }))] },
  // 惊鸿：往后一个空翻拉开距离，翻在半空往前下方连射三支（翻的那一下不吃伤害）
  gw_flip: { ...base, name: '惊鸿', qi: 16, end: true, dur: 0.86, cancel: 0.64, iframe: 0.4, moveSpd: 0,
    motion: [{ t0: 0.04, t1: 0.42, dist: 4.2, ang: PI }],
    keys: [k(0, READY, READYL), k(0.08, NOCK, BOWN, { hip: -0.1, st: 0.5 }), k(0.24, DRAW, BOWL, { dr: 1, hip: 0.9, lean: 0.35, sq: 0.06 }),
      k(0.27, REL, RELL, { in: 1, hip: 1.0, lean: 0.4 }), k(0.33, DRAW, BOWL, { dr: 1, hip: 0.95, lean: 0.4 }), k(0.36, REL, RELL, { in: 1, hip: 0.85, lean: 0.42 }),
      k(0.46, [-0.8, 0.6, -0.8, TW * 0.4], BOWN, { hip: -0.2, st: 0.8, sq: -0.12 }), k(0.86, READY, READYL, { st: 0.2 })],
    hits: [arrow(0.26, { dy: -0.05, ang: -0.1, dmg: 10, knock: 5 }), arrow(0.3, { dy: -0.05, dmg: 10, knock: 5 }), arrow(0.35, { dy: -0.05, ang: 0.1, dmg: 10, knock: 5 })] },
  // 重箭：多拉一会儿，一箭射退
  gw_heavy: { ...base, name: '重箭', qi: 10, dur: 0.64, cancel: 0.46, moveSpd: 1.5, keys: shot(0.06, 0.28, 0.32, 0.64),
    hits: [arrow(0.31, { spd: 46, w: 0.5, dmg: 20, knock: 14, stop: 0.06, shake: 0.25 })] },
  // 散花：拉开往前一扫，七支箭扇形泼出去——近身被贴脸时用
  gw_scatter: { ...base, name: '散花', qi: 16, end: true, dur: 0.74, cancel: 0.54, moveSpd: 0,
    keys: [k(0, READY, READYL), k(0.14, [-1.45, 1.6, -2.2, TW * 1.3], [-1.55, 1.3, 0], { dr: 1, st: 0.6 }),
      k(0.3, [-1.45, 0.6, -2.2, TW * 0.6], [-1.55, 0.4, 0], { lin: 1, dr: 1, st: 0.6 }), k(0.34, REL, RELL, { in: 1, st: 0.6, lean: 0.08 }), k(0.74, READY, READYL, { st: 0.2 })],
    hits: [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].map((ang, i) => arrow(0.16 + i * 0.022, { ang, range: 9, dmg: 8, knock: 6 })) },
  // 破军：蓄满一张弓，一支裹着青光的大箭——穿过一切，射到底炸开
  gw_break: { ...base, name: '破军', qi: 28, end: true, dur: 1.16, cancel: 0.9, charge: 0.56, moveSpd: 0,
    keys: [k(0, READY, READYL), k(0.12, NOCK, BOWN, { st: 0.6 }), k(0.56, [-1.45, 1.15, -2.3, TW * 1.1], BOWL, { dr: 1.15, st: 0.8, lean: -0.08, tr: 0.05 }),
      k(0.62, REL, RELL, { in: 1, st: 0.9, lean: 0.12, sq: -0.06 }), k(0.88, REL, RELL, { st: 0.8, lean: 0.1 }), k(1.16, READY, READYL, { st: 0.3 })],
    hits: [arrow(0.6, { spd: 70, range: 18, w: 1.1, pierce: true, big: true, dmg: 34, knock: 16, stop: 0.12, shake: 0.6, boom: { r: 3.2, dmg: 20, knock: 12, launch: 6 } })] },
};
for (const id in BOW_MOVES) BOW_MOVES[id].id = id;

export const BOW_TREE = {
  '': 'gw1', F: 'gw2', S: 'gw_heavy',
  FF: 'gw3', FS: 'gw_flip',
  FFF: 'gw_pierce', FFS: 'gw_rain',
  SF: 'gw_scatter', SS: 'gw_break',
};
export const BOW_ROUTES = [
  { name: '穿云', seq: 'FFF', tag: '4连 · 拉满 · 一箭穿一排' },
  { name: '箭雨', seq: 'FFS', tag: '4连 · 朝天射 · 前方落箭' },
  { name: '惊鸿', seq: 'FS', tag: '3连 · 后空翻 · 空中三连射' },
  { name: '三星', seq: 'FF', tag: '3连 · 一弦三箭' },
  { name: '散花', seq: 'SF', tag: '3连 · 七箭扇形 · 贴脸用' },
  { name: '破军', seq: 'SS', tag: '3连 · 蓄力 · 穿透 + 炸' },
];

export const BOW_SKILLS = [
  { id: 'gw_volley', name: '万箭', qi: 30, cd: 8, pose: 'raise', ht: 0.15 },
  { id: 'gw_seek', name: '追魂', qi: 25, cd: 6, pose: 'thrust', ht: 0.12 },
  { id: 'gw_thunder', name: '惊雷', qi: 35, cd: 9, pose: 'thrust', ht: 0.14 },
];

// ---------- 箭：一根杆 + 箭头 + 一道拖尾光 ----------
const geo = {};
function arrowGeo() {
  if (geo.shaft) return geo;
  geo.shaft = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5).rotateX(PI / 2);       // 沿 +z（飞的方向）
  geo.head = new THREE.ConeGeometry(0.05, 0.16, 4).rotateX(PI / 2).translate(0, 0, 0.58);
  geo.fl = new THREE.BoxGeometry(0.12, 0.005, 0.16).translate(0, 0, -0.42);
  geo.trail = new THREE.PlaneGeometry(0.14, 1).rotateX(-PI / 2).translate(0, 0, -0.5); // 拖尾：平放，长度靠 scale.z
  return geo;
}
const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
const glow = (c, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });

// 场上飞着的箭。arena.js 和 combat.js 各有一个：
//   update(dt, targets, hit(d, a), boom(x, z, a)) —— targets 是活着的目标（要有 pos / r），打中调用 hit
export class Arrows {
  constructor(scene, fx) { this.scene = scene; this.fx = fx; this.list = []; this.mats = null; }
  spawn(x, y, z, yaw, h, color) {
    const G = arrowGeo(), g = new THREE.Group(), s = h.big ? 2.2 : 1;
    if (!this.mats) this.mats = { shaft: basic('#c8a070'), fl: basic('#f2ead8'), head: glow('#ffffff', 1.4) };
    const tm = glow(color, 2.2);
    g.add(new THREE.Mesh(G.shaft, this.mats.shaft), new THREE.Mesh(G.head, this.mats.head), new THREE.Mesh(G.fl, this.mats.fl));
    const tr = new THREE.Mesh(G.trail, tm); tr.scale.set(s, 1, 1); g.add(tr);
    g.scale.setScalar(s); g.rotation.order = 'YXZ';
    const up = !!h.up, vy = up ? 1 : h.dy || 0, l = Math.hypot(1, vy);
    const a = { x, y, z, yaw, vy: up ? 1 : vy / l, vh: up ? 0.15 : 1 / l, h, color, g, tm, tr, left: up ? 9 : h.range, hit: new Set(), t: 0 };
    g.position.set(x, y + this.fx.gy(x, z), z); g.rotation.set(-Math.atan2(a.vy, a.vh), yaw, 0);
    this.scene.add(g); this.list.push(a);
    return a;
  }
  // 箭雨落下来的箭（只是画面，伤害由招式自己的判定算）
  fall(x, z, color, delay = 0) {
    const a = this.spawn(x - 0.95, 4, z - 0.32, Math.atan2(0.95, 0.32), { dy: -4, spd: 42, range: 9 }, color);
    a.fx = true; a.t = -delay; a.g.visible = delay <= 0;
  }
  update(dt, targets, hit, boom) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.t += dt; if (a.t < 0) continue; a.g.visible = true;
      if (a.stuck !== undefined) { // 扎在地上：慢慢淡掉
        a.stuck -= dt; a.tm.opacity = 0; if (a.stuck <= 0) this.drop(i);
        continue;
      }
      if (a.h.home && !a.fx) this.seek(a, dt, targets);
      const step = Math.min(a.left, a.h.spd * dt);
      a.x += Math.sin(a.yaw) * a.vh * step; a.z += Math.cos(a.yaw) * a.vh * step; a.y += a.vy * step; a.left -= step;
      a.g.position.set(a.x, a.y + this.fx.gy(a.x, a.z), a.z); a.g.rotation.set(-Math.atan2(a.vy, a.vh), a.yaw, 0);
      a.tr.scale.z = Math.min(a.t * 30, a.h.big ? 3 : 1.8); a.tm.opacity = 0.7;
      if (Math.random() < (a.h.big ? 1 : 0.35)) this.fx.mote(a.x, a.y, a.z, a.color, { life: 0.25, size: a.h.big ? 1.2 : 0.5, vy: 0 });
      if (a.h.up) { if (a.left <= 0 || a.y > 8) this.drop(i); continue; } // 朝天那一支：飞出画面就算了
      if (a.y <= 0.05) { a.y = 0.05; this.land(a, boom); continue; }
      if (a.fx) continue;
      let done = a.left <= 0;
      for (const d of targets) {
        if (a.hit.has(d) || Math.abs(d.pos.y + 1.0 - a.y) > 1.6 || Math.hypot(d.pos.x - a.x, d.pos.z - a.z) > d.r + (a.h.w ?? 0.35)) continue;
        a.hit.add(d); hit(d, a);
        this.fx.burst({ x: a.x, z: a.z }, a.color, a.h.big ? 14 : 6, { speed: 4, up: 2, life: 0.3, y: a.y });
        if (!a.h.pierce) { done = true; break; }
      }
      if (done) { if (a.h.boom) boom(a.x, a.z, a); this.drop(i); }
    }
  }
  seek(a, dt, targets) {
    let best = null, bd = 14;
    for (const d of targets) {
      if (a.hit.has(d)) continue;
      const l = Math.hypot(d.pos.x - a.x, d.pos.z - a.z);
      if (l < bd) { bd = l; best = d; }
    }
    if (!best) return;
    let da = Math.atan2(best.pos.x - a.x, best.pos.z - a.z) - a.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    a.yaw += Math.max(-a.h.home * dt, Math.min(a.h.home * dt, da));
  }
  land(a, boom) { // 射到地上：扎在那儿一会儿
    if (a.h.boom && !a.fx) { boom(a.x, a.z, a); this.drop(this.list.indexOf(a)); return; }
    a.stuck = a.fx ? 0.5 : 1.2; a.g.position.y = 0.05 + this.fx.gy(a.x, a.z); // y 都是离地高度（main 里地面有高低）
    this.fx.burst({ x: a.x, z: a.z }, '#c8b89a', a.fx ? 2 : 4, { speed: 2, up: 1.5, life: 0.3, y: 0.1, bright: 1 });
  }
  drop(i) { const a = this.list[i]; if (!a) return; this.list.splice(i, 1); this.scene.remove(a.g); a.tm.dispose(); }
  clear() { while (this.list.length) this.drop(this.list.length - 1); }
}

// ---------- 特效 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const twang = (c) => { c.cfx.airRing({ x: c.x + c.fx0 * 0.6, y: c.y, z: c.z + c.fz0 * 0.6 }, c.yaw, PALE, { r0: 0.15, r1: 0.6, travel: 0.6, dur: 0.16, op: 0.5 }); };
const thud = (c, d, big) => { c.cfx.star(d.pos, c.color, { size: big ? 1.1 : 0.6 }); c.fx.burst(d.pos, PALE, big ? 10 : 4, { speed: 4, up: 2, life: 0.25, y: 1.1 }); };
// 箭雨落点：一阵箭从天上斜着落进圆里
export function rainFx(c, arrows, x, z, r, n = 6) {
  for (let i = 0; i < n; i++) { const a = rand(0, PI * 2), rr = Math.sqrt(Math.random()) * r; arrows.fall(x + Math.cos(a) * rr, z + Math.sin(a) * rr, c.color, rand(0, 0.08)); }
}
export const BOW_FX = {
  gw1: { hit: twang },
  gw2: { hit: twang },
  gw3: { hit: (c, h) => { if (!h.ang) twang(c); } },
  gw_pierce: { start(c, m) { c.fx.burst(c, c.color, 8, { speed: 1.5, up: 3, life: 0.4, y: 1 }); }, hit(c) { twang(c); c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw, PALE, { n: 8, len: 2.6, dur: 0.3 }); } },
  gw_rain: { hit(c, h, i) { if (!i) { twang(c); c.cfx.streaks({ x: c.x, y: 0, z: c.z }, c.yaw, PALE, { up: true, n: 5, len: 2, dur: 0.3 }); } } },
  gw_flip: { start(c) { c.fx.burst({ x: c.x, z: c.z }, '#c8b89a', 10, { speed: 4, up: 2, life: 0.4, y: 0.1, bright: 1 }); }, hit: twang },
  gw_heavy: { hit(c) { twang(c); c.cfx.airRing({ x: c.x, y: c.y, z: c.z }, c.yaw, c.color, { r0: 0.3, r1: 1.1, travel: 1.6, dur: 0.24, op: 0.5 }); } },
  gw_scatter: { hit: (c, h, i) => { if (i === 3) { twang(c); for (const a of [-0.5, 0, 0.5]) c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw + a, PALE, { n: 2, len: 1.6, dur: 0.22 }); } } },
  gw_break: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.charge); c.fx.burst(c, c.color, 18, { speed: 2, up: 5, life: m.charge, y: 0.2 }); },
    hit(c) { twang(c); c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 10, 0.25); c.cfx.airRing({ x: c.x, y: c.y, z: c.z }, c.yaw, c.color, { r0: 0.5, r1: 2.2, travel: 2.4, dur: 0.3, op: 0.7 }); c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw, PALE, { n: 12, len: 3, dur: 0.35 }); },
  },
};
// 每支箭打中时（arena / combat 的 hit 回调里调用）
export const arrowContact = (c, d, a) => thud(c, d, a.h.big || a.h.dmg >= 20);
// 爆炸箭落点
export function boomFx(c, x, z, r) {
  c.cfx.flash(x, z, c.color, 12, 0.3); c.cfx.dent(x, z, r * 0.7, c.color, { n: 7 });
  c.fx.shockRing(x, z, r + 0.6, c.color, 0.35); c.cfx.pillar(x, z, r * 0.35, 4, c.color, 0.35);
  c.fx.burst({ x, z }, '#c8b89a', 18, { speed: 7, up: 4, life: 0.5, y: 0.2, bright: 1 }); c.fx.burst({ x, z }, PALE, 12, { speed: 6, up: 5, life: 0.4, y: 0.5 });
}
export const BOW_SKILL_FX = {
  gw_volley_mark(c, x, z) { c.cfx.disc(x, z, 3.2, c.color, 0.4, 0.25); },
  gw_seek(c) { twang(c); for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) c.cfx.streaks({ x: c.x, y: c.y, z: c.z }, c.yaw + a, PALE, { n: 2, len: 1.4, dur: 0.22 }); },
  gw_thunder(c) { twang(c); c.cfx.airRing({ x: c.x, y: c.y, z: c.z }, c.yaw, c.color, { r0: 0.4, r1: 1.6, travel: 2, dur: 0.3, op: 0.7 }); },
};

// 音效：弓弦“嘣”是低通噪声 + 很短的低音（≤220Hz），箭飞是一下“嗖”（带通噪声，1.8kHz 以下）。不用 ring / 高音 sine。
export function twangS(s, big = 0) {
  s.noise({ dur: 0.06, type: 'lowpass', f0: 1600, f1: 400, q: 0.3, gain: 0.3 + big * 0.15 });
  s.tone({ f0: 180 - big * 50, f1: 110 - big * 30, dur: 0.12 + big * 0.1, gain: 0.18 + big * 0.12, attack: 0.004, send: 0.1 });
  s.noise({ t: 0.02, dur: 0.16 + big * 0.12, type: 'bandpass', f0: 1700, f1: 600, q: 0.7, gain: 0.16 + big * 0.1, send: 0.05 });
}
const thunk = (s, g = 0.2) => s.noise({ dur: 0.08, type: 'lowpass', f0: 1000, f1: 250, q: 0.3, gain: g });
const creak = (s, dur) => s.noise({ dur, type: 'lowpass', f0: 300, f1: 700, q: 0.3, gain: 0.12, attack: dur * 0.8, send: 0.05 });
export const BOW_SFX = {
  gw1: { hit: (s) => twangS(s) },
  gw2: { hit: (s) => twangS(s) },
  gw3: { hit: (s, h) => { if (!h.ang) twangS(s, 0.3); } },
  gw_pierce: { start: (s) => creak(s, 0.4), hit: (s) => { twangS(s, 0.8); s.airPop(0.4); } },
  gw_rain: { start: (s) => creak(s, 0.22), hit: (s, h, i) => (i ? thunk(s, 0.14 + (i === 4) * 0.08) : twangS(s, 0.5)) },
  gw_flip: { start: (s) => s.leap?.(), hit: (s) => twangS(s, 0.2) },
  gw_heavy: { start: (s) => creak(s, 0.26), hit: (s) => twangS(s, 0.6) },
  gw_scatter: { start: (s) => creak(s, 0.14), hit: (s, h, i) => { if (i === 3) twangS(s, 0.7); } },
  gw_break: { start: (s) => creak(s, 0.56), hit: (s) => { twangS(s, 1); s.airPop(0.8); s.groundBoom(0.2); } },
};
export const BOW_SKILL_SFX = { twangS, thunk };
