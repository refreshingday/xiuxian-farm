import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, angDiff, lerpAngle, toon, mesh, at, setFlash, outlineMat, addOutline } from './util.js';
import { createChibi, animChibi } from './chibi.js';
import { FX } from './fx.js';
import { TUNE, ComboRunner } from './combo.js';
import { AIR_FX, AIR_SFX } from './comboAir.js';
import { KIT_FX, KIT_SFX, SKILL_FX } from './comboKitFx.js';
import { KITS, SKILL_KEYS, ELEM, KE } from './comboKit.js';
import { ComboFX } from './comboFx.js';
import { SFX } from './comboSfx.js';
import { TouchControls } from './touch.js';
import { animCombo } from './comboAnim.js';
import { HealthBar, screenOf } from './hpbar.js';

const MOVE_FX = { ...AIR_FX, ...KIT_FX }, MOVE_SFX = { ...AIR_SFX, ...KIT_SFX };
const rand = (a, b) => a + Math.random() * (b - a), TAU = Math.PI * 2;

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
  const d = { root, yaw, tilt, model, mats, pos: root.position, home: new THREE.Vector2(x, z), base: new THREE.Vector2(x, z), r: 0.55, vx: 0, vz: 0, vy: 0, ang: 0, angV: 0, flash: 0, stun: 0, airRot: 0, airSpin: 0, spiked: false, bumpT: 0, stuck: [], rootT: 0,
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
  for (const d of dummies) { clearStuck(d); scene.remove(d.root); for (const m of d.mats) m.dispose(); d.bar.remove(); }
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
  clearStuck(d, true); d.rootT = 0;
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
    if (d.rootT > 0) { d.rootT -= dt; d.vx = d.vz = 0; d.stun = Math.max(d.stun, 0.05); } // 缚符：定在原地
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
  qi: 100, qiMax: 100, qiPause: 0, atkCd: 0, skillCd: [0, 0, 0, 0], elem: opt.elem,
  leapFrom: new THREE.Vector2(), leapTo: new THREE.Vector2(), leapY0: 0, leapY1: 0, leapOn: false, motion: [], sweepHit: new Set(),
};
P.pos = P.c.root.position;
P.pos.set(1, 0, 0);
scene.add(P.c.root);
// 拳：双手一团拳劲光；符：右手夹着一张符（甩出去后一会儿再摸出一张）
const fistGlow = P.c.arms.map((A) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  A.hand.add(m); return m;
});
const handPaper = cfx.talisman('敕令', '#ffd27a', 0.6);
handPaper.g.position.set(0, -0.14, 0.03); P.c.arms[0].hand.add(handPaper.g);

// 当前武器（拳 / 剑 / 符）：决定连招树和技能槽，切换见 setKit
let kit = KITS[0];
const runner = new ComboRunner(TUNE, kit.moves, kit.tree);
runner.afford = (m) => { if (P.qi >= (m.qi || 0)) return true; P.atkCd = 0.7; return false; }; // 灵力不够就断回第一击，普攻冷却 0.7 秒
const click = () => { if (P.atkCd <= 0) runner.click(); };
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
      MOVE_FX[m.id]?.contact?.(fxCtx(m), d, h, idx);
    }
  } else if (h.shape === 'circle') {
    const cx = P.pos.x + f.x * h.at, cz = P.pos.z + f.y * h.at;
    debugCircle(cx, cz, h.r);
    if (P.pos.y < 0.5) fx.shockRing(cx, cz, h.r, color, 0.3);
    for (const d of live()) {
      if (!inReach(d) || Math.hypot(d.pos.x - cx, d.pos.z - cz) - d.r > h.r) continue;
      hitDummy(d, h.dmg, cx, cz, h.knock, color, h); hitAny = true;
      MOVE_FX[m.id]?.contact?.(fxCtx(m, cx, cz), d, h, idx);
    }
  } else if (h.shape === 'wave') {
    debugLine(P.pos.x, P.pos.z, P.yaw, h.len, h.w);
    waves.push({ x: P.pos.x + f.x * 0.8, z: P.pos.z + f.y * 0.8, yaw: P.yaw, left: h.len, h, color, hit: new Set(), m: spawnWaveMesh(color) });
  } else if (h.shape === 'bolt') {
    spawnBolt(P.pos.x + f.x * 0.8, P.pos.z + f.y * 0.8, P.yaw + (h.ang || 0), h, color);
    P.paperT = 0.2; // 手里那张符甩出去了，一会儿再摸出一张
  } else if (h.shape === 'trap') {
    const g0 = groundAt(h.at); placeBlast(g0.x, g0.z, h, color);
  } else if (h.shape === 'rain') {
    const g0 = groundAt(h.at);
    for (let k = 0; k < h.n; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * h.spread;
      placeBlast(g0.x + Math.cos(a) * rr, g0.z + Math.sin(a) * rr, { ...h, keep: false, delay: h.delay * (0.4 + Math.random() * 0.6) }, color);
    }
  } else if (h.shape === 'detonate') detonate(h, color);
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

