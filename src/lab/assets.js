import * as THREE from 'three';
import { Kit, G, lumpy, faceted, paint, grad, crownPaint, snowCap, mossCap, mulberry32, foliage as foliageBase, foliageLeaves } from './kit.js';
import { vnoise, smooth, clamp } from '../util.js';
import { LH } from './biomes.js';

// 素材库：每个素材 = { name, n(变体数), make(v) → Group }，变体之间形状不同而不只是换色。
// 统一比例：1 单位 ≈ 角色半身高（Q 版角色约 1.6 高）。

const TAU = Math.PI * 2;
// 画风钩子：平时全空 = 原版素材；「参考画风」（./ref/index.js）建素材时临时填上，换掉树冠 / 岩石 / 椰叶的做法
export const STYLE = {};
const foliage = (...a) => (STYLE.crown || foliageBase)(...a);
const rnd = (seed) => mulberry32(seed * 7919 + 13);
const C = (hex) => new THREE.Color(hex);

// ======================================================================
// 岩石：5 种外形 × 任意配色（地表苔藓 / 雪 / 沙 / 熔岩缝 等由 paint 决定）
// ======================================================================
const ROCK_SHAPES = [
  // 圆润巨石
  (r) => [[G.ico(0.8, 1), [0, 0.45, 0], [1.1, 0.75, 1]]],
  // 扁平石板（两块叠）
  (r) => [[G.dodec(0.75), [0, 0.18, 0], [1.4, 0.38, 1.05]], [G.dodec(0.45), [0.25, 0.42, -0.1], [1.2, 0.4, 0.9]]],
  // 竖立尖石
  (r) => [[G.ico(0.55, 0), [0, 0.75, 0], [0.75, 1.6, 0.7]], [G.ico(0.35, 0), [0.45, 0.25, 0.2], [1, 0.8, 1]]],
  // 乱石堆（3 块）
  (r) => [[G.ico(0.5, 1), [-0.35, 0.3, 0], [1, 0.75, 1]], [G.dodec(0.42), [0.35, 0.26, 0.15], [1, 0.8, 1]], [G.ico(0.3, 0), [0.05, 0.5, -0.35], [1, 0.9, 1]]],
  // 小卵石群
  (r) => [0, 1, 2, 3, 4].map((i) => [G.ico(0.18 + r() * 0.12, 1), [Math.cos(i * 1.3) * 0.45 * r(), 0.1, Math.sin(i * 1.3) * 0.45], [1.2, 0.6, 1]]),
];
function rock(v, paintFn, seed = 1, o = {}) {
  const r = rnd(seed + v * 31), k = new Kit();
  for (const [geo, at, s] of ROCK_SHAPES[v % 5](r)) {
    const g = STYLE.rock ? STYLE.rock(geo.scale(...s), seed + v * 3) : faceted(lumpy(geo.scale(...s), 0.18, 2.4, seed + v * 3));
    k.add(g, paintFn, { at, rot: [0, r() * TAU, 0], kind: STYLE.rock ? 'rock' : 'solid' });
  }
  if (o.extra) o.extra(k, r);
  return k.build(o);
}

// ======================================================================
// 树
// ======================================================================
function trunk(k, pts, r0, r1, color = '#7a5236') {
  k.add(G.tube(pts, r0, r1, 7), grad(color, 0.6, 1.05, 0.1));
  // 树根外张
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.4;
    k.add(G.cone(r0 * 0.7, r0 * 2.2, 5), grad(color, 0.55, 0.9), { at: [Math.cos(a) * r0 * 0.8, -0.05, Math.sin(a) * r0 * 0.8], rot: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0] });
  }
}
// 阔叶树 5 形：圆冠 / 高椭圆 / 伞形 / 双冠 / 小树苗
const BROAD = [
  { t: [[0, 0, 0], [0.05, 1.2, 0], [0, 2.3, 0.05]], r: 0.22, c: [[0, 3.1, 0, 1.25], [0.8, 2.75, 0.3, 0.9], [-0.75, 2.8, -0.2, 0.95], [0.1, 2.8, -0.8, 0.85], [-0.2, 2.85, 0.8, 0.9], [0.1, 3.85, 0, 0.85]] },
  { t: [[0, 0, 0], [0, 1.5, 0], [0.05, 3, 0]], r: 0.2, c: [[0, 2.6, 0, 0.85], [0, 3.4, 0, 0.95], [0, 4.2, 0, 0.75], [0.4, 3.0, 0.3, 0.65], [-0.4, 3.6, -0.2, 0.6]] },
  { t: [[0, 0, 0], [0.2, 1.4, 0], [-0.1, 2.4, 0.1]], r: 0.24, c: [[0, 2.85, 0, 1.0], [1.15, 2.65, 0.2, 0.85], [-1.1, 2.7, -0.1, 0.85], [0.2, 2.65, 1.05, 0.8], [-0.1, 2.7, -1.05, 0.8], [0.6, 3.2, -0.5, 0.7], [-0.5, 3.15, 0.5, 0.7]] },
  { t: [[0, 0, 0], [0.1, 1.0, 0], [0.7, 2.0, 0]], r: 0.24, c: [[0.9, 2.6, 0, 0.95], [1.2, 3.2, 0.2, 0.7], [-0.7, 2.25, 0.1, 0.85], [-0.8, 2.9, -0.1, 0.6], [0.2, 3.0, -0.4, 0.7]], branch: [[0.05, 1.0, 0], [-0.4, 1.6, 0.05], [-0.7, 2.0, 0.1]] },
  { t: [[0, 0, 0], [0.05, 0.6, 0], [0, 1.15, 0]], r: 0.09, c: [[0, 1.4, 0, 0.5], [0.3, 1.25, 0.1, 0.36], [-0.25, 1.3, -0.15, 0.38], [0, 1.75, 0, 0.35]] },
];
function broadTree(v, leaf, accent, seed, o = {}) {
  const T = BROAD[v % BROAD.length], k = new Kit();
  trunk(k, T.t, T.r, T.r * 0.55, o.bark);
  if (T.branch) k.add(G.tube(T.branch, T.r * 0.7, T.r * 0.35, 6), grad(o.bark || '#7a5236', 0.6, 1));
  // 冠下可见的几根小枝
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + seed, top = T.t[2];
    k.add(G.tube([[top[0], top[1] - 0.3, top[2]], [top[0] + Math.cos(a) * 0.6, top[1] + 0.2, top[2] + Math.sin(a) * 0.6]], T.r * 0.5, T.r * 0.2, 5), grad(o.bark || '#7a5236', 0.6, 1));
  }
  (o.real ? foliageLeaves : foliage)(k, T.c, leaf, accent, seed, { accentAmt: o.accentAmt });
  if (o.fruit) {
    const r = rnd(seed);
    for (let i = 0; i < 9; i++) {
      // 叶卡主要铺在树冠上半部、半径 0.55~0.9R 的壳层里：果子贴在上半部的壳层上，不会飘在冠外
      const c = T.c[Math.floor(r() * T.c.length)], a = r() * TAU, e = 0.15 + r() * 0.7, d = c[3] * 0.82;
      k.add(G.sph(0.1, 6, 5), o.fruit, { at: [c[0] + Math.cos(a) * Math.cos(e) * d, c[1] + Math.sin(e) * d, c[2] + Math.sin(a) * Math.cos(e) * d], kind: 'leaf' });
    }
  }
  return k.build();
}
// 松树：层层圆锥（可带雪）
function pine(v, color, seed, snow = false) {
  const k = new Kit(), r = rnd(seed + v);
  const tiers = [4, 5, 3, 6][v % 4], H = [3.2, 4.2, 2.4, 5][v % 4], W = [1.25, 1.35, 1.1, 1.2][v % 4];
  k.add(G.cyl(0.12, 0.18, H * 0.4), grad('#6a4630', 0.6, 1));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, y = H * (0.18 + t * 0.62), rr = W * (1 - t * 0.72) * (0.9 + r() * 0.2);
    const g = lumpy(new THREE.ConeGeometry(rr, H * 0.42, 9, 2).translate(0, H * 0.21, 0), 0.08, 3, seed + i);
    g.computeVertexNormals();
    // 下摆轻微下垂 + 锯齿
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) if (p.getY(j) < 0.05) { const a = Math.atan2(p.getZ(j), p.getX(j)); p.setY(j, p.getY(j) - (Math.sin(a * 9) * 0.5 + 0.5) * 0.12); }
    g.computeVertexNormals();
    // 雪松不用叶贴图（白雪乘上绿叶纹理会发蓝发花）
    k.add(g, snow ? snowCap(color, 0.45) : crownPaint(color, null, seed + i), { at: [0, y, 0], rot: [0, r() * TAU, 0], kind: snow ? 'solid' : 'sway' });
  }
  return k.build();
}
// 竹丛
function bamboo(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [5, 8, 3, 11][v % 4];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * [0.6, 0.9, 0.35, 1.2][v % 4], x = Math.cos(a) * d, z = Math.sin(a) * d;
    const segs = 4 + Math.floor(r() * 4), sh = 0.75 + r() * 0.25, rad = 0.05 + r() * 0.03, lean = (r() - 0.5) * 0.12;
    const col = r() < 0.6 ? '#7cae3a' : r() < 0.5 ? '#9ac04a' : '#5e9a34';
    for (let s = 0; s < segs; s++) {
      const y = s * sh;
      k.add(G.cyl(rad * 0.95, rad, sh * 0.96, 6), grad(col, 0.8, 1.1), { at: [x + lean * y, y, z + lean * y * 0.5] });
      k.add(G.cyl(rad * 1.25, rad * 1.25, 0.05, 6), grad('#4e7a2a', 0.9, 1), { at: [x + lean * (y + sh), y + sh * 0.97, z + lean * (y + sh) * 0.5] });
      // 竹节处的细枝叶
      if (s >= segs - 3 && r() < 0.8) for (let l = 0; l < 9; l++) {
        const la = r() * TAU;
        k.add(G.blade(0.07, 0.55, 0.1), grad('#5fa83a', 0.7, 1.15), { at: [x + lean * (y + sh), y + sh, z + lean * (y + sh) * 0.5], rot: [Math.PI / 2 - 0.5 + r() * 0.4, la, 0], kind: 'plant' });
      }
    }
  }
  return k.build();
}
// 椰树 / 棕榈
function palm(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const trunks = v === 2 ? [[0.3, 0.9, -0.2], [-0.25, 0.7, 0.15]] : [[0, v === 1 ? 0.2 : 1.3, 0]];
  for (const [ox, bend, oz] of trunks) {
    const H = 4 + r() * 1.2, top = [ox + bend, H, oz];
    const pts = [[ox, 0, oz], [ox + bend * 0.15, H * 0.35, oz], [ox + bend * 0.5, H * 0.7, oz], top];
    // 树干环纹
    k.add(G.tube(pts, 0.2, 0.13, 7), (g) => paint(g, (p, n, out) => out.set('#a07a4e').multiplyScalar((Math.floor(p.y * 3.2) % 2 ? 0.82 : 1.0) * (0.75 + n.y * 0.1 + 0.25))));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + r() * 0.3, len = 1.7 + r() * 0.5, f = new Kit();
      // 叶：一串小叶沿下垂弧线
      const frond = [];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, d = t * len, y = Math.sin(t * 2.2) * 0.55 - t * t * 0.9;
        frond.push([d, y]);
      }
      for (let s = 1; s < frond.length; s++) {
        const [d, y] = frond[s], w = 0.32 * Math.sin((s / 6) * Math.PI) + 0.08;
        for (const sd of [-1, 1]) k.add(G.blade(0.05, w * 1.6, 0.05), grad('#4fa040', 0.7, 1.2), { at: [top[0] + Math.cos(a) * d, top[1] + y, top[2] + Math.sin(a) * d], rot: [sd * 1.2, -a + Math.PI / 2, 0.6 * sd], kind: 'plant' });
      }
      k.add(G.tube(frond.map(([d, y]) => [top[0] + Math.cos(a) * d, top[1] + y, top[2] + Math.sin(a) * d]), 0.035, 0.012, 4), grad('#5c8a34', 0.8, 1.1), { kind: 'leaf' });
    }
    for (let i = 0; i < 3; i++) k.add(G.sph(0.12, 7, 6), grad('#6a4a2a', 0.7, 1.1), { at: [top[0] + Math.cos(i * 2.1) * 0.17, top[1] - 0.15, top[2] + Math.sin(i * 2.1) * 0.17] });
  }
  return k.build();
}
// 枯树
function deadTree(v, seed, color = '#5a4638') {
  const k = new Kit(), r = rnd(seed + v), H = [2.6, 3.4, 1.8][v % 3];
  trunk(k, [[0, 0, 0], [0.1, H * 0.5, 0.05], [-0.1, H, 0]], 0.2, 0.08, color);
  const branch = (p, a, len, depth, rr) => {
    if (depth === 0) return;
    const e = [p[0] + Math.cos(a) * len, p[1] + len * (0.5 + r() * 0.4), p[2] + Math.sin(a) * len];
    k.add(G.tube([p, [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2 + 0.05, (p[2] + e[2]) / 2], e], rr, rr * 0.5, 5), grad(color, 0.6, 1));
    for (let i = 0; i < 2; i++) branch(e, a + (r() - 0.5) * 1.6, len * 0.62, depth - 1, rr * 0.5);
  };
  for (let i = 0; i < 3 + (v % 2); i++) branch([0, H * (0.55 + i * 0.12), 0], i * 2.2 + r(), 0.8 + r() * 0.4, 3, 0.08);
  return k.build();
}

// ======================================================================
// 灌木 / 花草
// ======================================================================
function bush(v, color, accent, seed, sy = 1, kind = 'leaf', real = false) {
  const k = new Kit(), r = rnd(seed + v);
  const parts = [
    [[0, 0.45, 0, 0.55], [0.45, 0.35, 0.1, 0.4], [-0.4, 0.38, -0.1, 0.42]],
    [[0, 0.35, 0, 0.42]],
    [[-0.5, 0.32, 0, 0.38], [0, 0.42, 0.1, 0.48], [0.55, 0.3, -0.05, 0.36], [0.1, 0.3, -0.45, 0.34]],
    [[0, 0.55, 0, 0.45], [0, 0.95, 0, 0.32]],
  ][v % 4];
  (real ? foliageLeaves : foliage)(k, parts, color, accent, seed + v, { sy, cy: 0, accentAmt: accent ? 0.12 : 0, dens: 1.4 });
  return k.build();
}
const FLOWER_KIND = [
  // 雏菊：白瓣黄心
  { petals: 8, pc: '#ffffff', cc: '#ffcc33', h: 0.32, n: 7, size: 0.07 },
  // 郁金香：杯形
  { tulip: true, pc: '#ff6a7a', h: 0.38, n: 5, size: 0.08 },
  // 薰衣草：穗状
  { spike: true, pc: '#a78bf0', h: 0.45, n: 9, size: 0.035 },
  // 金盏：橙色
  { petals: 6, pc: '#ffaa33', cc: '#c05a1a', h: 0.28, n: 6, size: 0.075 },
  // 铃兰：下垂小钟
  { bell: true, pc: '#f4f0ff', h: 0.3, n: 4, size: 0.05 },
  // 粉色绣球
  { ball: true, pc: '#ff9ec7', h: 0.36, n: 4, size: 0.12 },
];
function flowers(v, seed, override) {
  const F = { ...FLOWER_KIND[v % FLOWER_KIND.length], ...override }, k = new Kit(), r = rnd(seed + v);
  for (let i = 0; i < F.n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.35, x = Math.cos(a) * d, z = Math.sin(a) * d, h = F.h * (0.75 + r() * 0.5);
    k.add(G.cyl(0.012, 0.016, h, 4), grad('#4f9632', 0.8, 1.1), { at: [x, 0, z], kind: 'plant' });
    for (let l = 0; l < 2; l++) k.add(G.blade(0.035, 0.16, 0.05), grad('#5aa238', 0.7, 1.1), { at: [x, h * 0.2, z], rot: [0.7, r() * TAU, 0], kind: 'plant' });
    const top = [x, h, z];
    if (F.spike) for (let s = 0; s < 6; s++) k.add(G.sph(F.size, 5, 4), grad(F.pc, 0.8, 1.2), { at: [x, h + s * 0.04 - 0.08, z], kind: 'plant', s: 1 - s * 0.1 });
    else if (F.tulip) k.add(G.lathe([[0, 0], [0.05, 0.02], [0.07, 0.08], [0.055, 0.14], [0.045, 0.12]], 6), grad(F.pc, 0.75, 1.2), { at: top, kind: 'plant' });
    else if (F.bell) for (let s = 0; s < 3; s++) k.add(G.lathe([[0, 0.06], [0.03, 0.05], [0.045, 0.0], [0.05, -0.01]], 6), grad(F.pc, 0.85, 1.1), { at: [x + 0.05 * (s + 1), h - 0.03 * s, z], kind: 'plant' });
    else if (F.ball) k.add(lumpy(G.ico(F.size, 1), 0.04, 12), crownPaint(F.pc, '#ffffff', i), { at: top, kind: 'plant' });
    else {
      for (let p = 0; p < F.petals; p++) k.add(G.sph(F.size * 0.6, 5, 3), grad(F.pc, 0.85, 1.15), { at: [x + Math.cos(p / F.petals * TAU) * F.size, h, z + Math.sin(p / F.petals * TAU) * F.size], s: [1.3, 0.35, 0.8], rot: [0, -p / F.petals * TAU, 0], kind: 'plant' });
      k.add(G.sph(F.size * 0.55, 6, 4), grad(F.cc, 0.9, 1.1), { at: [x, h + 0.01, z], s: [1, 0.6, 1], kind: 'plant' });
    }
  }
  return k.build();
}
function grassTuft(v, color, seed, o = {}) {
  const k = new Kit(), r = rnd(seed + v), n = [9, 14, 6, 18][v % 4], H = (o.h || [0.35, 0.5, 0.28, 0.7][v % 4]);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.22;
    k.add(G.blade(0.03 + r() * 0.02, H * (0.6 + r() * 0.6), 0.08 + r() * 0.12), grad(color, 0.55, 1.2, 0.1), { at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [0, r() * TAU, 0], kind: 'plant' });
  }
  if (o.seed) for (let i = 0; i < 3; i++) k.add(G.sph(0.03, 5, 4), o.seed, { at: [(r() - 0.5) * 0.3, H * 1.1, (r() - 0.5) * 0.3], s: [0.7, 1.6, 0.7], kind: 'plant' });
  return k.build();
}
function mushroom(v, cap, seed, glow = false) {
  const k = new Kit(), r = rnd(seed + v);
  const shapes = [
    [[0, 0, 0.3, 0.2]],                                  // 单个大伞
    [[0, 0, 0.22, 0.15], [0.2, 0.1, 0.14, 0.1], [-0.15, 0.12, 0.1, 0.08]], // 三兄弟
    [[0, 0, 0.42, 0.12]],                                // 细高
    [[0, 0, 0.16, 0.24], [0.25, -0.1, 0.12, 0.16]],       // 胖矮
  ][v % 4];
  for (const [x, z, h, cr] of shapes) {
    k.add(G.cyl(cr * 0.28, cr * 0.38, h, 7), grad('#f4e8d0', 0.8, 1.05), { at: [x, 0, z] });
    const capG = G.sph(cr, 10, 6).scale(1, 0.62, 1);
    const pos = capG.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.15);
    k.add(capG, (g) => paint(g, (p, n, out) => {
      out.set(cap).multiplyScalar(glow ? 0.55 + 0.45 * n.y : 0.7 + n.y * 0.4);
      const spot = vnoise(p.x * 22 + x * 9, p.z * 22 + p.y * 9, 3);
      if (spot > 0.72 && n.y > 0.2 && v % 2 === 0) out.set(glow ? '#ffffff' : '#fff6e8');
    }), { at: [x, h, z], kind: glow ? 'gem' : 'solid' });
  }
  return k.build({ light: glow ? { color: cap, i: 0.6, d: 4, y: 0.4 } : null });
}

