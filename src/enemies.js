import * as THREE from 'three';
import { flat, toon, glow, mesh, at, angDiff, lerpAngle, setFlash, clamp } from './util.js';
import { ARENA } from './world.js';

const G = {};
function geos() {
  if (G.box) return G;
  G.box = flat(new THREE.BoxGeometry(1, 1, 1));
  G.ico = flat(new THREE.IcosahedronGeometry(1, 0));
  G.ico1 = flat(new THREE.IcosahedronGeometry(1, 1));
  G.cone = flat(new THREE.ConeGeometry(1, 1, 5));
  G.oct = flat(new THREE.OctahedronGeometry(1, 0));
  G.legBox = flat(new THREE.BoxGeometry(1, 1, 1)).translate(0, -0.5, 0);
  return G;
}

export const TYPES = {
  boar: { name: '野猪妖', hp: 42, r: 0.75, speed: 3.4, dmg: 12, xp: 14 },
  spider: { name: '毒蛛', hp: 28, r: 0.7, speed: 3.0, dmg: 8, xp: 12 },
  golem: { name: '石傀', hp: 85, r: 0.9, speed: 2.2, dmg: 18, xp: 26 },
  boss: { name: '赤岩妖王', hp: 900, r: 1.9, speed: 2.6, dmg: 24, xp: 320 },
};

