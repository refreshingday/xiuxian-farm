import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, angDiff, lerpAngle, toon, mesh, at, setFlash, outlineMat, addOutline } from './util.js';
import { createChibi, animChibi } from './chibi.js';
import { FX } from './fx.js';
import { TUNE, ComboRunner } from './combo.js';
import { AIR_FX as MOVE_FX, AIR_SFX as MOVE_SFX } from './comboAir.js';
import { KITS, SKILL_KEYS, ELEM, KE } from './comboKit.js';
import { ComboFX } from './comboFx.js';
import { SFX } from './comboSfx.js';
import { TouchControls } from './touch.js';
import { animCombo } from './comboAnim.js';
import { HealthBar, screenOf } from './hpbar.js';

// 试炼场：只有平台 + 木桩 + 玩家，专门打磨战斗手感，不加载大世界
// 实验中：招式带位移、击退加强、挑空 / 空中追击 / 砸地（招式表见 comboAir.js）

// ---------- 渲染 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4d8);
scene.fog = new THREE.Fog(0x9fc4d8, 32, 60);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 140);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.9));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x9a8a50, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(10, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun);

// ---------- 场地 ----------
const ARENA_R = 17;
{
  const grass = mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), toon('#7fae5a'), { cast: false, recv: true });
  grass.position.y = -0.3; scene.add(grass);
  const plat = mesh(new THREE.CylinderGeometry(ARENA_R + 0.6, ARENA_R + 1.2, 0.6, 48), toon('#8f9488'), { recv: true });
  plat.position.y = -0.3; scene.add(plat);
  for (let i = 1; i <= 3; i++) {
    const ring = mesh(new THREE.RingGeometry(i * 5 - 0.08, i * 5 + 0.08, 64).rotateX(-Math.PI / 2), toon('#6f7468'), { cast: false, recv: true });
    ring.position.y = 0.01; scene.add(ring);
  }
  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 3, 8), capGeo = new THREE.BoxGeometry(1.3, 0.3, 1.3);
  const stone = toon('#a8a898'), red = toon('#b84a3a');
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, p = new THREE.Group();
    p.add(at(mesh(pillarGeo, stone), 0, 1.5, 0), at(mesh(capGeo, red), 0, 3.1, 0));
    p.position.set(Math.cos(a) * (ARENA_R + 0.2), 0, Math.sin(a) * (ARENA_R + 0.2));
    addOutline(p, outlineMat('#2b1d14', 0.03));
    scene.add(p);
  }
}

const g = { shakeV: 0, shake(v) { if (opt.shake) this.shakeV = Math.max(this.shakeV, v); } };
const fx = new FX(scene, camera);
const cfx = new ComboFX(scene, fx, { soft: true });
const sfx = new SFX();

// ---------- 调参（存在本机浏览器，刷新不丢） ----------
const opt = { fastWin: TUNE.fastWin, slowWin: TUNE.slowWin, timeScale: 1, dummyHp: 300, knock: 1.6, elem: '金', hitbox: false, stop: true, shake: true, vol: 0.7, sound: true, soft: true };
try { Object.assign(opt, JSON.parse(localStorage.getItem('arenaTune') || '{}')); } catch {}
const saveOpt = () => { try { localStorage.setItem('arenaTune', JSON.stringify(opt)); } catch {} };
opt.hitbox = false; // 判定框每次打开都默认关
TUNE.fastWin = opt.fastWin; TUNE.slowWin = opt.slowWin;
sfx.setVolume(opt.vol); sfx.enabled = opt.sound; cfx.soft = opt.soft;

for (const id of ['fastWin', 'slowWin', 'timeScale', 'dummyHp', 'knock', 'vol']) {
  const el = document.getElementById(id), v = el.nextElementSibling, fmt = (x) => id === 'dummyHp' ? String(x) : x.toFixed(2);
  el.value = opt[id]; v.textContent = fmt(+opt[id]);
  el.addEventListener('input', () => {
    opt[id] = +el.value; v.textContent = fmt(opt[id]);
    if (id === 'dummyHp') { for (const d of dummies) setDummyMax(d, opt[id]); if (focusD) targetBar.snap(focusD.hp, focusD.max); }
    if (id === 'fastWin' || id === 'slowWin') TUNE[id] = opt[id];
    if (id === 'vol') sfx.setVolume(opt.vol);
    if (id === 'fastWin' && opt.slowWin < opt.fastWin + 0.1) { opt.slowWin = opt.fastWin + 0.1; TUNE.slowWin = opt.slowWin; }
    saveOpt(); layoutBar();
  });
}
for (const [id, key] of [['bHitbox', 'hitbox'], ['bStop', 'stop'], ['bShake', 'shake'], ['bSound', 'sound'], ['bSoft', 'soft']]) {
  const b = document.getElementById(id);
  b.classList.toggle('on', opt[key]);
  b.addEventListener('click', () => { opt[key] = !opt[key]; b.classList.toggle('on', opt[key]); sfx.enabled = opt.sound; cfx.soft = opt.soft; saveOpt(); });
}

const elemSel = document.getElementById('elem');
elemSel.value = opt.elem;
elemSel.addEventListener('change', () => { opt.elem = elemSel.value; P.elem = opt.elem; saveOpt(); });

// ---------- 木桩 ----------
const dummies = [];
let movingTargets = false;
const DG = {
  base: new THREE.CylinderGeometry(0.42, 0.5, 0.18, 10),
  post: new THREE.CylinderGeometry(0.08, 0.08, 1.7, 6),
  body: new THREE.CylinderGeometry(0.3, 0.34, 0.85, 10),
  band: new THREE.CylinderGeometry(0.35, 0.35, 0.07, 10),
  arm: new THREE.BoxGeometry(1.2, 0.1, 0.1),
  head: new THREE.SphereGeometry(0.26, 12, 10),
};
function makeDummy(x, z) {
  const mats = [], elem = ELEM[dummies.length % 5];
  const M = (c) => { const m = toon(c, { unique: true }); mats.push(m); return m; };
  const straw = M('#d8b86a'), wood = M('#8a5a3a'), rope = M('#6a4a2a'), sack = M('#c8a878');
  const root = new THREE.Group(), yaw = new THREE.Group(), tilt = new THREE.Group(), model = new THREE.Group();
  root.add(yaw); yaw.add(tilt); tilt.add(model);
  root.add(at(mesh(DG.base, toon('#6f7468')), 0, 0.09, 0));
  model.add(at(mesh(DG.post, wood), 0, 0.85, 0), at(mesh(DG.body, straw), 0, 1.15, 0), at(mesh(DG.arm, wood), 0, 1.3, 0), at(mesh(DG.head, sack), 0, 1.85, 0));
  for (const y of [0.85, 1.45]) model.add(at(mesh(DG.band, rope), 0, y, 0));
  addOutline(root, outlineMat('#2b1d14', 0.025));
  root.position.set(x, 0, z);
  scene.add(root);
  const d = { root, yaw, tilt, model, mats, pos: root.position, home: new THREE.Vector2(x, z), base: new THREE.Vector2(x, z), r: 0.55, vx: 0, vz: 0, vy: 0, ang: 0, angV: 0, flash: 0, stun: 0, airRot: 0, airSpin: 0, spiked: false, bumpT: 0,
    name: '试炼木桩 · ' + NUMS[dummies.length] + ' · ' + elem, elem, max: opt.dummyHp, hp: opt.dummyHp, dead: false, deathT: 0, spawnT: 1 };
  d.bar = new HealthBar({ parent: hpLayer, max: d.max, tick: 50 });
  dummies.push(d);
  return d;
}
const DC = { x: -5, z: 0 };
const NUMS = '壹贰叁肆伍陆柒捌玖拾';
const hpLayer = document.getElementById('hpLayer');
const targetBar = new HealthBar({ parent: document.body, max: 300, big: true, tick: 50 });
let focusD = null;
const live = () => dummies.filter((d) => !d.dead);
function setDummyMax(d, max) { d.hp = d.dead ? 0 : Math.min(max, d.hp + Math.max(0, max - d.max)); d.max = max; d.bar.snap(d.hp, max); }
function layout(n) {
  for (const d of dummies) { scene.remove(d.root); for (const m of d.mats) m.dispose(); d.bar.remove(); }
  dummies.length = 0; focusD = null; targetBar.snap(1, 1, '');
  movingTargets = n === 4; layoutN = n;
  // 木桩放在玩家左边（屏幕左侧）
  if (n === 1) makeDummy(DC.x + 1, DC.z);
  if (n === 2) for (let i = -2; i <= 2; i++) makeDummy(DC.x, DC.z + i * 2);
  if (n === 3 || n === 4) {
    makeDummy(DC.x, DC.z);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; makeDummy(DC.x + Math.cos(a) * 1.6, DC.z + Math.sin(a) * 1.6); }
  }
  for (const d of dummies) fx.burst(d.pos, '#c8b8ff', 8, { speed: 3, up: 3 });
}

