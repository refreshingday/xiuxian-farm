import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, addOutline, mulberry32, vnoise, smooth, clamp, PNG } from '../util.js';

// 实验场的建模工具：每个素材由很多基础形体拼成，按"材质种类"合并成少数几个 mesh；
// 颜色全部烘进顶点色（含上亮下暗渐变、噪声斑驳），所以一种材质能画所有素材。

export const U = { time: { value: 0 }, wind: { value: 1 } };
const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3();

// ---------- 摇摆（树叶 / 草 / 花）：按顶点高度随风偏移，实例位置做相位 ----------
const SWAY_V = `
  {
    vec3 sp = modelMatrix[3].xyz;
    #ifdef USE_INSTANCING
      sp += instanceMatrix[3].xyz;
    #endif
    float sh = max(position.y - uSwayY, 0.0) * uSwayK * uWind;
    float sw = sin(uTime * 1.7 + sp.x * 0.45 + sp.z * 0.31) * 0.7 + sin(uTime * 2.9 + sp.x * 1.3 + position.y) * 0.3;
    transformed.x += sw * sh * 0.06;
    transformed.z += cos(uTime * 1.3 + sp.z * 0.5) * sh * 0.035;
  }`;
function swayPatch(s, k, y0) {
  s.uniforms.uTime = U.time; s.uniforms.uWind = U.wind;
  s.uniforms.uSwayK = { value: k }; s.uniforms.uSwayY = { value: y0 };
  s.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uSwayK;\nuniform float uSwayY;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + SWAY_V);
}
function chain(mat, fn, key) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (s, r) => { prev.call(mat, s, r); fn(s); };
  mat.customProgramCacheKey = () => prevKey + key;
  return mat;
}

// ---------- 材质 ----------
const lineCache = new Map();
function lineMat(color, thick, sway) {
  const k = `${color}|${thick}|${sway}`;
  if (lineCache.has(k)) return lineCache.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uThick = U.line;
    s.vertexShader = 'uniform float uThick;\nattribute vec3 lineNormal;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(lineNormal) * uThick * ' + thick.toFixed(3) + ';');
    if (sway) swayPatch(s, sway[0], sway[1]);
  };
  m.customProgramCacheKey = () => 'labline' + (sway ? sway.join() : '');
  lineCache.set(k, m);
  return m;
}
U.line = { value: 1 };

let MATS;
export function mats() {
  if (MATS) return MATS;
  const solid = toon('#ffffff', { vc: true, unique: true });
  const leaf = chain(toon('#ffffff', { vc: true, leaf: true, unique: true }), (s) => swayPatch(s, 1, 0.8), 'sway');
  // 花冠（桃花 / 枫叶等暖色）用花瓣贴图，避免绿叶贴图把粉色压成紫色
  const bloom = chain(toon('#ffffff', { vc: true, leaf: true, unique: true, leafTex: PNG.peach_foliage || PNG.foliage }), (s) => swayPatch(s, 1, 0.8), 'swayB');
  const plant = chain(toon('#ffffff', { vc: true, unique: true }), (s) => swayPatch(s, 2.2, 0.02), 'swayP');
  plant.side = THREE.DoubleSide;
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4) });
  // 晶石类：自发光但不过曝，保留颜色
  const gem = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.15, 1.15, 1.15) });
  const ice = new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.82, gradientMap: solid.gradientMap });
  ice.emissive.set('#3a6a90'); ice.emissiveIntensity = 0.35;
  // 树叶：真正一片片的叶子几何（同花草做法），双面但不翻法线（法线是从树冠中心向外的球面法线，整冠明暗连贯）
  const foli = chain(toon('#ffffff', { vc: true, unique: true }), (s) => {
    swayPatch(s, 1, 0.8);
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#undef DOUBLE_SIDED\n#include <normal_fragment_begin>\n#define DOUBLE_SIDED');
  }, 'foli');
  foli.side = THREE.DoubleSide;
  // 会随风摆的实心件（竹竿等），叶子长在上面不会脱节
  const sway = chain(toon('#ffffff', { vc: true, unique: true }), (s) => swayPatch(s, 1, 0.8), 'swayS');
  // 松针：三向投影松针贴图（有 Codex 生成的 pine_needles.png 就用它，否则用程序贴图）
  const pine = chain(toon('#ffffff', { vc: true, leaf: true, unique: true, leafTex: PNG.pine_needles || pineNeedleTex() }), (s) => swayPatch(s, 1, 0.8), 'swayPine');
  MATS = {
    solid, leaf, bloom, plant, glow: glowM, gem, ice, foli, sway, pine,
    line: { solid: lineMat('#2b1d14', 0.03), sway: lineMat('#2b1d14', 0.03, [1, 0.8]), pine: lineMat('#14281c', 0.04, [1, 0.8]), leaf: lineMat('#1d2e14', 0.045, [1, 0.8]), bloom: lineMat('#3a1a1a', 0.045, [1, 0.8]), plant: lineMat('#1d2e14', 0.018, [2.2, 0.02]), ice: lineMat('#1a2a44', 0.025), gem: lineMat('#1a1428', 0.02) },
  };
  return MATS;
}

