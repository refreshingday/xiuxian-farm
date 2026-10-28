import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadTextures, weatherU, CHUNK, occ, clamp, lerp, smooth, angDiff, lerpAngle, mulberry32, flat, glow, mesh } from './util.js';
import { createChibi, animChibi } from './chibi.js';
import { Weather } from './weather.js';
import { World, VILLAGE_R, MINE, MINE_R, ARENA, regionName, dangerAt, roadDist } from './world.js';
import { FX } from './fx.js';
import { Enemies } from './enemies.js';
import { populateVillage, realmText } from './npc.js';
import { TUNE, MOVES, TREE, ComboRunner } from './combo.js';
import { ComboFX, MOVE_FX } from './comboFx.js';
import { SFX, MOVE_SFX } from './comboSfx.js';
import { animCombo } from './comboAnim.js';
import { HealthBar, screenOf } from './hpbar.js';
import { TouchControls } from './touch.js';

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
scene.fog = new THREE.Fog(0xcfe6f0, 30, 60);
scene.background = new THREE.Color(0xcfe6f0);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 140);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// 调色：提饱和、暖色偏移、轻暗角（贴近参考图的温暖像素风）
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.12 }, uWarm: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform float uWarm; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.92), uWarm);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
      vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.45;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(grade);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------- 光照 ----------
const hemi = new THREE.HemisphereLight(0xd8ecff, 0x9a8a50, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
// 光源池：固定 8 盏点光，每帧分配给离玩家最近的灯笼/火把/晶石（shader 不重编译）
const pool = [];
for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffaa66, 0, 13, 1.6); scene.add(l); pool.push(l); }
const aura = new THREE.PointLight(0x9fdcff, 0, 9, 1.4); scene.add(aura);

const KEYS = [ // 时, 日光色, 日光强度, 天空色, 地面色, 环境强度, 雾色
  [0, 0x7f98ff, 0.35, 0x1c2648, 0x141a24, 0.45, 0x0d1224],
  [4.5, 0x7f98ff, 0.35, 0x1c2648, 0x141a24, 0.45, 0x0d1224],
  [6, 0xffb27a, 1.6, 0xb0b8d8, 0x7a7448, 0.85, 0xd8c8b8],
  [8, 0xffe0b0, 2.5, 0xd0e4ff, 0x9a8a50, 1.05, 0xd8e8d0],
  [12, 0xfff0d8, 2.8, 0xd8ecff, 0x9a8a50, 1.1, 0xdcecd8],
  [16.5, 0xffd49a, 2.5, 0xd0e0f8, 0x9a8a50, 1.0, 0xe4e0c8],
  [18.5, 0xff7a4a, 1.1, 0x8a6a8a, 0x4a3a3a, 0.6, 0xd08a6a],
  [20, 0x7f98ff, 0.4, 0x2a3058, 0x1a1a24, 0.45, 0x1a1e38],
  [24, 0x7f98ff, 0.35, 0x1c2648, 0x141a24, 0.45, 0x0d1224],
];
const _ca = new THREE.Color(), _cb = new THREE.Color(), MINE_FOG = new THREE.Color(0x07060c);
function sample(h, idx, out) {
  let i = 0; while (KEYS[i + 1][0] < h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = (h - a[0]) / (b[0] - a[0]);
  if (out) return out.copy(_ca.setHex(a[idx])).lerp(_cb.setHex(b[idx]), t);
  return lerp(a[idx], b[idx], t);
}

// ---------- 游戏状态 ----------
const DAY_SEC = 480;
const g = {
  scene, camera, time: 0, hours: 7, day: 1, nightK: 0, scheduled: [],
  after(sec, fn) { this.scheduled.push({ t: this.time + sec, fn }); },
  shakeV: 0, shake(v) { this.shakeV = Math.max(this.shakeV, v); },
  toast(msg, sec = 2.2) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), sec * 1000); },
};
const fx = new FX(scene, camera); g.fx = fx;
const cfx = new ComboFX(scene, fx, { soft: true });
const sfx = new SFX(); g.sfx = sfx;
await loadTextures({
  grass_ground: { normal: 2 }, dirt_path: { normal: 2.5 }, stone_plaza: {},
  roof_tiles: { norm: 0.88, rep: 0.5 }, wood_planks: { norm: 0.88, rep: 0.5 },
  cliff_rock: { norm: 0.9 }, foliage: { norm: 0.88 }, peach_foliage: { norm: 0.88 },
  leaf_cards: { norm: 0.9, key: true }, grass_blades: { norm: 0.9, key: true }, blossom_cards: { norm: 0.9, key: true },
});
const world = new World(scene); g.world = world;
const enemies = new Enemies(g); g.enemies = enemies;
const weather = new Weather(scene); g.weather = weather;

// ---------- 玩家 ----------
const P = {
  c: createChibi({ skin: '#f8d8bc', hair: '#4a2e22', hairStyle: 2, robe: '#f2f4f6', robe2: '#4f7fb0', belt: '#3a5a78', pants: '#3a4250', sword: true }),
  r: 0.4, yaw: 0, vel: new THREE.Vector3(), kx: 0, kz: 0,
  hp: 100, maxHp: 100, qi: 100, maxQi: 100, layer: 1, xp: 0, grade: 2,
  cast: 0, spin: 0, work: 0,
  dashT: 0, dashCd: 0, dashDir: 0, iframe: 0, qiCd: 0, spinCd: 0, pillCd: 0,
  inv: { herb: 3, core: 0, stone: 0, heart: 0 }, dead: false,
  leapFrom: new THREE.Vector2(), leapTo: new THREE.Vector2(), sweepHit: new Set(), ghostT: 0,
};
P.pos = P.c.root.position;
P.pos.set(0, 0, 4);
scene.add(P.c.root);
g.player = P;