const stats = { total: 0, log: [], chainHits: 0, best: 0, kills: 0 };
// h：命中参数里的 launch / lift / spike / pull（见 comboAir.js）
const GRAV = 26;
const airborne = (d) => d.pos.y > 0.02 || d.vy > 0;
// 五行：己克对方 ×1.5，被克 ×0.75
const elemMul = (d) => (KE[P.elem] === d.elem ? 1.5 : KE[d.elem] === P.elem ? 0.75 : 1);
function hitDummy(d, dmg, fromX, fromZ, knock, color = '#ffffff', h = {}) {
  if (d.dead) return;
  const air = airborne(d);
  const crit = Math.random() < 0.12, mul = elemMul(d), amt = dmg * (crit ? 1.8 : 1) * mul;
  if (focusD !== d) { focusD = d; targetBar.snap(d.hp, d.max, d.name); }
  d.hp = Math.max(0, d.hp - amt);
  d.bar.damage(amt, crit); targetBar.damage(amt, crit);
  const dx = d.pos.x - fromX, dz = d.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
  const kb = knock * opt.knock * (air ? 0.7 : 1);
  d.vx += dx / l * kb; d.vz += dz / l * kb;
  if (h.pull) { // 吸到角色身前，连段不脱节
    const tx = P.pos.x + Math.sin(P.yaw) * 1.5, tz = P.pos.z + Math.cos(P.yaw) * 1.5;
    d.vx = d.vx * (1 - h.pull) + (tx - d.pos.x) * h.pull * 5; d.vz = d.vz * (1 - h.pull) + (tz - d.pos.z) * h.pull * 5;
  }
  if (h.spike) { d.vy = -h.spike; d.spiked = true; d.airSpin = 14; }
  else if (h.launch) { d.vy = Math.max(d.vy, h.launch); d.pos.y = Math.max(d.pos.y, 0.03); d.airSpin = 3 + h.launch * 0.4; }
  else if (air) d.vy = Math.max(d.vy * 0.3, (h.lift ?? 3.5) * clamp(1 + (P.pos.y + 0.2 - d.pos.y) * 0.8, 0.15, 1.6)); // 空中挨打会被托住，托到和角色差不多高
  d.stun = 0.75;
  d.yaw.rotation.y = Math.atan2(dx, dz); d.model.rotation.y = -d.yaw.rotation.y;
  d.angV += 4 + Math.abs(knock) * 0.7;
  d.flash = 0.1;
  fx.num(d.pos, Math.round(amt) + (crit ? '!' : '') + (mul > 1 ? '克' : mul < 1 ? '弱' : ''), crit ? 'crit' : '');
  fx.nums.at(-1).p.y += d.pos.y;
  fx.burst(d.pos, crit ? '#ffe28a' : color, crit ? 12 : 6, { speed: 5, up: 2, life: 0.3, y: 1.1 });
  sfx.impact({ crit, heavy: clamp((dmg - 10) / 25, 0, 1) });
  stats.total += amt; stats.log.push({ t: realTime, amt });
  stats.chainHits++; stats.best = Math.max(stats.best, stats.chainHits);
  if (d.hp <= 0) killDummy(d, dx / l, dz / l);
}

// 击破：向受击方向倒下、碎草飞散，几秒后原地重生
const RESPAWN = 2.2;
function killDummy(d, nx, nz) {
  d.dead = true; d.deathT = 0; d.fallYaw = Math.atan2(nx, nz);
  d.vx += nx * 6 * opt.knock; d.vz += nz * 6 * opt.knock;
  d.bar.die(); if (focusD === d) targetBar.die();
  stats.kills++;
  sfx.kill();
  fx.burst(d.pos, '#e8c878', 26, { speed: 7, up: 5, life: 0.6, y: 1.2 });
  fx.burst(d.pos, '#ffffff', 10, { speed: 4, up: 2, life: 0.25, y: 1.2 });
  fx.shockRing(d.pos.x, d.pos.z, 1.6, '#ffe7a8', 0.35);
  fx.num(d.pos, '击破', 'crit');
  if (opt.stop) hitStop = Math.max(hitStop, 0.09);
  g.shake(0.4);
}
function respawnDummy(d) {
  d.dead = false; d.hp = d.max; d.spawnT = 0; d.ang = 0; d.angV = 0; d.airRot = d.airSpin = 0; d.stun = 0; d.spiked = false;
  d.pos.set(d.home.x, 0, d.home.y); d.vx = d.vz = d.vy = 0;
  d.root.visible = true; d.model.position.y = 0;
  d.bar.revive(); if (focusD === d) targetBar.revive();
  fx.burst(d.pos, '#c8b8ff', 14, { speed: 3, up: 4, life: 0.5 });
  fx.shockRing(d.pos.x, d.pos.z, 1.2, '#c8b8ff', 0.3);
  sfx.respawn();
}
function updateDummies(dt, time) {
  for (const d of dummies) {
    if (movingTargets) {
      const a = time * 0.5 + Math.PI;
      d.home.set(Math.cos(a) * 6 + (d.base.x - DC.x) * 0.5, Math.sin(a) * 6 + (d.base.y - DC.z) * 0.5);
    } else d.home.copy(d.base);
    // 挨打后一段时间（硬直）不往回走，被打飞就真飞出去；空中几乎没有阻力
    const air = airborne(d);
    d.stun -= dt; d.bumpT -= dt;
    if (!air && d.stun <= 0) { d.vx += (d.home.x - d.pos.x) * 6 * dt; d.vz += (d.home.y - d.pos.z) * 6 * dt; }
    // 硬直中摩擦大：被打得猛、滑得短，还在连招范围里
    const k = Math.exp(-(air ? (d.pos.y > 1 ? 0.8 : 3) : d.stun > 0 ? 7 : 5) * dt); d.vx *= k; d.vz *= k;
    d.pos.x += d.vx * dt; d.pos.z += d.vz * dt;
    if (air) {
      d.vy -= GRAV * dt; d.pos.y += d.vy * dt; d.airRot += d.airSpin * dt;
      if (d.pos.y <= 0) landDummy(d);
    } else d.airRot *= Math.exp(-10 * dt);
    wallDummy(d);
    if (d.dead) {
      // 倒地 → 沉入地面 → 等待重生
      d.deathT += dt;
      const k = Math.min(1, d.deathT / 0.35);
      d.yaw.rotation.y = d.fallYaw; d.model.rotation.y = -d.fallYaw;
      d.tilt.rotation.x = 1.45 * (k * k) - Math.sin(k * Math.PI) * 0.15 + (k >= 1 ? Math.sin(Math.min(1, (d.deathT - 0.35) / 0.15) * Math.PI) * 0.08 : 0);
      d.model.position.y = -Math.max(0, d.deathT - 1.1) * 1.2;
      if (d.deathT > 1.8) d.root.visible = false;
      if (d.deathT > RESPAWN) respawnDummy(d);
      continue;
    }
    d.angV += (-140 * d.ang - 9 * d.angV) * dt; d.ang += d.angV * dt;
    d.tilt.rotation.x = clamp(d.ang, -0.7, 0.7) + d.airRot;
    if (d.spawnT < 1) { d.spawnT = Math.min(1, d.spawnT + dt * 3); const k = d.spawnT; d.model.scale.setScalar(k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k) * (1 - k) * 0.9 : 1); }
    if (d.flash > 0) { d.flash -= dt; setFlash(d.mats, d.flash > 0 ? 0.9 : 0); }
  }
  for (const d of dummies) if (d.dead && d.flash > 0) { d.flash = 0; setFlash(d.mats, 0); }
  for (let i = 0; i < dummies.length; i++) for (let j = i + 1; j < dummies.length; j++) {
    const a = dummies[i], b = dummies[j];
    if (a.dead || b.dead || Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2), k = (rr - d) / d * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k;
      // 被打飞的木桩撞上别的木桩：把一半速度传过去（保龄球）
      const sa = Math.hypot(a.vx, a.vz), sb = Math.hypot(b.vx, b.vz), [f, o] = sa > sb ? [a, b] : [b, a];
      if (Math.max(sa, sb) > 7 && o.bumpT <= 0) {
        o.vx += f.vx * 0.6; o.vz += f.vz * 0.6; f.vx *= 0.5; f.vz *= 0.5;
        o.stun = 0.6; o.flash = 0.08; o.angV += 7; o.bumpT = 0.25;
        fx.burst({ x: (a.pos.x + b.pos.x) / 2, y: a.pos.y, z: (a.pos.z + b.pos.z) / 2 }, '#e8c878', 8, { speed: 4, up: 3, life: 0.3, y: 1 });
        sfx.impact({ heavy: 0.3 }); g.shake(0.15);
      }
    }
  }
}