// ======================================================================
// 木作：篱笆 / 木桶 / 木箱 / 路牌 / 码头 ...
// ======================================================================
const WOOD = '#a8743f', DWOOD = '#7a5236';
function plank(w, h, d, color = WOOD, seed = 1) {
  const g = G.box(w, h, d);
  return [g, (geo) => paint(geo, (p, n, out) => out.set(color).multiplyScalar((0.85 + 0.15 * n.y) * (0.92 + (vnoise(p.x * 9 + seed, p.y * 1.5 + p.z * 9, seed) - 0.5) * 0.25)))];
}
function fence(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  if (v === 0 || v === 2) {
    const n = 3, L = 2.4;
    for (let i = 0; i <= n; i++) {
      if (v === 2 && i === 2) continue;
      const x = -L / 2 + i * L / n;
      k.add(...plank(0.16, 0.85, 0.16, WOOD, i), { at: [x, 0.42, 0], rot: [0, 0, v === 2 ? (r() - 0.5) * 0.2 : 0] });
      k.add(new THREE.ConeGeometry(0.12, 0.14, 4).rotateY(Math.PI / 4), grad(WOOD), { at: [x, 0.92, 0] });
    }
    for (const y of [0.32, 0.62]) {
      if (v === 2 && y === 0.62) { k.add(...plank(L * 0.55, 0.1, 0.07), { at: [-L * 0.22, y, 0.05] }); k.add(...plank(L * 0.4, 0.1, 0.07), { at: [L * 0.3, y - 0.2, 0.1], rot: [0, 0, 0.35] }); continue; }
      k.add(...plank(L, 0.1, 0.07, WOOD, y * 10), { at: [0, y, 0.05] });
    }
  } else if (v === 1) { // 竹篱
    for (let i = 0; i < 9; i++) k.add(G.cyl(0.045, 0.05, 0.9 + (i % 2) * 0.12, 6), grad('#b8b060', 0.8, 1.1), { at: [-1.1 + i * 0.27, 0, 0] });
    for (const y of [0.3, 0.7]) k.add(G.cyl(0.035, 0.035, 2.4, 6), grad('#a09850'), { at: [-1.2, y, 0.06], rot: [0, 0, -Math.PI / 2] });
  } else { // 石柱木栏
    for (const x of [-1.1, 1.1]) k.add(faceted(lumpy(G.box(0.3, 1.0, 0.3), 0.04, 5)), grad('#a8a29c', 0.75, 1.05, 0.15), { at: [x, 0.5, 0] });
    k.add(...plank(2.0, 0.12, 0.1, DWOOD), { at: [0, 0.75, 0] });
    for (let i = 0; i < 5; i++) k.add(...plank(0.07, 0.6, 0.06, DWOOD), { at: [-0.8 + i * 0.4, 0.42, 0] });
  }
  return k.build();
}
function barrel(v, seed) {
  const k = new Kit(), shapes = [[0.34, 0.8], [0.45, 0.55], [0.26, 1.0]], [R, H] = shapes[v % 3];
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([R * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * H]); }
  k.add(G.lathe(pts, 14), (g) => paint(g, (p, n, out) => { const a = Math.atan2(p.z, p.x); out.set('#9a6438').multiplyScalar((Math.floor(a / TAU * 14 + 7) % 2 ? 0.9 : 1) * (0.7 + 0.3 * (p.y / H))); }));
  k.add(new THREE.CircleGeometry(R * 0.86, 14).rotateX(-Math.PI / 2), grad('#b47a48', 0.9, 0.9), { at: [0, H - 0.01, 0] });
  for (const t of [0.15, 0.85]) k.add(G.tor(R * (0.86 + 0.14 * Math.sin(t * Math.PI)) + 0.01, 0.025, 4, 16), grad('#4a4a52', 0.8, 1.2), { at: [0, t * H, 0], rot: [Math.PI / 2, 0, 0] });
  if (v === 1) for (let i = 0; i < 5; i++) k.add(G.sph(0.11, 7, 5), grad(['#e84a3a', '#f2b23a', '#7ac04a'][i % 3]), { at: [Math.cos(i * 1.3) * 0.2, H + 0.05, Math.sin(i * 1.3) * 0.2] });
  if (v === 2) k.add(G.cyl(0.02, 0.02, 0.5, 4), grad(DWOOD), { at: [0.1, H - 0.1, 0], rot: [0, 0, 0.3] });
  return k.build();
}
function crate(v, seed) {
  const k = new Kit(), r = rnd(seed + v), S = [0.7, 0.5, 0.9][v % 3];
  const box = (s, at, rot = 0) => {
    k.add(...plank(s, s, s, WOOD, at[1] * 5), { at: [at[0], at[1] + s / 2, at[2]], rot: [0, rot, 0] });
    for (const sg of [-1, 1]) for (const sh of [-1, 1]) k.add(...plank(0.07, s + 0.02, 0.07, DWOOD), { at: [at[0] + Math.cos(rot) * sg * s / 2 + Math.sin(rot) * sh * s / 2, at[1] + s / 2, at[2] - Math.sin(rot) * sg * s / 2 + Math.cos(rot) * sh * s / 2], rot: [0, rot, 0] });
    k.add(...plank(s * 1.3, 0.08, 0.04, DWOOD), { at: [at[0] + Math.sin(rot) * s / 2, at[1] + s / 2, at[2] + Math.cos(rot) * (s / 2 + 0.01)], rot: [0, rot, Math.PI / 4] });
  };
  box(S, [0, 0, 0]);
  if (v === 1) { box(0.42, [0.55, 0, 0.1], 0.4); box(0.38, [0.1, S, 0], 0.7); }
  if (v === 2) k.add(G.sph(0.14, 8, 6), grad('#e8c25a', 0.8, 1.3), { at: [0, S + 0.08, 0], s: [1.3, 0.5, 1] });
  return k.build();
}
function jar(v, seed) {
  const k = new Kit();
  const prof = [
    [[0, 0], [0.22, 0.02], [0.32, 0.25], [0.3, 0.5], [0.16, 0.62], [0.14, 0.7], [0.18, 0.74]],
    [[0, 0], [0.18, 0.02], [0.2, 0.4], [0.12, 0.5], [0.11, 0.62], [0.15, 0.66]],
    [[0, 0], [0.3, 0.02], [0.38, 0.18], [0.35, 0.32], [0.26, 0.38], [0.27, 0.42]],
    [[0, 0], [0.12, 0.02], [0.24, 0.3], [0.2, 0.55], [0.08, 0.78], [0.07, 0.95], [0.11, 1.0]],
  ][v % 4];
  const col = ['#b85a3a', '#3a5e8a', '#8a6a4a', '#e8e0d0'][v % 4];
  k.add(G.lathe(prof, 14), (g) => paint(g, (p, n, out) => { out.set(col).multiplyScalar(0.7 + 0.4 * clamp(n.y + 0.5, 0, 1)); if (v === 3 && Math.abs(p.y - 0.35) < 0.06) out.set('#3a6aa8'); if (v === 0 && Math.abs(p.y - 0.42) < 0.03) out.set('#f2d29a'); }));
  if (v === 2) k.add(G.cyl(0.24, 0.24, 0.02, 12), grad('#2a5a90'), { at: [0, 0.38, 0], kind: 'glow' });
  return k.build();
}
function signpost(v, seed) {
  const k = new Kit();
  k.add(...plank(0.12, 1.6, 0.12, DWOOD), { at: [0, 0.8, 0] });
  const boards = v === 0 ? [[0.4, 1.35, 0.2], [-0.35, 1.05, -0.3]] : [[0, 1.3, 0]];
  for (const [x, y, rot] of boards) {
    k.add(...plank(v === 0 ? 0.85 : 0.9, v === 0 ? 0.24 : 0.6, 0.06, WOOD, y * 3), { at: [x, y, 0.08], rot: [0, rot, 0] });
    if (v === 0) k.add(new THREE.ConeGeometry(0.15, 0.2, 3).rotateZ(-Math.PI / 2 * Math.sign(x)), grad(WOOD), { at: [x + Math.sign(x) * 0.5, y, 0.08], rot: [0, rot, 0] });
  }
  if (v === 1) { k.add(new THREE.ConeGeometry(0.62, 0.3, 4).rotateY(Math.PI / 4), grad('#5a6070'), { at: [0, 1.75, 0.08], s: [1, 1, 0.3] }); k.add(G.box(0.7, 0.4, 0.02), grad('#f0e4c8'), { at: [0, 1.3, 0.12] }); }
  return k.build();
}
function dock(v) {
  const k = new Kit(), L = v === 0 ? 3.2 : 2.2, W = 1.4;
  for (let i = 0; i < Math.round(L / 0.3); i++) k.add(...plank(W, 0.08, 0.27, i % 3 ? WOOD : '#9a6a3a', i), { at: [0, 0.42, -L / 2 + 0.15 + i * 0.3], rot: [0, 0, (i % 4 === 1 ? 0.03 : 0)] });
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) for (const z of [-L / 2 + 0.2, 0, L / 2 - 0.2]) k.add(G.cyl(0.09, 0.1, 0.95, 7), grad(DWOOD, 0.5, 1), { at: [x, -0.4, z] });
  if (v === 1) {
    k.add(G.cyl(0.08, 0.08, 0.5, 6), grad(DWOOD), { at: [W / 2 - 0.1, 0.45, L / 2 - 0.2] });
    k.add(G.tor(0.12, 0.03, 4, 10), grad('#d8c08a'), { at: [W / 2 - 0.1, 0.7, L / 2 - 0.2], rot: [Math.PI / 2, 0, 0] });
  }
  return k.build();
}
function bridge(v) {
  const k = new Kit(), L = 4, W = 1.3, H = 0.7;
  for (let i = 0; i <= 13; i++) {
    const t = i / 13, x = -L / 2 + t * L, y = Math.sin(t * Math.PI) * H, a = Math.cos(t * Math.PI) * H * Math.PI / L;
    k.add(...plank(0.3, 0.08, W, i % 2 ? WOOD : '#b88048', i), { at: [x, y + 0.2, 0], rot: [0, 0, Math.atan(a)] });
  }
  for (const s of [-1, 1]) {
    const rail = []; for (let i = 0; i <= 8; i++) { const t = i / 8; rail.push([-L / 2 + t * L, Math.sin(t * Math.PI) * H + 0.85, s * W / 2]); }
    k.add(G.tube(rail, 0.045, 0.045, 5), grad(v ? '#c84a3a' : DWOOD));
    for (let i = 0; i <= 4; i++) { const t = i / 4; k.add(G.cyl(0.05, 0.05, 0.7, 5), grad(v ? '#c84a3a' : DWOOD), { at: [-L / 2 + t * L, Math.sin(t * Math.PI) * H + 0.2, s * W / 2] }); }
  }
  return k.build();
}
function well(v) {
  const k = new Kit();
  k.add(G.cyl(0.9, 1.0, 0.8, 14), (g) => paint(g, (p, n, out) => { const a = Math.atan2(p.z, p.x), row = Math.floor(p.y * 5), b = Math.floor(a / TAU * 12 + row * 0.5); out.set('#b4aea8').multiplyScalar(((p.y * 5) % 1 < 0.15 ? 0.7 : 0.88 + ((b * 37) % 7) * 0.03) * (0.85 + n.y * 0.15)); }));
  k.add(G.tor(0.92, 0.09, 6, 18), grad('#9a948e'), { at: [0, 0.82, 0], rot: [Math.PI / 2, 0, 0] });
  k.add(new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2), grad('#2a5a90'), { at: [0, 0.55, 0], kind: 'glow' });
  if (v === 0) {
    for (const s of [-1, 1]) k.add(...plank(0.14, 1.9, 0.14, DWOOD), { at: [s * 0.85, 0.95, 0] });
    k.add(G.cyl(0.07, 0.07, 1.9, 6), grad(DWOOD), { at: [-0.95, 1.6, 0], rot: [0, 0, -Math.PI / 2] });
    for (const s of [-1, 1]) k.add(...plank(2.2, 0.08, 0.95, '#5a6070'), { at: [0, 2.05, s * 0.4], rot: [s * 0.55, 0, 0] });
    k.add(G.cyl(0.13, 0.11, 0.2, 8), grad('#8a5a3a'), { at: [0.2, 1.0, 0] });
  } else {
    k.add(G.box(0.12, 1.6, 0.12), grad('#7a5236'), { at: [0.9, 0.8, 0] });
    k.add(G.box(1.8, 0.1, 0.1), grad('#7a5236'), { at: [0.2, 1.6, 0], rot: [0, 0, 0.2] });
    k.add(G.cyl(0.12, 0.1, 0.18, 8), grad('#8a5a3a'), { at: [-0.6, 1.0, 0] });
  }
  return k.build();
}
function scarecrow(v) {
  const k = new Kit();
  k.add(...plank(0.1, 1.7, 0.1, DWOOD), { at: [0, 0.85, 0] });
  k.add(...plank(1.3, 0.08, 0.08, DWOOD), { at: [0, 1.25, 0] });
  k.add(G.cyl(0.24, 0.3, 0.6, 8), grad(v ? '#5a7ab0' : '#b0603a', 0.8, 1.05), { at: [0, 0.85, 0] });
  for (const s of [-1, 1]) k.add(G.cone(0.1, 0.18, 6), grad('#e8c870'), { at: [s * 0.68, 1.25, 0], rot: [0, 0, s * Math.PI / 2] });
  k.add(G.sph(0.24, 10, 8), grad('#f0dca0', 0.85, 1.05), { at: [0, 1.65, 0] });
  k.add(G.cone(v ? 0.25 : 0.5, v ? 0.4 : 0.25, 10), grad(v ? '#5a4a3a' : '#e8c870', 0.85, 1.1), { at: [0, 1.78, 0] });
  if (!v) k.add(G.cyl(0.5, 0.5, 0.03, 12), grad('#d8b860'), { at: [0, 1.78, 0] });
  for (const s of [-1, 1]) k.add(G.sph(0.03, 5, 4), grad('#2a1a10'), { at: [s * 0.08, 1.68, 0.22] });
  return k.build();
}
function stump(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const ring = (g) => paint(g, (p, n, out) => {
    if (n.y > 0.8) { const d = Math.hypot(p.x, p.z); out.set('#e0b878').multiplyScalar(Math.floor(d * 18) % 2 ? 0.88 : 1); }
    else out.set('#7a5236').multiplyScalar(0.7 + 0.15 * Math.sin(Math.atan2(p.z, p.x) * 9) + 0.15 * (p.y > 0 ? 1 : 0));
  });
  if (v === 0 || v === 3) {
    k.add(G.cyl(0.42, 0.5, 0.45, 12), ring);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; k.add(G.cone(0.14, 0.4, 5), grad('#6a4630'), { at: [Math.cos(a) * 0.45, -0.05, Math.sin(a) * 0.45], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] }); }
    if (v === 3) { // 插着斧头
      k.add(...plank(0.06, 0.7, 0.06, '#9a6a3a'), { at: [0.1, 0.75, 0], rot: [0, 0, 0.5] });
      k.add(G.box(0.08, 0.2, 0.28), grad('#8a8e98', 0.8, 1.3), { at: [-0.05, 0.5, 0], rot: [0, 0, 0.5] });
    }
  } else { // 倒木（可空心）
    const L = v === 1 ? 2.2 : 1.6;
    k.add(new THREE.CylinderGeometry(0.3, 0.34, L, 10, 1, v === 2).rotateZ(Math.PI / 2), ring, { at: [0, 0.3, 0] });
    if (v === 2) k.add(new THREE.CylinderGeometry(0.22, 0.25, L, 10, 1, true).rotateZ(Math.PI / 2).scale(1, 1, 1), grad('#3a2618'), { at: [0, 0.3, 0] });
    for (const s of [-1, 1]) k.add(new THREE.CircleGeometry(v === 2 ? 0.02 : 0.31, 10).rotateY(s * Math.PI / 2), ring, { at: [s * L / 2, 0.3, 0] });
    k.add(G.tube([[0.2, 0.5, 0], [0.4, 0.8, 0.1], [0.45, 1.0, 0.25]], 0.06, 0.03, 5), grad('#7a5236'));
    for (let i = 0; i < 4; i++) k.add(G.sph(0.08 + r() * 0.05, 6, 4), grad('#5fae3e', 0.8, 1.2), { at: [(r() - 0.5) * L * 0.8, 0.58, (r() - 0.5) * 0.2], s: [1.4, 0.5, 1.1] });
  }
  return k.build();
}