const xpNeed = () => 40 + P.layer * 30;
const swordDmg = () => 10 + P.layer * 2.5;

P.hurt = (dmg, fx0, fz0, knock = 6) => {
  if (P.iframe > 0 || P.dead) return false;
  dmg = Math.round(dmg);
  P.hp -= dmg; P.iframe = 0.6; P.c.flash = 0.12;
  const dx = P.pos.x - fx0, dz = P.pos.z - fz0, d = Math.hypot(dx, dz) || 1;
  P.kx += dx / d * knock; P.kz += dz / d * knock;
  fx.num(P.pos, '-' + dmg, 'hurt');
  fx.burst(P.pos, '#ff6a5a', 8, { speed: 4, life: 0.3 });
  sfx.impact({ heavy: 0.6 });
  g.shake(0.35);
  const h = document.getElementById('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
  if (P.hp <= 0) die();
  return true;
};
function die() {
  P.dead = true; P.hp = 0;
  document.getElementById('dead').classList.remove('hidden');
  fx.burst(P.pos, '#ffffff', 30, { speed: 5, up: 4 });
  P.c.root.visible = false;
  g.after(2.8, () => {
    P.dead = false; P.hp = P.maxHp; P.qi = P.maxQi; P.pos.set(-15, 0, -3.5); P.c.root.visible = true; P.iframe = 2;
    document.getElementById('dead').classList.add('hidden');
    g.toast('你在家中醒来，伤势已愈');
  });
}
g.addXP = (n, p) => {
  if (P.layer >= 9) { fx.num(p, '修为已满', 'xp'); return; }
  P.xp += n; fx.num({ x: p.x + 0.6, z: p.z }, `+${Math.round(n)} 修为`, 'xp');
  while (P.xp >= xpNeed() && P.layer < 9) {
    P.xp -= xpNeed(); P.layer++;
    P.maxHp += 12; P.maxQi += 8; P.hp = P.maxHp; P.qi = P.maxQi;
    fx.burst(P.pos, '#9ef0ff', 50, { speed: 3, up: 6, life: 1.2, grav: -2 });
    fx.shockRing(P.pos.x, P.pos.z, 5, '#9ef0ff', 0.6);
    g.toast(P.layer === 9 ? '炼气圆满！需渡天劫方可筑基（未实装）' : `突破！${realmText(1, P.layer)}`, 3);
  }
};
const ITEM = { herb: '灵草', core: '妖丹', stone: '灵石', heart: '赤岩之心' };
g.addItem = (k, n, p) => { P.inv[k] += n; fx.num({ x: p.x - 0.6, z: p.z }, `+${n} ${ITEM[k]}`, 'item'); };

// ---------- 村民 ----------
const npcs = populateVillage(g, mulberry32(20261027));
g.npcs = npcs;

// ---------- 刷怪 ----------
const okSpawn = (x, z) => Math.hypot(x, z) > VILLAGE_R + 8 && Math.hypot(x - MINE.x, z - MINE.y) > MINE_R + 6 && roadDist(x, z) > 2;
world.onSpawn = (cx, cz, rng) => {
  if (g.time < 1) return;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const n = Math.floor(1 + rng() * 2 + g.nightK * 2 + dangerAt(x0 + 16, z0 + 16) * 0.3);
  for (let i = 0; i < n; i++) {
    const x = x0 + 4 + rng() * 24, z = z0 + 4 + rng() * 24;
    if (!okSpawn(x, z) || Math.hypot(x - P.pos.x, z - P.pos.z) < 16) continue;
    enemies.spawn(rng() < 0.6 ? 'boar' : 'spider', x, z, Math.floor(dangerAt(x, z)));
  }
};
let spawnT = 6, golemT = 0;
function ambientSpawns(dt) {
  spawnT -= dt; golemT -= dt;
  const near = enemies.list.filter((e) => e.type !== 'golem' && e.type !== 'boss' && e.pos.distanceTo(P.pos) < 35).length;
  if (spawnT <= 0) {
    spawnT = 4 - g.nightK * 2;
    if (near < 7 + g.nightK * 5 && !P.dead) {
      const a = Math.random() * 6.28, r = 24 + Math.random() * 6;
      const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
      if (okSpawn(x, z)) enemies.spawn(Math.random() < 0.6 ? 'boar' : 'spider', x, z, Math.floor(dangerAt(x, z)));
    }
  }
  const dm = Math.hypot(P.pos.x - MINE.x, P.pos.z - MINE.y);
  if (golemT <= 0 && dm < MINE_R + 25) {
    golemT = 7;
    const golems = enemies.list.filter((e) => e.type === 'golem').length;
    if (golems < 9) {
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.28, r = 3 + Math.random() * (MINE_R - 6);
        const x = MINE.x + Math.cos(a) * r, z = MINE.y + Math.sin(a) * r;
        if (Math.hypot(x - P.pos.x, z - P.pos.z) > 12 && Math.hypot(x - ARENA.x, z - ARENA.y) > 10) { enemies.spawn('golem', x, z, 1); break; }
      }
    }
  }
}