// ---------- 符：飞符、贴身符、陷阱、引爆、护符 ----------
const bolts = [], blasts = [];
// 右手的世界坐标（符从手里甩出去）
const handPos = () => P.c.arms[0].hand.getWorldPosition(new THREE.Vector3());
// 定时：later(秒, fn)，按游戏时间走（慢放 / 顿帧时一起慢）
const timers = [];
const later = (t, fn) => timers.push({ t, fn });
function updateTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn(); }

// 飞符：一张旋转的符纸，h.home 弧度 / 秒拐弯追前方最近的木桩；h.chain = 打中后电弧跳到附近另一个
function spawnBolt(x, z, yaw, h, color) {
  const t = cfx.talisman(h.glyph || '敕', color, 1.4);
  t.g.position.set(x, 1.1, z); scene.add(t.g);
  bolts.push({ x, z, yaw, left: h.range, h, color, hit: new Set(), zapped: new Set(), t, spin: rand(0, TAU) });
}
function seekYaw(b, dt) {
  let best = null, bd = 9;
  for (const d of live()) {
    if (b.hit.has(d) || d.pos.y > 2) continue;
    const dx = d.pos.x - b.x, dz = d.pos.z - b.z, l = Math.hypot(dx, dz);
    if (l < bd && Math.abs(angDiff(Math.atan2(dx, dz), b.yaw)) < 0.9) { bd = l; best = d; }
  }
  if (best) b.yaw += clamp(angDiff(Math.atan2(best.pos.x - b.x, best.pos.z - b.z), b.yaw), -b.h.home * dt, b.h.home * dt);
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i], step = Math.min(b.left, b.h.spd * dt);
    if (b.h.home) seekYaw(b, dt);
    b.x += Math.sin(b.yaw) * step; b.z += Math.cos(b.yaw) * step; b.left -= step;
    b.spin += dt * 14;
    b.t.g.position.set(b.x, 1.1, b.z); b.t.g.rotation.y = b.yaw;
    b.t.paper.rotation.set(-Math.PI / 2 + 0.3, 0, b.spin);
    if (Math.random() < 0.7) fx.mote(b.x, 1.1, b.z, b.color, { life: 0.3, size: 0.7 });
    if (b.h.chain && Math.random() < 0.5) fx.mote(b.x + rand(-0.3, 0.3), 1.1 + rand(-0.2, 0.2), b.z + rand(-0.3, 0.3), '#ffffff', { life: 0.08, size: 0.5, bright: 3 });
    let done = b.left <= 0, stuck = false;
    for (const d of live()) {
      if (b.hit.has(d) || d.pos.y > 2 || Math.hypot(d.pos.x - b.x, d.pos.z - b.z) > d.r + 0.3) continue;
      b.hit.add(d); hitDummy(d, b.h.dmg, b.x - Math.sin(b.yaw), b.z - Math.cos(b.yaw), b.h.knock, b.color, b.h);
      fx.burst({ x: b.x, z: b.z }, b.color, 6, { speed: 3, up: 1.5, life: 0.25, y: 1.1 });
      if (b.h.chain) chainZap(d, b);
      if (!b.h.pierce) { if (!d.dead) { stick(d, b); stuck = true; } done = true; break; }
    }
    if (!done) continue;
    bolts.splice(i, 1);
    if (stuck) { scene.remove(b.t.g); b.t.gm.dispose(); } else { cfx.burn(b.t, b.color, 0.3); fx.burst({ x: b.x, z: b.z }, b.color, 6, { speed: 3, up: 2, life: 0.3, y: 1.1 }); }
  }
}
// 雷符：电弧跳到附近另一个木桩，打六成伤害
function chainZap(d0, b) {
  let best = null, bd = b.h.chain;
  for (const d of live()) {
    if (d === d0 || b.hit.has(d) || b.zapped.has(d)) continue;
    const l = Math.hypot(d.pos.x - d0.pos.x, d.pos.z - d0.pos.z);
    if (l < bd) { bd = l; best = d; }
  }
  if (!best) return;
  b.zapped.add(best);
  cfx.zap(new THREE.Vector3(d0.pos.x, d0.pos.y + 1.2, d0.pos.z), new THREE.Vector3(best.pos.x, best.pos.y + 1.2, best.pos.z), b.color, 0.35, 0.09);
  cfx.bolt(best.pos.x, best.pos.z, b.color, 3.5);
  hitDummy(best, b.h.dmg * 0.6, d0.pos.x, d0.pos.z, 3, b.color, {});
  if (sfx.ok) sfx.zap();
}