// ---------- 几何工具 ----------
export function prep(g) {
  let geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}
// 噪声扰动顶点（同一位置同一偏移，所以不会裂缝）
export function lumpy(g, amt, freq = 2, seed = 0, yAmt = 1) {
  const geo = g.index ? g.toNonIndexed() : g, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n1 = vnoise(x * freq + seed, z * freq + y * 1.7, seed) - 0.5;
    const n2 = vnoise(y * freq + seed * 3, x * freq - z, seed + 9) - 0.5;
    const n3 = vnoise(z * freq - seed, y * freq + x * 0.7, seed + 4) - 0.5;
    p.setXYZ(i, x + n1 * amt, y + n2 * amt * yAmt, z + n3 * amt);
  }
  return geo;
}
export const faceted = (g) => { const geo = g.index ? g.toNonIndexed() : g; geo.computeVertexNormals(); return geo; };

// 按顶点上色：fn(pos, normal, out) 返回 sRGB 颜色
export function paint(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i);
    fn(_v, _n, _c);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// 常用上色：底色 + 高度渐变 (lo..hi 的亮度倍率) + 斑驳噪声
export function grad(color, lo = 0.7, hi = 1.15, noise = 0.08, seed = 1) {
  const base = new THREE.Color(color);
  return (geo) => {
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    return paint(geo, (p, n, out) => {
      const t = smooth(min.y, max.y, p.y), v = (lo + (hi - lo) * t) * (1 + (vnoise(p.x * 4 + seed, p.z * 4 + p.y * 3, seed) - 0.5) * noise * 2);
      out.copy(base).multiplyScalar(v);
    });
  };
}

// ---------- 素材构建器 ----------
export class Kit {
  constructor() { this.parts = {}; }
  // kind: solid | leaf | plant | glow | ice；color 可以是颜色、上色函数或 null(已有顶点色)
  add(geo, color, o = {}) {
    let g = prep(geo.clone());
    if (o.flat) g = faceted(g);
    const m = new THREE.Matrix4();
    const pos = o.at || [0, 0, 0], rot = o.rot || [0, 0, 0], sc = o.s ?? 1;
    m.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), Array.isArray(sc) ? new THREE.Vector3(...sc) : new THREE.Vector3(sc, sc, sc));
    if (typeof color === 'function') color(g);
    else if (color !== null) {
      // 默认：本体内上亮下暗
      grad(color, o.lo ?? 0.78, o.hi ?? 1.08, o.noise ?? 0.05, o.seed ?? 1)(g);
    }
    g.applyMatrix4(m);
    const kind = o.kind || 'solid';
    (this.parts[kind] ||= []).push(g);
    return this;
  }
  build(o = {}) {
    const M = mats(), grp = new THREE.Group();
    for (const [kind, list] of Object.entries(this.parts)) {
      const geo = mergeGeometries(list);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[kind]);
      mesh.castShadow = kind !== 'glow' && kind !== 'plant';
      mesh.receiveShadow = kind !== 'glow' && kind !== 'gem';
      if (kind === 'plant') mesh.castShadow = !!o.plantShadow;
      if (kind === 'leaf' || kind === 'bloom' || kind === 'foli' || kind === 'pine') mesh.castShadow = true;
      mesh.userData.kind = kind;
      if (M.line[kind] && o.outline !== false) addOutline(mesh, M.line[kind]);
      grp.add(mesh);
    }
    if (o.light) grp.userData.light = o.light;
    return grp;
  }
}

// ---------- 实例化放置：把一个素材（若干 mesh）按变换列表变成 InstancedMesh ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export function instance(proto, list) {
  const out = new THREE.Group();
  proto.traverse((m) => {
    if (!m.isMesh || m.userData.isLine) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, list.length);
    list.forEach((o, i) => {
      _e.set(o.tilt || 0, o.rot || 0, o.tilt2 || 0); _q.setFromEuler(_e);
      _s.set(o.s, o.sy ?? o.s, o.sz ?? o.s); _p.set(o.x, o.y || 0, o.z);
      _m.compose(_p, _q, _s); im.setMatrixAt(i, _m);
    });
    im.castShadow = m.castShadow; im.receiveShadow = m.receiveShadow;
    im.computeBoundingSphere();
    for (const l of m.children) if (l.userData.isLine) {
      const li = new THREE.InstancedMesh(l.geometry, l.material, list.length);
      li.instanceMatrix = im.instanceMatrix; li.boundingSphere = im.boundingSphere; li.userData.isLine = true;
      im.add(li);
    }
    out.add(im);
  });
  return out;
}