// ---------- 输入 ----------
const keys = new Set();
const mouse = new THREE.Vector2(), mouseDown = [false, false, false];
const aim = new THREE.Vector3();
let camYaw = 0, camYawT = 0;
addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (e.code === 'KeyF') interact();
  if (e.code === 'Escape') closeDialog();
  if (e.code === 'KeyR') g.toast(weather.toggle() ? '下雨了' : '雨停了');
  if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
  if (e.code === 'Digit1') spinSkill();
  if (e.code === 'Digit2') eatHerb();
  if (e.code === 'Space' || e.code === 'ShiftLeft') dash();
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseDown.fill(false); });
renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
// 左键松开才出招（按下只"上膛"）；按下时若在对话中，这次点击只用来关对话框
let armed = false;
renderer.domElement.addEventListener('pointerdown', (e) => { sfx.unlock(); closeDialog(); if (e.pointerType === 'touch') return; mouseDown[e.button] = true; if (e.button === 0) armed = !dialogOpen; });
addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') return; mouseDown[e.button] = false; if (e.button === 0 && armed) { armed = false; attackClick(); } });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('dialog').addEventListener('pointerdown', closeDialog);

// 手机模式：摇杆 + 按钮（与电脑操作并存，按最近使用的输入自动切换）
const touch = new TouchControls();
touch.onChange = () => { mouseDown.fill(false); armed = false; };
const tap = (fn) => ({ down: () => { sfx.unlock(); fn(); } });
touch.bind(document.getElementById('sk0'), { down: () => { sfx.unlock(); mouseDown[0] = true; }, up: (c) => { mouseDown[0] = false; if (!c) attackClick(); } });
touch.bind(document.getElementById('sk1'), { down: () => { sfx.unlock(); mouseDown[2] = true; }, up: () => { mouseDown[2] = false; } });
touch.bind(document.getElementById('sk2'), tap(spinSkill));
touch.bind(document.getElementById('sk3'), tap(eatHerb));
touch.bind(document.getElementById('sk4'), tap(dash));
touch.bind(document.getElementById('prompt'), tap(interact));
touch.bind(document.getElementById('mobTime'), { hold: 'time' });
touch.drag(renderer.domElement, (dx) => { camYawT -= dx * 0.006; });

const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateAim() {
  if (!touch.on) { ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(ground, aim); return; }
  // 手机：自动瞄准附近最近的敌人，没有就朝移动 / 面朝方向
  let best = null, bd = 9;
  for (const e of enemies.list) { const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - e.r; if (d < bd) { bd = d; best = e; } }
  if (best) { aim.set(best.pos.x, 0, best.pos.z); return; }
  const mv = moveInput(), yaw = mv.lengthSq() > 0 ? Math.atan2(mv.x, mv.y) : P.yaw;
  aim.set(P.pos.x + Math.sin(yaw) * 4, 0, P.pos.z + Math.cos(yaw) * 4);
}
const aimYaw = () => Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);

// ---------- 战斗动作 ----------
function busy() { return P.dead || !!runner.move || P.cast > 0 || P.spin > 0 || P.work > 0; }

// 普攻连招（在试炼场 arena.html 打磨，数据见 combo.js）
const runner = new ComboRunner(TUNE);
const fwd = () => new THREE.Vector2(Math.sin(P.yaw), Math.cos(P.yaw));
const fxCtx = (m, cx, cz) => ({ cfx, fx, x: P.pos.x, z: P.pos.z, yaw: P.yaw, fx0: Math.sin(P.yaw), fz0: Math.cos(P.yaw), color: m.color || '#9ef0ff', cx, cz, getPos: () => P.pos });
function attackClick() {
  if (P.dead || dialogOpen || P.dashT > 0 || P.cast > 0 || P.spin > 0 || P.work > 0) return;
  runner.click();
}
function cancelCombo() { if (runner.path !== null) runner.cancel(); showMove(null); }
// 招式伤害按 斩·一=10 设计，随境界放大
function hitEnemy(e, dmg, fromX, fromZ, knock) {
  const crit = Math.random() < 0.12;
  enemies.damage(e, dmg * swordDmg() / 10 * (crit ? 1.8 : 1), fromX, fromZ, knock, crit);
}
function hitFeel(h) {
  if (h.stop) hitStop = Math.max(hitStop, h.stop);
  g.shake(h.shake ?? 0.15);
}

runner.on.start = (m, path, type) => {
  P.yaw = aimYaw();
  P.iframe = Math.max(P.iframe, m.iframe || 0);
  P.sweepHit.clear();
  if (m.leap) {
    const L = m.leap, f = fwd();
    P.leapFrom.set(P.pos.x, P.pos.z);
    let dist = L.dist ?? 0;
    if (L.to === 'aim') dist = Math.min(L.max, Math.hypot(aim.x - P.pos.x, aim.z - P.pos.z));
    P.leapTo.set(P.pos.x + f.x * dist, P.pos.z + f.y * dist);
    fx.circle(P.leapTo.x, P.leapTo.y, m.hits[0].r, L.t1 - L.t0);
  }
  if (m.pose === 'dash') fx.burst(P.pos, '#9ef0ff', 14, { speed: 6, up: 1, life: 0.3 });
  MOVE_FX[m.id]?.start?.(fxCtx(m, P.leapTo.x, P.leapTo.y), m);
  if (sfx.ok) { sfx.tick(type); MOVE_SFX[m.id]?.start?.(sfx, m, m.hits[0]?.t ?? 0.15); }
  P.ghostT = 0;
  showMove(m);
};

