import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';

export const TEXTURES = {
  'codex/g2_plants_bark': { norm: 0.88 },
  'codex/g2_plants_foliage': { norm: 0.92 },
};

const TAU = Math.PI * 2;
const greens = ['#64a34b', '#83b64c', '#48966a', '#a0bc54', '#4e8960'];
const pinks = ['#f5aac5', '#ed80aa', '#ffd3ce'];

// All transforms are baked before batching. Texture batches retain per-part tints.
class Plant {
  constructor(seed) { this.k = new Kit(); this.r = mulberry32(seed); this.maps = {}; }
  add(g, c, at = [0, 0, 0], s = [1, 1, 1], rot = [0, 0, 0], map = null, kind = 'solid') {
    if (!map) { this.k.add(g, c, { at, s, rot, kind }); return; }
    let geo = g.index ? g.toNonIndexed() : g.clone();
    grad(c, 0.78, 1.1, 0.035)(geo);
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s)));
    (this.maps[map] ||= []).push(geo);
  }
  ball(at, s, c, map = null) { this.add(G.sph(1, 8, 6), c, at, s, [0, 0, 0], map); }
  stem(points, a = 0.06, b = 0.025, c = '#6a964b', wood = false) {
    this.add(G.tube(points, a, b, 5), c, undefined, undefined, undefined, wood ? 'bark' : null);
  }
  leaf(at, len, wide, angle, c = '#6ca653', droop = 0.8) {
    this.add(G.sph(1, 6, 4).translate(0, 1, 0), c, at, [wide, len / 2, wide * 0.23],
      [droop, angle, 0], null, 'plant');
  }
  crown(at, s, c) { this.ball(at, s, c, 'foliage'); }
  build(light) {
    const out = this.k.build();
    for (const [map, geos] of Object.entries(this.maps)) {
      out.add(texMesh(mergeGeometries(geos), `g2_plants_${map}`, '#ffffff', { vc: true }));
    }
    // Establish an exact ground origin and central footprint without object transforms.
    const box = new THREE.Box3().setFromObject(out);
    const dx = -(box.min.x + box.max.x) / 2, dz = -(box.min.z + box.max.z) / 2;
    for (const mesh of out.children) {
      mesh.geometry.translate(dx, -box.min.y, dz);
      mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    }
    return finish(out, { light });
  }
}

function rosette(p, x, z, size, color, y = 0, count = 6) {
  for (let j = 0; j < count; j++) p.leaf([x, y, z], size * (0.8 + p.r() * 0.35), size * 0.22,
    j * TAU / count, color, 0.65 + p.r() * 0.5);
}

function blossom(p, x, y, z, size, color, petals = 5) {
  // Petals have volume, a cupped profile, and a warm raised pollen centre.
  for (let j = 0; j < petals; j++) {
    const a = j * TAU / petals;
    p.add(G.sph(1, 6, 4), color,
      [x + Math.sin(a) * size * 0.55, y + size * 0.05, z + Math.cos(a) * size * 0.55],
      [size * 0.48, size * 0.2, size * 0.65], [-0.18, a, 0]);
  }
  p.ball([x, y + size * 0.17, z], [size * 0.32, size * 0.23, size * 0.32], '#f6ca64');
}

function orchard(v, type) {
  const p = new Plant(110 + v * 19 + type * 103);
  const h = (type === 0 ? 3 : 2.5) + v * 0.24, spread = 1.2 + v * 0.1;
  const foliage = type === 2 ? pinks[v] : type === 3 ? ['#ceb0ed', '#f3cb73', '#f7adce'][v] : greens[v];
  const wood = type === 2 ? '#985e57' : '#93704a';
  p.add(G.cyl(0.19, 0.4, h, 9), wood, undefined, undefined, undefined, 'bark');
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5 + v * 0.5, x = Math.cos(a), z = Math.sin(a);
    p.stem([[x * 0.65, 0.06, z * 0.65], [x * 0.27, 0.18, z * 0.27], [0, 0.6, 0]], 0.12, 0.16, wood, true);
  }
  const count = type === 0 && v === 4 ? 7 : 5;
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count + v * 0.45;
    const x = Math.cos(a) * spread * 0.7, z = Math.sin(a) * spread * 0.7;
    const y = h - 0.2 + (i % 2) * 0.38;
    p.stem([[0, h * 0.45, 0], [x * 0.55, h * 0.8, z * 0.55], [x, y, z]], 0.15, 0.055, wood, true);
    p.crown([x, y + 0.38, z], [spread * 0.85, 0.72 + v * 0.08, spread * 0.8], foliage);
    if (type === 1) {
      const fruit = ['#ec8053', '#edca51', '#e8778c'][v];
      for (let j = 0; j < 2; j++) {
        const xx = x + Math.cos(a + j) * 0.55, zz = z + Math.sin(a + j) * 0.55;
        p.ball([xx, y - 0.32, zz], [0.19, 0.23, 0.19], fruit);
        p.stem([[xx, y - 0.14, zz], [xx, y + 0.06, zz]], 0.027, 0.02, wood);
      }
    }
    if (type === 2 || type === 3) blossom(p, x, y + 1.08 + v * 0.06, z, 0.21, type === 2 ? '#ffe4de' : '#fff0cb');
  }
  p.crown([0, h + 0.93, 0], [spread, 0.85, spread * 0.9], foliage);
  return p.build();
}

