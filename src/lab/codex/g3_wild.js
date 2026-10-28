import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, faceted, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';

export const TEXTURES = {
  'codex/g3_wild_bark': { norm: 0.9 },
  'codex/g3_wild_leaves': { norm: 0.9 },
  'codex/g3_wild_fibres': { norm: 0.9 },
};

const TAU = Math.PI * 2;
const polar = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];

// A texture bucket holds already coloured, transformed, nonindexed geometry.
// Each bucket becomes one mesh, regardless of how many roots or leaves it holds.
class Wild {
  constructor(seed) { this.k = new Kit(); this.buckets = {}; this.r = mulberry32(seed); }
  add(g, color, texture = null, kind = 'solid') {
    if (!texture) { this.k.add(g, color, { kind }); return; }
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    grad(color, 0.78, 1.1, 0.06)(g);
    (this.buckets[texture] ||= []).push(g);
  }
  twig(a, b, radius, color, tip = radius * 0.45, texture = 'bark') {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const d = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(tip, radius, d.length(), 6);
    uvScale(g, 1, Math.max(0.25, d.length() * 0.65));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(...start.add(end).multiplyScalar(0.5).toArray());
    this.add(g, color, texture);
  }
  puff(p, size, color, texture = 'leaves', detail = 1) {
    this.add(faceted(G.ico(1, detail)).scale(...size).translate(...p), color, texture);
  }
  done(light) {
    const group = this.k.build({ plantShadow: true });
    for (const [key, list] of Object.entries(this.buckets)) {
      group.add(texMesh(mergeGeometries(list), `g3_wild_${key}`, '#ffffff', { vc: true }));
    }
    // Centre the real footprint, not the trunk; anchor the lowest surface to y=0.
    const box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3());
    const seen = new Set();
    group.traverse(m => {
      if (m.isMesh && !seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.translate(-center.x, -box.min.y, -center.z);
        m.geometry.computeBoundingSphere();
      }
    });
    return finish(group, light ? { light: { ...light, y: light.y - box.min.y } } : {});
  }
}

function roots(w, radius, bark, count = 5) {
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count + 0.2;
    w.twig([0, 0.44, 0], polar(a, radius, 0.07), 0.19, bark, 0.045);
  }
}

// Thick fan-shaped leaves, closed on both sides, with a shallow central notch.
function fan(radius, spread = 2.25) {
  const points = [[0, 0]], steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = -spread / 2 + i * spread / steps;
    const r = radius * (i === steps / 2 ? 0.88 : 1);
    points.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(...p)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, steps: 1 });
  return g.rotateX(-Math.PI / 2);
}

function deciduous(v, ginkgo = false) {
  const w = new Wild(3100 + v + (ginkgo ? 80 : 0));
  const h = ginkgo ? 4.5 + v * 0.8 : [4.3, 5.1, 3.9, 4.8][v];
  const bark = ginkgo ? '#947357' : '#765246';
  const colors = ginkgo ? ['#e9ba43', '#f1cc64'] : ['#df7045', '#c94b42', '#e9a544', '#ad4b59'];
  const color = colors[v], lean = v % 2 ? -0.25 : 0.22;
  roots(w, 0.8, bark);
  w.twig([0, 0.08, 0], [lean, h * 0.65, 0], 0.32, bark, 0.14);
  const levels = ginkgo ? 6 : 5;
  for (let i = 0; i < levels; i++) {
    const a = i * 2.4 + v * 0.6, reach = ginkgo ? 0.85 + (i % 2) * 0.28 : 1.05 + w.r() * 0.35;
    const p = polar(a, reach, h * (0.58 + (i % 3) * 0.12));
    w.twig([lean * 0.7, h * 0.42 + (i % 3) * 0.2, 0], p, 0.14, bark, 0.06);
    w.puff(p, [ginkgo ? 0.95 : 1.15, ginkgo ? 0.62 : 0.8, 1.02], color);
    // Sparse large signature leaves read from the fixed high camera.
    if (ginkgo) {
      w.add(fan(0.57).rotateY(a).translate(p[0], p[1] + 0.6, p[2]), '#ffe297', 'leaves');
    } else {
      for (let j = 0; j < 3; j++) {
        const a2 = a + j * TAU / 3;
        w.puff([p[0] + Math.cos(a2) * 0.72, p[1] + 0.27, p[2] + Math.sin(a2) * 0.72], [0.48, 0.35, 0.46], j === 1 ? '#f3b259' : color, 'leaves', 0);
      }
    }
  }
  w.puff([lean, h - 0.5, 0], [0.9, 0.7, 0.94], color);
  return w.done();
}

