import * as THREE from 'three';

export const CHUNK = 32;

// ---------- 随机与噪声 ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashInt(x, z, seed = 1337) {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export const hash01 = (x, z, seed) => hashInt(x, z, seed) / 4294967296;

export function vnoise(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash01(xi, zi, seed), b = hash01(xi + 1, zi, seed);
  const c = hash01(xi, zi + 1, seed), d = hash01(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed = 0, oct = 3) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, z * f, seed + i * 17);
    n += amp; amp *= 0.5; f *= 2;
  }
  return s / n;
}

// ---------- 数学 ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
export function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const lerpAngle = (a, b, t) => a + angDiff(b, a) * t;

// ---------- 低多边形材质 ----------
export function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

let grad;
function gradient() {
  if (grad) return grad;
  // 四阶柔和色阶：比三阶更接近参考图的软阴影
  grad = new THREE.DataTexture(new Uint8Array([120, 175, 222, 255]), 4, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

// 镜头与玩家之间的物体做抖动镂空（看得到被树/墙挡住的角色）
export const occ = { uPlayer: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } };
function occPatch(s) {
    s.uniforms.uPlayer = occ.uPlayer;
    s.uniforms.uCam = occ.uCam;
    s.vertexShader = 'varying vec3 vOccW;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 occW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        occW = instanceMatrix * occW;
      #endif
      vOccW = (modelMatrix * occW).xyz;`);
    s.fragmentShader = 'uniform vec3 uPlayer;\nuniform vec3 uCam;\nvarying vec3 vOccW;\n' +
      s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        vec3 seg = uPlayer - uCam; float L = length(seg); vec3 dir = seg / L;
        float t = dot(vOccW - uCam, dir);
        if (t > 0.0 && t < L - 1.0) {
          float d = length(vOccW - (uCam + dir * t));
          float k = clamp(d / 2.4, 0.0, 1.0);
          float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (n > 0.1 + 0.9 * k * k) discard;
        }
      }`);
}

// 树叶：按物体局部坐标做像素化的"叶团"明暗（不依赖 UV，跟着实例走）
export const wind = { value: 0 };
// 天气：雨量、地面湿度、天空色（线性），地面着色器直接引用
export const weatherU = { rain: { value: 0 }, wet: { value: 0 }, sky: { value: new THREE.Color(0xbfd4e8) } };
function leafPatch(s, mat) {
  const tex = mat.userData.leafTex || PNG.foliage;
  s.vertexShader = 'varying vec3 vLeafP;\nvarying vec3 vLeafN;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLeafP = position; vLeafN = normal;');
  if (tex) {
    // 有贴图：三向投影叶团贴图（无需 UV）
    s.uniforms.tLeaf = { value: tex };
    s.fragmentShader = 'uniform sampler2D tLeaf;\nvarying vec3 vLeafP;\nvarying vec3 vLeafN;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 bw = pow(abs(normalize(vLeafN)), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
    vec3 q = vLeafP * 0.36;
    vec3 tx = texture2D(tLeaf, q.zy).rgb * bw.x + texture2D(tLeaf, q.xz).rgb * bw.y + texture2D(tLeaf, q.xy).rgb * bw.z;
    diffuseColor.rgb *= tx * 1.14;
  }`);
    return;
  }
  s.fragmentShader = 'varying vec3 vLeafP;\nvarying vec3 vLeafN;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 q = floor(vLeafP * 12.0 + 0.5) / 12.0 * 2.6;
    vec3 ci = floor(q), f = fract(q);
    float md = 9.0; vec3 mo = vec3(0.0);
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 n = vec3(float(x), float(y), float(z));
      vec3 c = ci + n;
      vec3 o = fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
      vec3 r = n + o - f; float d = dot(r, r);
      if (d < md) { md = d; mo = r; }
    }
    md = sqrt(md);
    float sh = 1.16 - 0.55 * smoothstep(0.3, 0.8, md) + 0.22 * clamp(-mo.y * 1.8, 0.0, 1.0);
    sh = floor(sh * 5.0 + 0.5) / 5.0;
    diffuseColor.rgb *= sh;
  }`);
}
// 草卡：顶点都在卡的根部，在视空间展开成正对镜头的一片（俯视也不会变成一条线）；
// aGrass = (左右, 高度, 贴图截取宽度, 卡序号)，每丛按位置随机截取 / 镜像贴图，越高随风摆得越多
function grassPatch(s) {
  s.uniforms.uWind = wind;
  s.vertexShader = 'attribute vec4 aGrass;\nuniform float uWind;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  {
    vec3 ip = vec3(0.0);
    float gs = 1.0, gh = 1.0;
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
      gs = length(instanceMatrix[0].xyz); gh = length(instanceMatrix[1].xyz);
    #endif
    float w = sin(uWind * 1.8 + ip.x * 0.35 + ip.z * 0.22) * 0.6 + sin(uWind * 3.1 + ip.x * 1.3) * 0.25;
    mvPosition.x += aGrass.x * gs + w * aGrass.y * aGrass.y * 0.5 * gh;
    mvPosition.y += aGrass.y * gh;
    gl_Position = projectionMatrix * mvPosition;
    #ifdef USE_MAP
      float hr = fract(sin(dot(ip.xz, vec2(12.9898, 78.233)) + aGrass.w * 3.7) * 43758.5453);
      vMapUv.x = (hr > 0.5 ? vMapUv.x : 1.0 - vMapUv.x) * aGrass.z + hr * 7.0;
    #endif
  }`);
}
// 叶片卡：每片是一个四边形，顶点都在片中心，在视空间展开成正对镜头的叶簇（随风微转）
function cardPatch(s) {
  s.uniforms.uWind = wind;
  s.vertexShader = 'attribute vec4 aCard;\nuniform float uWind;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  {
    float cardS = length(modelMatrix[0].xyz);
    #ifdef USE_INSTANCING
      cardS *= length(instanceMatrix[0].xyz);
    #endif
    float ca = aCard.w + sin(uWind * 1.6 + position.x * 2.1 + position.z * 1.7 + position.y) * 0.14;
    mvPosition.xy += mat2(cos(ca), sin(ca), -sin(ca), cos(ca)) * aCard.xy * aCard.z * cardS;
    gl_Position = projectionMatrix * mvPosition;
  }`);
}
function applyPatches(mat, patches, key) {
  mat.onBeforeCompile = (s) => { for (const f of patches) f(s, mat); };
  mat.customProgramCacheKey = () => key;
}
function occlude(mat, pre) {
  applyPatches(mat, pre ? [pre, occPatch] : [occPatch], 'occ' + (pre ? 'line' : ''));
}