function shrub(v, berries = false) {
  const p = new Plant(400 + v + (berries ? 40 : 0));
  const c = greens[(v + (berries ? 2 : 0)) % greens.length];
  const count = 3 + v;
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.32;
    p.add(G.cyl(0.035, 0.06, 0.5, 5), '#8c7046', [x, 0, z]);
    p.crown([x, 0.42 + (i % 2) * 0.17, z], [0.48, 0.42 + v * 0.05, 0.44], c);
    if (berries) for (let j = 0; j < 3; j++) {
      p.ball([x + Math.cos(a + j * 0.5) * 0.3, 0.71 + j * 0.08, z + Math.sin(a + j * 0.5) * 0.3],
        [0.105, 0.11, 0.105], ['#d65c7d', '#6b76c8', '#edb35b'][v]);
    }
  }
  return p.build();
}

function flowers(v, bed = false) {
  const p = new Plant(620 + v + (bed ? 30 : 0));
  const colors = ['#f5acbf', '#fff0b0', '#a7a0ed', '#f0a55b', '#df6b8d', '#d6f4e9'];
  if (bed) {
    p.add(G.box(1.9 + v * 0.12, 0.16, 1.22), '#71513b', [0, 0.08, 0]);
    for (const z of [-0.67, 0.67]) p.add(G.box(2.08 + v * 0.12, 0.24, 0.14), '#b38c62', [0, 0.12, z], undefined, undefined, 'bark');
    for (const x of [-1 - v * 0.06, 1 + v * 0.06]) p.add(G.box(0.14, 0.24, 1.22), '#b38c62', [x, 0.12, 0], undefined, undefined, 'bark');
  }
  const count = bed ? 6 : 3 + v % 3;
  for (let i = 0; i < count; i++) {
    const x = bed ? (i % 3 - 1) * 0.57 : Math.cos(i * 2.4) * 0.34;
    const z = bed ? (Math.floor(i / 3) - 0.5) * 0.58 : Math.sin(i * 2.4) * 0.34;
    const root = bed ? 0.16 : 0, h = 0.35 + (i % 3) * 0.12 + v * 0.035;
    p.add(G.cyl(0.025, 0.035, h, 5), '#5d964b', [x, root, z]);
    rosette(p, x, z, 0.27, greens[v % 5], root, 3);
    blossom(p, x, root + h, z, 0.2 + (v % 2) * 0.035, colors[v], v === 4 ? 6 : 5);
  }
  return p.build();
}

function grass(v) {
  const p = new Plant(730 + v);
  const count = 9 + v * 2;
  for (let i = 0; i < count; i++) {
    const a = i * 2.4, d = Math.sqrt(p.r()) * (0.35 + v * 0.05);
    p.k.add(G.blade(0.045 + v * 0.012, 0.35 + p.r() * (0.35 + v * 0.1), 0.16),
      greens[v], { at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [0, a, (p.r() - 0.5) * 0.4], kind: 'plant' });
  }
  return p.build();
}

function mushrooms(v, spirit = false) {
  const p = new Plant(810 + v + (spirit ? 30 : 0));
  for (let i = 0; i < 3; i++) {
    const s = i === 0 ? 1 : 0.55 + i * 0.08, x = [0, -0.4, 0.38][i], z = [0, 0.22, 0.25][i];
    const h = (spirit ? 0.64 : 0.48) * s;
    p.add(G.cyl(0.07 * s, 0.11 * s, h, 7), '#efdbb3', [x, 0, z]);
    const cap = spirit ? G.lathe([[0, 0], [0.26, 0], [0.48, 0.07], [0.5, 0.15], [0.35, 0.22], [0, 0.25]], 12)
      : G.lathe([[0, 0], [0.43, 0], [0.46, 0.08], [0.36, 0.27], [0.16, 0.38], [0, 0.4]], 10);
    const col = spirit ? ['#ba6247', '#d69a40', '#a96fbb'][v] : ['#da6a56', '#c99a60', '#a28aca', '#e5b964'][v];
    p.add(cap, col, [x, h - 0.04, z], [s, s * (spirit ? 0.8 : 1 + v * 0.12), s]);
    if (spirit) {
      for (let j = 0; j < 2; j++) p.add(G.tor((0.28 + j * 0.12) * s, 0.018 * s, 3, 14), '#efd69c',
        [x, h + 0.13 * s, z], [1, 1, 1], [Math.PI / 2, 0, 0]);
    } else for (let j = 0; j < 4; j++) {
      const a = j * TAU / 4;
      p.ball([x + Math.cos(a) * 0.24 * s, h + 0.25 * s, z + Math.sin(a) * 0.24 * s], [0.07 * s, 0.025 * s, 0.07 * s], '#ffebcc');
    }
  }
  return p.build();
}

