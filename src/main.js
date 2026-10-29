import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadTextures, weatherU, CHUNK, occ, clamp, lerp, smooth, angDiff, lerpAngle, flat, glow, mesh } from './util.js';
import { createChibi, animChibi } from './chibi.js';
import { Weather } from './weather.js';
import { World, configureVillage, VILLAGE_R, MINE, MINE_R, ARENA, regionName, dangerAt, roadDist } from './world.js';
import { FX } from './fx.js';
import { Enemies } from './enemies.js';
import { Realm, levelInfo, xpNeed as realmXP, ROOT_LIFE } from './realm.js';
import { Village, loadVillageData } from './village.js';
import { Farm } from './farm.js';
import { Alchemy } from './alchemy.js';
import { Quests, loadQuestData } from './quests.js';
import { ComboFX } from './comboFx.js';
import { SFX } from './comboSfx.js';
import { KE } from './comboKit.js';
import { Combat, DASH_CD } from './combat.js';
import { HealthBar, screenOf } from './hpbar.js';
import { TouchControls } from './touch.js';
import { DAY_START, dateOf, clockText, rollWeather } from './calendar.js';
import { loadItems, Inventory, item, itemName } from './items.js';
import { UI, btn, el } from './ui.js';
import { Life, near } from './life.js';
import { register, hasSave, saveInfo, writeSave, readSave, clearSave } from './save.js';

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
const g = {
  scene, camera, time: 0, hours: DAY_START, day: 1, weatherToday: 'clear', nightK: 0, scheduled: [], paused: true,
  after(sec, fn) { this.scheduled.push({ t: this.time + sec, fn }); },
  shakeV: 0, shake(v) { this.shakeV = Math.max(this.shakeV, v); },
  // 事件：kill / harvest / plant / water / soilQi / craft / talk …（任务进度等靠它推进）
  handlers: {}, on(t, f) { (this.handlers[t] ??= []).push(f); }, emit(t, ...a) { for (const f of this.handlers[t] || []) f(...a); },
  toast(msg, sec = 2.2) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), sec * 1000); },
};
const fx = new FX(scene, camera); g.fx = fx;
const cfx = new ComboFX(scene, fx, { soft: true });
const sfx = new SFX(); g.sfx = sfx;
await loadItems();
await loadTextures({
  grass_ground: { normal: 2 }, dirt_path: { normal: 2.5 }, stone_plaza: {},
  roof_tiles: { norm: 0.88, rep: 0.5 }, wood_planks: { norm: 0.88, rep: 0.5 }, tilled_soil: { norm: 0.9 },
  cliff_rock: { norm: 0.9 }, foliage: { norm: 0.88 }, peach_foliage: { norm: 0.88 },
  leaf_cards: { norm: 0.9, key: true }, grass_blades: { norm: 0.9, key: true }, blossom_cards: { norm: 0.9, key: true },
});
configureVillage(await loadVillageData().then((d) => (g.villageData = d)));
const world = new World(scene); g.world = world;
const enemies = new Enemies(g); g.enemies = enemies;
const weather = new Weather(scene); g.weather = weather;

// ---------- 玩家 ----------
const P = {
  c: createChibi({ skin: '#f8d8bc', hair: '#4a2e22', hairStyle: 2, robe: '#f2f4f6', robe2: '#4f7fb0', belt: '#3a5a78', pants: '#3a4250', sword: true }),
  r: 0.4, yaw: 0, vy: 0, vel: new THREE.Vector3(), kx: 0, kz: 0,
  hp: 100, maxHp: 100, qi: 100, maxQi: 100, layer: 1, xp: 0, grade: 2, elem: '金',
  work: 0, dashT: 0, dashCd: 0, dashDir: 0, iframe: 0, pillCd: 0, atkBonus: 0,
  dead: false,
};
const inv = new Inventory(); g.inv = inv;
const gui = new UI(); g.ui = gui;
P.pos = P.c.root.position;
P.pos.set(0, 0, 4);
scene.add(P.c.root);
g.player = P;

