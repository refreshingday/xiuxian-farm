import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';

export const TEXTURES = {
  'codex/g6_ruins_stone': { norm: 0.9 },
  'codex/g6_ruins_wood': { norm: 0.9 },
  'codex/g6_ruins_cloth': { norm: 0.9 },
};
const STONE = '#9baea7', WOOD = '#aa7d50', GOLD = '#e6b45e', IRON = '#6d8690';
const TAU = Math.PI * 2;

// All transforms are baked; one mesh per textured material, plus Kit kinds.
class Prop {
  constructor() { this.k = new Kit(); this.buckets = new Map(); }
  add(g, color, at = [0, 0, 0], rot = [0, 0, 0], scale = 1, texture = '', kind = 'solid') {
    if (!texture) { this.k.add(g, color, { at, rot, s: scale, kind }); return; }
    g = g.index ? g.toNonIndexed() : g.clone();
    grad(color, 0.77, 1.12, 0.06)(g);
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s)));
    if (!this.buckets.has(texture)) this.buckets.set(texture, []);
    this.buckets.get(texture).push(g);
  }
  box(w, h, d, at, color = STONE, texture = 'stone', rot = [0, 0, 0]) {
    this.add(uvScale(G.box(w, h, d), Math.max(w, d), h), color, at, rot, 1, texture);
  }
  ball(at, scale, color, detail = 1) { this.add(G.ico(1, detail), color, at, [0, 0, 0], scale); }
  rod(a, b, radius, color = WOOD, texture = 'wood', sides = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(radius * 0.88, radius, d.length(), sides);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    this.add(g, color, A.add(B).multiplyScalar(0.5).toArray(), [0, 0, 0], 1, texture);
  }
  ring(r, t, at, color, rot = [-Math.PI / 2, 0, 0], kind = 'solid', arc = TAU) {
    this.add(G.tor(r, t, r < 0.2 ? 3 : 5, r < 0.2 ? 8 : 24, arc), color, at, rot, 1, '', kind);
  }
  done(light) {
    const group = this.k.build();
    for (const [name, geos] of this.buckets) group.add(texMesh(mergeGeometries(geos), 'g6_ruins_' + name, '#ffffff', { vc: true }));
    const bounds = new THREE.Box3().setFromObject(group);
    const shift = new THREE.Vector3(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    for (const mesh of group.children) if (mesh.isMesh) {
      mesh.geometry.translate(shift.x, shift.y, shift.z);
      mesh.geometry.computeBoundingSphere();
    }
    return finish(group, light ? { light } : {});
  }
}
const ember = (y, color = '#ff9e42') => ({ color, i: 0.85, d: 4, y, flicker: true });
function rubble(p, seed, radius = 0.7, count = 4) {
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const a = i * 2.4, s = 0.12 + r() * 0.12;
    p.add(G.ico(1, 0), STONE, [Math.cos(a) * radius, s * 0.45, Math.sin(a) * radius], [0, a, 0], [s * 1.5, s * 0.6, s], 'stone');
  }
}
function medallion(p, at, r = 0.16, color = GOLD) {
  p.add(new THREE.CylinderGeometry(r, r, 0.06, 8).rotateX(Math.PI / 2), color, at);
  p.box(r * 0.65, r * 0.65, 0.07, [at[0], at[1], at[2] + 0.03], '#90d8b2', '', [0, 0, Math.PI / 4]);
}
function cactus(v) {
  const p = new Prop(), green = ['#69a879', '#86b779', '#66a696', '#a0ad65'][v];
  const h = [1.65, 1.15, 2.05, 0.85][v], r = v === 3 ? 0.46 : 0.27;
  p.add(G.cyl(r * 0.92, r, h - r, 10), green);
  p.ball([0, h - r, 0], [r * 0.94, r, r * 0.94], green);
  if (v !== 3) for (let i = 0; i < (v === 2 ? 3 : 2); i++) {
    const side = i % 2 ? 1 : -1, y = 0.55 + i * 0.25;
    p.add(G.tube([[side * 0.15, y, 0], [side * 0.6, y + 0.05, 0], [side * 0.63, y + 0.5, 0]], 0.16, 0.13, 6), green);
    p.ball([side * 0.63, y + 0.5, 0], [0.13, 0.13, 0.13], green, 0);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, y = 0.25 + (i % 4) * (h - 0.4) / 4;
    p.add(G.cone(0.035, 0.13, 4).rotateZ(Math.PI / 2).rotateY(-a), '#eee1b2', [Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  if (v === 1 || v === 3) for (let i = 0; i < 5; i++) p.ball([Math.cos(i * TAU / 5) * 0.13, h, Math.sin(i * TAU / 5) * 0.13], [0.12, 0.07, 0.12], '#ed9d86', 0);
  return p.done();
}
function pillar(v) {
  const p = new Prop(), h = [2.4, 1.25, 1.9, 0.8][v];
  p.box(1.05, 0.22, 1.05, [0, 0.11, 0]);
  p.box(0.85, 0.16, 0.85, [0, 0.3, 0]);
  const g = G.cyl(0.34, 0.4, h, v === 2 ? 6 : 8);
  const a = g.attributes.position;
  for (let i = 0; i < a.count; i++) if (a.getY(i) > h * 0.99) a.setY(i, h + a.getX(i) * 0.3 + a.getZ(i) * 0.12);
  g.computeVertexNormals(); p.add(g, STONE, [0, 0.38, 0], [0, Math.PI / 8, 0], 1, 'stone');
  if (v === 0) { p.box(0.86, 0.2, 0.86, [0, h + 0.42, 0]); p.box(1.05, 0.16, 1.05, [0, h + 0.59, 0]); }
  medallion(p, [0, 0.9, 0.4], 0.17, '#798e83');
  if (v === 2) p.ring(0.36, 0.04, [0, 1.4, 0], '#8ee7c5', undefined, 'glow');
  p.ball([-0.29, 0.45, 0.27], [0.25, 0.11, 0.3], '#789c65', 0);
  rubble(p, 41 + v); return p.done();
}
function ruinWall(v) {
  const p = new Prop(), rows = [3, 2, 4][v];
  for (let y = 0; y < rows; y++) for (let x = 0; x < 4 - Math.max(0, y - 1); x++) {
    if (v === 2 && y === 1 && x === 2) continue;
    p.box(0.69, 0.43, 0.5, [(x - 1.5) * 0.73 + (y % 2) * 0.15, 0.22 + y * 0.46, 0], STONE, 'stone', [0, 0, y === rows - 1 ? (x - 1) * 0.045 : 0]);
  }
  p.box(3.05, 0.14, 0.67, [0, 0.07, 0]);
  for (let i = 0; i < 3; i++) p.ball([-0.95 + i * 0.67, 0.13, 0.29], [0.3, 0.08, 0.19], '#82a065', 0);
  rubble(p, 65 + v, 1.35); return p.done();
}
function statue(v) {
  const p = new Prop();
  p.add(G.ico(1, 1), '#aab198', [0, 0.16, 0], [0, 0.3, 0], [1, 0.23, 0.8], 'stone');
  p.add(G.cyl(0.38, 0.65, v ? 0.6 : 0.85, 8), STONE, [0, 0.13, 0], [0, 0, v ? -0.18 : 0], 1, 'stone');
  p.ball([0, v ? 0.99 : 1.31, 0], [0.44, 0.49, 0.4], STONE);
  const y = v ? 1.04 : 1.35;
  p.box(0.48, 0.09, 0.08, [0, y + 0.05, 0.37], '#748b85', 'stone');
  p.box(0.14, 0.19, 0.15, [0, y - 0.04, 0.39]);
  for (const s of [-1, 1]) {
    p.box(0.12, 0.06, 0.05, [s * 0.16, y, 0.41], '#586c64', '');
    p.ball([s * 0.46, 0.66, 0.08], [0.23, 0.3, 0.25], STONE);
  }
  if (!v) { p.add(G.cone(0.4, 0.42, 6), '#8f9e94', [0, 1.65, 0], [0, 0, 0], 1, 'stone'); medallion(p, [0, 0.77, 0.51]); }
  else p.ball([0.31, 1.2, -0.03], [0.24, 0.13, 0.31], '#83a26f');
  return p.done();
}
function sword(v) {
  const p = new Prop(), h = [1.2, 1.65, 0.85, 1.4][v], c = [IRON, '#8baaa8', '#a98569', '#8e86ae'][v];
  p.ball([0, 0.13, 0], [0.56, 0.2, 0.43], STONE, 0);
  const shape = new THREE.Shape(); shape.moveTo(-0.13, 0); shape.lineTo(0.15, 0.05); shape.lineTo(0.13, h); shape.lineTo(-0.04, h - 0.09); shape.lineTo(-0.12, h);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.025, bevelThickness: 0.025 });
  p.add(g, c, [0, 0.12, -0.045]);
  p.box(0.66, 0.12, 0.18, [0, h + 0.16, 0], GOLD, '');
  p.rod([0, h + 0.2, 0], [-0.04, h + 0.58, 0], 0.09, '#784e49', '');
  p.ball([-0.04, h + 0.62, 0], [0.13, 0.11, 0.11], GOLD, 0);
  if (v === 3) p.rod([0.2, h + 0.12, 0], [0.28, h - 0.25, 0.04], 0.045, '#ca695e', '');
  return p.done();
}
function banner(v) {
  const p = new Prop(), h = [2.2, 1.85, 2.5][v];
  p.ball([0, 0.12, 0], [0.45, 0.15, 0.4], STONE, 0);
  p.rod([0, 0.1, 0], [0, h, 0], 0.065);
  p.rod([-0.13, h - 0.12, 0], [0.98, h - 0.12, 0], 0.05);
  const s = new THREE.Shape(); s.moveTo(0.08, h - 0.15); s.lineTo(1, h - 0.15); s.lineTo(0.92, h - 1.02); s.lineTo(0.66, h - 0.8); s.lineTo(0.49, h - 1.16); s.lineTo(0.3, h - 0.89); s.lineTo(0.08, h - 1.1);
  p.add(new THREE.ExtrudeGeometry(s, { depth: 0.055, bevelEnabled: false, steps: 1 }), ['#ce7963', '#7caaa1', '#b39ac2'][v], [0, 0, -0.025], [0, 0, 0], 1, 'cloth');
  medallion(p, [0.49, h - 0.54, 0.055], 0.2);
  p.add(G.cone(0.11, 0.24, 5), GOLD, [0, h, 0]);
  return p.done();
}
function shield(v) {
  const p = new Prop();
  if (v < 2) {
    p.add(new THREE.CylinderGeometry(0.55, 0.55, 0.15, v ? 6 : 10).rotateX(Math.PI / 2), v ? '#a66e50' : '#789496', [0, 0.56, 0], [0, 0, 0], 1, v ? 'wood' : '');
    p.ring(0.5, 0.045, [0, 0.56, 0.11], GOLD, [0, 0, 0]); medallion(p, [0, 0.56, 0.15], 0.19);
    p.rod([-0.26, 0.2, -0.12], [0.26, 0.82, -0.12], 0.045, WOOD);
  } else {
    p.add(G.lathe([[0, 0.52], [0.25, 0.46], [0.44, 0.28], [0.52, 0], [0.45, 0], [0.38, 0.24], [0.21, 0.39], [0, 0.45]], 10), IRON, [0, 0.12, 0]);
    p.ring(0.52, 0.06, [0, 0.12, 0], GOLD);
    p.box(0.1, 0.4, 0.09, [0, 0.22, 0.48], GOLD, '');
    p.add(G.cone(0.12, 0.3, 5), GOLD, [0, 0.6, 0]);
    for (const x of [-0.37, 0.37]) p.box(0.13, 0.32, 0.15, [x, 0.08, 0.23], IRON, '');
  }
  return p.done();
}
function grave(v) {
  const p = new Prop();
  p.ball([0, 0.18, 0.08], [0.8, 0.25, 0.9], ['#8a9773', '#ad9474', '#9baea7'][v]);
  p.box(0.7, 0.16, 0.36, [0, 0.24, -0.42]);
  p.box(v === 1 ? 0.44 : 0.62, 0.76, 0.24, [0, 0.66, -0.42]);
  p.add(new THREE.CylinderGeometry(0.31, 0.31, 0.24, 10).rotateX(Math.PI / 2), STONE, [0, 1.02, -0.42], [0, 0, 0], [1, v === 1 ? 0.6 : 1, 1], 'stone');
  medallion(p, [0, 0.83, -0.25], 0.14, '#75887f');
  if (v === 2) { p.box(0.53, 0.08, 0.12, [0, 0.3, 0.69], '#debc82', ''); p.ball([0, 0.4, 0.68], [0.13, 0.12, 0.13], '#edb2b0', 0); }
  return p.done();
}
function wreck(v) {
  const p = new Prop();
  for (let i = 0; i < 5; i++) p.box(0.26, 0.14, 1.52 - (i === 4 ? 0.4 : 0), [(i - 2) * 0.28, 0.51, 0], WOOD, 'wood', [0, (i - 2) * 0.025, 0]);
  p.rod([-1, 0.44, 0], [1, 0.44, 0], 0.08, IRON, '');
  for (const side of [-1, 1]) {
    if (v === 1 && side === 1) continue;
    p.ring(0.48, 0.07, [side * 0.86, 0.49, 0], WOOD, [0, Math.PI / 2, 0], 'solid', v === 0 && side === 1 ? TAU * 0.75 : TAU);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.2; p.rod([side * 0.86, 0.49, 0], [side * 0.86, 0.49 + Math.sin(a) * 0.43, Math.cos(a) * 0.43], 0.035); }
    p.box(0.12, side < 0 ? 0.58 : 0.3, 1.45, [side * 0.66, 0.8, 0], WOOD);
  }
  for (const x of [-0.48, 0.48]) p.rod([x, 0.48, 0.5], [x * 1.3, 0.15, 1.55 - v * 0.4], 0.07);
  if (v) { p.ring(0.48, 0.07, [0.95, 0.11, 0.5], WOOD); p.rod([0.5, 0.11, 0.5], [1.4, 0.11, 0.5], 0.035); }
  return p.done();
}
function formation(v) {
  const p = new Prop(), c = v ? '#dda1fa' : '#8de5cb';
  p.add(G.cyl(2.45, 2.5, 0.12, 32), '#80969b', [0, 0, 0], [0, 0, 0], 1, 'stone');
  for (const r of [1.1, 1.8, 2.28]) p.ring(r, 0.025, [0, 0.14, 0], c, undefined, 'glow');
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, x = Math.cos(a), z = Math.sin(a);
    p.add(G.tor(0.14, 0.025, 4, v ? 4 : 6).rotateX(-Math.PI / 2), c, [x * 2.05, 0.15, z * 2.05], [0, -a, 0], 1, '', 'glow');
    p.add(G.box(0.3, 0.035, 0.04), c, [x * 1.45, 0.15, z * 1.45], [0, -a, 0], 1, '', 'glow');
    if (v && i % 2 === 0) p.add(G.cone(0.12, 0.32, 5), '#ae97cd', [x * 2.32, 0.12, z * 2.32]);
  }
  for (let i = 0; i < (v ? 4 : 3); i++) p.add(G.box(1.45, 0.035, 0.045), c, [0, 0.15, 0], [0, i * Math.PI / (v ? 4 : 3), 0], 1, '', 'glow');
  return p.done({ color: c, i: 0.6, d: 5, y: 0.3 });
}
function stairs(v) {
  const p = new Prop(), n = v ? 6 : 5;
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * 1.5 / n;
    p.box(2, h, 3 / n + 0.025, [0, h / 2, 1.5 - (i + 0.5) * 3 / n]);
    if (v) for (const side of [-1, 1]) p.box(0.15, 0.12, 3 / n, [side * 0.94, h + 0.06, 1.5 - (i + 0.5) * 3 / n], '#bac4ad');
  }
  if (!v) for (let i = 0; i < 3; i++) p.ball([-0.8 + i * 0.07, 0.31 + i * 0.3, 1.24 - i * 0.6], [0.16, 0.035, 0.13], '#85a76b', 0);
  return p.done();
}
function logSteps(v) {
  const p = new Prop();
  for (let i = 0; i < 5; i++) for (let j = 0; j < (v ? 3 : 4); j++) {
    const h = (i + 1) * 0.3, x = (j - (v ? 1 : 1.5)) * (v ? 0.57 : 0.46), z = 1.2 - i * 0.6;
    p.add(G.cyl(v ? 0.29 : 0.24, v ? 0.32 : 0.27, h, 6), WOOD, [x, 0, z], [0, 0, 0], 1, 'wood');
    p.add(G.cyl(v ? 0.25 : 0.2, v ? 0.25 : 0.2, 0.018, 6), '#dbbb85', [x, h, z]);
    p.ring(v ? 0.15 : 0.12, 0.012, [x, h + 0.02, z], '#ad875c');
  }
  return p.done();
}
function ladder(v) {
  const p = new Prop(), top = 1.6, back = -0.7;
  for (const x of [-0.49, 0.49]) p.rod([x, 0.06, 0.75], [x, top + 0.22, back - 0.2], v ? 0.075 : 0.06, v ? '#8a9e68' : WOOD);
  for (let i = 0; i < 7; i++) {
    const t = 0.07 + i * 0.135, y = 0.06 + t * (top + 0.16), z = 0.75 + t * (back - 0.95);
    p.rod([-0.52, y, z], [0.52, y, z], 0.055, v ? '#bbba7d' : '#c8a172');
    if (v) for (const x of [-0.49, 0.49]) p.ball([x, y, z], [0.085, 0.07, 0.08], '#e1c397', 0);
  }
  return p.done();
}
function bones(v) {
  const p = new Prop(), c = '#e2d6b3';
  p.ball([0, 0.3, 0.35], [0.49, 0.34, 0.52], c);
  p.ball([0, 0.2, 0.78], [0.32, 0.18, 0.36], c, 0);
  for (const side of [-1, 1]) {
    p.ball([side * 0.25, 0.44, 0.66], [0.13, 0.12, 0.08], '#857b65', 0);
    p.add(G.tube([[side * 0.3, 0.43, 0.23], [side * 0.65, 0.7, 0.08], [side * (v ? 0.88 : 0.68), 0.91, -0.14]], 0.13, 0.015, 6), c);
  }
  if (!v) {
    p.rod([0, 0.2, 0.13], [0, 0.22, -1], 0.09, c, '');
    for (let i = 0; i < 4; i++) {
      p.ring(0.3 + i * 0.035, 0.045, [0, 0.12, -0.2 - i * 0.22], c, [0, 0, 0], 'solid', Math.PI);
    }
  } else for (const side of [-1, 1]) {
    const a = [side * 0.7, 0.12, -0.35], b = [-side * 0.5, 0.12, -0.9];
    p.rod(a, b, 0.075, c, '');
    for (const q of [a, b]) p.ball(q, [0.12, 0.11, 0.12], c, 0);
  }
  return p.done();
}
function fireFlower(v) {
  const p = new Prop(), h = [0.72, 1.05, 0.5][v], col = ['#ef8550', '#f5b250', '#ec6660'][v];
  p.rod([0, 0, 0], [0, h, 0], 0.055, '#728252', '');
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    p.add(G.ico(1, 0), '#8e994c', [Math.cos(a) * 0.19, 0.18, Math.sin(a) * 0.19], [0, -a, 0.5], [0.28, 0.08, 0.13]);
    p.add(G.ico(1, 1), col, [Math.cos(a) * 0.2, h + 0.12, Math.sin(a) * 0.2], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], [0.14, 0.31, 0.14]);
  }
  p.add(G.cone(0.18, 0.46, 6), '#ffe69b', [0, h - 0.02, 0], [0, 0, 0], 1, '', 'glow');
  return p.done(ember(h));
}
function vent(v) {
  const p = new Prop();
  p.add(G.cyl(0.73, 0.9, 0.12, 12), '#584f4a', [0, 0, 0], [0, 0, 0], 1, 'stone');
  p.add(G.cyl(0.43, 0.43, 0.025, 12), v ? '#dfcf64' : '#ff9d4c', [0, 0.12, 0], [0, 0, 0], 1, '', 'glow');
  for (let i = 0; i < 9; i++) { const a = i * TAU / 9; p.add(G.ico(1, 0), v ? '#a99d59' : '#78695d', [Math.cos(a) * 0.63, 0.23, Math.sin(a) * 0.63], [0, a, 0], [0.32, 0.27 + (i % 3) * 0.04, 0.29], 'stone'); }
  for (let i = 0; i < 3; i++) p.add(G.cone(0.13, 0.3 + i * 0.16, 5), v ? '#eee790' : '#ffbe69', [(i - 1) * 0.2, 0.14, 0], [0, 0, (i - 1) * 0.2], 1, '', 'glow');
  return p.done({ ...ember(0.4, v ? '#e6da78' : '#ff9e42'), smoke: true });
}
function snowman(v) {
  const p = new Prop(), c = '#edf3ed';
  p.ball([0, 0.49, 0], [0.62, 0.51, 0.58], c);
  p.ball([0, 1.12, 0], [0.43, 0.4, 0.42], c);
  for (const side of [-1, 1]) {
    p.ball([side * 0.14, 1.18, 0.38], [0.05, 0.06, 0.045], '#455b60', 0);
    p.rod([side * 0.43, 0.75, 0], [side * 0.92, v ? 1.2 : 0.9, 0.04], 0.045);
    p.rod([side * 0.79, v ? 1.07 : 0.87, 0.03], [side * 0.85, v ? 1.28 : 1.06, 0.03], 0.027);
  }
  p.add(G.cone(0.08, 0.25, 6).rotateX(Math.PI / 2), '#eaa26b', [0, 1.08, 0.37]);
  for (let i = 0; i < 2; i++) p.ball([0, 0.55 + i * 0.2, 0.55 - i * 0.05], [0.05, 0.05, 0.04], '#617270', 0);
  p.ring(0.34, 0.08, [0, 0.91, 0], v ? '#87b1b5' : '#d77e68');
  p.box(0.16, 0.42, 0.09, [0.22, 0.7, 0.48], v ? '#87b1b5' : '#d77e68', 'cloth');
  if (v) {
    p.add(G.cone(0.52, 0.29, 10), '#bd9c67', [0, 1.42, 0]);
    p.add(G.cyl(0.11, 0.11, 0.09, 8), '#e6c690', [0, 1.69, 0]);
  } else {
    p.add(G.cyl(0.45, 0.45, 0.08, 10), '#627a88', [0, 1.44, 0]);
    p.add(G.cyl(0.29, 0.33, 0.32, 8), '#627a88', [0, 1.5, 0]);
    p.ring(0.32, 0.035, [0, 1.55, 0], '#dfa374');
  }
  return p.done();
}

export const ASSETS = {
  cactus: { name: '仙人掌', n: 4, make: cactus },
  pillar: { name: '遗迹石柱', n: 4, make: pillar },
  ruinWall: { name: '遗迹残墙', n: 3, make: ruinWall },
  statue: { name: '半埋石像', n: 2, make: statue },
  sword: { name: '残剑', n: 4, make: sword },
  banner: { name: '残旗', n: 3, make: banner },
  shield: { name: '盾/盔', n: 3, make: shield },
  grave: { name: '坟冢', n: 3, make: grave },
  wreck: { name: '破战车', n: 2, make: wreck },
  formation: { name: '渡劫法阵', n: 2, make: formation },
  stairs: { name: '石阶', n: 2, make: stairs },
  logSteps: { name: '木桩台阶', n: 2, make: logSteps },
  ladder: { name: '木梯', n: 2, make: ladder },
  bones: { name: '兽骨', n: 2, make: bones },
  fireFlower: { name: '火焰花', n: 3, make: fireFlower },
  vent: { name: '地火/硫磺口', n: 2, make: vent },
  snowman: { name: '雪人', n: 2, make: snowman },
};
