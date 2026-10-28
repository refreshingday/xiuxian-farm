import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadTextures, PNG, toon, canvasTex, mulberry32, hash01, smooth, clamp, lerp } from '../util.js';
import { createChibi, animChibi } from '../chibi.js';
import { TouchControls } from '../touch.js';
import { U, instance } from './kit.js';
import { ASSETS, getAsset } from './assets.js';
import { CODEX, CODEX_TEXTURES, CODEX_ERRORS, loadCodex, getCodexAsset } from './codex/index.js';
import { BIOMES, R } from './biomes.js';

// ======================================================================
// 素材实验场：只加载场景素材，不跑游戏逻辑。改素材只需刷新这一页。
// ======================================================================
const $ = (s) => document.querySelector(s);
const status = (t, pct) => window.labStatus && window.labStatus(t, pct);
// 手机：触屏或窄屏 → 降低分辨率/阴影/粒子，界面改成底部抽屉
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
if (MOBILE) document.body.classList.add('mobile');
const basePR = () => Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.5);
const SHADOW = MOBILE ? 2048 : 4096;
status('初始化渲染器…', 10);

// ---------- 渲染（与主游戏一致的管线：卡通材质 + 软阴影 + 泛光 + 调色） ----------
const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
let pixelRatio = basePR();
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
sun.shadow.mapSize.set(SHADOW, SHADOW);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const pool = [];
for (let i = 0; i < (MOBILE ? 6 : 10); i++) { const l = new THREE.PointLight(0xffaa66, 0, 8, 1.6); scene.add(l); pool.push(l); }

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
  biome: 0, mode: 'scene', src: 'claude', time: 10, seed: 1,
  outline: false, shadows: true, bloom: true, grade: true, particles: true, chibi: true, labels: true, spin: false,
};
try { Object.assign(S, JSON.parse(localStorage.getItem('xxlab') || '{}')); } catch { /* 无痕模式等 */ }
const save = () => { try { localStorage.setItem('xxlab', JSON.stringify(S)); } catch { /* ignore */ } };

let root = new THREE.Group(); scene.add(root);
let emitters = [], bobbers = [], labels = [], waterMats = [], particleSys = [];