// ======================================================================
// 作物
// ======================================================================
function crop(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  k.add(G.box(1.2, 0.12, 1.2), (g) => paint(g, (p, n, out) => out.set('#7a5034').multiplyScalar((Math.floor((p.z + 0.6) * 5) % 2 ? 0.85 : 1) * (0.8 + 0.2 * n.y))), { at: [0, 0.06, 0] });
  const spots = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
  for (const [x, z] of spots) {
    const P = [x, 0.12, z];
    if (v === 0) { // 白菜
      for (let i = 0; i < 7; i++) k.add(G.sph(0.14, 8, 6).scale(1, 0.7, 0.5), grad(i < 3 ? '#e8f4c0' : '#7ac04a', 0.8, 1.15), { at: [x + Math.cos(i) * 0.06, 0.18, z + Math.sin(i) * 0.06], rot: [0.4, i * 0.9, 0], kind: 'plant' });
    } else if (v === 1) { // 萝卜
      k.add(lumpy(G.sph(0.13, 8, 6), 0.02), grad('#f4f0e8', 0.85, 1.05), { at: [x, 0.16, z] });
      for (let i = 0; i < 5; i++) k.add(G.blade(0.06, 0.35, 0.1), grad('#5fae3e', 0.7, 1.2), { at: [x, 0.24, z], rot: [0.4, i * 1.25, 0], kind: 'plant' });
    } else if (v === 2) { // 番茄架
      k.add(G.cyl(0.015, 0.015, 0.8, 4), grad(DWOOD), { at: P });
      foliage(k, [[0, 0.45, 0, 0.18], [0.05, 0.62, 0.02, 0.14]], '#4f9a3a', null, Math.round(x * 9), { at: P, dens: 2, leaf: [0.7, 1] });
      for (let i = 0; i < 3; i++) k.add(G.sph(0.06, 7, 5), grad('#e8442e', 0.8, 1.3), { at: [x + Math.cos(i * 2) * 0.14, 0.45 + i * 0.1, z + Math.sin(i * 2) * 0.14] });
    } else if (v === 3) { // 麦子
      for (let i = 0; i < 6; i++) {
        const ox = x + (r() - 0.5) * 0.3, oz = z + (r() - 0.5) * 0.3, h = 0.55 + r() * 0.15;
        k.add(G.cyl(0.01, 0.012, h, 3), grad('#c8b050'), { at: [ox, 0.12, oz], kind: 'plant' });
        k.add(G.sph(0.035, 5, 4), grad('#e8c860', 0.8, 1.2), { at: [ox, 0.12 + h + 0.05, oz], s: [1, 2.4, 1], kind: 'plant' });
      }
    } else { // 南瓜
      const g = G.sph(0.17, 12, 8).scale(1, 0.7, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), s = 1 - 0.08 * Math.abs(Math.sin(a * 4)); p.setXYZ(i, p.getX(i) * s, p.getY(i), p.getZ(i) * s); }
      k.add(g, grad('#f2902a', 0.75, 1.15), { at: [x, 0.22, z] });
      k.add(G.cyl(0.02, 0.025, 0.08, 5), grad('#5a6a2a'), { at: [x, 0.33, z] });
      k.add(G.blade(0.12, 0.2, 0.05), grad('#4f9632'), { at: [x + 0.12, 0.12, z], rot: [1.2, 0.5, 0], kind: 'plant' });
    }
  }
  return k.build();
}
function pumpkin(v, seed) {
  const k = new Kit(), cols = ['#f2902a', '#e8c25a', '#d8e0d0'], S = [0.4, 0.3, 0.5][v % 3];
  const g = G.sph(S, 16, 10).scale(1, 0.72, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), s = 1 - 0.09 * Math.abs(Math.sin(a * 4)); p.setXYZ(i, p.getX(i) * s, p.getY(i), p.getZ(i) * s); }
  g.computeVertexNormals();
  k.add(g, (geo) => paint(geo, (q, n, out) => { const a = Math.atan2(q.z, q.x); out.set(cols[v % 3]).multiplyScalar((0.75 + 0.3 * n.y) * (0.85 + 0.15 * Math.abs(Math.cos(a * 4)))); }), { at: [0, S * 0.68, 0] });
  k.add(G.tube([[0, S * 1.2, 0], [0.05, S * 1.5, 0], [0.15, S * 1.6, 0.05]], 0.05, 0.03, 5), grad('#5a6a2a'));
  k.add(G.blade(0.16, 0.3, 0.1), grad('#4f9632'), { at: [0.1, S * 1.2, 0.1], rot: [1.1, 0.8, 0], kind: 'plant' });
  return k.build();
}