// ---------- 小形体 ----------
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 8, y = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2 + y, 0),
  cone: (r, h, seg = 8, y = 0) => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2 + y, 0),
  sph: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d),
  dodec: (r) => new THREE.DodecahedronGeometry(r, 0),
  tor: (r, t, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  // 沿曲线的管子（树枝、弯椰树干）
  tube: (pts, r0, r1, seg = 6) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const n = Math.max(4, pts.length * 3), g = new THREE.TubeGeometry(curve, n, 1, seg, false), p = g.attributes.position;
    // 逐段收细
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = curve.getPointAt(t), r = r0 + (r1 - r0) * t;
      for (let j = 0; j <= seg; j++) {
        const k = i * (seg + 1) + j;
        p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
      }
    }
    return g;
  },
  // 叶片：一片带中脊折角的菱形
  blade: (w, h, bend = 0.2) => {
    const g = new THREE.BufferGeometry();
    const v = [0, 0, 0, w, h * 0.45, bend * 0.4, 0, h, bend, -w, h * 0.45, bend * 0.4, 0, h * 0.4, -0.02 * h];
    const i = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];
    const pos = []; for (const k of i) pos.push(v[k * 3], v[k * 3 + 1], v[k * 3 + 2]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  },
  // 树冠团：几个凹凸球
  blobs: (parts, detail = 2, seed = 1, amt = 0.22) => mergeGeometries(parts.map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      const d = 1 + (vnoise(vx * 3 + i * 7 + seed, vz * 3 + vy * 2, seed) - 0.5) * amt;
      p.setXYZ(k, vx * d + x, vy * d * 0.92 + y, vz * d + z);
    }
    return g;
  })),
  lathe: (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg),
};

// 程序松针贴图（可平铺，中性灰，乘顶点色）：一簇簇斜向下的细针
function pineNeedleTex() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), r = mulberry32(91);
  ctx.fillStyle = 'rgb(150,150,150)'; ctx.fillRect(0, 0, N, N);
  const needle = (x, y, a, L, g) => {
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * L, y + oy + Math.sin(a) * L);
      ctx.strokeStyle = `rgb(${g},${g},${g})`; ctx.stroke();
    }
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    // 一簇：小枝向下斜，针从枝上向两侧下方散开
    const x = r() * N, y = r() * N, dir = Math.PI / 2 + (r() - 0.5) * 0.9, L = 14 + r() * 14, lit = r();
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 9; k++) {
      const t = k / 8, bx = x + Math.cos(dir) * L * t * 0.6, by = y + Math.sin(dir) * L * t * 0.6;
      for (const sd of [-1, 1]) needle(bx, by, dir + sd * (0.55 + r() * 0.3), L * (0.45 + r() * 0.25), Math.round(110 + lit * 110 + t * 25 + (r() - 0.5) * 30));
    }
  }
  // 归一到平均亮度约 0.88
  const img = ctx.getImageData(0, 0, N, N), D = img.data; let sum = 0;
  for (let i = 0; i < D.length; i += 4) sum += D[i];
  const k = (0.88 * 255) / (sum / (N * N));
  for (let i = 0; i < D.length; i += 4) D[i] = D[i + 1] = D[i + 2] = Math.min(255, D[i] * k);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// 树冠：在每个树冠球体里撒一片片真实叶子（带中脊折角的菱形叶），没有实心团块。