// 落地：重摔会弹起；被「坠龙」砸下来的会震飞周围的木桩
function landDummy(d) {
  const v = -d.vy; d.pos.y = 0;
  if (v > 10) {
    d.vy = Math.min(7, v * 0.32); d.airSpin *= 0.5;
    fx.shockRing(d.pos.x, d.pos.z, d.spiked ? 2.6 : 1.4, '#e8d8b0', 0.3);
    fx.burst(d.pos, '#b89a6a', d.spiked ? 24 : 12, { speed: 5, up: 4, life: 0.5, y: 0.2, bright: 1 });
    sfx.impact({ heavy: 1 }); g.shake(d.spiked ? 0.55 : 0.25);
    if (d.spiked) {
      d.spiked = false;
      fx.num(d.pos, '砸地', 'crit');
      if (opt.stop) hitStop = Math.max(hitStop, 0.08);
      for (const o of live()) if (o !== d && o.pos.y < 1 && Math.hypot(o.pos.x - d.pos.x, o.pos.z - d.pos.z) < 2.8) hitDummy(o, 8, d.pos.x, d.pos.z, 7, '#ffd27a', { launch: 8 });
    }
  } else if (v > 4) { d.vy = v * 0.22; fx.burst(d.pos, '#b89a6a', 5, { speed: 3, up: 2, life: 0.4, y: 0.2, bright: 1 }); }
  else { d.vy = 0; d.airSpin = 0; d.airRot = Math.atan2(Math.sin(d.airRot), Math.cos(d.airRot)); d.angV += v * 1.5; d.spiked = false; }
}
// 撞墙：反弹 + 尘土
function wallDummy(d) {
  const lim = ARENA_R - 0.6, r = Math.hypot(d.pos.x, d.pos.z);
  if (r <= lim) return;
  const nx = d.pos.x / r, nz = d.pos.z / r, vn = d.vx * nx + d.vz * nz;
  d.pos.x = nx * lim; d.pos.z = nz * lim;
  if (vn <= 0) return;
  d.vx -= nx * vn * 1.5; d.vz -= nz * vn * 1.5;
  if (vn > 5 && !d.dead) {
    d.angV += 6; d.flash = 0.08;
    fx.burst({ x: d.pos.x + nx * 0.4, y: d.pos.y, z: d.pos.z + nz * 0.4 }, '#d8d0c0', 14, { speed: 4, up: 3, life: 0.4, y: 1 });
    fx.num(d.pos, '撞墙', ''); fx.nums.at(-1).p.y += d.pos.y;
    sfx.impact({ heavy: 0.6 }); g.shake(0.25);
  }
}

// ---------- 玩家 ----------
const P = {
  c: createChibi({ skin: '#f8d8bc', hair: '#4a2e22', hairStyle: 2, robe: '#f2f4f6', robe2: '#4f7fb0', belt: '#3a5a78', pants: '#3a4250', sword: true }),
  r: 0.4, yaw: -Math.PI / 2, iframe: 0, dashT: 0, dashCd: 0, dashDir: 0, vy: 0,
  qi: 100, qiMax: 100, qiPause: 0, skillCd: [0, 0, 0, 0], elem: opt.elem,
  leapFrom: new THREE.Vector2(), leapTo: new THREE.Vector2(), leapY0: 0, leapY1: 0, leapOn: false, motion: [], sweepHit: new Set(),
};
P.pos = P.c.root.position;
P.pos.set(1, 0, 0);
scene.add(P.c.root);

// 当前武器（拳 / 剑 / 符）：决定连招树和技能槽，切换见 setKit
let kit = KITS[0];
const runner = new ComboRunner(TUNE, kit.moves, kit.tree);
runner.afford = (m) => P.qi >= (m.qi || 0); // 灵力不够就断回第一击
const fwd = () => new THREE.Vector2(Math.sin(P.yaw), Math.cos(P.yaw));
// 向前 dist 米的地面点（最远 8 米）
const groundAt = (dist) => { const f = fwd(), k = Math.min(dist, 8); return { x: P.pos.x + f.x * k, z: P.pos.z + f.y * k }; };
const fxCtx = (m, cx, cz) => ({ cfx, fx, x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, fx0: Math.sin(P.yaw), fz0: Math.cos(P.yaw), color: m.color || '#9ef0ff', cx, cz, getPos: () => P.pos, getY: () => P.pos.y });