// ======================================================================
// 水边：芦苇 / 荷叶 / 荷花 / 贝壳 / 海星 / 浮木
// ======================================================================
function reeds(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [8, 14, 5][v % 3];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.4, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.9 + r() * 0.7;
    k.add(G.blade(0.03, h, 0.15), grad('#6a9a3a', 0.6, 1.15), { at: [x, 0, z], rot: [0, r() * TAU, 0], kind: 'plant' });
    if (v !== 2 && r() < 0.45) { k.add(G.cyl(0.01, 0.01, h * 1.1, 3), grad('#7a8a3a'), { at: [x, 0, z], kind: 'plant' }); k.add(G.cyl(0.045, 0.045, 0.22, 6), grad('#7a4a2a', 0.8, 1.1), { at: [x, h * 1.1 - 0.05, z], kind: 'plant' }); }
    if (v === 2) k.add(G.sph(0.06, 5, 4), grad('#f0ecd8'), { at: [x, h * 0.95, z], s: [0.8, 1.8, 0.8], kind: 'plant' });
  }
  return k.build();
}
function lily(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [3, 5, 1][v % 3];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = i ? 0.4 + r() * 0.4 : 0, R = 0.28 + r() * 0.2;
    const g = new THREE.CircleGeometry(R, 14, 0.3, TAU - 0.5).rotateX(-Math.PI / 2);
    k.add(g, (geo) => paint(geo, (p, nn, out) => out.set('#4fa040').multiplyScalar(0.8 + 0.3 * Math.hypot(p.x, p.z) / R)), { at: [Math.cos(a) * d, 0.02, Math.sin(a) * d], rot: [0, r() * TAU, 0] });
  }
  if (v !== 0) { // 荷花
    const lot = new THREE.Vector3(0, 0.05, 0);
    for (let ring = 0; ring < 2; ring++) for (let p = 0; p < 6; p++) {
      const a = p / 6 * TAU + ring * 0.5;
      k.add(G.blade(0.07, 0.22 - ring * 0.04, 0.1), grad(v === 2 ? '#ffffff' : '#ff9ec7', 0.85, 1.2), { at: [lot.x, lot.y, lot.z], rot: [0.9 - ring * 0.5, a, 0] });
    }
    k.add(G.cyl(0.045, 0.04, 0.06, 8), grad('#ffd84a'), { at: [0, 0.08, 0] });
  }
  return k.build();
}
function shell(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  for (let i = 0; i < 3; i++) {
    const at = [(r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6], rot = [0, r() * TAU, 0], kind = (v + i) % 4;
    if (kind === 0) { // 扇贝
      const g = new THREE.SphereGeometry(0.12, 12, 4, 0, Math.PI, 0, Math.PI / 2).rotateX(-Math.PI / 2 + 0.3);
      k.add(g, (geo) => paint(geo, (p, n, out) => out.set('#ffb8a0').multiplyScalar(Math.floor(Math.atan2(p.z, p.x) * 6) % 2 ? 0.85 : 1.05)), { at: [at[0], 0.02, at[2]], rot });
    } else if (kind === 1) { // 海螺
      for (let s = 0; s < 5; s++) k.add(G.sph(0.07 * (1 - s * 0.16), 7, 5), grad('#f4e0c0', 0.85, 1.1), { at: [at[0] + s * 0.03, 0.05 + s * 0.035, at[2]], rot });
    } else if (kind === 2) { // 海星
      for (let a = 0; a < 5; a++) k.add(G.cone(0.04, 0.17, 4), grad('#ff7a4a', 0.8, 1.2), { at: [at[0] + Math.cos(a / 5 * TAU) * 0.01, 0.03, at[2] + Math.sin(a / 5 * TAU) * 0.01], rot: [0, -a / 5 * TAU, -Math.PI / 2] });
      k.add(G.sph(0.05, 6, 4), grad('#ff8a5a'), { at: [at[0], 0.03, at[2]], s: [1, 0.5, 1] });
    } else k.add(lumpy(G.ico(0.06, 0), 0.02), grad('#d8d0c8'), { at: [at[0], 0.04, at[2]], s: [1.3, 0.6, 1], flat: true });
  }
  return k.build();
}
function driftwood(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const pts = [[[-1, 0.12, 0], [-0.3, 0.16, 0.2], [0.4, 0.12, -0.1], [1, 0.1, 0.1]], [[-0.7, 0.1, 0], [0, 0.14, 0.05], [0.6, 0.11, -0.2]], [[-0.4, 0.1, -0.3], [0.3, 0.15, 0.3]]][v % 3];
  k.add(G.tube(pts, 0.13, 0.07, 6), grad('#c8b8a0', 0.75, 1.1, 0.15));
  if (v === 0) k.add(G.tube([[-0.3, 0.15, 0.2], [-0.4, 0.4, 0.5], [-0.35, 0.6, 0.6]], 0.06, 0.02, 5), grad('#c8b8a0'));
  return k.build();
}

// ======================================================================
// 雪原
// ======================================================================
function snowDrift(v, seed) {
  const k = new Kit(), parts = [[[0, 0, 0, 0.8], [0.7, 0, 0.2, 0.55]], [[0, 0, 0, 0.5]], [[-0.6, 0, 0, 0.6], [0.2, 0, 0.1, 0.75], [0.9, 0, -0.2, 0.45]]][v % 3];
  const g = G.blobs(parts, 2, seed, 0.1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0, p.getY(i)) * 0.45);
  g.computeVertexNormals();
  k.add(g, (geo) => paint(geo, (q, n, out) => out.set('#eef4ff').multiplyScalar(0.8 + 0.25 * n.y).lerp(C('#b8cce8'), clamp(-n.x * 0.4, 0, 0.4))));
  return k.build({ outline: false });
}
function iceCrystal(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [3, 5, 1][v % 3];
  for (let i = 0; i < n; i++) {
    const h = (i ? 0.5 + r() * 0.6 : 1.3) * (v === 2 ? 1.5 : 1), a = r() * TAU, d = i ? 0.25 + r() * 0.2 : 0;
    const g = new THREE.CylinderGeometry(0, 0.16, 0.35, 6).translate(0, h + 0.17, 0);
    const body = mergeTwo(new THREE.CylinderGeometry(0.16, 0.13, h, 6).translate(0, h / 2, 0), g);
    k.add(body, (geo) => paint(geo, (p, nn, out) => out.set('#a8e0ff').multiplyScalar(0.75 + 0.45 * smooth(0, h, p.y))), { at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [Math.cos(a) * 0.35 * (i ? 1 : 0), 0, -Math.sin(a) * 0.35 * (i ? 1 : 0)], kind: 'ice', flat: true });
  }
  return k.build({ light: { color: '#8ad0ff', i: 0.4, d: 4, y: 0.8 } });
}
function mergeTwo(a, b) {
  const x = a.index ? a.toNonIndexed() : a, y = b.index ? b.toNonIndexed() : b;
  const g = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'uv']) {
    const A = x.attributes[n], B = y.attributes[n], arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array); arr.set(B.array, A.array.length);
    g.setAttribute(n, new THREE.BufferAttribute(arr, A.itemSize));
  }
  return g;
}
function snowman(v) {
  const k = new Kit(), S = v ? 0.8 : 1;
  const snow = (geo) => paint(geo, (p, n, out) => out.set('#f4f8ff').multiplyScalar(0.82 + 0.2 * n.y));
  k.add(G.sph(0.5 * S, 14, 10), snow, { at: [0, 0.42 * S, 0] });
  k.add(G.sph(0.36 * S, 14, 10), snow, { at: [0, 1.05 * S, 0] });
  if (!v) k.add(G.sph(0.26 * S, 12, 8), snow, { at: [0, 1.5 * S, 0] });
  const hy = v ? 1.05 * S : 1.5 * S, hr = v ? 0.36 * S : 0.26 * S;
  k.add(G.cone(0.05, 0.25, 6), grad('#ff7a2a'), { at: [0, hy, hr * 0.9], rot: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) k.add(G.sph(0.035, 5, 4), grad('#1a1a22'), { at: [s * 0.09, hy + 0.08, hr * 0.88] });
  k.add(G.tor(hr * 0.95, 0.06, 6, 14), grad('#d84a3a', 0.8, 1.1), { at: [0, hy - hr * 0.6, 0], rot: [Math.PI / 2, 0, 0] });
  if (!v) { k.add(G.cyl(0.2, 0.22, 0.28, 10), grad('#2a2a32'), { at: [0, 1.7, 0] }); k.add(G.cyl(0.32, 0.32, 0.03, 12), grad('#2a2a32'), { at: [0, 1.7, 0] }); }
  else k.add(G.cone(0.3, 0.45, 10), grad('#4a7ad8'), { at: [0, hy + hr * 0.6, 0] });
  for (const s of [-1, 1]) k.add(G.tube([[s * 0.3 * S, 1.05 * S, 0], [s * 0.6 * S, 1.3 * S, 0], [s * 0.75 * S, 1.45 * S, 0.1]], 0.03, 0.015, 4), grad('#5a4030'));
  return k.build();
}

// ======================================================================
// 矿洞
// ======================================================================
const GEM = { blue: '#5ab8ff', purple: '#b07aff', green: '#5affa8', gold: '#ffd25a', red: '#ff5a6a' };
function crystal(v, color, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const layouts = [
    () => [[0, 0, 1.2, 0.2, 0], [0.25, 0.1, 0.7, 0.14, 0.5], [-0.2, -0.1, 0.8, 0.15, -0.45], [0.05, -0.28, 0.55, 0.12, 0.3]], // 簇
    () => [[0, 0, 1.8, 0.28, 0.05]],                                                                                      // 独柱
    () => Array.from({ length: 7 }, (_, i) => [Math.cos(i * 0.9) * 0.35, Math.sin(i * 0.9) * 0.35, 0.35 + r() * 0.4, 0.09, (i % 3 - 1) * 0.5]), // 小晶群
    () => [[-0.3, 0, 0.9, 0.18, -0.4], [0.3, 0, 1.0, 0.2, 0.4], [0, 0.2, 1.4, 0.22, 0]],                                    // 对称三叉
    () => [[0, 0, 0.6, 0.35, 0.0]],                                                                                       // 粗晶
  ];
  const base = new THREE.Color(color);
  for (const [x, z, h, rad, lean] of layouts[v % 5]()) {
    const body = new THREE.CylinderGeometry(rad * 0.85, rad, h, 6).translate(0, h / 2, 0);
    const tip = new THREE.CylinderGeometry(0, rad * 0.85, rad * 1.6, 6).translate(0, h + rad * 0.8, 0);
    const g = faceted(mergeTwo(body, tip));
    k.add(g, (geo) => paint(geo, (p, n, out) => out.copy(base).multiplyScalar(0.45 + 0.55 * smooth(0, h + rad, p.y) + 0.2 * Math.max(0, n.x))), { at: [x, -0.05, z], rot: [lean * 0.6, r() * TAU, lean], kind: 'gem' });
  }
  // 底座岩石
  k.add(faceted(lumpy(G.ico(0.45, 0), 0.12, 3, seed)), grad('#4a4458', 0.6, 1, 0.15), { at: [0, 0.05, 0], s: [1.2, 0.45, 1.1] });
  return k.build({ light: { color, i: 1.2, d: 6, y: 0.8 } });
}
function oreRock(v, color, seed) {
  const gem = new THREE.Color(color);
  return rock(v % 4, (geo) => paint(geo, (p, n, out) => {
    out.set('#7a7088').multiplyScalar(0.65 + 0.35 * n.y);
    if (vnoise(p.x * 7 + seed, p.z * 7 + p.y * 7, seed) > 0.78) out.copy(gem).multiplyScalar(1.4);
  }), seed);
}
function stalagmite(v, seed) {
  const k = new Kit(), r = rnd(seed + v), list = [[[0, 0, 1.6, 0.35]], [[0, 0, 1.1, 0.28], [0.35, 0.1, 0.6, 0.18]], [[0, 0, 2.4, 0.42], [-0.35, 0.2, 0.9, 0.2], [0.3, -0.25, 0.7, 0.18]], [[0, 0, 0.7, 0.32]]][v % 4];
  for (const [x, z, h, rad] of list) {
    const g = lumpy(new THREE.ConeGeometry(rad, h, 8, 4).translate(0, h / 2, 0), rad * 0.3, 3, seed + x * 10, 0.3);
    k.add(faceted(g), (geo) => paint(geo, (p, n, out) => out.set('#8a7e90').multiplyScalar((0.65 + 0.4 * smooth(0, h, p.y)) * (Math.floor(p.y * 6) % 2 ? 0.92 : 1.02))), { at: [x, 0, z] });
  }
  return k.build();
}
function mineCart(v) {
  const k = new Kit();
  k.add(...plank(1.1, 0.5, 0.75, '#6a4a32'), { at: [0, 0.55, 0] });
  for (const s of [-1, 1]) k.add(G.box(1.15, 0.06, 0.06), grad('#5a5e68', 0.8, 1.3), { at: [0, 0.82, s * 0.38] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(G.cyl(0.16, 0.16, 0.07, 10), grad('#3a3e48', 0.8, 1.2), { at: [sx * 0.35, 0.18, sz * 0.38 + sz * 0.02], rot: [Math.PI / 2, 0, 0] });
  if (v === 0) for (let i = 0; i < 6; i++) k.add(faceted(G.ico(0.14, 0)), grad(i % 2 ? '#5ab8ff' : '#6a6070'), { at: [(i % 3 - 1) * 0.3, 0.85, (Math.floor(i / 3) - 0.5) * 0.3], kind: i % 2 ? 'gem' : 'solid' });
  // 铁轨
  for (const s of [-1, 1]) k.add(G.box(3, 0.06, 0.06), grad('#7a7e88', 0.8, 1.3), { at: [0, 0.03, s * 0.38] });
  for (let i = 0; i < 6; i++) k.add(...plank(0.16, 0.05, 1.0, '#5a3a26', i), { at: [-1.25 + i * 0.5, 0.01, 0] });
  return k.build();
}
function support(v) {
  const k = new Kit(), W = v ? 2.4 : 1.8, H = v ? 2.2 : 2.6;
  for (const s of [-1, 1]) k.add(...plank(0.22, H, 0.22, '#6a4a32', s), { at: [s * W / 2, H / 2, 0], rot: [0, 0, -s * 0.05] });
  k.add(...plank(W + 0.5, 0.25, 0.26, '#5a3a26'), { at: [0, H, 0] });
  if (v) for (const s of [-1, 1]) k.add(...plank(0.12, 0.7, 0.12, '#6a4a32'), { at: [s * (W / 2 - 0.25), H - 0.3, 0], rot: [0, 0, s * 0.8] });
  return k.build();
}
function torch(v) {
  const k = new Kit();
  if (v === 0) { k.add(...plank(0.08, 1.4, 0.08, DWOOD), { at: [0, 0.7, 0] }); k.add(G.cyl(0.1, 0.06, 0.18, 6), grad('#3a3e48'), { at: [0, 1.4, 0] }); }
  else { k.add(G.cyl(0.25, 0.3, 0.9, 8), grad('#6a6070', 0.7, 1.05), { at: [0, 0, 0], flat: true }); k.add(G.cyl(0.35, 0.22, 0.2, 8), grad('#3a3e48'), { at: [0, 0.9, 0] }); }
  const fy = v === 0 ? 1.55 : 1.15;
  k.add(G.cone(0.12, 0.35, 6), grad('#ff9a3a', 0.9, 1.4), { at: [0, fy, 0], kind: 'glow' });
  k.add(G.cone(0.06, 0.2, 6), grad('#fff0a0'), { at: [0, fy, 0], kind: 'glow' });
  return k.build({ light: { color: '#ffa050', i: 1.6, d: 8, y: fy + 0.2, flicker: true } });
}

// ======================================================================
// 村落：灯笼 / 石灯笼 / 踏脚石
// ======================================================================
function stoneLantern(v, seed) {
  const k = new Kit(), stone = (g) => faceted(lumpy(g, 0.025, 6, seed));
  const S = grad('#b4aea8', 0.7, 1.05, 0.15);
  if (v === 0) { // 日式春日灯笼
    k.add(stone(G.cyl(0.35, 0.42, 0.18, 6)), S);
    k.add(stone(G.cyl(0.12, 0.14, 0.8, 6)), S, { at: [0, 0.18, 0] });
    k.add(stone(G.cyl(0.32, 0.25, 0.15, 6)), S, { at: [0, 0.98, 0] });
    k.add(G.cyl(0.22, 0.22, 0.35, 6), grad('#ffb060'), { at: [0, 1.13, 0], kind: 'glow' });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.add(G.box(0.07, 0.36, 0.07), S, { at: [Math.cos(a) * 0.24, 1.3, Math.sin(a) * 0.24] }); }
    k.add(stone(G.cone(0.5, 0.35, 6)), S, { at: [0, 1.48, 0] });
    k.add(G.sph(0.08, 6, 5), S, { at: [0, 1.88, 0] });
  } else if (v === 1) { // 矮胖雪见灯笼
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; k.add(stone(G.cyl(0.05, 0.08, 0.5, 5)), S, { at: [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2] }); }
    k.add(G.cyl(0.25, 0.22, 0.3, 6), grad('#ffb060'), { at: [0, 0.48, 0], kind: 'glow' });
    k.add(stone(G.cyl(0.05, 0.85, 0.3, 8)), S, { at: [0, 0.78, 0] });
    k.add(G.sph(0.1, 6, 5), S, { at: [0, 1.12, 0] });
  } else { // 方形石灯
    k.add(stone(G.box(0.5, 0.2, 0.5)), S, { at: [0, 0.1, 0] });
    k.add(stone(G.box(0.2, 0.7, 0.2)), S, { at: [0, 0.55, 0] });
    k.add(stone(G.box(0.45, 0.4, 0.45)), S, { at: [0, 1.1, 0] });
    k.add(G.box(0.3, 0.22, 0.47), grad('#ffb060'), { at: [0, 1.1, 0], kind: 'glow' });
    k.add(stone(G.cone(0.45, 0.3, 4)), S, { at: [0, 1.3, 0], rot: [0, Math.PI / 4, 0] });
  }
  return k.build({ light: { color: '#ffb060', i: 0.9, d: 6, y: 1.2 } });
}
function lanternPost(v) {
  const k = new Kit();
  k.add(G.cyl(0.07, 0.09, 2.2, 6), grad('#5a3a28', 0.7, 1));
  if (v === 0) {
    k.add(...plank(0.6, 0.06, 0.08, '#5a3a28'), { at: [0.22, 2.1, 0] });
    k.add(G.cyl(0.01, 0.01, 0.15, 3), grad('#2a1a10'), { at: [0.45, 1.93, 0] });
    k.add(G.sph(0.22, 10, 8).scale(1, 1.15, 1), grad('#ff5a3a', 0.8, 1.2), { at: [0.45, 1.72, 0], kind: 'glow' });
    for (const dy of [0.25, -0.25]) k.add(G.cyl(0.12, 0.12, 0.05, 8), grad('#3a2a20'), { at: [0.45, 1.72 + dy, 0] });
    k.add(G.cyl(0.01, 0.01, 0.25, 3), grad('#ffd04a'), { at: [0.45, 1.25, 0] });
  } else {
    for (const s of [-1, 1]) {
      k.add(...plank(0.5, 0.05, 0.06, '#5a3a28'), { at: [s * 0.2, 2.0, 0] });
      k.add(flatCyl(0.16, 0.32), grad('#ffd070'), { at: [s * 0.42, 1.65, 0], kind: 'glow' });
      k.add(G.cone(0.2, 0.12, 6), grad('#3a2a20'), { at: [s * 0.42, 1.97, 0] });
    }
  }
  return k.build({ light: { color: v ? '#ffc070' : '#ff7a4a', i: 1.0, d: 7, y: 1.7 } });
}
const flatCyl = (r, h) => faceted(G.cyl(r, r, h, 6));
function steppingStones(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [5, 3, 7][v % 3];
  for (let i = 0; i < n; i++) {
    const g = faceted(lumpy(new THREE.CylinderGeometry(0.32, 0.36, 0.14, 9).translate(0, 0.05, 0), 0.06, 4, seed + i, 0.2));
    k.add(g, mossCap('#a8a8a4', '#7aa848', 0.95, 0.4), { at: [(i - n / 2) * 0.75 + (r() - 0.5) * 0.2, 0, Math.sin(i * 1.3) * 0.35], s: [0.8 + r() * 0.4, 1, 0.8 + r() * 0.3], rot: [0, r() * TAU, 0] });
  }
  return k.build();
}

// ======================================================================
// 仙山
// ======================================================================
function karst(v, seed) {
  const k = new Kit(), r = rnd(seed + v), cfg = [[5, 1.1], [7, 1.3], [3.5, 0.9], [8.5, 1.5]][v % 4], [H, R] = cfg;
  const g = new THREE.CylinderGeometry(R * 0.65, R, H, 9, 8).translate(0, H / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), bulge = 1 + 0.18 * Math.sin(y * 1.6 + a * 2 + seed) + (vnoise(a * 2, y * 1.2, seed + v) - 0.5) * 0.5;
    p.setX(i, p.getX(i) * bulge); p.setZ(i, p.getZ(i) * bulge);
  }
  k.add(faceted(g), (geo) => paint(geo, (q, n, out) => {
    const strata = Math.floor(q.y * 2.2 + vnoise(q.x * 2, q.z * 2, 3) * 0.8) % 2 ? 0.9 : 1;
    out.set('#b8b0a0').multiplyScalar((0.62 + 0.4 * smooth(0, H, q.y)) * strata);
    if (n.y > 0.45 + (vnoise(q.x * 3, q.z * 3 + q.y, 5) - 0.5) * 0.4) out.set('#6ab048').multiplyScalar(0.8 + 0.3 * n.y);
  }));
  // 顶上的小松和草
  const tops = 1 + (v % 3);
  for (let i = 0; i < tops; i++) {
    const a = r() * TAU, d = r() * R * 0.35, x = Math.cos(a) * d, z = Math.sin(a) * d;
    k.add(G.cyl(0.05, 0.08, 0.6, 5), grad('#6a4630'), { at: [x, H - 0.1, z] });
    foliage(k, [[0, 0, 0, 0.35], [0.3, -0.05, 0, 0.25]], '#3a8a52', null, seed + i, { at: [x, H + 0.5, z], sy: 0.55, dens: 1.6, leaf: [0.6, 0.6] });
  }
  k.add(G.blobs([[0, 0, 0, R * 0.6]], 2, seed), crownPaint('#6ab048'), { at: [0, H - 0.05, 0], s: [1, 0.25, 1], kind: 'leaf' });
  return k.build();
}
function bonsaiPine(v, seed) {
  // 迎客松：斜伸的干 + 一层层扁平云状叶团
  const k = new Kit(), r = rnd(seed + v);
  const paths = [
    [[0, 0, 0], [0.3, 1.0, 0], [-0.2, 1.8, 0.1], [0.6, 2.5, 0]],
    [[0, 0, 0], [-0.4, 0.8, 0], [0.4, 1.4, 0.2], [1.3, 1.6, 0.1]],
    [[0, 0, 0], [0.1, 0.7, 0], [-0.1, 1.3, 0], [0, 1.9, 0]],
  ][v % 3];
  k.add(G.tube(paths, 0.18, 0.07, 7), grad('#6a4a3a', 0.6, 1.05, 0.15));
  for (let i = 1; i < paths.length; i++) {
    const [x, y, z] = paths[i], a = r() * TAU;
    const ex = x + Math.cos(a) * 0.7, ez = z + Math.sin(a) * 0.4;
    k.add(G.tube([[x, y, z], [ex, y + 0.15, ez]], 0.06, 0.03, 5), grad('#6a4a3a', 0.6, 1));
    for (const [px, pz, rr] of [[ex, ez, 0.55], [x, z, 0.42]]) foliage(k, [[0, 0, 0, rr], [rr * 0.7, -0.02, 0.1, rr * 0.7], [-rr * 0.6, 0, -0.1, rr * 0.6]], '#2f7a4a', '#5aa868', seed + i, { at: [px, y + 0.25, pz], sy: 0.38, cy: 0, dens: 2.2, leaf: [0.7, 0.45], accentAmt: 0.1 });
  }
  return k.build();
}
function lingzhi(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [3, 1, 5][v % 3];
  for (let i = 0; i < n; i++) {
    const h = 0.15 + r() * 0.3, R = 0.14 + r() * 0.1, a = i * 2.3, x = Math.cos(a) * 0.15 * (i ? 1 : 0), z = Math.sin(a) * 0.15 * (i ? 1 : 0);
    k.add(G.tube([[x, 0, z], [x + 0.03, h * 0.6, z], [x + 0.06, h, z + 0.02]], 0.03, 0.025, 5), grad('#6a2a1a'));
    const cap = new THREE.CylinderGeometry(R, R * 0.95, 0.05, 14, 1).scale(1, 1, 0.8);
    k.add(cap, (geo) => paint(geo, (p, nn, out) => { const d = Math.hypot(p.x, p.z / 0.8) / R; out.set('#8a3a1a').lerp(C('#e8a040'), smooth(0.75, 1, d)).multiplyScalar(0.85 + 0.3 * nn.y); if (Math.floor(d * 7) % 2) out.multiplyScalar(0.9); }), { at: [x + 0.06 + R * 0.6, h, z + 0.02], rot: [0, -a, 0.15] });
  }
  return k.build();
}
function spiritHerb(v, seed) {
  const k = new Kit(), r = rnd(seed + v), cols = ['#7affd0', '#ffd25a', '#b07aff', '#ff8ac8'], col = cols[v % 4];
  const leaves = [5, 7, 3, 6][v % 4];
  for (let i = 0; i < leaves; i++) k.add(G.blade(0.08, 0.35 + r() * 0.2, 0.12), grad(v === 3 ? '#4f9a5a' : '#3faa6a', 0.6, 1.2), { at: [0, 0, 0], rot: [0.5 + r() * 0.3, i / leaves * TAU, 0], kind: 'plant' });
  k.add(G.cyl(0.015, 0.02, 0.55, 4), grad('#3f9a5a'), { kind: 'plant' });
  if (v === 0) k.add(G.ico(0.09, 1), grad(col, 0.8, 1.2), { at: [0, 0.62, 0], kind: 'glow', s: [1, 1.3, 1] });
  else if (v === 1) for (let i = 0; i < 5; i++) k.add(G.sph(0.045, 6, 5), grad(col), { at: [Math.cos(i * 1.26) * 0.06, 0.58 + (i % 2) * 0.05, Math.sin(i * 1.26) * 0.06], kind: 'glow' });
  else if (v === 2) for (let p = 0; p < 5; p++) k.add(G.blade(0.05, 0.14, 0.05), grad(col), { at: [0, 0.55, 0], rot: [1.0, p / 5 * TAU, 0], kind: 'glow' });
  else { for (let s = 0; s < 6; s++) k.add(G.sph(0.04, 5, 4), grad(col), { at: [0, 0.4 + s * 0.06, 0], s: 1 - s * 0.1, kind: 'glow' }); }
  return k.build({ light: { color: col, i: 0.5, d: 3, y: 0.6 } });
}
function lotusLamp(v) {
  const k = new Kit();
  for (let ring = 0; ring < 3; ring++) for (let p = 0; p < 8; p++) k.add(G.blade(0.12 - ring * 0.02, 0.32 - ring * 0.06, 0.12), grad(v ? '#ffe0f0' : '#ff9ec7', 0.85, 1.2), { at: [0, 0.05, 0], rot: [1.1 - ring * 0.4, p / 8 * TAU + ring * 0.4, 0] });
  k.add(G.cyl(0.06, 0.07, 0.12, 8), grad('#ffd84a'), { at: [0, 0.06, 0], kind: 'glow' });
  k.add(G.cone(0.05, 0.16, 6), grad('#fff0b0'), { at: [0, 0.2, 0], kind: 'glow' });
  if (v === 1) k.add(new THREE.CircleGeometry(0.45, 14).rotateX(-Math.PI / 2), grad('#4fa040'), { at: [0, 0.01, 0] });
  return k.build({ light: { color: '#ffc070', i: 0.8, d: 4, y: 0.3, float: true } });
}
function incense(v) {
  const k = new Kit(), bronze = grad('#8a6a3a', 0.6, 1.2, 0.15);
  if (v === 0) {
    k.add(G.lathe([[0, 0.25], [0.45, 0.28], [0.5, 0.45], [0.45, 0.7], [0.5, 0.75]], 14), bronze);
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; k.add(G.cyl(0.05, 0.07, 0.3, 6), bronze, { at: [Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32] }); }
    for (const s of [-1, 1]) k.add(G.tor(0.1, 0.03, 4, 10, Math.PI), bronze, { at: [s * 0.45, 0.75, 0], rot: [0, s > 0 ? 0 : Math.PI, Math.PI / 2] });
  } else {
    k.add(G.box(0.6, 0.6, 0.6), bronze, { at: [0, 0.5, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(G.cyl(0.05, 0.05, 0.25, 6), bronze, { at: [sx * 0.24, 0, sz * 0.24] });
  }
  for (let i = 0; i < 3; i++) {
    k.add(G.cyl(0.01, 0.01, 0.45, 3), grad('#c84a2a'), { at: [(i - 1) * 0.08, v ? 0.8 : 0.7, 0] });
    k.add(G.sph(0.02, 4, 3), grad('#ff8a3a'), { at: [(i - 1) * 0.08, (v ? 0.8 : 0.7) + 0.45, 0], kind: 'glow' });
  }
  return k.build({ light: { color: '#ff9a50', i: 0.4, d: 3, y: 1.2, smoke: true } });
}
function stele(v, seed) {
  const k = new Kit(), S = (g) => faceted(lumpy(g, 0.03, 5, seed + v));
  if (v === 0) {
    k.add(S(G.box(0.8, 1.6, 0.25)), grad('#9aa0a0', 0.7, 1.05), { at: [0, 1.0, 0] });
    k.add(S(G.box(1.1, 0.25, 0.5)), grad('#8a8e8e', 0.7, 1), { at: [0, 0.12, 0] });
    k.add(G.box(0.12, 1.0, 0.02), grad('#c84a2a'), { at: [0, 1.0, 0.13] });
  } else if (v === 1) { // 龟趺碑
    k.add(G.sph(0.55, 10, 6).scale(1.2, 0.5, 1.5), grad('#7a8478', 0.7, 1.05), { at: [0, 0.2, 0] });
    k.add(G.sph(0.18, 8, 6), grad('#7a8478'), { at: [0, 0.25, 0.85] });
    k.add(S(G.box(0.7, 1.4, 0.2)), grad('#9aa0a0', 0.7, 1.05), { at: [0, 1.1, 0] });
    k.add(S(G.box(0.85, 0.3, 0.3)), grad('#8a8e8e'), { at: [0, 1.9, 0] });
  } else { // 断碑 + 苔
    k.add(S(G.box(0.7, 0.9, 0.22)), mossCap('#9aa0a0', '#6ab048', 0.5), { at: [0, 0.45, 0], rot: [0.08, 0, 0.12] });
    k.add(S(G.box(0.6, 0.5, 0.2)), mossCap('#9aa0a0', '#6ab048', 0.4), { at: [0.6, 0.1, 0.3], rot: [Math.PI / 2 - 0.2, 0.6, 0] });
  }
  return k.build();
}
function pavilion(v) {
  const k = new Kit(), R = 1.6, red = grad('#c8442e', 0.7, 1.05);
  k.add(faceted(G.cyl(R + 0.3, R + 0.4, 0.3, 6)), grad('#b4aea8', 0.7, 1.05, 0.12));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.add(G.cyl(0.1, 0.11, 2.2, 8), red, { at: [Math.cos(a) * R, 0.3, Math.sin(a) * R] }); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + TAU / 12; k.add(G.box(R * 1.0, 0.18, 0.12), red, { at: [Math.cos(a) * R * 0.87, 2.4, Math.sin(a) * R * 0.87], rot: [0, -a + Math.PI / 2, 0] }); }
  // 六角攒尖顶：向上凹的曲面 + 翘角
  // 轮廓从檐口往顶点走，面才朝外（反过来会被背面剔除，从上面看不到屋顶）
  const roof = new THREE.LatheGeometry([[2.35, 0.08], [2.2, 0.0], [1.6, 0.25], [0.9, 0.7], [0.3, 1.25], [0, 1.5]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  k.add(faceted(roof), (geo) => paint(geo, (p, n, out) => out.set(v ? '#3a7a6a' : '#5a6070').multiplyScalar((0.75 + 0.35 * n.y) * (Math.floor(Math.atan2(p.z, p.x) * 8) % 2 ? 0.92 : 1))), { at: [0, 2.45, 0] });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.add(G.cone(0.08, 0.6, 5), grad('#3a3e48'), { at: [Math.cos(a) * 2.25, 2.5, Math.sin(a) * 2.25], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }); }
  k.add(G.sph(0.18, 8, 6), grad('#e8c25a', 0.8, 1.3), { at: [0, 4.0, 0] });
  k.add(G.cone(0.08, 0.4, 6), grad('#e8c25a'), { at: [0, 4.1, 0] });
  k.add(G.cyl(0.5, 0.45, 0.6, 10), grad('#9aa0a0'), { at: [0, 0.3, 0] });
  return k.build();
}
function cloud(v, seed) {
  const k = new Kit(), parts = [[[0, 0, 0, 0.7], [0.8, -0.1, 0, 0.55], [-0.75, -0.1, 0.1, 0.5], [0.3, 0.3, 0, 0.45]], [[0, 0, 0, 0.5], [0.6, 0, 0, 0.4]], [[0, 0, 0, 0.6], [0.7, 0.05, 0.2, 0.5], [1.3, -0.05, 0, 0.4], [-0.6, 0, -0.1, 0.45], [-1.1, -0.1, 0, 0.3]]][v % 3];
  k.add(G.blobs(parts, 2, seed, 0.12), (geo) => paint(geo, (p, n, out) => out.set('#e4ecf6').lerp(C('#b0c4e4'), clamp(-n.y * 0.8 + 0.2, 0, 1) * 0.7)), { s: [1, 0.55, 0.7] });
  return k.build({ outline: false });
}
function jade(v, seed) {
  const cols = ['#5ad8a0', '#a0e8d0', '#7ac0ff'];
  return rock(v % 5 === 4 ? 0 : v, (geo) => paint(geo, (p, n, out) => out.set(cols[v % 3]).multiplyScalar(0.6 + 0.5 * n.y + (vnoise(p.x * 5, p.z * 5 + p.y * 5, 2) - 0.5) * 0.3)), seed, { light: { color: cols[v % 3], i: 0.3, d: 3, y: 0.4 } });
}

// ======================================================================
// 赤岩荒原
// ======================================================================
function lavaRock(v, seed) {
  return rock(v, (geo) => paint(geo, (p, n, out) => {
    out.set('#3a2a2e').multiplyScalar(0.7 + 0.5 * n.y);
    const c = Math.abs(vnoise(p.x * 4 + seed, p.z * 4 + p.y * 4, seed) - 0.5);
    if (c < 0.035 && n.y < 0.7) out.set('#ff6a2a').multiplyScalar(2.2);
    else if (n.y > 0.75) out.lerp(C('#8a4a3a'), 0.4);
  }), seed);
}
function redRock(v, seed) {
  return rock(v, (geo) => paint(geo, (p, n, out) => {
    const strata = Math.floor(p.y * 7 + vnoise(p.x * 2, p.z * 2, 4)) % 3;
    out.set(['#c8603a', '#d8784a', '#a84a2e'][strata]).multiplyScalar(0.7 + 0.4 * n.y);
  }), seed);
}
function obsidian(v, seed) {
  const k = new Kit(), r = rnd(seed + v), n = [4, 2, 6][v % 3];
  for (let i = 0; i < n; i++) {
    const h = 0.6 + r() * 1.2, a = r() * TAU, d = i ? r() * 0.5 : 0;
    k.add(faceted(new THREE.ConeGeometry(0.22, h, 4).translate(0, h / 2, 0)), (geo) => paint(geo, (p, nn, out) => out.set('#2a2238').multiplyScalar(0.6 + 1.2 * Math.max(0, nn.x * 0.5 + nn.z * 0.5)).lerp(C('#8a4aff'), smooth(h * 0.7, h, p.y) * 0.5)), { at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [(r() - 0.5) * 0.6, r() * TAU, (r() - 0.5) * 0.6] });
  }
  return k.build();
}
function bones(v) {
  const k = new Kit(), B = grad('#f0e8d0', 0.75, 1.05);
  if (v === 0) { // 肋骨
    k.add(G.tube([[-1.2, 0.15, 0], [0, 0.22, 0], [1.2, 0.12, 0]], 0.08, 0.06, 6), B);
    for (let i = 0; i < 6; i++) { const x = -0.9 + i * 0.35; for (const s of [-1, 1]) k.add(G.tube([[x, 0.2, 0], [x, 0.7 - i * 0.04, s * 0.45], [x + 0.05, 0.35, s * 0.75], [x + 0.1, 0.05, s * 0.8]], 0.05, 0.03, 5), B); }
  } else { // 头骨
    k.add(G.sph(0.35, 12, 9).scale(1, 0.85, 1.2), B, { at: [0, 0.3, 0] });
    k.add(G.box(0.4, 0.2, 0.5), B, { at: [0, 0.15, 0.35] });
    for (const s of [-1, 1]) { k.add(G.sph(0.09, 6, 5), grad('#2a1a1a'), { at: [s * 0.14, 0.35, 0.36] }); k.add(G.tube([[s * 0.3, 0.45, -0.05], [s * 0.6, 0.65, 0], [s * 0.7, 0.95, 0.15]], 0.07, 0.02, 5), B); }
  }
  return k.build();
}
function fireFlower(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  for (let i = 0; i < 3 + v; i++) {
    const a = r() * TAU, d = i ? r() * 0.3 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.4 + r() * 0.3;
    k.add(G.cyl(0.015, 0.02, h, 4), grad('#5a3a2a'), { at: [x, 0, z], kind: 'plant' });
    for (let p = 0; p < 5; p++) k.add(G.blade(0.05, 0.16, 0.06), grad(['#ff5a2a', '#ffaa2a', '#ff3a5a'][v % 3], 0.9, 1.3), { at: [x, h, z], rot: [0.8, p / 5 * TAU, 0], kind: 'glow' });
  }
  return k.build({ light: { color: '#ff7a3a', i: 0.4, d: 3, y: 0.5 } });
}
function vent(v, seed) {
  const k = new Kit();
  const g = faceted(lumpy(new THREE.CylinderGeometry(0.25, 0.7, 0.7, 9, 2, true).translate(0, 0.35, 0), 0.1, 3, seed + v));
  k.add(g, (geo) => paint(geo, (p, n, out) => out.set(v ? '#e8d85a' : '#5a4a48').lerp(C('#3a2a2e'), smooth(0.6, 0.0, p.y) * (v ? 0.7 : 0.3)).multiplyScalar(0.7 + 0.3 * n.y)));
  k.add(new THREE.CircleGeometry(0.25, 10).rotateX(-Math.PI / 2), grad(v ? '#ffe86a' : '#ff6a2a'), { at: [0, 0.6, 0], kind: 'glow' });
  return k.build({ light: { color: v ? '#ffe86a' : '#ff6a2a', i: 0.9, d: 5, y: 0.9, smoke: true } });
}

// ======================================================================
// 矿脉（world_map.json 每个扇区的副矿 + 通用铁矿）
// ======================================================================
export const VEINS = [
  { name: '铁', rock: '#6a6058', gem: '#b8b0a8', glow: false },
  { name: '寒玉', rock: '#7a8494', gem: '#bff4ff', glow: true },
  { name: '青铜', rock: '#6a6a50', gem: '#5aa888', glow: false },
  { name: '毒晶', rock: '#4a4a3a', gem: '#9aff4a', glow: true },
  { name: '火铜', rock: '#5a3a32', gem: '#ff7a3a', glow: true },
  { name: '沙金', rock: '#a8885a', gem: '#ffd84a', glow: false },
  { name: '阴魂石', rock: '#3a3442', gem: '#a87aff', glow: true },
  { name: '仙晶', rock: '#8a8698', gem: '#fff4c8', glow: true },
];
function vein(v, seed) {
  const V = VEINS[v], gem = new THREE.Color(V.gem), r = rnd(seed + v);
  const g = rock(v % 4, (geo) => paint(geo, (p, n, out) => {
    out.set(V.rock).multiplyScalar(0.62 + 0.4 * n.y);
    if (vnoise(p.x * 6 + seed, p.z * 6 + p.y * 6, seed + v) > 0.74) out.copy(gem).multiplyScalar(V.glow ? 1.5 : 1.15);
  }), seed);
  if (!V.glow) return g;
  // 发光矿再插几根小晶
  const k = new Kit();
  for (let i = 0; i < 3; i++) {
    const h = 0.25 + r() * 0.25, a = r() * TAU;
    k.add(faceted(mergeTwo(new THREE.CylinderGeometry(0.06, 0.07, h, 5).translate(0, h / 2, 0), new THREE.CylinderGeometry(0, 0.06, 0.1, 5).translate(0, h + 0.05, 0))), grad(V.gem, 0.6, 1.1), { at: [Math.cos(a) * 0.35, 0.35, Math.sin(a) * 0.35], rot: [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], kind: 'gem' });
  }
  const extra = k.build({ light: { color: V.gem, i: 0.5, d: 4, y: 0.6 } });
  g.add(...extra.children); g.userData.light = extra.userData.light;
  return g;
}

// ======================================================================
// 沼泽
// ======================================================================
function swampTree(v, seed) {
  const k = new Kit(), r = rnd(seed + v), H = [3.2, 2.4, 3.8][v % 3];
  // 拱起的气根
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + r() * 0.4, d = 0.7 + r() * 0.5;
    k.add(G.tube([[Math.cos(a) * d, 0, Math.sin(a) * d], [Math.cos(a) * d * 0.6, 0.55 + r() * 0.2, Math.sin(a) * d * 0.6], [0, 0.9, 0]], 0.09, 0.14, 5), grad('#4a4234', 0.6, 0.95, 0.15));
  }
  const bend = (r() - 0.5) * 0.8;
  k.add(G.tube([[0, 0.8, 0], [bend * 0.5, H * 0.55, 0.1], [bend, H, 0]], 0.2, 0.1, 7), grad('#4a4234', 0.6, 1, 0.15));
  const crown = [[bend, H + 0.2, 0, 1.0], [bend + 0.9, H - 0.05, 0.2, 0.75], [bend - 0.85, H, -0.1, 0.8], [bend, H, 0.8, 0.7]];
  // 压扁树冠要绕树冠中心缩放，不然整团会掉到树干中间
  foliage(k, crown, '#5a6a34', '#7a8a40', seed + v, { sy: 0.55, accentAmt: 0.08 });
  // 垂挂的苔藓
  for (let i = 0; i < 16; i++) {
    const c = crown[i % crown.length], a = r() * TAU, d = c[3] * (0.5 + r() * 0.5), L = 0.5 + r() * 0.9;
    k.add(G.cone(0.05, L, 4).rotateX(Math.PI).translate(0, L, 0), grad('#8a9a5a', 0.7, 1.1), { at: [c[0] + Math.cos(a) * d, H + (c[1] - H) * 0.55 - c[3] * 0.3 - L, c[2] + Math.sin(a) * d], kind: 'leaf' }); // 与树冠同一摇摆，不会脱节
  }
  return k.build();
}
function bogPlant(v, seed) {
  // 猪笼草 / 水芋 / 臭菘
  const k = new Kit(), r = rnd(seed + v);
  if (v === 0) {
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + r(), x = Math.cos(a) * 0.2, z = Math.sin(a) * 0.2, h = 0.3 + r() * 0.2;
      k.add(G.lathe([[0, 0], [0.06, 0.02], [0.09, 0.15], [0.07, 0.28], [0.08, 0.3]], 7), (g) => paint(g, (p, n, out) => out.set('#8ab040').lerp(C('#b0403a'), smooth(0.1, 0.3, p.y)).multiplyScalar(0.8 + 0.3 * n.y)), { at: [x, h * 0.2, z], rot: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4] });
      k.add(G.blade(0.08, 0.35, 0.1), grad('#5a8a34'), { at: [x * 0.5, 0, z * 0.5], rot: [0.6, a, 0], kind: 'plant' });
    }
  } else if (v === 1) {
    for (let i = 0; i < 6; i++) k.add(G.blade(0.22, 0.7 + r() * 0.3, 0.25), grad('#3a7a3a', 0.6, 1.15), { rot: [0.5 + r() * 0.3, i / 6 * TAU, 0], kind: 'plant' });
  } else {
    for (let i = 0; i < 5; i++) k.add(G.blade(0.14, 0.45, 0.2), grad('#4a8a3a', 0.6, 1.1), { rot: [0.7, i / 5 * TAU, 0], kind: 'plant' });
    k.add(G.lathe([[0, 0], [0.08, 0.05], [0.1, 0.2], [0.04, 0.38], [0, 0.42]], 7), grad('#c8a8e0', 0.7, 1.1), { at: [0, 0.05, 0] });
  }
  return k.build();
}