// ======================================================================
// 地面：圆形小岛（像素贴图顶面 + 分层土壁）
// ======================================================================
// 地面网格：台地需要细网格（断崖才够陡），普通地形粗一些
const NS = MOBILE ? 128 : 168;
let groundTex = null;
const ROCK = { winter: '#7a8090', cave: '#5a5468', volcano: '#4a3a3a', desert: '#c8a070', tribulation: '#5a5668', battlefield: '#6a625a' };
const _white = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1); _white.needsUpdate = true;
function buildIsland(b) {
  const T = (x, z) => b.terrain(x, z), TR = !!b.terrace;
  const hRaw = (x, z) => {
    const r = Math.hypot(x, z), th = T(x, z).h + 0.35; // 陆地整体抬高，避免噪声低洼处露出水面
    if (TR) return th - smooth(R - 0.5, R, r) * 0.25;
    return th * (1 - smooth(R - 1.2, R, r)) + smooth(R - 1.2, R, r) * Math.min(th, 0.5) - smooth(R - 0.5, R, r) * 0.25;
  };
  // 高度网格（地形函数很贵，先采样一次）；hAt 用双线性插值查表
  const HN = TR ? (MOBILE ? 170 : 250) : (MOBILE ? 110 : 140), cs = 2 * R / HN, W1 = HN + 1;
  const H = new Float32Array(W1 * W1), PX = new Float32Array(W1 * W1), PZ = new Float32Array(W1 * W1);
  for (let j = 0; j <= HN; j++) for (let i = 0; i <= HN; i++) {
    let x = -R + i * cs, z = -R + j * cs; const r = Math.hypot(x, z);
    if (r > R) { x *= R / r; z *= R / r; } // 圆外的点收到圆边上
    const k = j * W1 + i; PX[k] = x; PZ[k] = z; H[k] = hRaw(x, z);
  }
  const hAt = (x, z) => {
    const fx = clamp((x + R) / cs, 0, HN - 1e-4), fz = clamp((z + R) / cs, 0, HN - 1e-4), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * W1 + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + W1] * (1 - u) + H[k + W1 + 1] * u) * v;
  };
  // 顶面
  const pos = new Float32Array(W1 * W1 * 3), uv = new Float32Array(W1 * W1 * 2), idx = [];
  for (let k = 0; k < W1 * W1; k++) { pos[k * 3] = PX[k]; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = PZ[k]; uv[k * 2] = (PX[k] + R) / (2 * R); uv[k * 2 + 1] = 1 - (PZ[k] + R) / (2 * R); }
  const out = (i, j) => Math.hypot(-R + i * cs, -R + j * cs) > R;
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    if (out(i, j) && out(i + 1, j) && out(i, j + 1) && out(i + 1, j + 1)) continue;
    const a = j * W1 + i, bb = a + 1, c = a + W1, d = c + 1;
    // 对角线顺着高度差小的方向切，断崖边更平整
    if (Math.abs(H[a] - H[d]) < Math.abs(H[bb] - H[c])) idx.push(a, c, d, a, d, bb); else idx.push(a, c, bb, bb, c, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  top.setIndex(idx); top.computeVertexNormals();
  // 地面颜色贴图（线性过滤，平滑）：每单位约 10 像素；烘进环境光遮蔽（坡脚、崖底变暗）和高处提亮
  const N = 512, AO_R = 0.8, dirs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos(k / 8 * Math.PI * 2) * AO_R, Math.sin(k / 8 * Math.PI * 2) * AO_R]);
  const tex = canvasTex(N, N, (ctx) => {
    const img = ctx.createImageData(N, N), D = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -R + (i + 0.5) / N * 2 * R, z = -R + (j + 0.5) / N * 2 * R;
      const t = T(x, z), c = b.color(x, z, t), h = hAt(x, z);
      let occ = 0; for (const [dx, dz] of dirs) occ += clamp((hAt(x + dx, z + dz) - h) / 0.9, 0, 1);
      const d = (1 - 0.42 * occ / 8) * (1 + clamp(h - 0.35, 0, 4) * 0.035);
      const k = (j * N + i) * 4;
      D[k] = c[0] * d; D[k + 1] = c[1] * d; D[k + 2] = c[2] * d; D[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: false, pixel: false });
  groundTex = tex;
  // 陡坡（断崖）改用三向投影岩壁贴图 + 横向岩层；坡顶坡底各压一道暗边
  const gm = toon('#ffffff', { map: tex, unique: true });
  const rockC = new THREE.Color(b.terrace?.rock || ROCK[b.id] || '#8a8478');
  gm.onBeforeCompile = (sh) => {
    sh.uniforms.tCliff = { value: PNG.cliff_rock || _white }; sh.uniforms.uRock = { value: rockC };
    sh.vertexShader = 'varying vec3 vGW;\nvarying vec3 vGN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform sampler2D tCliff;\nuniform vec3 uRock;\nvarying vec3 vGW;\nvarying vec3 vGN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 gn = normalize(vGN);
    float steep = 1.0 - smoothstep(0.42, 0.74, gn.y);
    if (steep > 0.001) {
      vec3 bw = pow(abs(gn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
      vec3 q = vGW * 0.3;
      vec3 tx = texture2D(tCliff, q.zy).rgb * bw.x + texture2D(tCliff, q.xy).rgb * bw.z + texture2D(tCliff, q.xz).rgb * bw.y;
      float strata = 0.86 + 0.14 * step(0.5, fract(vGW.y * 2.2 + tx.r * 0.6));
      diffuseColor.rgb = mix(diffuseColor.rgb, uRock * tx * 1.15 * strata, steep);
    }
    diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.08, 0.3, steep) * (1.0 - smoothstep(0.45, 0.8, steep));
  }`);
  };
  gm.customProgramCacheKey = () => 'labGround';
  const topM = new THREE.Mesh(top, gm);
  topM.receiveShadow = true; topM.castShadow = TR;
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
      wall.push(Math.cos(a) * rr, li === 0 ? h : (TR ? h : Math.min(h, 0.5)) + dy + wob, Math.sin(a) * rr);
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
  flowLine = b.terrace?.stream || null;
  makeWater(W, hAt, { x: 0, z: 0, r: R - 0.6 });
  // 台地上的高处水潭：同一种水，只是单独一层水面，用遮罩裁掉崖外部分
  for (const p of b.terrace?.pools || []) makeWater({ ...W, level: p.level }, hAt, p, true);
  for (const f of b.terrace?.falls || []) waterfall(f, W);
}
let flowLine = null;
function flowAt(x, z) {
  if (!flowLine) return [0, 0];
  let best = 9, fx = 0, fz = 0;
  for (let i = 1; i < flowLine.length; i++) {
    const [ax, az] = flowLine[i - 1], [bx, bz] = flowLine[i], vx = bx - ax, vz = bz - az, L = Math.hypot(vx, vz);
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (L * L), 0, 1), d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) { best = d; fx = vx / L; fz = vz / L; }
  }
  const k = smooth(1.6, 0.4, best);
  return [fx * k, fz * k];
}
// UniformsUtils.merge 会克隆每个 uniform —— 共享的 uTime 必须重新挂回去，否则时间被冻结、水面不动
function fogU(o) { const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, o]); if (o.uTime) u.uTime = o.uTime; return u; }
function makeWater(W, hAt, area, masked = false) {
  const N = masked ? 64 : 192, data = new Uint8Array(N * N * 4), x0 = area.x - area.r, z0 = area.z - area.r, sz = area.r * 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) / N * sz, z = z0 + (j + 0.5) / N * sz, dep = W.level - hAt(x, z);
    data[(j * N + i) * 4] = clamp(dep / 0.9, 0, 1) * 255;
    data[(j * N + i) * 4 + 1] = dep < (masked ? 0.85 : 1.0) ? 255 : 0; // 遮罩：太深 = 已经是崖下，不画
    // B/A：溪流流向 × 强度（离溪流中线 1.6 米内），水面沿着它滚动条纹
    const [fx, fz] = flowAt(x, z);
    data[(j * N + i) * 4 + 2] = (fx * 0.5 + 0.5) * 255; data[(j * N + i) * 4 + 3] = (fz * 0.5 + 0.5) * 255;
  }
  const dt = new THREE.DataTexture(data, N, N); dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const mode = { water: 0, ice: 1, lava: 2 }[W.mode];
  const mat = new THREE.ShaderMaterial({
    transparent: mode !== 2, fog: true,
    uniforms: fogU({
      tDepth: { value: dt }, uTime: U.time, uOrigin: { value: new THREE.Vector2(x0, z0) }, uSize: { value: sz }, uMask: { value: masked ? 1 : 0 }, uMode: { value: mode },
      cShallow: { value: new THREE.Color(W.shallow) }, cDeep: { value: new THREE.Color(W.deep) }, cFoam: { value: new THREE.Color(W.foam) },
      uSky: { value: new THREE.Color() }, uGlow: { value: W.glow || 0 }, uFlow: { value: new THREE.Vector2(...(W.flow || [0.3, 0.2])) },
    }),
    vertexShader: `varying vec2 vXZ; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDepth; uniform float uTime, uSize, uMask, uMode, uGlow; uniform vec2 uOrigin; uniform vec3 cShallow, cDeep, cFoam, uSky; uniform vec2 uFlow;
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
        vec2 uv = (vXZ - uOrigin) / uSize;
        vec4 dm = texture2D(tDepth, uv);
        if (uMask > 0.5 && (dm.g < 0.5 || length(uv - 0.5) > 0.5)) discard;
        float d = dm.r;
        vec2 p = vXZ;
        vec3 c; float a = 0.9;
        if (uMode < 0.5) {
          c = mix(cShallow, cDeep, smoothstep(0.0, 0.75, d));
          c = mix(c, uSky, 0.12);
          vec2 fl = (dm.ba - 0.5) * 2.0; float fs = length(fl);
          vec2 fd = fs > 0.01 ? fl / fs : vec2(0.0, 1.0);
          // 1) 两层反向滚动的噪声做扰动，让下面的花纹“晃”起来
          vec2 q = p + vec2(vn(p * 0.55 + uTime * vec2(0.21, 0.13)), vn(p * 0.55 + 5.3 - uTime * vec2(0.12, 0.19))) * 1.1;
          // 流动方向：静水用 uFlow 慢漂，溪流里按流向快速顺流
          vec2 drift = uFlow * uTime * 0.35 + fd * fs * uTime * 1.6;
          // 2) 卡通焦散线（风之杖式）：扰动后的 Voronoi 边，两层叠加
          vec2 v1 = cell(q * 0.75 - drift), v2 = cell(q * 1.3 + drift.yx * 0.7 + 3.1);
          float caus = max(smoothstep(0.09, 0.0, v1.y - v1.x), smoothstep(0.06, 0.0, v2.y - v2.x) * 0.6);
          c = mix(c, mix(cFoam, vec3(1.0), 0.3), caus * mix(0.42, 0.22, smoothstep(0.2, 0.9, d)));
          // 波光点点
          c += step(0.975, vn(q * 3.0 + vec2(uTime * 0.9, -uTime * 0.7))) * 0.4;
          // 3) 溪流：沿流向滚动的白色水纹
          if (fs > 0.05) {
            vec2 fp = vec2(-fd.y, fd.x);
            float along = dot(q, fd), across = dot(q, fp);
            float st = vn(vec2(across * 3.0, along * 0.8 - uTime * 3.2)) * 0.65 + vn(vec2(across * 6.5, along * 2.0 - uTime * 4.5)) * 0.35;
            c = mix(c, cFoam, smoothstep(0.58, 0.75, st) * 0.75 * fs);
            c *= 1.0 + 0.1 * fs * sin(along * 5.0 - uTime * 8.0);
          }
          // 4) 岸边泡沫：实心沫边（噪声打碎、呼吸）+ 一圈圈向岸推进的浪线
          float nb = vn(q * 1.8 + uTime * 0.4);
          float edge = d + (nb - 0.5) * 0.06 - 0.03 * sin(uTime * 1.6 + vXZ.x * 0.9 + vXZ.y * 0.7);
          float foam = smoothstep(0.09, 0.055, edge) * step(0.0, d - 0.005);
          float wave = fract(d * 5.0 + uTime * 0.45 + nb * 0.35);
          float rings = smoothstep(0.1, 0.0, abs(wave - 0.5)) * (1.0 - smoothstep(0.08, 0.38, d));
          c = mix(c, cFoam, max(foam, rings * 0.7));
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
          float e = v.y - v.x, pulse = 0.8 + 0.2 * sin(uTime * 2.0 + vn(p * 0.5) * 6.0);
          // 裂缝亮黄 → 橙色熔流 → 暗红硬壳
          c = mix(cFoam * 2.0, cShallow * 1.5, smoothstep(0.0, 0.05, e));
          c = mix(c, cDeep * 0.9, smoothstep(0.05, 0.12, e));
          c = mix(c, vec3(0.16, 0.05, 0.04), smoothstep(0.1, 0.22, e) * 0.9);
          c *= pulse;
          c = mix(c, vec3(0.1, 0.04, 0.04), smoothstep(0.05, 0.0, d) * 0.8);
          a = 1.0;
        }
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(area.r, masked ? 32 : 96).rotateX(-Math.PI / 2), mat);
  m.position.set(area.x, W.level, area.z); m.renderOrder = 1; waterMats.push(mat);
  root.add(m);
  if (mode === 2) emitters.push({ p: new THREE.Vector3(0, 0, 0), color: '#ff6a2a', i: 0, d: 0, lava: true });
  return mat;
}