const xpNeed = () => realmXP(P.layer);
g.xpNeed = xpNeed;
// 招式伤害按炼气一层设计，随境界放大（每进一个大境界再跳一截）；兵器淬火另算
const atkMul = () => (1 + P.layer * 0.25 + levelInfo(P.layer).realm * 0.5) * (1 + P.atkBonus);

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
  if (P.hp <= 0) { if (realm.trib) realm.failTrib(); else die(); }
  return true;
};
function die() {
  P.dead = true; P.hp = 0;
  combat.cancel();
  const lost = life.deathDrop();
  document.getElementById('dead').classList.remove('hidden');
  fx.burst(P.pos, '#ffffff', 30, { speed: 5, up: 4 });
  P.c.root.visible = false;
  g.after(2.8, () => {
    P.dead = false; P.hp = P.maxHp; P.qi = P.maxQi; P.pos.set(life.bed.x + 1.3, 0, life.bed.z + 0.6); P.c.root.visible = true; P.iframe = 2;
    document.getElementById('dead').classList.add('hidden');
    g.toast('你在家中醒来，伤势已愈' + (lost ? '\n' + lost : ''), 4);
  });
}
// 境界、灵根、神识、天劫、御剑（realm.js）
const realm = new Realm(g); g.realm = realm;
g.addXP = (n, p, quiet) => realm.addXP(n, p, quiet);
// 御剑：脚下一把发光的飞剑
const flySword = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 1.6), glow('#9ef0ff', 2.2));
flySword.position.y = -0.05; flySword.visible = false; P.c.root.add(flySword);
// 神识扫描：10 秒内周围 40 米的妖兽和野生灵草冒出灵光
let scanTick = 0;
function scanMarks(dt) {
  if (realm.scanT <= 0 || (scanTick -= dt) > 0) return;
  scanTick = 0.25;
  for (const e of enemies.list) if (e.pos.distanceTo(P.pos) < 40) fx.mote(e.pos.x, 2.4, e.pos.z, '#ff6a8a', { life: 0.5, size: 2.2, vy: 0.4, bright: 3 });
  for (const ch of world.chunks.values()) for (const h of ch.herbs) if (Math.hypot(h.x - P.pos.x, h.z - P.pos.z) < 40) fx.mote(h.x, 1.4, h.z, '#7dffe0', { life: 0.5, size: 1.6, vy: 1, bright: 3 });
}
g.addItem = (id, n, p) => { inv.add(id, n); if (p) fx.num({ x: p.x - 0.6, z: p.z }, `+${n} ${itemName(id)}`, 'item'); };
g.addStones = (n, p) => { inv.stones += n; if (p) fx.num({ x: p.x - 0.6, z: p.z }, `+${n} 灵石`, 'item'); };
g.addMoney = (n, p) => { inv.money += n; if (p) fx.num({ x: p.x - 0.6, z: p.z }, `+${n} 文`, 'item'); };

// ---------- 村民 ----------

// ---------- 刷怪 ----------
const okSpawn = (x, z) => Math.hypot(x, z) > VILLAGE_R + 8 && Math.hypot(x - MINE.x, z - MINE.y) > MINE_R + 6 && roadDist(x, z) > 2;
world.onSpawn = (cx, cz, rng) => {
  if (g.time < 1) return;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const n = Math.floor(2 + rng() * 3 + g.nightK * 2 + dangerAt(x0 + 16, z0 + 16) * 0.3);
  for (let i = 0; i < n; i++) {
    const x = x0 + 4 + rng() * 24, z = z0 + 4 + rng() * 24;
    if (!okSpawn(x, z) || Math.hypot(x - P.pos.x, z - P.pos.z) < 16) continue;
    enemies.spawn(rng() < 0.6 ? 'boar' : 'spider', x, z, Math.floor(dangerAt(x, z)));
  }
};
let spawnT = 4, golemT = 0;
function ambientSpawns(dt) {
  spawnT -= dt; golemT -= dt;
  const near = enemies.list.filter((e) => e.type !== 'golem' && e.type !== 'boss' && e.pos.distanceTo(P.pos) < 35 * camZoom).length;
  if (spawnT <= 0) {
    spawnT = 2.5 - g.nightK * 1.2;
    if (near < 11 + g.nightK * 7 && !P.dead) {
      const a = Math.random() * 6.28, r = (24 + Math.random() * 6) * camZoom;
      const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
      if (okSpawn(x, z)) enemies.spawn(Math.random() < 0.6 ? 'boar' : 'spider', x, z, Math.floor(dangerAt(x, z)));
    }
  }
  const dm = Math.hypot(P.pos.x - MINE.x, P.pos.z - MINE.y);
  if (golemT <= 0 && dm < MINE_R + 25) {
    golemT = 5;
    const golems = enemies.list.filter((e) => e.type === 'golem').length;
    if (golems < 12) {
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
const SKILL_KEYS = ['KeyQ', 'KeyE', 'KeyR', 'KeyC']; // 四个技能槽（F 留给交互）
const mouse = new THREE.Vector2(), mouseDown = [false, false, false];
const aim = new THREE.Vector3();
let camYaw = 0, camYawT = 0, camZoom = 1;
addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') { if (gui.panelOpen) gui.closePanel(); else if (gui.dialogOpen) gui.closeDialog(); else if (!g.title) openMenu(); return; }
  if (g.title) return;
  if (gui.dialogOpen) { if (['KeyF', 'Space', 'Enter'].includes(e.code)) gui.advance(); return; }
  if (gui.panelOpen) { if (e.code === 'Tab' || e.code === 'KeyB') gui.closePanel(); return; }
  if (e.code === 'KeyF') interact();
  if (e.code === 'Tab' || e.code === 'KeyB') openBag();
  if (e.code === 'KeyL') quests.openLog();
  if (e.code === 'KeyG') realm.toggleFly();
  if (e.code === 'KeyV') realm.scan();
  if (e.code === 'KeyP') g.toast(weather.toggle() ? '下雨了' : '雨停了');
  if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
  const si = SKILL_KEYS.indexOf(e.code);
  if (si >= 0) useSkill(si);
  if (e.code === 'KeyX') cycleWeapon();
  if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (i >= 0 && i < 8) hotKey(i); }
  if (e.code === 'Space' || e.code === 'ShiftLeft') dash();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseDown.fill(false); });
renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
// 左键松开才出招（按下只"上膛"）；按下时若在对话中，这次点击只用来关对话框
let armed = false;
renderer.domElement.addEventListener('pointerdown', (e) => { sfx.unlock(); if (gui.dialogOpen) { gui.advance(); return; } if (e.pointerType === 'touch') return; mouseDown[e.button] = true; if (e.button === 0) armed = !gui.blocking; });
addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') return; mouseDown[e.button] = false; if (e.button === 0 && armed) { armed = false; attackClick(); } });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
// 滚轮转镜头
renderer.domElement.addEventListener('wheel', (e) => { camYawT -= e.deltaY * 0.0012; }, { passive: true });

// 手机模式：摇杆 + 按钮（与电脑操作并存，按最近使用的输入自动切换）
const touch = new TouchControls();
touch.onChange = () => { mouseDown.fill(false); armed = false; updateKitUI(); };
const tap = (fn) => ({ down: () => { sfx.unlock(); fn(); } });
touch.bind(document.getElementById('sk0'), { down: () => { sfx.unlock(); mouseDown[0] = true; }, up: (c) => { mouseDown[0] = false; if (!c) attackClick(); } });
const slotEls = [...document.querySelectorAll('#skills [data-slot]')];
for (const el of slotEls) touch.bind(el, tap(() => useSkill(+el.dataset.slot)));
touch.bind(document.getElementById('skDash'), tap(dash));
touch.bind(document.getElementById('skScan'), tap(() => realm.scan()));
touch.bind(document.getElementById('skFly'), tap(() => realm.toggleFly()));
touch.bind(document.getElementById('skWeap'), tap(cycleWeapon));
// 快捷栏：点一下选中（能吃的直接吃）；背包 / 菜单按钮
document.getElementById('hotbar').addEventListener('pointerdown', (e) => { const s = e.target.closest('.hs'); if (!s) return; e.stopPropagation(); sfx.unlock(); hotKey(+s.dataset.i); });
document.getElementById('bagBtn').addEventListener('click', () => openBag());
document.getElementById('menuBtn').addEventListener('click', () => openMenu());
document.getElementById('questBtn').addEventListener('click', () => quests.openLog());
touch.bind(document.getElementById('prompt'), tap(interact));
touch.bind(document.getElementById('mobTime'), { hold: 'time' });
touch.drag(renderer.domElement, (dx) => { camYawT -= dx * 0.006; });