// ======================================================================
// 沙漠遗迹
// ======================================================================
function cactus(v, seed) {
  const k = new Kit(), r = rnd(seed + v), skin = (g) => paint(g, (p, n, out) => { const a = Math.atan2(p.z, p.x); out.set('#5a9a4a').multiplyScalar((0.72 + 0.3 * Math.max(0, n.y + 0.4)) * (Math.floor(a / TAU * 16 + 8) % 2 ? 0.88 : 1.04)); });
  const limb = (pts, rad) => { k.add(G.tube(pts, rad, rad * 0.92, 10), skin); const e = pts[pts.length - 1]; k.add(G.sph(rad * 0.92, 10, 6), skin, { at: e, s: [1, 0.8, 1] }); };
  if (v === 0) { // 树形仙人掌
    limb([[0, 0, 0], [0, 1.4, 0], [0, 2.6, 0]], 0.22);
    limb([[0, 1.0, 0], [0.45, 1.05, 0], [0.55, 1.35, 0], [0.55, 1.9, 0]], 0.13);
    limb([[0, 1.4, 0], [-0.4, 1.45, 0.05], [-0.48, 1.7, 0.05], [-0.48, 2.1, 0.05]], 0.12);
  } else if (v === 1) { // 圆桶
    const g = G.sph(0.42, 16, 10).scale(1, 1.15, 1); k.add(g, skin, { at: [0, 0.42, 0] });
    for (let i = 0; i < 6; i++) k.add(G.sph(0.06, 6, 4), grad('#ff6a8a'), { at: [Math.cos(i) * 0.14, 0.92, Math.sin(i) * 0.14] });
  } else if (v === 2) { // 仙人掌掌片
    const pads = [[0, 0.3, 0, 0], [0.25, 0.75, 0, 0.5], [-0.22, 0.8, 0.05, -0.4], [0.05, 1.15, 0, 0.1]];
    for (const [x, y, z, rz] of pads) k.add(G.sph(0.28, 10, 8).scale(1, 1.25, 0.32), grad('#6aa84a', 0.75, 1.1, 0.12), { at: [x, y, z], rot: [0, r() * 0.6, rz] });
    k.add(G.sph(0.05, 6, 4), grad('#ff5a5a'), { at: [0.05, 1.5, 0] });
  } else { // 一丛小柱
    for (let i = 0; i < 5; i++) { const a = i * 1.3, d = i ? 0.3 : 0, h = 0.5 + r() * 0.7; limb([[Math.cos(a) * d, 0, Math.sin(a) * d], [Math.cos(a) * d, h, Math.sin(a) * d]], 0.1 + r() * 0.04); }
  }
  return k.build();
}
const SANDSTONE = (g) => paint(g, (p, n, out) => { out.set('#d8b888').multiplyScalar((0.7 + 0.35 * Math.max(0, n.y * 0.5 + 0.5)) * (0.9 + (vnoise(p.x * 3, p.y * 3 + p.z * 3, 2) - 0.5) * 0.25)); });
function ruinPillar(v, seed) {
  const k = new Kit(), r = rnd(seed + v), S = (g) => faceted(lumpy(g, 0.04, 4, seed + v));
  const col = (x, z, H, broken) => {
    k.add(S(G.box(0.8, 0.25, 0.8)), SANDSTONE, { at: [x, 0.12, z] });
    const g = new THREE.CylinderGeometry(0.28, 0.32, H, 12, 3);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 - 0.07 * (Math.cos(a * 12) * 0.5 + 0.5); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); if (broken && p.getY(i) > H / 2 - 0.01) p.setY(i, p.getY(i) - (Math.sin(a * 3 + seed) * 0.5 + 0.5) * 0.4); }
    k.add(faceted(g.translate(0, H / 2 + 0.25, 0)), SANDSTONE, { at: [x, 0, z] });
    if (!broken) { k.add(S(G.box(0.75, 0.22, 0.75)), SANDSTONE, { at: [x, H + 0.36, z] }); }
  };
  if (v === 0) col(0, 0, 3.2, false);
  else if (v === 1) { col(0, 0, 1.6, true); for (let i = 0; i < 3; i++) k.add(S(G.dodec(0.2)), SANDSTONE, { at: [0.5 + r() * 0.5, 0.15, (r() - 0.5) * 0.8] }); }
  else if (v === 2) { // 倒地的柱子（分段）
    for (let i = 0; i < 3; i++) k.add(faceted(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12).rotateZ(Math.PI / 2)), SANDSTONE, { at: [i * 0.95 - 0.9, 0.3, (i - 1) * 0.12], rot: [0, (r() - 0.5) * 0.3, 0] });
  } else { col(-1, 0, 2.8, false); col(1, 0, 2.8, false); k.add(S(G.box(2.9, 0.4, 0.8)), SANDSTONE, { at: [0, 3.25, 0] }); }
  return k.build();
}
function ruinWall(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const brick = (x, y, z, w, h, d) => k.add(faceted(lumpy(G.box(w, h, d), 0.03, 5, seed + x * 7 + y * 3)), SANDSTONE, { at: [x, y, z] });
  if (v === 0) { // 拱门
    for (let y = 0; y < 5; y++) for (const s of [-1, 1]) brick(s * 1.0, 0.25 + y * 0.5, 0, 0.7, 0.48, 0.6);
    for (let i = 0; i <= 6; i++) { const a = Math.PI - i / 6 * Math.PI; brick(Math.cos(a) * 0.95, 2.5 + Math.sin(a) * 0.75, 0, 0.42, 0.42, 0.6); }
  } else if (v === 1) { // 残墙
    for (let x = 0; x < 6; x++) { const hgt = Math.max(1, Math.round(4 - Math.abs(x - 2) * 0.9 + r())); for (let y = 0; y < hgt; y++) brick(-1.5 + x * 0.6 + (y % 2) * 0.15, 0.22 + y * 0.44, 0, 0.58, 0.42, 0.5); }
    for (let i = 0; i < 4; i++) brick(-1 + r() * 2.5, 0.12, 0.6 + r() * 0.4, 0.4, 0.22, 0.3);
  } else { // 台阶祭坛
    for (let i = 0; i < 3; i++) brick(0, 0.15 + i * 0.3, -i * 0.35, 2.4 - i * 0.5, 0.3, 1.6 - i * 0.35);
    k.add(G.cyl(0.25, 0.3, 0.35, 8), grad('#8a6a3a', 0.7, 1.2), { at: [0, 0.9, -0.7] });
  }
  return k.build();
}
function statueHead(v, seed) {
  const k = new Kit(), S = grad('#c8a878', 0.65, 1.05, 0.15);
  k.add(lumpy(G.sph(0.8, 14, 10).scale(0.85, 1.05, 0.9), 0.05, 3, seed), S, { at: [0, 0.55, 0], rot: [0.15, 0.4, v ? 0.5 : 0.15] });
  k.add(G.box(0.18, 0.4, 0.25), S, { at: [0.15, 0.6, 0.75], rot: [0, 0.4, 0.15] });
  for (const s of [-1, 1]) k.add(G.box(0.28, 0.06, 0.06), grad('#6a5038'), { at: [s * 0.25 + 0.1, 0.9, 0.72], rot: [0, 0.4, 0.15] });
  if (!v) k.add(G.cone(0.75, 0.9, 8), S, { at: [0, 1.35, 0], rot: [0.15, 0.4, 0.15] }); // 冠
  return k.build();
}