// 贴身符：打中就贴在木桩身上（朝飞来的那一面），最多 6 张，6 秒后自己烧掉；引爆时一起炸
const STUCK_MAX = 6, STUCK_LIFE = 6;
function stick(d, b) {
  if (d.stuck.length >= STUCK_MAX) dropStuck(d.stuck.shift());
  const t = cfx.talisman(b.h.glyph || '敕', b.color, 0.9), nx = -Math.sin(b.yaw), nz = -Math.cos(b.yaw);
  t.g.position.set(nx * 0.36, rand(1.0, 1.5), nz * 0.36); t.g.rotation.y = Math.atan2(nx, nz);
  t.paper.rotation.set(0, 0, rand(-0.5, 0.5));
  d.model.add(t.g);
  d.stuck.push({ t, life: STUCK_LIFE });
}
// 从木桩身上取下来放回场景（保持世界位置），交给 burn 烧掉
function unstick(s) {
  const g = s.t.g, v = g.getWorldPosition(new THREE.Vector3()), q = g.getWorldQuaternion(new THREE.Quaternion());
  g.parent?.remove(g); g.position.copy(v); g.quaternion.copy(q); g.visible = true;
  return s.t;
}
const dropStuck = (s) => cfx.burn(unstick(s), '#ff8a3a', 0.3);
function clearStuck(d, burn = false) {
  for (const s of d.stuck) if (burn) dropStuck(s); else { s.t.g.parent?.remove(s.t.g); s.t.gm.dispose(); }
  d.stuck.length = 0;
}
function updateStuck(dt) {
  for (const d of dummies) for (let i = d.stuck.length - 1; i >= 0; i--) {
    const s = d.stuck[i]; s.life -= dt;
    s.t.gm.opacity = 0.45 + 0.2 * Math.sin(s.life * 8);
    s.t.g.visible = s.life > 1 || Math.floor(s.life * 12) % 2 === 0; // 最后一秒闪
    if (s.life <= 0) { d.stuck.splice(i, 1); dropStuck(s); }
  }
}

