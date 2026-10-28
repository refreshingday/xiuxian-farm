import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, faceted, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';

export const TEXTURES = {
  'codex/g4_rocks_stone': { norm: 0.88 },
  'codex/g4_rocks_sandstone': { norm: 0.9 },
  'codex/g4_rocks_bark': { norm: 0.9 },
};

// Closed, irregular ring hulls: broad shoulders, small planar crowns, solid bottoms.
// A shared angular perturbation preserves recognisable strata down each flank.
function hull(w, h, d, seed, profile = [[0, 0.74], [0.18, 1], [0.65, 0.94], [0.9, 0.61], [1, 0.28]], sides = 9) {
  const r = mulberry32(seed), rings = [], vertices = [], indices = [];
  const shape = Array.from({ length: sides }, () => 0.88 + r() * 0.24);
  const phase = r() * 0.5;
  for (const [y, radius] of profile) {
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const a = j / sides * Math.PI * 2 + phase;
      ring.push(vertices.length / 3);
      vertices.push(Math.cos(a) * radius * shape[j] * w / 2 + y * w * 0.08,
        y * h, Math.sin(a) * radius * shape[j] * d / 2);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = rings[i][j], b = rings[i][(j + 1) % sides];
    const c = rings[i + 1][j], e = rings[i + 1][(j + 1) % sides];
    indices.push(a, c, b, b, c, e);
  }
  const bottom = vertices.length / 3;
  vertices.push(0, profile[0][0] * h, 0);
  const top = vertices.length / 3, ty = profile[profile.length - 1][0];
  vertices.push(ty * w * 0.08, ty * h, 0);
  for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    indices.push(bottom, rings[0][j], rings[0][next]);
    indices.push(top, rings[rings.length - 1][next], rings[rings.length - 1][j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  return project(faceted(g));
}

// Planar UVs per face avoid pinching at the caps of the custom hulls.
function project(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = [];
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i));
    if (y >= x && y >= z) uv.push(p.getX(i), p.getZ(i));
    else if (x > z) uv.push(p.getZ(i), p.getY(i));
    else uv.push(p.getX(i), p.getY(i));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return uvScale(g, 0.85);
}

class Parts {
  constructor() { this.k = new Kit(); this.maps = new Map(); }
  rock(g, color, map = 'stone') {
    grad(color, 0.76, 1.12, 0.045)(g);
    const key = `g4_rocks_${map}`;
    if (!this.maps.has(key)) this.maps.set(key, []);
    this.maps.get(key).push(g);
    return g;
  }
  accent(g, color, kind = 'solid') { this.k.add(g, color, { kind }); }
  build(light) {
    const group = this.k.build();
    for (const [map, geometries] of this.maps) {
      group.add(texMesh(mergeGeometries(geometries), map, '#ffffff', { vc: true }));
    }
    // Bake footprint centring and ground placement into vertices, including roots.
    const bounds = new THREE.Box3();
    for (const mesh of group.children) {
      mesh.geometry.computeBoundingBox(); bounds.union(mesh.geometry.boundingBox);
    }
    const dx = -(bounds.min.x + bounds.max.x) / 2;
    const dy = -bounds.min.y, dz = -(bounds.min.z + bounds.max.z) / 2;
    for (const mesh of group.children) {
      mesh.geometry.translate(dx, dy, dz);
      mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    }
    return finish(group, light ? { light: { ...light, y: light.y + dy } } : {});
  }
}

const forms = [
  [1.45, 0.95, 1.15], [1.9, 0.65, 1.2], [1.05, 1.65, 0.95],
  [1.65, 1.25, 1.45], [2.1, 1.5, 1.5],
];
function blob(w, h, d, x = 0, y = 0, z = 0, seed = 2) {
  return hull(w, h, d, seed).translate(x, y, z);
}
function crystal(radius, height, x, y, z, tilt = 0, yaw = 0) {
  return hull(radius * 2, height, radius * 1.7, 8,
    [[0, 0.8], [0.12, 1], [0.73, 0.92], [1, 0.015]], 6)
    .rotateZ(tilt).rotateY(yaw).translate(x, y, z);
}
function seam(points, width) { return faceted(G.tube(points, width, width * 0.8, 5)); }