// 前方（±40°）最近、高度够得着的木桩
function frontTarget(range) {
  let best = null, bd = range;
  for (const d of live()) {
    const dx = d.pos.x - P.pos.x, dz = d.pos.z - P.pos.z, l = Math.hypot(dx, dz);
    if (l < bd && Math.abs(d.pos.y - P.pos.y) < 1.6 && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) < 0.7) { bd = l; best = d; }
  }
  return best;
}
// 最近的浮空木桩（追月跳过去）
function airTarget(range) {
  let best = null, bd = range;
  for (const d of live()) { const l = Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z); if (d.pos.y > 0.3 && l < bd) { bd = l; best = d; } }
  return best;
}
// seek：只冲到目标身前，没目标就按原距离走
function motionDist(s) {
  if (!s.seek) return s.dist;
  const d = frontTarget(s.dist * 2.5 + 2.5);
  return d ? clamp(Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z) - (d.r + P.r + 0.6), 0, s.dist * 2.5) : s.dist;
}
// 跳跃在起跳那一刻才定落点（前面可能还有一段位移）
function startLeap(m) {
  const L = m.leap;
  P.leapOn = true;
  P.leapFrom.set(P.pos.x, P.pos.z); P.leapY0 = P.pos.y; P.leapY1 = typeof L.y1 === 'number' ? L.y1 : 0;
  const t = L.to === 'air' && airTarget(L.max);
  if (t) { // 跳到浮空目标面前，高度按到达时它的位置估
    const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1, go = Math.max(0, l - 1.4), T = L.t1 - L.t0;
    P.yaw = Math.atan2(dx, dz);
    P.leapTo.set(P.pos.x + dx / l * go, P.pos.z + dz / l * go);
    P.leapY1 = Math.max(0.6, t.pos.y + t.vy * T - 0.5 * GRAV * T * T - 0.3);
  } else {
    const f = fwd();
    let dist = L.dist ?? 0;
    if (L.to === 'aim') dist = Math.min(L.max, Math.hypot(aim.x - P.pos.x, aim.z - P.pos.z));
    if (L.to === 'air') { dist = 2.5; P.leapY1 = Math.max(P.pos.y, 2.2); }
    P.leapTo.set(P.pos.x + f.x * dist, P.pos.z + f.y * dist);
  }
  clampArena(P.leapTo);
  const h = m.hits[0];
  if (h?.shape === 'circle') fx.circle(P.leapTo.x, P.leapTo.y, h.r, L.t1 - L.t0);
}

runner.on.start = (m, path, type) => {
  P.yaw = aimYaw();
  P.iframe = Math.max(P.iframe, m.iframe || 0);
  P.sweepHit.clear();
  if (path === '') stats.chainHits = 0;
  else { P.qi -= m.qi || 0; P.qiPause = 0.4; }
  P.motion = (m.motion || []).map((s) => ({ ...s, d: motionDist(s) }));
  P.leapOn = false;
  if (m.leap && m.leap.t0 <= 0.05) startLeap(m);
  if (m.pose === 'dash') fx.burst(P.pos, '#9ef0ff', 14, { speed: 6, up: 1, life: 0.3 });
  MOVE_FX[m.id]?.start?.(fxCtx(m, P.leapTo.x, P.leapTo.y), m);
  if (sfx.ok) { sfx.tick(type); if (MOVE_SFX[m.id]) MOVE_SFX[m.id].start?.(sfx, m, (m.hits[0]?.t ?? 0.15) / opt.timeScale); else sfx.swing({ lead: 0.06, pitch: 1.15, size: 0.8 }); }
  P.ghostT = 0;
  showMove(m, path);
};

runner.on.hit = (m, h, idx) => {
  const f = fwd(), color = m.color || '#9ef0ff', vr = h.vr ?? 1.5, inReach = (d) => Math.abs(d.pos.y - P.pos.y) <= vr;
  let hitAny = false;
  if (h.shape === 'arc') {
    debugArc(P.pos.x, P.pos.z, P.yaw, h.range, h.arc);
    for (const d of live()) {
      const dx = d.pos.x - P.pos.x, dz = d.pos.z - P.pos.z;
      if (!inReach(d) || Math.hypot(dx, dz) - d.r > h.range || Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) > h.arc) continue;
      hitDummy(d, h.dmg, P.pos.x, P.pos.z, h.knock, color, h); hitAny = true;
    }
  } else if (h.shape === 'circle') {
    const cx = P.pos.x + f.x * h.at, cz = P.pos.z + f.y * h.at;
    debugCircle(cx, cz, h.r);
    if (P.pos.y < 0.5) fx.shockRing(cx, cz, h.r, color, 0.3);
    for (const d of live()) {
      if (!inReach(d) || Math.hypot(d.pos.x - cx, d.pos.z - cz) - d.r > h.r) continue;
      hitDummy(d, h.dmg, cx, cz, h.knock, color, h); hitAny = true;
    }
  } else if (h.shape === 'wave') {
    debugLine(P.pos.x, P.pos.z, P.yaw, h.len, h.w);
    waves.push({ x: P.pos.x + f.x * 0.8, z: P.pos.z + f.y * 0.8, yaw: P.yaw, left: h.len, h, color, hit: new Set(), m: spawnWaveMesh(color) });
  } else if (h.shape === 'bolt') {
    spawnBolt(P.pos.x + f.x * 0.8, P.pos.z + f.y * 0.8, P.yaw + (h.ang || 0), h, color);
  } else if (h.shape === 'trap') {
    const g0 = groundAt(h.at); placeBlast(g0.x, g0.z, h, color);
  } else if (h.shape === 'rain') {
    const g0 = groundAt(h.at);
    for (let k = 0; k < h.n; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * h.spread;
      placeBlast(g0.x + Math.cos(a) * rr, g0.z + Math.sin(a) * rr, { ...h, keep: false, delay: h.delay * (0.4 + Math.random() * 0.6) }, color);
    }
  } else if (h.shape === 'detonate') {
    for (const b of blasts.filter((b) => b.keep && b.armed)) explode(b, h.mul);
  }
  if (!MOVE_FX[m.id] && h.shape === 'arc') cfx.arc(P.pos, P.yaw, color, { tilt: idx % 2 ? 0.6 : -0.6, scale: 0.85, flip: idx % 2 === 1 });
  const f2 = fwd();
  MOVE_FX[m.id]?.hit?.(fxCtx(m, P.pos.x + f2.x * (h.at || 0), P.pos.z + f2.y * (h.at || 0)), h, idx);
  if (sfx.ok) MOVE_SFX[m.id]?.hit?.(sfx, h, idx, m);
  if (hitAny || h.shape !== 'arc') hitFeel(h);
};

function hitFeel(h) {
  if (opt.stop && h.stop) hitStop = Math.max(hitStop, h.stop);
  g.shake(h.shake ?? 0.15);
}

// 剑气（疾风·终）
const waves = [];
function spawnWaveMesh(color) {
  const mk = (c, k) => new THREE.Mesh(fx.crescentGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const g = new THREE.Group(), a = mk(color, 3), b = mk('#ffffff', 2.5), c = mk(color, 2);
  a.scale.setScalar(1.6); b.scale.setScalar(1.25); c.scale.set(1.9, 1, 1.1); c.position.set(0, 0, -0.5);
  g.add(a, b, c); scene.add(g);
  g.material = { set opacity(v) { a.material.opacity = v; b.material.opacity = v; c.material.opacity = v * 0.5; }, dispose() { for (const o of [a, b, c]) o.material.dispose(); } };
  return g;
}
function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i], step = Math.min(w.left, 20 * dt);
    w.x += Math.sin(w.yaw) * step; w.z += Math.cos(w.yaw) * step; w.left -= step;
    w.m.position.set(w.x, 1, w.z); w.m.rotation.y = w.yaw;
    w.m.material.opacity = Math.min(1, w.left * 0.6);
    w.age = (w.age || 0) + dt;
    for (const sd of [-1, 1]) {
      const o = Math.sin(w.age * 30 + sd * 1.6) * 1.1 * sd;
      fx.mote(w.x + Math.cos(w.yaw) * o, 1 + Math.cos(w.age * 30) * 0.4, w.z - Math.sin(w.yaw) * o, w.color, { life: 0.35, size: 0.8 });
    }
    if (Math.random() < 0.5) fx.burst({ x: w.x, z: w.z }, '#d8e8f0', 1, { speed: 1.5, up: 1, life: 0.5, y: 0.1, bright: 0.8 });
    for (const d of live()) {
      if (w.hit.has(d) || d.pos.y > 2 || Math.hypot(d.pos.x - w.x, d.pos.z - w.z) > d.r + w.h.w * 0.6) continue;
      w.hit.add(d); hitDummy(d, w.h.dmg, w.x - Math.sin(w.yaw), w.z - Math.cos(w.yaw), w.h.knock, w.color, w.h);
      cfx.arc(d.pos, w.yaw, w.color, { tilt: 0.7, scale: 0.6, y: 1.2, dur: 0.18 });
    }
    if (w.left <= 0) { fx.burst({ x: w.x, z: w.z }, w.color, 14, { speed: 5, up: 2, life: 0.35, y: 1 }); scene.remove(w.m); w.m.material.dispose(); waves.splice(i, 1); }
  }
}

