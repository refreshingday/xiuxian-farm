// 主世界的玩家战斗：拳 / 剑 / 符三种武器、灵力、四个技能槽、五行（GDD 第 4 节）。
// 招式、连招树、技能都在试炼场 arena.html 打磨（comboKit.js / comboAir.js / comboKitFx.js），
// 这里把同一套规则接到主世界：目标是 enemies.js 的妖兽，位移交给 world.resolve 碰撞。
import * as THREE from 'three';
import { clamp, angDiff } from './util.js';
import { TUNE, ComboRunner } from './combo.js';
import { AIR_FX, AIR_SFX } from './comboAir.js';
import { KIT_FX, KIT_SFX, SKILL_FX } from './comboKitFx.js';
import { KITS } from './comboKit.js';
import { animCombo } from './comboAnim.js';
import { animChibi } from './chibi.js';

const MOVE_FX = { ...AIR_FX, ...KIT_FX }, MOVE_SFX = { ...AIR_SFX, ...KIT_SFX };
const rand = (a, b) => a + Math.random() * (b - a), TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
export const GRAV = 26;
export const DASH_CD = 2.5;          // GDD：闪避初始冷却 2–3 秒
const QI_REGEN = 22, QI_PAUSE = 0.4; // 灵力一直在恢复，出招后停一小会儿
const STUCK_MAX = 6, STUCK_LIFE = 6;
const _v2 = new THREE.Vector2();