function boulder(type, v) {
  const p = new Parts(), [w, h, d] = forms[v], seed = 401 + v * 31;
  const colors = { rock: '#96a3b3', beachRock: '#7b939e', mossRock: '#a3a18b',
    snowRock: '#7e92b2', caveRock: '#77758e', bogRock: '#727f68',
    sandRock: '#dcb880', lavaRock: '#55434e', redRock: '#c86e50' };
  const strata = type === 'sandRock' || type === 'redRock';
  p.rock(hull(w, h, d, seed), colors[type], strata ? 'sandstone' : 'stone');
  if (v === 3 || v === 4) {
    p.rock(blob(w * 0.46, h * 0.48, d * 0.65, -w * 0.42, 0, d * 0.12, seed + 3), colors[type], strata ? 'sandstone' : 'stone');
  }
  if (type === 'beachRock') {
    // Broad pale quartz ribbons and attached barnacles around the tide line.
    p.accent(seam([[-w * 0.4, h * 0.3, d * 0.3], [0, h * 0.25, d * 0.49], [w * 0.4, h * 0.35, d * 0.29]], 0.035), '#d7d9c7');
    for (let i = 0; i < 4; i++) p.accent(G.tor(0.055, 0.026, 4, 7).rotateX(-0.7)
      .translate((i - 1.5) * 0.12, h * 0.48, d * 0.44), '#dfcfa9');
  }
  if (type === 'mossRock' || type === 'bogRock' || type === 'snowRock') {
    const snow = type === 'snowRock';
    const cap = hull(w, h, d, seed, [[0.66, 0.88], [0.87, 0.73], [1.06, 0.32]], 9);
    p.accent(cap, snow ? '#eff8ff' : type === 'bogRock' ? '#8da64d' : '#8cba64');
    // The cap is a thick closed volume overlapping the rock shoulder.
    for (let i = 0; i < 3; i++) p.accent(blob(w * 0.2, h * 0.15, d * 0.23,
      (i - 1) * w * 0.19, h * (0.71 - i * 0.06), d * 0.31, seed + i), snow ? '#e5f3fc' : '#729646');
  }
  if (type === 'caveRock') {
    for (let i = 0; i < 3; i++) p.accent(crystal(0.12, 0.34 + i * 0.09,
      (i - 1) * w * 0.18, h * 0.78, 0, (i - 1) * 0.32), '#ada0cd', 'gem');
  }
  if (type === 'bogRock') {
    for (let i = 0; i < 3; i++) p.accent(seam([[w * (i - 1) * 0.24, h * 0.8, 0],
      [w * (i - 1) * 0.28, h * 0.45, d * 0.39], [w * (i - 1) * 0.3, 0.06, d * 0.44]], 0.04), '#526b3d');
  }
  if (type === 'lavaRock') {
    // Wide inset-looking hot seams traced along the visible shoulders, with a dark crust lip.
    const paths = [
      [[-w * 0.4, h * 0.5, d * 0.3], [0, h * 0.7, d * 0.43], [w * 0.33, h * 0.35, d * 0.43]],
      [[0, h * 0.7, d * 0.43], [w * 0.14, h * 0.94, 0], [-w * 0.13, h * 0.72, -d * 0.4]],
    ];
    for (const path of paths) {
      p.accent(seam(path, 0.075), '#8d443b');
      p.accent(seam(path.map(([x, y, z]) => [x, y + 0.05, z + 0.045]), 0.042), '#ff9a43', 'glow');
    }
  }
  return p.build(type === 'lavaRock' ? { color: '#ff8d42', i: 0.65, d: 3, y: h * 0.7, flicker: true } : undefined);
}