function conifer(v, snowy = false) {
  const w = new Wild(3300 + v), h = [4.4, 5.3, 3.7, 4.9][v];
  const bark = '#79604b', green = ['#3d7966', '#426e61', '#5b856a', '#356c65'][v];
  roots(w, 0.65, bark);
  w.twig([0, 0.05, 0], [0.12 * (v - 1), h - 0.25, 0], 0.26, bark, 0.055);
  for (let tier = 0; tier < 4; tier++) {
    const y = 0.95 + tier * (h - 1.6) / 4, r = (1.55 - tier * 0.29) * (v === 2 ? 1.12 : 1);
    const tip = [0.12 * (v - 1) * tier / 4, y + 1.45, 0];
    w.add(G.cone(r, 1.5, 9).translate(tip[0], y, 0), green, 'leaves');
    for (let j = 0; j < 3; j++) {
      const a = j * TAU / 3 + tier;
      w.twig([tip[0], y + 0.45, 0], polar(a, r * 0.91, y + 0.15), 0.08, bark, 0.035);
      if (snowy) {
        const p = polar(a, r * 0.47, y + 0.84);
        w.puff(p, [r * 0.6, 0.22, r * 0.48], '#e7f3fa', null, 1);
      }
    }
    if (snowy) w.add(G.cone(r * 0.57, 0.8, 9).translate(tip[0], y + 0.73, 0), '#f5f7f1');
  }
  return w.done();
}

function woody(v, type) {
  const w = new Wild(3500 + v + type * 20);
  const tree = type === 1 || type === 2;
  const h = tree ? [3.8, 4.5, 3.25][v] : [1.1, 1.45, 0.9][v];
  const bark = type === 2 ? '#493f43' : type === 3 ? '#a08759' : '#88725c';
  if (tree) roots(w, 0.85, bark);
  const top = [v === 1 ? -0.45 : 0.24, h, -0.12];
  w.twig([0, 0, 0], top, tree ? 0.3 : 0.1, bark, tree ? 0.11 : 0.035);
  for (let i = 0; i < (tree ? 6 : 7); i++) {
    const a = i * 2.4 + v, y = h * (0.25 + (i % 3) * 0.2);
    const p = polar(a, (tree ? 1.05 : 0.55) * (0.8 + w.r() * 0.4), y + h * 0.24);
    const base = [top[0] * y / h, y, top[2] * y / h];
    w.twig(base, p, tree ? 0.12 : 0.05, bark, tree ? 0.055 : 0.022);
    w.twig(p, [p[0] * 1.15, p[1] + h * 0.14, p[2] * 1.15], tree ? 0.055 : 0.022, bark, 0.012);
    if (type === 2 && i < 3) w.puff(p, [0.72, 0.3, 0.65], '#56634c');
    if (type === 3 && i % 2 === 0) w.puff(p, [0.22, 0.16, 0.25], '#a7a065', 'leaves', 0);
  }
  if (type === 2) {
    // Exposed pale splinters and an actual zigzag scar down the charcoal trunk.
    const scar = [];
    for (let i = 0; i <= 4; i++) {
      const t = 0.32 + i * 0.13, offset = i % 2 ? 0.065 : -0.065;
      // Follow the front hexagonal trunk face, with a small seating overlap.
      const front = 0.3 - 0.19 * t - Math.abs(offset) / Math.sqrt(3);
      scar.push([top[0] * t + offset, h * t, top[2] * t + front - 0.01]);
    }
    for (let i = 0; i < 4; i++) w.twig(scar[i], scar[i + 1], 0.025, '#ddb77b', 0.02, null);
    w.add(G.cone(0.1, 0.45, 5).translate(...top), '#c5a77b');
  }
  return w.done();
}