runner.on.hit = (m, h, idx) => {
  const f = fwd(), color = m.color || '#9ef0ff';
  let hitAny = false;
  if (h.shape === 'arc') {
    const inArc = (x, z, r) => Math.hypot(x - P.pos.x, z - P.pos.z) - r <= h.range && Math.abs(angDiff(Math.atan2(x - P.pos.x, z - P.pos.z), P.yaw)) <= h.arc;
    for (const e of [...enemies.list]) if (inArc(e.pos.x, e.pos.z, e.r)) { hitEnemy(e, h.dmg, P.pos.x, P.pos.z, h.knock); hitAny = true; }
    for (const o of world.ores) {
      if (!o.alive || !inArc(o.x, o.z, o.r)) continue;
      o.hp--; hitAny = true;
      fx.burst({ x: o.x, z: o.z }, '#ffd36b', 8, { speed: 4, life: 0.4 });
      if (o.hp <= 0) { o.alive = false; o.group.visible = false; o.col.off = true; o.respawn = 90; g.addItem('stone', 1 + Math.floor(Math.random() * 2), o); }
    }
  } else if (h.shape === 'circle') {
    const cx = P.pos.x + f.x * h.at, cz = P.pos.z + f.y * h.at;
    fx.shockRing(cx, cz, h.r, color, 0.3);
    for (const e of [...enemies.list]) if (Math.hypot(e.pos.x - cx, e.pos.z - cz) - e.r <= h.r) { hitEnemy(e, h.dmg, cx, cz, h.knock); hitAny = true; }
  } else if (h.shape === 'wave') {
    waves.push({ x: P.pos.x + f.x * 0.8, z: P.pos.z + f.y * 0.8, yaw: P.yaw, left: h.len, h, color, hit: new Set(), m: spawnWaveMesh(color) });
  }
  MOVE_FX[m.id]?.hit?.(fxCtx(m, P.pos.x + f.x * (h.at || 0), P.pos.z + f.y * (h.at || 0)), h, idx);
  if (sfx.ok) MOVE_SFX[m.id]?.hit?.(sfx, h, idx, m);
  if (hitAny || h.shape !== 'arc') hitFeel(h);
};

// 剑气（疾风·终）
const waves = [];
function spawnWaveMesh(color) {
  const mk = (c, k) => new THREE.Mesh(fx.crescentGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const w = new THREE.Group(), a = mk(color, 3), b = mk('#ffffff', 2.5), c = mk(color, 2);
  a.scale.setScalar(1.6); b.scale.setScalar(1.25); c.scale.set(1.9, 1, 1.1); c.position.set(0, 0, -0.5);
  w.add(a, b, c); scene.add(w);
  w.setOpacity = (v) => { a.material.opacity = v; b.material.opacity = v; c.material.opacity = v * 0.5; };
  w.dispose = () => { for (const o of [a, b, c]) o.material.dispose(); };
  return w;
}
function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i], step = Math.min(w.left, 20 * dt);
    w.x += Math.sin(w.yaw) * step; w.z += Math.cos(w.yaw) * step; w.left -= step;
    w.m.position.set(w.x, 1, w.z); w.m.rotation.y = w.yaw;
    w.m.setOpacity(Math.min(1, w.left * 0.6));
    w.age = (w.age || 0) + dt;
    for (const sd of [-1, 1]) {
      const o = Math.sin(w.age * 30 + sd * 1.6) * 1.1 * sd;
      fx.mote(w.x + Math.cos(w.yaw) * o, 1 + Math.cos(w.age * 30) * 0.4, w.z - Math.sin(w.yaw) * o, w.color, { life: 0.35, size: 0.8 });
    }
    for (const e of [...enemies.list]) {
      if (w.hit.has(e) || Math.hypot(e.pos.x - w.x, e.pos.z - w.z) > e.r + w.h.w * 0.6) continue;
      w.hit.add(e); hitEnemy(e, w.h.dmg, w.x - Math.sin(w.yaw), w.z - Math.cos(w.yaw), w.h.knock);
      cfx.arc(e.pos, w.yaw, w.color, { tilt: 0.7, scale: 0.6, y: 1.2, dur: 0.18 });
    }
    if (w.left <= 0) { fx.burst({ x: w.x, z: w.z }, w.color, 14, { speed: 5, up: 2, life: 0.35, y: 1 }); scene.remove(w.m); w.m.dispose(); waves.splice(i, 1); }
  }
}

const comboEl = document.getElementById('comboName');
function showMove(m) { comboEl.innerHTML = m ? `${m.name}<small>第${runner.chain}式</small>` : ''; }

