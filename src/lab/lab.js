import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadTextures, toon, canvasTex, mulberry32, hash01, smooth, clamp, lerp } from '../util.js';
import { createChibi, animChibi } from '../chibi.js';
import { U, instance } from './kit.js';
import { ASSETS, getAsset } from './assets.js';
import { BIOMES, R } from './biomes.js';

// ======================================================================
// 素材实验场：只加载场景素材，不跑游戏逻辑。改素材只需刷新这一页。
// ======================================================================
const $ = (s) => document.querySelector(s);

// ---------- 渲染（与主游戏一致的管线：卡通材质 + 软阴影 + 泛光 + 调色） ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe6f0, 40, 95);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.3, 600);
camera.position.set(0, 30, 42);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.48; controls.minDistance = 3; controls.maxDistance = 160;
controls.target.set(0, 0.5, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
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
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

// ---------- 光照 ----------
const hemi = new THREE.HemisphereLight(0xd8ecff, 0x9a8a50, 1.0);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const pool = [];
for (let i = 0; i < 10; i++) { const l = new THREE.PointLight(0xffaa66, 0, 8, 1.6); scene.add(l); pool.push(l); }

// 天空球：上下两色渐变 + 太阳光晕
const skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunC: { value: new THREE.Color() } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top, bottom, sunDir, sunC; varying vec3 vD;
    void main() {
      float t = smoothstep(-0.15, 0.6, vD.y);
      vec3 c = mix(bottom, top, t);
      float s = max(dot(normalize(vD), sunDir), 0.0);
      c += sunC * (pow(s, 64.0) * 0.8 + pow(s, 6.0) * 0.12);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);

// ---------- 状态 ----------
const S = {
  biome: 0, mode: 'scene', time: 10, seed: 1,
  outline: true, shadows: true, bloom: true, grade: true, particles: true, chibi: true, labels: true, pixel: false, spin: false,
};
try { Object.assign(S, JSON.parse(localStorage.getItem('xxlab') || '{}')); } catch { /* 无痕模式等 */ }
const save = () => { try { localStorage.setItem('xxlab', JSON.stringify(S)); } catch { /* ignore */ } };

let root = new THREE.Group(); scene.add(root);
let emitters = [], bobbers = [], labels = [], waterMat = null, particleSys = [];

// ======================================================================
// 地面：圆形小岛（像素贴图顶面 + 分层土壁）
// ======================================================================
const NR = 70, NS = 168;
function buildIsland(b) {
  const T = (x, z) => b.terrain(x, z);
  const hAt = (x, z) => {
    const r = Math.hypot(x, z), t = T(x, z), th = t.h + 0.35; // 陆地整体抬高，避免噪声低洼处露出水面
    return th * (1 - smooth(R - 1.2, R, r)) + smooth(R - 1.2, R, r) * Math.min(th, 0.5) - smooth(R - 0.5, R, r) * 0.25;
  };
  // 顶面
  const pos = [], uv = [], idx = [];
  pos.push(0, hAt(0, 0), 0); uv.push(0.5, 0.5);
  for (let i = 1; i <= NR; i++) for (let j = 0; j < NS; j++) {
    const a = j / NS * Math.PI * 2, r = R * i / NR, x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x, hAt(x, z), z); uv.push((x + R) / (2 * R), 1 - (z + R) / (2 * R));
  }
  const V = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * NS + (j % NS));
  for (let j = 0; j < NS; j++) idx.push(0, V(1, j + 1), V(1, j));
  for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) idx.push(V(i, j), V(i, j + 1), V(i + 1, j), V(i, j + 1), V(i + 1, j + 1), V(i + 1, j));
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  top.setIndex(idx); top.computeVertexNormals();
  // 像素贴图：每单位约 10 像素
  const N = 512;
  const tex = canvasTex(N, N, (ctx) => {
    const img = ctx.createImageData(N, N), D = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -R + (i + 0.5) / N * 2 * R, z = -R + (j + 0.5) / N * 2 * R;
      const t = T(x, z), c = b.color(x, z, t), d = 0.95 + hash01(i, j, 3) * 0.1;
      const k = (j * N + i) * 4;
      D[k] = c[0] * d; D[k + 1] = c[1] * d; D[k + 2] = c[2] * d; D[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: false });
  const topM = new THREE.Mesh(top, toon('#ffffff', { map: tex, unique: true }));
  topM.receiveShadow = true;
  root.add(topM);
  // 侧壁：草皮边 → 土 → 岩层
  const wall = [], wcol = [], widx = [], layers = [[0, '#ffffff'], [-0.35, b.id === 'winter' ? '#e8f0fa' : '#6a9a3a'], [-0.5, '#8a6040'], [-1.6, '#7a5236'], [-2.4, '#6a6070'], [-4, '#4a4458']];
  if (b.id === 'cave' || b.id === 'volcano') layers[1][1] = '#5a4a50';
  if (b.id === 'lake') layers[1][1] = '#d8c088';
  const col = new THREE.Color();
  for (let j = 0; j <= NS; j++) {
    const a = j / NS * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R, h = hAt(x, z);
    layers.forEach(([dy, c], li) => {
      const wob = li > 1 ? (hash01(j, li, 5) - 0.5) * 0.25 : 0, rr = R - (li > 2 ? (li - 2) * 0.35 : 0) + wob * 0.6;
      wall.push(Math.cos(a) * rr, li === 0 ? h : Math.min(h, 0.5) + dy + wob, Math.sin(a) * rr);
      if (li === 0) { const t = T(x, z); const cc = b.color(x, z, t); col.setRGB(cc[0] / 255, cc[1] / 255, cc[2] / 255, THREE.SRGBColorSpace); }
      else col.set(c).multiplyScalar(0.9 + hash01(j, li, 2) * 0.15);
      wcol.push(col.r, col.g, col.b);
    });
  }
  const L = layers.length;
  for (let j = 0; j < NS; j++) for (let l = 0; l < L - 1; l++) {
    const a = j * L + l, c = (j + 1) * L + l;
    widx.push(a, a + 1, c, c, a + 1, c + 1);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
  wg.setIndex(widx); wg.computeVertexNormals();
  const wm = new THREE.Mesh(wg, toon('#ffffff', { vc: true }));
  wm.castShadow = true; wm.receiveShadow = true;
  root.add(wm);
  // 底部封口
  const cap = new THREE.Mesh(new THREE.CircleGeometry(R - 1.2, 48).rotateX(Math.PI / 2), toon('#3a3440'));
  cap.position.y = -4; root.add(cap);
  return hAt;
}

// ======================================================================
// 水面 / 冰面 / 岩浆：深度图驱动的浅深色、岸边泡沫、波光
// ======================================================================
function buildWater(b, hAt) {
  const W = b.water; if (!W) return;
  const N = 192, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -R + (i + 0.5) / N * 2 * R, z = -R + (j + 0.5) / N * 2 * R;
    const d = clamp((W.level - hAt(x, z)) / 0.9, 0, 1);
    data[(j * N + i) * 4] = d * 255; data[(j * N + i) * 4 + 3] = 255;
  }
  const dt = new THREE.DataTexture(data, N, N); dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const mode = { water: 0, ice: 1, lava: 2 }[W.mode];
  waterMat = new THREE.ShaderMaterial({
    transparent: mode !== 2, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tDepth: { value: dt }, uTime: U.time, uR: { value: R }, uMode: { value: mode },
      cShallow: { value: new THREE.Color(W.shallow) }, cDeep: { value: new THREE.Color(W.deep) }, cFoam: { value: new THREE.Color(W.foam) },
      uSky: { value: new THREE.Color() }, uGlow: { value: W.glow || 0 }, uFlow: { value: new THREE.Vector2(...(W.flow || [0.3, 0.2])) },
    }]),
    vertexShader: `varying vec2 vXZ; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDepth; uniform float uTime, uR, uMode, uGlow; uniform vec3 cShallow, cDeep, cFoam, uSky; uniform vec2 uFlow;
      varying vec2 vXZ; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      vec2 cell(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y); vec2 r = o + vec2(h(i + o), h(i + o + 7.3)) - f; float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return vec2(sqrt(d1), sqrt(d2)); }
      void main() {
        vec2 uv = (vXZ + uR) / (2.0 * uR);
        float d = texture2D(tDepth, uv).r;
        vec2 p = floor(vXZ * 10.0) / 10.0; // 像素化采样，和地面一致
        vec3 c; float a = 0.9;
        if (uMode < 0.5) {
          c = mix(cShallow, cDeep, smoothstep(0.0, 0.75, d));
          float w = vn(p * 0.9 + uFlow * uTime * 0.6) * 0.6 + vn(p * 2.1 - uFlow.yx * uTime * 0.9) * 0.4;
          c = mix(c, uSky, 0.12);
          float rip = abs(w - 0.55);
          c += smoothstep(0.035, 0.0, rip) * 0.08 * (1.0 - smoothstep(0.3, 0.9, d) * 0.5);
          c += step(0.985, vn(p * 4.0 + vec2(uTime * 0.7, -uTime * 0.5))) * 0.35;
          float band = d - 0.05 * sin(uTime * 1.8 + vXZ.x * 1.3 + vXZ.y * 1.1);
          float foam = smoothstep(0.1, 0.06, band) * step(0.0, d - 0.005);
          float foam2 = smoothstep(0.02, 0.0, abs(band - 0.17)) * 0.6;
          c = mix(c, cFoam, max(foam, foam2));
          c += cShallow * uGlow * (1.0 - d);
          a = mix(0.7, 0.94, smoothstep(0.0, 0.5, d));
        } else if (uMode < 1.5) {
          vec2 v = cell(p * 0.6);
          c = mix(cShallow, cDeep, smoothstep(0.1, 0.9, d) * 0.6);
          c = mix(c, vec3(1.0), smoothstep(0.06, 0.0, v.y - v.x) * 0.7);
          c += smoothstep(0.92, 1.0, vn(p * 3.0 + uTime * 0.05)) * 0.4;
          c = mix(c, cFoam, smoothstep(0.08, 0.0, d) * 0.8);
          a = 0.96;
        } else {
          vec2 v = cell(p * 0.7 + vec2(uTime * 0.05, uTime * 0.03));
          float crust = smoothstep(0.05, 0.25, v.y - v.x);
          float pulse = 0.85 + 0.15 * sin(uTime * 2.0 + vn(p) * 6.0);
          c = mix(cFoam * 2.4, cShallow * 1.6, smoothstep(0.0, 0.2, v.y - v.x));
          c = mix(c, vec3(0.12, 0.06, 0.06), crust * 0.85 * smoothstep(0.0, 0.25, d)) * pulse;
          c = mix(c, cDeep * 0.5, smoothstep(0.06, 0.0, d));
          a = 1.0;
        }
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(R - 0.6, 96).rotateX(-Math.PI / 2), waterMat);
  m.position.y = W.level; m.renderOrder = 1;
  root.add(m);
  if (mode === 2) emitters.push({ p: new THREE.Vector3(0, 0, 0), color: '#ff6a2a', i: 0, d: 0, lava: true });
}

// ======================================================================
// 撒点
// ======================================================================
function placeAll(b, hAt) {
  const rng = mulberry32(S.seed * 1013 + S.biome * 7);
  const taken = []; // [x, z, r, id]
  const level = b.water ? b.water.level : -99;
  const free = (x, z, r) => taken.every(([tx, tz, tr]) => (x - tx) ** 2 + (z - tz) ** 2 > (r + tr) ** 2);
  const groups = new Map(); // id → [ [variant list] ]
  const add = (id, v, o) => {
    if (!groups.has(id)) groups.set(id, new Map());
    const g = groups.get(id); if (!g.has(v)) g.set(v, []);
    g.get(v).push(o);
  };
  for (const rule of b.scatter) {
    const A = ASSETS[rule.id], gap = rule.gap ?? 1;
    if (rule.list) {
      rule.list.forEach(([x, z, rot], i) => {
        const v = rule.pick ? rule.pick[i % rule.pick.length] : Math.floor(rng() * A.n);
        const o = { x, z, y: rule.y ?? hAt(x, z), rot, s: 1 };
        add(rule.id, v, o); taken.push([x, z, 1.4, rule.id]);
      });
      continue;
    }
    if (rule.grid) {
      const [x0, z0, st, cols, rows] = rule.grid;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        const x = x0 + c * st, z = z0 + r * st;
        add(rule.id, Math.floor(rng() * A.n), { x, z, y: hAt(x, z), rot: 0, s: 1.1 }); taken.push([x, z, 0.8, rule.id]);
      }
      continue;
    }
    let placed = 0;
    for (let tries = 0; tries < rule.n * 40 && placed < rule.n; tries++) {
      let x, z;
      if (rule.cloud) {
        const a = rng() * Math.PI * 2, r = 4 + rng() * (R - 4);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        const o = { x, z, y: 6 + rng() * 5, rot: rng() * 6, s: lerp(rule.s[0], rule.s[1], rng()), bob: rng() * 6 };
        add(rule.id, Math.floor(rng() * A.n), o); placed++; continue;
      }
      if (rule.near) {
        const ref = taken.filter((t) => t[3] === rule.near);
        if (!ref.length) break;
        const t = ref[Math.floor(rng() * ref.length)], a = rng() * Math.PI * 2, d = t[2] + 0.3 + rng() * 1.4;
        x = t[0] + Math.cos(a) * d; z = t[1] + Math.sin(a) * d;
      } else if (rule.zone) {
        x = -R + rng() * 2 * R; z = -R + rng() * 2 * R;
        if (!rule.zone(x, z)) continue;
      } else {
        const [r0, r1] = rule.r || [2.5, R - 1.2], a = rng() * Math.PI * 2, r = Math.sqrt(lerp(r0 * r0, r1 * r1, rng()));
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      }
      if (Math.hypot(x, z) > R - 1 || Math.hypot(x, z - 2) < 1.6) continue;
      const t = b.terrain(x, z), h = hAt(x, z);
      if (rule.water) { if (h > level - 0.12) continue; }
      else if (h < level + 0.02 || (rule.k && !rule.k.includes(t.k))) continue;
      const s = lerp(rule.s[0], rule.s[1], rng());
      if (!free(x, z, gap * s * 0.5)) continue;
      const o = { x, z, y: rule.water ? level + 0.01 : h - 0.03, rot: rng() * Math.PI * 2, s, sy: s * (0.9 + rng() * 0.2) };
      if (rule.float) o.bob = rng() * 6;
      add(rule.id, Math.floor(rng() * A.n), o);
      taken.push([x, z, gap * s * 0.5, rule.id]);
      placed++;
    }
  }
  // 少量或需要动画的用克隆，多的用实例化
  for (const [id, vs] of groups) for (const [v, list] of vs) {
    const proto = getAsset(id, v), light = proto.userData.light;
    if (list.length <= 4 || list[0].bob !== undefined) {
      for (const o of list) {
        const c = proto.clone(); c.position.set(o.x, o.y, o.z); c.rotation.y = o.rot || 0; c.scale.set(o.s, o.sy ?? o.s, o.s);
        if (o.bob !== undefined) { c.userData.bob = o.bob; c.userData.y0 = o.y; bobbers.push(c); }
        root.add(c);
      }
    } else root.add(instance(proto, list));
    if (light) for (const o of list) emitters.push({ p: new THREE.Vector3(o.x, o.y + light.y * (o.sy ?? o.s), o.z), color: light.color, i: light.i, d: light.d * o.s, flicker: light.flicker, smoke: light.smoke, k: Math.random() * 9 });
  }
}

// ======================================================================
// 图鉴模式：所有素材 × 所有变体排成网格，便于逐个检查
// ======================================================================
function buildCatalog(ids) {
  const rows = ids.map((id) => {
    const A = ASSETS[id], items = [];
    for (let v = 0; v < A.n; v++) {
      const g = getAsset(id, v), box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
      items.push({ g, v, w: Math.max(1.4, size.x, size.z), h: size.y, box });
    }
    return { id, name: A.name, items, w: items.reduce((s, it) => s + it.w + 0.9, 0), d: Math.max(...items.map((it) => it.w)) };
  });
  const perCol = ids.length > 16 ? Math.ceil(ids.length / Math.ceil(ids.length / 14)) : ids.length;
  const cols = [];
  for (let i = 0; i < rows.length; i += perCol) cols.push(rows.slice(i, i + perCol));
  const colW = cols.map((c) => Math.max(...c.map((r) => r.w)));
  let x0 = -colW.reduce((s, w) => s + w + 4, -4) / 2, maxZ = 0;
  cols.forEach((col, ci) => {
    const depth = col.reduce((s, r) => s + r.d + 1.6, 0);
    let z = -depth / 2;
    for (const row of col) {
      z += row.d / 2;
      let x = x0;
      const lbl = mkLabel(`${row.name} <i>×${row.items.length}</i>`, 'row');
      lbl.pos = new THREE.Vector3(x0 - 0.4, 0.05, z + row.d / 2 + 0.2);
      for (const it of row.items) {
        const c = it.g.clone(), cx = (it.box.min.x + it.box.max.x) / 2, cz = (it.box.min.z + it.box.max.z) / 2;
        c.position.set(x + it.w / 2 - cx, 0, z - cz);
        root.add(c);
        const light = c.userData.light;
        if (light) emitters.push({ p: new THREE.Vector3(c.position.x + cx, light.y, z), color: light.color, i: light.i, d: light.d, flicker: light.flicker, smoke: light.smoke, k: Math.random() * 9 });
        const vl = mkLabel(String(it.v + 1), 'var');
        vl.pos = new THREE.Vector3(x + it.w / 2, it.h + 0.35, z);
        x += it.w + 0.9;
      }
      z += row.d / 2 + 1.6;
      maxZ = Math.max(maxZ, Math.abs(z));
    }
    x0 += colW[ci] + 4;
  });
  const span = Math.max(Math.abs(x0), maxZ) + 6;
  // 摄影棚地面：浅色格子
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span * 2.4, span * 2.4).rotateX(-Math.PI / 2), toon('#ffffff', {
    unique: true,
    map: canvasTex(64, 64, (ctx) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const v = ((x >> 3) + (y >> 3)) & 1 ? 214 : 226, n = Math.floor(hash01(x, y, 4) * 8);
        ctx.fillStyle = `rgb(${v + n},${v + n - 4},${v + n - 14})`; ctx.fillRect(x, y, 1, 1);
      }
    }),
  }));
  floor.material.map.repeat.set(span * 2.4 / 4, span * 2.4 / 4);
  floor.receiveShadow = true; floor.position.y = -0.01;
  root.add(floor);
  return span;
}

// ---------- 标签 ----------
function mkLabel(html, cls) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = html;
  $('#labels').appendChild(el);
  const o = { el, pos: new THREE.Vector3() }; labels.push(o);
  return o;
}
const _v = new THREE.Vector3();
function updateLabels() {
  const show = S.labels && S.mode !== 'scene';
  $('#labels').style.display = show ? '' : 'none';
  if (!show) return;
  for (const l of labels) {
    _v.copy(l.pos).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    l.el.style.display = vis ? '' : 'none';
    if (vis) l.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}

// ======================================================================
// 粒子：雪 / 落叶 / 花瓣 / 萤火 / 灵光 / 火星 / 灰烬 / 烟
// ======================================================================
const PT = {
  snow: { vy: -1.2, sway: 0.8, h: 14, shape: 0 }, leaves: { vy: -0.9, sway: 1.4, h: 12, shape: 1 }, petals: { vy: -0.6, sway: 1.6, h: 10, shape: 1 },
  fireflies: { vy: 0.15, sway: 1.2, h: 3, shape: 2, blink: 1 }, motes: { vy: 0.25, sway: 0.9, h: 7, shape: 2 },
  embers: { vy: 1.6, sway: 0.7, h: 10, shape: 2, flick: 1 }, ash: { vy: -0.4, sway: 1.2, h: 10, shape: 0 },
};
function particles(cfg, area = R) {
  const T = PT[cfg.type], n = cfg.n, rnd = new Float32Array(n * 4), pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 4; i++) rnd[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), area * 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: cfg.glow || T.shape === 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: U.time, uR: { value: area }, uH: { value: T.h }, uVy: { value: T.vy }, uSway: { value: T.sway }, uSize: { value: cfg.size }, uPR: { value: 1 },
      uColor: { value: new THREE.Color(cfg.color).multiplyScalar(cfg.glow ? 1.8 : 1) }, uShape: { value: T.shape }, uBlink: { value: T.blink || 0 }, uAlpha: { value: 1 } },
    vertexShader: `attribute vec4 aRnd; uniform float uTime, uR, uH, uVy, uSway, uSize, uPR, uBlink; varying float vA; varying float vRot;
      void main() {
        float sp = 0.6 + aRnd.w * 0.8;
        vec3 p = vec3((aRnd.x * 2.0 - 1.0) * uR, mod(aRnd.z * uH + uTime * uVy * sp, uH), (aRnd.y * 2.0 - 1.0) * uR);
        p.x += sin(uTime * (0.5 + aRnd.w) + aRnd.z * 20.0) * uSway;
        p.z += cos(uTime * (0.4 + aRnd.x * 0.6) + aRnd.y * 20.0) * uSway;
        p.y += 0.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(uSize * (0.6 + aRnd.w * 0.8) * uPR * (60.0 / -mv.z), 18.0 * uPR);
        float e = p.y / uH;
        vA = smoothstep(0.0, 0.08, e) * smoothstep(1.0, 0.85, e) * step(length(p.xz), uR * 1.05);
        if (uBlink > 0.5) vA *= smoothstep(0.3, 1.0, sin(uTime * (1.5 + aRnd.x * 2.0) + aRnd.y * 30.0));
        vRot = uTime * (aRnd.x - 0.5) * 4.0 + aRnd.y * 6.0;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uShape, uAlpha; varying float vA; varying float vRot;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float a;
        if (uShape < 0.5) a = step(max(abs(q.x), abs(q.y)), 0.32);
        else if (uShape < 1.5) { float c = cos(vRot), s = sin(vRot); q = mat2(c, s, -s, c) * q; a = step(abs(q.x) / 0.42 + abs(q.y) / 0.22, 1.0); }
        else a = smoothstep(0.5, 0.0, length(q));
        gl_FragColor = vec4(uColor * (uShape > 0.5 && uShape < 1.5 ? 0.8 + 0.4 * step(0.0, q.y) : 1.0), a * vA * uAlpha);
      }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  pts.userData.night = !!cfg.night;
  return pts;
}
// 烟：每个烟源一小柱
function smoke(list) {
  if (!list.length) return null;
  const per = 26, n = list.length * per, pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
  list.forEach((e, k) => { for (let i = 0; i < per; i++) { const j = k * per + i; pos.set([e.p.x, e.p.y, e.p.z], j * 3); for (let c = 0; c < 4; c++) rnd[j * 4 + c] = Math.random(); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: U.time },
    vertexShader: `attribute vec4 aRnd; uniform float uTime; varying float vA;
      void main() { float t = fract(aRnd.x + uTime * (0.12 + aRnd.y * 0.08));
        vec3 p = position + vec3(sin(t * 6.0 + aRnd.z * 9.0) * 0.25 * t + t * 0.6, t * 3.2, cos(t * 5.0 + aRnd.w * 9.0) * 0.2 * t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = min((10.0 + t * 40.0) * (30.0 / -mv.z), 90.0); vA = smoothstep(0.0, 0.1, t) * (1.0 - t) * 0.45; }`,
    fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.82, 0.8, 0.78), smoothstep(0.5, 0.2, d) * vA); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return pts;
}