// 陷阱符：mode = lob 从手里抛过去 | fall 从天上飘落 | seal 巨符压下来。落地处先亮法阵（预警），delay 秒后生效
// keep 的会一直埋着，有人踩进去或引爆才炸，6 秒后失效
function placeBlast(x, z, h, color) {
  const mode = h.mode || 'lob', seal = mode === 'seal', delay = h.delay ?? 0.2;
  const b = { x, z, h, color, mode, keep: !!h.keep, delay, t: 0, armed: false, landed: false, fuse: Infinity, mul: 1,
    fly: mode === 'lob' ? Math.min(delay, 0.45) : delay,
    from: mode === 'lob' ? handPos() : { x: x + (seal ? 0 : rand(-1.5, 1.5)), y: seal ? 10 : 9, z: z + (seal ? 0 : rand(-1.5, 1.5)) },
    sigil: cfx.sigil(color), paper: cfx.talisman(h.glyph || '敕', color, seal ? 6 : 1), rot: rand(0, TAU), dim: h.n ? 0.45 : 1 }; // 符雨一次落好几张，法阵叠在一起会太亮
  b.sigil.position.set(x, 0.05, z); b.sigil.scale.setScalar(h.r * 0.3); scene.add(b.sigil);
  b.paper.g.position.copy(b.from); scene.add(b.paper.g);
  blasts.push(b);
  return b;
}
const lerp = (a, b, k) => a + (b - a) * k;
function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i], h = b.h, p = b.paper.g.position, pp = b.paper.paper;
    b.t += dt;
    const k = clamp(b.t / b.fly, 0, 1), ka = clamp(b.t / b.delay, 0, 1);
    // 符纸飞行
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
    if (b.fuse <= 0 && b.t >= b.fly) { explode(b, b.mul); continue; } // 被引爆：落地就炸
    if (!b.armed && b.t >= b.delay) b.armed = true;
    if (!b.armed) continue;
    if (!b.keep) { explode(b); continue; }
    if (b.t > b.delay + 6) { fizzle(b); continue; }
    if (live().some((d) => d.pos.y < 1.5 && Math.hypot(d.pos.x - b.x, d.pos.z - b.z) - d.r < h.r)) explode(b);
    else if (Math.random() < 0.2) { const a = rand(0, TAU); fx.mote(b.x + Math.cos(a) * h.r, 0.2, b.z + Math.sin(a) * h.r, b.color, { life: 0.5, size: 0.6, vy: 0.8 }); }
  }
}
// 陷阱失效：符纸烧掉，法阵淡出
function fizzle(b) {
  blasts.splice(blasts.indexOf(b), 1);
  cfx.burn(b.paper, '#aaaaaa', 0.4);
  cfx.sigilFlare(b.sigil, 0.4, 1);
}
function explode(b, mul = 1) {
  const i = blasts.indexOf(b); if (i < 0) return;
  blasts.splice(i, 1);
  const h = b.h, x = b.x, z = b.z, seal = b.mode === 'seal';
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
  for (const d of live()) {
    if (Math.hypot(d.pos.x - x, d.pos.z - z) - d.r > h.r) continue;
    hitDummy(d, h.dmg * mul, x, z, h.knock, b.color, h);
    if (h.root && !d.dead) {
      d.rootT = h.root; d.vx = d.vz = 0;
      cfx.chains(() => d.pos, b.color, h.root);
      fx.num(d.pos, '定', '');
    }
  }
  hitFeel(h);
  if (sfx.ok) sfx.talisBoom(seal ? 1 : 0);
}
// 引爆：剑指连出灵光线，所有陷阱依次炸（还在飞的落地就炸），贴身符一起炸
function detonate(h, color) {
  const hp = handPos(), traps = blasts.filter((b) => b.keep).sort((a, b) => Math.hypot(a.x - hp.x, a.z - hp.z) - Math.hypot(b.x - hp.x, b.z - hp.z));
  traps.forEach((b, i) => { b.fuse = 0.05 + 0.06 * i; b.mul = h.mul; cfx.beam(hp.x, hp.z, b.x, b.z, color, { y: 0.9, delay: i * 0.03 }); });
  const marked = live().filter((d) => d.stuck.length);
  for (const d of marked) { cfx.beam(hp.x, hp.z, d.pos.x, d.pos.z, color, { y: 1.2 }); later(0.08, () => blowStuck(d, h, color)); }
  if (!traps.length && !marked.length) { fx.burst(hp, '#aaaaaa', 6, { speed: 2, up: 1, life: 0.3 }); fx.num(P.pos, '无符', ''); }
}
function blowStuck(d, h, color) {
  const n = d.stuck.length;
  if (!n || d.dead) return clearStuck(d, true);
  clearStuck(d, true);
  hitDummy(d, h.dmg * n, P.pos.x, P.pos.z, h.knock, color, { launch: 2 + n * 0.8 });
  fx.num(d.pos, '爆×' + n, 'crit'); fx.nums.at(-1).p.y += d.pos.y + 0.5;
  fx.burst(d.pos, '#ff8a5a', 10 + n * 4, { speed: 6, up: 4, life: 0.4, y: 1.2 });
  fx.burst(d.pos, '#fbe592', 4 + n * 2, { speed: 3, up: 5, life: 0.9, y: 1.2, grav: -3, drag: 1, bright: 1 });
  fx.shockRing(d.pos.x, d.pos.z, 1 + n * 0.2, color, 0.25);
  cfx.flash(d.pos.x, d.pos.z, '#ff8a5a', 16, 0.2);
  if (opt.stop) hitStop = Math.max(hitStop, 0.03 + n * 0.01);
  g.shake(0.15 + n * 0.05);
  if (sfx.ok) sfx.talisBoom(Math.min(1, n / 6));
}
// 护符：四张符绕身转 4 秒，碰到木桩就打（每个木桩 0.35 秒一次）
let guard = null;
function startGuard() {
  if (guard) for (const o of guard.list) cfx.burn(o.t);
  guard = { t: 0, dur: 4, cd: new Map(), list: [0, 1, 2, 3].map((i) => { const t = cfx.talisman('护', '#ffe7a8', 1.3); scene.add(t.g); return { t, a: i / 4 * TAU }; }) };
}
function updateGuard(dt) {
  if (!guard) return;
  guard.t += dt;
  const R = 1.4 * Math.min(1, guard.t / 0.2), left = guard.dur - guard.t;
  for (const o of guard.list) {
    const a = o.a + guard.t * 4, x = P.pos.x + Math.cos(a) * R, z = P.pos.z + Math.sin(a) * R;
    o.t.g.position.set(x, P.pos.y + 1 + Math.sin(guard.t * 3 + o.a) * 0.15, z); o.t.g.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    o.t.g.visible = left > 0.6 || Math.floor(left * 12) % 2 === 0;
    if (Math.random() < 0.3) fx.mote(x, P.pos.y + 1, z, '#ffe7a8', { life: 0.3, size: 0.6 });
    for (const d of live()) {
      if (Math.hypot(d.pos.x - x, d.pos.z - z) > d.r + 0.35 || Math.abs(d.pos.y - P.pos.y) > 1.5 || (guard.cd.get(d) ?? 0) > guard.t) continue;
      guard.cd.set(d, guard.t + 0.35);
      hitDummy(d, 5, P.pos.x, P.pos.z, 5, '#ffe7a8', {});
      fx.burst({ x, z }, '#ffe7a8', 6, { speed: 3, up: 1, life: 0.25, y: P.pos.y + 1 });
    }
  }
  if (left <= 0) { for (const o of guard.list) cfx.burn(o.t, '#ffd27a'); guard = null; }
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
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyJ') click(); });
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointermove', (e) => mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
// 松开鼠标才出招（按下只"上膛"，拖出画布再松开也算）
let armed = false;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0 && !touch.on) armed = true; });
addEventListener('pointerdown', () => sfx.unlock());
addEventListener('pointerup', (e) => { if (e.button === 0 && armed) { armed = false; click(); } });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('bReset').addEventListener('click', resetStats);
document.getElementById('weapon').addEventListener('click', () => cycleWeapon());
let layoutN = 3;
for (const b of document.querySelectorAll('#layoutBtns button')) b.addEventListener('click', () => layout(+b.dataset.n));

