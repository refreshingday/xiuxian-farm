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
  // 叶簇卡片树冠：灰度叶簇贴图 × 顶点色，alphaTest 镂空；双面但不翻法线（法线是从树冠中心向外的球面法线，明暗才连贯）
  const card = chain(toon('#ffffff', { vc: true, unique: true, map: leafClumpTex() }), (s) => {
    swayPatch(s, 1, 0.8);
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#undef DOUBLE_SIDED\n#include <normal_fragment_begin>\n#define DOUBLE_SIDED');
  }, 'card');
  card.side = THREE.DoubleSide; card.alphaTest = 0.5;
  // 叶卡后面的实心内芯：暗色、无描边，挡住卡片缝隙里的“透光”
  const core = chain(toon('#ffffff', { vc: true, unique: true }), (s) => swayPatch(s, 1, 0.8), 'swayC');
  MATS = {
    solid, leaf, bloom, plant, glow: glowM, gem, ice, card, core,
    line: { solid: lineMat('#2b1d14', 0.03), leaf: lineMat('#1d2e14', 0.045, [1, 0.8]), bloom: lineMat('#3a1a1a', 0.045, [1, 0.8]), plant: lineMat('#1d2e14', 0.018, [2.2, 0.02]), ice: lineMat('#1a2a44', 0.025), gem: lineMat('#1a1428', 0.02) },
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
      if (kind === 'leaf' || kind === 'bloom' || kind === 'card') mesh.castShadow = true;
      if (kind === 'core') mesh.castShadow = false;
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

// 叶簇贴图：一团向外散开的尖叶（灰度，乘顶点色上色），透明底
let _leafTex;
function leafClumpTex() {
  if (_leafTex) return _leafTex;
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), r = mulberry32(77);
  const leaf = (x, y, a, L, w, fill, stroke) => {
    ctx.save(); ctx.translate(x * N, y * N); ctx.rotate(a + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * N, -L * N * 0.45, 0, -L * N); ctx.quadraticCurveTo(-w * N, -L * N * 0.45, 0, 0);
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.restore();
  };
  const grey = (g) => { const v = Math.round(clamp(g, 0, 1) * 255); return `rgb(${v},${v},${v})`; };
  // 1) 外缘一圈向外的尖叶 → 锯齿状轮廓
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * Math.PI * 2 + (r() - 0.5) * 0.2, d = 0.22 + r() * 0.06;
    leaf(0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, a + (r() - 0.5) * 0.5, 0.13 + r() * 0.06, 0.05, grey(0.62 - Math.sin(a) * 0.14));
  }
  // 2) 叶团主体：重叠的圆，上亮下暗
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.16, x = 0.5 + Math.cos(a) * d, y = 0.5 + Math.sin(a) * d, rr = 0.11 + r() * 0.06;
    const gr = ctx.createRadialGradient(x * N, (y - rr * 0.5) * N, 0, x * N, y * N, rr * N);
    gr.addColorStop(0, grey(0.95 - y * 0.45)); gr.addColorStop(1, grey(0.7 - y * 0.35));
    ctx.beginPath(); ctx.arc(x * N, y * N, rr * N, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  }
  // 3) 表面若隐若现的叶片（低对比），上半部更亮
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.22, x = 0.5 + Math.cos(a) * d, y = 0.5 + Math.sin(a) * d;
    leaf(x, y, a + (r() - 0.5) * 1.2, 0.08 + r() * 0.05, 0.035, y < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)', 'rgba(20,30,10,0.12)');
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_leafTex = t);
}
// 叶簇卡片：在每个树冠球体内外散布朝外的方形叶卡（不再是一团团凹凸球）
// parts: [[x, y, z, r], ...]；法线取“顶点 - 球心”与卡片朝向的混合，所以整冠有柔和的体积明暗
export function leafCards(parts, seed = 1, o = {}) {
  const r = mulberry32(seed * 7 + 3), pos = [], nor = [], uv = [], dens = o.dens ?? 1;
  const f = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), ref = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();
  for (const [x, y, z, R] of parts) {
    const cnt = Math.round((6 + R * R * 12) * dens);
    for (let i = 0; i < cnt; i++) {
      // 方向偏上（顶部更密），下半部分少放
      const th = r() * Math.PI * 2, cy = r() * 1.6 - 0.6, sy = Math.sqrt(1 - cy * cy);
      const d = new THREE.Vector3(Math.cos(th) * sy, cy, Math.sin(th) * sy);
      const rr = R * (0.55 + r() * 0.35), size = Math.max(0.32, R * (0.95 + r() * 0.45));
      c.set(x, y, z).addScaledVector(d, rr);
      f.copy(d).add(new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).multiplyScalar(0.9)).normalize();
      ref.set(0, 1, 0); if (Math.abs(f.y) > 0.92) ref.set(1, 0, 0);
      u.crossVectors(ref, f).normalize(); v.crossVectors(f, u);
      const roll = r() * Math.PI * 2, cr = Math.cos(roll), sr = Math.sin(roll);
      const U2 = u.clone().multiplyScalar(cr).addScaledVector(v, sr).multiplyScalar(size / 2), V2 = v.clone().multiplyScalar(cr).addScaledVector(u, -sr).multiplyScalar(size / 2);
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      for (const [a, b, s, t] of corners) {
        q.copy(c).addScaledVector(U2, a).addScaledVector(V2, b);
        n.set(q.x - x, (q.y - y) * 1.15 + R * 0.25, q.z - z).normalize().lerp(f, 0.3).normalize();
        pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); uv.push(s, t);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// 树冠 = 暗色实心内芯 + 外面一层叶卡；sy 绕树冠中心压扁
export function foliage(k, parts, color, accent, seed, o = {}) {
  const sy = o.sy ?? 1, cy = o.cy ?? parts.reduce((a, p) => a + p[1], 0) / parts.length;
  const squash = (g) => sy === 1 ? g : g.translate(0, -cy, 0).scale(1, sy, 1).translate(0, cy, 0);
  const dark = new THREE.Color(color).multiplyScalar(0.55);
  k.add(squash(G.blobs(parts.map(([x, y, z, R]) => [x, y, z, R * 0.72]), 1, seed, 0.15)), crownPaint('#' + dark.getHexString(), null, seed), { kind: 'core' });
  k.add(squash(leafCards(parts, seed, o)), crownPaint(color, accent, seed, o.accentAmt), { kind: 'card' });
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