// ======================================================================
// 古战场
// ======================================================================
const STEEL = grad('#9aa0a8', 0.6, 1.25, 0.15), RUST = (g) => paint(g, (p, n, out) => out.set('#8a8e94').lerp(C('#8a4a2a'), smooth(0.55, 0.8, vnoise(p.x * 9, p.y * 9 + p.z * 9, 4))).multiplyScalar(0.7 + 0.4 * Math.abs(n.x)));
function brokenSword(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const sword = (x, z, tilt, len) => {
    const at = (y) => [x + Math.sin(tilt) * y, y, z];
    k.add(G.box(0.12, len, 0.025), RUST, { at: at(len / 2 - 0.2), rot: [0, 0, -tilt] });
    k.add(G.box(0.4, 0.06, 0.08), grad('#7a6a3a', 0.7, 1.2), { at: at(len - 0.18), rot: [0, 0, -tilt] });
    k.add(G.cyl(0.03, 0.03, 0.25, 5), grad('#4a3020'), { at: at(len - 0.15), rot: [0, 0, -tilt] });
    k.add(G.sph(0.05, 5, 4), grad('#9a8040'), { at: at(len + 0.12) });
  };
  if (v === 0) sword(0, 0, 0.08, 1.3);
  else if (v === 1) sword(0, 0, 0.45, 1.1);
  else if (v === 2) { for (let i = 0; i < 5; i++) sword((r() - 0.5) * 0.9, (r() - 0.5) * 0.9, (r() - 0.5) * 0.7, 0.9 + r() * 0.4); k.add(G.sph(0.5, 8, 6).scale(1.2, 0.25, 1.2), grad('#5a4a3a')); }
  else { // 长戟
    k.add(G.cyl(0.035, 0.04, 2.4, 6), grad('#5a4030', 0.7, 1), { at: [0, -0.2, 0], rot: [0.25, 0, 0.1] });
    k.add(G.cone(0.08, 0.4, 4), RUST, { at: [0.22, 2.0, 0.55], rot: [0.25, 0, 0.1] });
    k.add(G.box(0.4, 0.2, 0.03), RUST, { at: [0.3, 1.85, 0.5], rot: [0.25, 0, 0.1] });
  }
  return k.build();
}
function banner(v, seed) {
  const k = new Kit(), r = rnd(seed + v), cols = ['#a83a2a', '#3a4a7a', '#4a4a3a'], H = 2.6;
  k.add(G.cyl(0.04, 0.05, H, 6), grad('#4a3020', 0.6, 1), { rot: [0, 0, (v - 1) * 0.12] });
  k.add(G.cyl(0.025, 0.025, 1.0, 5), grad('#4a3020'), { at: [0.5, H - 0.05, 0], rot: [0, 0, Math.PI / 2] });
  // 破旗：带锯齿下摆和破洞的布
  const W = 0.9, L = 1.3, nx = 6, ny = 8, pos = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, t = j / ny, rag = j === ny ? (r() - 0.3) * 0.25 : 0;
    pos.push(0.05 + u * W, -t * L - rag, Math.sin(u * 3 + t * 2) * 0.06);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (j > 3 && r() < 0.12) continue; // 破洞
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // 背面：同一片布反向绕序（实心材质是单面的）
  const back = new THREE.BufferGeometry(); back.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const ridx = []; for (let i = 0; i < idx.length; i += 3) ridx.push(idx[i], idx[i + 2], idx[i + 1]);
  back.setIndex(ridx); back.computeVertexNormals();
  for (const gg of [g, back]) k.add(gg, (geo) => paint(geo, (p, n, out) => { out.set(cols[v % 3]).multiplyScalar(0.7 + 0.3 * (1 + p.y / L)); if (Math.abs(p.x - 0.5) < 0.15 && p.y < -0.35 && p.y > -0.75) out.set('#e8d8a0'); }), { at: [0, H - 0.1, 0] });
  return k.build();
}
function shieldProp(v, seed) {
  const k = new Kit();
  if (v === 0) { k.add(G.cyl(0.42, 0.42, 0.06, 14), (g) => paint(g, (p, n, out) => out.set(Math.hypot(p.x, p.z) > 0.36 ? '#8a8e94' : '#7a3a2a').multiplyScalar(0.7 + 0.3 * n.y)), { at: [0, 0.32, 0], rot: [1.2, 0, 0.2] }); k.add(G.sph(0.08, 8, 6), STEEL, { at: [0, 0.35, 0.05] }); }
  else if (v === 1) { k.add(G.box(0.6, 0.9, 0.06), (g) => paint(g, (p, n, out) => out.set('#3a4a6a').lerp(C('#c8b060'), Math.abs(p.x) < 0.05 || Math.abs(p.y) < 0.05 ? 1 : 0).multiplyScalar(0.7 + 0.3 * n.z)), { at: [0, 0.4, 0], rot: [-0.3, 0.3, 0.1] }); }
  else { // 头盔
    k.add(new THREE.SphereGeometry(0.28, 12, 8, 0, TAU, 0, Math.PI * 0.55), RUST, { at: [0, 0.1, 0], rot: [0.6, 0, 0.3] });
    k.add(G.cone(0.04, 0.3, 4), grad('#a83a2a'), { at: [0, 0.35, -0.1], rot: [0.6, 0, 0.3] });
  }
  return k.build();
}
function grave(v, seed) {
  const k = new Kit();
  const mound = G.sph(0.8, 12, 6).scale(1, 0.32, 1.4), p = mound.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
  k.add(mound, mossCap('#6a5a48', '#6a7a4a', 0.7, 0.6));
  if (v === 0) { k.add(G.box(0.08, 0.9, 0.06), grad('#6a5038'), { at: [0, 0.45, -1.0] }); k.add(G.box(0.5, 0.08, 0.06), grad('#6a5038'), { at: [0, 0.68, -1.0] }); }
  else if (v === 1) k.add(faceted(lumpy(G.box(0.5, 0.8, 0.14), 0.03, 5, seed)), grad('#8a8a88', 0.7, 1.05), { at: [0, 0.4, -1.05], rot: [0.08, 0, 0.06] });
  else { k.add(G.box(0.1, 1.0, 0.025), RUST, { at: [0, 0.6, -1.0], rot: [0, 0, 0.1] }); k.add(G.box(0.34, 0.06, 0.07), grad('#7a6a3a'), { at: [0.05, 1.05, -1.0], rot: [0, 0, 0.1] }); }
  return k.build();
}
function brokenCart(v, seed) {
  const k = new Kit();
  k.add(...plank(1.6, 0.1, 1.0, '#6a4a32'), { at: [0, 0.45, 0], rot: [0, 0, v ? 0.35 : 0.1] });
  for (const s of [-1, 1]) k.add(...plank(1.6, 0.35, 0.06, '#5a3a26'), { at: [0, 0.65, s * 0.5], rot: [0, 0, v ? 0.35 : 0.1] });
  k.add(G.tor(0.38, 0.05, 5, 12), grad('#5a3a26'), { at: [-0.3, 0.38, 0.6] });
  for (let i = 0; i < 6; i++) k.add(G.cyl(0.02, 0.02, 0.72, 3), grad('#5a3a26'), { at: [-0.3, 0.38, 0.6], rot: [0, 0, i / 6 * Math.PI], s: [1, 1, 1] });
  k.add(G.tor(0.38, 0.05, 5, 12), grad('#5a3a26'), { at: [0.9, 0.06, -0.3], rot: [Math.PI / 2, 0, 0.1] });
  k.add(G.cyl(0.04, 0.04, 1.8, 5), grad('#5a3a26'), { at: [-0.9, 0.05, 0], rot: [0, 0.3, Math.PI / 2 - 0.15] });
  return k.build();
}

// ======================================================================
// 百花谷
// ======================================================================
function wisteria(v, seed) {
  const k = new Kit(), r = rnd(seed + v), col = v ? '#f0e8ff' : '#b08af0';
  k.add(G.tube([[0, 0, 0], [0.3, 1.2, 0], [-0.1, 2.2, 0.1], [0.2, 2.8, 0]], 0.18, 0.09, 7), grad('#6a5040', 0.6, 1.05, 0.15));
  const crown = [[0.2, 3.1, 0, 1.1], [1.0, 2.9, 0.2, 0.8], [-0.7, 2.95, -0.2, 0.85], [0.2, 3.0, 0.9, 0.75]];
  foliage(k, crown, '#5aa040', '#7ac050', seed + v, { sy: 0.6 });
  for (let i = 0; i < 26; i++) {
    const c = crown[i % crown.length], a = r() * TAU, d = c[3] * (0.3 + r() * 0.7), L = 0.6 + r() * 0.8;
    const x = c[0] + Math.cos(a) * d, z = c[2] + Math.sin(a) * d, y = 3 + (c[1] - 3) * 0.6 - c[3] * 0.3;
    for (let s = 0; s < 5; s++) k.add(G.sph(0.09 * (1 - s * 0.14), 5, 4), grad(col, 0.8, 1.15), { at: [x, y - s * L / 5, z], kind: 'bloom' });
  }
  return k.build();
}
function flowerBed(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const palettes = [['#ff9ec7', '#ffffff', '#ffd84a'], ['#a78bf0', '#7ab8ff', '#ffffff'], ['#ff6a5a', '#ffaa33', '#ffe36b'], ['#ffffff', '#f4e0ff', '#ffd0e8']];
  const pal = palettes[v % 4];
  foliage(k, [[0, 0.12, 0, 0.6], [0.5, 0.1, 0.2, 0.45], [-0.45, 0.1, -0.1, 0.45]], '#4f9a3a', null, seed + v, { sy: 0.45, cy: 0, dens: 1.4, leaf: [0.8, 1] });
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.85, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
    const y = 0.22 + (1 - d) * 0.12 + r() * 0.08;
    k.add(G.sph(0.06 + r() * 0.03, 6, 4), grad(pal[i % 3], 0.85, 1.2), { at: [x, y, z], s: [1, 0.6, 1], kind: 'plant' });
  }
  return k.build();
}
function herbRack(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.3, 0.3]) k.add(...plank(0.08, 1.4, 0.08, DWOOD), { at: [sx, 0.7, sz] });
  const shelves = v ? [0.5, 1.0] : [0.7];
  for (const y of shelves) {
    k.add(...plank(1.9, 0.05, 0.7, WOOD), { at: [0, y, 0] });
    for (let i = 0; i < 3; i++) {
      const x = -0.6 + i * 0.6;
      k.add(G.lathe([[0, 0], [0.22, 0.01], [0.26, 0.08], [0.27, 0.1]], 12), grad('#c8a868', 0.75, 1.1), { at: [x, y + 0.03, 0] });
      for (let j = 0; j < 6; j++) k.add(G.sph(0.06, 5, 3), grad(['#7ab84a', '#c88a4a', '#e85a8a', '#a8c84a'][(i + j) % 4], 0.8, 1.1), { at: [x + (r() - 0.5) * 0.3, y + 0.1, (r() - 0.5) * 0.3], s: [1.2, 0.5, 1] });
    }
  }
  if (!v) { k.add(...plank(1.9, 0.04, 0.04, DWOOD), { at: [0, 1.35, 0] }); for (let i = 0; i < 6; i++) k.add(G.cone(0.08, 0.35, 5).rotateX(Math.PI), grad('#8aa850', 0.7, 1.1), { at: [-0.75 + i * 0.3, 1.0, 0], kind: 'plant' }); }
  return k.build();
}

// ======================================================================
// 天劫峰
// ======================================================================
function floatRock(v, seed) {
  const k = new Kit(), r = rnd(seed + v), R0 = [1.2, 0.8, 1.6, 0.6][v % 4];
  const top = lumpy(new THREE.CylinderGeometry(R0, R0 * 0.85, 0.35, 9, 1).translate(0, 0, 0), 0.12, 2, seed + v);
  k.add(faceted(top), mossCap('#5a5468', '#4a8a5a', 0.6), {});
  const bot = lumpy(new THREE.ConeGeometry(R0 * 0.85, R0 * 1.8, 8, 3).rotateX(Math.PI).translate(0, -R0 * 0.9 - 0.17, 0), 0.18, 2, seed + v + 3);
  k.add(faceted(bot), (g) => paint(g, (p, n, out) => out.set('#4a4458').multiplyScalar(0.55 + 0.3 * smooth(-R0 * 2, 0, p.y))));
  if (v % 2 === 0) foliage(k, [[0, 0, 0, 0.35]], '#2f7a4a', null, seed, { at: [R0 * 0.3, 0.45, 0], sy: 0.6, cy: -0.35, dens: 1.8, leaf: [0.7, 1] });
  if (v === 2) for (let i = 0; i < 3; i++) k.add(faceted(G.cone(0.1, 0.5 + r() * 0.3, 5)), grad('#a87aff', 0.6, 1.2), { at: [-0.4 + i * 0.3, 0.15, 0.3], kind: 'gem' });
  return k.build();
}
function formation(v, seed) {
  const k = new Kit(), R0 = v ? 2.6 : 3.4, sides = 8;
  k.add(faceted(G.cyl(R0, R0 + 0.15, 0.3, sides)), grad('#6a6878', 0.7, 1.05, 0.12));
  k.add(faceted(G.cyl(R0 * 0.7, R0 * 0.72, 0.1, sides)), grad('#5a5868', 0.7, 1), { at: [0, 0.3, 0] });
  // 阵纹：一圈发光细条 + 八卦方向短线
  k.add(G.tor(R0 * 0.82, 0.04, 4, 48), grad('#8ad0ff'), { at: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], kind: 'glow' });
  k.add(G.tor(R0 * 0.45, 0.035, 4, 36), grad('#8ad0ff'), { at: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0], kind: 'glow' });
  for (let i = 0; i < sides; i++) {
    const a = i / sides * TAU;
    for (let j = 0; j < 3; j++) k.add(G.box(0.36, 0.03, j === 1 && i % 2 ? 0.05 : 0.08), grad('#8ad0ff'), { at: [Math.cos(a) * (R0 * 0.55 + j * 0.12), 0.42, Math.sin(a) * (R0 * 0.55 + j * 0.12)], rot: [0, -a + Math.PI / 2, 0], kind: 'glow' });
  }
  const n = v ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + 0.2;
    k.add(faceted(lumpy(G.box(0.4, 1.8, 0.4), 0.04, 4, seed + i)), grad('#7a7888', 0.65, 1.05, 0.15), { at: [Math.cos(a) * R0 * 0.95, 1.1, Math.sin(a) * R0 * 0.95] });
    k.add(G.ico(0.18, 1), grad('#8ad0ff'), { at: [Math.cos(a) * R0 * 0.95, 2.3, Math.sin(a) * R0 * 0.95], kind: 'glow' });
  }
  return k.build({ light: { color: '#8ad0ff', i: 1.0, d: 8, y: 1.2 } });
}


// ======================================================================
// 台地：石阶（与 biomes.js 的台阶路一致：宽 2.2、进深 3（摆放时按实际进深沿 z 拉伸）、高一级 LH，朝 -z 上坡）
// ======================================================================
function stairs(v, seed, W = 2.2, RUN = 3, RISE = LH) {
  const k = new Kit(), n = 7, stone = (g) => faceted(lumpy(g, 0.025, 5, seed));
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * RISE / n, d = RUN / n;
    // 每级都一直埋到地下 2 米：地面比台阶低的地方露出的是实心石砌，不会悬空
    k.add(stone(G.box(W, h + 2, d + 0.02)), grad(v ? '#a89a88' : '#b4aea8', 0.72, 1.06, 0.12, i), { at: [0, (h - 2) / 2, RUN / 2 - d * (i + 0.5)] });
  }
  // 两侧矮墙 + 墙头小石柱
  for (const sx of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * RISE / n + 0.3, d = RUN / n;
      k.add(stone(G.box(0.28, h + 2, d + 0.02)), grad('#9a948e', 0.65, 1.0, 0.15, i + 9), { at: [sx * (W / 2 + 0.14), (h - 2) / 2, RUN / 2 - d * (i + 0.5)] });
    }
    k.add(stone(G.box(0.36, 0.5, 0.36)), grad('#8a847e', 0.7, 1.05), { at: [sx * (W / 2 + 0.14), 0.25 + 0.3 + RISE / n, RUN / 2 - RUN / n / 2] });
  }
  return k.build();
}