const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateAim() {
  if (!touch.on) { ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(ground, aim); return; }
  // 手机：自动瞄准附近最近的敌人（摇杆推着时优先摇杆方向上的），没有就朝移动 / 面朝方向
  const mv = moveInput(), my = mv.lengthSq() > 0.1 ? Math.atan2(mv.x, mv.y) : null;
  let best = null, bs = 1e9;
  for (const e of enemies.list) {
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, l = Math.hypot(dx, dz) - e.r;
    if (l > 9) continue;
    const sc = l + (my === null ? 0 : Math.abs(angDiff(Math.atan2(dx, dz), my)) * 3);
    if (sc < bs) { bs = sc; best = e; }
  }
  if (best) { aim.set(best.pos.x, 0, best.pos.z); return; }
  const yaw = my ?? P.yaw;
  aim.set(P.pos.x + Math.sin(yaw) * 4, 0, P.pos.z + Math.cos(yaw) * 4);
}
const aimYaw = () => Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);

// ---------- 战斗：拳 / 剑 / 符、灵力、四个技能槽、五行（与试炼场同一套，见 combat.js） ----------
// 五行：己克对方 ×1.5，被克 ×0.75
const elemMul = (e) => (KE[P.elem] === e.elem ? 1.5 : KE[e.elem] === P.elem ? 0.75 : 1);
function hitEnemy(e, dmg, fromX, fromZ, knock, color, h) {
  if (!e.alive) return;
  const crit = Math.random() < 0.12, mul = elemMul(e);
  enemies.damage(e, dmg * atkMul() * mul * (crit ? 1.8 : 1), fromX, fromZ, knock * 1.4, crit, h, mul > 1 ? '克' : mul < 1 ? '弱' : '');
}
// 普攻也能挖矿：判定范围里的矿石扣一下
function hitOres(test) {
  let any = false;
  for (const o of world.ores) {
    if (!o.alive || !test(o.x, o.z, o.r)) continue;
    o.hp--; any = true;
    fx.burst({ x: o.x, z: o.z }, '#ffd36b', 8, { speed: 4, life: 0.4 });
    if (o.hp <= 0) {
      o.alive = false; o.group.visible = false; o.col.off = true; o.respawn = 90;
      g.addItem('iron', 1 + Math.floor(Math.random() * 2), o);
      if (Math.random() < 0.4) g.addItem('shard', 1, { x: o.x, z: o.z + 0.5 });
      if (Math.random() < 0.15) g.addStones(1, { x: o.x, z: o.z + 1 });
    }
  }
  return any;
}
const combat = new Combat({
  scene, fx, cfx, sfx, P, aim,
  targets: () => enemies.list,
  hit: hitEnemy, hitWorld: hitOres,
  stop: (sec) => { hitStop = Math.max(hitStop, sec); },
  shake: (v) => g.shake(v),
});
const runner = combat.runner;
g.onSlam = (e) => combat.slamAround(e);

function attackClick() {
  if (P.dead || gui.blocking || g.paused || P.dashT > 0 || P.work > 0 || realm.fly) return;
  combat.click();
}
function useSkill(i) {
  if (P.dead || gui.blocking || g.paused || P.work > 0 || realm.fly) return;
  combat.useSkill(i);
}
function cycleWeapon() { combat.cycle(); }

const comboEl = document.getElementById('comboName');
function showMove(m) { comboEl.innerHTML = m ? `${m.name}<small>第${runner.chain}式</small>` : ''; }
combat.onMove = showMove;

// 快捷栏 1–8：选中；能吃的（灵草、丹药、食物）按下就吃
function hotKey(i) {
  inv.sel = i; gui.renderHotbar(inv);
  const id = inv.hot[i], it = id && item(id);
  if (it && (it.heal || it.qiHeal || it.xp || it.cat === 'pill') && !gui.blocking) life.use(id);
}
function dash() {
  if (P.dashCd > 0 || P.dead || g.paused || gui.blocking) return;
  const mv = moveInput();
  P.dashDir = mv.lengthSq() > 0 ? Math.atan2(mv.x, mv.y) : P.yaw;
  P.dashT = 0.18; P.dashCd = DASH_CD; P.iframe = Math.max(P.iframe, 0.25);
  combat.cancel(); sfx.dash();
}
function moveInput() {
  const ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.stick.x;
  const iy = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.stick.y;
  const v = new THREE.Vector2(ix * Math.cos(camYaw) - iy * Math.sin(camYaw), -ix * Math.sin(camYaw) - iy * Math.cos(camYaw));
  if (v.lengthSq() > 1) v.normalize();
  return v;
}