const cache = new Map();
export function toon(color, o = {}) {
  const key = `${color}|${o.emissive || ''}|${o.ei || 0}|${o.occ ? 1 : 0}|${o.vc ? 1 : 0}|${o.map ? o.map.uuid : ''}|${o.leaf ? 1 : 0}|${o.grass ? 1 : 0}|${o.leafTex ? o.leafTex.uuid : ''}|${o.card ? 1 : 0}`;
  if (!o.unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient(), vertexColors: !!o.vc, map: o.map || null });
  if (o.emissive) { m.emissive.set(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  if (o.leafTex) m.userData.leafTex = o.leafTex;
  const patches = [];
  if (o.leaf) patches.push(leafPatch);
  if (o.grass) patches.push(grassPatch);
  if (o.card) patches.push(cardPatch);
  if (o.occ) patches.push(occPatch);
  if (patches.length) applyPatches(m, patches, `toon${o.leaf ? 'L' : ''}${o.grass ? 'G' : ''}${o.card ? 'C' : ''}${o.occ ? 'O' : ''}`);
  m.userData.baseE = m.emissive.clone();
  m.userData.baseEI = m.emissiveIntensity;
  if (!o.unique) cache.set(key, m);
  return m;
}

// 描边：背面外扩（inverted hull），共享几何体，作为子物体挂在原 mesh 上
const lineUniform = { value: 1 };
export const outlineK = lineUniform;
const lineCache = new Map();
export function outlineMat(color = '#2b1d14', thick = 0.03, o = {}) {
  const key = `${color}|${thick}|${o.occ ? 1 : 0}`;
  if (lineCache.has(key)) return lineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const pre = (s) => {
    s.uniforms.uThick = { value: thick };
    s.uniforms.uLineK = lineUniform;
    s.vertexShader = 'uniform float uThick;\nuniform float uLineK;\nattribute vec3 lineNormal;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(lineNormal) * uThick * uLineK;');
  };
  if (o.occ) occlude(m, pre);
  else { m.onBeforeCompile = pre; m.customProgramCacheKey = () => 'line'; }
  lineCache.set(key, m);
  return m;
}
// 同一位置的顶点共用平均法线：盒子等硬边模型外扩后不会裂开
function lineNormals(geo) {
  if (geo.attributes.lineNormal) return;
  const p = geo.attributes.position, n = geo.attributes.normal, map = new Map();
  const k = (i) => `${Math.round(p.getX(i) * 1000)},${Math.round(p.getY(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
  for (let i = 0; i < p.count; i++) {
    const key = k(i); let v = map.get(key);
    if (!v) { v = [0, 0, 0]; map.set(key, v); }
    v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = map.get(k(i)), l = Math.hypot(v[0], v[1], v[2]) || 1;
    out[i * 3] = v[0] / l; out[i * 3 + 1] = v[1] / l; out[i * 3 + 2] = v[2] / l;
  }
  geo.setAttribute('lineNormal', new THREE.BufferAttribute(out, 3));
}
export function addOutline(obj, mat, skip = () => false) {
  const list = [];
  obj.traverse((m) => { if (m.isMesh && !m.userData.isLine && !skip(m)) list.push(m); });
  for (const m of list) {
    if (!m.geometry.attributes.normal) continue;
    lineNormals(m.geometry);
    const l = m.isInstancedMesh ? new THREE.InstancedMesh(m.geometry, mat, m.count) : new THREE.Mesh(m.geometry, mat);
    if (m.isInstancedMesh) { l.instanceMatrix = m.instanceMatrix; l.count = m.count; l.boundingSphere = m.boundingSphere; }
    l.userData.isLine = true; l.castShadow = false; l.receiveShadow = false;
    m.add(l);
  }
  return obj;
}

// ---------- 程序贴图（canvas，像素风：最近邻放大） ----------
export function canvasTex(w, h, draw, { pixel = true, repeat = true } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) t.magFilter = THREE.NearestFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// ---------- 外部贴图（assets/textures，Codex 生成；缺失时用程序贴图） ----------
export const PNG = {};
// 由颜色图亮度当高度，Sobel 求法线图（可无缝平铺）；行序翻转以对齐 CanvasTexture 的 flipY
function normalFromImage(img, k) {
  const { width: W, height: H, data: D } = img, h = new Float32Array(W * H), out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) h[i] = (D[i * 4] * 0.3 + D[i * 4 + 1] * 0.59 + D[i * 4 + 2] * 0.11) / 255;
  const at = (x, y) => h[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const dy = at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
    let nx = -dx * k, ny = -dy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = ((H - 1 - y) * W + x) * 4;
    out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = 255;
  }
  const t = new THREE.DataTexture(out, W, H);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8; t.needsUpdate = true;
  return t;
}
const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
// norm：每通道除以均值 → 中性灰的细节图，颜色仍由材质色决定
export async function loadTextures(list) {
  await Promise.all(Object.entries(list).map(async ([name, o]) => {
    const im = await loadImg(`assets/textures/${name}.png`);
    if (!im) return;
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
    if (o.normal) PNG[name + '_n'] = normalFromImage(ctx.getImageData(0, 0, cv.width, cv.height), o.normal);
    if (o.key) {
      // 没有透明通道时，把品红背景抠掉（带一点去色边）
      const img = ctx.getImageData(0, 0, cv.width, cv.height), D = img.data;
      let opaque = true;
      for (let i = 3; i < D.length; i += 4) if (D[i] < 250) { opaque = false; break; }
      if (opaque) for (let i = 0; i < D.length; i += 4) {
        const m = Math.min(D[i], D[i + 2]) - D[i + 1];
        if (m > 90) D[i + 3] = 0;
        else if (m > 30) { D[i + 3] = 255 * (90 - m) / 60; D[i] = D[i + 2] = D[i + 1]; }
      }
      ctx.putImageData(img, 0, 0);
    }
    if (o.norm) {
      const img = ctx.getImageData(0, 0, cv.width, cv.height), D = img.data, sum = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < D.length; i += 4) if (D[i + 3] > 128) { sum[0] += D[i]; sum[1] += D[i + 1]; sum[2] += D[i + 2]; n++; }
      const k = sum.map((v) => (o.norm * 255) / (v / Math.max(1, n)));
      for (let i = 0; i < D.length; i += 4) for (let c = 0; c < 3; c++) D[i + c] = Math.min(255, D[i + c] * k[c]);
      ctx.putImageData(img, 0, 0);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (o.rep) t.repeat.set(o.rep, o.rep);
    PNG[name] = t;
  }));
}

// 让 BoxGeometry 的 UV 按实际尺寸平铺（1 单位 = 1 张贴图 × k）
export function boxUV(geo, w, h, d, k = 1) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * k, uv.getY(i) * dims[f][1] * k);
  }
  return geo;
}

const glowCache = new Map();
export function glow(color, k = 2.5, unique = false) {
  const key = color + k;
  if (!unique && glowCache.has(key)) return glowCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color });
  m.color.multiplyScalar(k);
  m.userData.base = m.color.clone();
  if (!unique) glowCache.set(key, m);
  return m;
}

export function mesh(geo, mat, { cast = true, recv = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
export function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }

// 受击闪白（材质是角色独有的）
export function setFlash(mats, v) {
  for (const m of mats) {
    if (v > 0) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = v; }
    else { m.emissive.copy(m.userData.baseE); m.emissiveIntensity = m.userData.baseEI; }
  }
}