// ======================================================================
// 构建 / 切换
// ======================================================================
let chibi = null, span = R, hAtCur = null;
function clear() {
  scene.remove(root);
  root.traverse((o) => { if (o.material && o.material.map && o.material.map.isCanvasTexture && o.material.userData.own) o.material.map.dispose(); });
  root = new THREE.Group(); scene.add(root);
  emitters = []; bobbers = []; particleSys = []; waterMat = null;
  labels = []; $('#labels').innerHTML = '';
}
function build() {
  clear();
  const b = BIOMES[S.biome];
  if (S.mode === 'scene') {
    const hAt = buildIsland(b); hAtCur = hAt;
    buildWater(b, hAt);
    placeAll(b, hAt);
    span = R;
    for (const p of b.particles) { const ps = particles(p); root.add(ps); particleSys.push(ps); }
  } else {
    const ids = S.mode === 'all' ? [...new Set(BIOMES.flatMap((x) => x.catalog))] : b.catalog;
    span = buildCatalog(ids);
    hAtCur = () => 0;
  }
  const sm = smoke(emitters.filter((e) => e.smoke)); if (sm) { root.add(sm); particleSys.push(sm); }
  // 参照角色
  if (!chibi) {
    chibi = createChibi({ skin: '#f8d8bc', hair: '#4a2e22', hairStyle: 2, robe: '#f2f4f6', robe2: '#4f7fb0', belt: '#3a5a78', pants: '#3a4250', sword: true });
    chibi.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  }
  // 角色站在离中心最近的陆地上
  const lvl = S.mode === 'scene' && b.water ? b.water.level + 0.1 : -99;
  let cp = [0, 2];
  for (let r = 0; r < R && hAtCur(cp[0], cp[1]) < lvl; r += 0.5) cp = [0, 2 - r];
  chibi.root.position.set(cp[0], hAtCur(cp[0], cp[1]), cp[1]);
  root.add(chibi.root);
  // 阴影范围跟着场景大小
  const sc = sun.shadow.camera, ext = S.mode === 'scene' ? R + 2 : span;
  Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: ext * 4 + 60 });
  sc.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096);
  applyToggles();
  applyLight();
  ui();
  stats.counts = countAssets();
}
function countAssets() {
  const ids = S.mode === 'scene' ? [...new Set(BIOMES[S.biome].scatter.map((r) => r.id))] : S.mode === 'all' ? [...new Set(BIOMES.flatMap((x) => x.catalog))] : BIOMES[S.biome].catalog;
  return { types: ids.length, variants: ids.reduce((s, id) => s + ASSETS[id].n, 0) };
}
function frame(reset = true) {
  if (!reset) return;
  if (S.mode === 'scene') { camera.position.set(0, 26, 40); controls.target.set(0, 0.5, 0); }
  else { const d = span * 1.6; camera.position.set(0, d * 0.75, d * 0.9); controls.target.set(0, 0.5, 0); }
}