// ---------- 日常 / 交互（F）：各系统往 life 里登记可交互的东西，按距离挑最近的 ----------
const life = new Life(g); g.life = life;
// 青竹村 21 位村民（village.js / data/villagers.json）
const village = new Village(g, g.villageData); g.village = village;
g.sense = () => 20 + P.layer * 8; // 神识：看清别人灵根要够高（境界系统接入前先按层数算）
life.on((P) => {
  const cx = Math.floor(P.pos.x / CHUNK), cz = Math.floor(P.pos.z / CHUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const ch = world.chunks.get(`${cx + dx},${cz + dz}`); if (!ch) continue;
    for (const h of ch.herbs) {
      const d = near(P, h, 1.6);
      if (d !== false) return { label: '采集 · 野生' + itemName(h.kind), act: () => { world.pickHerb(ch, h); g.addItem(h.kind, 1, P.pos); }, d };
    }
  }
  return null;
});
// 灵田（farm.js）：开垦、播种、浇水、补灵气、收获
const farm = new Farm(g); g.farm = farm;
inv.countText = (id) => (id === 'can' ? farm.can : undefined); // 快捷栏上水壶显示剩多少水
// 炼丹（alchemy.js）与任务（quests.js：主线教学、村民委托、委托板）
const alchemy = new Alchemy(g); g.alchemy = alchemy;
const quests = new Quests(g, await loadQuestData()); g.quests = quests;
g.onKill = (e) => g.emit('kill', e);
function interact() {
  if (gui.blocking || P.dead || g.paused) return;
  life.find()?.act?.();
}

// ---------- 背包 / 菜单 / 存档 ----------
inv.onChange = () => gui.renderHotbar(inv);
function openBag() { if (!g.title) gui.openBag(inv, { onUse: (id) => life.use(id) }); }
function openMenu() {
  gui.panel('菜单', (body) => {
    const info = saveInfo();
    body.append(btn('🎒 背包', () => { gui.closePanel(); openBag(); }, 'wide'));
    body.append(btn('📜 任务', () => { gui.closePanel(); quests.openLog(); }, 'wide'));
    body.append(btn('💾 存档', () => { g.save(); gui.closePanel(); g.toast('已存档'); }, 'wide'));
    body.append(btn('📂 读档' + (info ? `（${info.text}）` : ''), () => { if (readSave()) { gui.closePanel(); g.toast('已读档'); } }, 'wide' + (info ? '' : ' off')));
    body.append(btn('❓ 操作说明', () => { gui.closePanel(); document.getElementById('help').classList.remove('hidden'); }, 'wide'));
    body.append(btn('🔄 重新开始', () => { if (confirm('放弃当前进度，从头开始？')) { clearSave(); location.reload(); } }, 'wide'));
  });
}
const metaText = () => { const d = dateOf(g.day); return `${d.seasonName}季第${d.dayOfSeason}天 ${clockText(g.hours)} · ${levelInfo(P.layer).name}`; };
g.save = () => writeSave({ text: metaText() });
register('time', () => ({ day: g.day, hours: g.hours }), (s) => {
  g.day = s.day; g.hours = s.hours; world.day = g.day;
  g.weatherToday = rollWeather(g.day); weather.setDay(g.weatherToday === 'rain');
});
register('player', () => ({ x: P.pos.x, z: P.pos.z, hp: P.hp, maxHp: P.maxHp, qi: P.qi, maxQi: P.maxQi, layer: P.layer, xp: P.xp, elem: P.elem, kit: combat.kitI, atk: P.atkBonus }), (s) => {
  P.pos.set(s.x, 0, s.z); focus.copy(P.pos);
  Object.assign(P, { hp: s.hp, maxHp: s.maxHp, qi: s.qi, maxQi: s.maxQi, layer: s.layer, xp: s.xp, elem: s.elem, atkBonus: s.atk || 0, dead: false });
  P.c.root.visible = true; combat.setKit(s.kit || 0);
  for (const e of [...enemies.list]) enemies.remove(e);
});
register('inv', () => inv.save(), (s) => inv.load(s));
register('life', () => life.save(), (s) => life.load(s));
register('village', () => village.save(), (s) => village.load(s));
register('realm', () => realm.save(), (s) => realm.load(s));
register('alchemy', () => alchemy.save(), (s) => alchemy.load(s));
register('quests', () => quests.save(), (s) => quests.load(s));
register('world', () => ({ picked: [...world.picked] }), (s) => { world.picked = new Map(s.picked); });
register('farm', () => farm.save(), (s) => { if (!Array.isArray(s)) farm.load(s); });