// ---------- 符：飞符、陷阱、圆形爆炸 ----------
const bolts = [], blasts = [];
const talisGeo = new THREE.BoxGeometry(0.32, 0.46, 0.03);
const talisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3c0').multiplyScalar(2), toneMapped: false });
function spawnBolt(x, z, yaw, h, color) {
  const m = new THREE.Mesh(talisGeo, talisMat); m.position.set(x, 1.1, z); m.rotation.y = yaw; scene.add(m);
  bolts.push({ x, z, yaw, left: h.range, h, color, hit: new Set(), m });
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i], step = Math.min(b.left, b.h.spd * dt);
    b.x += Math.sin(b.yaw) * step; b.z += Math.cos(b.yaw) * step; b.left -= step;
    b.m.position.set(b.x, 1.1, b.z);
    if (Math.random() < 0.6) fx.mote(b.x, 1.1, b.z, b.color, { life: 0.25, size: 0.7 });
    let done = b.left <= 0;
    for (const d of live()) {
      if (b.hit.has(d) || d.pos.y > 2 || Math.hypot(d.pos.x - b.x, d.pos.z - b.z) > d.r + 0.3) continue;
      b.hit.add(d); hitDummy(d, b.h.dmg, b.x - Math.sin(b.yaw), b.z - Math.cos(b.yaw), b.h.knock, b.color, b.h);
      if (!b.h.pierce) { done = true; break; }
    }
    if (done) { fx.burst({ x: b.x, z: b.z }, b.color, 8, { speed: 4, up: 2, life: 0.3, y: 1 }); scene.remove(b.m); bolts.splice(i, 1); }
  }
}
// 陷阱：先预警圈，延时后生效；keep 的会一直埋在地上，有人踩进去或引爆才炸，6 秒后失效
function placeBlast(x, z, h, color) {
  const b = { x, z, h, color, keep: !!h.keep, delay: h.delay ?? 0.2, t: 0, armed: !h.delay };
  fx.circle(x, z, h.r, b.delay);
  blasts.push(b);
}
function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]; b.t += dt;
    if (!b.armed && b.t >= b.delay) b.armed = true;
    if (!b.armed) continue;
    if (!b.keep) { explode(b); continue; }
    if (b.t > b.delay + 6) { blasts.splice(i, 1); continue; }
    if (live().some((d) => Math.hypot(d.pos.x - b.x, d.pos.z - b.z) - d.r < b.h.r)) explode(b);
    else if (Math.random() < 0.15) { const a = Math.random() * Math.PI * 2; fx.mote(b.x + Math.cos(a) * b.h.r, 0.2, b.z + Math.sin(a) * b.h.r, b.color, { life: 0.5, size: 0.6, vy: 0.8 }); }
  }
}
function explode(b, mul = 1) {
  const h = b.h;
  fx.shockRing(b.x, b.z, h.r, b.color, 0.3);
  fx.burst({ x: b.x, z: b.z }, b.color, 18, { speed: 6, up: 4, life: 0.45, y: 0.3 });
  cfx.flash(b.x, b.z, b.color, 20, 0.25);
  for (const d of live()) {
    if (Math.hypot(d.pos.x - b.x, d.pos.z - b.z) - d.r > h.r) continue;
    hitDummy(d, h.dmg * mul, b.x, b.z, h.knock, b.color, h);
    if (h.root) { d.stun = h.root; d.vx = d.vz = 0; }
  }
  hitFeel(h);
  const i = blasts.indexOf(b); if (i >= 0) blasts.splice(i, 1);
}
// 以一点为圆心的一圈伤害（技能用）
function ring(r, dmg, extra, color, x = P.pos.x, z = P.pos.z) {
  fx.shockRing(x, z, r, color, 0.3);
  for (const d of live()) {
    if (Math.hypot(d.pos.x - x, d.pos.z - z) - d.r > r) continue;
    hitDummy(d, dmg, x, z, extra.knock ?? 6, color, extra);
  }
  hitFeel(extra);
}

// ---------- 判定框可视化（调参面板「判定框」开关，默认关） ----------
const dbg = [];
const dbgMat = () => new THREE.MeshBasicMaterial({ color: 0xff3a6a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function addDbg(m) { if (!opt.hitbox) { m.geometry.dispose(); return; } m.position.y = 0.06; scene.add(m); dbg.push({ m, t: 0 }); }
function debugArc(x, z, yaw, range, arc) {
  const geo = new THREE.RingGeometry(0.05, range, 24, 1, -arc, arc * 2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, dbgMat()); m.position.set(x, 0, z); m.rotation.y = yaw; addDbg(m);
}
function debugCircle(x, z, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), dbgMat()); m.position.set(x, 0, z); addDbg(m);
}
function debugLine(x, z, yaw, len, w) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2).translate(0, 0, len / 2), dbgMat()); m.position.set(x, 0, z); m.rotation.y = yaw; addDbg(m);
}
function updateDbg(dt) {
  for (let i = dbg.length - 1; i >= 0; i--) {
    const d = dbg[i]; d.t += dt; d.m.material.opacity = 0.32 * (1 - d.t / 0.25);
    if (d.t >= 0.25) { scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); dbg.splice(i, 1); }
  }
}

// ---------- 输入 ----------
const keys = new Set();
const mouse = new THREE.Vector2();
const aim = new THREE.Vector3();
addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'ShiftLeft') dash();
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) layout(+e.code.slice(5));
  const si = SKILL_KEYS.indexOf(e.code);
  if (si >= 0) useSkill(si);
  if (e.code === 'KeyX') cycleWeapon();
  if (e.code === 'KeyR') resetStats();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyJ') runner.click(); });
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointermove', (e) => mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
// 松开鼠标才出招（按下只"上膛"，拖出画布再松开也算）
let armed = false;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0 && !touch.on) armed = true; });
addEventListener('pointerdown', () => sfx.unlock());
addEventListener('pointerup', (e) => { if (e.button === 0 && armed) { armed = false; runner.click(); } });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('bReset').addEventListener('click', resetStats);
let layoutN = 3;
for (const b of document.querySelectorAll('#layoutBtns button')) b.addEventListener('click', () => layout(+b.dataset.n));

// ---------- 手机：左下摇杆移动，右下 斩 / 闪 / 换靶，自动瞄准最近的木桩 ----------
let foldAll = () => {};
const touch = new TouchControls();
touch.onChange = (on) => { armed = false; if (on) foldAll(); };
const tap = (fn) => ({ down: () => { sfx.unlock(); fn(); } });
touch.bind(document.getElementById('mAtk'), { down: () => sfx.unlock(), up: (c) => { if (!c) runner.click(); } });
touch.bind(document.getElementById('mDash'), tap(dash));
touch.bind(document.getElementById('mSwap'), tap(() => layout(layoutN % 4 + 1)));
touch.bind(document.getElementById('mWeap'), tap(() => cycleWeapon()));
for (let i = 0; i < SKILL_KEYS.length; i++) touch.bind(document.querySelector(`.mb[data-slot="${i}"]`), tap(() => useSkill(i)));