// 瀑布：从崖顶水道口垂下的一片弯曲水幕（流动条纹）+ 落水处的白沫圈 + 水雾
function waterfall(f, W) {
  const Hh = f.top - f.bottom, seg = 14, g = new THREE.PlaneGeometry(f.w, 1, 4, seg), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 0.5 - p.getY(i); // 0 顶 → 1 底
    p.setXYZ(i, p.getX(i) * (1 + t * 0.25), f.top - t * Hh, -0.25 + Math.pow(t, 0.55) * 0.9);
  }
  g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: fogU({ uTime: U.time, cA: { value: new THREE.Color(W.shallow) }, cB: { value: new THREE.Color(W.foam) } }),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 cA, cB; varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 q = vUv;
        float s = vn(vec2(q.x * 9.0, q.y * 4.0 + uTime * 3.2)) * 0.6 + vn(vec2(q.x * 21.0, q.y * 9.0 + uTime * 5.0)) * 0.4;
        vec3 c = mix(cA * 1.1, cB, smoothstep(0.45, 0.75, s));
        c = mix(c, cB, smoothstep(0.85, 1.0, vUv.y) * 0.7 + smoothstep(0.2, 0.0, vUv.y) * 0.8);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(c * 1.15, (0.78 + 0.2 * s) * edge);
        #include <fog_fragment>
      }`,
  });
  // 局部坐标里水往 +z 流，整体转到溪流方向
  const rot = f.rot ?? 0, fx = Math.sin(rot), fz = Math.cos(rot);
  const m = new THREE.Mesh(g, mat); m.position.set(f.x, 0, f.z); m.rotation.y = rot; m.renderOrder = 2;
  root.add(m);
  // 落水白沫：一圈向外扩散的波纹
  const foam = new THREE.Mesh(new THREE.CircleGeometry(f.w * 1.1, 24).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: U.time },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main() { float r = length(vUv - 0.5) * 2.0; float w = fract(r * 2.5 - uTime * 1.2);
        float a = smoothstep(1.0, 0.55, r) * (0.35 + 0.65 * step(0.6, w)) * 0.85; gl_FragColor = vec4(vec3(0.95, 0.98, 1.0) * 1.3, a); }`,
  }));
  foam.position.set(f.x + fx * 0.75, f.bottom + 0.02, f.z + fz * 0.75); foam.renderOrder = 2;
  root.add(foam);
  // 水雾：落水点附近缓慢上升的白点
  const n = 60, pp = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { pp.set([f.x + fx * 0.75, f.bottom, f.z + fz * 0.75], i * 3); for (let c = 0; c < 4; c++) rnd[i * 4 + c] = Math.random(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); mg.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const mist = new THREE.Points(mg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: U.time, uW: { value: f.w } },
    vertexShader: `attribute vec4 aRnd; uniform float uTime, uW; varying float vA;
      void main() { float t = fract(aRnd.x + uTime * (0.35 + aRnd.y * 0.3));
        vec3 p = position + vec3((aRnd.z - 0.5) * uW * 1.3, t * 1.4, (aRnd.w - 0.3) * 1.2 + t * 0.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = min((6.0 + t * 22.0) * (30.0 / -mv.z), 60.0); vA = (1.0 - t) * smoothstep(0.0, 0.15, t) * 0.5; }`,
    fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, d) * vA); }',
  }));
  mist.frustumCulled = false; root.add(mist); particleSys.push(mist);
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
    const variant = () => (rule.pick ? rule.pick[Math.floor(rng() * rule.pick.length)] : Math.floor(rng() * A.n));
    if (rule.list) {
      rule.list.forEach(([x, z, rot, sz], i) => {
        const v = rule.pick ? rule.pick[i % rule.pick.length] : Math.floor(rng() * A.n);
        let y = rule.y ?? hAt(x, z) + (rule.dy || 0);
        // 台阶类：以下坡那一头（下一级平台）的地面高度为底，避免悬空
        if (rule.base === 'bottom') { const e = 1.5 * (sz || 1) + 0.35; y = hAt(x + Math.sin(rot) * e, z + Math.cos(rot) * e); }
        const o = { x, z, y, rot, s: 1, sz };
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
        add(rule.id, variant(), o); placed++; continue;
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
      // 不放在断崖坡面上（高处水潭里也不放陆地物件）
      if (!rule.water && Math.max(Math.abs(hAt(x + 0.35, z) - hAt(x - 0.35, z)), Math.abs(hAt(x, z + 0.35) - hAt(x, z - 0.35))) > 0.3) continue;
      if (!rule.water && (b.terrace?.pools || []).some((p) => h < p.level + 0.05 && h > p.level - 1.2 && Math.hypot(x - p.x, z - p.z) < p.r)) continue;
      const s = lerp(rule.s[0], rule.s[1], rng());
      if (!free(x, z, gap * s * 0.5)) continue;
      const o = { x, z, y: rule.water ? level + 0.01 : h - 0.03, rot: rng() * Math.PI * 2, s, sy: s * (0.9 + rng() * 0.2) };
      if (rule.float) o.bob = rng() * 6;
      add(rule.id, variant(), o);
      taken.push([x, z, gap * s * 0.5, rule.id]);
      placed++;
    }
  }
  // 少量或需要动画的用克隆，多的用实例化
  for (const [id, vs] of groups) for (const [v, list] of vs) {
    const proto = assetOf(id, v), light = proto.userData.light;
    if (list.length <= 4 || list[0].bob !== undefined || proto.userData.noInstance) {
      for (const o of list) {
        const c = proto.clone(); c.position.set(o.x, o.y, o.z); c.rotation.y = o.rot || 0; c.scale.set(o.s, o.sy ?? o.s, o.sz ?? o.s);
        if (o.bob !== undefined) { c.userData.bob = o.bob; c.userData.y0 = o.y; bobbers.push(c); }
        root.add(c);
      }
    } else root.add(instance(proto, list));
    if (light) for (const o of list) emitters.push({ p: new THREE.Vector3(o.x, o.y + light.y * (o.sy ?? o.s), o.z), color: light.color, i: light.i, d: light.d * o.s, flicker: light.flicker, smoke: light.smoke, k: Math.random() * 9 });
  }
  contactShadows(taken);
}