// ---------- 手机：左下摇杆移动，右下 斩 / 闪 / 换靶，自动瞄准最近的木桩 ----------
let foldAll = () => {};
const touch = new TouchControls();
touch.onChange = (on) => { armed = false; if (on) foldAll(); };
const tap = (fn) => ({ down: () => { sfx.unlock(); fn(); } });
touch.bind(document.getElementById('mAtk'), { down: () => sfx.unlock(), up: (c) => { if (!c) click(); } });
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
    ['拳风', 'fistWhoosh', () => sfx.fistWhoosh({ lead: 0.08 })],
    ['拳劲 · 小', 'airPop 0', () => sfx.airPop(0)],
    ['拳劲 · 大', 'airPop 1', () => sfx.airPop(1)],
    ['蹬地', 'stomp', () => sfx.stomp()],
    ['砸地', 'groundBoom', () => sfx.groundBoom(1)],
    ['金钟', 'bell', () => sfx.bell()],
    ['甩符', 'paper', () => sfx.paper(0.1)],
    ['掐诀', 'chant', () => sfx.chant(0.15)],
    ['符炸 · 小', 'talisBoom 0', () => sfx.talisBoom(0)],
    ['符炸 · 大', 'talisBoom 1', () => sfx.talisBoom(1)],
    ['雷符', 'zap', () => sfx.zap()],
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
  P.iframe -= dt; P.dashCd -= dt; P.atkCd -= dt; P.paperT -= dt;
  handPaper.g.visible = kit.id === 'talisman' && !(P.paperT > 0);
  for (const m of fistGlow) { m.visible = kit.id === 'fist'; m.material.opacity = 0.3 + 0.12 * Math.sin(realTime * 7); }
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
    vx = Math.sin(P.dashDir) * 22.1; vz = Math.cos(P.dashDir) * 22.1;
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
  if (P.skill) { P.skill.t += dt; if (m || P.skill.t > P.skill.m.cancel + 0.06) P.skill = null; }
  if (!m && P.skill) { m = P.skill.m; t = P.skill.t; }
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
  for (const m of fistGlow) m.visible = kit.id === 'fist';
  handPaper.g.visible = kit.id === 'talisman';
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
  ft_shock: () => {
    ring(3, 14, { knock: 8, stop: 0.05, shake: 0.45 }, '#ffe28a');
    SKILL_FX.ft_shock(fxCtx({ color: '#ffe28a' }));
    if (sfx.ok) sfx.groundBoom(1);
  },
  ft_bell: () => { // 金钟罩：1.2 秒无敌，罩下来时把贴身的木桩震开
    P.iframe = Math.max(P.iframe, 1.2);
    cfx.bell(() => P.pos, '#ffd27a', 1.6);
    cfx.flash(P.pos.x, P.pos.z, '#ffd27a', 20, 0.4, 1.2);
    SKILL_FX.ft_bell(fxCtx({ color: '#ffd27a' }));
    later(0.1, () => ring(2.2, 6, { knock: 9, stop: 0.03, shake: 0.25 }, '#ffd27a'));
    if (sfx.ok) sfx.bell();
  },
  ft_charge: () => { // 撞山：冲出去，冲到一半撞
    P.dashT = 0.22; P.dashDir = P.yaw; P.iframe = Math.max(P.iframe, 0.3);
    if (sfx.ok) { sfx.stomp(); sfx.fistWhoosh({ lead: 0.1, size: 1.4, pitch: 0.75 }); }
    later(0.12, () => {
      const f = fwd(), x = P.pos.x + f.x * 1.2, z = P.pos.z + f.y * 1.2;
      ring(2.4, 18, { knock: 10, launch: 2, stop: 0.06, shake: 0.4 }, '#ffb84a', x, z);
      SKILL_FX.ft_charge(fxCtx({ color: '#ffb84a' }, x, z));
      if (sfx.ok) { sfx.airPop(1); sfx.groundBoom(0); }
    });
  },
  tl_nova: () => { // 符爆：脚下开阵，八张符往四面八方飞（打中就贴上，可以接引爆）
    const s = cfx.sigil('#ffd27a'); s.position.set(P.pos.x, 0.05, P.pos.z); s.scale.setScalar(1.6); s.material.opacity = 0.8;
    cfx.sigilFlare(s, 0.5, 2.2);
    for (let i = 0; i < 8; i++) {
      const a = P.yaw + i / 8 * TAU;
      spawnBolt(P.pos.x + Math.sin(a) * 0.6, P.pos.z + Math.cos(a) * 0.6, a, { spd: 18, range: 5.5, dmg: 12, knock: 7, home: 0, glyph: '爆' }, '#ffd27a');
    }
    fx.shockRing(P.pos.x, P.pos.z, 2, '#ffd27a', 0.3);
    if (sfx.ok) { sfx.paper(0.02); sfx.talisBoom(0); }
  },
  tl_guard: () => {
    P.iframe = Math.max(P.iframe, 0.5);
    startGuard();
    cfx.flash(P.pos.x, P.pos.z, '#fff3c0', 20, 0.4, 1.2); fx.shockRing(P.pos.x, P.pos.z, 1.8, '#fff3c0', 0.35);
    if (sfx.ok) sfx.chant(0.02);
  },
  tl_put: () => {
    const g0 = groundAt(3);
    placeBlast(g0.x, g0.z, { r: 2.2, dmg: 20, knock: 10, launch: 3, keep: true, delay: 0.5, glyph: '火' }, '#ffb84a');
    if (sfx.ok) sfx.paper(0.02);
  },
  qi: () => { P.qi = Math.min(P.qiMax, P.qi + 40); },
};
function useSkill(i) {
  const s = kit.skills[i];
  if (!s || P.skillCd[i] > 0 || P.qi < s.qi) return;
  P.qi -= s.qi; P.qiPause = 0.4; P.skillCd[i] = s.cd;
  P.yaw = aimYaw();
  if (runner.path !== null) { runner.cancel(); showMove(null); }
  // 先摆技能动作，出手那一刻才生效
  P.skill = { m: { pose: s.pose, hits: [{ t: s.ht }], cancel: 0.32, dur: 0.4 }, t: 0 };
  later(s.ht, SKILLS[s.id]);
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
  updateBolts(dt); updateBlasts(dt); updateStuck(dt); updateGuard(dt); updateTimers(dt);
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
window.arena = { sfx, cfx, touch, aim, mouse, setKit, useSkill, blasts, bolts, KITS, guard: () => guard, placeBlast,
  runner, stats, dummies, P,
  click,
  step(sec, h = 1 / 60) {
    for (let t = 0; t < sec; t += h) {
      realTime += h; gameTime += h; hitStop = 0;
      updateAim(); updatePlayer(h); updateDummies(h, gameTime); updateWaves(h); updateBolts(h); updateBlasts(h); updateStuck(h); updateGuard(h); updateTimers(h); updateDbg(h); fx.update(h); cfx.update(h);
    }
    updateCamera(1); updateBars(sec); updateUI(); composer.render();
  },
};