// o = { scene, fx, cfx, sfx, P, aim, targets(), hit(t, dmg, fromX, fromZ, knock, color, h), hitWorld?(test), stop(sec), shake(v) }
// 目标（妖兽）需要 pos / r / vy / alive / stuck[] / rootT / yaw / root（贴身符挂在 root 上）
// P 需要 c（Q 版骨架）/ pos / yaw / vy / qi / maxQi / iframe / dashT / dashDir
export class Combat {
  constructor(o) {
    Object.assign(this, o);
    const P = this.P;
    this.kitI = 0; this.kit = KITS[0];
    this.runner = new ComboRunner(TUNE, this.kit.moves, this.kit.tree);
    this.runner.afford = (m) => P.qi >= (m.qi || 0); // 灵力不够就断回第一击
    this.runner.on.start = (m, path, type) => this.onStart(m, path, type);
    this.runner.on.hit = (m, h, i) => this.onHit(m, h, i);
    this.skillCd = [0, 0, 0, 0];
    this.waves = []; this.bolts = []; this.blasts = []; this.timers = []; this.guard = null;
    this.motion = []; this.sweepHit = new Set(); this.skill = null; this.ghostT = 0;
    this.leapFrom = new THREE.Vector2(); this.leapTo = new THREE.Vector2(); this.leapY0 = 0; this.leapY1 = 0; this.leapOn = false;
    this.qiPause = 0; this.paperT = 0; this.clock = 0;
    this.onMove = null; // (m | null) 招式名显示
    this.onKit = null;  // (kit) 换武器后刷新技能槽
    // 拳：双手一团拳劲光；符：右手夹着一张符（甩出去后一会儿再摸出一张）
    this.fistGlow = P.c.arms.map((A) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      A.hand.add(m); return m;
    });
    this.handPaper = this.cfx.talisman('敕令', '#ffd27a', 0.6);
    this.handPaper.g.position.set(0, -0.14, 0.03); P.c.arms[0].hand.add(this.handPaper.g);
    this.setKit(0);
  }

  // ---------- 武器 ----------
  setKit(i) {
    this.kitI = (i + KITS.length) % KITS.length; const kit = this.kit = KITS[this.kitI];
    this.cancel();
    this.runner.moves = kit.moves; this.runner.tree = kit.tree;
    if (this.P.c.sword) this.P.c.sword.visible = kit.id === 'sword';
    for (const m of this.fistGlow) m.visible = kit.id === 'fist';
    this.handPaper.g.visible = kit.id === 'talisman';
    this.onKit?.(kit);
  }
  cycle() { this.setKit(this.kitI + 1); }
  get busy() { return !!this.runner.move || !!this.skill; }
  cancel() { if (this.runner.path !== null) this.runner.cancel(); this.onMove?.(null); }
  click() { this.runner.click(); }

  // ---------- 工具 ----------
  live() { return this.targets().filter((t) => t.alive); }
  fwd() { return new THREE.Vector2(Math.sin(this.P.yaw), Math.cos(this.P.yaw)); }
  // 出招朝向：瞄准方向 ±35°、6 米内有妖兽就软吸附过去（GDD：不做硬锁定）
  aimYaw() {
    const P = this.P, yaw = Math.atan2(this.aim.x - P.pos.x, this.aim.z - P.pos.z);
    let best = null, bs = 1e9;
    for (const d of this.live()) {
      const dx = d.pos.x - P.pos.x, dz = d.pos.z - P.pos.z, l = Math.hypot(dx, dz) - d.r, a = Math.abs(angDiff(Math.atan2(dx, dz), yaw));
      if (l > 6 || a > 0.6) continue;
      if (l + a * 6 < bs) { bs = l + a * 6; best = Math.atan2(dx, dz); }
    }
    return best ?? yaw;
  }
  // 向前 dist 米的地面点（最远 8 米）
  groundAt(dist) { const f = this.fwd(), k = Math.min(dist, 8), p = this.P.pos; return { x: p.x + f.x * k, z: p.z + f.y * k }; }
  fxCtx(m, cx, cz) {
    const P = this.P;
    return { cfx: this.cfx, fx: this.fx, x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, fx0: Math.sin(P.yaw), fz0: Math.cos(P.yaw), color: m.color || '#9ef0ff', cx, cz, getPos: () => P.pos, getY: () => P.pos.y };
  }
  later(t, fn) { this.timers.push({ t, fn }); }
  hitFeel(h) { if (h.stop) this.stop(h.stop); this.shake(h.shake ?? 0.15); }
  // 前方（±40°）最近、高度够得着的目标
  frontTarget(range) {
    const P = this.P; let best = null, bd = range;
    for (const d of this.live()) {
      const dx = d.pos.x - P.pos.x, dz = d.pos.z - P.pos.z, l = Math.hypot(dx, dz);
      if (l < bd && Math.abs(d.pos.y - P.pos.y) < 1.6 && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) < 0.7) { bd = l; best = d; }
    }
    return best;
  }
  // 最近的浮空目标（追月跳过去）
  airTarget(range) {
    const P = this.P; let best = null, bd = range;
    for (const d of this.live()) { const l = Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z); if (d.pos.y > 0.3 && l < bd) { bd = l; best = d; } }
    return best;
  }
  // seek：只冲到目标身前，没目标就按原距离走
  motionDist(s) {
    if (!s.seek) return s.dist;
    const d = this.frontTarget(s.dist * 2.5 + 2.5), P = this.P;
    return d ? clamp(Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z) - (d.r + P.r + 0.6), 0, s.dist * 2.5) : s.dist;
  }
  // 跳跃在起跳那一刻才定落点（前面可能还有一段位移）
  startLeap(m) {
    const L = m.leap, P = this.P;
    this.leapOn = true;
    this.leapFrom.set(P.pos.x, P.pos.z); this.leapY0 = P.pos.y; this.leapY1 = typeof L.y1 === 'number' ? L.y1 : 0;
    const t = L.to === 'air' && this.airTarget(L.max);
    if (t) { // 跳到浮空目标面前，高度按到达时它的位置估
      const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1, go = Math.max(0, l - 1.4), T = L.t1 - L.t0;
      P.yaw = Math.atan2(dx, dz);
      this.leapTo.set(P.pos.x + dx / l * go, P.pos.z + dz / l * go);
      this.leapY1 = Math.max(0.6, t.pos.y + t.vy * T - 0.5 * GRAV * T * T - 0.3);
    } else {
      const f = this.fwd();
      let dist = L.dist ?? 0;
      if (L.to === 'aim') dist = Math.min(L.max, Math.hypot(this.aim.x - P.pos.x, this.aim.z - P.pos.z));
      if (L.to === 'air') { dist = 2.5; this.leapY1 = Math.max(P.pos.y, 2.2); }
      this.leapTo.set(P.pos.x + f.x * dist, P.pos.z + f.y * dist);
    }
    const h = m.hits[0];
    if (h?.shape === 'circle') this.fx.circle(this.leapTo.x, this.leapTo.y, h.r, L.t1 - L.t0);
  }

  // ---------- 普攻连招 ----------
  onStart(m, path, type) {
    const P = this.P, sfx = this.sfx;
    P.yaw = this.aimYaw();
    P.iframe = Math.max(P.iframe, m.iframe || 0);
    this.sweepHit.clear();
    if (path !== '') { P.qi -= m.qi || 0; this.qiPause = QI_PAUSE; }
    this.motion = (m.motion || []).map((s) => ({ ...s, d: this.motionDist(s) }));
    this.leapOn = false;
    if (m.leap && m.leap.t0 <= 0.05) this.startLeap(m);
    if (m.pose === 'dash') this.fx.burst(P.pos, '#9ef0ff', 14, { speed: 6, up: 1, life: 0.3 });
    MOVE_FX[m.id]?.start?.(this.fxCtx(m, this.leapTo.x, this.leapTo.y), m);
    if (sfx.ok) { sfx.tick(type); if (MOVE_SFX[m.id]) MOVE_SFX[m.id].start?.(sfx, m, m.hits[0]?.t ?? 0.15); else sfx.swing({ lead: 0.06, pitch: 1.15, size: 0.8 }); }
    this.ghostT = 0;
    this.onMove?.(m);
  }

  onHit(m, h, idx) {
    const P = this.P, f = this.fwd(), color = m.color || '#9ef0ff', vr = h.vr ?? 1.5, inReach = (d) => Math.abs(d.pos.y - P.pos.y) <= vr;
    let hitAny = false;
    if (h.shape === 'arc') {
      const inArc = (x, z, r) => Math.hypot(x - P.pos.x, z - P.pos.z) - r <= h.range && Math.abs(angDiff(Math.atan2(x - P.pos.x, z - P.pos.z), P.yaw)) <= h.arc;
      for (const d of this.live()) {
        if (!d.alive || !inReach(d) || !inArc(d.pos.x, d.pos.z, d.r)) continue;
        MOVE_FX[m.id]?.contact?.(this.fxCtx(m), d, h, idx);
        this.hit(d, h.dmg, P.pos.x, P.pos.z, h.knock, color, h); hitAny = true;
      }
      if (P.pos.y < 0.5 && this.hitWorld?.(inArc)) hitAny = true;
    } else if (h.shape === 'circle') {
      const cx = P.pos.x + f.x * h.at, cz = P.pos.z + f.y * h.at, inC = (x, z, r) => Math.hypot(x - cx, z - cz) - r <= h.r;
      if (P.pos.y < 0.5) this.fx.shockRing(cx, cz, h.r, color, 0.3);
      for (const d of this.live()) {
        if (!d.alive || !inReach(d) || !inC(d.pos.x, d.pos.z, d.r)) continue;
        MOVE_FX[m.id]?.contact?.(this.fxCtx(m, cx, cz), d, h, idx);
        this.hit(d, h.dmg, cx, cz, h.knock, color, h); hitAny = true;
      }
      if (P.pos.y < 0.5) this.hitWorld?.(inC);
    } else if (h.shape === 'wave') {
      this.waves.push({ x: P.pos.x + f.x * 0.8, z: P.pos.z + f.y * 0.8, yaw: P.yaw, left: h.len, h, color, hit: new Set(), m: this.spawnWaveMesh(color) });
    } else if (h.shape === 'bolt') {
      this.spawnBolt(P.pos.x + f.x * 0.8, P.pos.z + f.y * 0.8, P.yaw + (h.ang || 0), h, color);
      this.paperT = 0.2; // 手里那张符甩出去了，一会儿再摸出一张
    } else if (h.shape === 'trap') {
      const g0 = this.groundAt(h.at); this.placeBlast(g0.x, g0.z, h, color);
    } else if (h.shape === 'rain') {
      const g0 = this.groundAt(h.at);
      for (let k = 0; k < h.n; k++) {
        const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * h.spread;
        this.placeBlast(g0.x + Math.cos(a) * rr, g0.z + Math.sin(a) * rr, { ...h, keep: false, delay: h.delay * (0.4 + Math.random() * 0.6) }, color);
      }
    } else if (h.shape === 'detonate') this.detonate(h, color);
    MOVE_FX[m.id]?.hit?.(this.fxCtx(m, P.pos.x + f.x * (h.at || 0), P.pos.z + f.y * (h.at || 0)), h, idx);
    if (this.sfx.ok) MOVE_SFX[m.id]?.hit?.(this.sfx, h, idx, m);
    if (hitAny || h.shape !== 'arc') this.hitFeel(h);
  }

  // ---------- 技能（Q E R C） ----------
  useSkill(i) {
    const s = this.kit.skills[i], P = this.P;
    if (!s || this.skillCd[i] > 0 || P.qi < s.qi) return false;
    P.qi -= s.qi; this.qiPause = QI_PAUSE; this.skillCd[i] = s.cd;
    P.yaw = this.aimYaw();
    this.cancel();
    // 先摆技能动作，出手那一刻才生效
    this.skill = { m: { pose: s.pose, hits: [{ t: s.ht }], cancel: 0.32, dur: 0.4 }, t: 0 };
    this.later(s.ht, () => SKILLS[s.id](this));
    this.sfx.unlock();
    return true;
  }
  // 以一点为圆心的一圈伤害（技能用）
  ring(r, dmg, extra, color, x = this.P.pos.x, z = this.P.pos.z) {
    this.fx.shockRing(x, z, r, color, 0.3);
    for (const d of this.live()) {
      if (!d.alive || Math.hypot(d.pos.x - x, d.pos.z - z) - d.r > r) continue;
      this.hit(d, dmg, x, z, extra.knock ?? 6, color, extra);
    }
    this.hitFeel(extra);
  }
  // 被「坠龙」砸下来的妖兽落地：震飞周围的
  slamAround(e) {
    this.stop(0.08);
    for (const o of this.live()) if (o !== e && o.pos.y < 1 && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 2.8) this.hit(o, 8, e.pos.x, e.pos.z, 7, '#ffd27a', { launch: 8 });
  }

  // ---------- 剑气 ----------
  spawnWaveMesh(color) {
    const mk = (c, k) => new THREE.Mesh(this.fx.crescentGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const w = new THREE.Group(), a = mk(color, 3), b = mk('#ffffff', 2.5), c = mk(color, 2);
    a.scale.setScalar(1.6); b.scale.setScalar(1.25); c.scale.set(1.9, 1, 1.1); c.position.set(0, 0, -0.5);
    w.add(a, b, c); this.scene.add(w);
    w.setOpacity = (v) => { a.material.opacity = v; b.material.opacity = v; c.material.opacity = v * 0.5; };
    w.dispose = () => { for (const o of [a, b, c]) o.material.dispose(); };
    return w;
  }
  updateWaves(dt) {
    const fx = this.fx;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i], step = Math.min(w.left, 20 * dt);
      w.x += Math.sin(w.yaw) * step; w.z += Math.cos(w.yaw) * step; w.left -= step;
      w.m.position.set(w.x, 1, w.z); w.m.rotation.y = w.yaw;
      w.m.setOpacity(Math.min(1, w.left * 0.6));
      w.age = (w.age || 0) + dt;
      for (const sd of [-1, 1]) {
        const o = Math.sin(w.age * 30 + sd * 1.6) * 1.1 * sd;
        fx.mote(w.x + Math.cos(w.yaw) * o, 1 + Math.cos(w.age * 30) * 0.4, w.z - Math.sin(w.yaw) * o, w.color, { life: 0.35, size: 0.8 });
      }
      for (const d of this.live()) {
        if (!d.alive || w.hit.has(d) || d.pos.y > 2 || Math.hypot(d.pos.x - w.x, d.pos.z - w.z) > d.r + w.h.w * 0.6) continue;
        w.hit.add(d); this.hit(d, w.h.dmg, w.x - Math.sin(w.yaw), w.z - Math.cos(w.yaw), w.h.knock, w.color, w.h);
        this.cfx.arc(d.pos, w.yaw, w.color, { tilt: 0.7, scale: 0.6, y: 1.2, dur: 0.18 });
      }
      if (w.left <= 0) { fx.burst({ x: w.x, z: w.z }, w.color, 14, { speed: 5, up: 2, life: 0.35, y: 1 }); this.scene.remove(w.m); w.m.dispose(); this.waves.splice(i, 1); }
    }
  }

  // ---------- 符：飞符、贴身符、陷阱、引爆、护符 ----------
  handPos() { return this.P.c.arms[0].hand.getWorldPosition(new THREE.Vector3()); }
  // 飞符：一张旋转的符纸，h.home 弧度 / 秒拐弯追前方最近的妖兽；h.chain = 打中后电弧跳到附近另一只
  spawnBolt(x, z, yaw, h, color) {
    const t = this.cfx.talisman(h.glyph || '敕', color, 1.4);
    t.g.position.set(x, 1.1, z); this.scene.add(t.g);
    this.bolts.push({ x, z, yaw, left: h.range, h, color, hit: new Set(), zapped: new Set(), t, spin: rand(0, TAU) });
  }
  seekYaw(b, dt) {
    let best = null, bd = 9;
    for (const d of this.live()) {
      if (b.hit.has(d) || d.pos.y > 2) continue;
      const dx = d.pos.x - b.x, dz = d.pos.z - b.z, l = Math.hypot(dx, dz);
      if (l < bd && Math.abs(angDiff(Math.atan2(dx, dz), b.yaw)) < 0.9) { bd = l; best = d; }
    }
    if (best) b.yaw += clamp(angDiff(Math.atan2(best.pos.x - b.x, best.pos.z - b.z), b.yaw), -b.h.home * dt, b.h.home * dt);
  }
  updateBolts(dt) {
    const fx = this.fx;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i], step = Math.min(b.left, b.h.spd * dt);
      if (b.h.home) this.seekYaw(b, dt);
      b.x += Math.sin(b.yaw) * step; b.z += Math.cos(b.yaw) * step; b.left -= step;
      b.spin += dt * 14;
      b.t.g.position.set(b.x, 1.1, b.z); b.t.g.rotation.y = b.yaw;
      b.t.paper.rotation.set(-Math.PI / 2 + 0.3, 0, b.spin);
      if (Math.random() < 0.7) fx.mote(b.x, 1.1, b.z, b.color, { life: 0.3, size: 0.7 });
      if (b.h.chain && Math.random() < 0.5) fx.mote(b.x + rand(-0.3, 0.3), 1.1 + rand(-0.2, 0.2), b.z + rand(-0.3, 0.3), '#ffffff', { life: 0.08, size: 0.5, bright: 3 });
      let done = b.left <= 0, stuck = false;
      for (const d of this.live()) {
        if (!d.alive || b.hit.has(d) || d.pos.y > 2 || Math.hypot(d.pos.x - b.x, d.pos.z - b.z) > d.r + 0.3) continue;
        b.hit.add(d); this.hit(d, b.h.dmg, b.x - Math.sin(b.yaw), b.z - Math.cos(b.yaw), b.h.knock, b.color, b.h);
        fx.burst({ x: b.x, z: b.z }, b.color, 6, { speed: 3, up: 1.5, life: 0.25, y: 1.1 });
        if (b.h.chain) this.chainZap(d, b);
        if (!b.h.pierce) { if (d.alive) { this.stick(d, b); stuck = true; } done = true; break; }
      }
      if (!done) continue;
      this.bolts.splice(i, 1);
      if (stuck) { this.scene.remove(b.t.g); b.t.gm.dispose(); } else { this.cfx.burn(b.t, b.color, 0.3); fx.burst({ x: b.x, z: b.z }, b.color, 6, { speed: 3, up: 2, life: 0.3, y: 1.1 }); }
    }
  }
  // 雷符：电弧跳到附近另一只，打六成伤害
  chainZap(d0, b) {
    let best = null, bd = b.h.chain;
    for (const d of this.live()) {
      if (d === d0 || b.hit.has(d) || b.zapped.has(d)) continue;
      const l = Math.hypot(d.pos.x - d0.pos.x, d.pos.z - d0.pos.z);
      if (l < bd) { bd = l; best = d; }
    }
    if (!best) return;
    b.zapped.add(best);
    this.cfx.zap(new THREE.Vector3(d0.pos.x, d0.pos.y + 1.2, d0.pos.z), new THREE.Vector3(best.pos.x, best.pos.y + 1.2, best.pos.z), b.color, 0.35, 0.09);
    this.cfx.bolt(best.pos.x, best.pos.z, b.color, 3.5);
    this.hit(best, b.h.dmg * 0.6, d0.pos.x, d0.pos.z, 3, b.color, {});
    if (this.sfx.ok) this.sfx.zap();
  }
  // 贴身符：打中就贴在妖兽身上（朝飞来的那一面），最多 6 张，6 秒后自己烧掉；引爆时一起炸
  stick(d, b) {
    if (d.stuck.length >= STUCK_MAX) this.dropStuck(d.stuck.shift());
    const t = this.cfx.talisman(b.h.glyph || '敕', b.color, 0.9), nx = -Math.sin(b.yaw), nz = -Math.cos(b.yaw);
    const w = new THREE.Vector3(d.pos.x + nx * d.r * 0.9, d.pos.y + d.r * rand(0.9, 1.5), d.pos.z + nz * d.r * 0.9);
    d.root.updateMatrixWorld(); d.root.worldToLocal(w);
    t.g.position.copy(w); t.g.rotation.y = Math.atan2(nx, nz) - d.root.rotation.y; t.g.scale.setScalar(1 / d.root.scale.x);
    t.paper.rotation.set(0, 0, rand(-0.5, 0.5));
    d.root.add(t.g);
    d.stuck.push({ t, life: STUCK_LIFE });
  }
  // 从妖兽身上取下来放回场景（保持世界位置），交给 burn 烧掉
  unstick(s) {
    const g = s.t.g, v = g.getWorldPosition(new THREE.Vector3()), q = g.getWorldQuaternion(new THREE.Quaternion());
    g.parent?.remove(g); g.position.copy(v); g.quaternion.copy(q); g.scale.setScalar(1); g.visible = true;
    return s.t;
  }
  dropStuck(s) { this.cfx.burn(this.unstick(s), '#ff8a3a', 0.3); }
  clearStuck(d, burn = false) {
    for (const s of d.stuck) if (burn) this.dropStuck(s); else { s.t.g.parent?.remove(s.t.g); s.t.gm.dispose(); }
    d.stuck.length = 0;
  }
  // 妖兽死了 / 走远消失：身上的符烧掉，护符冷却表里删掉
  forget(d) { if (d.stuck?.length) this.clearStuck(d, true); this.guard?.cd.delete(d); }
  updateStuck(dt) {
    for (const d of this.targets()) for (let i = d.stuck.length - 1; i >= 0; i--) {
      const s = d.stuck[i]; s.life -= dt;
      s.t.gm.opacity = 0.45 + 0.2 * Math.sin(s.life * 8);
      s.t.g.visible = s.life > 1 || Math.floor(s.life * 12) % 2 === 0; // 最后一秒闪
      if (s.life <= 0) { d.stuck.splice(i, 1); this.dropStuck(s); }
    }
  }

  // 陷阱符：mode = lob 从手里抛过去 | fall 从天上飘落 | seal 巨符压下来。落地处先亮法阵（预警），delay 秒后生效
  // keep 的会一直埋着，有妖兽踩进去或引爆才炸，6 秒后失效
  placeBlast(x, z, h, color) {
    const cfx = this.cfx, mode = h.mode || 'lob', seal = mode === 'seal', delay = h.delay ?? 0.2;
    const b = { x, z, h, color, mode, keep: !!h.keep, delay, t: 0, armed: false, landed: false, fuse: Infinity, mul: 1,
      fly: mode === 'lob' ? Math.min(delay, 0.45) : delay,
      from: mode === 'lob' ? this.handPos() : { x: x + (seal ? 0 : rand(-1.5, 1.5)), y: seal ? 10 : 9, z: z + (seal ? 0 : rand(-1.5, 1.5)) },
      sigil: cfx.sigil(color), paper: cfx.talisman(h.glyph || '敕', color, seal ? 6 : 1), rot: rand(0, TAU), dim: h.n ? 0.45 : 1 }; // 符雨一次落好几张，法阵叠在一起会太亮
    b.sigil.position.set(x, 0.05, z); b.sigil.scale.setScalar(h.r * 0.3); this.scene.add(b.sigil);
    b.paper.g.position.copy(b.from); this.scene.add(b.paper.g);
    this.blasts.push(b);
    return b;
  }
  updateBlasts(dt) {
    const fx = this.fx;
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i], h = b.h, p = b.paper.g.position, pp = b.paper.paper;
      b.t += dt;
      const k = clamp(b.t / b.fly, 0, 1), ka = clamp(b.t / b.delay, 0, 1);
      if (b.mode === 'seal') { // 巨符竖着压下来，后仰一点对着镜头
        const e = k * k;
        p.set(b.x, lerp(b.from.y, 1.56, e), b.z); pp.rotation.set(-0.3, 0, Math.sin(b.t * 9) * 0.05 * (1 - k));
        if (k < 1 && Math.random() < 0.6) fx.mote(b.x + rand(-0.9, 0.9), p.y + rand(-1.5, 1.5), b.z, b.color, { life: 0.3, size: 1, vy: 3 });
      } else if (k < 1) {
        if (b.mode === 'lob') { // 抛物线，边飞边转
          p.set(lerp(b.from.x, b.x, k), lerp(b.from.y, 0.06, k) + 1.6 * 4 * k * (1 - k), lerp(b.from.z, b.z, k));
          pp.rotation.set(-Math.PI / 2 + 0.3, 0, b.t * 14);
        } else { // 飘落：先快后慢，左右摆
          const e = 1 - (1 - k) ** 2;
          p.set(lerp(b.from.x, b.x, e) + Math.sin(b.t * 10) * 0.15 * (1 - k), lerp(b.from.y, 0.06, e), lerp(b.from.z, b.z, e));
          pp.rotation.set(-1.2 + Math.sin(b.t * 12) * 0.4, b.t * 6, 0);
        }
        if (Math.random() < 0.5) fx.mote(p.x, p.y, p.z, b.color, { life: 0.25, size: 0.6 });
      } else if (!b.landed) { // 落地：平贴地面
        b.landed = true;
        p.set(b.x, 0.06, b.z); pp.rotation.set(-Math.PI / 2, 0, b.rot);
        fx.burst({ x: b.x, z: b.z }, b.color, 6, { speed: 2, up: 1, life: 0.3, y: 0.1 });
      }
      // 法阵：飞行中长出来，生效后一闪一闪地慢转
      b.sigil.rotation.y += dt * (b.armed ? 0.6 : 2);
      if (!b.armed) { b.sigil.scale.setScalar(h.r * (0.3 + 0.7 * (1 - (1 - ka) ** 2))); b.sigil.material.opacity = (0.25 + 0.4 * ka) * b.dim; }
      else b.sigil.material.opacity = (0.45 + 0.2 * Math.sin(b.t * 6)) * b.dim;
      b.paper.gm.opacity = b.armed ? 0.5 + 0.3 * Math.sin(b.t * 6) : 0.55;
      b.fuse -= dt;
      if (b.fuse <= 0 && b.t >= b.fly) { this.explode(b, b.mul); continue; } // 被引爆：落地就炸
      if (!b.armed && b.t >= b.delay) b.armed = true;
      if (!b.armed) continue;
      if (!b.keep) { this.explode(b); continue; }
      if (b.t > b.delay + 6) { this.fizzle(b); continue; }
      if (this.live().some((d) => d.pos.y < 1.5 && Math.hypot(d.pos.x - b.x, d.pos.z - b.z) - d.r < h.r)) this.explode(b);
      else if (Math.random() < 0.2) { const a = rand(0, TAU); fx.mote(b.x + Math.cos(a) * h.r, 0.2, b.z + Math.sin(a) * h.r, b.color, { life: 0.5, size: 0.6, vy: 0.8 }); }
    }
  }
  // 陷阱失效：符纸烧掉，法阵淡出
  fizzle(b) {
    this.blasts.splice(this.blasts.indexOf(b), 1);
    this.cfx.burn(b.paper, '#aaaaaa', 0.4);
    this.cfx.sigilFlare(b.sigil, 0.4, 1);
  }
  explode(b, mul = 1) {
    const i = this.blasts.indexOf(b); if (i < 0) return;
    this.blasts.splice(i, 1);
    const fx = this.fx, cfx = this.cfx, h = b.h, x = b.x, z = b.z, seal = b.mode === 'seal';
    b.sigil.material.opacity = 0.9 * b.dim; cfx.sigilFlare(b.sigil, seal ? 0.6 : 0.45, seal ? 1.3 : 1.6);
    cfx.burn(b.paper, '#ff8a3a', seal ? 0.5 : 0.3);
    fx.shockRing(x, z, h.r, b.color, 0.3);
    fx.burst({ x, z }, b.color, 18, { speed: 6, up: 4, life: 0.45, y: 0.3 });
    fx.burst({ x, z }, '#fbe592', 8, { speed: 3, up: 5, life: 0.9, y: 0.5, grav: -3, drag: 1, bright: 1 }); // 碎纸片飘
    cfx.flash(x, z, b.color, seal ? 32 : 20, 0.25);
    if (h.root) cfx.disc(x, z, h.r, b.color, 0.3, 0.3);
    else cfx.pillar(x, z, h.r * (seal ? 0.6 : 0.4), seal ? 6 : 3, b.color, seal ? 0.45 : 0.3);
    if (seal) {
      cfx.dent(x, z, h.r * 0.9, b.color, { n: 10 });
      cfx.scorch(x, z, h.r * 0.8);
      fx.shockRing(x, z, h.r * 1.4, '#ffffff', 0.4);
      fx.burst({ x, z }, '#b89a6a', 24, { speed: 6, up: 6, life: 0.7, y: 0.2, bright: 1 });
    }
    for (const d of this.live()) {
      if (!d.alive || Math.hypot(d.pos.x - x, d.pos.z - z) - d.r > h.r) continue;
      this.hit(d, h.dmg * mul, x, z, h.knock, b.color, h);
      if (h.root && d.alive) {
        d.rootT = h.root * (d.boss ? 0.3 : 1); d.kx = d.kz = 0;
        cfx.chains(() => d.pos, b.color, d.rootT);
        fx.num(d.pos, '定', '');
      }
    }
    this.hitFeel(h);
    if (this.sfx.ok) this.sfx.talisBoom(seal ? 1 : 0);
  }
  // 引爆：剑指连出灵光线，所有陷阱依次炸（还在飞的落地就炸），贴身符一起炸
  detonate(h, color) {
    const hp = this.handPos(), traps = this.blasts.filter((b) => b.keep).sort((a, b) => Math.hypot(a.x - hp.x, a.z - hp.z) - Math.hypot(b.x - hp.x, b.z - hp.z));
    traps.forEach((b, i) => { b.fuse = 0.05 + 0.06 * i; b.mul = h.mul; this.cfx.beam(hp.x, hp.z, b.x, b.z, color, { y: 0.9, delay: i * 0.03 }); });
    const marked = this.live().filter((d) => d.stuck.length);
    for (const d of marked) { this.cfx.beam(hp.x, hp.z, d.pos.x, d.pos.z, color, { y: 1.2 }); this.later(0.08, () => this.blowStuck(d, h, color)); }
    if (!traps.length && !marked.length) { this.fx.burst(hp, '#aaaaaa', 6, { speed: 2, up: 1, life: 0.3 }); this.fx.num(this.P.pos, '无符', ''); }
  }
  blowStuck(d, h, color) {
    const n = d.stuck.length, fx = this.fx;
    if (!n || !d.alive) return this.clearStuck(d, true);
    this.clearStuck(d, true);
    this.hit(d, h.dmg * n, this.P.pos.x, this.P.pos.z, h.knock, color, { launch: 2 + n * 0.8 });
    fx.num(d.pos, '爆×' + n, 'crit');
    fx.burst(d.pos, '#ff8a5a', 10 + n * 4, { speed: 6, up: 4, life: 0.4, y: 1.2 });
    fx.burst(d.pos, '#fbe592', 4 + n * 2, { speed: 3, up: 5, life: 0.9, y: 1.2, grav: -3, drag: 1, bright: 1 });
    fx.shockRing(d.pos.x, d.pos.z, 1 + n * 0.2, color, 0.25);
    this.cfx.flash(d.pos.x, d.pos.z, '#ff8a5a', 16, 0.2);
    this.stop(0.03 + n * 0.01);
    this.shake(0.15 + n * 0.05);
    if (this.sfx.ok) this.sfx.talisBoom(Math.min(1, n / 6));
  }
  // 护符：四张符绕身转 4 秒，碰到妖兽就打（每只 0.35 秒一次）
  startGuard() {
    if (this.guard) for (const o of this.guard.list) this.cfx.burn(o.t);
    this.guard = { t: 0, dur: 4, cd: new Map(), list: [0, 1, 2, 3].map((i) => { const t = this.cfx.talisman('护', '#ffe7a8', 1.3); this.scene.add(t.g); return { t, a: i / 4 * TAU }; }) };
  }
  updateGuard(dt) {
    const gd = this.guard, P = this.P; if (!gd) return;
    gd.t += dt;
    const R = 1.4 * Math.min(1, gd.t / 0.2), left = gd.dur - gd.t;
    for (const o of gd.list) {
      const a = o.a + gd.t * 4, x = P.pos.x + Math.cos(a) * R, z = P.pos.z + Math.sin(a) * R;
      o.t.g.position.set(x, P.pos.y + 1 + Math.sin(gd.t * 3 + o.a) * 0.15, z); o.t.g.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      o.t.g.visible = left > 0.6 || Math.floor(left * 12) % 2 === 0;
      if (Math.random() < 0.3) this.fx.mote(x, P.pos.y + 1, z, '#ffe7a8', { life: 0.3, size: 0.6 });
      for (const d of this.live()) {
        if (!d.alive || Math.hypot(d.pos.x - x, d.pos.z - z) > d.r + 0.35 || Math.abs(d.pos.y - P.pos.y) > 1.5 || (gd.cd.get(d) ?? 0) > gd.t) continue;
        gd.cd.set(d, gd.t + 0.35);
        this.hit(d, 5, P.pos.x, P.pos.z, 5, '#ffe7a8', {});
        this.fx.burst({ x, z }, '#ffe7a8', 6, { speed: 3, up: 1, life: 0.25, y: P.pos.y + 1 });
      }
    }
    if (left <= 0) { for (const o of gd.list) this.cfx.burn(o.t, '#ffd27a'); this.guard = null; }
  }

  // ---------- 每帧 ----------
  // 灵力、冷却、连招计时（在玩家移动之前）
  update(dt) {
    const P = this.P;
    this.clock += dt; this.paperT -= dt;
    this.handPaper.g.visible = this.kit.id === 'talisman' && !(this.paperT > 0);
    for (const m of this.fistGlow) { m.visible = this.kit.id === 'fist'; m.material.opacity = 0.3 + 0.12 * Math.sin(this.clock * 7); }
    this.qiPause -= dt; if (this.qiPause <= 0) P.qi = Math.min(P.maxQi, P.qi + QI_REGEN * P.maxQi / 100 * dt);
    for (let i = 0; i < 4; i++) this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
    this.runner.update(dt);
  }
  // 飞符、陷阱、剑气、护符、定时（在妖兽更新之后）
  updateEffects(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) if ((this.timers[i].t -= dt) <= 0) this.timers.splice(i, 1)[0].fn();
    this.updateWaves(dt); this.updateBolts(dt); this.updateBlasts(dt); this.updateStuck(dt); this.updateGuard(dt);
  }
  // 招式带来的位移和高度。mv = 摇杆 / WASD（单位向量以内），walk = 走路速度。返回 { vx, vz, y, ghost }
  step(dt, mv, walk) {
    const P = this.P, m = this.runner.move, t = this.runner.t, fx = this.fx;
    let vx = mv.x * walk, vz = mv.y * walk, y = P.pos.y, yHeld = false;
    if (m) {
      const spd = m.moveSpd || 0;
      vx = mv.x * spd; vz = mv.y * spd;
      for (const s of this.motion) if (t > s.t0 && t - dt < s.t1) {
        const k = (Math.min(t, s.t1) - Math.max(t - dt, s.t0)) / (s.t1 - s.t0) * s.d / dt, a = P.yaw + (s.ang || 0);
        vx += Math.sin(a) * k; vz += Math.cos(a) * k;
      }
      if (m.lunge) {
        const [t0, t1, dist] = m.lunge;
        if (t > t0 && t - dt < t1) {
          const k = (Math.min(t, t1) - Math.max(t - dt, t0)) / (t1 - t0) * dist / dt;
          vx += Math.sin(P.yaw) * k; vz += Math.cos(P.yaw) * k;
        }
      }
      if (m.leap && !this.leapOn && t >= m.leap.t0) this.startLeap(m);
      if (m.leap && this.leapOn) {
        const L = m.leap, k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1), e = k * k * (3 - 2 * k);
        _v2.lerpVectors(this.leapFrom, this.leapTo, e);
        P.pos.x = _v2.x; P.pos.z = _v2.y; vx = vz = 0;
        if (t - dt < L.t1) { y = this.leapY0 + (this.leapY1 - this.leapY0) * e + L.h * 4 * k * (1 - k); yHeld = true; }
        if (k > 0 && k < 1 && Math.random() < 0.6) fx.mote(P.pos.x, y + 1, P.pos.z, m.color, { life: 0.3, size: 0.9 });
      }
      if (m.hang) yHeld = true; // 空中招式：悬停
      if (m.sweep && t > m.lunge[0] && t - dt < m.lunge[1]) {
        fx.mote(P.pos.x, 0.8 + Math.random() * 0.6, P.pos.z, '#9ef0ff', { life: 0.35, size: 1.3 });
        for (const d of this.live()) {
          if (!d.alive || this.sweepHit.has(d) || d.pos.y > 1.8 || Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z) > d.r + m.sweep.w) continue;
          this.sweepHit.add(d); this.hit(d, m.sweep.dmg, P.pos.x - Math.sin(P.yaw), P.pos.z - Math.cos(P.yaw), m.sweep.knock, '#9ef0ff', m.sweep);
          this.cfx.xslash(d.pos, '#9ef0ff', 0.03);
          this.hitFeel(m.sweep);
        }
      }
    }
    // 不在招式控制高度时受重力下落
    if (yHeld) P.vy = 0;
    else if (y > 0 || P.vy > 0) {
      P.vy -= 30 * dt; y += P.vy * dt;
      if (y <= 0) { if (P.vy < -9) fx.burst(P.pos, '#d8d0c0', 6, { speed: 3, up: 1, life: 0.3, y: 0.1, bright: 1 }); y = 0; P.vy = 0; }
    }
    // 冲刺 / 突刺 / 跃击时留残影
    const ghosting = (m && ((m.lunge && m.sweep && t < m.lunge[1]) || (m.leap && t < m.leap.t1) || this.motion.some((s) => s.d > 1.5 && t < s.t1))) || P.dashT > 0;
    if (ghosting) { this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.035; this.cfx.ghost(P.c.root, m?.leap ? m.color : '#9ef0ff', 0.28); } }
    return { vx, vz, y, ghost: !!(m && (m.sweep || m.leap)) };
  }
  // 动作：技能姿势 > 连招姿势 > 普通走路 / 干活
  animate(dt, moving, extra = {}) {
    const P = this.P;
    let m = this.runner.move, t = this.runner.t;
    if (this.skill) { this.skill.t += dt; if (m || this.skill.t > this.skill.m.cancel + 0.06) this.skill = null; }
    if (!m && this.skill) { m = this.skill.m; t = this.skill.t; }
    if (!animCombo(P.c, dt, m, t)) animChibi(P.c, dt, { move: P.dashT > 0 ? 0 : moving, attack: -1, combo: 0, cast: 0, dash: P.dashT > 0, spin: 0, work: 0, ...extra });
    if (P.pos.y > 0.3 && !(m && m.pose === 'leap')) { P.c.legs[0].rotation.x = -0.8; P.c.legs[1].rotation.x = -0.3; } // 空中收腿
  }
}