// ---------- 音效试听（逐个播放，找出哪个不对） ----------
const SFX_LIST = [
  ['通用', [
    ['挥剑 · 斩一', 'swing', () => sfx.swing({ lead: 0.11 })],
    ['挥剑 · 斩二', 'swing pitch1.1', () => sfx.swing({ lead: 0.11, pitch: 1.1 })],
    ['挥剑 · 斩三', 'swing size1.2', () => sfx.swing({ lead: 0.12, pitch: 0.95, size: 1.2 })],
    ['命中木桩', 'impact', () => sfx.impact()],
    ['命中 · 重击', 'impact heavy', () => sfx.impact({ heavy: 1 })],
    ['命中 · 暴击', 'impact crit', () => sfx.impact({ crit: true })],
    ['木桩击破', 'kill', () => sfx.kill()],
    ['木桩重生', 'respawn', () => sfx.respawn()],
    ['闪避', 'dash', () => sfx.dash()],
    ['节奏 · 快', 'tick F', () => sfx.tick('F')],
    ['节奏 · 慢', 'tick S', () => sfx.tick('S')],
  ]],
  ['招式零件', [
    ['连刺 · 一刺', 'stab', () => sfx.stab()],
    ['疾风 · 剑气出手', 'galeRelease', () => sfx.galeRelease()],
    ['落雷 · 蓄电', 'thunderCharge', () => sfx.thunderCharge(0.42)],
    ['落雷 · 雷鸣', 'thunderClap', () => sfx.thunderClap()],
    ['回旋 · 四圈风声', 'spin', () => sfx.spin(0.1)],
    ['惊鸿 · 突刺', 'pierce', () => sfx.pierce()],
    ['重劈落地 · 小', 'slam 0', () => sfx.slam(0)],
    ['重劈落地 · 大', 'slam 1', () => sfx.slam(1)],
    ['起跳', 'leap', () => sfx.leap(0.42)],
    ['起跳 + 火焰下落', 'leap fire', () => sfx.leap(0.45, true)],
    ['流星 · 爆炸', 'explode', () => sfx.explode()],
  ]],
  // 整招：按游戏里的时间顺序播（出招 + 每个判定帧），不含命中木桩声
  ['整招（按实战时序）', KITS.flatMap((k) => Object.values(k.moves)).map((m) => [m.name, m.id, () => {
    MOVE_SFX[m.id]?.start?.(sfx, m, m.hits[0]?.t ?? 0.15);
    m.hits.forEach((h, i) => setTimeout(() => MOVE_SFX[m.id]?.hit?.(sfx, h, i, m), h.t * 1000));
  }])],
];
{
  const list = document.getElementById('sfxList'); let n = 0;
  for (const [group, items] of SFX_LIST) {
    const h = document.createElement('h3'); h.textContent = group; list.append(h);
    for (const [name, id, play] of items) {
      const b = document.createElement('button'), no = ++n;
      b.innerHTML = `<span>${no}. ${name}</span><span class="id">${id}</span>`;
      b.addEventListener('click', () => {
        sfx.unlock();
        if (!sfx.enabled) { sfx.enabled = opt.sound = true; document.getElementById('bSound').classList.add('on'); saveOpt(); }
        sfx.ctx?.resume().then(play); b.classList.add('play'); setTimeout(() => b.classList.remove('play'), 250);
      });
      list.append(b);
    }
  }
}

// ---------- 面板折叠：点标题收起/展开，状态存在本机。音效试听默认收起，其余默认展开 ----------
{
  let fold = { sfxPanel: true };
  try { Object.assign(fold, JSON.parse(localStorage.getItem('arenaFold') || '{}')); } catch {}
  const set = (el, min) => { el.classList.toggle('min', min); el.querySelector('.fold').textContent = min ? '+' : '−'; };
  const toggle = (el) => { fold[el.id] = !el.classList.contains('min'); set(el, fold[el.id]); try { localStorage.setItem('arenaFold', JSON.stringify(fold)); } catch {} };
  for (const el of document.querySelectorAll('.panel')) {
    const h = el.querySelector('h2'), b = document.createElement('span');
    b.className = 'fold'; b.title = '收起 / 展开'; h.append(b);
    h.addEventListener('click', () => toggle(el));
    set(el, !!fold[el.id]);
  }
  // 手机屏幕小：进入手机模式时面板全部先收起（不记住）
  foldAll = () => { for (const el of document.querySelectorAll('.panel')) set(el, true); };
  if (touch.on) foldAll();
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) toggle(document.getElementById('sfxPanel')); });
}
function resetStats() { stats.kills = 0; stats.total = 0; stats.log.length = 0; stats.chainHits = 0; stats.best = 0; }

