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

export const BIOMES = [
  // ================================================================ 春野
  {
    id: 'meadow', name: '春野农庄', sub: '草地 · 果树 · 农田 · 小池塘',
    terrain(x, z) {
      const pond = Math.hypot(x - 9, z + 7) - 4.2 - (vnoise(x * 0.5, z * 0.5, 2) - 0.5) * 1.6;
      let h = (n2(x, z, 1, 0.08) - 0.5) * 0.6 + smooth(14, 24, Math.hypot(x, z)) * 1.2;
      if (pond < 0) h = Math.max(-1.2, pond * 0.4);
      const path = wavyPath(x, z, 3, 0.15, 1);
      const farm = x > -14 && x < -4 && z > 3 && z < 11;
      return { h: farm ? 0.02 : h, k: pond < 0.6 ? 'sand' : farm ? 'till' : path < 1.2 ? 'dirt' : 'grass', path };
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
      { id: 'lily', n: 5, water: true, s: [0.8, 1.2], gap: 1 },
    ],
    catalog: ['tree', 'fruitTree', 'peach', 'bush', 'berryBush', 'rock', 'flower', 'grass', 'mushroom', 'stump', 'fence', 'crop', 'scarecrow', 'well'],
  },
  // ================================================================ 竹林村落
  {
    id: 'bamboo', name: '竹林小径', sub: '竹海 · 石灯笼 · 小溪拱桥 · 杂物',
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
      { id: 'bridge', n: 1, list: [[3, 1, Math.PI / 2 + 0.1]], y: 0 },
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
    ],
    catalog: ['bamboo', 'stoneLan', 'lanPost', 'barrel', 'crate', 'jar', 'sign', 'steps', 'bridge', 'fence'],
  },
  // ================================================================ 湖畔沙滩
  {
    id: 'lake', name: '碧水湖畔', sub: '沙滩 · 椰林 · 码头 · 荷塘',
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
    id: 'autumn', name: '赤枫林', sub: '枫树 · 银杏 · 落叶 · 南瓜地',
    terrain(x, z) {
      const pond = Math.hypot(x + 7, z - 6) - 3.2 - (vnoise(x * 0.6, z * 0.6, 7) - 0.5) * 1.4;
      let h = (n2(x, z, 4, 0.08) - 0.5) * 0.7 + smooth(13, 24, Math.hypot(x, z)) * 1.4;
      if (pond < 0) h = Math.max(-1, pond * 0.4);
      const path = wavyPath(z, x, 2.5, 0.2, 2);
      return { h, k: pond < 0.4 ? 'mud' : path < 1.1 ? 'dirt' : 'grass', path };
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
      { id: 'pumpkin', n: 12, zone: (x, z) => x > 4 && x < 12 && z > 2 && z < 9, s: [0.8, 1.3], gap: 0.9 },
      { id: 'fence', n: 3, list: [[8, 1.3, 0], [3.2, 5.5, Math.PI / 2], [12.8, 5.5, Math.PI / 2]] },
      { id: 'scarecrow', n: 1, list: [[8, 5.6, -0.4]], pick: [1] },
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
    id: 'winter', name: '雪原冰湖', sub: '雪松 · 冰湖 · 冰晶 · 雪人',
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
      { id: 'stoneLan', n: 2, list: [[-8, -8, 0.3], [-1, -9.4, 0]], pick: [1, 1] },
    ],
    catalog: ['snowPine', 'pineTree', 'snowRock', 'drift', 'ice', 'snowman', 'bareBush'],
  },
  // ================================================================ 矿洞
  {
    id: 'cave', name: '玄晶矿洞', sub: '灵晶 · 矿车 · 石笋 · 火把（暗光测试）',
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
    ],
    catalog: ['crystal', 'ore', 'stalag', 'cart', 'beam', 'torch', 'glowShroom', 'caveRock'],
  },
  // ================================================================ 仙山
  {
    id: 'xian', name: '仙山灵境', sub: '石峰 · 迎客松 · 亭台 · 灵草 · 莲池',
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
    id: 'volcano', name: '赤岩荒原', sub: '熔岩 · 黑曜石 · 枯树 · 兽骨',
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
    ],
    catalog: ['lavaRock', 'redRock', 'obsidian', 'deadTree', 'bones', 'fireFlower', 'vent', 'ashGrass'],
  },
];