// 技能效果（出手那一刻调用）。c = Combat
const SKILLS = {
  sw_spin: (c) => { c.ring(3.2, 16, { knock: 8, launch: 2, stop: 0.05, shake: 0.3 }, '#9ef0ff'); c.cfx.whirl(() => c.P.pos, '#9ef0ff', 0.45); if (c.sfx.ok) c.sfx.spin(0); },
  sw_wave: (c) => {
    const f = c.fwd(), P = c.P, h = { len: 9, w: 1.6, dmg: 22, knock: 12, launch: 3, stop: 0.06, shake: 0.4 };
    c.waves.push({ x: P.pos.x + f.x * 0.8, z: P.pos.z + f.y * 0.8, yaw: P.yaw, left: h.len, h, color: '#9ef0ff', hit: new Set(), m: c.spawnWaveMesh('#9ef0ff') });
    if (c.sfx.ok) c.sfx.galeRelease();
  },
  sw_lift: (c) => c.ring(3.6, 10, { knock: 2, launch: 10, stop: 0.05 }, '#bfe8ff'),
  ft_shock: (c) => {
    c.ring(3, 14, { knock: 8, stop: 0.05, shake: 0.45 }, '#ffe28a');
    SKILL_FX.ft_shock(c.fxCtx({ color: '#ffe28a' }));
    if (c.sfx.ok) c.sfx.groundBoom(1);
  },
  ft_bell: (c) => { // 金钟罩：1.2 秒无敌，罩下来时把贴身的妖兽震开
    const P = c.P;
    P.iframe = Math.max(P.iframe, 1.2);
    c.cfx.bell(() => P.pos, '#ffd27a', 1.6);
    c.cfx.flash(P.pos.x, P.pos.z, '#ffd27a', 20, 0.4, 1.2);
    SKILL_FX.ft_bell(c.fxCtx({ color: '#ffd27a' }));
    c.later(0.1, () => c.ring(2.2, 6, { knock: 9, stop: 0.03, shake: 0.25 }, '#ffd27a'));
    if (c.sfx.ok) c.sfx.bell();
  },
  ft_charge: (c) => { // 撞山：冲出去，冲到一半撞
    const P = c.P;
    P.dashT = 0.22; P.dashDir = P.yaw; P.iframe = Math.max(P.iframe, 0.3);
    if (c.sfx.ok) { c.sfx.stomp(); c.sfx.fistWhoosh({ lead: 0.1, size: 1.4, pitch: 0.75 }); }
    c.later(0.12, () => {
      const f = c.fwd(), x = P.pos.x + f.x * 1.2, z = P.pos.z + f.y * 1.2;
      c.ring(2.4, 18, { knock: 10, launch: 2, stop: 0.06, shake: 0.4 }, '#ffb84a', x, z);
      SKILL_FX.ft_charge(c.fxCtx({ color: '#ffb84a' }, x, z));
      if (c.sfx.ok) { c.sfx.airPop(1); c.sfx.groundBoom(0); }
    });
  },
  tl_nova: (c) => { // 符爆：脚下开阵，八张符往四面八方飞（打中就贴上，可以接引爆）
    const P = c.P, s = c.cfx.sigil('#ffd27a'); s.position.set(P.pos.x, 0.05, P.pos.z); s.scale.setScalar(1.6); s.material.opacity = 0.8;
    c.cfx.sigilFlare(s, 0.5, 2.2);
    for (let i = 0; i < 8; i++) {
      const a = P.yaw + i / 8 * TAU;
      c.spawnBolt(P.pos.x + Math.sin(a) * 0.6, P.pos.z + Math.cos(a) * 0.6, a, { spd: 18, range: 5.5, dmg: 12, knock: 7, home: 0, glyph: '爆' }, '#ffd27a');
    }
    c.fx.shockRing(P.pos.x, P.pos.z, 2, '#ffd27a', 0.3);
    if (c.sfx.ok) { c.sfx.paper(0.02); c.sfx.talisBoom(0); }
  },
  tl_guard: (c) => {
    const P = c.P;
    P.iframe = Math.max(P.iframe, 0.5);
    c.startGuard();
    c.cfx.flash(P.pos.x, P.pos.z, '#fff3c0', 20, 0.4, 1.2); c.fx.shockRing(P.pos.x, P.pos.z, 1.8, '#fff3c0', 0.35);
    if (c.sfx.ok) c.sfx.chant(0.02);
  },
  tl_put: (c) => {
    const g0 = c.groundAt(3);
    c.placeBlast(g0.x, g0.z, { r: 2.2, dmg: 20, knock: 10, launch: 3, keep: true, delay: 0.5, glyph: '火' }, '#ffb84a');
    if (c.sfx.ok) c.sfx.paper(0.02);
  },
  qi: (c) => { c.P.qi = Math.min(c.P.maxQi, c.P.qi + 40 * c.P.maxQi / 100); c.fx.burst(c.P.pos, '#9fdcff', 16, { speed: 2, up: 4, life: 0.7, grav: -1 }); },
};