const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateAim() {
  if (!touch.on) { ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(ground, aim); return; }
  // 手机：自动瞄准最近的木桩；摇杆推着时优先摇杆方向上的
  const mv = moveInput(), my = mv.lengthSq() > 0.1 ? Math.atan2(mv.x, mv.y) : null;
  let best = null, bs = 1e9;
  for (const d of live()) {
    const dx = d.pos.x - P.pos.x, dz = d.pos.z - P.pos.z, l = Math.hypot(dx, dz);
    if (l > 9) continue;
    const sc = l + (my === null ? 0 : Math.abs(angDiff(Math.atan2(dx, dz), my)) * 3);
    if (sc < bs) { bs = sc; best = d; }
  }
  if (best) { aim.set(best.pos.x, 0, best.pos.z); return; }
  const yaw = my ?? P.yaw;
  aim.set(P.pos.x + Math.sin(yaw) * 4, 0, P.pos.z + Math.cos(yaw) * 4);
}
const aimYaw = () => Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
function moveInput() {
  const v = new THREE.Vector2((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.stick.x, (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0) - touch.stick.y);
  if (v.lengthSq() > 1) v.normalize();
  return v;
}
function clampArena(v) { const l = Math.hypot(v.x, v.y); if (l > ARENA_R - 0.6) v.multiplyScalar((ARENA_R - 0.6) / l); }

function dash() {
  if (P.dashCd > 0) return;
  const mv = moveInput();
  P.dashDir = mv.lengthSq() > 0 ? Math.atan2(mv.x, mv.y) : P.yaw;
  P.dashT = 0.18; P.dashCd = 2.5; P.iframe = Math.max(P.iframe, 0.25);
  sfx.dash();
  if (runner.path !== null) { runner.cancel(); showMove(null); }
}

// ---------- 玩家更新 ----------
const _v2 = new THREE.Vector2();
function updatePlayer(dt) {
  P.iframe -= dt; P.dashCd -= dt;
  P.qiPause -= dt; if (P.qiPause <= 0) P.qi = Math.min(P.qiMax, P.qi + 22 * dt);
  for (let i = 0; i < P.skillCd.length; i++) P.skillCd[i] = Math.max(0, P.skillCd[i] - dt);
  runner.update(dt);
  const m = runner.move, t = runner.t;
  const mv = moveInput();
  let vx = mv.x * 6, vz = mv.y * 6, y = P.pos.y, yHeld = false;

  if (m) {
    const spd = m.moveSpd || 0;
    vx = mv.x * spd; vz = mv.y * spd;
    for (const s of P.motion) if (t > s.t0 && t - dt < s.t1) {
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
    if (m.leap && !P.leapOn && t >= m.leap.t0) startLeap(m);
    if (m.leap && P.leapOn) {
      const L = m.leap, k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1), e = k * k * (3 - 2 * k);
      _v2.lerpVectors(P.leapFrom, P.leapTo, e);
      P.pos.x = _v2.x; P.pos.z = _v2.y; vx = vz = 0;
      if (t - dt < L.t1) { y = P.leapY0 + (P.leapY1 - P.leapY0) * e + L.h * 4 * k * (1 - k); yHeld = true; }
      if (k > 0 && k < 1 && Math.random() < 0.6) fx.mote(P.pos.x, y + 1, P.pos.z, m.color, { life: 0.3, size: 0.9 });
    }
    if (m.hang) yHeld = true; // 空中招式：悬停

    if (m.sweep && t > m.lunge[0] && t - dt < m.lunge[1]) {
      fx.mote(P.pos.x, 0.8 + Math.random() * 0.6, P.pos.z, '#9ef0ff', { life: 0.35, size: 1.3 });
      debugCircle(P.pos.x, P.pos.z, m.sweep.w);
      for (const d of live()) {
        if (P.sweepHit.has(d) || d.pos.y > 1.8 || Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z) > d.r + m.sweep.w) continue;
        P.sweepHit.add(d); hitDummy(d, m.sweep.dmg, P.pos.x - Math.sin(P.yaw), P.pos.z - Math.cos(P.yaw), m.sweep.knock, '#9ef0ff', m.sweep);
        cfx.xslash(d.pos, '#9ef0ff', 0.03);
        hitFeel(m.sweep);
      }
    }
  }
  // 不在招式控制高度时受重力下落
  if (yHeld) P.vy = 0;
  else if (y > 0 || P.vy > 0) {
    P.vy -= 30 * dt; y += P.vy * dt;
    if (y <= 0) { if (P.vy < -9) fx.burst(P.pos, '#d8d0c0', 6, { speed: 3, up: 1, life: 0.3, y: 0.1, bright: 1 }); y = 0; P.vy = 0; }
  }
  const ghosting = (m && ((m.lunge && m.sweep && t < m.lunge[1]) || (m.leap && t < m.leap.t1) || P.motion.some((s) => s.d > 1.5 && t < s.t1))) || P.dashT > 0;
  if (ghosting) { P.ghostT = (P.ghostT || 0) - dt; if (P.ghostT <= 0) { P.ghostT = 0.035; cfx.ghost(P.c.root, m?.leap ? m.color : '#9ef0ff', 0.28); } }
  if (P.dashT > 0) {
    P.dashT -= dt;
    vx = Math.sin(P.dashDir) * 17; vz = Math.cos(P.dashDir) * 17;
    fx.mote(P.pos.x, 0.8 + Math.random() * 0.6, P.pos.z, '#9ef0ff', { life: 0.3, size: 1.2 });
  }
  P.pos.x += vx * dt; P.pos.z += vz * dt;
  _v2.set(P.pos.x, P.pos.z); clampArena(_v2); P.pos.x = _v2.x; P.pos.z = _v2.y;
  const ghost = (m && (m.sweep || m.leap)) || P.dashT > 0;
  if (!ghost) for (const d of live()) {
    if (Math.abs(d.pos.y - y) > 1) continue;
    const dx = P.pos.x - d.pos.x, dz = P.pos.z - d.pos.z, rr = P.r + d.r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) { const dd = Math.sqrt(d2), k = (rr - dd) / dd; P.pos.x += dx * k; P.pos.z += dz * k; }
  }

  if (P.dashT > 0) P.yaw = P.dashDir;
  else if (!m && mv.lengthSq() > 0) P.yaw = lerpAngle(P.yaw, Math.atan2(mv.x, mv.y), 1 - Math.exp(-14 * dt));
  P.c.root.rotation.y = P.yaw;
  P.c.root.position.y = y;
  animate(dt, m, t, Math.min(1, Math.hypot(vx, vz) / 6));
  if (y > 0.3 && !(m && m.pose === 'leap')) { P.c.legs[0].rotation.x = -0.8; P.c.legs[1].rotation.x = -0.3; } // 空中收腿
  P.c.root.visible = !(P.iframe > 0 && !m && Math.floor(realTime * 20) % 2 === 0);
}

function animate(dt, m, t, moving) {
  if (!animCombo(P.c, dt, m, t)) animChibi(P.c, dt, { move: P.dashT > 0 ? 0 : moving, attack: -1, combo: 0, cast: 0, dash: P.dashT > 0, spin: 0, work: 0 });
}

// ---------- 镜头 ----------
const focus = new THREE.Vector3(1, 0, 0);
let camZoom = 1;
function updateCamera(dt) {
  // 跟一点角色高度，空中连段不出画；手机拉远（竖屏更远）
  focus.lerp(P.pos, 1 - Math.exp(-8 * dt)); focus.y = Math.max(0, focus.y) * 0.5;
  camZoom += ((touch.on ? (innerWidth < innerHeight ? 1.75 : 1.25) : 1) - camZoom) * (1 - Math.exp(-6 * dt));
  const dist = 21 * camZoom, pitch = 0.9;
  camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
  if (g.shakeV > 0) {
    camera.position.x += (Math.random() - 0.5) * g.shakeV * 0.5;
    camera.position.y += (Math.random() - 0.5) * g.shakeV * 0.5;
    g.shakeV = Math.max(0, g.shakeV - dt * 3);
  }
  camera.lookAt(focus.x, 1 + focus.y, focus.z);
  sun.position.set(focus.x + 10, 22, focus.z + 8); sun.target.position.copy(focus); sun.target.updateMatrixWorld();
}

// ---------- 界面 ----------
const $ = (id) => document.getElementById(id);
// ---------- 武器与技能（X 换武；Q E F C 技能） ----------
const slotEls = [...document.querySelectorAll('[data-slot]')];
let kitI = 0;
function setKit(i) {
  kitI = (i + KITS.length) % KITS.length; kit = KITS[kitI];
  if (runner.path !== null) { runner.cancel(); showMove(null); }
  runner.moves = kit.moves; runner.tree = kit.tree;
  if (P.c.sword) P.c.sword.visible = kit.id === 'sword';
  buildRoutes();
  for (const el of slotEls) {
    const s = kit.skills[+el.dataset.slot];
    el.querySelector('.nm').textContent = s.name;
    const q = el.querySelector('.qc'); if (q) q.textContent = s.qi ? s.qi + ' 灵' : '回气';
  }
  $('weapon').textContent = kit.name; $('mWeap').textContent = kit.name; $('mAtk').textContent = kit.id === 'sword' ? '斩' : kit.name;
}
const cycleWeapon = () => setKit(kitI + 1);
const SKILLS = {
  sw_spin: () => { ring(3.2, 16, { knock: 8, launch: 2, stop: 0.05, shake: 0.3 }, '#9ef0ff'); cfx.whirl(() => P.pos, '#9ef0ff', 0.45); },
  sw_wave: () => {
    const f = fwd(), h = { len: 9, w: 1.6, dmg: 22, knock: 12, launch: 3, stop: 0.06, shake: 0.4 };
    waves.push({ x: P.pos.x + f.x * 0.8, z: P.pos.z + f.y * 0.8, yaw: P.yaw, left: h.len, h, color: '#9ef0ff', hit: new Set(), m: spawnWaveMesh('#9ef0ff') });
  },
  sw_lift: () => ring(3.6, 10, { knock: 2, launch: 10, stop: 0.05 }, '#bfe8ff'),
  ft_shock: () => ring(3, 14, { knock: 8, stop: 0.05, shake: 0.3 }, '#ffe28a'),
  ft_bell: () => { P.iframe = Math.max(P.iframe, 0.8); cfx.flash(P.pos.x, P.pos.z, '#ffe28a', 20, 0.4, 1.2); fx.shockRing(P.pos.x, P.pos.z, 1.6, '#ffe28a', 0.35); },
  ft_charge: () => {
    const f = fwd();
    P.dashT = 0.22; P.dashDir = P.yaw; P.iframe = Math.max(P.iframe, 0.25);
    ring(2.4, 18, { knock: 10, launch: 2, stop: 0.06, shake: 0.4 }, '#ffb84a', P.pos.x + f.x * 2.2, P.pos.z + f.y * 2.2);
  },
  tl_nova: () => ring(3, 12, { knock: 8, launch: 2, stop: 0.04 }, '#fff3c0'),
  tl_guard: () => { P.iframe = Math.max(P.iframe, 0.8); cfx.flash(P.pos.x, P.pos.z, '#fff3c0', 20, 0.4, 1.2); fx.shockRing(P.pos.x, P.pos.z, 1.8, '#fff3c0', 0.35); },
  tl_put: () => { const g0 = groundAt(3); placeBlast(g0.x, g0.z, { r: 2.2, dmg: 20, knock: 10, launch: 3, keep: true, delay: 0.5 }, '#ffe28a'); },
  qi: () => { P.qi = Math.min(P.qiMax, P.qi + 40); },
};
function useSkill(i) {
  const s = kit.skills[i];
  if (!s || P.skillCd[i] > 0 || P.qi < s.qi) return;
  P.qi -= s.qi; P.qiPause = 0.4; P.skillCd[i] = s.cd;
  P.yaw = aimYaw();
  if (runner.path !== null) { runner.cancel(); showMove(null); }
  SKILLS[s.id]();
  sfx.unlock();
}

