import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, lumpy, grad, U, mulberry32, swayPatch, chain } from '../kit.js';
import { ASSETS, STYLE } from '../assets.js';
import { addOutline } from '../../util.js';

// ======================================================================
// 参考画风：照着参考图（热带小岛、手绘卡通）的画风，把 Claude 素材整套重建一遍。
// - 墨线描边：一直显示（不受"描边"开关影响），颜色按物体本色压暗
// - 三阶硬色阶 + 冷色阴影 / 暖色受光
// - 树冠：一团团带锯齿边的叶簇，每团单独描边（不是叶卡贴图）
// - 岩石：圆润的大石头，表面画几道裂纹
// - 椰树：茂密锯齿羽叶，下面垫深色叶当描边；松杉：一层层下垂的锯齿裙
// 原版素材 / 原版地图完全不动：这里只是在建素材时临时打开 assets.js 的 STYLE 钩子，再换材质。
// ======================================================================

const TAU = Math.PI * 2;

// ---------- 材质 ----------
let RAMP;
function ramp() {
  if (RAMP) return RAMP;
  RAMP = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
  RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter;
  RAMP.generateMipmaps = false; RAMP.needsUpdate = true;
  return RAMP;
}
// 冷暗暖亮：按"实际亮度 / 本色亮度"判断在阴影还是受光面
const TINT = `
  {
    float rl = dot(outgoingLight, vec3(0.3, 0.59, 0.11)) / max(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), 0.001);
    outgoingLight *= mix(vec3(0.84, 0.9, 1.12), vec3(1.02, 1.0, 0.97), smoothstep(0.5, 0.95, rl));
  }
  #include <opaque_fragment>`;
function refToon(key, extra) {
  const m = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: ramp() });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', TINT);
    if (extra) extra(s);
  };
  m.customProgramCacheKey = () => 'ref' + key;
  return m;
}
// 岩石裂纹：物体空间的 3D Voronoi 边，只在一部分区域显示（不会满身龟甲纹）
const CRACK = `
  vec3 rh3(vec3 p) { p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
  float rEdge(vec3 p) {
    vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(float(x), float(y), float(z)), r = g + rh3(i + g) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return sqrt(d2) - sqrt(d1);
  }`;