// ---------- 主循环 ----------
let hitStop = 0, last = performance.now();
const focus = new THREE.Vector3().copy(P.pos);
const ui = Object.fromEntries(['hpFill', 'hpText', 'qiFill', 'qiText', 'xpFill', 'realm', 'senseFill', 'senseText', 'rootTag', 'timeText', 'regionText', 'money', 'prompt', 'skDash', 'skFly', 'atkName', 'weapName', 'hotbar'].map((k) => [k, document.getElementById(k)]));

world.update(P.pos, 0, 0, g.day * 24 + g.hours, true);
document.getElementById('loading').classList.add('hidden');

// ---------- 血条：头顶小血条 + 顶部目标大血条（与试炼场同一套 hpbar.js） ----------
const hpLayer = document.getElementById('hpLayer');
const targetBar = new HealthBar({ parent: document.body, big: true, max: 1 });
targetBar.el.style.display = 'none';
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
  combat.forget(e);
};
function placeBar(bar, dt, x, y, z) {
  bar.update(dt);
  const [sx, sy, front] = screenOf(camera, x, y, z);
  bar.place(sx, sy);
  if (!front) bar.el.style.visibility = 'hidden';
}
function updateHpBars(dt) {
  for (const e of enemies.list) if (e.bar) placeBar(e.bar, dt, e.pos.x, (BAR_Y[e.type] ?? 2) + e.pos.y, e.pos.z);
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
  tick(Math.min(0.05, (now - last) / 1000)); last = now;
  composer.render();
}
function tick(dt) {
  // 菜单 / 对话 / 标题画面：暂停（GDD：只在菜单和对话时暂停）
  if (g.paused || gui.blocking) { updateCamera(dt); updateLights(g.hours % 24); updateUI(); return; }
  if (hitStop > 0) { hitStop -= dt; dt *= 0.08; }
  g.time += dt;
  for (let i = g.scheduled.length - 1; i >= 0; i--) if (g.scheduled[i].t <= g.time) { const s = g.scheduled[i]; g.scheduled.splice(i, 1); s.fn(); }

  // 时间：6:00 → 次日 2:00，1 游戏小时 = 1 分钟（calendar.js）
  const dh = life.tick(dt, keys.has('KeyT') || touch.held.has('time'));
  const h = g.hours % 24;
  g.nightK = 1 - smooth(5, 7, h) + smooth(18.5, 20, h);
  g.nightK = clamp(g.nightK, 0, 1);

  weather.update(dt, dh, P.pos, g.time, world.mineFactor);
  updatePlayer(dt);
  world.update(P.pos, dt, g.nightK, g.day * 24 + g.hours);
  life.update(dt);
  realm.update(dt);
  scanMarks(dt);
  farm.update();
  alchemy.update(dt);
  quests.update(dt);
  village.update(dt);
  enemies.update(dt);
  combat.updateEffects(dt);
  ambientSpawns(dt);
  ambience(dt);
  fx.update(dt);
  cfx.update(dt);
  updateCamera(dt);
  updateHpBars(dt);
  updateLights(h);
  updateUI();
}