// 物件脚下的柔和接触阴影：直接画进地面贴图（正片叠底），比实时阴影更"贴地"
function contactShadows(taken) {
  if (!groundTex) return;
  const cv = groundTex.image, ctx = cv.getContext('2d'), N = cv.width;
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  const flat = new Set(['stairs', 'bridge', 'dock', 'crop', 'fence', 'formation', 'cloud', 'floatRock', 'lily', 'lotus', 'steps']);
  for (const [x, z, r, id] of taken) {
    if (r < 0.45 || flat.has(id)) continue; // 草、花太小；平铺类物件不需要
    const px = (x + R) / (2 * R) * N, pz = (z + R) / (2 * R) * N, pr = Math.min(r, 2.2) * 1.1 / (2 * R) * N;
    const gr = ctx.createRadialGradient(px, pz, 0, px, pz, pr);
    gr.addColorStop(0, 'rgba(70,60,50,0.55)'); gr.addColorStop(0.6, 'rgba(120,110,100,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(px - pr, pz - pr, pr * 2, pr * 2);
  }
  ctx.restore();
  groundTex.needsUpdate = true;
}

// ======================================================================
// 图鉴模式：所有素材 × 所有变体排成网格，便于逐个检查
// ======================================================================
// 素材来源：Claude 自己建的（./assets.js）和 Codex 建的（./codex/*.js）严格分开；
// 图鉴里每一行都带来源标签，并且铺不同颜色的底板（Claude 暖黄 / Codex 青绿）
const SRC = {
  claude: { tag: 'Claude', strip: '#f0d9a6', get: (id) => ASSETS[id], build: getAsset },
  codex: { tag: 'Codex', strip: '#a9dcd6', get: (id) => CODEX[id], build: getCodexAsset },
};
const assetOf = (id, v) => (S.src === 'codex' && CODEX[id] ? getCodexAsset(id, v) : getAsset(id, v));
function buildCatalog(ids, mode = 'catalog') {
  const srcs = mode === 'codex' ? ['codex'] : mode === 'compare' ? ['claude', 'codex'] : ['claude'];
  const rows = [];
  for (const id of ids) for (const sk of srcs) {
    const A = SRC[sk].get(id); if (!A) continue;
    const items = [];
    for (let v = 0; v < A.n; v++) {
      const g = SRC[sk].build(id, v), box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
      items.push({ g, v, w: Math.max(1.4, size.x, size.z), h: size.y, box });
    }
    rows.push({ id, sk, name: A.name, items, w: items.reduce((s, it) => s + it.w + 0.9, 0), d: Math.max(...items.map((it) => it.w)), hgt: Math.max(...items.map((it) => it.h)) });
  }
  let perCol = rows.length > 16 ? Math.ceil(rows.length / Math.ceil(rows.length / 14)) : rows.length;
  if (srcs.length === 2 && perCol % 2) perCol++; // 成对的行不拆到两列
  const cols = [];
  for (let i = 0; i < rows.length; i += perCol) cols.push(rows.slice(i, i + perCol));
  const colW = cols.map((c) => Math.max(...c.map((r) => r.w)));
  let x0 = -colW.reduce((s, w) => s + w + 4, -4) / 2, maxZ = 0;
  cols.forEach((col, ci) => {
    const depth = col.reduce((s, r) => s + r.d + 1.6 + r.hgt * 0.45, 0);
    let z = -depth / 2;
    for (const row of col) {
      z += row.d / 2 + row.hgt * 0.45; // 高的素材多留一点前后距离，斜俯视时不互相遮挡
      let x = x0;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(row.w + 0.1, row.d + 0.9).rotateX(-Math.PI / 2), toon(SRC[row.sk].strip, { unique: true }));
      strip.position.set(x0 + (row.w - 0.9) / 2, 0.004, z); strip.receiveShadow = true; root.add(strip);
      const lbl = mkLabel(`${row.name} <i>×${row.items.length}</i> <b class="tag ${row.sk}">${SRC[row.sk].tag}</b>`, 'row');
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
  rain: { vy: -16, sway: 0.15, h: 16, shape: 3 },
};
function particles(cfg, area = R) {
  const T = PT[cfg.type], n = MOBILE ? Math.ceil(cfg.n * 0.5) : cfg.n, rnd = new Float32Array(n * 4), pos = new Float32Array(n * 3);
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
        else if (uShape < 2.5) a = smoothstep(0.5, 0.0, length(q));
        else a = step(abs(q.x + q.y * 0.15), 0.035) * 0.55; // 雨丝
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
  emitters = []; bobbers = []; particleSys = []; waterMats = []; groundTex = null;
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
    span = buildCatalog(ids, S.mode);
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
  applyToggles();
  applyLight();
  ui();
  stats.counts = countAssets();
}
function countAssets() {
  const ids = S.mode === 'scene' ? [...new Set(BIOMES[S.biome].scatter.map((r) => r.id))] : S.mode === 'all' ? [...new Set(BIOMES.flatMap((x) => x.catalog))] : BIOMES[S.biome].catalog;
  const src = S.mode === 'codex' || (S.mode === 'scene' && S.src === 'codex') ? CODEX : null;
  const have = src ? ids.filter((id) => src[id]) : ids;
  return { types: have.length, variants: have.reduce((s, id) => s + (src || ASSETS)[id].n, 0) };
}
function frame(reset = true) {
  if (!reset) return;
  // 竖屏时视野窄，拉远一些让整座岛/整张图鉴放得下
  const k = camera.aspect < 1 ? Math.min(2.2, 0.85 / camera.aspect) : 1;
  if (S.mode === 'scene') { camera.position.set(0, 26 * k, 40 * k); controls.target.set(0, 0.5, 0); }
  else { const d = span * 1.35 * k; camera.position.set(0, d * 1.05, d * 0.7); controls.target.set(0, 0.5, 0); }
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
  for (const m of waterMats) m.uniforms.uSky.value.copy(skyU.top.value);
  $('#timeV').textContent = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;
}

// ---------- 点光源池：给离镜头焦点最近的光源 ----------
function updateLights(time) {
  const focus = controls.target, dark = BIOMES[S.biome].light.dark, boost = dark ? 2.2 : lerp(0.4, 1.6, nightK);
  const list = emitters.filter((e) => !e.lava).map((e) => ({ e, d: e.p.distanceToSquared(focus) - e.i * 30 })).sort((a, b) => a.d - b.d);
  pool.forEach((l, i) => {
    const it = list[i];
    if (!it) { l.intensity = 0; return; }
    const e = it.e; l.position.copy(e.p); l.color.set(e.color);
    l.distance = e.d * 1.4;
    l.intensity = e.i * boost * 5 * (e.flicker ? 0.85 + Math.sin(time * 13 + e.k) * 0.08 + Math.sin(time * 7.3 + e.k * 2) * 0.07 : 1);
  });
}

// ---------- 开关 ----------
function applyToggles() {
  document.body.classList.toggle('noWalk', S.mode !== 'scene' || !S.chibi);
  root.traverse((o) => { if (o.userData.isLine) o.visible = S.outline; });
  sun.castShadow = S.shadows;
  bloom.enabled = S.bloom; grade.enabled = S.grade;
  for (const p of particleSys) p.visible = S.particles;
  if (chibi) chibi.root.visible = S.chibi && S.mode === 'scene';
  const pr = basePR();
  if (pr !== pixelRatio) { pixelRatio = pr; resize(); }
}

// ======================================================================
// UI
// ======================================================================
function ui() {
  document.querySelectorAll('#biomes button').forEach((b, i) => b.classList.toggle('on', i === S.biome));
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === S.mode));
  document.querySelectorAll('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === S.src));
  document.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', !!S[b.dataset.t]));
  const b = BIOMES[S.biome];
  const who = S.mode === 'codex' ? ' · <span class="tag codex">Codex</span>' : S.mode === 'compare' ? ' · <span class="tag claude">Claude</span> vs <span class="tag codex">Codex</span>' : S.mode === 'scene' ? ` · <span class="tag ${S.src}">${SRC[S.src].tag} 素材</span>` : S.mode === 'catalog' ? ' · <span class="tag claude">Claude</span>' : '';
  $('#title').innerHTML = (S.mode === 'all' ? '全部素材 <small>所有区域的图鉴</small>' : `${b.name} <small>${b.sub}</small>`) + who;
  $('#time').value = S.time;
}
function setupUI() {
  const bx = $('#biomes');
  BIOMES.forEach((b, i) => {
    const el = document.createElement('button'); el.innerHTML = `<kbd>${i + 1}</kbd>${b.name}`;
    el.onclick = () => { S.biome = i; if (S.mode === 'all') S.mode = 'catalog'; save(); rebuild(true); };
    bx.appendChild(el);
  });
  document.querySelectorAll('#modes button').forEach((el) => el.onclick = () => { S.mode = el.dataset.m; save(); rebuild(true); });
  document.querySelectorAll('[data-src]').forEach((el) => el.onclick = () => { S.src = el.dataset.src; save(); rebuild(false); });
  document.querySelectorAll('[data-t]').forEach((el) => el.onclick = () => { S[el.dataset.t] = !S[el.dataset.t]; save(); applyToggles(); ui(); });
  $('#time').oninput = (e) => { S.time = +e.target.value; save(); applyLight(); };
  $('#wind').oninput = (e) => { U.wind.value = +e.target.value; };
  $('#line').oninput = (e) => { U.line.value = +e.target.value; };
  $('#reseed').onclick = () => { S.seed++; save(); rebuild(false); };
  $('#shot').onclick = () => { composer.render(); const a = document.createElement('a'); a.download = `lab-${BIOMES[S.biome].id}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click(); };
  $('#hideui').onclick = () => { document.body.classList.toggle('clean'); document.body.classList.remove('panel-open'); };
  $('#gear').onclick = () => document.body.classList.toggle('panel-open');
  renderer.domElement.addEventListener('pointerdown', () => document.body.classList.remove('panel-open'));
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const n = e.key === '0' ? 10 : +e.key; if (n >= 1 && n <= BIOMES.length) { S.biome = n - 1; if (S.mode === 'all') S.mode = 'catalog'; save(); rebuild(true); }
    if (e.key === 'c' || e.key === 'C') { S.mode = S.mode === 'scene' ? 'catalog' : 'scene'; save(); rebuild(true); }
    if (e.key === 'x' || e.key === 'X') { S.mode = { scene: 'scene', catalog: 'codex', codex: 'compare', compare: 'catalog', all: 'codex' }[S.mode]; if (S.mode === 'scene') S.src = S.src === 'codex' ? 'claude' : 'codex'; save(); rebuild(S.mode !== 'scene'); }
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
    if (e.key === 'r' || e.key === 'R') { S.seed++; save(); rebuild(false); }
    if (e.key === 'o' || e.key === 'O') { S.outline = !S.outline; save(); applyToggles(); ui(); }
  });
}

// ---------- 统计 ----------
const stats = { fps: 0, acc: 0, n: 0, counts: { types: 0, variants: 0 } };
function updateStats(dt) {
  stats.acc += dt; stats.n++;
  if (stats.acc > 0.5) {
    stats.fps = Math.round(stats.n / stats.acc); stats.acc = 0; stats.n = 0;
    const i = renderer.info.render;
    $('#stats').textContent = `${stats.fps} fps · ${i.calls} draw · ${(i.triangles / 1000).toFixed(0)}k tri · ${stats.counts.types} 种素材 / ${stats.counts.variants} 个变体 · Codex 已有 ${Object.keys(CODEX).length}/${Object.keys(ASSETS).length} 种${CODEX_ERRORS.length ? ' · ⚠ Codex 出错 ' + CODEX_ERRORS.length + ' 处(见控制台)' : ''}`;
  }
}

// ======================================================================
// 启动
// ======================================================================
// 切换区域：先显示"生成中"再建（手机上要一两秒，不然像卡死）
const nextFrame = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
let building = false;
async function rebuild(reframe) {
  if (building) return;
  building = true; document.body.classList.add('busy');
  await nextFrame();
  try { build(); if (reframe) frame(); } catch (e) { console.error(e); alert('生成失败: ' + e.message); }
  document.body.classList.remove('busy'); building = false;
}

// ======================================================================
// 行走：手机左下虚拟摇杆（与主游戏同一套 touch.js），电脑 WASD / 方向键；镜头跟随
// ======================================================================
const touch = new TouchControls();
const keys = new Set();
addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') keys.add(e.code); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
let walkYaw = 0, moveK = 0;
function walk(dt) {
  if (!chibi || !chibi.root.visible) return;
  let ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let iy = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  if (touch.on && (touch.stick.x || touch.stick.y)) { ix = touch.stick.x; iy = touch.stick.y; }
  const mag = Math.min(1, Math.hypot(ix, iy));
  moveK = lerp(moveK, mag, 1 - Math.exp(-10 * dt));
  const P = chibi.root.position;
  if (mag > 0.01) {
    // 相对镜头方向：前 = 镜头看向的水平方向
    _f.subVectors(controls.target, camera.position).setY(0).normalize();
    _r.set(-_f.z, 0, _f.x);
    _d.copy(_r).multiplyScalar(ix).addScaledVector(_f, iy).normalize();
    const sp = 5 * mag * dt, nx = P.x + _d.x * sp, nz = P.z + _d.z * sp;
    const b = BIOMES[S.biome], deep = b.water ? b.water.level - 0.3 : -99;
    // 不走出小岛、不走进深水
    // 断崖：坡度太陡（>~50°）走不上去也跳不下去，台阶坡道可以走
    const slope = Math.abs(hAtCur(nx + _d.x * 0.25, nz + _d.z * 0.25) - hAtCur(P.x, P.z)) / (sp + 0.25);
    const onLadder = (b.terrace?.ladders || []).some((l) => Math.hypot(nx - l.x, nz - l.z) < l.r); // 梯子处可以爬崖
    if (Math.hypot(nx, nz) < R - 1.2 && hAtCur(nx, nz) > deep && (slope < 1.2 || onLadder)) {
      const dx = nx - P.x, dz = nz - P.z;
      P.x = nx; P.z = nz;
      camera.position.x += dx; camera.position.z += dz;
      controls.target.x += dx; controls.target.z += dz;
    }
    walkYaw = Math.atan2(_d.x, _d.z);
  }
  const y = hAtCur(P.x, P.z), dy = y - P.y;
  P.y = y; camera.position.y += dy * 0.5; controls.target.y += dy * 0.5;
  chibi.root.rotation.y += Math.atan2(Math.sin(walkYaw - chibi.root.rotation.y), Math.cos(walkYaw - chibi.root.rotation.y)) * (1 - Math.exp(-12 * dt));
  animChibi(chibi, dt, { move: moveK, attack: -1, cast: 0, work: 0 });
}

// ======================================================================
// 天劫峰：雷暴（闪光 + 随机落雷）
// ======================================================================
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.4, 4.5), transparent: true, depthWrite: false, fog: false });
let bolt = null, boltT = 0, nextStrike = 2, flash = 0;
function storm(dt) {
  const on = S.mode === 'scene' && BIOMES[S.biome].light.fx === 'storm';
  if (!on) { if (bolt) { scene.remove(bolt); bolt = null; } flash = 0; return; }
  nextStrike -= dt;
  if (nextStrike < 0) {
    nextStrike = 2.5 + Math.random() * 5;
    if (bolt) { scene.remove(bolt); bolt.geometry.dispose(); }
    // 折线闪电：从高空到地面随机一点，每段左右抖
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * (R - 6), ex = Math.cos(a) * r, ez = Math.sin(a) * r;
    const pts = [], N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N, j = i === 0 || i === N ? 0 : 1.2;
      pts.push(new THREE.Vector3(ex + (Math.random() - 0.5) * j * 2 + (1 - t) * 3, 28 * (1 - t) + hAtCur(ex, ez) * t, ez + (Math.random() - 0.5) * j * 2));
    }
    bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 48, 0.09, 4), boltMat);
    scene.add(bolt); boltT = 0.35; flash = 1;
  }
  if (bolt) { boltT -= dt; boltMat.opacity = Math.max(0, boltT / 0.35) * (0.6 + Math.random() * 0.4); if (boltT <= 0) { scene.remove(bolt); bolt.geometry.dispose(); bolt = null; } }
  flash = Math.max(0, flash - dt * 4);
  hemi.intensity = lerp(BIOMES[S.biome].light.hemiI, 0.55, nightK) + flash * 2.5;
}

status('加载贴图…', 25);
await loadCodex();
await loadTextures({ foliage: { norm: 0.88 }, peach_foliage: { norm: 0.88 }, cliff_rock: { norm: 0.9 }, ...CODEX_TEXTURES });
status('生成地形与素材…', 55);
await nextFrame();
setupUI();
build(); frame();
status('编译着色器…', 85);
await nextFrame();
renderer.compile(scene, camera);
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
  walk(dt);
  storm(dt);
  updateLights(t);
  composer.render();
  updateStats(dt);
  renderer.info.reset();
  updateLabels();
});
renderer.info.autoReset = false;