const projs = [];
function qiSlash() {
  if (P.qi < 15 || P.qiCd > 0 || busy()) return;
  P.qi -= 15; P.qiCd = 0.35; P.cast = 0.25; P.yaw = aimYaw();
  sfx.swing({ lead: 0.05, pitch: 1.3, size: 0.8 });
  const m = new THREE.Mesh(fx.crescentGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ef0ff').multiplyScalar(3), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.position.set(P.pos.x + Math.sin(P.yaw) * 0.8, 1.0, P.pos.z + Math.cos(P.yaw) * 0.8); m.rotation.y = P.yaw;
  scene.add(m);
  projs.push({ m, vx: Math.sin(P.yaw) * 22, vz: Math.cos(P.yaw) * 22, life: 0.75, hit: new Set(), dmg: 12 + P.layer * 2.5 });
}
function spinSkill() {
  if (P.qi < 30 || P.spinCd > 0 || P.dead) return;
  P.qi -= 30; P.spinCd = 3; P.spin = 0.001; cancelCombo();
  sfx.spin(0);
  fx.shockRing(P.pos.x, P.pos.z, 3.6, '#9ef0ff', 0.35);
  fx.burst(P.pos, '#9ef0ff', 30, { speed: 8, up: 1, life: 0.4, y: 1 });
  for (const e of [...enemies.list]) if (e.pos.distanceTo(P.pos) - e.r < 3.4) enemies.damage(e, 16 + P.layer * 3, P.pos.x, P.pos.z, 12);
  hitStop = 0.06; g.shake(0.4);
}
function eatHerb() {
  if (P.inv.herb <= 0 || P.pillCd > 0 || P.dead) { if (P.inv.herb <= 0) g.toast('没有灵草了——去田里种，或在野外采集'); return; }
  P.inv.herb--; P.pillCd = 1;
  P.hp = Math.min(P.maxHp, P.hp + 30); P.qi = Math.min(P.maxQi, P.qi + 30);
  fx.burst(P.pos, '#7dffb0', 20, { speed: 2, up: 4, life: 0.8, grav: -1 });
  fx.num(P.pos, '+30', 'heal');
}
function dash() {
  if (P.dashCd > 0 || P.dead) return;
  const mv = moveInput();
  P.dashDir = mv.lengthSq() > 0 ? Math.atan2(mv.x, mv.y) : P.yaw;
  P.dashT = 0.18; P.dashCd = 0.55; P.iframe = Math.max(P.iframe, 0.25);
  cancelCombo(); sfx.dash();
}
function moveInput() {
  const ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.stick.x;
  const iy = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.stick.y;
  const v = new THREE.Vector2(ix * Math.cos(camYaw) - iy * Math.sin(camYaw), -ix * Math.sin(camYaw) - iy * Math.cos(camYaw));
  if (v.lengthSq() > 1) v.normalize();
  return v;
}

// ---------- 交互（F） ----------
let dialogOpen = false;
function findInteract() {
  let best = null, bd = 2.2;
  for (const n of npcs) { const d = n.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = { kind: 'npc', n, label: `交谈 · ${n.d.name}` }; } }
  if (best) return best;
  const cx = Math.floor(P.pos.x / CHUNK), cz = Math.floor(P.pos.z / CHUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const ch = world.chunks.get(`${cx + dx},${cz + dz}`); if (!ch) continue;
    for (const h of ch.herbs) if (Math.hypot(h.x - P.pos.x, h.z - P.pos.z) < 1.6) return { kind: 'herb', ch, h, label: '采集 · 野生灵草' };
  }
  const fx0 = P.pos.x + Math.sin(P.yaw) * 0.9, fz0 = P.pos.z + Math.cos(P.yaw) * 0.9;
  const t = world.farmTileAt(fx0, fz0) || world.farmTileAt(P.pos.x, P.pos.z);
  if (t) {
    if (t.state === 0) return { kind: 'farm', t, label: '开垦' };
    if (t.state === 1) return { kind: 'farm', t, label: '播种 · 灵草种子' };
    if (t.stage >= 2) return { kind: 'farm', t, label: '收获 · 灵草' };
    return { kind: 'none', label: `灵草生长中…（${Math.round((t.stage * 2.5 + t.grow) / 5 * 100)}%）` };
  }
  return null;
}
function interact() {
  if (dialogOpen) { closeDialog(); return; }
  const it = findInteract(); if (!it || P.dead) return;
  if (it.kind === 'npc') openDialog(it.n.talk(P.grade));
  if (it.kind === 'herb') { world.pickHerb(it.ch, it.h); g.addItem('herb', 1, P.pos); }
  if (it.kind === 'farm') {
    const t = it.t; P.work = 0.001;
    if (t.state === 0) t.state = 1;
    else if (t.state === 1) { t.state = 2; t.stage = 0; t.grow = 0; }
    else if (t.stage >= 2) { t.state = 1; g.addItem('herb', 1 + (Math.random() < 0.35 ? 1 : 0), { x: t.x, z: t.z }); }
    fx.burst({ x: t.x, z: t.z }, '#c8a070', 8, { speed: 2, y: 0.1, bright: 0.8 });
  }
}
function openDialog(d) {
  dialogOpen = true;
  const el = document.getElementById('dialog');
  el.querySelector('.dname').textContent = d.name;
  el.querySelector('.dsub').textContent = d.sub;
  el.querySelector('.dline').textContent = '「' + d.line + '」';
  el.querySelector('.dinfo').textContent = d.info;
  el.querySelector('.dhint').textContent = d.hint;
  el.classList.remove('hidden');
  document.body.classList.add('talking');
}
function closeDialog() { dialogOpen = false; document.getElementById('dialog').classList.add('hidden'); document.body.classList.remove('talking'); }

// ---------- 主循环 ----------
let hitStop = 0, last = performance.now();
const focus = new THREE.Vector3().copy(P.pos);
const ui = Object.fromEntries(['hpFill', 'hpText', 'qiFill', 'qiText', 'xpFill', 'realm', 'timeText', 'regionText', 'invHerb', 'invCore', 'invStone', 'invHeart', 'prompt', 'sk1', 'sk2', 'sk3', 'sk4'].map((k) => [k, document.getElementById(k)]));
const SEASONS = ['春', '夏', '秋', '冬'];

world.update(P.pos, 0, 0, g.day * 24 + g.hours, true);
document.getElementById('loading').classList.add('hidden');