function litter(v) {
  const w = new Wild(3700 + v), colors = ['#bc6a3b', '#d59e42', '#a95347'];
  w.puff([0, 0.14, 0], [0.85 + v * 0.15, 0.19 + v * 0.04, 0.67], colors[v]);
  for (let i = 0; i < 17; i++) {
    const a = w.r() * TAU, d = Math.sqrt(w.r()) * 0.9;
    w.add(fan(0.17 + w.r() * 0.12, 2.6).rotateY(a).rotateZ((w.r() - 0.5) * 0.4).translate(Math.cos(a) * d, 0.13 + (1 - d) * 0.19, Math.sin(a) * d * 0.7), i % 3 ? colors[v] : '#edbf65', 'leaves');
  }
  return w.done();
}

function autumnBush(v) {
  const w = new Wild(3800 + v), colors = ['#bd5150', '#da7545', '#ad495e', '#dfa148'];
  for (let i = 0; i < 4; i++) {
    const a = i * 2.4, p = polar(a, 0.45 + v * 0.03, 0.65 + (i % 2) * 0.23);
    w.twig([0, 0.04, 0], p, 0.08, '#80604d', 0.03);
    w.puff(p, [0.57 + v * 0.03, 0.53, 0.56], colors[v]);
  }
  return w.done();
}

function swampTree(v) {
  const w = new Wild(3900 + v), h = 3.9 + v * 0.45, bark = '#71745b';
  w.twig([0, 0.28, 0], [0.25, h - 0.4, 0], 0.43, bark, 0.18);
  // Broad stilt roots meet the trunk well above the wet ground.
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6, bend = polar(a, 0.7, 0.65), foot = polar(a + 0.15, 1.25, 0.05);
    w.twig([0, 1.55, 0], bend, 0.18, bark, 0.13);
    w.twig(bend, foot, 0.13, bark, 0.05);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, p = polar(a, 1, h - 0.65 + (i % 2) * 0.35);
    w.twig([0.15, h * 0.53, 0], p, 0.15, bark, 0.05);
    w.puff(p, [1.02, 0.61, 0.92], ['#6c9064', '#779e6b', '#598577'][v]);
    if (i < 3) {
      const end = [p[0] * 0.95, p[1] - 1.3 - v * 0.15, p[2]];
      w.twig(p, end, 0.035, '#8e9d65', 0.013, 'fibres');
    }
  }
  return w.done();
}

function bogPlant(v) {
  const w = new Wild(4000 + v);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.42 + (i % 2) * 0.16, h = 0.65 + v * 0.18 + w.r() * 0.3;
    const p = polar(a, r, h * 0.52);
    w.twig([0, 0, 0], p, 0.035, '#679474', 0.018, 'fibres');
    // A flattened closed ellipsoid remains readable from underneath.
    w.add(G.sph(1, 7, 4).scale(0.22 + v * 0.03, 0.07, 0.51).rotateX(-0.35).rotateY(-a + Math.PI / 2).translate(...p), ['#709d7c', '#559d9b', '#879b61'][v], 'leaves');
  }
  w.twig([0, 0, 0], [0, 1.15 + v * 0.12, 0], 0.045, '#739776', 0.025, 'fibres');
  w.puff([0, 1.13 + v * 0.12, 0], [0.13, 0.25, 0.13], ['#dfac75', '#ae86af', '#d2b15a'][v], null);
  return w.done();
}