function crops(v) {
  const p = new Plant(930 + v);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 - 0.5) * 0.6, z = (Math.floor(i / 2) - 0.5) * 0.6;
    if (v === 0 || v === 1) {
      rosette(p, x, z, v === 0 ? 0.4 : 0.56, v === 0 ? '#a5c65a' : '#6db57c');
      if (v === 1) p.ball([x, 0.23, z], [0.23, 0.27, 0.23], '#c4d57d');
    } else if (v === 2) {
      p.add(G.lathe([[0, 0], [0.05, 0.08], [0.18, 0.28], [0.13, 0.4], [0, 0.42]], 8), '#f0a758', [x, 0, z]);
      rosette(p, x, z, 0.38, '#66a05d', 0.34, 4);
    } else {
      const h = v === 3 ? 0.85 : 1.15;
      p.add(G.cyl(0.025, 0.04, h, 5), '#8ea34e', [x, 0, z]);
      for (let j = 0; j < 3; j++) p.leaf([x, 0.12 + j * 0.2, z], 0.45, 0.07, j * 2.5, '#87b456', 1.05);
      if (v === 3) {
        for (let j = 0; j < 5; j++) p.ball([x + (j % 2 ? -0.055 : 0.055), h - 0.2 + j * 0.075, z], [0.07, 0.095, 0.07], '#edd17b');
      } else p.ball([x + 0.08, 0.78, z], [0.12, 0.28, 0.12], '#f4cd62');
    }
  }
  return p.build();
}

function bamboo(v) {
  const p = new Plant(1040 + v), count = 3 + v;
  for (let i = 0; i < count; i++) {
    const a = i * 2.4, x = Math.cos(a) * 0.43, z = Math.sin(a) * 0.43;
    const h = 3.7 + p.r() * 1.3 + v * 0.17, radius = 0.095 + (i % 2) * 0.025;
    p.add(uvScale(G.cyl(radius * 0.85, radius, h, 7), 1, 3), ['#7fa958', '#58996c', '#b3bb60', '#519b8b'][v], [x, 0, z], undefined, undefined, 'bark');
    for (let j = 1; j <= 6; j++) {
      const y = j * h / 7;
      p.add(G.cyl(radius * 1.14, radius * 1.14, 0.055, 7), '#c1cd82', [x, y, z]);
      if (j < 3 || j % 2 !== i % 2) continue;
      const xx = x + Math.cos(a + j) * 0.5, zz = z + Math.sin(a + j) * 0.5;
      p.stem([[x, y, z], [xx, y + 0.22, zz]], 0.025, 0.01);
      for (let b = 0; b < 3; b++) p.leaf([xx, y + 0.22, zz], 0.52, 0.065, a + j + b * 1.3, greens[v], 1.3);
    }
  }
  return p.build();
}

function pumpkin(v) {
  const p = new Plant(1150 + v), colors = ['#e69a42', '#bec180', '#d97848'];
  const sy = [0.5, 0.62, 0.38][v], radius = [0.57, 0.48, 0.7][v];
  for (let j = 0; j < 9; j++) {
    const a = j * TAU / 9;
    p.ball([Math.cos(a) * radius * 0.45, sy, Math.sin(a) * radius * 0.45], [radius * 0.62, sy, radius * 0.62], colors[v]);
  }
  p.stem([[0, sy * 1.8, 0], [0.04, sy * 2 + 0.17, 0], [0.17, sy * 2 + 0.25, 0.04]], 0.09, 0.06, '#61774a');
  p.stem([[0.12, 0.06, 0], [0.65, 0.04, 0.2], [0.8, 0.06, 0.5], [0.5, 0.07, 0.58]], 0.025, 0.012);
  rosette(p, 0.6, 0.3, 0.36, '#7c9e4c', 0.04, 3);
  return p.build();
}