let routeEls = [];
function buildRoutes() {
  const list = $('routeList'); list.innerHTML = '';
  routeEls = kit.routes.map((r) => {
    const el = document.createElement('div'); el.className = 'route';
    let html = `<div class="hd"><span class="nm">${r.name}</span><span class="tg">${r.tag}</span></div><div class="steps"><span class="chip">${kit.moves[kit.tree['']].name}</span>`;
    for (let i = 0; i < r.seq.length; i++) html += `<span class="arr ${r.seq[i]}">▸${r.seq[i] === 'F' ? '快' : '慢'}</span><span class="chip">${kit.moves[kit.tree[r.seq.slice(0, i + 1)]].name}</span>`;
    el.innerHTML = html + '</div>';
    list.appendChild(el);
    return { r, el, chips: [...el.querySelectorAll('.chip')] };
  });
}
function showMove(m, path) {
  $('moveName').innerHTML = m ? `${m.name}<small>第${runner.chain}式</small>` : '';
  for (const { r, el, chips } of routeEls) {
    const on = path != null && r.seq.startsWith(path);
    el.classList.toggle('off', path != null && !on);
    el.classList.toggle('cur', on);
    el.classList.toggle('done', on && path === r.seq);
    chips.forEach((c, i) => { c.classList.toggle('lit', on && i < path.length); c.classList.toggle('now', on && i === path.length); });
  }
}
setKit(0);
showMove(null, null);

const PRE = 0.3;
let barSpan = 1;
const pct = (dt) => clamp((dt + PRE) / barSpan, 0, 1) * 100 + '%';
function layoutBar() {
  barSpan = PRE + TUNE.slowWin + 0.3;
  const z = (id, a, b) => { const el = $(id); el.style.left = pct(a); el.style.width = `calc(${pct(b)} - ${pct(a)})`; };
  z('zPre', -PRE, 0); z('zFast', 0, TUNE.fastWin); z('zSlow', TUNE.fastWin, TUNE.slowWin); z('zCut', TUNE.slowWin, barSpan - PRE);
}
layoutBar();
let lastShown = null;
function updateBars(dt) {
  for (const d of dummies) {
    d.bar.update(dt);
    const [x, y, front] = screenOf(camera, d.pos.x, 2.45 + d.pos.y + d.model.position.y, d.pos.z);
    d.bar.place(x, y);
    if (!front) d.bar.el.style.visibility = 'hidden';
  }
  targetBar.update(dt); targetBar.place();
}
function updateUI() {
  const m = runner.move, cur = $('cursor');
  let dt = null;
  if (m && runner.t < m.cancel) dt = Math.max(-PRE, runner.t - m.cancel);
  else if (runner.path !== null && !kit.moves[kit.tree[runner.path]].end) dt = runner.clock - runner.readyAt;
  cur.hidden = dt === null || dt > barSpan - PRE;
  if (!cur.hidden) cur.style.left = pct(dt);
  if (runner.path !== null && !m && !runner.open && $('moveName').textContent) showMove(null, null);

  if (runner.last !== lastShown) {
    lastShown = runner.last;
    const l = runner.last, mk = $('mark');
    mk.hidden = l.type === '起';
    mk.style.left = pct(l.dt);
    const lab = { F: ['快', 'var(--fast)'], S: ['慢', 'var(--slow)'], '起': ['起手', 'var(--gold)'] }[l.type];
    $('lastIn').innerHTML = l.type === '起' ? `<span style="color:${lab[1]}">起手</span>` : `<span style="color:${lab[1]}">${lab[0]}</span> · ${l.dt < 0 ? '预输入 ' + Math.round(-l.dt * 1000) + 'ms' : '收招后 ' + Math.round(l.dt * 1000) + 'ms'}`;
  }

  $('qiFill').style.width = P.qi / P.qiMax * 100 + '%';
  $('qiTxt').textContent = `灵力 ${Math.floor(P.qi)} / ${P.qiMax}`;
  for (const el of slotEls) {
    const i = +el.dataset.slot, s = kit.skills[i], cdp = P.skillCd[i] / s.cd, ov = el.querySelector('i');
    el.classList.toggle('off', P.skillCd[i] > 0 || P.qi < s.qi);
    if (ov) ov.style.height = cdp * 100 + '%';
  }
  while (stats.log.length && stats.log[0].t < realTime - 5) stats.log.shift();
  $('sTotal').textContent = Math.round(stats.total);
  $('sDps').textContent = Math.round(stats.log.reduce((s, e) => s + e.amt, 0) / 5);
  $('sChain').textContent = stats.chainHits;
  $('sBest').textContent = stats.best;
  $('sKills').textContent = stats.kills;
  $('hits').textContent = stats.chainHits > 1 && runner.path !== null ? `${stats.chainHits} Hit` : '';
}

// ---------- 主循环 ----------
layout(3);
let last = performance.now(), realTime = 0, gameTime = 0, hitStop = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  realTime += raw;
  let dt = raw * opt.timeScale;
  if (hitStop > 0) { hitStop -= raw; dt *= 0.05; }
  gameTime += dt;
  updateAim();
  updatePlayer(dt);
  updateDummies(dt, gameTime);
  updateWaves(dt);
  updateBolts(dt); updateBlasts(dt);
  updateDbg(raw);
  fx.update(raw * opt.timeScale);
  cfx.update(raw * opt.timeScale);
  updateCamera(raw);
  updateBars(raw);
  updateUI();
  composer.render();
}
requestAnimationFrame(frame);

// 控制台调试：arena.click(); arena.step(0.3) 按固定步长推进，便于脚本化测试招式
window.arena = { sfx, cfx, touch, aim, mouse, setKit, useSkill, blasts, bolts,
  runner, stats, dummies, P,
  click: () => runner.click(),
  step(sec, h = 1 / 60) {
    for (let t = 0; t < sec; t += h) {
      realTime += h; gameTime += h; hitStop = 0;
      updateAim(); updatePlayer(h); updateDummies(h, gameTime); updateWaves(h); updateBolts(h); updateBlasts(h); updateDbg(h); fx.update(h); cfx.update(h);
    }
    updateCamera(1); updateBars(sec); updateUI(); composer.render();
  },
};