function obsidian(v) {
  const p = new Parts();
  for (let i = 0; i < v + 2; i++) {
    const x = (i - (v + 1) / 2) * 0.38;
    p.rock(crystal(0.34 + (i % 2) * 0.1, 0.85 + ((i + v) % 3) * 0.46,
      x, 0, (i % 2) * 0.15, x * -0.25), i % 2 ? '#4c4768' : '#353747');
  }
  return p.build();
}
function drift(v) {
  const p = new Parts(), sizes = [[1.55, 0.45, 1.05], [2.2, 0.7, 1.3], [1.45, 1.05, 1.4]];
  const [w, h, d] = sizes[v];
  p.accent(blob(w, h, d, 0, 0, 0, 70 + v), '#edf7ff');
  p.accent(blob(w * 0.62, h * 0.65, d * 0.76, w * 0.3, 0, d * 0.15, 80 + v), '#e1f0fc');
  if (v > 0) p.accent(blob(w * 0.3, h * 0.3, d * 0.45, -w * 0.45, 0, d * 0.23), '#f7fcff');
  return p.build();
}
function ice(v) {
  const p = new Parts();
  p.accent(blob(1.3 + v * 0.25, 0.16, 1.05), '#d9f2ff');
  for (let i = 0; i < 3 + v; i++) {
    const a = i * 2.4;
    p.accent(crystal(0.19 + (i % 2) * 0.08, 0.75 + ((i + v) % 3) * 0.37,
      Math.cos(a) * 0.35, 0.09, Math.sin(a) * 0.27, Math.cos(a) * 0.25, a), '#9cdaf2', 'ice');
  }
  return p.build();
}
function karst(v) {
  const p = new Parts(), counts = [1, 2, 3, 2], h = [2.4, 2.9, 3.4, 3.9][v];
  const profile = [[0, 0.95], [0.14, 1], [0.29, 0.7], [0.45, 0.82], [0.62, 0.61], [0.8, 0.7], [1, 0.18]];
  for (let i = 0; i < counts[v]; i++) {
    const height = h * (1 - i * 0.23), x = (i - (counts[v] - 1) / 2) * 0.73;
    p.rock(hull(1.05, height, 1.08, 700 + i + v * 11, profile).translate(x, 0, (i % 2) * 0.28), '#b1baa3');
    p.accent(blob(0.53, 0.13, 0.65, x + 0.06, height * 0.77, 0, 22), '#87aa62');
  }
  return p.build();
}
function floatRock(v) {
  const p = new Parts(), w = 1.65 + v * 0.3, top = 1.65 + v * 0.12;
  p.rock(hull(w, 1.1, w * 0.82, 800 + v,
    [[0, 0.12], [0.25, 0.5], [0.72, 1], [1, 0.88]]).translate(0, top - 1.1, 0), '#9689aa');
  p.accent(hull(w * 0.98, 0.22, w * 0.8, 800 + v,
    [[0, 0.9], [0.45, 1], [1, 0.82]]).translate(0, top - 0.05, 0), '#97ba75');
  for (let i = 0; i < 3 + v; i++) {
    const a = i * 2.4, x = Math.cos(a) * w * 0.26, z = Math.sin(a) * w * 0.23;
    p.accent(seam([[x, top - 0.13, z], [x * 1.35, top - 0.62, z * 1.3],
      [x * 0.9, 0.15 + (i % 3) * 0.13, z * 1.2]], 0.06), '#83644e');
  }
  for (let i = 0; i < 3; i++) p.accent(crystal(0.13, 0.46 + i * 0.07, 0, 0, 0)
    .rotateZ(Math.PI).translate((i - 1) * 0.3, top - 0.7, 0.16), '#b6a5ed', 'gem');
  p.rock(blob(0.4, 0.3, 0.4, -w * 0.45, 0.3, -0.25, 42), '#ad9bc6');
  return p.build();
}
function jade(v) {
  const p = new Parts(), colors = ['#86c99b', '#65b6a6', '#b2d990'];
  p.rock(hull(1.25 + v * 0.22, 0.9 + v * 0.25, 1.1, 901 + v), colors[v]);
  p.accent(seam([[-0.46, 0.45, 0.39], [-0.1, 0.73 + v * 0.17, 0.37],
    [0.13, 0.91 + v * 0.23, 0], [0.42, 0.6 + v * 0.2, -0.32]], 0.04), '#dcf0bf', 'gem');
  if (v === 2) p.accent(crystal(0.22, 0.57, -0.22, 0.84, 0, -0.3), '#9bdeb3', 'gem');
  return p.build();
}
function vein(v) {
  const p = new Parts();
  const colors = ['#b6846b', '#db9260', '#aab5b6', '#e1e5f0', '#efc357', '#a898f2', '#82d9ab', '#596178'];
  const color = colors[v], kind = v === 5 || v === 6 ? 'gem' : 'solid';
  p.rock(hull(2.2, 1.65, 1.02, 1010), '#8a8995');
  p.rock(blob(0.85, 0.62, 0.82, -0.82, 0, 0.27, 1011), '#8a8995');
  // The same geology for all eight minerals: a broad mineral seam crosses +Z and the crown.
  const path = [[-0.84, 0.55, 0.36], [-0.45, 0.84, 0.47], [-0.05, 1.03, 0.47],
    [0.32, 1.3, 0.36], [0.25, 1.52, 0.05], [0.05, 1.2, -0.43]];
  p.accent(seam(path, 0.11), '#565264');
  p.accent(seam(path.map(([x, y, z]) => [x, y + 0.05, z + 0.075]), 0.067), color, kind);
  for (let i = 0; i < 6; i++) {
    const t = i / 5, x = -0.75 + t * 1.17, y = 0.57 + t * 0.72;
    p.accent(crystal(0.13 + (i % 2) * 0.045, 0.29 + (i % 3) * 0.04,
      x, y - 0.09, 0.38, -0.45 + t * 0.7, i), color, kind);
  }
  return p.build(v === 5 || v === 6 ? { color, i: 0.45, d: 2.5, y: 1.1 } : undefined);
}