// 木桩台阶：半埋的横木一级级往上（和石阶同一套摆放：进深 3，高一级 LH，朝 -z 上坡）
function logSteps(v, seed, W = 1.9, RUN = 3, RISE = LH) {
  const k = new Kit(), r = rnd(seed + v), n = 5, bark = '#6a4a32';
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) * RISE / n, z = RUN / 2 - (i + 0.5) * RUN / n, L = W * (0.85 + r() * 0.2);
    k.add(new THREE.CylinderGeometry(0.13, 0.14, L, 8).rotateZ(Math.PI / 2), (g) => paint(g, (p, nn, out) => out.set(Math.abs(p.x) > L / 2 - 0.02 ? '#d8b078' : bark).multiplyScalar(0.7 + 0.35 * Math.max(0, nn.y + 0.3))), { at: [(r() - 0.5) * 0.15, y - 0.02, z], rot: [0, (r() - 0.5) * 0.12, 0] });
    for (const sx of [-1, 1]) k.add(G.cyl(0.04, 0.05, 0.6, 5), grad('#5a3a26'), { at: [sx * (L / 2 - 0.1), y - 0.5, z + 0.16] });
    // 横木后面填的夯土台面（一直埋到地下），踩上去是平的
    k.add(G.box(L * 0.95, 2, RUN / n), grad('#8a6a48', 0.7, 1.0, 0.15, i), { at: [0, y + 0.06 - 1, z - 0.02] });
  }
  return k.build();
}
// 木梯：靠在崖上的两根竖杆 + 横档，原点在梯脚，朝 -z 靠墙
function ladder(v, seed) {
  const k = new Kit(), H = LH + 0.55, lean = 0.45;
  for (const sx of [-1, 1]) k.add(G.tube([[sx * 0.32, 0, 0], [sx * 0.3, H, -lean]], 0.05, 0.045, 5), grad('#8a5a34', 0.7, 1.1, 0.1));
  const n = Math.round(H / 0.32);
  for (let i = 1; i < n; i++) { const t = i / n; k.add(G.cyl(0.028, 0.028, 0.62, 5), grad('#a8743f'), { at: [-0.31, t * H, -lean * t], rot: [0, 0, -Math.PI / 2] }); }
  if (v) for (const sx of [-1, 1]) k.add(G.tor(0.06, 0.02, 4, 8), grad('#c8b080'), { at: [sx * 0.31, H * 0.5, -lean * 0.5] }); // 绑绳
  return k.build();
}

// ======================================================================
// 羽叶：沿叶轴的一条带子，两边是朝叶尖方向的锯齿，两半向下折成 V 形
export function frondGeo(spine, W, fold) {
  const P = spine.map((p) => new THREE.Vector3(...p)), N = P.length - 1, pos = [], up = new THREE.Vector3(0, 1, 0);
  const side = [], down = [];
  for (let i = 0; i <= N; i++) {
    const tg = P[Math.min(i + 1, N)].clone().sub(P[Math.max(i - 1, 0)]).normalize(), sd = new THREE.Vector3().crossVectors(tg, up).normalize();
    side.push(sd); down.push(new THREE.Vector3().crossVectors(sd, tg).normalize());
  }
  const edge = (i, f, sgn, k) => {
    // 叶宽：中段最宽，基部和叶尖收窄
    const t = (i + f) / N, w = W * (Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.85 + 0.15) * k, j = Math.min(N, Math.floor(i + f)), fr = i + f - j;
    const c = j < N ? P[j].clone().lerp(P[j + 1], fr) : P[N].clone();
    return c.addScaledVector(side[Math.min(j, N)], sgn * w * Math.cos(fold)).addScaledVector(down[Math.min(j, N)], -w * Math.sin(fold));
  };
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < N; i++) for (const sg of [-1, 1]) {
    const V0 = edge(i, 0, sg, 0.4), T = edge(i, 0.85, sg, 1), V1 = edge(i + 1, 0, sg, 0.4);
    tri(P[i], V0, T); tri(P[i], T, P[i + 1]); tri(P[i + 1], T, V1); // 双面材质，绕序无所谓
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
// 茂密椰树（参考图风格）：粗环纹树干 + 十来片宽大的锯齿羽叶
function palmLush(v, seed) {
  const k = new Kit(), r = rnd(seed + v), H = [4.2, 3.4, 4.8][v], bend = [0.9, 0.4, 1.4][v], a0 = r() * TAU;
  const top = [Math.cos(a0) * bend, H, Math.sin(a0) * bend];
  const pts = [[0, 0, 0], [top[0] * 0.1, H * 0.35, top[2] * 0.1], [top[0] * 0.45, H * 0.72, top[2] * 0.45], top];
  k.add(G.tube(pts, 0.26, 0.17, 8), (g) => paint(g, (p, n, out) => { const f = (p.y * 3.4) % 1; out.set('#b08458').multiplyScalar((f < 0.22 ? 0.66 : 0.92 + f * 0.1) * (0.82 + Math.max(0, n.x * 0.5 + n.z * 0.3) * 0.25)); }));
  const NF = 11;
  for (let i = 0; i < NF; i++) {
    const a = i / NF * TAU + r() * 0.25, len = 2.0 + r() * 0.6, up = i % 3 === 0 ? 0.35 : 0;
    const spine = [];
    for (let s = 0; s <= 14; s++) { const t = s / 14; spine.push([Math.cos(a) * t * len, Math.sin(t * 2) * (0.45 + up) - t * t * 1.15, Math.sin(a) * t * len]); }
    k.add(G.tube(spine.map(([x, y, z]) => [top[0] + x, top[1] + y, top[2] + z]), 0.04, 0.015, 4), grad('#5a8a30', 0.8, 1.1), { kind: 'leaf' });
    k.add(frondGeo(spine.map(([x, y, z]) => [top[0] + x, top[1] + y, top[2] + z]), len * 0.24, 0.42), grad(['#4f9a38', '#5aa83e', '#68b444'][i % 3], 0.7, 1.15), { kind: 'plant' });
    // 参考画风：叶子下面垫一片稍宽的深色叶，露出来的一圈就是描边
    if (STYLE.frondInk) k.add(frondGeo(spine.map(([x, y, z]) => [top[0] + x, top[1] + y - 0.03, top[2] + z]), len * 0.24 * 1.14, 0.42), grad('#1d3316', 1, 1, 0), { kind: 'plant' });
  }
  for (let i = 0; i < 4; i++) k.add(G.sph(0.15, 7, 6), grad('#7a5a2a', 0.7, 1.1), { at: [top[0] + Math.cos(i * 1.6) * 0.2, top[1] - 0.18, top[2] + Math.sin(i * 1.6) * 0.2] });
  return k.build();
}
// 冷杉（参考图风格）：一层层叶簇卡片堆成的蓬松塔形
function fir(v, seed) {
  const k = new Kit(), H = [4.2, 3.2, 5.2][v % 3];
  k.add(G.tube([[0, 0, 0], [0, H * 0.5, 0], [0, H, 0]], 0.2, 0.06, 7), grad('#6a4a34', 0.6, 1.05));
  const parts = [], tiers = 6;
  for (let i = 0; i < tiers; i++) { const t = i / (tiers - 1), R = 1.25 * (1 - t * 0.8); parts.push([0, H * (0.25 + t * 0.7), 0, R]); }
  foliage(k, parts, ['#2f7a44', '#3a8a4a', '#2a6e40'][v % 3], '#5aa058', seed + v, { accentAmt: 0.06, dens: 1.3 });
  return k.build();
}
// 珊瑚湾（风格试验）：珊瑚 / 海草 / 小船 / 长栈桥 / 断吊桥 / 渔屋
// ======================================================================
// 珊瑚 4 形：枝状 / 脑珊瑚团 / 蓝色尖刺丛 / 礁石上长满一圈
const CORAL = ['#b06ad8', '#ff7aa8', '#ffc84a', '#4a7aff', '#ff8a5a', '#8ad0ff'];
function coralBranch(k, r, at, color, H = 0.7) {
  const grow = (p, a, tilt, len, rr, depth) => {
    const e = [p[0] + Math.cos(a) * Math.sin(tilt) * len, p[1] + Math.cos(tilt) * len, p[2] + Math.sin(a) * Math.sin(tilt) * len];
    k.add(G.tube([p, [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2, (p[2] + e[2]) / 2], e], rr, rr * 0.75, 5), grad(color, 0.75, 1.2, 0.08));
    k.add(G.sph(rr * 0.9, 6, 5), grad(color, 1.0, 1.3), { at: e });
    if (depth > 0) for (let i = 0; i < 2; i++) grow(e, a + (r() - 0.5) * 2.2, 0.35 + r() * 0.5, len * 0.72, rr * 0.72, depth - 1);
  };
  for (let i = 0; i < 3; i++) grow(at, r() * TAU, 0.2 + r() * 0.4, H * (0.35 + r() * 0.15), 0.06, 2);
}
function coralBrain(k, r, at, color, s = 1) {
  const g = lumpy(G.sph(0.32 * s, 12, 9).scale(1, 0.7, 1), 0.05, 6, 3);
  // 脑纹：沿经度的深浅条纹
  k.add(g, (geo) => paint(geo, (p, n, out) => out.set(color).multiplyScalar((0.82 + 0.25 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 9 + p.y * 14))) * (0.75 + n.y * 0.3))), { at: [at[0], at[1] + 0.12 * s, at[2]] });
}
function coralSpikes(k, r, at, color, n = 9) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = r() * 0.25, t = 0.2 + r() * 0.5;
    k.add(G.cone(0.07, 0.35 + r() * 0.3, 5), grad(color, 0.7, 1.3), { at: [at[0] + Math.cos(a) * d, at[1], at[2] + Math.sin(a) * d], rot: [Math.sin(a) * t, 0, -Math.cos(a) * t] });
  }
}
function coral(v, seed) {
  const k = new Kit(), r = rnd(seed + v * 17);
  if (v === 0) { coralBranch(k, r, [0, 0, 0], CORAL[0], 0.9); coralBranch(k, r, [0.35, 0, 0.2], CORAL[1], 0.6); }
  else if (v === 1) { coralBrain(k, r, [0, 0, 0], CORAL[2], 1.2); coralBrain(k, r, [0.42, 0, 0.18], CORAL[4], 0.8); coralSpikes(k, r, [-0.3, 0, 0.25], CORAL[0], 5); }
  else if (v === 2) { coralSpikes(k, r, [0, 0, 0], CORAL[3], 14); coralSpikes(k, r, [0.35, 0, -0.2], CORAL[5], 7); }
  else {
    // 礁石上长一圈：扁礁石 + 各色珊瑚
    k.add(faceted(lumpy(G.ico(0.8, 1).scale(1.3, 0.45, 1), 0.15, 2.2, seed)), mossCap('#9aa8a8', '#6ab0a0', 0.6, 0.5), { at: [0, 0.2, 0] });
    coralBranch(k, r, [-0.3, 0.45, 0.1], CORAL[0], 0.55);
    coralBrain(k, r, [0.35, 0.4, -0.15], CORAL[2], 0.8);
    coralSpikes(k, r, [0.1, 0.42, 0.45], CORAL[3], 6);
    coralBrain(k, r, [-0.5, 0.3, -0.4], CORAL[1], 0.6);
  }
  return k.build();
}
function seaweed(v, seed) {
  const k = new Kit(), r = rnd(seed + v);
  const col = ['#3a9a4a', '#5ab05a'][v % 2];
  for (let i = 0; i < 6 + v * 2; i++) {
    const a = r() * TAU, d = r() * 0.2;
    k.add(G.blade(0.06 + r() * 0.04, 0.22 + r() * 0.22, 0.12), grad(col, 0.55, 1.2), { at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [(r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4], kind: 'plant' });
  }
  return k.build();
}
// 小木船：外壳 = 下半球压扁拉长；内壳镜像翻面（面朝里）当船舱
function boat(v) {
  const k = new Kit(), hull = new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2).scale(0.62, 0.42, 1.55);
  const plankPaint = (base) => (g) => paint(g, (p, n, out) => out.set(base).multiplyScalar((Math.floor((p.y + 1) * 14) % 2 ? 0.86 : 1) * (0.8 + n.y * 0.15 + 0.1)));
  k.add(hull, plankPaint(v ? '#b88a5a' : WOOD), { at: [0, 0.32, 0] });
  const inner = hull.clone().scale(-0.9, 0.86, 0.94), nn = inner.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
  k.add(inner, plankPaint('#7a5236'), { at: [0, 0.33, 0] });
  // 船沿
  const rim = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; rim.push([Math.cos(a) * 0.6, 0.33, Math.sin(a) * 1.52]); }
  k.add(G.tube(rim, 0.045, 0.045, 5), grad(DWOOD));
  for (const z of [-0.6, 0.15, 0.85]) k.add(...plank(1.0 - Math.abs(z) * 0.35, 0.05, 0.22, '#c09060', z * 9), { at: [0, 0.22, z] });
  // 两支桨
  for (const s of [-1, 1]) {
    k.add(G.cyl(0.025, 0.025, 1.5, 5), grad('#c8a070'), { at: [s * 0.35, 0.3, 0.1], rot: [Math.PI / 2 - 0.15, 0, s * 0.25] });
    k.add(G.box(0.14, 0.02, 0.36), grad('#c8a070'), { at: [s * 0.52, 0.26, 0.85], rot: [0, s * 0.25, 0] });
  }
  return k.build();
}
// 长栈桥：沿 +z 伸出，桥面在 y=0；桩子插到水下；尽头一块平台 + 梯子 + 木箱
function pier(v) {
  const k = new Kit(), L = 7, W = 1.3, PW = 3, PL = 2.6, r = rnd(91);
  for (let i = 0; i < Math.round(L / 0.28); i++) {
    if (i === 9 || (i === 17 && v)) continue; // 少两块板
    k.add(...plank(W + (r() - 0.5) * 0.12, 0.07, 0.25, ['#a8743f', '#9a6a3a', '#b88048'][i % 3], i), { at: [(r() - 0.5) * 0.06, -0.035, 0.14 + i * 0.28], rot: [0, (r() - 0.5) * 0.04, 0] });
  }
  for (let i = 0; i < Math.round(PL / 0.28); i++) k.add(...plank(PW, 0.07, 0.25, ['#a8743f', '#9a6a3a', '#b88048'][(i + 1) % 3], 40 + i), { at: [0, -0.035, L + 0.14 + i * 0.28] });
  const post = (x, z, top = 0.25) => k.add(G.cyl(0.09, 0.11, 1.9 + top, 7), grad(DWOOD, 0.45, 1), { at: [x, -1.9, z] });
  for (let z = 0.6; z < L; z += 1.6) for (const s of [-1, 1]) post(s * (W / 2 + 0.05), z);
  for (const [x, z] of [[-PW / 2, L], [PW / 2, L], [-PW / 2, L + PL], [PW / 2, L + PL], [0, L + PL]]) post(x, z, 0.45);
  // 两侧横梁
  for (const s of [-1, 1]) k.add(...plank(0.08, 0.14, L, DWOOD), { at: [s * (W / 2 + 0.05), -0.12, L / 2] });
  // 梯子（平台尽头往下）
  for (const s of [-1, 1]) k.add(G.cyl(0.035, 0.035, 1.3, 5), grad(DWOOD), { at: [0.6 + s * 0.22, -1.2, L + PL + 0.08] });
  for (let i = 0; i < 4; i++) k.add(G.cyl(0.025, 0.025, 0.44, 5), grad(WOOD), { at: [0.6, -0.2 - i * 0.28, L + PL + 0.08], rot: [0, 0, Math.PI / 2] });
  // 平台上的木箱 / 鱼篓 / 绳圈
  k.add(...plank(0.5, 0.42, 0.5, '#c8a070', 5), { at: [-0.9, 0.21, L + 1.8], rot: [0, 0.3, 0] });
  k.add(...plank(0.38, 0.32, 0.38, '#b88a5a', 6), { at: [-0.8, 0.58, L + 1.8], rot: [0, -0.2, 0] });
  k.add(G.cyl(0.22, 0.17, 0.4, 10), grad('#c8a868'), { at: [0.9, 0, L + 0.7] });
  k.add(G.tor(0.18, 0.05, 5, 12), grad('#d8c08a'), { at: [-0.4, 0.05, L + 0.5], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 5; i++) k.add(...plank(0.7, 0.04, 0.12, '#d8b888', 60 + i), { at: [0.2, 0.02 + i * 0.04, L + 2.0], rot: [0, i * 0.12, 0] });
  return k.build();
}
// 绳吊桥（沿 x 跨，跨度 L）：v0 完整下垂；v1 中间断开，两头的板子垂进河里
function ropeBridge(v) {
  const k = new Kit(), L = 5.4, W = 1.1, sag = 0.35, r = rnd(77 + v);
  const yAt = (x) => -sag * (1 - (2 * x / L) ** 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(G.cyl(0.08, 0.1, 1.5, 7), grad(DWOOD, 0.5, 1), { at: [sx * L / 2, -0.4, sz * W / 2] });
  const gap = v ? 1.0 : 0; // 断口半宽
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const x = -L / 2 + 0.15 + i / N * (L - 0.3);
    if (Math.abs(x) < gap) continue;
    let y = yAt(x), rz = Math.atan(-sag * -8 * x / (L * L)), dx = 0;
    // 断口附近的板往下垂
    if (v && Math.abs(x) < gap + 0.9) { const t = 1 - (Math.abs(x) - gap) / 0.9; y -= t * t * 0.6; rz += Math.sign(x) * t * 1.0; dx = -Math.sign(x) * t * 0.1; }
    k.add(...plank(0.22, 0.05, W - 0.05 + (r() - 0.5) * 0.1, i % 2 ? WOOD : '#b88048', i), { at: [x + dx, y, (r() - 0.5) * 0.06], rot: [0, (r() - 0.5) * 0.1, rz] });
  }
  for (const sz of [-1, 1]) for (const yo of [0, 0.75]) {
    // 下绳（承板）+ 上绳（扶手）；断开时两段各自垂下
    const seg = (x0, x1, droop) => { const pts = []; for (let i = 0; i <= 8; i++) { const x = x0 + (x1 - x0) * i / 8, t = Math.max(0, (Math.abs(x) - gap) < 0.9 && v ? 1 - (Math.abs(x) - gap) / 0.9 : 0); pts.push([x, yAt(x) * (yo ? 0.7 : 1) + yo - droop * t * t, sz * W / 2]); } k.add(G.tube(pts, 0.025, 0.025, 4), grad('#c8b080')); };
    if (v) { seg(-L / 2, -gap, 0.7); seg(gap, L / 2, 0.7); } else seg(-L / 2, L / 2, 0);
  }
  return k.build();
}
// 渔屋：木板墙 + 人字形木板屋顶 + 门窗 + 侧面晒网架
function fishHut(v) {
  const k = new Kit(), Wd = 3.2, D = 2.6, H = 1.7;
  const wall = (base) => (g) => paint(g, (p, n, out) => out.set(base).multiplyScalar((Math.floor(p.y * 5.5) % 2 ? 0.86 : 1) * (0.92 + (vnoise(p.x * 3, p.y * 5.5 + p.z * 3, 4) - 0.5) * 0.2) * (0.85 + Math.abs(n.x) * 0.1 + n.y * 0.1)));
  k.add(G.box(Wd, H, D), wall('#b8784a'), { at: [0, H / 2, 0] });
  // 山墙三角
  const gable = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-Wd / 2, 0, 0, Wd / 2, 0, 0, 0, 1.1, 0], 3));
  gable.computeVertexNormals();
  for (const s of [-1, 1]) k.add(gable.clone(), wall('#a86a40'), { at: [0, H, s * D / 2], rot: [0, s > 0 ? 0 : Math.PI, 0] });
  // 屋顶两坡（木板条纹）+ 屋脊
  const roofLen = Math.hypot(Wd / 2 + 0.35, 1.25);
  for (const s of [-1, 1]) k.add(G.box(roofLen, 0.1, D + 0.6), (g) => paint(g, (p, n, out) => out.set('#c8925a').multiplyScalar((Math.floor((p.z + 2) * 3.4) % 2 ? 0.82 : 1) * (0.8 + n.y * 0.25))), { at: [s * (Wd / 4 + 0.1), H + 0.55, 0], rot: [0, 0, -s * Math.atan2(1.15, Wd / 2 + 0.2)] });
  k.add(G.box(0.18, 0.16, D + 0.7), grad('#7a5236'), { at: [0, H + 1.12, 0] });
  // 竖向压条
  for (const x of [-Wd / 2 + 0.05, -0.5, 0.5, Wd / 2 - 0.05]) k.add(G.box(0.1, H, 0.06), grad('#8a5a36'), { at: [x, H / 2, D / 2 + 0.03] });
  k.add(G.box(0.7, 1.15, 0.06), grad('#5a3a26'), { at: [0, 0.58, D / 2 + 0.05] });
  k.add(G.box(0.6, 0.45, 0.06), grad('#2a3a48'), { at: [Wd / 2 + 0.03, 1.05, 0], rot: [0, Math.PI / 2, 0] });
  k.add(G.box(0.7, 0.08, 0.1), grad('#8a5a36'), { at: [Wd / 2 + 0.05, 0.8, 0], rot: [0, Math.PI / 2, 0] });
  // 门口台阶 + 晒网架
  k.add(...plank(1.2, 0.12, 0.5, '#9a6a3a'), { at: [0, 0.06, D / 2 + 0.3] });
  if (!v) {
    for (const z of [-0.9, 0.9]) k.add(G.cyl(0.05, 0.05, 1.3, 5), grad(DWOOD), { at: [-Wd / 2 - 0.9, 0, z] });
    k.add(G.cyl(0.03, 0.03, 2, 5), grad(DWOOD), { at: [-Wd / 2 - 0.9, 1.25, -1], rot: [Math.PI / 2, 0, 0] });
    const net = new THREE.PlaneGeometry(1.7, 0.9, 6, 3);
    k.add(net, grad('#d8cfa8', 0.8, 1.05), { at: [-Wd / 2 - 0.9, 0.8, 0], rot: [0, Math.PI / 2, 0], kind: 'plant' });
  }
  return k.build();
}