// ---------- 时间 / 光照 ----------
const _a = new THREE.Color(), _b = new THREE.Color();
const NIGHT = { sky: new THREE.Color('#3a4a80'), ground: new THREE.Color('#141a24'), top: new THREE.Color('#0a1028'), bottom: new THREE.Color('#1a2448'), fog: new THREE.Color('#141c38') };
let nightK = 0;
function applyLight() {
  const L = BIOMES[S.biome].light, t = S.time;
  const elev = Math.sin((t - 6) / 12 * Math.PI), az = (t - 6) / 12 * Math.PI;
  const day = smooth(-0.12, 0.3, elev), dusk = smooth(0.45, 0.05, Math.abs(elev)) * day;
  nightK = 1 - day;
  const e = Math.max(0.25, elev);
  sun.position.set(Math.cos(az) * 40 * Math.cos(Math.asin(Math.min(e, 1))), e * 45 + 5, 25);
  sun.target.position.set(0, 0, 0);
  _a.set(L.sun).lerp(_b.set('#ff8a4a'), dusk * 0.8);
  sun.color.copy(_a).lerp(_b.set('#8aa0ff'), nightK);
  sun.intensity = L.sunI * day + 0.35 * nightK * (L.dark ? 0.3 : 1);
  hemi.color.set(L.sky).lerp(NIGHT.sky, nightK * 0.85);
  hemi.groundColor.set(L.ground).lerp(NIGHT.ground, nightK * 0.85);
  hemi.intensity = lerp(L.hemiI, 0.55, nightK);
  skyU.top.value.set(L.top).lerp(NIGHT.top, nightK).lerp(_b.set('#e88a6a'), dusk * 0.3);
  skyU.bottom.value.set(L.bottom).lerp(NIGHT.bottom, nightK).lerp(_b.set('#ffb88a'), dusk * 0.6);
  skyU.sunDir.value.copy(sun.position).normalize();
  skyU.sunC.value.copy(sun.color).multiplyScalar(day * (L.dark ? 0 : 1));
  scene.fog.color.set(L.fog).lerp(NIGHT.fog, nightK).lerp(_b.set('#f0b090'), dusk * 0.35);
  if (S.mode === 'scene') { scene.fog.near = L.fogNear || 55; scene.fog.far = L.fogFar || 120; }
  else { scene.fog.near = span * 2.2; scene.fog.far = span * 5; }
  renderer.toneMappingExposure = L.exposure;
  bloom.strength = L.bloom + nightK * 0.25;
  grade.uniforms.uWarm.value = L.warm ?? 1;
  if (waterMat) waterMat.uniforms.uSky.value.copy(skyU.top.value);
  $('#timeV').textContent = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;
}