// A full cylinder of wood with bark sleeve, pale end faces and concentric growth rings.
function log(p, radius, length, at, angle, color, seed) {
  const orient = g => g.rotateZ(angle).translate(...at);
  const bark = faceted(new THREE.CylinderGeometry(radius * 0.88, radius, length, 10, 2, true));
  p.rock(orient(bark), color, 'bark');
  p.accent(orient(new THREE.CylinderGeometry(radius * 0.87, radius * 0.98, length * 0.998, 10)), '#d6b88a');
  for (const sign of [-1, 1]) for (const scale of [0.3, 0.61]) {
    p.accent(orient(G.tor(radius * scale, 0.012, 4, 16).rotateX(Math.PI / 2)
      .translate(0, sign * length / 2, 0)), '#9b7955');
  }
  // A dark split on each end, broad enough to remain legible from the game camera.
  for (const sign of [-1, 1]) p.accent(orient(G.box(radius * 0.56, 0.014, 0.026)
    .rotateY(seed * 0.25).translate(radius * 0.3, sign * length / 2, 0)), '#89694e');
}
function stump(v) {
  const p = new Parts();
  if (v < 2) {
    const radius = v === 0 ? 0.45 : 0.61, height = v === 0 ? 0.65 : 0.95;
    log(p, radius, height, [0, height / 2, 0], 0, '#9b7555', v + 1);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      p.rock(hull(radius * 0.9, height * 0.43, radius * 0.65, i + 123)
        .rotateY(-a).translate(Math.cos(a) * radius * 0.8, 0, Math.sin(a) * radius * 0.8), '#8c694b', 'bark');
    }
    if (v === 1) p.accent(blob(0.55, 0.1, 0.46, -0.14, height - 0.04, -0.11), '#92ae65');
  } else {
    log(p, 0.34 + (v - 2) * 0.08, 1.95 + (v - 2) * 0.5, [0, 0.4, 0], Math.PI / 2, '#9c7b59', v);
    log(p, 0.12, 0.67, [0.12, 0.68, 0], -0.45, '#9c7b59', v);
    if (v === 3) p.accent(blob(0.8, 0.13, 0.43, -0.35, 0.7, 0), '#8ca55e');
  }
  return p.build();
}
function driftwood(v) {
  const p = new Parts(), length = [1.8, 2.35, 2.7][v], radius = [0.22, 0.28, 0.31][v];
  log(p, radius, length, [0, radius, 0], Math.PI / 2, '#b9a68a', 12 + v);
  log(p, radius * 0.49, 0.85 + v * 0.12, [-length * 0.17, radius + 0.16, 0.17], -0.75, '#b4a38a', 14);
  if (v > 0) log(p, radius * 0.4, 0.7, [length * 0.19, radius + 0.08, -0.14], 0.88, '#b7a790', 15);
  if (v === 2) p.rock(blob(0.65, 0.3, 0.5, -length * 0.46, 0, 0, 33), '#a99780', 'bark');
  return p.build();
}

export const ASSETS = {
  rock: { name: '岩石', n: 5, make: v => boulder('rock', v) },
  beachRock: { name: '礁石', n: 5, make: v => boulder('beachRock', v) },
  mossRock: { name: '苔石', n: 5, make: v => boulder('mossRock', v) },
  snowRock: { name: '雪岩', n: 5, make: v => boulder('snowRock', v) },
  caveRock: { name: '洞岩', n: 5, make: v => boulder('caveRock', v) },
  bogRock: { name: '沼石', n: 5, make: v => boulder('bogRock', v) },
  sandRock: { name: '砂岩', n: 5, make: v => boulder('sandRock', v) },
  lavaRock: { name: '熔岩石', n: 5, make: v => boulder('lavaRock', v) },
  redRock: { name: '赤砂岩', n: 5, make: v => boulder('redRock', v) },
  obsidian: { name: '黑曜石', n: 3, make: obsidian },
  drift: { name: '雪堆', n: 3, make: drift },
  ice: { name: '冰晶', n: 3, make: ice },
  karst: { name: '石峰', n: 4, make: karst },
  floatRock: { name: '浮空石', n: 4, make: floatRock },
  jade: { name: '玉石', n: 3, make: jade },
  vein: { name: '矿脉', n: 8, make: vein },
  stump: { name: '树桩/倒木', n: 4, make: stump },
  driftwood: { name: '浮木', n: 3, make: driftwood },
};