// ======================================================================
// 素材登记：按区域分组（同一素材可出现在多个区域）
// ======================================================================
export const ASSETS = {
  // ---- 春野 ----
  tree:      { name: '阔叶树', n: 5, make: (v) => broadTree(v, ['#5fae3e', '#4f9e36', '#72bc46', '#5aa83a', '#6cbc44'][v], '#a8d858', 11 + v) },
  fruitTree: { name: '果树', n: 3, make: (v) => broadTree([0, 2, 3][v], '#58a83a', '#9ad050', 21 + v, { fruit: grad(['#e8442e', '#ffb84a', '#ff7aa0'][v], 0.8, 1.3) }) },
  peach:     { name: '桃花树', n: 3, make: (v) => broadTree([0, 2, 4][v], '#ffb6d0', '#ffffff', 31 + v, { accentAmt: 0.06, bark: '#6a4038', bloom: true }) },
  bush:      { name: '灌木', n: 4, make: (v) => bush(v, ['#4f9e36', '#5aa83a', '#3f8a32', '#66b040'][v], null, 41) },
  berryBush: { name: '浆果丛', n: 3, make: (v) => bush(v, '#3f8a32', ['#e8442e', '#5a6aff', '#ffffff'][v], 51) },
  // ---- 实叶版（一片片叶子几何）：只在「全部素材」里对比，场景不用 ----
  treeReal:  { name: '阔叶树·实叶', n: 5, extra: true, make: (v) => broadTree(v, ['#5fae3e', '#4f9e36', '#72bc46', '#5aa83a', '#6cbc44'][v], '#a8d858', 11 + v, { real: true }) },
  mapleReal: { name: '枫树·实叶', n: 4, extra: true, make: (v) => broadTree(v, ['#e8783a', '#d8582e', '#f2a640', '#cc4a2f'][v], ['#ffb84a', '#ff8a4a', '#ffd86a', '#e8783a'][v], 271 + v, { bark: '#5a3a2e', real: true }) },
  bushReal:  { name: '灌木·实叶', n: 4, extra: true, make: (v) => bush(v, ['#4f9e36', '#5aa83a', '#3f8a32', '#66b040'][v], null, 41, 1, 'leaf', true) },
  rock:      { name: '岩石', n: 5, make: (v) => rock(v, mossCap('#a8a4a0', '#6ab048', 0.62), 61) },
  flower:    { name: '花丛', n: 6, make: (v) => flowers(v, 71) },
  grass:     { name: '草丛', n: 4, make: (v) => grassTuft(v, '#6cb342', 81) },
  mushroom:  { name: '蘑菇', n: 4, make: (v) => mushroom(v, ['#e84a3a', '#c88a4a', '#e8a03a', '#d85a8a'][v], 91) },
  stump:     { name: '树桩/倒木', n: 4, make: (v) => stump(v, 101) },
  fence:     { name: '篱笆', n: 4, make: (v) => fence(v, 111) },
  crop:      { name: '作物', n: 5, make: (v) => crop(v, 121) },
  scarecrow: { name: '稻草人', n: 2, make: (v) => scarecrow(v) },
  well:      { name: '水井', n: 2, make: (v) => well(v) },
  // ---- 竹林村落 ----
  bamboo:    { name: '竹丛', n: 4, make: (v) => bamboo(v, 131) },
  stoneLan:  { name: '石灯笼', n: 3, make: (v) => stoneLantern(v, 141) },
  lanPost:   { name: '灯笼柱', n: 2, make: (v) => lanternPost(v) },
  barrel:    { name: '木桶', n: 3, make: (v) => barrel(v, 151) },
  crate:     { name: '木箱', n: 3, make: (v) => crate(v, 161) },
  jar:       { name: '陶罐', n: 4, make: (v) => jar(v, 171) },
  sign:      { name: '路牌', n: 2, make: (v) => signpost(v, 181) },
  steps:     { name: '踏脚石', n: 3, make: (v) => steppingStones(v, 191) },
  bridge:    { name: '拱桥', n: 2, make: (v) => bridge(v) },
  // ---- 湖畔沙滩 ----
  palm:      { name: '椰树', n: 3, make: (v) => palm(v, 201) },
  reeds:     { name: '芦苇', n: 3, make: (v) => reeds(v, 211) },
  lily:      { name: '荷叶/荷花', n: 3, make: (v) => lily(v, 221) },
  shell:     { name: '贝壳/海星', n: 4, make: (v) => shell(v, 231) },
  beachRock: { name: '礁石', n: 5, make: (v) => rock(v, mossCap('#c8b8a0', '#4f8a5a', 0.75, 0.6), 241) },
  driftwood: { name: '浮木', n: 3, make: (v) => driftwood(v, 251) },
  dock:      { name: '码头', n: 2, make: (v) => dock(v) },
  duneGrass: { name: '沙丘草', n: 4, make: (v) => grassTuft(v, '#a8b860', 261, { h: 0.6, seed: grad('#e8d8a0') }) },
  // ---- 赤枫林 ----
  maple:     { name: '枫树', n: 4, make: (v) => broadTree(v, ['#e8783a', '#d8582e', '#f2a640', '#cc4a2f'][v], ['#ffb84a', '#ff8a4a', '#ffd86a', '#e8783a'][v], 271 + v, { bark: '#5a3a2e', bloom: true }) },
  ginkgo:    { name: '银杏', n: 2, make: (v) => broadTree(v ? 1 : 2, '#f2c840', '#fff07a', 281 + v, { bark: '#6a5040', bloom: true }) },
  leafPile:  { name: '落叶堆', n: 3, make: (v) => bush([1, 2, 0][v], ['#e8783a', '#d85a2e', '#f2a640'][v], '#ffd86a', 291, 0.35, 'bloom') },
  pumpkin:   { name: '南瓜', n: 3, make: (v) => pumpkin(v, 301) },
  autumnBush:{ name: '红叶灌木', n: 4, make: (v) => bush(v, ['#c84a2f', '#e8783a', '#a8402a', '#d8902e'][v], '#ffb84a', 311, 1, 'bloom') },
  mossRock:  { name: '苔石', n: 5, make: (v) => rock(v, mossCap('#8a8680', '#c8a048', 0.55), 321) },
  autumnGrass:{ name: '枯草', n: 4, make: (v) => grassTuft(v, '#c8a050', 331) },
  // ---- 雪原 ----
  snowPine:  { name: '雪松', n: 4, make: (v) => pine(v, '#2f6a4a', 341, true) },
  pineTree:  { name: '松树', n: 4, make: (v) => pine(v, '#2f7a4a', 345, false) },
  snowRock:  { name: '雪岩', n: 5, make: (v) => rock(v, snowCap('#7a8090', 0.5), 351) },
  drift:     { name: '雪堆', n: 3, make: (v) => snowDrift(v, 361) },
  ice:       { name: '冰晶', n: 3, make: (v) => iceCrystal(v, 371) },
  snowman:   { name: '雪人', n: 2, make: (v) => snowman(v) },
  bareBush:  { name: '枯枝丛', n: 3, make: (v) => deadTree(v, 381, '#6a5a50') },
  // ---- 玄晶矿洞 ----
  crystal:   { name: '灵晶簇', n: 5, make: (v) => crystal(v, Object.values(GEM)[v], 391) },
  ore:       { name: '矿石', n: 4, make: (v) => oreRock(v, Object.values(GEM)[v], 401) },
  stalag:    { name: '石笋', n: 4, make: (v) => stalagmite(v, 411) },
  cart:      { name: '矿车', n: 2, make: (v) => mineCart(v) },
  beam:      { name: '支撑木架', n: 2, make: (v) => support(v) },
  torch:     { name: '火把', n: 2, make: (v) => torch(v) },
  glowShroom:{ name: '荧光菇', n: 4, make: (v) => mushroom(v, ['#5ad8ff', '#b07aff', '#5affa8', '#ffd25a'][v], 421, true) },
  caveRock:  { name: '洞岩', n: 5, make: (v) => rock(v, (g) => paint(g, (p, n, out) => out.set('#6a6280').multiplyScalar(0.6 + 0.45 * n.y)), 431) },
  // ---- 仙山灵境 ----
  karst:     { name: '石峰', n: 4, make: (v) => karst(v, 441) },
  bonsai:    { name: '迎客松', n: 3, make: (v) => bonsaiPine(v, 451) },
  lingzhi:   { name: '灵芝', n: 3, make: (v) => lingzhi(v, 461) },
  herb:      { name: '灵草', n: 4, make: (v) => spiritHerb(v, 471) },
  lotus:     { name: '莲花灯', n: 2, make: (v) => lotusLamp(v) },
  incense:   { name: '香炉', n: 2, make: (v) => incense(v) },
  stele:     { name: '石碑', n: 3, make: (v) => stele(v, 481) },
  pavilion:  { name: '亭子', n: 2, make: (v) => pavilion(v) },
  cloud:     { name: '祥云', n: 3, make: (v) => cloud(v, 491) },
  jade:      { name: '玉石', n: 3, make: (v) => jade(v, 501) },
  // ---- 矿脉（world_map.json 副矿）----
  vein:      { name: '矿脉', n: 8, make: (v) => vein(v, 581) },
  // ---- 沼泽 ----
  swampTree: { name: '沼泽气根树', n: 3, make: (v) => swampTree(v, 591) },
  bogPlant:  { name: '沼泽植物', n: 3, make: (v) => bogPlant(v, 601) },
  bogShroom: { name: '毒菇', n: 4, make: (v) => mushroom(v, ['#9aff4a', '#c87aff', '#5ad8a0', '#e8e05a'][v], 611, true) },
  swampGrass:{ name: '沼草', n: 4, make: (v) => grassTuft(v, '#7a9a3a', 625, { h: 0.6 }) },
  bogRock:   { name: '沼石', n: 5, make: (v) => rock(v, mossCap('#5a5a4a', '#4a6a2a', 0.45, 1), 621) },
  // ---- 沙漠遗迹 ----
  cactus:    { name: '仙人掌', n: 4, make: (v) => cactus(v, 631) },
  pillar:    { name: '遗迹石柱', n: 4, make: (v) => ruinPillar(v, 641) },
  ruinWall:  { name: '遗迹残墙', n: 3, make: (v) => ruinWall(v, 651) },
  statue:    { name: '半埋石像', n: 2, make: (v) => statueHead(v, 661) },
  sandRock:  { name: '砂岩', n: 5, make: (v) => rock(v, SANDSTONE, 671) },
  dryShrub:  { name: '旱生灌丛', n: 3, make: (v) => deadTree(v, 681, '#8a7050') },
  desertGrass:{ name: '沙草', n: 4, make: (v) => grassTuft(v, '#b8a868', 691, { h: 0.45 }) },
  // ---- 古战场 ----
  sword:     { name: '残剑', n: 4, make: (v) => brokenSword(v, 701) },
  banner:    { name: '残旗', n: 3, make: (v) => banner(v, 711) },
  shield:    { name: '盾/盔', n: 3, make: (v) => shieldProp(v, 721) },
  grave:     { name: '坟冢', n: 3, make: (v) => grave(v, 731) },
  wreck:     { name: '破战车', n: 2, make: (v) => brokenCart(v, 741) },
  // ---- 百花谷 ----
  wisteria:  { name: '紫藤', n: 2, make: (v) => wisteria(v, 751) },
  flowerTree:{ name: '花树', n: 3, make: (v) => broadTree([0, 2, 1][v], ['#fff4f0', '#ffd84a', '#ff8ab0'][v], ['#ffd0e0', '#fff0a0', '#ffffff'][v], 761 + v, { bloom: true, bark: '#6a4a3a', accentAmt: 0.1 }) },
  flowerBed: { name: '花圃', n: 4, make: (v) => flowerBed(v, 771) },
  herbRack:  { name: '晒药架', n: 2, make: (v) => herbRack(v, 781) },
  // ---- 天劫峰 ----
  floatRock: { name: '浮空石', n: 4, make: (v) => floatRock(v, 791) },
  formation: { name: '渡劫法阵', n: 2, make: (v) => formation(v, 801) },
  stormPine: { name: '雷击松', n: 3, make: (v) => deadTree(v, 811, '#3a3440') },
  // ---- 台地 ----
  stairs:    { name: '石阶', n: 2, make: (v) => stairs(v, 821) },
  logSteps:  { name: '木桩台阶', n: 2, make: (v) => logSteps(v, 831) },
  ladder:    { name: '木梯', n: 2, make: (v) => ladder(v, 841) },
  // ---- 赤岩荒原 ----
  lavaRock:  { name: '熔岩石', n: 5, make: (v) => lavaRock(v, 511) },
  redRock:   { name: '赤砂岩', n: 5, make: (v) => redRock(v, 521) },
  obsidian:  { name: '黑曜石', n: 3, make: (v) => obsidian(v, 531) },
  deadTree:  { name: '枯树', n: 3, make: (v) => deadTree(v, 541) },
  bones:     { name: '兽骨', n: 2, make: (v) => bones(v) },
  fireFlower:{ name: '火焰花', n: 3, make: (v) => fireFlower(v, 551) },
  vent:      { name: '地火/硫磺口', n: 2, make: (v) => vent(v, 561) },
  ashGrass:  { name: '焦草', n: 4, make: (v) => grassTuft(v, '#8a7a4a', 571) },
  // ---- 珊瑚湾 ----
  palmLush:  { name: '茂密椰树', n: 3, make: (v) => palmLush(v, 621) },
  fir:       { name: '冷杉', n: 3, make: (v) => fir(v, 631) },
  coral:     { name: '珊瑚', n: 4, make: (v) => coral(v, 601) },
  seaweed:   { name: '海草', n: 2, make: (v) => seaweed(v, 611) },
  boat:      { name: '小木船', n: 2, make: (v) => boat(v) },
  pier:      { name: '长栈桥', n: 2, make: (v) => pier(v) },
  ropeBridge:{ name: '绳吊桥', n: 2, make: (v) => ropeBridge(v) },
  fishHut:   { name: '渔屋', n: 2, make: (v) => fishHut(v) },
};

// 缓存：同一素材变体只建一次
const built = new Map();
export function getAsset(id, v) {
  const k = id + ':' + v;
  if (!built.has(k)) built.set(k, ASSETS[id].make(v));
  return built.get(k);
}