// 叶面大致贴着球面朝外、略微下垂；法线取球面法线，越靠里的叶子越暗（假环境光遮蔽）
export const LEAF_D = matchMedia('(pointer: coarse)').matches ? 0.7 : 1;
const _lf = { d: new THREE.Vector3(), t: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), q: new THREE.Vector3(), n: new THREE.Vector3() };
export function leafCrown(parts, color, accent, seed = 1, o = {}) {
  const r = mulberry32(seed * 7 + 3), pos = [], nor = [], col = [], dens = (o.dens ?? 1) * LEAF_D;
  const base = new THREE.Color(color), acc = accent && new THREE.Color(accent), c = new THREE.Color();
  const sq = o.sy ?? 1, cy0 = o.cy ?? parts.reduce((a, p) => a + p[1], 0) / parts.length;
  parts = parts.map(([x, y, z, R]) => [x, cy0 + (y - cy0) * sq, z, R]);
  const yMin = Math.min(...parts.map((p) => p[1] - p[3] * sq)), yMax = Math.max(...parts.map((p) => p[1] + p[3] * sq));
  const { d, t, X, Y, Z, q, n } = _lf, lk = o.leaf || [1, 1];
  // 叶片局部形状：基部、右、尖、左、中脊（中脊略凹）
  const shape = [[0, 0, 0], [0.38, 0.45, 0.06], [0, 1, 0.1], [-0.38, 0.45, 0.06], [0, 0.42, -0.05]], tris = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];
  for (const [x, y, z, R] of parts) {
    const cnt = Math.max(14, Math.round(200 * R * R * dens));
    for (let i = 0; i < cnt; i++) {
      const th = r() * Math.PI * 2, cy = r() * 1.75 - 0.75, sy = Math.sqrt(1 - cy * cy);
      d.set(Math.cos(th) * sy, cy, Math.sin(th) * sy);
      const depth = Math.sqrt(0.15 + r() * 0.85), rr = R * depth;
      const L = (0.2 + 0.13 * R) * (0.8 + r() * 0.45) * lk[0], W = lk[1];
      // 叶尖方向：沿切线 + 一点朝外 + 一点下垂
      t.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(d).normalize();
      Y.copy(t).multiplyScalar(0.8).addScaledVector(d, 0.55).add(q.set(0, -0.25, 0)).normalize();
      Z.copy(d).addScaledVector(Y, -d.dot(Y)).normalize(); X.crossVectors(Y, Z);
      const bx = x + d.x * rr, by = y + d.y * rr * sq, bz = z + d.z * rr;
      const ht = (by - yMin) / Math.max(0.01, yMax - yMin);
      const v = (0.6 + 0.45 * ht) * (0.55 + 0.45 * depth) * (0.86 + r() * 0.26) * (0.85 + 0.25 * Math.max(0, d.y));
      c.copy(base); if (acc && r() < (o.accentAmt ?? 0.08) * 2.5) c.lerp(acc, 0.85); c.multiplyScalar(v);
      for (const k of tris) {
        const [sx, sy2, sz] = shape[k];
        q.set(bx, by, bz).addScaledVector(X, sx * L * W).addScaledVector(Y, sy2 * L).addScaledVector(Z, sz * L);
        n.set(q.x - x, (q.y - y) * 1.1 + R * 0.3, q.z - z).normalize().lerp(Z, 0.25).normalize();
        pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// 树冠 / 灌木：一片片叶子；sy 把叶子分布绕 cy 压扁（叶片本身不变形）；at 整体平移
export function foliage(k, parts, color, accent, seed, o = {}) {
  k.add(leafCrown(parts, color, accent, seed, o), null, { kind: 'foli', at: o.at });
}
// 树冠上色：顶亮底暗 + 外亮内暗，偶尔撒点亮色
export function crownPaint(color, accent = null, seed = 1, accentAmt = 0.08) {
  const base = new THREE.Color(color), acc = accent && new THREE.Color(accent);
  return (geo) => {
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    return paint(geo, (p, n, out) => {
      const t = smooth(min.y, max.y, p.y), up = clamp(n.y * 0.5 + 0.5, 0, 1);
      const v = (0.55 + 0.45 * t) * (0.8 + 0.35 * up);
      out.copy(base).multiplyScalar(v);
      if (acc && vnoise(p.x * 3.3 + seed, p.z * 3.3 + p.y * 2.1, seed + 5) > 1 - accentAmt * 3) out.lerp(acc, 0.8);
    });
  };
}
// 雪盖：法线朝上处变白
export function snowCap(color, k = 0.55, snow = '#f4f8ff') {
  const base = new THREE.Color(color), s = new THREE.Color(snow);
  return (geo) => {
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    return paint(geo, (p, n, out) => {
      const t = smooth(min.y, max.y, p.y);
      out.copy(base).multiplyScalar(0.75 + 0.35 * t);
      const w = smooth(k - 0.08, k + 0.08, n.y + (vnoise(p.x * 5, p.z * 5, 3) - 0.5) * 0.3);
      out.lerp(s, w);
    });
  };
}
// 苔藓 / 草皮盖：岩石顶面
export function mossCap(color, moss, k = 0.6, amt = 1) {
  const base = new THREE.Color(color), m = new THREE.Color(moss);
  return (geo) => {
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    return paint(geo, (p, n, out) => {
      const t = smooth(min.y, max.y, p.y);
      out.copy(base).multiplyScalar(0.72 + 0.4 * t);
      const w = smooth(k - 0.1, k + 0.1, n.y + (vnoise(p.x * 4, p.z * 4 + p.y, 7) - 0.5) * 0.5) * amt;
      out.lerp(m, w);
    });
  };
}

export { mulberry32 };
export const hasFoliage = () => !!PNG.foliage;