const NOMOVE = new THREE.Vector2();
function updatePlayer(dt) {
  P.iframe -= dt; P.dashCd -= dt; P.pillCd -= dt;
  if (P.dead) combat.cancel(); else combat.update(dt);
  updateAim();
  const mv = moveInput();
  if (P.work > 0) { P.work += dt / 0.4; if (P.work >= 1) P.work = 0; }
  // 招式自带的位移 / 跳跃 / 突刺判定在 combat.step 里；御剑飞行时走得快、悬在半空
  const st = combat.step(dt, P.dead || P.work > 0 ? NOMOVE : mv, realm.fly ? 15 : 6 * (1 + realm.passive('风') * 0.5));
  if (realm.fly) { st.y = 1.1 + Math.sin(g.time * 3) * 0.08; P.vy = 0; st.ghost = true; }
  flySword.visible = realm.fly;
  let vx = st.vx, vz = st.vz;
  if (P.dashT > 0) {
    P.dashT -= dt;
    vx = Math.sin(P.dashDir) * 17; vz = Math.cos(P.dashDir) * 17;
    fx.mote(P.pos.x, 0.8 + Math.random() * 0.6, P.pos.z, '#9ef0ff', { life: 0.3, size: 1.2 });
  }
  P.vel.set(vx, 0, vz);
  P.pos.x += (vx + P.kx) * dt; P.pos.z += (vz + P.kz) * dt;
  const kd = Math.exp(-10 * dt); P.kx *= kd; P.kz *= kd;
  world.resolve(P.pos, P.r);
  if (!st.ghost && P.dashT <= 0) for (const e of enemies.list) {
    if (Math.abs(e.pos.y - st.y) > 1) continue;
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, rr = P.r + e.r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; P.pos.x += dx * k * 0.7; P.pos.z += dz * k * 0.7; }
  }
  // 出招 / 放技能时朝向在起手那一刻锁定；按住左键时转向鼠标
  if (P.dashT > 0) P.yaw = P.dashDir;
  else if (runner.move || combat.skill) { /* 锁定 */ }
  else if (mouseDown[0]) P.yaw = lerpAngle(P.yaw, aimYaw(), 1 - Math.exp(-20 * dt));
  else if (mv.lengthSq() > 0 && P.work <= 0) P.yaw = lerpAngle(P.yaw, Math.atan2(mv.x, mv.y), 1 - Math.exp(-14 * dt));
  P.c.root.rotation.y = P.yaw;
  P.c.root.position.y = st.y;
  combat.animate(dt, Math.min(1, Math.hypot(vx, vz) / 6), { work: P.work });
  P.c.root.visible = !P.dead && !(P.iframe > 0 && P.iframe < 0.55 && Math.floor(g.time * 20) % 2 === 0);
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
  if (g.debugCam) { const { pos: p, look: l } = g.debugCam; camera.position.set(p.x, p.y, p.z); camera.lookAt(l.x, l.y, l.z); return; } // 调试：game.debugCam = { pos, look }
  camYawT = clamp(camYawT, -0.8, 0.8);
  camYaw = lerp(camYaw, camYawT, 1 - Math.exp(-8 * dt));
  focus.lerp(P.pos, 1 - Math.exp(-8 * dt));
  // 手机屏幕小，镜头拉远 1.4 倍看得更远
  camZoom = lerp(camZoom, touch.on ? 1.4 : 1, 1 - Math.exp(-6 * dt));
  const dist = 21 * camZoom, pitch = 0.9;
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
  const fogPush = 21 * (camZoom - 1);   // 镜头拉远时雾也往后推，别把主角雾掉
  scene.fog.near = lerp(lerp(48, 30, r), 16, m) + fogPush; scene.fog.far = lerp(lerp(95, 70, r), 38, m) + fogPush * 1.4;
  // 天劫：劫云压顶，天色变暗发紫
  const tk = realm.dark;
  if (tk > 0.01) { sun.intensity *= 1 - 0.8 * tk; hemi.intensity *= 1 - 0.5 * tk; _fog.lerp(_ca.setHex(0x2a2440), tk * 0.8); scene.fog.color.copy(_fog); scene.background.copy(_fog); }
  if (g.debugCam) { scene.fog.near = 1e4; scene.fog.far = 2e4; }
  const sh = sun.shadow.camera, ext = 30 * camZoom;
  if (Math.abs(sh.right - ext) > 0.5) { Object.assign(sh, { left: -ext, right: ext, top: ext, bottom: -ext }); sh.updateProjectionMatrix(); }
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
  const L = levelInfo(P.layer), full = L.top && P.xp >= xpNeed();
  ui.xpFill.style.width = Math.min(100, P.xp / xpNeed() * 100) + '%';
  ui.realm.textContent = L.name + (full ? '（圆满 · 待渡劫）' : `　修为 ${Math.floor(P.xp)}/${xpNeed()}`);
  ui.senseFill.style.width = (P.sense / realm.senseMax * 100) + '%';
  ui.senseText.textContent = `神识 ${Math.floor(P.sense)} / ${realm.senseMax}`;
  ui.rootTag.textContent = P.roots.map((r) => r.e).join('') + '灵根 · ' + ['凡品', '良品', '上品', '极品'][P.roots[0].grade];
  ui.skFly.classList.toggle('hidden', L.realm < 1); ui.skFly.classList.toggle('on', realm.fly);
  const d = dateOf(g.day);
  ui.timeText.textContent = `${d.seasonName}季 ${d.dayOfSeason}日 ${d.weekName}　${d.moonIcon} ${clockText(g.hours)}${g.weatherToday === 'rain' ? ' 🌧' : g.nightK > 0.5 ? ' 🌙' : ' ☀'}`;
  ui.regionText.textContent = regionName(P.pos.x, P.pos.z);
  ui.money.textContent = `💰 ${inv.money} 文　💎 ${inv.stones}`;
  // 战斗时快捷栏淡出（GDD 第 12 节 HUD）
  ui.hotbar.classList.toggle('fight', !!runner.move || enemies.list.some((e) => e.state !== 'idle' && e.pos.distanceTo(P.pos) < 12));
  const it = gui.blocking || g.paused ? null : life.find();
  ui.prompt.classList.toggle('hidden', !it);
  if (it) ui.prompt.innerHTML = it.act ? `<kbd>F</kbd> ${it.label}` : it.label;
  const cd = (el, v, max, ok) => { el.querySelector('.cd').style.height = (clamp(v / max, 0, 1) * 100) + '%'; el.classList.toggle('off', !ok); };
  for (const el of slotEls) { const i = +el.dataset.slot, s = combat.kit.skills[i]; cd(el, combat.skillCd[i], s.cd, P.qi >= s.qi); }
  cd(ui.skDash, P.dashCd, DASH_CD, true);
}
// 换武器 / 切手机模式时刷新技能槽名字
function updateKitUI() {
  const kit = combat.kit;
  for (const el of slotEls) { const s = kit.skills[+el.dataset.slot]; el.querySelector('.nm').textContent = s.name; el.querySelector('.qc').textContent = s.qi ? s.qi + ' 灵' : '回气'; }
  ui.weapName.textContent = kit.name;
  ui.atkName.textContent = touch.on ? (kit.id === 'sword' ? '斩' : kit.name) : '连招 · ' + kit.name;
}
combat.onKit = updateKitUI;
updateKitUI();
// 窗口矮时操作说明默认收起（H 打开）
if (innerHeight < 720) document.getElementById('help').classList.add('hidden');