function wisteria(v) {
  const p = new Plant(1250 + v), width = 2.4 + v * 0.5;
  // A freestanding living vine arch, with substantial wooden supports.
  for (const x of [-width / 2, width / 2]) {
    p.add(G.cyl(0.1, 0.16, 2.5 + v * 0.25, 7), '#ac865a', [x, 0, 0], undefined, undefined, 'bark');
    p.stem([[x, 0, 0.1], [x + 0.13, 0.7, -0.1], [x - 0.1, 1.5, 0.1], [x, 2.55, 0]], 0.065, 0.035, '#756347', true);
  }
  p.add(G.box(width + 0.45, 0.17, 0.48), '#ac865a', [0, 2.48 + v * 0.25, 0], undefined, undefined, 'bark');
  for (let i = 0; i < 5; i++) {
    const x = (i / 4 - 0.5) * width, top = 2.65 + v * 0.25;
    p.crown([x, top, 0], [0.56, 0.3, 0.57], '#6a9d65');
    for (const z of [-0.34, 0.34]) {
      const length = 0.55 + (i % 3) * 0.15;
      for (let j = 0; j < 4; j++) {
        const s = 1 - j * 0.2;
        p.ball([x, top - 0.18 - j * length / 4, z], [0.19 * s, length * 0.21, 0.16 * s], v ? '#e6acd7' : '#b2a0e6');
      }
    }
  }
  return p.build();
}

function herbRack(v) {
  const p = new Plant(1350 + v), width = 1.8 + v * 0.4;
  for (const x of [-width / 2, width / 2]) for (const sign of [-1, 1]) {
    p.stem([[x, 0, sign * 0.55], [x, 0.9, sign * 0.27], [x, 1.9, 0]], 0.065, 0.055, '#ac8a5b', true);
  }
  for (const y of [0.65, 1.25, 1.87]) {
    p.add(G.cyl(0.065, 0.065, width + 0.28, 7).rotateZ(-Math.PI / 2), '#b99364', [-width / 2 - 0.14, y, 0], undefined, undefined, 'bark');
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * width / 5, y = 1.76 - (i % 2) * 0.6;
    p.add(G.cyl(0.017, 0.017, 0.18, 5), '#e2c38b', [x, y - 0.12, 0]);
    p.add(G.tor(0.06, 0.022, 3, 8), '#edce8c', [x, y - 0.16, 0], undefined, [Math.PI / 2, 0, 0]);
    for (let j = 0; j < 4; j++) p.leaf([x, y - 0.15, 0], 0.42 + (i % 2) * 0.07, 0.09, j * TAU / 4,
      (i + v) % 2 ? '#8b9b5a' : '#6c9171', 2.7);
    if (v && i % 2 === 0) p.ball([x, y - 0.55, 0], [0.13, 0.14, 0.13], '#b998c9');
  }
  return p.build();
}

function herb(v) {
  const p = new Plant(1430 + v), colors = ['#7bceab', '#8cb9e5', '#c294dc', '#d8cb76'];
  rosette(p, 0, 0, 0.65 + v * 0.05, colors[v], 0, 7);
  p.stem([[0, 0, 0], [0.05, 0.45, 0], [0, 0.85 + v * 0.08, 0]], 0.045, 0.02, '#6c9d79');
  for (let i = 0; i < 3; i++) p.leaf([0, 0.25 + i * 0.14, 0], 0.3, 0.085, i * 2.4, colors[v], 0.95);
  blossom(p, 0, 0.88 + v * 0.08, 0, 0.22, ['#d1ffde', '#c8eeff', '#efcbff', '#fff2b7'][v], 6);
  p.ball([0, 0.96 + v * 0.08, 0], [0.065, 0.08, 0.065], '#e9f8c1');
  return p.build();
}

export const ASSETS = {
  tree: { name: '阔叶树', n: 5, make: v => orchard(v, 0) },
  fruitTree: { name: '果树', n: 3, make: v => orchard(v, 1) },
  peach: { name: '桃花树', n: 3, make: v => orchard(v, 2) },
  bush: { name: '灌木', n: 4, make: v => shrub(v) },
  berryBush: { name: '浆果丛', n: 3, make: v => shrub(v, true) },
  flower: { name: '花丛', n: 6, make: v => flowers(v) },
  grass: { name: '草丛', n: 4, make: grass },
  mushroom: { name: '蘑菇', n: 4, make: v => mushrooms(v) },
  crop: { name: '作物', n: 5, make: crops },
  bamboo: { name: '竹丛', n: 4, make: bamboo },
  pumpkin: { name: '南瓜', n: 3, make: pumpkin },
  flowerTree: { name: '花树', n: 3, make: v => orchard(v, 3) },
  wisteria: { name: '紫藤', n: 2, make: wisteria },
  flowerBed: { name: '花圃', n: 4, make: v => flowers(v, true) },
  herbRack: { name: '晒药架', n: 2, make: herbRack },
  lingzhi: { name: '灵芝', n: 3, make: v => mushrooms(v, true) },
  herb: { name: '灵草', n: 4, make: herb },
};