// ---------- 点光源池：给离镜头焦点最近的光源 ----------
function updateLights(time) {
  const focus = controls.target, dark = BIOMES[S.biome].light.dark, boost = dark ? 1.6 : lerp(0.25, 1.4, nightK);
  const list = emitters.filter((e) => !e.lava).map((e) => ({ e, d: e.p.distanceToSquared(focus) - e.i * 30 })).sort((a, b) => a.d - b.d);
  pool.forEach((l, i) => {
    const it = list[i];
    if (!it) { l.intensity = 0; return; }
    const e = it.e; l.position.copy(e.p); l.color.set(e.color);
    l.distance = e.d * 1.4;
    l.intensity = e.i * boost * 2.2 * (e.flicker ? 0.85 + Math.sin(time * 13 + e.k) * 0.08 + Math.sin(time * 7.3 + e.k * 2) * 0.07 : 1);
  });
}

// ---------- 开关 ----------
function applyToggles() {
  root.traverse((o) => { if (o.userData.isLine) o.visible = S.outline; });
  sun.castShadow = S.shadows;
  bloom.enabled = S.bloom; grade.enabled = S.grade;
  for (const p of particleSys) p.visible = S.particles;
  if (chibi) chibi.root.visible = S.chibi && S.mode === 'scene';
  const pr = S.pixel ? 0.42 : Math.min(devicePixelRatio, 1.5);
  if (pr !== pixelRatio) { pixelRatio = pr; resize(); }
  renderer.domElement.style.imageRendering = S.pixel ? 'pixelated' : 'auto';
}