function bogShroom(v) {
  const w = new Wild(4100 + v), colors = ['#a66dc1', '#78a36a', '#cb7189', '#629baf'];
  for (let i = 0; i < 3; i++) {
    const p = polar(i * 2.4, i ? 0.38 : 0.08, 0), h = (i ? 0.5 : 0.82) + v * 0.08, r = i ? 0.31 : 0.49;
    w.twig(p, [p[0] + 0.04, h, p[2]], 0.1, '#d8c7a6', 0.075, 'fibres');
    const profile = [[0, h + 0.21], [r * 0.35, h + 0.2], [r * 0.85, h + 0.1], [r, h - 0.02], [r * 0.83, h - 0.08], [0, h - 0.06]];
    w.add(G.lathe(profile, 10).translate(p[0], 0, p[2]), colors[v], 'leaves');
    for (let j = 0; j < 4; j++) {
      const a = j * TAU / 4 + i, d = r * 0.52;
      w.puff([p[0] + Math.cos(a) * d, h + 0.14, p[2] + Math.sin(a) * d], [0.065, 0.035, 0.065], '#e2edae', null, 0);
    }
    w.add(G.tor(r * 0.73, 0.026, 4, 10).rotateX(Math.PI / 2).translate(p[0], h - 0.075, p[2]), '#a4d99a', null, 'gem');
  }
  return w.done({ color: colors[v], i: 0.35, d: 2, y: 0.75, flicker: false });
}

function grass(v, type) {
  const w = new Wild(4300 + v + type * 40);
  const palettes = [
    ['#bc9558', '#d4ad68', '#b38751', '#d5b482'],
    ['#5b997b', '#67968d', '#82a16c', '#4f8678'],
    ['#c0ab71', '#d3ba78', '#ac995c', '#cfaa65'],
    ['#51484a', '#65524b', '#76604d', '#4e5354'],
    ['#b4ad75', '#c9bb83', '#aab17f', '#d1bf8b'],
  ];
  const color = palettes[type][v], count = 12 + v * 3;
  for (let i = 0; i < count; i++) {
    const a = i * 2.4 + w.r() * 0.3, d = Math.sqrt(w.r()) * 0.36;
    const h = (type === 1 ? 0.85 : type === 3 ? 0.37 : 0.63) * (0.7 + w.r() * 0.75) * (1 + v * 0.1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    w.k.add(G.blade(type === 1 ? 0.065 : 0.035, h, type === 4 ? 0.5 : 0.25), color, { at: [x, 0, z], rot: [0, a, (w.r() - 0.5) * 0.5], kind: 'plant' });
    if (i % 4 === 0 && type !== 3) {
      const tip = [x + Math.sin(a) * 0.12, h * 0.88, z + Math.cos(a) * 0.12];
      w.twig([x, 0, z], tip, 0.019, color, 0.009, 'fibres');
      if (type !== 2) w.puff(tip, [0.045, 0.13, 0.045], type === 1 ? '#a18b65' : '#dfc78d', 'fibres', 0);
    }
  }
  return w.done();
}

export const ASSETS = {
  maple: { name: '枫树', n: 4, make: v => deciduous(v) },
  ginkgo: { name: '银杏', n: 2, make: v => deciduous(v, true) },
  leafPile: { name: '落叶堆', n: 3, make: litter },
  autumnBush: { name: '红叶灌木', n: 4, make: autumnBush },
  autumnGrass: { name: '枯草', n: 4, make: v => grass(v, 0) },
  snowPine: { name: '雪松', n: 4, make: v => conifer(v, true) },
  pineTree: { name: '松树', n: 4, make: v => conifer(v) },
  bareBush: { name: '枯枝丛', n: 3, make: v => woody(v, 0) },
  deadTree: { name: '枯树', n: 3, make: v => woody(v, 1) },
  stormPine: { name: '雷击松', n: 3, make: v => woody(v, 2) },
  dryShrub: { name: '旱生灌丛', n: 3, make: v => woody(v, 3) },
  swampTree: { name: '沼泽气根树', n: 3, make: swampTree },
  bogPlant: { name: '沼泽植物', n: 3, make: bogPlant },
  bogShroom: { name: '毒菇', n: 4, make: bogShroom },
  swampGrass: { name: '沼草', n: 4, make: v => grass(v, 1) },
  desertGrass: { name: '沙草', n: 4, make: v => grass(v, 2) },
  ashGrass: { name: '焦草', n: 4, make: v => grass(v, 3) },
  duneGrass: { name: '沙丘草', n: 4, make: v => grass(v, 4) },
};