// ---------- 标题：继续 / 新的开始 ----------
// 新的开始（GDD「第一个小时」）：背着包袱走到青竹村外，迎面就撞上野猪妖
function newGame() {
  inv.money = 200; inv.add('can'); inv.add('seed_radish', 6); inv.add('lingcao', 3);
  g.weatherToday = 'clear'; weather.setDay(false);
  quests.newDay();
  P.pos.set(31, 0, 16); P.yaw = -Math.PI / 2; focus.copy(P.pos);
  g.intro = true;
}
function startPlay() {
  g.title = false; g.paused = false;
  document.getElementById('title').classList.add('hidden');
  gui.renderHotbar(inv);
  if (g.intro) {
    g.intro = false;
    // GDD：开局选一种五行灵根（凡品）
    const pickRoot = (e) => {
      P.roots = [{ e, grade: 0 }]; P.elem = e; realm.recalc(true);
      gui.dialog({ narrate: true, lines: ['你背着包袱，走了三天山路。', '远远地，已经能望见青竹村的炊烟。', '就在这时，路边的林子里传来一阵低吼——'], onClose: () => quests.accept('s1', 'story') });
    };
    gui.dialog({ narrate: true, line: '测灵石上亮起一道光——你的灵根是？', info: '五行相克：金克木、木克土、土克水、水克火、火克金（克制 ×1.5）。每种灵根还带一个生活被动。',
      choices: ['金', '木', '水', '火', '土'].map((e) => ({ label: `${e}（${ROOT_LIFE[e]}）`, fn: () => pickRoot(e) })) });
  }
  g.toast(touch.on ? '左下摇杆移动 · 右下按钮出招（自动瞄准）· 拖动画面转镜头 · 点提示交互' : '左键连招（松开出招，快慢分支）· QERC 技能 · X 换武 · F 交互 · Tab 背包 · H 操作说明', 4);
}
{
  g.title = true;
  const box = document.getElementById('titleBtns'), info = saveInfo();
  if (info) box.append(btn(`继续 · ${info.text}`, () => { readSave(); startPlay(); }, 'wide'));
  box.append(btn(info ? '新的开始（覆盖存档）' : '开始问道', () => { if (info) clearSave(); newGame(); startPlay(); }, 'wide'));
  if (new URLSearchParams(location.search).has('skipTitle')) { if (info) readSave(); else newGame(); startPlay(); }
}
requestAnimationFrame(frame);
// 调试入口
window.game = g; g.combo = runner; g.combat = combat;
// 脚本化测试：game.step(秒) 按固定步长推进（不受帧率影响），最后渲染一帧
g.step = (sec, h = 1 / 60, render = true) => { for (let t = 0; t < sec; t += h) tick(h); if (render) composer.render(); };
export { flat, glow, mesh };