function build(type) {
  const g = geos();
  const mats = [];
  const M = (c, o = {}) => { const m = toon(c, { ...o, unique: true }); mats.push(m); return m; };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const parts = { body, legs: [], arms: [] };
  const part = (geo, mat, sx, sy, sz, x, y, z, parent = body) => { const m = mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };

  if (type === 'boar') {
    const fur = M('#7a5a3e'), dark = M('#4a3424'), tusk = M('#f4ecd8'), snout = M('#c48a7a');
    part(g.box, fur, 1.1, 0.8, 1.5, 0, 0.75, 0);
    part(g.box, dark, 0.5, 0.3, 1.3, 0, 1.2, -0.05);
    parts.head = new THREE.Group(); parts.head.position.set(0, 0.8, 0.85); body.add(parts.head);
    part(g.box, fur, 0.75, 0.62, 0.6, 0, 0, 0.1, parts.head);
    part(g.box, snout, 0.38, 0.28, 0.2, 0, -0.08, 0.45, parts.head);
    for (const s of [-1, 1]) {
      const t = part(g.cone, tusk, 0.07, 0.3, 0.07, s * 0.22, -0.15, 0.48, parts.head); t.rotation.x = -0.6;
      part(g.box, glow('#ff3a2a', 3), 0.08, 0.08, 0.04, s * 0.2, 0.12, 0.41, parts.head);
    }
    for (const [x, z] of [[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]]) {
      const l = new THREE.Group(); l.position.set(x, 0.5, z); body.add(l);
      part(g.legBox, dark, 0.24, 0.5, 0.24, 0, 0, 0, l);
      parts.legs.push(l);
    }
  } else if (type === 'spider') {
    const shell = M('#3d2f4a'), stripe = M('#6adf6a', { emissive: '#3aff6a', ei: 0.5 });
    part(g.ico1, shell, 0.55, 0.45, 0.65, 0, 0.75, -0.45);
    part(g.box, stripe, 0.12, 0.05, 0.5, 0, 1.17, -0.45);
    part(g.ico, shell, 0.32, 0.28, 0.32, 0, 0.62, 0.25);
    for (const s of [-1, 1]) part(g.box, glow('#7aff5a', 3), 0.07, 0.07, 0.05, s * 0.1, 0.7, 0.55);
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1, k = i % 4;
      const l = new THREE.Group(); l.position.set(s * 0.25, 0.65, 0.3 - k * 0.22); l.rotation.y = s * (0.9 + k * 0.35) - Math.PI / 2 * (s - 1) * 0;
      body.add(l);
      const up = new THREE.Group(); up.rotation.z = s * -0.9; l.add(up);
      const seg = part(g.box, shell, 0.07, 0.07, 0.6, 0, 0, 0.3, up);
      const low = new THREE.Group(); low.position.set(0, 0, 0.6); low.rotation.x = 1.2; up.add(low);
      part(g.box, shell, 0.06, 0.06, 0.7, 0, 0, 0.35, low);
      l.rotation.y = Math.PI / 2 * s + (k - 1.5) * 0.45 * s;
      parts.legs.push(l);
      void seg;
    }
  } else {
    const boss = type === 'boss';
    const stone = M(boss ? '#5a3a3a' : '#6b6b78'), stone2 = M(boss ? '#3e2828' : '#55556a');
    const core = glow(boss ? '#ff4a1a' : '#ff9a3a', 3.2, true);
    part(g.box, stone, 1.2, 1.0, 0.8, 0, 1.25, 0);
    part(g.box, stone2, 0.9, 0.5, 0.7, 0, 0.6, 0);
    part(g.oct, core, 0.2, 0.26, 0.2, 0, 1.3, 0.42);
    parts.head = new THREE.Group(); parts.head.position.set(0, 1.95, 0.05); body.add(parts.head);
    part(g.box, stone, 0.55, 0.45, 0.5, 0, 0, 0, parts.head);
    for (const s of [-1, 1]) part(g.box, core, 0.1, 0.06, 0.04, s * 0.13, 0.03, 0.26, parts.head);
    if (boss) for (let i = -2; i <= 2; i++) { const c = part(g.cone, core, 0.08, 0.35, 0.08, i * 0.12, 0.35, 0, parts.head); c.rotation.z = -i * 0.25; }
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 0.8, 1.6, 0); body.add(a);
      part(g.legBox, stone2, 0.42, 1.1, 0.42, 0, 0, 0, a);
      part(g.box, stone, 0.55, 0.45, 0.55, 0, -1.15, 0, a);
      parts.arms.push(a);
      const l = new THREE.Group(); l.position.set(s * 0.3, 0.55, 0); body.add(l);
      part(g.legBox, stone2, 0.35, 0.55, 0.4, 0, 0, 0, l);
      parts.legs.push(l);
    }
    if (boss) { root.scale.setScalar(2.3); for (let i = 0; i < 4; i++) { const c = part(g.box, core, 0.05, 0.4, 0.05, (i - 1.5) * 0.25, 1.2, 0.41); c.rotation.z = (i - 1.5) * 0.4; } }
  }
  return { root, parts, mats };
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.proj = [];
    this.boss = null;
    this.bossCd = 0;
    this.projGeo = flat(new THREE.IcosahedronGeometry(0.22, 0));
  }

  spawn(type, x, z, lvl = 0) {
    const T = TYPES[type];
    const { root, parts, mats } = build(type);
    const hpMul = 1 + lvl * 0.35;
    const e = {
      type, T, root, parts, mats, pos: root.position, r: T.r, hp: T.hp * hpMul, maxHp: T.hp * hpMul,
      dmg: T.dmg * (1 + lvl * 0.2), lvl, speed: T.speed, yaw: Math.random() * 6.28, kx: 0, kz: 0,
      state: 'idle', st: 0, cd: 1 + Math.random(), flash: 0, home: new THREE.Vector2(x, z),
      tx: x, tz: z, walk: 0, touchCd: 0, alive: true, phase: 1, queue: [], hitOnce: false, chargeDir: 0,
    };
    root.position.set(x, 0, z);
    this.game.scene.add(root);
    this.list.push(e);
    this.game.fx.burst(root.position, type === 'boss' ? '#ff5a2a' : '#c8b8ff', type === 'boss' ? 60 : 10, { speed: 3, up: 3 });
    return e;
  }

  remove(e) {
    e.alive = false;
    this.game.onEnemyGone?.(e);
    this.game.scene.remove(e.root);
    for (const m of e.mats) m.dispose();
    this.list.splice(this.list.indexOf(e), 1);
    if (e === this.boss) { this.boss = null; }
  }

  damage(e, amt, fromX, fromZ, knock = 6, crit = false) {
    if (!e.alive) return;
    e.hp -= amt;
    e.flash = 0.12;
    this.game.onEnemyHit?.(e, amt, crit);
    const dx = e.pos.x - fromX, dz = e.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
    const resist = e.type === 'boss' ? 0.08 : e.type === 'golem' ? 0.5 : 1;
    if (e.state !== 'charge') { e.kx += dx / d * knock * resist; e.kz += dz / d * knock * resist; }
    const fx = this.game.fx;
    fx.num(e.pos, Math.round(amt) + (crit ? '!' : ''), crit ? 'crit' : '');
    fx.burst(e.pos, crit ? '#ffe28a' : '#ffffff', crit ? 12 : 6, { speed: 5, up: 2, life: 0.3, y: 1 });
    this.game.sfx?.impact({ crit, heavy: Math.min(1, Math.max(0, (knock - 4) / 10)) });
    if (e.type !== 'boss' && e.state === 'idle') e.state = 'chase';
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    const g = this.game, fx = g.fx;
    g.sfx?.kill();
    fx.burst(e.pos, e.type === 'boss' ? '#ff6a2a' : '#b9a8ff', e.type === 'boss' ? 120 : 24, { speed: e.type === 'boss' ? 9 : 5, up: 4, life: 0.8 });
    g.addXP(e.T.xp * (1 + e.lvl * 0.3), e.pos);
    const roll = Math.random();
    if (e.type === 'boar' && roll < 0.5) g.addItem('core', 1, e.pos);
    if (e.type === 'spider' && roll < 0.4) g.addItem('core', 1, e.pos);
    if (e.type === 'golem') g.addItem('stone', 1 + (roll < 0.4 ? 1 : 0), e.pos);
    if (e.type === 'boss') {
      g.addItem('heart', 1, e.pos); g.addItem('stone', 8, e.pos);
      g.toast('击败 赤岩妖王！获得 赤岩之心', 4);
      g.shake(1.2);
      this.bossCd = 120;
      fx.clearTele();
    }
    this.remove(e);
  }

  shoot(x, z, yaw, speed, dmg, color, size = 1) {
    const m = mesh(this.projGeo, glow(color, 3.5), { cast: false });
    m.position.set(x, 1.0, z); m.scale.setScalar(size);
    this.game.scene.add(m);
    this.proj.push({ m, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed, life: 3.2, dmg, r: 0.3 * size, color });
  }

  update(dt) {
    const g = this.game, P = g.player, fx = g.fx;
    const night = g.nightK;
    if (this.bossCd > 0) this.bossCd -= dt;

    // 妖王苏醒
    if (!this.boss && this.bossCd <= 0 && Math.hypot(P.pos.x - ARENA.x, P.pos.z - ARENA.y) < 10 && !P.dead) {
      this.boss = this.spawn('boss', ARENA.x, ARENA.y, 0);
      this.boss.state = 'roar'; this.boss.st = 1.6;
      g.toast('赤岩妖王 苏醒了！', 3); g.shake(0.8);
    }

    for (const e of [...this.list]) {
      if (!e.alive) continue;
      const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
      const toP = Math.atan2(dx, dz);
      let mx = 0, mz = 0, spd = 0, face = null;
      e.st -= dt; e.cd -= dt; e.touchCd -= dt;
      const aggro = (e.type === 'golem' ? 9 : 11) + night * 4;

      if (P.dead) { if (e.state !== 'idle' && e.type !== 'boss') e.state = 'idle'; }

      if (e.type === 'boss') this.bossAI(e, dt, dist, toP);
      else {
        if (e.state === 'idle') {
          if (dist < aggro && !P.dead) e.state = 'chase';
          if (e.st <= 0) { e.st = 2 + Math.random() * 3; const a = Math.random() * 6.28, r = Math.random() * 5; e.tx = e.home.x + Math.cos(a) * r; e.tz = e.home.y + Math.sin(a) * r; }
          const wx = e.tx - e.pos.x, wz = e.tz - e.pos.z, wd = Math.hypot(wx, wz);
          if (wd > 0.4) { mx = wx / wd; mz = wz / wd; spd = e.speed * 0.4; }
        } else if (e.state === 'chase') {
          if (dist > 26 || P.dead) { e.state = 'idle'; }
          face = toP;
          if (e.type === 'boar') {
            mx = dx / dist; mz = dz / dist; spd = e.speed;
            if (dist < 8 && e.cd <= 0) {
              e.state = 'windup'; e.st = 0.65; e.chargeDir = toP;
              fx.line(e.pos.x, e.pos.z, toP, 10, 1.6, 0.65);
            }
          } else if (e.type === 'spider') {
            const want = dist > 9 ? 1 : dist < 6 ? -1 : 0;
            mx = dx / dist * want + Math.cos(toP) * 0.5; mz = dz / dist * want - Math.sin(toP) * 0.5; spd = e.speed;
            if (e.cd <= 0 && dist < 13) { e.state = 'windup'; e.st = 0.35; e.flash = 0.06; }
          } else if (e.type === 'golem') {
            mx = dx / dist; mz = dz / dist; spd = e.speed;
            if (dist < 3.0 && e.cd <= 0) {
              e.state = 'windup'; e.st = 0.85;
              const cx = e.pos.x + Math.sin(toP) * 1.5, cz = e.pos.z + Math.cos(toP) * 1.5;
              fx.circle(cx, cz, 2.3, 0.85, () => {
                if (!e.alive) return;
                fx.shockRing(cx, cz, 2.6, '#ffb070'); fx.burst({ x: cx, z: cz }, '#c9b8a0', 14, { speed: 5, y: 0.2 });
                g.shake(0.35);
                if (Math.hypot(P.pos.x - cx, P.pos.z - cz) < 2.3 + P.r) P.hurt(e.dmg, cx, cz);
              });
            }
          }
          if (e.type !== 'golem' && Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.y) > 34) e.state = 'idle';
        } else if (e.state === 'windup') {
          face = e.type === 'boar' ? e.chargeDir : toP;
          if (e.type === 'boar') e.parts.body.rotation.z = Math.sin(g.time * 60) * 0.08;
          if (e.st <= 0) {
            e.parts.body.rotation.z = 0;
            if (e.type === 'boar') { e.state = 'charge'; e.st = 0.55; e.hitOnce = false; }
            else if (e.type === 'spider') { this.shoot(e.pos.x, e.pos.z, toP, 9, e.dmg, '#7aff5a'); e.state = 'chase'; e.cd = 1.8 + Math.random() * 0.6; }
            else { e.state = 'recover'; e.st = 0.5; e.cd = 2.2; }
          }
        } else if (e.state === 'charge') {
          face = e.chargeDir; mx = Math.sin(e.chargeDir); mz = Math.cos(e.chargeDir); spd = 15;
          if (Math.random() < 0.5) fx.mote(e.pos.x, 0.2, e.pos.z, '#c8a070', { life: 0.4, size: 1.2, bright: 0.8 });
          if (!e.hitOnce && dist < e.r + P.r + 0.2) { e.hitOnce = true; P.hurt(e.dmg * 1.3, e.pos.x, e.pos.z, 10); }
          if (e.st <= 0) { e.state = 'recover'; e.st = 0.8; e.cd = 2.6; }
        } else if (e.state === 'recover') {
          if (e.st <= 0) e.state = 'chase';
        }
        // 普通接触伤害
        if (e.state !== 'charge' && dist < e.r + P.r && e.touchCd <= 0 && e.type === 'boar') { P.hurt(e.dmg * 0.5, e.pos.x, e.pos.z); e.touchCd = 1; }
      }

      if (e.type === 'boss') { const r = this.bossMove; mx = r.mx; mz = r.mz; spd = r.spd; face = r.face; }

      // 移动 + 击退 + 碰撞
      e.pos.x += (mx * spd + e.kx) * dt;
      e.pos.z += (mz * spd + e.kz) * dt;
      const kd = Math.exp(-9 * dt); e.kx *= kd; e.kz *= kd;
      g.world.resolve(e.pos, e.r);
      if (e.type !== 'boss') for (const o of this.list) {
        if (o === e) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, rr = e.r + o.r, d2 = ox * ox + oz * oz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d * 0.5; e.pos.x += ox * k; e.pos.z += oz * k; }
      }
      if (face === null && spd > 0.1) face = Math.atan2(mx, mz);
      if (face !== null) e.yaw = lerpAngle(e.yaw, face, 1 - Math.exp(-10 * dt));
      e.root.rotation.y = e.yaw;

      // 动画
      e.walk += dt * (2 + spd * 3);
      const sw = Math.sin(e.walk) * Math.min(1, spd / 2);
      if (e.type === 'spider') e.parts.legs.forEach((l, i) => (l.children[0].rotation.x = Math.sin(e.walk * 1.5 + i * 1.3) * 0.35 * Math.min(1, spd)));
      else e.parts.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? sw : -sw) * 0.7));
      if (e.parts.arms.length) {
        const up = e.state === 'windup' || (e.type === 'boss' && (e.state === 'ring' || e.state === 'roar')) ? -2.6 : sw * 0.4;
        for (const a of e.parts.arms) a.rotation.x += (up - a.rotation.x) * Math.min(1, dt * 12);
      }
      e.parts.body.position.y = Math.abs(sw) * 0.06 + (e.state === 'windup' && e.type === 'boar' ? -0.1 : 0);
      if (e.flash > 0) { e.flash -= dt; setFlash(e.mats, e.flash > 0 ? 0.9 : 0); }

      if (dist > 80 && e.type !== 'boss') this.remove(e);
      if (e.type === 'boss' && dist > 45) { g.toast('赤岩妖王 退回了祭坛深处', 2.5); fx.clearTele(); this.remove(e); }
    }

    // 投射物
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i];
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.life -= dt;
      p.m.rotation.y += dt * 8;
      if (Math.random() < 0.5) fx.mote(p.m.position.x, 1.0, p.m.position.z, p.color, { life: 0.3, size: 0.8, vy: 0 });
      const d = Math.hypot(P.pos.x - p.m.position.x, P.pos.z - p.m.position.z);
      let dead = p.life <= 0;
      if (!dead && d < p.r + P.r && !P.dead) { if (P.hurt(p.dmg, p.m.position.x, p.m.position.z)) dead = true; }
      if (dead) { g.scene.remove(p.m); this.proj.splice(i, 1); }
    }
  }

  // ---------- 妖王：多阶段 ----------
  bossAI(e, dt, dist, toP) {
    const g = this.game, P = g.player, fx = g.fx;
    const mv = (this.bossMove = { mx: 0, mz: 0, spd: 0, face: toP });
    if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2; e.state = 'roar'; e.st = 1.4; e.queue = ['summon'];
      g.toast('妖王 狂暴了！', 2.5); g.shake(1);
      for (const m of e.mats) { m.userData.baseE.set('#ff2a00'); m.userData.baseEI = 0.12; }
      setFlash(e.mats, 0);
    }
    const p2 = e.phase === 2;
    switch (e.state) {
      case 'roar':
        if (e.st <= 0) { e.state = 'walk'; e.st = 1; }
        break;
      case 'idle': case 'chase': case 'walk': {
        const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
        if (dist > 3) { mv.mx = dx / dist; mv.mz = dz / dist; mv.spd = e.speed * (p2 ? 1.3 : 1); }
        if (dist < e.r + P.r + 0.3 && e.touchCd <= 0) { P.hurt(e.dmg * 0.6, e.pos.x, e.pos.z, 9); e.touchCd = 1; }
        if (e.st <= 0 && !P.dead) {
          if (!e.queue.length) e.queue = shuffle(p2 ? ['slam', 'ring', 'charge', 'ring'] : ['slam', 'ring', 'charge']);
          const a = e.queue.shift();
          this.bossStart(e, a, toP, p2);
        }
        break;
      }
      case 'slam': case 'ring': case 'summon':
        if (e.st <= 0) { e.state = 'walk'; e.st = p2 ? 0.7 : 1.2; }
        break;
      case 'windupCharge':
        mv.face = e.chargeDir;
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.85; e.hitOnce = false; g.shake(0.3); }
        break;
      case 'charge':
        mv.face = e.chargeDir; mv.mx = Math.sin(e.chargeDir); mv.mz = Math.cos(e.chargeDir); mv.spd = 17;
        fx.mote(e.pos.x + (Math.random() - 0.5) * 2, 0.3, e.pos.z + (Math.random() - 0.5) * 2, '#ff6a2a', { life: 0.5, size: 1.5 });
        if (!e.hitOnce && dist < e.r + P.r + 0.3) { e.hitOnce = true; P.hurt(e.dmg * 1.2, e.pos.x, e.pos.z, 14); }
        if (e.st <= 0) { e.state = 'walk'; e.st = p2 ? 0.8 : 1.3; }
        break;
    }
  }

  bossStart(e, a, toP, p2) {
    const g = this.game, P = g.player, fx = g.fx;
    if (a === 'slam') {
      e.state = 'slam'; const n = p2 ? 4 : 3, dur = p2 ? 0.7 : 0.9;
      e.st = n * 0.45 + dur + 0.3;
      for (let i = 0; i < n; i++) g.after(i * 0.45, () => {
        if (!e.alive) return;
        const x = P.pos.x + P.vel.x * 0.3, z = P.pos.z + P.vel.z * 0.3;
        fx.circle(x, z, 2.8, dur, () => {
          if (!e.alive) return;
          fx.shockRing(x, z, 3.2, '#ff7a3a'); fx.burst({ x, z }, '#ff7a3a', 20, { speed: 6, y: 0.2, up: 4 });
          g.shake(0.5);
          if (Math.hypot(P.pos.x - x, P.pos.z - z) < 2.8 + P.r) P.hurt(e.dmg, x, z, 8);
        });
      });
    } else if (a === 'ring') {
      e.state = 'ring'; e.st = p2 ? 1.6 : 1.2;
      const waves = p2 ? 2 : 1;
      for (let w = 0; w < waves; w++) g.after(0.55 + w * 0.5, () => {
        if (!e.alive) return;
        const n = 16;
        for (let i = 0; i < n; i++) this.shoot(e.pos.x, e.pos.z, (i + w * 0.5) / n * Math.PI * 2, 7, e.dmg * 0.55, '#ff8a3a', 1.6);
        fx.shockRing(e.pos.x, e.pos.z, 5, '#ff5a2a'); g.shake(0.3);
      });
    } else if (a === 'charge') {
      e.state = 'windupCharge'; e.st = p2 ? 0.7 : 0.9; e.chargeDir = toP;
      fx.line(e.pos.x, e.pos.z, toP, 16, 3.2, e.st);
    } else if (a === 'summon') {
      e.state = 'summon'; e.st = 1.2;
      for (const s of [-1, 1]) this.spawn('golem', e.pos.x + s * 4, e.pos.z + 2, 1).state = 'chase';
      g.shake(0.6);
    }
  }
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export { clamp, angDiff, at };