// ---------- 血条：头顶小血条 + 顶部目标大血条（与试炼场同一套 hpbar.js） ----------
const hpLayer = document.getElementById('hpLayer');
const targetBar = new HealthBar({ parent: document.body, big: true, max: 1 });
const BAR_Y = { boar: 1.7, spider: 1.4, golem: 2.7 };
const fadingBars = [];
let focusE = null, focusT = 0;
const enemyName = (e) => e.type === 'boss' ? `赤岩妖王${e.phase === 2 ? ' · 狂暴' : ''}` : e.T.name;
function focusOn(e, hp) { focusE = e; targetBar.dead = false; targetBar.snap(hp, e.maxHp, enemyName(e)); }
g.onEnemyHit = (e, amt, crit) => {
  if (e.type !== 'boss') {
    e.bar ??= new HealthBar({ parent: hpLayer, max: e.maxHp });
    e.bar.hp = e.hp + amt; e.bar.damage(amt, crit);
  }
  if (enemies.boss && e !== enemies.boss) return;   // 妖王在场时大血条只跟妖王
  if (focusE !== e) focusOn(e, e.hp + amt);
  targetBar.damage(amt, crit); focusT = 5;
};
g.onEnemyGone = (e) => {
  const dead = e.hp <= 0;
  if (e.bar) {
    if (dead) { e.bar.hp = 0; e.bar.die(); fadingBars.push({ bar: e.bar, x: e.pos.x, y: BAR_Y[e.type] ?? 2, z: e.pos.z, t: 0.9 }); }
    else e.bar.remove();
    e.bar = null;
  }
  if (focusE === e) { if (dead) { targetBar.die(); focusT = Math.min(focusT, 1.2); } else focusE = null; }
};
function placeBar(bar, dt, x, y, z) {
  bar.update(dt);
  const [sx, sy, front] = screenOf(camera, x, y, z);
  bar.place(sx, sy);
  if (!front) bar.el.style.visibility = 'hidden';
}
function updateHpBars(dt) {
  for (const e of enemies.list) if (e.bar) placeBar(e.bar, dt, e.pos.x, BAR_Y[e.type] ?? 2, e.pos.z);
  for (let i = fadingBars.length - 1; i >= 0; i--) {
    const f = fadingBars[i]; f.t -= dt; placeBar(f.bar, dt, f.x, f.y, f.z);
    f.bar.el.style.opacity = Math.min(1, f.t / 0.4).toFixed(3);
    if (f.t <= 0) { f.bar.remove(); fadingBars.splice(i, 1); }
  }
  const boss = enemies.boss;
  if (boss && focusE !== boss) focusOn(boss, boss.hp);
  if (focusE && focusE !== boss) focusT -= dt;
  const show = focusE && (focusE === boss || focusT > 0);
  targetBar.el.style.display = show ? '' : 'none';
  if (!show) { focusE = null; return; }
  if (focusE === boss) targetBar.$.nm.textContent = enemyName(boss);
  targetBar.update(dt); targetBar.place();
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (hitStop > 0) { hitStop -= dt; dt *= 0.08; }
  g.time += dt;
  for (let i = g.scheduled.length - 1; i >= 0; i--) if (g.scheduled[i].t <= g.time) { const s = g.scheduled[i]; g.scheduled.splice(i, 1); s.fn(); }

  // 时间
  const speed = keys.has('KeyT') || touch.held.has('time') ? 40 : 1, dh = dt * 24 / DAY_SEC * speed;
  g.hours += dh;
  if (g.hours >= 24) { g.hours -= 24; g.day++; }
  const h = g.hours;
  g.nightK = 1 - smooth(5, 7, h) + smooth(18.5, 20, h);
  g.nightK = clamp(g.nightK, 0, 1);

  weather.update(dt, dh, P.pos, g.time, world.mineFactor);
  updatePlayer(dt);
  world.update(P.pos, dt, g.nightK, g.day * 24 + h);
  for (const n of npcs) n.update(dt, h);
  enemies.update(dt);
  updateProjs(dt);
  updateWaves(dt);
  ambientSpawns(dt);
  ambience(dt);
  fx.update(dt);
  cfx.update(dt);
  updateCamera(dt);
  updateHpBars(dt);
  updateLights(h);
  updateUI();
  composer.render();
}

