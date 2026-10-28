import { fbm, vnoise, smooth, clamp } from '../util.js';

// 每个区域：地形高度 / 地面配色 / 水面（水·冰·岩浆）/ 光照 / 粒子 / 撒点配方 / 图鉴列表
// 地形函数返回 { h, k }，k 是地面种类，配色函数据此给出像素颜色（sRGB 0..255）。

export const R = 24; // 小岛半径

const n2 = (x, z, s, f = 0.12, o = 3) => fbm(x * f, z * f, s, o);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const seg = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
};
// 弯曲小路：沿 x 方向的正弦
const wavyPath = (x, z, amp = 3, f = 0.18, off = 0) => Math.abs(z - (Math.sin(x * f + off) * amp + Math.sin(x * f * 2.3) * amp * 0.25));
// 土路 / 草地通用：带像素颗粒的配色
function grassy(base, dark, light, x, z, seed) {
  const n = n2(x, z, seed, 0.25), m = n2(x, z, seed + 5, 0.06);
  let c = mix(base, dark, smooth(0.45, 0.7, n));
  c = mix(c, light, smooth(0.6, 0.8, m) * 0.6);
  return c;
}


// ---------- 多级台地（7 级）----------
// F(x,z) 是连续的"台地级数场"（0..6），量化成平台 + 陡坎；台阶路径上改回连续坡度并自动摆石阶；
// 溪流沿折线往下流，每级平台一段水面，每道坎一挂瀑布（梯级瀑布）
export const LH = 1.3, LEVELS = 7;
const CLIFF = 0.17; // 每级末尾多少比例用来做坎（坎宽 ≈ CLIFF / |∇F| 米）
const quant = (F) => { const f = clamp(F, 0, LEVELS - 1), k = Math.floor(f); return k >= LEVELS - 1 ? k : k + smooth(1 - CLIFF, 1, f - k); };
const polyDist = (x, z, pts) => { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, seg(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return d; };
const gradF = (F, x, z, e = 0.25) => [(F(x + e, z) - F(x - e, z)) / (2 * e), (F(x, z + e) - F(x, z - e)) / (2 * e)];
const waterAt = (k) => LH * k + 0.2; // 第 k 级平台上溪水的世界高度（地面整体抬高 0.35）
function sampleLine(pts, F, d = 0.08) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / d);
    for (let j = i === 1 ? 0 : 1; j <= n; j++) { const t = j / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; out.push({ x, z, F: clamp(F(x, z), 0, LEVELS - 1), dx: (bx - ax) / L, dz: (bz - az) / L }); }
  }
  return out;
}
export function makeTerrace(o) {
  const T = { ...o, stairs: [], pools: [], falls: [] };
  // 连接方式（每条路一种）：
  //   stairs 石阶 / logs 木桩台阶：路上是连续坡，穿过 k+0.5 级处摆一段（朝上坡、按进深拉伸）
  //   trail 土路：只有坡，不摆东西（之字形绕上去坡就缓）
  //   ladder 木梯：不改地形，崖还是崖，在每道坎脚下靠一架梯子
  T.paths = (o.paths || []).map((p) => (Array.isArray(p) ? { pts: p, kind: 'stairs' } : p));
  T.placed = { stairs: [], logs: [], ladder: [] };
  T.ladders = [];
  for (const path of T.paths) {
    const S = sampleLine(path.pts, o.F), ladder = path.kind === 'ladder';
    if (path.kind === 'trail') continue;
    for (let i = 1; i < S.length; i++) for (let k = 0; k < LEVELS - 1; k++) {
      const c = ladder ? k + 1 - CLIFF / 2 : k + 0.5;
      if ((S[i - 1].F - c) * (S[i].F - c) >= 0) continue;
      const { x, z } = S[i], [gx, gz] = gradF(o.F, x, z), g = Math.hypot(gx, gz) || 1, rot = Math.atan2(-gx, -gz);
      if (ladder) {
        // 梯脚放在坎下面一点（顺着下坡方向退 0.35 米）
        const bx = x + gx / g * 0.35, bz = z + gz / g * 0.35;
        T.placed.ladder.push([bx, bz, rot]); T.ladders.push({ x, z, r: 0.9 });
      } else T.placed[path.kind].push([x, z, rot, clamp(1 / g / 3, 0.3, 3)]); // 拉伸到正好一级的进深
    }
  }
  T.stairs = T.placed.stairs;
  // 溪流：按所在级数切段；k≥1 的每段一块水面，每次掉级一挂瀑布
  if (o.stream) {
    const S = sampleLine(o.stream, o.F);
    let cur = [], k0 = Math.floor(S[0].F);
    const flush = () => {
      if (k0 >= 1 && cur.length) {
        const cx = cur.reduce((a, p) => a + p.x, 0) / cur.length, cz = cur.reduce((a, p) => a + p.z, 0) / cur.length;
        const r = Math.max(...cur.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 1.0;
        T.pools.push({ x: cx, z: cz, r, level: waterAt(k0) });
      }
      cur = [];
    };
    for (const p of S) {
      const k = Math.min(Math.floor(p.F + CLIFF / 2), LEVELS - 1);
      if (k < k0) {
        flush();
        T.falls.push({ x: p.x, z: p.z, rot: Math.atan2(p.dx, p.dz), w: 1.2, top: waterAt(k0), bottom: k === 0 ? -0.12 : waterAt(k) });
        k0 = k;
      }
      cur.push(p);
    }
    flush();
  }
  return T;
}
const HALF = { stairs: [1.1, 1.5], logs: [1.0, 1.5], trail: [1.1, 2.2] }; // 路半宽：内沿、外沿（土路边缘更软）
export function terraceAt(T, x, z) {
  const F = T.F(x, z), Fc = clamp(F, 0, LEVELS - 1);
  let lv = quant(F), pd = 9, sd = 9, chan = 0, m = 0;
  for (const p of T.paths) {
    if (p.kind === 'ladder') continue;
    const d = polyDist(x, z, p.pts), [h0, h1] = HALF[p.kind];
    pd = Math.min(pd, d); m = Math.max(m, smooth(h1, h0, d));
  }
  // 塌方：崖在几处被冲成缓坡，自然连通上下两级（噪声决定位置，溪边不塌）
  if (T.erode) m = Math.max(m, T.erode(x, z));
  if (m > 0) lv += (Fc - lv) * m;
  if (T.stream) { sd = polyDist(x, z, T.stream); if (sd < 0.95) chan = smooth(0.95, 0.5, sd) * (lv < 0.6 ? 1.1 : 0.5); }
  return { lv, F, pd, sd, chan };
}

// 台地块：一座有不规则轮廓的阶梯小山。lv 级，半径 r，sx/sz 拉伸，p>1 顶部宽平、外圈台阶窄，wob 轮廓起伏
const blob = (o) => (x, z) => {
  const dx = (x - o.x) / (o.sx || 1), dz = (z - o.z) / (o.sz || 1);
  const d = Math.hypot(dx, dz) + (vnoise(x * 0.3 + o.seed, z * 0.3, o.seed) - 0.5) * (o.wob ?? 3);
  return o.lv * (1 - Math.pow(clamp(d / o.r, 0, 1), o.p ?? 1));
};
const hills = (list) => { const fs = list.map(blob); return (x, z) => Math.max(...fs.map((f) => f(x, z))); };

// 青竹村：村子在平地上；北面一座四级后山（瀑布从山顶一级级跌进荷塘），东北一道两级山脊，
// 西边一级矮台（木梯），东南一座两级小丘（木桩台阶）
const M_T = makeTerrace({
  F: hills([
    { x: -1, z: -19, r: 13, lv: 4, sx: 1.6, p: 1.3, seed: 41 },
    { x: 13, z: -12, r: 7, lv: 2, p: 1.2, seed: 42 },
    { x: -19, z: -4, r: 7, lv: 1, sx: 0.8, sz: 1.4, wob: 2, seed: 43 },
    { x: 15, z: 15, r: 5.5, lv: 2, p: 1.8, wob: 2, seed: 44 },
  ]),
  paths: [
    { kind: 'stairs', pts: [[1, -4], [-0.5, -10]] },                         // 村口石阶上后山
    { kind: 'trail', pts: [[-0.5, -10], [-6.5, -11.5], [-3.5, -14.5], [-8, -17]] }, // 之字形土路继续往上
    { kind: 'ladder', pts: [[-11.5, -3], [-16, -3.5]] },                       // 西边矮台的木梯
    { kind: 'logs', pts: [[11, 11.5], [14.5, 14.5]] },                         // 东南小丘
  ],
  erode: (x, z) => smooth(0.7, 0.76, fbm(x * 0.09 + 3, z * 0.09, 44, 2)) * smooth(2.5, 4, Math.hypot(x - 8, z + 9)),
  stream: [[2, -21], [5.5, -14.5], [8.5, -8], [10, 4]],
});
// 赤枫林：西北一座三级大山（溪水跌进池塘），东边两级缓丘（之字土路），西南一座五级叠石塔（木梯）
const A_T = makeTerrace({
  F: hills([
    { x: -9, z: -15, r: 11, lv: 3, sx: 1.25, p: 1.2, seed: 51 },
    { x: 12, z: -8, r: 9, lv: 2, p: 1.6, seed: 52 },
    { x: -17, z: 3, r: 4.4, lv: 5, p: 0.8, wob: 0.8, seed: 53 },
  ]),
  paths: [
    { kind: 'stairs', pts: [[-2, -1], [-4.5, -12]] },
    { kind: 'trail', pts: [[4, 1], [9.5, -2.5], [5.5, -6], [11, -9.5]] },
    { kind: 'logs', pts: [[-13, -2], [-12, -10]] },
    { kind: 'ladder', pts: [[-11.5, 3], [-17, 3]] },
  ],
  erode: (x, z) => smooth(0.7, 0.76, fbm(x * 0.09 + 7, z * 0.09, 45, 2)) * smooth(3, 5, Math.hypot(x - 12, z + 8)),
  stream: [[-9, -18], [-8, -10], [-7, -4], [-7, 5]],
});

export const BIOMES = [
  // ================================================================ 春野
  {
    id: 'meadow', name: '青竹村', sub: '新手村 · 四级后山 · 石阶 / 之字土路 / 木梯 / 木桩台阶 · 梯级瀑布', gdd: true,
    terrace: { rock: '#9a948a', pools: M_T.pools, falls: M_T.falls, ladders: M_T.ladders, stream: M_T.stream },
    terrain(x, z) {
      const t = terraceAt(M_T, x, z);
      const pond = Math.hypot(x - 10, z - 7) - 3.6 - (vnoise(x * 0.5, z * 0.5, 2) - 0.5) * 1.4;
      let h = (n2(x, z, 1, 0.08) - 0.5) * 0.2 + LH * t.lv - t.chan;
      if (pond < 0) h = Math.max(-1.2, pond * 0.45);
      const path = Math.min(wavyPath(x, z, 3, 0.15, 1), t.pd - 0.2);
      const farm = x > -14 && x < -4 && z > 3 && z < 11;
      return { h: farm ? 0.02 : h, k: pond < 0.6 || t.sd < 0.95 ? 'sand' : farm ? 'till' : path < 1.2 ? 'dirt' : 'grass', path, lv: t.lv };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 1);
      if (t.k === 'dirt') return mix([218, 172, 108], [190, 140, 84], vnoise(x * 1.2, z * 1.2, 4) * 0.7 + n * 0.2);
      if (t.k === 'sand') return mix([226, 204, 146], [200, 176, 120], n * 0.5);
      if (t.k === 'till') return ((Math.floor(z * 2.4) & 1) ? [110, 76, 50] : [128, 88, 58]).map((v) => v * (0.94 + n * 0.1));
      const c = grassy([118, 188, 66], [88, 158, 50], [170, 208, 80], x, z, 1);
      return mix(c, [210, 180, 110], smooth(2.4, 1.2, t.path) * 0.5);
    },
    water: { level: -0.12, mode: 'water', shallow: '#6ad0d8', deep: '#2a7ab8', foam: '#f0fbff' },
    light: { sun: '#fff0d8', sunI: 2.8, sky: '#d8ecff', ground: '#9a8a50', hemiI: 1.1, fog: '#cfe6f0', top: '#7ab8ec', bottom: '#d8eef4', exposure: 1.12, bloom: 0.45 },
    particles: [{ type: 'petals', n: 120, color: '#ffc0d8', size: 5 }, { type: 'fireflies', n: 40, color: '#e8ff9a', size: 6, night: true }],
    scatter: [
      { id: 'stairs', n: 8, list: M_T.placed.stairs, base: 'bottom' },
      { id: 'logSteps', n: 8, list: M_T.placed.logs, base: 'bottom' },
      { id: 'ladder', n: 8, list: M_T.placed.ladder },
      { id: 'crop', grid: [-12.4, 4.6, 2, 5, 4] },
      { id: 'fence', n: 6, list: [[-9, 2.5, 0], [-6.5, 2.5, 0], [-11.5, 2.5, 0], [-14.6, 5.2, Math.PI / 2], [-14.6, 8.2, Math.PI / 2], [-9, 11.6, 0]] },
      { id: 'scarecrow', n: 1, list: [[-2.6, 7.2, -0.5]] },
      { id: 'well', n: 1, list: [[-2, -3, 0.4]] },
      { id: 'tree', n: 14, k: ['grass'], r: [9, 22], s: [0.9, 1.3], gap: 3 },
      { id: 'fruitTree', n: 4, k: ['grass'], r: [4, 14], s: [0.9, 1.1], gap: 3 },
      { id: 'peach', n: 4, k: ['grass'], r: [6, 20], s: [0.9, 1.2], gap: 3 },
      { id: 'bush', n: 18, k: ['grass'], s: [0.7, 1.3], gap: 1.2 },
      { id: 'berryBush', n: 6, k: ['grass'], s: [0.8, 1.1], gap: 1.2 },
      { id: 'rock', n: 14, k: ['grass', 'sand'], s: [0.4, 1.2], gap: 1 },
      { id: 'stump', n: 4, k: ['grass'], s: [0.8, 1.1], gap: 1.5 },
      { id: 'mushroom', n: 10, k: ['grass'], s: [0.8, 1.4], gap: 0.4, near: 'tree' },
      { id: 'flower', n: 70, k: ['grass'], s: [0.8, 1.3], gap: 0.5 },
      { id: 'grass', n: 260, k: ['grass'], s: [0.7, 1.4], gap: 0.25 },
      { id: 'reeds', n: 8, k: ['sand'], s: [0.7, 1], gap: 0.5 },
      { id: 'vein', n: 3, k: ['grass'], r: [14, 22], pick: [0], s: [0.8, 1.1], gap: 2 },
      { id: 'lily', n: 5, water: true, s: [0.8, 1.2], gap: 1 },
    ],
    catalog: ['tree', 'fruitTree', 'peach', 'bush', 'berryBush', 'rock', 'flower', 'grass', 'mushroom', 'stump', 'fence', 'crop', 'scarecrow', 'well', 'vein'],
  },
  // ================================================================ 竹林村落
  {
    id: 'bamboo', name: '竹海', sub: '东北扇区 · 副矿 青铜 · 石灯笼 · 小溪拱桥', gdd: true,
    terrain(x, z) {
      const sx = Math.sin(z * 0.2) * 2.5 + 3;
      const stream = Math.abs(x - sx) - 1.6 - (vnoise(z * 0.4, 1, 3) - 0.5);
      let h = (n2(x, z, 2, 0.1) - 0.5) * 0.7 + smooth(12, 24, Math.hypot(x, z)) * 1.6;
      if (stream < 0) h = Math.max(-0.9, stream * 0.6);
      const path = Math.abs(z - 1 - Math.sin(x * 0.25) * 1.2);
      return { h, k: stream < 0.5 ? 'pebble' : path < 1.0 ? 'stone' : 'grass', path };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 2);
      if (t.k === 'pebble') return mix([170, 160, 140], [130, 124, 110], vnoise(x * 3, z * 3, 6));
      if (t.k === 'stone') {
        const cx = Math.floor(x * 1.4), v = 0.86 + vnoise(cx, Math.floor(z * 1.4), 3) * 0.2, fx = x * 1.4 - cx;
        return [196 * v, 192 * v, 182 * v].map((c) => c * (fx < 0.1 ? 0.8 : 1));
      }
      const c = grassy([96, 168, 64], [70, 138, 52], [140, 190, 74], x, z, 2);
      return mix(c, [120, 140, 70], vnoise(x * 0.8, z * 0.8, 9) * 0.3 * n);
    },
    water: { level: -0.15, mode: 'water', shallow: '#7ad8c8', deep: '#2a8aa0', foam: '#f0fffa', flow: [0, 1] },
    light: { sun: '#fff4e0', sunI: 2.4, sky: '#d0e8e0', ground: '#6a7a40', hemiI: 1.15, fog: '#c8e0d8', top: '#88c0d8', bottom: '#d8ece4', exposure: 1.1, bloom: 0.5 },
    particles: [{ type: 'leaves', n: 80, color: '#8ac04a', size: 5 }, { type: 'motes', n: 60, color: '#fff8c0', size: 3 }],
    scatter: [
      { id: 'bridge', n: 1, list: [[3, 1, -0.15]], y: 0 },
      { id: 'stoneLan', n: 6, list: [[-6, 2.6, 0], [-12, -0.4, 0.5], [10, 3, 0.2], [16, 0.6, 0], [-1, -1.2, 0], [7.5, -1.2, 0]] },
      { id: 'lanPost', n: 3, list: [[-16, 3.2, 0], [13, -1.4, 3.1], [-3, 3, 0]] },
      { id: 'sign', n: 1, list: [[-9, 2.8, 0.3]] },
      { id: 'barrel', n: 4, list: [[11, -4, 0], [11.8, -3.2, 0.4], [-14, -3, 0], [-13.3, -3.9, 1]] },
      { id: 'crate', n: 3, list: [[12.5, -4.5, 0.3], [-15, -4.4, 0.1], [8.5, 5.5, 0.6]] },
      { id: 'jar', n: 5, list: [[-12, -4.2, 0], [-11.6, -3.4, 0], [9.6, 5.4, 0], [10.2, 6, 0], [13, -3.5, 0]] },
      { id: 'steps', n: 2, list: [[-18, 1, 0.2], [17, -0.5, 0.1]] },
      { id: 'bamboo', n: 34, k: ['grass'], r: [6, 22], s: [0.9, 1.4], gap: 2.2 },
      { id: 'rock', n: 10, k: ['grass', 'pebble'], s: [0.4, 0.9], gap: 1 },
      { id: 'bush', n: 10, k: ['grass'], s: [0.7, 1.1], gap: 1 },
      { id: 'fence', n: 3, list: [[-6, -3.5, 0.1], [-8.4, -3.6, -0.05], [14, 4, 0.3]], pick: [1, 1, 1] },
      { id: 'flower', n: 30, k: ['grass'], s: [0.8, 1.2], gap: 0.5 },
      { id: 'grass', n: 220, k: ['grass'], s: [0.8, 1.5], gap: 0.25 },
      { id: 'reeds', n: 10, k: ['pebble'], s: [0.6, 0.9], gap: 0.6 },
      { id: 'mushroom', n: 8, k: ['grass'], s: [0.8, 1.2], gap: 0.4, near: 'bamboo' },
      { id: 'vein', n: 4, k: ['grass'], r: [12, 22], pick: [2], s: [0.8, 1.1], gap: 2 },
    ],
    catalog: ['bamboo', 'stoneLan', 'lanPost', 'barrel', 'crate', 'jar', 'sign', 'steps', 'bridge', 'fence'],
  },
  // ================================================================ 湖畔沙滩
  {
    id: 'lake', name: '碧水湖畔', sub: '参考图场景（world_map 未列出）· 沙滩 · 椰林 · 码头',
    terrain(x, z) {
      const shore = z + 2 + Math.sin(x * 0.25) * 2.5 + (vnoise(x * 0.3, 0, 4) - 0.5) * 2;
      let h = shore > 0 ? -Math.min(1.4, shore * 0.22) : (n2(x, z, 3, 0.1) - 0.5) * 0.4 + smooth(-2, -12, shore) * 0.6 + smooth(16, 24, Math.hypot(x, z)) * 1;
      const isle = Math.hypot(x - 8, z - 11) - 2.4;
      if (isle < 0) h = Math.max(h, -isle * 0.3 - 0.05);
      const k = isle < 0.6 ? 'sand' : shore > -2.8 ? 'sand' : shore > -4.5 ? 'sandgrass' : 'grass';
      return { h, k };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 3);
      if (t.k === 'sand') return mix([238, 216, 160], [214, 190, 136], vnoise(x * 1.5, z * 1.5, 5) * 0.6 + n * 0.2);
      const g = grassy([128, 190, 70], [96, 160, 56], [176, 210, 90], x, z, 3);
      if (t.k === 'sandgrass') return mix(g, [230, 210, 150], 0.45 + n * 0.3);
      return g;
    },
    water: { level: -0.1, mode: 'water', shallow: '#5ae0e0', deep: '#1a78c0', foam: '#ffffff', waves: true },
    light: { sun: '#fff4e0', sunI: 3.0, sky: '#d8f0ff', ground: '#c8b070', hemiI: 1.15, fog: '#c8eaf8', top: '#5aa8f0', bottom: '#d0f0fa', exposure: 1.14, bloom: 0.5 },
    particles: [{ type: 'motes', n: 50, color: '#ffffff', size: 3 }],
    scatter: [
      { id: 'dock', n: 1, list: [[-6, 3.5, 0.15]] },
      { id: 'palm', n: 9, k: ['sand', 'sandgrass'], s: [0.85, 1.15], gap: 3 },
      { id: 'tree', n: 6, k: ['grass'], r: [10, 22], s: [0.9, 1.2], gap: 3 },
      { id: 'beachRock', n: 14, k: ['sand'], s: [0.4, 1.3], gap: 1.2 },
      { id: 'beachRock', n: 5, water: true, s: [0.8, 1.6], gap: 2 },
      { id: 'shell', n: 14, k: ['sand'], s: [1, 1.4], gap: 0.8 },
      { id: 'driftwood', n: 4, k: ['sand'], s: [0.8, 1.1], gap: 2 },
      { id: 'duneGrass', n: 50, k: ['sand', 'sandgrass'], s: [0.7, 1.2], gap: 0.5 },
      { id: 'reeds', n: 12, k: ['sandgrass'], s: [0.7, 1], gap: 0.6 },
      { id: 'lily', n: 14, water: true, s: [0.8, 1.3], gap: 1.2 },
      { id: 'bush', n: 8, k: ['grass'], s: [0.7, 1.1], gap: 1 },
      { id: 'grass', n: 140, k: ['grass'], s: [0.8, 1.3], gap: 0.25 },
      { id: 'flower', n: 20, k: ['grass'], s: [0.8, 1.2], gap: 0.5 },
    ],
    catalog: ['palm', 'reeds', 'lily', 'shell', 'beachRock', 'driftwood', 'dock', 'duneGrass'],
  },
  // ================================================================ 赤枫林
  {
    id: 'autumn', name: '赤枫林', sub: '赤枫狼王领地 · 三级山 · 五级叠石塔（木梯）· 之字土路 · 瀑布', gdd: true,
    terrace: { rock: '#a08a70', pools: A_T.pools, falls: A_T.falls, ladders: A_T.ladders, stream: A_T.stream },
    terrain(x, z) {
      const t = terraceAt(A_T, x, z);
      let h = (n2(x, z, 4, 0.08) - 0.5) * 0.25 + LH * t.lv - t.chan;
      const pond = Math.hypot(x + 7, z - 6.5) - 2.8 - (vnoise(x * 0.6, z * 0.6, 7) - 0.5) * 1.2;
      if (pond < 0) h = Math.max(-1, pond * 0.45 - 0.2);
      const path = Math.min(wavyPath(z, x, 2.5, 0.2, 2), t.pd - 0.2);
      return { h, k: pond < 0.4 || t.sd < 0.95 ? 'mud' : path < 1.1 ? 'dirt' : 'grass', path, lv: t.lv };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 4);
      if (t.k === 'dirt') return mix([200, 150, 96], [170, 120, 76], vnoise(x * 1.2, z * 1.2, 4) * 0.7);
      if (t.k === 'mud') return mix([140, 110, 80], [110, 86, 64], n);
      let c = grassy([138, 150, 70], [112, 124, 56], [180, 170, 84], x, z, 4);
      // 落叶：树下更密的小碎点
      const dens = n2(x, z, 13, 0.2), lf = vnoise(x * 7.5, z * 7.5, 12);
      if (lf > 0.86 - dens * 0.25) c = mix(c, [226, 110, 50], 0.85);
      else if (lf < 0.06 + dens * 0.12) c = mix(c, [240, 184, 64], 0.8);
      return c;
    },
    water: { level: -0.1, mode: 'water', shallow: '#7ac8c0', deep: '#2a6a8a', foam: '#fff8e8' },
    light: { sun: '#ffd49a', sunI: 2.6, sky: '#f0dcc0', ground: '#8a6a40', hemiI: 1.0, fog: '#ecd8b8', top: '#e8b88a', bottom: '#f4e4cc', exposure: 1.1, bloom: 0.5, warm: 1.4 },
    particles: [{ type: 'leaves', n: 160, color: '#f08a3a', size: 6 }, { type: 'leaves', n: 60, color: '#ffc84a', size: 5 }],
    scatter: [
      { id: 'maple', n: 16, k: ['grass'], r: [5, 22], s: [0.9, 1.3], gap: 3 },
      { id: 'ginkgo', n: 5, k: ['grass'], r: [5, 22], s: [0.9, 1.2], gap: 3 },
      { id: 'autumnBush', n: 16, k: ['grass'], s: [0.7, 1.2], gap: 1.2 },
      { id: 'leafPile', n: 14, k: ['grass', 'dirt'], s: [0.8, 1.5], gap: 1 },
      { id: 'stairs', n: 8, list: A_T.placed.stairs, base: 'bottom' },
      { id: 'logSteps', n: 8, list: A_T.placed.logs, base: 'bottom' },
      { id: 'ladder', n: 8, list: A_T.placed.ladder },
      { id: 'pumpkin', n: 12, zone: (x, z) => x > 5 && x < 13 && z > 6 && z < 12, s: [0.8, 1.3], gap: 0.9 },
      { id: 'fence', n: 3, list: [[9, 5.2, 0], [4.2, 8.5, Math.PI / 2], [13.8, 8.5, Math.PI / 2]] },
      { id: 'scarecrow', n: 1, list: [[9, 9, -0.4]], pick: [1] },
      { id: 'mossRock', n: 12, k: ['grass', 'mud'], s: [0.4, 1.2], gap: 1 },
      { id: 'stump', n: 5, k: ['grass'], s: [0.8, 1.1], gap: 1.5 },
      { id: 'mushroom', n: 12, k: ['grass'], s: [0.8, 1.3], gap: 0.4, near: 'maple' },
      { id: 'autumnGrass', n: 200, k: ['grass'], s: [0.8, 1.3], gap: 0.25 },
      { id: 'reeds', n: 6, k: ['mud'], s: [0.6, 0.9], gap: 0.6 },
    ],
    catalog: ['maple', 'ginkgo', 'autumnBush', 'leafPile', 'pumpkin', 'mossRock', 'autumnGrass'],
  },
  // ================================================================ 雪原
  {
    id: 'winter', name: '雪峰', sub: '北扇区 · 副矿 寒玉 · 雪松 · 冰湖 · 冰晶', gdd: true,
    terrain(x, z) {
      const lake = Math.hypot(x - 3, z - 2) - 5.5 - (vnoise(x * 0.4, z * 0.4, 8) - 0.5) * 2.4;
      let h = (n2(x, z, 5, 0.08) - 0.5) * 0.7 + smooth(12, 24, Math.hypot(x, z)) * 1.8;
      if (lake < 0) h = Math.max(-0.8, lake * 0.3);
      const path = wavyPath(x, z + 9, 2, 0.2);
      return { h, k: lake < 0.5 ? 'shore' : path < 0.9 ? 'trail' : 'snow', path };
    },
    color(x, z, t) {
      const n = vnoise(x * 5, z * 5, 6), m = n2(x, z, 6, 0.15);
      if (t.k === 'trail') return mix([210, 214, 226], [176, 170, 170], vnoise(x * 2, z * 2, 2) * 0.6);
      if (t.k === 'shore') return mix([200, 214, 232], [150, 160, 176], n * 0.5);
      return mix([240, 246, 255], [200, 214, 238], smooth(0.4, 0.75, m) * 0.8 + n * 0.1);
    },
    water: { level: -0.08, mode: 'ice', shallow: '#c8f0ff', deep: '#5aa0d8', foam: '#ffffff' },
    light: { sun: '#f0f4ff', sunI: 2.2, sky: '#d8e8ff', ground: '#a0b0c8', hemiI: 1.25, fog: '#dce8f4', top: '#9ab8e0', bottom: '#e8f0fa', exposure: 1.0, bloom: 0.55, warm: 0 },
    particles: [{ type: 'snow', n: 700, color: '#ffffff', size: 4 }],
    scatter: [
      { id: 'snowman', n: 2, list: [[-4, 5, 0.4], [11, -6, -0.6]] },
      { id: 'snowPine', n: 26, k: ['snow'], r: [7, 23], s: [0.8, 1.3], gap: 2.6 },
      { id: 'pineTree', n: 4, k: ['snow'], r: [14, 23], s: [0.9, 1.2], gap: 2.6 },
      { id: 'snowRock', n: 14, k: ['snow', 'shore'], s: [0.5, 1.3], gap: 1.2 },
      { id: 'drift', n: 16, k: ['snow'], s: [0.8, 1.6], gap: 1.5 },
      { id: 'ice', n: 6, k: ['shore', 'snow'], s: [0.7, 1.2], gap: 2 },
      { id: 'bareBush', n: 8, k: ['snow'], s: [0.4, 0.6], gap: 1.5 },
      { id: 'vein', n: 5, k: ['snow'], pick: [1], s: [0.8, 1.2], gap: 2 },
      { id: 'stoneLan', n: 2, list: [[-8, -8, 0.3], [-1, -9.4, 0]], pick: [1, 1] },
    ],
    catalog: ['snowPine', 'pineTree', 'snowRock', 'drift', 'ice', 'snowman', 'bareBush'],
  },
  // ================================================================ 矿洞
  {
    id: 'cave', name: '玄晶矿洞', sub: '唯一地点 · 灯火机制 · 灵晶 · 矿车 · 石笋', gdd: true,
    terrain(x, z) {
      const r = Math.hypot(x, z), wall = smooth(15, 21, r + (vnoise(Math.atan2(z, x) * 3, 0, 9) - 0.5) * 5);
      const pool = Math.hypot(x + 6, z + 5) - 2.6 - (vnoise(x * 0.6, z * 0.6, 3) - 0.5);
      let h = (n2(x, z, 7, 0.15) - 0.5) * 0.5 + wall * 6;
      if (pool < 0) h = Math.max(-0.7, pool * 0.4);
      const rail = Math.abs(z - 4 - x * 0.15);
      return { h, k: wall > 0.3 ? 'wall' : rail < 0.9 ? 'gravel' : 'rock', wall };
    },
    color(x, z, t) {
      const n = vnoise(x * 5, z * 5, 7);
      if (t.k === 'wall') return mix([96, 86, 108], [66, 60, 78], n);
      if (t.k === 'gravel') return mix([130, 116, 112], [98, 88, 90], vnoise(x * 8, z * 8, 2));
      let c = mix([116, 106, 124], [88, 80, 98], smooth(0.4, 0.7, n2(x, z, 7, 0.3)));
      if (vnoise(x * 2.4, z * 2.4, 11) > 0.8) c = mix(c, [90, 80, 140], 0.6);
      return c;
    },
    water: { level: -0.12, mode: 'water', shallow: '#3ab8d8', deep: '#0a2a58', foam: '#8af0ff', glow: 0.6 },
    light: { sun: '#8a9ad0', sunI: 0.7, sky: '#9a9ad0', ground: '#4a3a5a', hemiI: 1.5, fog: '#0c0a14', top: '#08060c', bottom: '#14101c', exposure: 1.2, bloom: 0.6, fogNear: 30, fogFar: 70, dark: true, warm: 0.5 },
    particles: [{ type: 'motes', n: 160, color: '#9ad8ff', size: 4, glow: true }],
    scatter: [
      { id: 'cart', n: 2, list: [[-3, 3.6, -0.15], [6, 4.9, -0.15]], pick: [0, 1] },
      { id: 'beam', n: 3, list: [[-11, 1, 1.4], [12, 6, -1.3], [2, -12, 0.1]] },
      { id: 'torch', n: 6, list: [[-10.5, -1.5, 0], [11, 3.8, 0], [4, -11.5, 0], [-5, 10, 0], [-0.5, 1.6, 0], [9, -4, 0]] },
      { id: 'crystal', n: 18, k: ['rock'], s: [0.7, 1.5], gap: 2.2 },
      { id: 'crystal', n: 10, k: ['wall'], r: [14, 19], s: [1.0, 2.0], gap: 2.5 },
      { id: 'ore', n: 10, k: ['rock'], s: [0.6, 1.1], gap: 1.5 },
      { id: 'stalag', n: 18, k: ['rock', 'wall'], s: [0.8, 1.6], gap: 1.8 },
      { id: 'caveRock', n: 16, k: ['rock', 'wall'], s: [0.6, 1.8], gap: 1.5 },
      { id: 'glowShroom', n: 18, k: ['rock'], s: [0.8, 1.4], gap: 0.6 },
      { id: 'vein', n: 5, k: ['rock'], pick: [0], s: [0.8, 1.2], gap: 2 },
    ],
    catalog: ['crystal', 'ore', 'stalag', 'cart', 'beam', 'torch', 'glowShroom', 'caveRock'],
  },
  // ================================================================ 仙山
  {
    id: 'xian', name: '仙山', sub: '青竹村北的石峰群 · 迎客松 · 亭台 · 莲池', gdd: true,
    terrain(x, z) {
      const pond = Math.hypot(x + 2, z - 6) - 4.5 - Math.sin(Math.atan2(z - 6, x + 2) * 3) * 0.8;
      let h = (n2(x, z, 8, 0.1) - 0.5) * 0.5 + smooth(14, 24, Math.hypot(x, z)) * 1.4;
      if (pond < 0) h = Math.max(-1, pond * 0.35);
      const plaza = Math.hypot(x - 4, z + 4) < 3.6;
      const path = seg(x, z, 4, -4, -2, 2) - 0.6;
      return { h: plaza ? 0.08 : h, k: pond < 0.5 ? 'pebble' : plaza ? 'plaza' : path < 0.5 ? 'stone' : 'grass', path };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 8);
      if (t.k === 'plaza') { const r = Math.hypot(x - 4, z + 4), a = Math.atan2(z + 4, x - 4), ring = Math.floor(r * 1.4), cell = Math.floor(a * (3 + ring * 2) / Math.PI); const v = 0.88 + vnoise(ring, cell, 4) * 0.16; return (r * 1.4 % 1 < 0.08 ? [150, 150, 150] : [214 * v, 208 * v, 196 * v]); }
      if (t.k === 'stone') return mix([200, 196, 184], [170, 166, 156], n);
      if (t.k === 'pebble') return mix([190, 186, 170], [150, 150, 140], vnoise(x * 3, z * 3, 6));
      const c = grassy([110, 196, 96], [80, 164, 80], [176, 224, 120], x, z, 8);
      return mix(c, [120, 200, 170], vnoise(x * 0.3, z * 0.3, 2) * 0.3);
    },
    water: { level: -0.12, mode: 'water', shallow: '#8ae8e0', deep: '#3a9ac0', foam: '#ffffff', glow: 0.15 },
    light: { sun: '#fff4e8', sunI: 2.6, sky: '#e0f0ff', ground: '#88a070', hemiI: 1.2, fog: '#e8f0f4', top: '#a8c8f0', bottom: '#f0f4f8', exposure: 1.12, bloom: 0.7, fogNear: 45, fogFar: 110 },
    particles: [{ type: 'motes', n: 120, color: '#c8fff0', size: 5, glow: true }, { type: 'petals', n: 60, color: '#ffd0e8', size: 5 }],
    scatter: [
      { id: 'pavilion', n: 1, list: [[4, -4, 0.3]] },
      { id: 'incense', n: 1, list: [[4, -0.6, 0]] },
      { id: 'stele', n: 3, list: [[-6, -9, 0.4], [10, -8, -0.5], [-12, 3, 1.2]] },
      { id: 'karst', n: 8, list: [[-15, -12, 0], [-9, -17, 1], [3, -19, 2], [14, -15, 3], [19, -4, 4], [-19, 2, 5], [16, 10, 6], [-14, 14, 7]], pick: [1, 3, 0, 2, 1, 0, 2, 3] },
      { id: 'bonsai', n: 6, k: ['grass'], r: [6, 18], s: [0.9, 1.2], gap: 3 },
      { id: 'peach', n: 5, k: ['grass'], r: [7, 18], s: [0.9, 1.1], gap: 3 },
      { id: 'lotus', n: 7, water: true, s: [1, 1.2], gap: 1.6, float: true },
      { id: 'lily', n: 10, water: true, s: [0.9, 1.3], gap: 1.2 },
      { id: 'herb', n: 16, k: ['grass'], s: [0.9, 1.3], gap: 0.8 },
      { id: 'lingzhi', n: 8, k: ['grass'], s: [1, 1.4], gap: 0.8, near: 'bonsai' },
      { id: 'jade', n: 6, k: ['grass', 'pebble'], s: [0.4, 0.8], gap: 1.2 },
      { id: 'rock', n: 8, k: ['grass', 'pebble'], s: [0.4, 1], gap: 1 },
      { id: 'cloud', n: 8, cloud: true, s: [1.4, 2.6] },
      { id: 'flower', n: 40, k: ['grass'], s: [0.8, 1.2], gap: 0.5 },
      { id: 'grass', n: 200, k: ['grass'], s: [0.8, 1.3], gap: 0.25 },
    ],
    catalog: ['karst', 'bonsai', 'lingzhi', 'herb', 'lotus', 'incense', 'stele', 'pavilion', 'cloud', 'jade'],
  },
  // ================================================================ 赤岩荒原
  {
    id: 'volcano', name: '火山', sub: '南扇区 · 副矿 火铜 · 熔岩 · 黑曜石 · 地火', gdd: true,
    terrain(x, z) {
      const lava = Math.min(Math.hypot(x - 6, z + 4) - 3.5, seg(x, z, 6, -4, -10, 10) - 1.1) - (vnoise(x * 0.5, z * 0.5, 2) - 0.5) * 1.2;
      let h = (n2(x, z, 9, 0.1) - 0.5) * 0.7 + smooth(13, 24, Math.hypot(x, z)) * 2.2;
      if (lava < 0) h = Math.max(-0.9, lava * 0.9 - 0.15);
      return { h, k: lava < 0.6 ? 'crust' : n2(x, z, 9, 0.07) > 0.55 ? 'red' : 'ash', lava };
    },
    color(x, z, t) {
      const n = vnoise(x * 5, z * 5, 9);
      if (t.k === 'crust') return mix([40, 30, 34], [70, 40, 34], n);
      if (t.k === 'red') return mix([176, 104, 74], [140, 80, 60], vnoise(x * 1.4, z * 1.4, 5) * 0.7 + n * 0.2);
      return mix([104, 94, 92], [76, 68, 70], smooth(0.4, 0.7, n2(x, z, 9, 0.3)));
    },
    water: { level: -0.1, mode: 'lava', shallow: '#ffb02a', deep: '#e83a10', foam: '#ffe890' },
    light: { sun: '#ffd0b0', sunI: 2.2, sky: '#d8b0a0', ground: '#4a3030', hemiI: 0.9, fog: '#7a5a58', top: '#3a2430', bottom: '#a0705a', exposure: 1.05, bloom: 0.7, fogNear: 34, fogFar: 85, warm: 0.8 },
    particles: [{ type: 'embers', n: 180, color: '#ff8a3a', size: 4, glow: true }, { type: 'ash', n: 120, color: '#5a4a48', size: 3 }],
    scatter: [
      { id: 'vent', n: 4, k: ['ash', 'red'], s: [0.9, 1.2], gap: 4 },
      { id: 'lavaRock', n: 18, k: ['crust', 'ash'], s: [0.5, 1.5], gap: 1.4 },
      { id: 'redRock', n: 16, k: ['red', 'ash'], s: [0.6, 2.0], gap: 1.6 },
      { id: 'obsidian', n: 10, k: ['ash', 'crust'], s: [0.8, 1.4], gap: 2 },
      { id: 'deadTree', n: 10, k: ['ash', 'red'], s: [0.9, 1.3], gap: 3 },
      { id: 'bones', n: 3, k: ['ash', 'red'], s: [0.9, 1.2], gap: 4 },
      { id: 'fireFlower', n: 14, k: ['ash'], s: [0.9, 1.3], gap: 0.8 },
      { id: 'ashGrass', n: 90, k: ['ash', 'red'], s: [0.7, 1.2], gap: 0.4 },
      { id: 'vein', n: 5, k: ['ash', 'red'], pick: [4], s: [0.8, 1.2], gap: 2 },
    ],
    catalog: ['lavaRock', 'redRock', 'obsidian', 'deadTree', 'bones', 'fireFlower', 'vent', 'ashGrass'],
  },
  // ================================================================ 沼泽
  {
    id: 'swamp', name: '沼泽', sub: '东南扇区 · 副矿 毒晶 · 气根树 · 毒菇 · 浑水', gdd: true,
    terrain(x, z) {
      const n = n2(x, z, 21, 0.09), pool = n - 0.43 - (vnoise(x * 0.5, z * 0.5, 3) - 0.5) * 0.12;
      let h = (n2(x, z, 22, 0.15) - 0.5) * 0.3 + smooth(15, 24, Math.hypot(x, z)) * 1.0;
      if (pool < 0) h = Math.max(-0.9, pool * 4 - 0.2);
      return { h, k: pool < 0.035 ? 'mud' : n2(x, z, 23, 0.2) > 0.56 ? 'moss' : 'grass' };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 21);
      if (t.k === 'mud') return mix([92, 80, 56], [70, 62, 46], n);
      if (t.k === 'moss') return mix([100, 134, 54], [78, 110, 44], n);
      return mix(mix([88, 118, 62], [66, 94, 50], smooth(0.4, 0.7, n2(x, z, 24, 0.3))), [110, 100, 70], vnoise(x * 0.7, z * 0.7, 5) * 0.3);
    },
    water: { level: -0.1, mode: 'water', shallow: '#7a8a4a', deep: '#2a3a28', foam: '#c8d0a0' },
    light: { sun: '#e8f0c8', sunI: 1.9, sky: '#b8c8a0', ground: '#4a5030', hemiI: 1.05, fog: '#a8b890', top: '#7a9a80', bottom: '#c0ccaa', exposure: 1.05, bloom: 0.6, fogNear: 26, fogFar: 72, warm: 0.6 },
    particles: [{ type: 'motes', n: 110, color: '#c8ff6a', size: 5, glow: true }, { type: 'fireflies', n: 60, color: '#e8ff9a', size: 6, night: true }],
    scatter: [
      { id: 'swampTree', n: 14, k: ['grass', 'moss'], r: [4, 22], s: [0.9, 1.3], gap: 3.4 },
      { id: 'deadTree', n: 4, k: ['grass', 'moss'], s: [0.8, 1.1], gap: 3 },
      { id: 'stump', n: 5, k: ['grass', 'moss', 'mud'], pick: [1, 2], s: [0.8, 1.1], gap: 1.6 },
      { id: 'bogRock', n: 10, k: ['moss', 'mud'], s: [0.5, 1.2], gap: 1.2 },
      { id: 'vein', n: 5, k: ['moss', 'grass'], pick: [3], s: [0.8, 1.2], gap: 2 },
      { id: 'bogShroom', n: 18, k: ['grass', 'moss'], s: [0.9, 1.4], gap: 0.5, near: 'swampTree' },
      { id: 'bogPlant', n: 22, k: ['mud', 'moss'], s: [0.8, 1.3], gap: 0.7 },
      { id: 'reeds', n: 30, k: ['mud'], s: [0.7, 1.1], gap: 0.6 },
      { id: 'lily', n: 18, water: true, s: [0.8, 1.2], gap: 1.1 },
      { id: 'swampGrass', n: 170, k: ['grass', 'moss'], s: [0.8, 1.3], gap: 0.25 },
    ],
    catalog: ['swampTree', 'bogPlant', 'bogShroom', 'bogRock', 'swampGrass', 'reeds', 'lily', 'vein'],
  },
  // ================================================================ 沙漠遗迹
  {
    id: 'desert', name: '沙漠遗迹', sub: '西南扇区 · 副矿 沙金 · 石柱 · 残墙 · 石像 · 绿洲', gdd: true,
    terrain(x, z) {
      const plaza = Math.hypot(x + 3, z + 3) - 6.5 - (vnoise(x * 0.4, z * 0.4, 7) - 0.5) * 2;
      const oasis = Math.hypot(x - 10, z - 9) - 3.2 - (vnoise(x * 0.6, z * 0.6, 2) - 0.5) * 1.2;
      const dune = (Math.sin(x * 0.32 + Math.sin(z * 0.18) * 2.2) * 0.5 + 0.5) * 0.9 + (n2(x, z, 31, 0.1) - 0.5) * 0.4;
      let h = dune * smooth(-1, 4, plaza) * smooth(0, 3, oasis) + smooth(15, 24, Math.hypot(x, z)) * 1.2;
      if (oasis < 0) h = Math.max(-0.9, oasis * 0.45 - 0.25);
      return { h, k: oasis < 1.6 ? 'oasis' : plaza < 0 ? 'tiles' : 'sand' };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 31), rip = Math.sin(x * 2.6 + z * 1.1 + vnoise(x * 0.5, z * 0.5, 4) * 4) * 0.5 + 0.5;
      const sand = mix([236, 204, 144], [214, 178, 118], rip * 0.55 + n * 0.2);
      if (t.k === 'oasis') return mix([118, 170, 70], [214, 196, 130], smooth(0.4, 1.6, Math.hypot(x - 10, z - 9) - 3.2) * 0.8);
      if (t.k === 'tiles') {
        const cx = Math.floor(x * 0.9), cz = Math.floor(z * 0.9), fx = x * 0.9 - cx, fz = z * 0.9 - cz, v = 0.86 + vnoise(cx, cz, 3) * 0.18;
        const tile = fx < 0.07 || fz < 0.07 ? [150, 126, 92] : [206 * v, 180 * v, 134 * v];
        return mix(tile, sand, smooth(0.45, 0.7, n2(x, z, 32, 0.25)));
      }
      return sand;
    },
    water: { level: -0.1, mode: 'water', shallow: '#5ad0c0', deep: '#1a7a90', foam: '#ffffff' },
    light: { sun: '#fff0d0', sunI: 3.0, sky: '#f0e0c0', ground: '#c8a070', hemiI: 1.1, fog: '#f0dcb8', top: '#6aa8e8', bottom: '#f4e4c8', exposure: 1.08, bloom: 0.45, warm: 1.2, fogNear: 50, fogFar: 120 },
    particles: [{ type: 'ash', n: 160, color: '#e8d0a0', size: 3 }],
    scatter: [
      { id: 'pillar', n: 8, list: [[-8, -6, 0], [-8, 0, 0], [2, -6, 0.2], [2, 0, 0], [-3, -9.5, 0.3], [-10.5, -3, 1.2], [4.5, -3, 0.6], [-3, 3.6, 0]], pick: [0, 1, 0, 1, 3, 2, 2, 0] },
      { id: 'ruinWall', n: 3, list: [[-3, -10.8, 0], [-11.5, 2, 1.2], [5, 3.5, -0.6]], pick: [0, 1, 1] },
      { id: 'ruinWall', n: 1, list: [[-3, -3, 0]], pick: [2] },
      { id: 'statue', n: 2, list: [[9, -8, -0.5], [-14, -10, 0.8]] },
      { id: 'jar', n: 4, list: [[-6.5, -1.5, 0], [-6, -2.2, 0], [0.5, -7.5, 0], [-1.5, 1, 0]] },
      { id: 'palm', n: 5, k: ['oasis'], s: [0.85, 1.1], gap: 2.6 },
      { id: 'reeds', n: 8, k: ['oasis'], s: [0.6, 0.9], gap: 0.6 },
      { id: 'cactus', n: 16, k: ['sand'], r: [7, 22], s: [0.8, 1.3], gap: 2 },
      { id: 'sandRock', n: 14, k: ['sand'], s: [0.5, 1.8], gap: 1.6 },
      { id: 'vein', n: 5, k: ['sand'], pick: [5], s: [0.8, 1.2], gap: 2 },
      { id: 'bones', n: 2, k: ['sand'], s: [0.9, 1.2], gap: 4 },
      { id: 'dryShrub', n: 8, k: ['sand'], s: [0.35, 0.55], gap: 1.6 },
      { id: 'desertGrass', n: 70, k: ['sand', 'oasis'], s: [0.7, 1.2], gap: 0.5 },
    ],
    catalog: ['pillar', 'ruinWall', 'statue', 'cactus', 'sandRock', 'dryShrub', 'desertGrass', 'jar', 'vein'],
  },
  // ================================================================ 古战场
  {
    id: 'battlefield', name: '古战场', sub: '西北扇区 · 副矿 阴魂石 · 残剑 · 残旗 · 坟冢 · 鬼火', gdd: true,
    terrain(x, z) {
      let h = (n2(x, z, 41, 0.1) - 0.5) * 0.6 + smooth(14, 24, Math.hypot(x, z)) * 1.3;
      const trench = Math.abs(z - 4 - Math.sin(x * 0.3) * 2) - 0.9;
      if (trench < 0) h += trench * 0.22; // 浅壕沟，不积水
      let crater = 9;
      for (const [cx, cz, cr] of [[-8, -6, 2.2], [7, -9, 2.8], [10, 9, 1.8], [-12, 10, 2.4]]) crater = Math.min(crater, Math.hypot(x - cx, z - cz) - cr);
      if (crater < 0) h = Math.min(h, crater * 0.35 - 0.1); else if (crater < 0.8) h += (0.8 - crater) * 0.25;
      const road = Math.abs(x + 2 - Math.sin(z * 0.15) * 3) - 1.0;
      return { h, k: crater < 0.6 || trench < 0.2 ? 'mud' : road < 0 ? 'road' : n2(x, z, 42, 0.18) > 0.58 ? 'grass' : 'dirt' };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 41);
      if (t.k === 'mud') return mix([70, 60, 54], [52, 46, 44], n);
      if (t.k === 'road') return mix([132, 118, 98], [108, 96, 82], vnoise(x * 2, z * 2, 5) * 0.7);
      if (t.k === 'grass') return mix([112, 112, 70], [90, 92, 58], n);
      let c = mix([104, 92, 80], [82, 72, 64], smooth(0.4, 0.7, n2(x, z, 43, 0.3)));
      if (vnoise(x * 1.5, z * 1.5, 44) > 0.78) c = mix(c, [44, 38, 38], 0.7); // 焦痕
      return c;
    },
    water: { level: -0.12, mode: 'water', shallow: '#6a6a5a', deep: '#2a2a2a', foam: '#7a7a6a' },
    light: { sun: '#c8c8d8', sunI: 1.5, sky: '#9aa0b0', ground: '#4a4440', hemiI: 1.15, fog: '#8a8a94', top: '#5a6070', bottom: '#a0a4ac', exposure: 1.05, bloom: 0.65, fogNear: 40, fogFar: 100, warm: 0.3 },
    particles: [{ type: 'motes', n: 90, color: '#8ab0ff', size: 6, glow: true }, { type: 'ash', n: 110, color: '#3a3434', size: 3 }],
    scatter: [
      { id: 'wreck', n: 3, k: ['dirt', 'grass'], pick: [0, 1], s: [0.9, 1.1], gap: 4 },
      { id: 'banner', n: 9, k: ['dirt', 'grass', 'road'], s: [0.9, 1.1], gap: 2.4 },
      { id: 'grave', n: 9, k: ['dirt', 'grass'], s: [0.8, 1.1], gap: 2.4 },
      { id: 'sword', n: 34, k: ['dirt', 'grass', 'mud'], s: [0.8, 1.2], gap: 1.1 },
      { id: 'shield', n: 16, k: ['dirt', 'grass', 'mud'], s: [0.9, 1.2], gap: 1 },
      { id: 'bones', n: 6, k: ['dirt', 'mud'], s: [0.8, 1.1], gap: 3 },
      { id: 'deadTree', n: 9, k: ['dirt', 'grass'], r: [8, 22], s: [0.9, 1.3], gap: 3 },
      { id: 'caveRock', n: 8, k: ['dirt', 'grass'], s: [0.5, 1.2], gap: 1.4 },
      { id: 'vein', n: 5, k: ['dirt', 'grass'], pick: [6], s: [0.8, 1.2], gap: 2 },
      { id: 'ashGrass', n: 130, k: ['grass', 'dirt'], s: [0.8, 1.3], gap: 0.35 },
    ],
    catalog: ['sword', 'banner', 'shield', 'grave', 'wreck', 'bones', 'deadTree', 'vein'],
  },
  // ================================================================ 百花谷
  {
    id: 'flowers', name: '百花谷', sub: '唯一地点 · 花期 / 百花会 · 紫藤 · 花圃 · 晒药架', gdd: true,
    terrain(x, z) {
      const sx = Math.sin(z * 0.17) * 3 - 1;
      const stream = Math.abs(x - sx) - 1.3 - (vnoise(z * 0.4, 2, 6) - 0.5) * 0.6;
      let h = (n2(x, z, 51, 0.1) - 0.5) * 0.4 + smooth(9, 24, Math.hypot(x, z)) * 2.4;
      if (stream < 0) h = Math.max(-0.8, stream * 0.6 - 0.15);
      const path = Math.abs(z + 1 - Math.sin(x * 0.2) * 1.5) - 0.8;
      return { h, k: stream < 0.45 ? 'pebble' : path < 0 ? 'path' : n2(x, z, 52, 0.16) > 0.55 ? 'bloom' : 'grass' };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 51);
      if (t.k === 'pebble') return mix([196, 190, 172], [156, 152, 140], vnoise(x * 3, z * 3, 6));
      if (t.k === 'path') return mix([206, 196, 176], [176, 168, 150], n);
      const c = grassy([116, 196, 90], [86, 166, 74], [170, 220, 110], x, z, 51);
      // 地面花斑：越进花区越密
      const dens = t.k === 'bloom' ? 0.86 : 0.95, f = vnoise(x * 9, z * 9, 53);
      if (f > dens) { const pick = Math.floor(vnoise(x * 2.3, z * 2.3, 54) * 4); return [[255, 170, 200], [255, 250, 245], [255, 220, 90], [190, 160, 250]][pick]; }
      return c;
    },
    water: { level: -0.12, mode: 'water', shallow: '#8ae8e0', deep: '#3a9ac0', foam: '#ffffff' },
    light: { sun: '#fff4e0', sunI: 2.8, sky: '#e8f4ff', ground: '#a0b070', hemiI: 1.2, fog: '#f0f0ec', top: '#a8d0f8', bottom: '#f4f4f0', exposure: 1.12, bloom: 0.55 },
    particles: [{ type: 'petals', n: 160, color: '#ffb8d8', size: 5 }, { type: 'petals', n: 70, color: '#ffffff', size: 4 }, { type: 'motes', n: 40, color: '#fff4b0', size: 4 }],
    scatter: [
      { id: 'pavilion', n: 1, list: [[-9, -6, 0.2]] },
      { id: 'bridge', n: 1, list: [[-1.2, -1.2, 0.12]], y: 0 }, // 桥沿 x 跨，溪沿 z 流
      { id: 'herbRack', n: 2, list: [[-12, 2, 0.3], [-7, 3.4, -0.2]], pick: [0, 1] },
      { id: 'jar', n: 3, list: [[-10, 3.5, 0], [-9.4, 4.1, 0], [-13.4, 0.6, 0]] },
      { id: 'wisteria', n: 6, k: ['grass', 'bloom'], r: [5, 18], s: [0.9, 1.2], gap: 3.4 },
      { id: 'flowerTree', n: 8, k: ['grass', 'bloom'], r: [6, 22], s: [0.9, 1.2], gap: 3 },
      { id: 'peach', n: 3, k: ['grass'], r: [10, 22], s: [0.9, 1.1], gap: 3 },
      { id: 'flowerBed', n: 22, k: ['bloom', 'grass'], s: [0.8, 1.3], gap: 1.6 },
      { id: 'herb', n: 10, k: ['grass', 'bloom'], s: [0.9, 1.2], gap: 0.8 },
      { id: 'flower', n: 130, k: ['bloom', 'grass'], s: [0.8, 1.3], gap: 0.45 },
      { id: 'bush', n: 8, k: ['grass'], s: [0.7, 1.1], gap: 1.2 },
      { id: 'lily', n: 6, water: true, s: [0.7, 1.1], gap: 1 },
      { id: 'reeds', n: 8, k: ['pebble'], s: [0.6, 0.9], gap: 0.6 },
      { id: 'grass', n: 160, k: ['grass', 'bloom'], s: [0.8, 1.3], gap: 0.25 },
    ],
    catalog: ['wisteria', 'flowerTree', 'flowerBed', 'herbRack', 'flower', 'herb'],
  },
  // ================================================================ 天劫峰
  {
    id: 'tribulation', name: '天劫峰', sub: '唯一地点 · 化神 · 渡劫法阵 · 浮空石 · 雷暴 · 仙晶', gdd: true,
    terrain(x, z) {
      const plat = Math.hypot(x, z + 2) - 4.2;
      let h = (n2(x, z, 61, 0.12) - 0.5) * 0.9 + Math.abs(vnoise(x * 0.25, z * 0.25, 62) - 0.5) * 1.2 + smooth(12, 24, Math.hypot(x, z)) * 2.2;
      if (plat < 1.5) h = h * smooth(-0.5, 1.5, plat) + 0.1 * (1 - smooth(-0.5, 1.5, plat));
      const pud = n2(x, z, 63, 0.2) - 0.32;
      if (pud < 0 && plat > 2) h = Math.min(h, pud * 3 - 0.3);
      return { h, k: plat < 0.5 ? 'plaza' : pud < 0.05 && plat > 2 ? 'wet' : n2(x, z, 64, 0.2) > 0.6 ? 'moss' : vnoise(x * 1.2, z * 1.2, 65) > 0.8 ? 'scorch' : 'rock' };
    },
    color(x, z, t) {
      const n = vnoise(x * 6, z * 6, 61);
      if (t.k === 'plaza') return mix([120, 118, 130], [96, 94, 106], n);
      if (t.k === 'wet') return mix([60, 60, 74], [44, 44, 56], n);
      if (t.k === 'moss') return mix([72, 98, 76], [56, 80, 62], n);
      if (t.k === 'scorch') return mix([40, 36, 44], [70, 50, 90], vnoise(x * 5, z * 5, 66) > 0.7 ? 1 : 0);
      return mix([96, 92, 106], [70, 66, 80], smooth(0.4, 0.7, n2(x, z, 67, 0.35)));
    },
    water: { level: -0.1, mode: 'water', shallow: '#5a6a8a', deep: '#22283e', foam: '#6a7a9a' }, // 雨水坑：泡沫色接近水色，不出白圈
    light: { sun: '#a8b0ff', sunI: 0.9, sky: '#7a7aa8', ground: '#2a2834', hemiI: 1.25, fog: '#3a3a52', top: '#14142a', bottom: '#46466a', exposure: 1.15, bloom: 0.8, fogNear: 28, fogFar: 76, warm: 0, fx: 'storm' },
    particles: [{ type: 'rain', n: 1000, color: '#b8c4ff', size: 6 }, { type: 'motes', n: 60, color: '#8ad0ff', size: 5, glow: true }],
    scatter: [
      { id: 'formation', n: 1, list: [[0, -2, 0]], pick: [0] },
      { id: 'stele', n: 3, list: [[-7, -8, 0.5], [7, -7, -0.4], [0, -9.5, 0]], pick: [0, 0, 2] },
      { id: 'floatRock', n: 9, cloud: true, s: [0.8, 1.4] },
      { id: 'stormPine', n: 10, k: ['rock', 'moss'], r: [7, 22], s: [0.9, 1.3], gap: 3 },
      { id: 'bonsai', n: 3, k: ['moss'], r: [8, 22], s: [0.9, 1.1], gap: 3 },
      { id: 'crystal', n: 8, k: ['rock', 'scorch'], pick: [1, 0], s: [0.8, 1.4], gap: 2.2 },
      { id: 'vein', n: 5, k: ['rock', 'moss'], pick: [7], s: [0.8, 1.2], gap: 2 },
      { id: 'caveRock', n: 14, k: ['rock', 'moss', 'scorch'], s: [0.5, 1.6], gap: 1.4 },
      { id: 'ashGrass', n: 70, k: ['moss', 'rock'], s: [0.7, 1.1], gap: 0.4 },
    ],
    catalog: ['formation', 'floatRock', 'stormPine', 'stele', 'crystal', 'vein'],
  },
];

// 按 world_map.json 的顺序排：村子 → 近处 → 各扇区 → 唯一地点，参考图场景放最后
const ORDER = ['meadow', 'xian', 'bamboo', 'autumn', 'cave', 'flowers', 'winter', 'swamp', 'volcano', 'desert', 'battlefield', 'tribulation', 'lake'];
BIOMES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