// ======================================================================
// UI
// ======================================================================
function ui() {
  document.querySelectorAll('#biomes button').forEach((b, i) => b.classList.toggle('on', i === S.biome));
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === S.mode));
  document.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', !!S[b.dataset.t]));
  const b = BIOMES[S.biome];
  $('#title').innerHTML = S.mode === 'all' ? '全部素材 <small>所有区域的图鉴</small>' : `${b.name} <small>${b.sub}</small>`;
  $('#time').value = S.time;
}
function setupUI() {
  const bx = $('#biomes');
  BIOMES.forEach((b, i) => {
    const el = document.createElement('button'); el.innerHTML = `<kbd>${i + 1}</kbd>${b.name}`;
    el.onclick = () => { S.biome = i; if (S.mode === 'all') S.mode = 'catalog'; save(); build(); frame(); };
    bx.appendChild(el);
  });
  document.querySelectorAll('#modes button').forEach((el) => el.onclick = () => { S.mode = el.dataset.m; save(); build(); frame(); });
  document.querySelectorAll('[data-t]').forEach((el) => el.onclick = () => { S[el.dataset.t] = !S[el.dataset.t]; save(); applyToggles(); ui(); });
  $('#time').oninput = (e) => { S.time = +e.target.value; save(); applyLight(); };
  $('#wind').oninput = (e) => { U.wind.value = +e.target.value; };
  $('#line').oninput = (e) => { U.line.value = +e.target.value; };
  $('#reseed').onclick = () => { S.seed++; save(); build(); };
  $('#shot').onclick = () => { composer.render(); const a = document.createElement('a'); a.download = `lab-${BIOMES[S.biome].id}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click(); };
  $('#hideui').onclick = () => document.body.classList.toggle('clean');
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const n = +e.key; if (n >= 1 && n <= BIOMES.length) { S.biome = n - 1; if (S.mode === 'all') S.mode = 'catalog'; save(); build(); frame(); }
    if (e.key === 'c' || e.key === 'C') { S.mode = S.mode === 'scene' ? 'catalog' : 'scene'; save(); build(); frame(); }
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
    if (e.key === 'r' || e.key === 'R') { S.seed++; save(); build(); }
    if (e.key === 'o' || e.key === 'O') { S.outline = !S.outline; save(); applyToggles(); ui(); }
    if (e.key === 'p' || e.key === 'P') { S.pixel = !S.pixel; save(); applyToggles(); ui(); }
  });
}

// ---------- 统计 ----------
const stats = { fps: 0, acc: 0, n: 0, counts: { types: 0, variants: 0 } };
function updateStats(dt) {
  stats.acc += dt; stats.n++;
  if (stats.acc > 0.5) {
    stats.fps = Math.round(stats.n / stats.acc); stats.acc = 0; stats.n = 0;
    const i = renderer.info.render;
    $('#stats').textContent = `${stats.fps} fps · ${i.calls} draw · ${(i.triangles / 1000).toFixed(0)}k tri · ${stats.counts.types} 种素材 / ${stats.counts.variants} 个变体`;
  }
}

// ======================================================================
// 启动
// ======================================================================
await loadTextures({ foliage: { norm: 0.88 }, peach_foliage: { norm: 0.88 } });
setupUI();
build(); frame();
$('#loading').remove();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  U.time.value = t;
  if (S.spin) controls.autoRotate = true, controls.autoRotateSpeed = 0.6; else controls.autoRotate = false;
  controls.update();
  for (const b of bobbers) b.position.y = b.userData.y0 + Math.sin(t * 1.2 + b.userData.bob) * (b.userData.y0 > 3 ? 0.3 : 0.04);
  for (const p of particleSys) {
    if (p.material.uniforms.uPR) p.material.uniforms.uPR.value = pixelRatio * innerHeight / 900;
    if (p.userData.night) p.material.uniforms.uAlpha.value = nightK;
  }
  if (chibi && chibi.root.visible) { animChibi(chibi, dt, { move: 0, attack: -1, cast: 0, work: 0 }); chibi.root.rotation.y = Math.sin(t * 0.3) * 0.6; }
  updateLights(t);
  composer.render();
  updateStats(dt);
  renderer.info.reset();
  updateLabels();
});
renderer.info.autoReset = false;