function rockMat() {
  return refToon('rock', (s) => {
    s.vertexShader = 'varying vec3 vRP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRP = position;');
    s.fragmentShader = 'varying vec3 vRP;\n' + CRACK + '\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float e = rEdge(vRP * 1.7);
        float m = smoothstep(0.62, 0.85, sin(vRP.x * 2.3 + vRP.z * 1.7 + 1.3) * sin(vRP.y * 3.1 - vRP.z * 1.3) * 0.5 + 0.5);
        diffuseColor.rgb *= mix(1.0, 0.42, (1.0 - smoothstep(0.018, 0.045, e)) * m);
        diffuseColor.rgb *= 1.0 + (rh3(floor(vRP * 1.7)).x - 0.5) * 0.12;
      }`);
  });
}
let MATS;
function refMats() {
  if (MATS) return MATS;
  const solid = refToon('solid');
  const sway = chain(refToon('sway'), (s) => swayPatch(s, 1, 0.8), 'S');
  const clump = chain(refToon('clump'), (s) => swayPatch(s, 1, 0.8), 'C');
  const plant = chain(refToon('plant'), (s) => swayPatch(s, 2.2, 0.02), 'P');
  plant.side = THREE.DoubleSide;
  MATS = { solid, sway, leaf: sway, bloom: sway, pine: sway, clump, rock: rockMat(), plant };
  return MATS;
}
// 墨线：背面外扩，粗细跟实验场的"描边粗细"滑杆（U.line）走
const inkCache = new Map();
function inkMat(color, thick, sway) {
  const k = `${color}|${thick}|${sway}`;
  if (inkCache.has(k)) return inkCache.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uThick = U.line;
    s.vertexShader = 'uniform float uThick;\nattribute vec3 lineNormal;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(lineNormal) * uThick * ' + thick.toFixed(3) + ';');
    if (sway) swayPatch(s, 1, 0.8);
  };
  m.customProgramCacheKey = () => 'refink' + (sway ? 'S' : '');
  inkCache.set(k, m);
  return m;
}
// 物体本色压暗当墨线色（红枫配深红线、绿树配墨绿线）
function inkOf(geo, k = 0.24) {
  const c = geo.attributes.color; if (!c) return '#2a221c';
  let r = 0, g = 0, b = 0; const n = c.count, step = Math.max(1, Math.floor(n / 400));
  let m = 0; for (let i = 0; i < n; i += step) { r += c.getX(i); g += c.getY(i); b += c.getZ(i); m++; }
  const col = new THREE.Color(r / m, g / m, b / m).multiplyScalar(k);
  col.lerp(new THREE.Color('#1c1712'), 0.35);
  // 量化一下，避免每棵树一个材质
  const q = (v) => Math.round(v * 24) / 24;
  return '#' + new THREE.Color(q(col.r), q(col.g), q(col.b)).getHexString();
}
const SWAYK = new Set(['sway', 'leaf', 'bloom', 'pine', 'clump']);
function restyle(grp, noInk) {
  const M = refMats(), list = [];
  grp.traverse((m) => { if (m.isMesh && !m.userData.isLine && M[m.userData.kind]) list.push(m); });
  for (const m of list) {
    const kind = m.userData.kind;
    for (const c of [...m.children]) if (c.userData.isLine) m.remove(c);
    m.material = M[kind];
    if (kind === 'clump' || kind === 'rock') m.castShadow = true;
    if (kind === 'plant' || noInk) continue; // 薄片外扩不出轮廓：椰叶靠垫在下面的深色叶当描边
    const color = kind === 'clump' ? inkOf(m.geometry) : SWAYK.has(kind) ? inkOf(m.geometry, 0.3) : '#2a221c';
    const thick = kind === 'clump' ? 0.032 : kind === 'rock' ? 0.03 : 0.022;
    addOutline(m, inkMat(color, thick, SWAYK.has(kind)));
    for (const c of m.children) if (c.userData.isLine) c.userData.ink = true;
  }
  return grp;
}

// ---------- 叶簇 ----------
// 一团叶簇 = 顶点 + 内圈 8 点 + 外缘 16 个锯齿 + 底点的封闭圆顶（48 个三角形）
// c: 中心，ax: 朝向（圆顶的"上"），r: 半径，h: 高，o: { ringR, ringY, droop, elong, teeth }
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3();
function clump(out, c, ax, r, h, rnd, col, o = {}) {
  const Y = ax.clone().normalize(), X = new THREE.Vector3(1, 0, 0);
  if (Math.abs(Y.x) > 0.9) X.set(0, 0, 1);
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize(); X.crossVectors(Y, Z);
  const rot = rnd() * TAU, T = o.teeth ?? 16, ringR = o.ringR ?? 0.62, ringY = o.ringY ?? 0.72, droop = o.droop ?? 0.12, el = o.elong ?? 1;
  const P = (lx, ly, lz) => new THREE.Vector3().copy(c).addScaledVector(X, lx * el).addScaledVector(Y, ly).addScaledVector(Z, lz);
  const top = P(0, h, 0), bot = P(0, -h * 0.4, 0), body = P(0, h * 0.2, 0), ring = [], rim = [];
  for (let i = 0; i < 8; i++) { const a = rot + (i / 8) * TAU; ring.push(P(Math.cos(a) * r * ringR, h * ringY, Math.sin(a) * r * ringR)); }
  for (let j = 0; j < T; j++) {
    const a = rot + (j / T) * TAU, rr = r * (j % 2 ? 0.78 : 1) * (0.94 + rnd() * 0.12);
    rim.push(P(Math.cos(a) * rr, -h * droop * (j % 2 ? 0.4 : 1) + (rnd() - 0.5) * h * 0.08, Math.sin(a) * rr));
  }
  const tris = [];
  for (let i = 0; i < 8; i++) {
    const i2 = (i + 1) % 8, j0 = (i * T) / 8, js = T / 8;
    tris.push([top, ring[i], ring[i2]]);
    // 内圈一段对应外缘 js 个锯齿点
    for (let s = 0; s < js; s++) tris.push([ring[i], rim[(j0 + s) % T], rim[(j0 + s + 1) % T]]);
    tris.push([ring[i], rim[(j0 + js) % T], ring[i2]]);
  }
  for (let j = 0; j < T; j++) tris.push([bot, rim[(j + 1) % T], rim[j]]);
  for (const [p0, p1, p2] of tris) {
    // 统一朝外：面法线和"面中心 - 团中心"同向
    _a.subVectors(p1, p0); _b.subVectors(p2, p0); _n.crossVectors(_a, _b);
    _t.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3).sub(body);
    const tri = _n.dot(_t) < 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      out.pos.push(p.x, p.y, p.z);
      // 光照法线：整冠球面法线为主，混一点本团法线 → 整冠明暗连贯，团与团之间有起伏
      _t.subVectors(p, body).normalize();
      _n.subVectors(p, out.center).multiplyScalar(1 / out.R); _n.y = _n.y * 1.1 + 0.3; _n.normalize().lerp(_t, 0.3).normalize();
      out.nor.push(_n.x, _n.y, _n.z);
      out.ln.push(_t.x, _t.y, _t.z);
      const k = p === bot ? 0.78 : 1;
      out.col.push(col.r * k, col.g * k, col.b * k);
    }
  }
}
function clumpBuf() { return { pos: [], nor: [], ln: [], col: [], center: new THREE.Vector3(), R: 1 }; }
function clumpGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('lineNormal', new THREE.Float32BufferAttribute(b.ln, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  return g;
}
// 替换 foliage()：同样的参数（树冠球列表），改成一团团描边叶簇
export function clumpCrown(k, parts, color, accent, seed, o = {}) {
  const r = mulberry32(seed * 13 + 5), dens = o.dens ?? 1, sq = o.sy ?? 1;
  const cy0 = o.cy ?? parts.reduce((a, p) => a + p[1], 0) / parts.length;
  parts = parts.map(([x, y, z, R]) => [x, cy0 + (y - cy0) * sq, z, R]);
  const base = new THREE.Color(color), acc = accent && new THREE.Color(accent), c = new THREE.Color();
  const yMin = Math.min(...parts.map((p) => p[1] - p[3] * sq)), yMax = Math.max(...parts.map((p) => p[1] + p[3] * sq));
  const b = clumpBuf();
  const cx = parts.reduce((a, p) => a + p[0], 0) / parts.length, cz = parts.reduce((a, p) => a + p[2], 0) / parts.length;
  b.center.set(cx, (yMin + yMax) / 2, cz); b.R = Math.max(0.3, Math.max(...parts.map((p) => Math.hypot(p[0] - cx, p[2] - cz) + p[3])));
  for (const [x, y, z, R] of parts) {
    const cnt = Math.max(3, Math.round((3 + R * R * 8) * dens));
    for (let i = 0; i < cnt; i++) {
      // 方向偏上，底部少放
      const th = r() * TAU, cyy = i === 0 ? 1 : r() * 1.6 - 0.55, sy = Math.sqrt(Math.max(0, 1 - cyy * cyy));
      const d = new THREE.Vector3(Math.cos(th) * sy, cyy, Math.sin(th) * sy);
      const rc = Math.max(0.22, R * (0.42 + r() * 0.18));
      const p = new THREE.Vector3(x + d.x * R * 0.72, y + d.y * R * 0.72 * sq, z + d.z * R * 0.72);
      const ht = (p.y - yMin) / Math.max(0.01, yMax - yMin);
      c.copy(base).multiplyScalar((0.76 + 0.3 * ht) * (0.9 + r() * 0.2));
      if (acc && r() < (o.accentAmt ?? 0.08) * 3) c.lerp(acc, 0.7);
      const ax = d.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.6, 0));
      clump(b, p, ax, rc, rc * (0.55 + r() * 0.15) * Math.max(0.6, sq), r, c);
    }
  }
  k.add(clumpGeo(b), null, { kind: 'clump', at: o.at });
}
// 替换岩石形体：按原形体的包围盒做一个圆润的椭球，轻微起伏，平滑法线
export function smoothRock(geo, seed) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.scale(s.x * 1.04, s.y, s.z * 1.04).translate(c.x, c.y, c.z);
  g = lumpy(g, (s.x + s.y + s.z) / 3 * 0.16, 1.6 / Math.max(0.3, (s.x + s.z) / 2), seed);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  // 底部压平一点，像落在地上
  const p = g.attributes.position, yb = c.y - s.y * 0.7;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < yb) p.setY(i, yb + (p.getY(i) - yb) * 0.3);
  g.computeVertexNormals();
  return g;
}

// ---------- 专门重做的：一层层下垂锯齿裙的松杉 ----------
function refFir(v, seed, o = {}) {
  const k = new Kit(), r = mulberry32(seed * 31 + v), H = o.H ?? [4.2, 3.2, 5.2, 3.8][v % 4], tiers = o.tiers ?? 6;
  k.add(G.tube([[0, 0, 0], [0, H * 0.5, 0], [0, H * 0.95, 0]], 0.18, 0.05, 7), grad('#6a4632', 0.6, 1.05));
  const b = clumpBuf(), base = new THREE.Color(o.color || ['#2f6e46', '#2a6440', '#357a4c', '#2c6a44'][v % 4]), c = new THREE.Color();
  b.center.set(0, H * 0.6, 0); b.R = H * 0.5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), R = (o.W ?? 1.3) * (1 - t * 0.78) * (0.92 + r() * 0.14), y = H * (0.2 + t * 0.68);
    c.copy(base).multiplyScalar(0.8 + t * 0.35);
    clump(b, new THREE.Vector3(0, y, 0), new THREE.Vector3(0, 1, 0), R, H * 0.26 * (1 - t * 0.3), r, c, { teeth: 24, ringR: 0.42, ringY: 0.6, droop: 0.28 });
  }
  const tip = c.clone().multiplyScalar(1.05);
  clump(b, new THREE.Vector3(0, H * 0.93, 0), new THREE.Vector3(0, 1, 0), 0.2, H * 0.13, r, tip, { teeth: 8, ringR: 0.4, ringY: 0.5, droop: 0.1 });
  if (o.snow) {
    // 雪松：每层朝上的那一面盖雪（按叶簇本身的朝向），锯齿边留绿
    const sn = new THREE.Color('#f2f6ff');
    for (let i = 0; i < b.ln.length; i += 3) {
      const w = THREE.MathUtils.smoothstep(b.ln[i + 1], 0.5, 0.7);
      b.col[i] += (sn.r - b.col[i]) * w; b.col[i + 1] += (sn.g - b.col[i + 1]) * w; b.col[i + 2] += (sn.b - b.col[i + 2]) * w;
    }
  }
  for (let i = 0; i < b.nor.length; i += 3) {
    // 松杉：法线更"竖"一些，每层上亮下暗更明显
    const nx = b.nor[i], ny = b.nor[i + 1], nz = b.nor[i + 2], l = Math.hypot(nx * 0.7, ny, nz * 0.7) || 1;
    b.nor[i] = nx * 0.7 / l; b.nor[i + 1] = ny / l; b.nor[i + 2] = nz * 0.7 / l;
  }
  k.add(clumpGeo(b), null, { kind: 'clump' });
  return k.build();
}

// ---------- 素材表 ----------
function withStyle(fn) {
  STYLE.crown = clumpCrown; STYLE.rock = smoothRock; STYLE.frondInk = true;
  try { return fn(); } finally { delete STYLE.crown; delete STYLE.rock; delete STYLE.frondInk; }
}
const OVERRIDE = {
  palm: { n: 3, make: (v) => ASSETS.palmLush.make(v) },
  pineTree: { n: 4, make: (v) => refFir(v, 345) },
  snowPine: { n: 4, make: (v) => refFir(v, 341, { snow: true, color: '#2a5e42' }) },
  fir: { n: 3, make: (v) => refFir(v, 631) },
};
// 贴地的扁平素材不描边：外扩的背面会和地面穿插，成一圈虚线
const NOINK = new Set(['drift', 'steps']);
export const REF = {};
for (const [id, A] of Object.entries(ASSETS)) {
  if (A.extra) continue;
  const O = OVERRIDE[id];
  REF[id] = { name: A.name, n: O?.n ?? A.n, make: (v) => restyle(withStyle(() => (O || A).make(v)), NOINK.has(id)) };
}
const cache = new Map();
export function getRefAsset(id, v = 0) {
  const A = REF[id]; if (!A) return null;
  const key = `${id}:${v % A.n}`;
  if (!cache.has(key)) cache.set(key, A.make(v % A.n));
  return cache.get(key);
}