function updatePlayer(dt) {
  P.iframe -= dt; P.dashCd -= dt; P.qiCd -= dt; P.spinCd -= dt; P.pillCd -= dt;
  if (P.dead) cancelCombo(); else runner.update(dt);
  if (!P.dead) P.qi = Math.min(P.maxQi, P.qi + dt * 9);
  updateAim();
  const mv = moveInput();
  if (mv.lengthSq() > 0 && dialogOpen) closeDialog();
  if (!P.dead && !dialogOpen) {
    if (mouseDown[2]) qiSlash();
  }
  let spd = 6, vx = mv.x, vz = mv.y, lx = 0, lz = 0, y = 0;
  const m = runner.move, t = runner.t;
  if (m) {
    spd = m.moveSpd || 0;
    if (m.lunge) {
      const [t0, t1, dist] = m.lunge;
      if (t > t0 && t - dt < t1) {
        const k = (Math.min(t, t1) - Math.max(t - dt, t0)) / (t1 - t0) * dist / dt;
        lx = Math.sin(P.yaw) * k; lz = Math.cos(P.yaw) * k;
      }
    }
    if (m.leap) {
      const L = m.leap, k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1), e = k * k * (3 - 2 * k);
      P.pos.x = lerp(P.leapFrom.x, P.leapTo.x, e); P.pos.z = lerp(P.leapFrom.y, P.leapTo.y, e); spd = 0;
      y = L.h * 4 * k * (1 - k);
      if (k > 0 && k < 1 && Math.random() < 0.6) fx.mote(P.pos.x, y + 1, P.pos.z, m.color, { life: 0.3, size: 0.9 });
    }
    if (m.sweep && t > m.lunge[0] && t - dt < m.lunge[1]) {
      fx.mote(P.pos.x, 0.8 + Math.random() * 0.6, P.pos.z, '#9ef0ff', { life: 0.35, size: 1.3 });
      for (const e of [...enemies.list]) {
        if (P.sweepHit.has(e) || Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > e.r + m.sweep.w) continue;
        P.sweepHit.add(e); hitEnemy(e, m.sweep.dmg, P.pos.x - Math.sin(P.yaw), P.pos.z - Math.cos(P.yaw), m.sweep.knock);
        cfx.xslash(e.pos, '#9ef0ff', 0.03);
        hitFeel(m.sweep);
      }
    }
  }
  // 冲刺 / 突刺 / 跃击时留残影
  const ghosting = (m && ((m.sweep && t < m.lunge[1]) || (m.leap && t < m.leap.t1))) || P.dashT > 0;
  if (ghosting) { P.ghostT -= dt; if (P.ghostT <= 0) { P.ghostT = 0.035; cfx.ghost(P.c.root, m?.leap ? m.color : '#9ef0ff', 0.28); } }
  if (P.cast > 0) { P.cast -= dt; spd = 2; }
  if (P.spin > 0) { P.spin += dt / 0.35; if (P.spin >= 1) P.spin = 0; }
  if (P.work > 0) { P.work += dt / 0.4; spd = 0; if (P.work >= 1) P.work = 0; }
  if (P.dead) spd = 0;
  P.vel.set(vx * spd + lx, 0, vz * spd + lz);
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vel.set(Math.sin(P.dashDir) * 17, 0, Math.cos(P.dashDir) * 17);
    fx.mote(P.pos.x, 0.8 + Math.random() * 0.6, P.pos.z, '#9ef0ff', { life: 0.3, size: 1.2 });
  }
  P.pos.x += (P.vel.x + P.kx) * dt; P.pos.z += (P.vel.z + P.kz) * dt;
  const kd = Math.exp(-10 * dt); P.kx *= kd; P.kz *= kd;
  world.resolve(P.pos, P.r);
  for (const e of enemies.list) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, rr = P.r + e.r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6 && P.dashT <= 0 && !(m && (m.sweep || m.leap))) { const d = Math.sqrt(d2), k = (rr - d) / d; P.pos.x += dx * k * 0.7; P.pos.z += dz * k * 0.7; }
  }
  const fighting = P.cast > 0 || mouseDown[0] || mouseDown[2];
  if (m) { /* 出招时朝向在起招那一刻锁定 */ }
  else if (fighting) P.yaw = lerpAngle(P.yaw, aimYaw(), 1 - Math.exp(-20 * dt));
  else if (P.dashT > 0) P.yaw = P.dashDir;
  else if (mv.lengthSq() > 0) P.yaw = lerpAngle(P.yaw, Math.atan2(mv.x, mv.y), 1 - Math.exp(-14 * dt));
  P.c.root.rotation.y = P.yaw;
  const moving = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 6);
  P.c.root.position.y = y;
  if (!animCombo(P.c, dt, m, t)) animChibi(P.c, dt, { move: P.dashT > 0 ? 0 : moving, attack: -1, combo: 0, cast: P.cast, dash: P.dashT > 0, spin: P.spin, work: P.work });
  P.c.root.visible = !P.dead && !(P.iframe > 0 && P.iframe < 0.55 && Math.floor(g.time * 20) % 2 === 0);
}

function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.life -= dt;
    p.m.scale.setScalar(1 + (0.75 - p.life) * 1.2);
    p.m.material.opacity = Math.min(1, p.life * 4);
    if (Math.random() < 0.7) fx.mote(p.m.position.x, 1, p.m.position.z, '#9ef0ff', { life: 0.25, size: 0.9 });
    for (const e of [...enemies.list]) {
      if (p.hit.has(e)) continue;
      if (Math.hypot(e.pos.x - p.m.position.x, e.pos.z - p.m.position.z) < e.r + 0.9) {
        p.hit.add(e); enemies.damage(e, p.dmg, p.m.position.x - p.vx, p.m.position.z - p.vz, 5);
      }
    }
    if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); projs.splice(i, 1); }
  }
}

// 环境粒子：夜里萤火虫，矿洞里飘尘
function ambience(dt) {
  if (g.nightK > 0.5 && world.mineFactor < 0.5 && Math.random() < dt * 8) {
    fx.mote(P.pos.x + (Math.random() - 0.5) * 30, 0.5 + Math.random() * 1.5, P.pos.z + (Math.random() - 0.5) * 24, '#d8ff7a', { life: 3, size: 0.5, vy: 0.15, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6 });
  }
  if (world.mineFactor > 0.5 && Math.random() < dt * 14) {
    fx.mote(P.pos.x + (Math.random() - 0.5) * 30, 3 + Math.random() * 2, P.pos.z + (Math.random() - 0.5) * 24, '#b8a8ff', { life: 4, size: 0.35, vy: -0.4, bright: 0.8 });
  }
}

