import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';

export const TEXTURES = {
  'codex/g5_places_wood': { norm: 0.9 },
  'codex/g5_places_stone': { norm: 0.9 },
  'codex/g5_places_tile': { norm: 0.9 },
};
const TAU = Math.PI * 2;
const wood = '#aa7750', stone = '#82939c', gold = '#e6b65e';
const vec = p => new THREE.Vector3(...p);
// Bake every part into geometry, then batch by texture/tint or Kit material kind.
class Model {
  constructor() { this.k = new Kit(); this.tex = new Map(); }
  add(g, c, at = [0, 0, 0], rot = [0, 0, 0], s = 1, kind = 'solid') {
    this.k.add(g, c, { at, rot, s, kind });
  }
  surface(g, name, color) {
    if (g.index) g = g.toNonIndexed();
    grad('#ffffff', 0.8, 1.06, 0.035)(g);
    const key = name + ':' + color;
    if (!this.tex.has(key)) this.tex.set(key, { name, color, parts: [] });
    this.tex.get(key).parts.push(g);
  }
  box(w, h, d, p, c = wood, texture = 'wood', rot = [0, 0, 0]) {
    const g = G.box(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    g.translate(...p);
    if (texture) this.surface(uvScale(g, Math.max(w, d), Math.max(h, d)), texture, c);
    else this.add(g, c);
  }
  rod(a, b, r, c = wood, texture = null, rt = r) {
    const av = vec(a), bv = vec(b), d = bv.clone().sub(av);
    const g = new THREE.CylinderGeometry(rt, r, d.length(), 7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(...av.add(bv).multiplyScalar(0.5).toArray());
    if (texture) this.surface(g, texture, c); else this.add(g, c);
  }
  ball(p, r, c, s = [1, 1, 1], kind = 'solid') { this.add(G.sph(r, 8, 5), c, p, [0, 0, 0], s, kind); }
  ring(p, r, t, c, rot = [Math.PI / 2, 0, 0]) { this.add(G.tor(r, t, 4, 12), c, p, rot); }
  done(light) {
    const group = this.k.build();
    for (const { name, color, parts } of this.tex.values()) group.add(texMesh(mergeGeometries(parts), 'g5_places_' + name, color, { vc: true }));
    // Keep shared outline geometry at identity; shift each unique geometry only once.
    const bounds = new THREE.Box3().setFromObject(group);
    const dx = -(bounds.min.x + bounds.max.x) / 2, dy = -bounds.min.y, dz = -(bounds.min.z + bounds.max.z) / 2;
    const seen = new Set();
    group.traverse(o => { if (o.isMesh && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.translate(dx, dy, dz); o.geometry.computeBoundingSphere(); } });
    return finish(group, { light: light && { ...light, y: light.y + dy } });
  }
}
const lamp = (color, y, i = 0.65, d = 4) => ({ color, y, i, d });
function petal(m, p, angle, length, width, color, lift = 0.2, kind = 'solid') {
  m.add(G.sph(1, 7, 4), color,
    [p[0] + Math.sin(angle) * length * 0.48, p[1] + lift, p[2] + Math.cos(angle) * length * 0.48],
    [-lift / length, angle, 0], [width, width * 0.3, length * 0.6], kind);
}
function flower(m, p, r, color, kind = 'solid') {
  for (let j = 0; j < 7; j++) petal(m, p, j * TAU / 7, r, r * 0.28, color, r * 0.17, kind);
  for (let j = 0; j < 5; j++) petal(m, [p[0], p[1] + r * 0.18, p[2]], j * TAU / 5 + 0.3, r * 0.65, r * 0.23, '#ffe0c5', r * 0.22, kind);
  m.ball([p[0], p[1] + r * 0.38, p[2]], r * 0.2, gold, [1, 0.6, 1], kind);
}
function pad(m, x, z, r, y = 0.045) {
  // A closed extruded notched disc, with a shallow radial vein.
  const shape = new THREE.Shape(); shape.moveTo(0, 0);
  for (let i = 0; i <= 16; i++) { const a = 0.2 + i / 16 * (TAU - 0.4); shape.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2).translate(x, y, z); m.add(g, '#5b9d55');
  m.rod([x, y + 0.065, z], [x - r * 0.7, y + 0.065, z - r * 0.4], 0.012, '#94c66a');
}
function shard(m, p, h, r, c, lean = 0) {
  const g = G.lathe([[0, 0], [r * 0.75, 0], [r, h * 0.15], [r * 0.9, h * 0.72], [0, h]], 5);
  m.add(g, c, p, [lean, p[0] * 0.5, lean * 0.4], 1, 'gem');
}
function mineral(v, ore = false) {
  const m = new Model(), rng = mulberry32(5100 + v + (ore ? 100 : 0));
  const colors = ore ? ['#d69b65', '#b4bfcc', '#edcc65', '#9cc9ad'] : ['#6cdedb', '#ac90ed', '#8ed692', '#e6a0cb', '#82b8ec'];
  const base = G.ico(0.75, 1).scale(1.1, ore ? 0.72 : 0.3, 0.85).translate(0, ore ? 0.38 : 0.17, 0);
  m.surface(base, 'stone', ore ? '#777c88' : '#6d828c');
  for (let j = 0; j < (ore ? 5 : 4 + v % 2); j++) {
    const a = j * 2.4, rr = j ? 0.32 + rng() * 0.17 : 0;
    shard(m, [Math.sin(a) * rr, ore ? 0.43 : 0.18, Math.cos(a) * rr], (ore ? 0.35 : 0.85) + rng() * (ore ? 0.25 : 0.75), ore ? 0.2 : 0.23, colors[v], j ? 0.22 : 0);
  }
  return m.done(lamp(colors[v], 0.8, ore ? 0.2 : 0.7));
}
function roof(m, width, y, color) {
  // Four-sided hipped roof: upturned thick eaves, sloping shoulder, capped apex.
  const positions = [], uv = [], indices = [];
  const rings = [[width * 0.5, y + 0.12], [width * 0.48, y], [width * 0.31, y + 0.29], [width * 0.055, y + 1.02]];
  rings.forEach(([r, h]) => { for (const [x, z] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) { positions.push(x * r, h, z * r); uv.push(x * r * 0.5, z * r * 0.5); } });
  for (let j = 0; j < 3; j++) for (let s = 0; s < 4; s++) { const a = j * 4 + s, b = j * 4 + (s + 1) % 4; indices.push(a, b, b + 4, a, b + 4, a + 4); }
  indices.push(0, 3, 2, 0, 2, 1, 12, 13, 14, 12, 14, 15);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  m.surface(g, 'tile', color);
  for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + Math.PI / 4; m.rod([Math.sin(a) * width * 0.69, y + 0.12, Math.cos(a) * width * 0.69], [Math.sin(a) * width * 0.08, y + 1.02, Math.cos(a) * width * 0.08], 0.055, '#a2cbb1'); }
  m.ball([0, y + 1.12, 0], 0.15, gold);
}

export const ASSETS = {
  palm: { name: '椰树', n: 3, make(v) {
    const m = new Model(), h = 3.5 + v * 0.55, lean = [0.65, -0.55, 0.25][v];
    const pts = [[0, 0, 0], [-lean * 0.2, h * 0.35, 0], [lean * 0.4, h * 0.75, 0], [lean, h, 0]];
    m.surface(G.tube(pts, 0.25, 0.14, 7), 'wood', '#b79464');
    for (let j = 0; j < 8; j++) {
      const a = j * TAU / 8 + v * 0.4, len = 1.4 + j % 3 * 0.15;
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(-0.33, len * 0.4); shape.lineTo(0, len); shape.lineTo(0.33, len * 0.4); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: false });
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = p.getY(i) / len; p.setXYZ(i, p.getX(i), p.getZ(i) + Math.sin(t * Math.PI) * 0.38 - t * t * 0.45, t * len); }
      g.computeVertexNormals(); m.add(g, j % 2 ? '#68aa50' : '#45915a', [lean, h, 0], [0, a, 0]);
    }
    for (let j = 0; j < 3; j++) m.ball([lean + Math.cos(j * 2.1) * 0.22, h - 0.23, Math.sin(j * 2.1) * 0.22], 0.2, '#946a42');
    return m.done();
  } },
  reeds: { name: '芦苇', n: 3, make(v) {
    const m = new Model(), rng = mulberry32(512 + v);
    for (let j = 0; j < 6 + v * 2; j++) {
      const x = (rng() - 0.5) * 0.95, z = (rng() - 0.5) * 0.8, h = 1.05 + rng() * 0.8 + v * 0.15;
      m.rod([x, 0, z], [x + 0.13, h, z], 0.025, '#829d58');
      m.ball([x + 0.13, h, z], 0.13, ['#d8bd83', '#ba915e', '#e1d4a8'][v], [0.65, 2.5, 0.65]);
      m.add(G.blade(0.11, h * 0.72, 0.35), '#7f9f59', [x, 0.05, z], [0.2, j * 2.4, -0.3], 1, 'plant');
    }
    return m.done();
  } },
  lily: { name: '荷叶/荷花', n: 3, make(v) {
    const m = new Model(); pad(m, -0.25, 0.1, 0.55); pad(m, 0.46, -0.2, 0.38);
    if (v === 0) pad(m, 0.32, 0.5, 0.3);
    else { m.rod([0, 0.07, 0], [0, 0.24 + v * 0.12, 0], 0.035, '#60914d'); flower(m, [0, 0.24 + v * 0.12, 0], 0.47, v === 1 ? '#ee99b1' : '#f4d3ad'); }
    return m.done();
  } },
  shell: { name: '贝壳/海星', n: 4, make(v) {
    const m = new Model();
    if (v === 2) {
      const shape = new THREE.Shape();
      for (let j = 0; j < 10; j++) { const a = j * TAU / 10, r = j % 2 ? 0.24 : 0.65; const x = Math.sin(a) * r, z = Math.cos(a) * r; if (!j) shape.moveTo(x, z); else shape.lineTo(x, z); }
      shape.closePath(); const g = new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.045, bevelThickness: 0.04, steps: 1 }); g.rotateX(-Math.PI / 2); m.add(g, '#e9a16f');
      for (let j = 0; j < 5; j++) m.ball([Math.sin(j * TAU / 5) * 0.31, 0.17, Math.cos(j * TAU / 5) * 0.31], 0.045, '#f8d39d');
    } else if (v === 3) {
      m.add(G.lathe([[0, 0], [0.42, 0.05], [0.5, 0.22], [0.36, 0.4], [0.28, 0.32], [0.33, 0.18], [0, 0.13]], 12), '#e2b6b1');
      m.ball([0, 0.27, 0], 0.16, '#fff0d2');
    } else {
      const c = v ? '#dfae88' : '#ecc4b3';
      m.ball([0, 0.12, 0], 0.55, c, [1, 0.38, 0.84]);
      for (let j = 0; j < 7; j++) { const a = -1.2 + j * 0.4; m.rod([0, 0.17, -0.35], [Math.sin(a) * 0.48, 0.2, Math.cos(a) * 0.44], 0.027, '#f8dfbf'); }
      if (v) { m.ball([0, 0.25, 0], 0.32, '#efcfaa', [0.85, 0.65, 0.8]); m.ball([0, 0.39, -0.04], 0.2, '#f8dfbf', [0.8, 0.7, 1]); }
    }
    return m.done();
  } },
  dock: { name: '码头', n: 2, make(v) {
    const m = new Model(), w = v ? 2.4 : 1.85;
    for (let j = 0; j < 15; j++) m.box(w, 0.15, 0.38, [0, 0.68, -2.8 + j * 0.4], j % 3 ? '#b68a60' : '#c49c6e');
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
      m.box(0.16, 0.22, 6.05, [x, 0.49, 0]);
      for (const z of [-2.7, 0, 2.7]) { m.rod([x, 0, z], [x, v ? 1.24 : 0.95, z], 0.12, wood, 'wood'); m.ring([x, v ? 1.06 : 0.82, z], 0.13, 0.025, '#dfc487'); }
      if (v) for (let j = 0; j < 2; j++) m.rod([x, 1.06, -2.7 + j * 2.7], [x, 1.06, j * 2.7], 0.045, '#d2ba88');
    }
    return m.done();
  } },
  crystal: { name: '灵晶簇', n: 5, make: v => mineral(v) },
  ore: { name: '矿石', n: 4, make: v => mineral(v, true) },
  stalag: { name: '石笋', n: 4, make(v) {
    const m = new Model(), rng = mulberry32(572 + v);
    for (let j = 0; j < 3 + v % 2; j++) {
      const h = j === 0 ? 1.6 + v * 0.23 : 0.5 + rng() * 0.9, x = j ? Math.sin(j * 2.3) * 0.45 : 0, z = j ? Math.cos(j * 2.3) * 0.4 : 0;
      const g = G.lathe([[0, 0], [0.36, 0], [0.3, h * 0.2], [0.17, h * 0.6], [0.09, h * 0.88], [0, h]], 7).translate(x, 0, z);
      m.surface(g, 'stone', ['#a6a69b', '#8f9ea8', '#ba9f8a', '#a0a988'][v]);
    }
    return m.done();
  } },
  cart: { name: '矿车', n: 2, make(v) {
    const m = new Model();
    m.box(1.4, 0.18, 1.7, [0, 0.6, 0], '#5b6268', null);
    for (const x of [-0.67, 0.67]) m.box(0.13, 0.65, 1.65, [x, 0.99, 0], v ? '#aa7953' : '#7c8b93', v ? 'wood' : 'stone', [0, 0, x > 0 ? -0.12 : 0.12]);
    for (const z of [-0.78, 0.78]) m.box(1.48, 0.65, 0.13, [0, 0.99, z], v ? wood : '#7c8b93', v ? 'wood' : 'stone');
    for (const z of [-0.55, 0.55]) { m.rod([-0.94, 0.3, z], [0.94, 0.3, z], 0.07, '#4c535c'); for (const x of [-0.88, 0.88]) { m.add(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 10), '#4c535c', [x, 0.3, z], [0, 0, Math.PI / 2]); m.ring([x * 1.09, 0.3, z], 0.23, 0.035, '#a1a1a0', [0, Math.PI / 2, 0]); } }
    if (v) for (let j = 0; j < 5; j++) m.ball([Math.sin(j * 2.4) * 0.35, 1.17, Math.cos(j * 2.4) * 0.45], 0.3, '#7e8994', [1, 0.8, 1]);
    return m.done();
  } },
  beam: { name: '支撑木架', n: 2, make(v) {
    const m = new Model(), w = v ? 2.6 : 2.2, h = v ? 2.9 : 2.5;
    for (const x of [-w / 2, w / 2]) {
      m.box(0.45, 0.22, 0.55, [x, 0.11, 0], stone, 'stone'); m.box(0.27, h, 0.3, [x, h / 2, 0]);
      m.rod([x, h - 0.8, 0], [x * 0.5, h - 0.14, 0], 0.1, '#c08d58', 'wood');
      for (const y of [0.35, h - 0.4]) m.box(0.31, 0.1, 0.34, [x, y, 0], '#535f63', null);
    }
    m.box(w + 0.7, 0.3, 0.4, [0, h, 0]);
    if (v) { m.box(0.5, 0.58, 0.08, [0, h - 0.45, 0.25], '#d3b16f'); shard(m, [0, h - 0.7, 0.32], 0.35, 0.11, '#8ecac1'); }
    return m.done();
  } },
  torch: { name: '火把', n: 2, make(v) {
    const m = new Model(), h = v ? 1.55 : 1.15;
    if (v) { m.add(G.cyl(0.32, 0.43, 0.18), '#727e84'); m.rod([0, 0.1, 0], [0, h, 0], 0.1, '#59636a'); }
    else m.rod([0, 0, 0], [0, h, 0], 0.075, wood, 'wood');
    m.add(G.cyl(0.22, 0.11, 0.25), '#786252', [0, h - 0.15, 0]);
    for (let j = 0; j < 3; j++) m.ball([(j - 1) * 0.1, h + 0.17 + (j === 1 ? 0.12 : 0), 0], 0.19, '#f4a44f', [0.8, j === 1 ? 1.9 : 1.3, 0.8], 'glow');
    m.ball([0, h + 0.1, 0.03], 0.13, '#ffe49b', [0.7, 1.6, 0.7], 'glow');
    return m.done({ ...lamp('#ffb060', h + 0.3, 1, 6), flicker: true, smoke: true });
  } },
  glowShroom: { name: '荧光菇', n: 4, make(v) {
    const m = new Model(), colors = ['#75dcca', '#a8b2ef', '#e7a9d6', '#acd98a'];
    for (let j = 0; j < 3; j++) {
      const x = j ? Math.sin(j * 2.3) * 0.42 : 0, z = j ? Math.cos(j * 2.3) * 0.42 : 0, h = j ? 0.35 + v * 0.05 : 0.8 + v * 0.08, r = j ? 0.28 : 0.47;
      m.rod([x, 0, z], [x, h, z], r * 0.22, '#c3c9b6', null, r * 0.16);
      m.add(G.lathe([[0, 0], [r, 0], [r * 0.92, r * 0.22], [r * 0.55, r * 0.65], [0, r * 0.8]], 10), colors[v], [x, h, z], [0, 0, 0], 1, 'gem');
      m.ring([x, h + 0.015, z], r * 0.84, 0.024, '#e8edcc');
      for (let s = 0; s < 3; s++) m.ball([x + Math.sin(s * 2.1) * r * 0.5, h + r * 0.48, z + Math.cos(s * 2.1) * r * 0.5], 0.045, '#eaffdf', [1, 0.4, 1], 'glow');
    }
    return m.done(lamp(colors[v], 0.7, 0.6));
  } },
  bonsai: { name: '迎客松', n: 3, make(v) {
    const m = new Model(), h = 1.8 + v * 0.45;
    m.surface(G.ico(0.7, 1).scale(1, 0.42, 0.8).translate(0, 0.27, 0), 'stone', '#8a9390');
    m.surface(G.tube([[0, 0.25, 0], [-0.22, h * 0.45, 0], [0.2, h * 0.72, 0], [0.15, h, 0]], 0.2, 0.085, 7), 'wood', '#876544');
    for (let j = 0; j < 4; j++) {
      const x = (j % 2 ? -1 : 1) * (0.65 + j * 0.1), y = h * (0.48 + j * 0.15), z = (j % 3 - 1) * 0.22;
      m.rod([0, y - 0.25, 0], [x, y, z], 0.07, '#876544', 'wood', 0.025);
      m.ball([x, y + 0.08, z], 0.64, ['#458566', '#53906b', '#649374'][v], [1.25, 0.3, 0.85]);
      m.ball([x + 0.13, y + 0.19, z - 0.06], 0.43, '#78a875', [1.25, 0.23, 0.8]);
    }
    return m.done();
  } },
  lotus: { name: '莲花灯', n: 2, make(v) {
    const m = new Model();
    m.add(G.cyl(0.46, 0.53, 0.12, 10), '#648e79'); m.ring([0, 0.12, 0], 0.44, 0.035, gold);
    flower(m, [0, 0.13, 0], v ? 0.68 : 0.53, v ? '#a9bcec' : '#eaa6b5', 'gem');
    m.ball([0, 0.48, 0], 0.14, '#ffeab0', [0.8, 1.35, 0.8], 'glow');
    return m.done(lamp(v ? '#b3c5ff' : '#ffcaa2', 0.48, 0.8));
  } },
  incense: { name: '香炉', n: 2, make(v) {
    const m = new Model(), c = v ? '#769e90' : '#ad8854';
    for (let j = 0; j < 3; j++) { const a = j * TAU / 3; m.rod([Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36], [Math.sin(a) * 0.27, 0.4, Math.cos(a) * 0.27], 0.09, c); }
    m.add(G.lathe([[0, 0.22], [0.27, 0.22], [0.5, 0.43], [0.49, 0.66], [0.43, 0.71], [0.38, 0.65], [0.38, 0.48], [0, 0.38]], 12), c);
    m.add(G.cyl(0.36, 0.36, 0.04, 12), '#777466', [0, 0.48, 0]); m.ring([0, 0.69, 0], 0.45, 0.045, gold);
    for (const x of [-0.57, 0.57]) m.ring([x, 0.61, 0], 0.17, 0.055, c, [0, Math.PI / 2, 0]);
    for (let j = -1; j <= 1; j++) { const h = 1.12 + (j === 0 ? 0.16 : 0); m.rod([j * 0.13, 0.5, 0], [j * 0.16, h, 0], 0.017, '#9b6750'); m.ball([j * 0.16, h, 0], 0.028, '#ffc484', [1, 1.4, 1], 'glow'); }
    return m.done({ ...lamp('#ffb77d', 1.2, 0.25, 2), smoke: true });
  } },
  stele: { name: '石碑', n: 3, make(v) {
    const m = new Model(), h = [1.6, 2.05, 1.35][v];
    m.box(1.2, 0.18, 0.75, [0, 0.09, 0], stone, 'stone'); m.box(0.98, 0.18, 0.58, [0, 0.27, 0], '#9caaa7', 'stone');
    m.box(0.78, h, 0.29, [0, 0.35 + h / 2, 0], ['#95a6a5', '#83939f', '#af9d8c'][v], 'stone');
    if (v === 1) { m.box(1, 0.16, 0.5, [0, h + 0.36, 0], stone, 'stone'); m.add(G.cone(0.2, 0.23, 4), '#91aeb1', [0, h + 0.44, 0], [0, Math.PI / 4, 0]); }
    else m.ball([0, h + 0.32, 0], 0.39, '#a0aeaa', [1, 0.4, 0.4]);
    // Raised jade seal: ornamental geometric marks, not fabricated writing.
    m.box(0.32, 0.42, 0.045, [0, h * 0.68 + 0.35, 0.17], '#528e80', null);
    m.box(0.13, 0.13, 0.035, [0, h * 0.68 + 0.35, 0.21], '#d6d3a3', null, [0, 0, Math.PI / 4]);
    for (let j = 0; j < 3; j++) m.box(0.22 - j * 0.04, 0.035, 0.025, [0, 0.62 + j * 0.13, 0.16], '#6b827c', null);
    return m.done();
  } },
  pavilion: { name: '亭子', n: 2, make(v) {
    const m = new Model(), w = v ? 4.3 : 3.9, p = w * 0.33, roofY = v ? 2.95 : 2.65;
    m.box(w - 0.4, 0.22, w - 0.4, [0, 0.11, 0], '#9caeaa', 'stone');
    m.box(w - 0.65, 0.12, w - 0.65, [0, 0.28, 0], '#b9baaa', 'stone');
    for (const x of [-p, p]) for (const z of [-p, p]) {
      m.add(G.cyl(0.23, 0.26, 0.18), '#91a59e', [x, 0.34, z]); m.rod([x, 0.48, z], [x, roofY, z], 0.13, v ? '#a96853' : '#a67d53', 'wood');
      m.ring([x, roofY - 0.15, z], 0.15, 0.045, gold);
    }
    for (const z of [-p, p]) m.box(p * 2 + 0.25, 0.19, 0.22, [0, roofY - 0.08, z]);
    for (const x of [-p, p]) {
      m.box(0.22, 0.19, p * 2 + 0.25, [x, roofY - 0.08, 0]);
      m.box(0.34, 0.12, p * 2 - 0.3, [x, 0.86, 0]);
      for (const z of [-p + 0.2, p - 0.2]) m.box(0.15, 0.45, 0.15, [x, 0.59, z]);
    }
    m.box(p * 2 - 0.3, 0.13, 0.32, [0, 0.86, -p]);
    m.box(1.1, 0.15, 0.4, [0, 0.075, w / 2 - 0.03], '#a7b2a6', 'stone');
    roof(m, w, roofY, v ? '#657f9a' : '#5a9d90');
    if (v) { m.rod([0, roofY, 0], [0, roofY - 0.35, 0], 0.025, gold); m.ball([0, roofY - 0.56, 0], 0.23, '#f2bd85', [1, 1.15, 1], 'gem'); }
    return m.done(v ? lamp('#ffce93', roofY - 0.55, 0.45) : null);
  } },
  cloud: { name: '祥云', n: 3, make(v) {
    const m = new Model(), colors = ['#e5efed', '#e2d4ea', '#f0ddbd'];
    m.ball([0, 0.25, 0], 0.75, colors[v], [1.6 + v * 0.15, 0.42, 0.7]);
    for (let j = 0; j < 5; j++) { const x = (j - 2) * 0.45, r = [0.28, 0.4, 0.52, 0.36, 0.25][j]; m.ball([x, 0.36 + (j === 2 ? v * 0.06 : 0), 0], r, colors[v], [1, 0.85, 0.85]); }
    for (const s of [-1, 1]) m.add(G.tor(0.21, 0.09, 5, 11, Math.PI * 1.65), '#f8f0dc', [s * 0.92, 0.39, 0.25], [0, 0, s < 0 ? Math.PI : 0]);
    return m.done();
  } },
};