function updateCamera(dt) {
  if (keys.has('KeyQ')) camYawT += dt * 1.6;
  if (keys.has('KeyE')) camYawT -= dt * 1.6;
  camYawT = clamp(camYawT, -0.8, 0.8);
  camYaw = lerp(camYaw, camYawT, 1 - Math.exp(-8 * dt));
  focus.lerp(P.pos, 1 - Math.exp(-8 * dt));
  const dist = 21, pitch = 0.9;
  camera.position.set(focus.x + Math.sin(camYaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, focus.z + Math.cos(camYaw) * Math.cos(pitch) * dist);
  if (g.shakeV > 0) {
    camera.position.x += (Math.random() - 0.5) * g.shakeV * 0.5;
    camera.position.y += (Math.random() - 0.5) * g.shakeV * 0.5;
    g.shakeV = Math.max(0, g.shakeV - dt * 3);
  }
  camera.lookAt(focus.x, 1, focus.z);
  occ.uPlayer.value.set(P.pos.x, 1.0, P.pos.z);
  occ.uCam.value.copy(camera.position);
}

const _fog = new THREE.Color();
function updateLights(h) {
  const m = world.mineFactor;
  const a = (h - 6) / 12 * Math.PI;
  const night = h < 5.5 || h > 19.5;
  const sx = night ? -Math.cos(((h + 12) % 24 - 6) / 12 * Math.PI) : -Math.cos(a);
  sun.position.set(focus.x + sx * 30, 45, focus.z + 22);
  sun.target.position.copy(focus);
  sample(h, 1, sun.color);
  sun.intensity = sample(h, 2) * (1 - m * 0.92);
  sample(h, 3, hemi.color); sample(h, 4, hemi.groundColor);
  hemi.intensity = sample(h, 5) * (1 - m * 0.7);
  if (m > 0) hemi.color.lerp(_ca.setHex(0x3a3070), m * 0.6);
  sample(h, 6, _fog).lerp(MINE_FOG, m);
  scene.fog.color.copy(_fog); scene.background.copy(_fog);
  // 下雨：日光变弱、雾更近更灰、颜色更淡
  const r = weather.rain * (1 - m);
  sun.intensity *= 1 - 0.6 * r; hemi.intensity *= 1 - 0.2 * r;
  _fog.lerp(_ca.setHex(0x8e98a4), r * 0.6);
  scene.fog.color.copy(_fog); scene.background.copy(_fog);
  weatherU.sky.value.copy(_fog).lerp(hemi.color, 0.5);
  scene.fog.near = lerp(lerp(48, 30, r), 16, m); scene.fog.far = lerp(lerp(95, 70, r), 38, m);
  grade.uniforms.uSat.value = 1.12 - 0.25 * r;
  bloom.strength = 0.25 + Math.max(g.nightK, m) * 0.7;
  grade.uniforms.uWarm.value = 1 - Math.max(g.nightK, m) * 0.8;

  // 光源池
  const cand = [];
  for (const e of world.emitters) {
    const d2 = (e.x - P.pos.x) ** 2 + (e.z - P.pos.z) ** 2;
    if (d2 > 900) continue;
    const lv = world.emitterLevel(e, g.nightK) * e.power;
    if (lv < 0.05) continue;
    cand.push({ e, lv, s: lv / (1 + d2 / 120) });
  }
  cand.sort((x, y) => y.s - x.s);
  pool.forEach((l, i) => {
    const c = cand[i];
    if (!c) { l.intensity = 0; return; }
    l.position.set(c.e.x, c.e.y, c.e.z); l.color.copy(c.e.color);
    l.intensity = c.lv * 10;
  });
  aura.position.set(P.pos.x, 2.2, P.pos.z);
  aura.intensity = Math.max(g.nightK * 0.6, m) * 6;
}

function updateUI() {
  if (!runner.move && !runner.open && comboEl.textContent) showMove(null);
  ui.hpFill.style.width = (P.hp / P.maxHp * 100) + '%';
  ui.hpText.textContent = `${Math.ceil(P.hp)} / ${P.maxHp}`;
  ui.qiFill.style.width = (P.qi / P.maxQi * 100) + '%';
  ui.qiText.textContent = `${Math.floor(P.qi)} / ${P.maxQi}`;
  ui.xpFill.style.width = (P.layer >= 9 ? 100 : P.xp / xpNeed() * 100) + '%';
  ui.realm.textContent = realmText(1, P.layer) + (P.layer >= 9 ? '（圆满）' : `　修为 ${Math.floor(P.xp)}/${xpNeed()}`);
  const hh = Math.floor(g.hours), mm = Math.floor((g.hours - hh) * 60 / 10) * 10;
  ui.timeText.textContent = `${SEASONS[Math.floor((g.day - 1) / 7) % 4]} · 第${g.day}天　${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${g.nightK > 0.5 ? ' 🌙' : ' ☀'}`;
  ui.regionText.textContent = regionName(P.pos.x, P.pos.z);
  ui.invHerb.textContent = P.inv.herb; ui.invCore.textContent = P.inv.core; ui.invStone.textContent = P.inv.stone; ui.invHeart.textContent = P.inv.heart;
  const it = dialogOpen ? null : findInteract();
  ui.prompt.classList.toggle('hidden', !it);
  if (it) ui.prompt.innerHTML = it.kind === 'none' ? it.label : `<kbd>F</kbd> ${it.label}`;
  const cd = (el, v, max, ok) => { el.querySelector('.cd').style.height = (clamp(v / max, 0, 1) * 100) + '%'; el.classList.toggle('off', !ok); };
  cd(ui.sk1, P.qiCd, 0.35, P.qi >= 15);
  cd(ui.sk2, P.spinCd, 3, P.qi >= 30);
  cd(ui.sk3, P.pillCd, 1, P.inv.herb > 0);
  cd(ui.sk4, P.dashCd, 0.55, true);
  ui.sk3.querySelector('span').textContent = `服灵草 ×${P.inv.herb}`;
}

requestAnimationFrame(frame);
g.toast(touch.on ? '左下摇杆移动 · 右下按钮出招（自动瞄准）· 拖动画面转镜头 · 点提示交互' : '左键连招（松开出招，快慢分支）· 右键剑气 · F 交互 · H 查看操作', 4);
// 调试入口
window.game = g; g.combo = runner;
export { flat, glow, mesh };
