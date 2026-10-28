import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';

export const TEXTURES = {
  'codex/g1_village_wood': { norm: 0.9 },
  'codex/g1_village_stone': { norm: 0.9 },
  'codex/g1_village_clay': { norm: 0.9 },
};
const C = { wood: '#ad7950', dark: '#654536', gold: '#d8b464', jade: '#72a98b', stone: '#98a9ac', iron: '#526365', straw: '#e0bb6e', red: '#bb5142' };
const TAU = Math.PI * 2;

// Bake transforms and colour before merging: one mesh per texture, plus Kit kinds.
class Builder {
  constructor() { this.k = new Kit(); this.tex = {}; }
  add(g, color, at = [0, 0, 0], rot = [0, 0, 0], texture = null, kind = 'solid') {
    if (!texture) { this.k.add(g, color, { at, rot, kind }); return; }
    g = g.index ? g.toNonIndexed() : g.clone();
    grad(color)(g);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    g.translate(...at);
    // Use a neutral material tint: the per-part colours are already baked in.
    (this.tex[texture] ||= []).push(g);
  }
  box(w, h, d, at, color = C.wood, rot = [0, 0, 0], texture = 'wood') {
    this.add(uvScale(G.box(w, h, d), Math.max(w, d), h), color, at, rot, texture);
  }
  rod(a, b, radius = 0.045, color = C.dark, texture = null) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), delta = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    this.add(g, color, A.add(B).multiplyScalar(0.5).toArray(), [0, 0, 0], texture);
  }
  ring(r, t, y, color, x = 0, z = 0) {
    this.add(G.tor(r, t, 4, 12), color, [x, y, z], [Math.PI / 2, 0, 0]);
  }
  done(light) {
    const group = this.k.build();
    for (const [name, parts] of Object.entries(this.tex)) {
      const g = mergeGeometries(parts);
      group.add(texMesh(g, `g1_village_${name}`, '#ffffff', { vc: true }));
    }
    // Keep every variant centred on its actual footprint and grounded at y=0.
    const bounds = new THREE.Box3().setFromObject(group), c = bounds.getCenter(new THREE.Vector3());
    for (const child of group.children) child.position.sub(new THREE.Vector3(c.x, bounds.min.y, c.z));
    if (light) light = { ...light, y: light.y - bounds.min.y };
    return finish(group, { light });
  }
}

function roof(b, width, depth, y, color = C.jade) {
  // Solid curved gable with upturned eaves, thickness, and a raised ridge.
  const p = [[-width / 2, .12], [-width * .38, .04], [0, .48], [width * .38, .04], [width / 2, .12]];
  const s = new THREE.Shape(); s.moveTo(p[0][0], p[0][1]);
  for (const [x, h] of p.slice(1)) s.lineTo(x, h);
  for (const [x, h] of [...p].reverse()) s.lineTo(x, h - .12);
  s.closePath();
  b.add(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 }), color, [0, y, -depth / 2]);
  b.rod([0, y + .51, -depth / 2 - .04], [0, y + .51, depth / 2 + .04], .065, C.gold);
  for (const z of [-depth / 2, depth / 2]) for (let i = 0; i < p.length - 1; i++) {
    b.rod([p[i][0], y + p[i][1], z], [p[i + 1][0], y + p[i + 1][1], z], .045, C.dark);
  }
}

function pot(b, r, h, at, color, lid = false) {
  // Closed cross-section includes the inner wall and floor: genuinely hollow.
  const profile = [[0, 0], [r * .65, 0], [r, h * .3], [r * .95, h * .65], [r * .58, h * .86], [r * .61, h], [r * .46, h], [r * .44, h * .86], [r * .8, h * .62], [r * .83, h * .3], [r * .52, .08], [0, .08]];
  b.add(G.lathe(profile, 12), color, at, [0, 0, 0], 'clay');
  b.ring(r * .55, .035, at[1] + h, C.gold, at[0], at[2]);
  if (lid) {
    b.add(G.cone(r * .67, .11, 12), color, [at[0], at[1] + h, at[2]], [0, 0, 0], 'clay');
    b.add(G.sph(.07, 8, 4), C.gold, [at[0], at[1] + h + .14, at[2]]);
  }
}

function well(v) {
  const b = new Builder(), r = .71, h = .78;
  b.add(G.lathe([[.51, 0], [r, 0], [r, h], [.51, h], [.51, 0]], 12), C.stone, [0, 0, 0], [0, 0, 0], 'stone');
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    b.box(.32, .16, .25, [Math.sin(a) * .63, .8, Math.cos(a) * .63], '#bdc9bd', [0, a, 0], 'stone');
  }
  b.add(G.cyl(.5, .5, .025, 16), '#467e88', [0, .19, 0]);
  for (const x of [-.88, .88]) b.box(.16, 1.82, .18, [x, .91, 0], v ? C.red : C.wood);
  b.rod([-.98, 1.58, 0], [.99, 1.58, 0], .08, C.wood, 'wood');
  b.rod([1, 1.58, 0], [1, 1.28, 0], .045, C.iron);
  b.rod([1, 1.28, 0], [1.17, 1.28, 0], .055, C.wood);
  for (let i = 0; i < 5; i++) b.add(G.tor(.095, .018, 4, 10), C.straw, [-.12 + i * .045, 1.58, 0], [0, Math.PI / 2, 0]);
  b.rod([0, .5, 0], [0, 1.58, 0], .018, C.straw);
  if (v === 0) roof(b, 2.25, 1.42, 1.88);
  else { b.box(1.98, .18, .24, [0, 1.9, 0], C.red); pot(b, .17, .26, [.45, .88, .18], '#b77c55'); }
  return b.done();
}

function scarecrow(v) {
  const b = new Builder(), shirt = v ? '#7393a1' : '#b8754c';
  b.rod([0, 0, 0], [0, 1.65, 0], .065, C.wood, 'wood');
  b.rod([-.7, 1.15, 0], [.7, 1.15, 0], .055, C.wood);
  b.add(G.cone(.29, .58, 7), shirt, [0, .69, 0]);
  for (const side of [-1, 1]) {
    b.box(.4, .23, .25, [side * .36, 1.12, 0], shirt, [0, 0, side * (v ? -.18 : .1)], null);
    for (let i = 0; i < 3; i++) b.rod([side * .57, 1.12, (i - 1) * .055], [side * (.76 + i * .025), 1.04 + i * .06, (i - 1) * .075], .025, C.straw);
  }
  for (let i = 0; i < 7; i++) b.rod([(i - 3) * .045, .9, 0], [(i - 3) * .08, .63, .02], .025, C.straw);
  b.add(G.sph(.23, 10, 6), C.straw, [0, 1.5, 0]);
  b.add(G.cyl(.39, .39, .055, 12), C.straw, [0, 1.67, 0]);
  b.add(G.cone(.32, v ? .3 : .2, 12), '#cb9d54', [0, 1.72, 0]);
  for (const x of [-.075, .075]) b.add(G.sph(.027, 6, 4), C.dark, [x, 1.52, .211]);
  b.rod([-.06, 1.41, .218], [.06, 1.41, .218], .014, C.dark);
  b.box(.14, .23, .035, [.09, 1, .23], '#e7cb86', [0, 0, -.2], null);
  b.ring(.205, .03, 1.29, v ? C.red : C.jade);
  return b.done();
}

function fence(v) {
  const b = new Builder(), length = v === 3 ? 1.5 : 1.9, col = v === 2 ? C.jade : C.wood;
  for (const x of [-length / 2, length / 2]) {
    b.box(.16, .96, .18, [x, .48, 0], col);
    b.add(G.cone(.135, .15, 4), C.gold, [x, .96, 0], [0, Math.PI / 4, 0]);
  }
  for (const y of [.32, .73]) b.box(length, .11, .12, [0, y, -.015], col);
  if (v === 0 || v === 2) for (let i = 0; i < 5; i++) {
    const x = (i - 2) * length / 6;
    b.box(.13, .78 + (i % 2) * .12, .11, [x, .48, .065], col);
  }
  else if (v === 1) {
    b.rod([-.8, .22, .08], [.8, .82, .08], .055, C.wood, 'wood');
    b.rod([.8, .22, .1], [-.8, .82, .1], .055, C.wood, 'wood');
  } else for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * .3;
    b.rod([x, .12, .06], [x, .83, .06], .045, C.straw);
    b.ring(.065, .018, .72, C.dark, x, .06);
  }
  return b.done();
}

function barrel(v) {
  const b = new Builder(), r = v === 1 ? .32 : .41, h = v === 1 ? 1 : v === 2 ? .55 : .79;
  b.add(G.lathe([[0, 0], [r * .8, 0], [r, h * .4], [r * .98, h * .65], [r * .82, h], [r * .68, h], [r * .8, h * .6], [r * .66, .09], [0, .09]], 12), C.wood, [0, 0, 0], [0, 0, 0], 'wood');
  for (const y of [.13 * h, .8 * h]) b.ring(r * (y < h / 2 ? .89 : .91), .038, y, v === 2 ? C.straw : C.iron);
  if (v !== 2) for (let i = -2; i <= 2; i++) {
    const z = i * r * .27, w = 2 * Math.sqrt((r * .76) ** 2 - z * z);
    b.box(w, .05, r * .255, [0, h - .035, z], i % 2 ? '#b98451' : '#cc995f');
  }
  else b.add(G.cyl(r * .72, r * .72, .02, 12), '#638f9b', [0, h * .57, 0]);
  return b.done();
}

function crate(v) {
  const b = new Builder(), w = v === 1 ? .96 : .72, h = v === 2 ? .46 : .7, d = .67;
  b.box(w - .1, .08, d - .1, [0, .04, 0], C.dark);
  for (let i = 0; i < 3; i++) {
    const y = .14 + i * (h - .18) / 3;
    for (const z of [-d / 2, d / 2]) b.box(w, (h - .2) / 3, .075, [0, y, z]);
    for (const x of [-w / 2, w / 2]) b.box(.075, (h - .2) / 3, d, [x, y, 0]);
  }
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(.1, h, .1, [x, h / 2, z], C.dark);
  if (v !== 2) {
    for (let i = 0; i < 4; i++) b.box(w, .065, d / 4 - .012, [0, h - .025, (i - 1.5) * d / 4]);
    for (const z of [-d / 2 - .05, d / 2 + .05]) b.rod([-w * .4, .1, z], [w * .4, h - .08, z], .055, '#d6af75', 'wood');
  } else for (const x of [-w / 2 - .045, w / 2 + .045]) b.box(.035, .065, .21, [x, h - .12, 0], C.dark, [0, 0, 0], null);
  return b.done();
}

function jar(v) {
  const b = new Builder(), colors = ['#be7854', '#709b91', '#8d7da4', '#c5a05e'];
  const r = [.37, .31, .44, .27][v], h = [.72, .91, .6, .55][v];
  pot(b, r, h, [0, 0, 0], colors[v], v === 1 || v === 3);
  if (v === 2) for (const x of [-r * .92, r * .92]) b.add(G.tor(.1, .035, 4, 8), colors[v], [x, h * .65, 0], [0, Math.PI / 2, 0], 'clay');
  if (v === 3) b.box(.12, .2, .035, [0, h * .55, r * .95], '#edcf84', [0, 0, -.08], null);
  return b.done();
}

function sign(v) {
  const b = new Builder();
  b.box(.16, 1.25, .16, [0, .625, 0], C.dark);
  const arrow = (y, dir, color) => {
    const s = new THREE.Shape(); s.moveTo(-.57, -.16); s.lineTo(.36, -.16); s.lineTo(.63, 0); s.lineTo(.36, .19); s.lineTo(-.57, .19); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: false });
    if (dir < 0) g.rotateY(Math.PI);
    b.add(g, color, [0, y, dir > 0 ? .04 : .16], [0, 0, 0], 'wood');
    // Raised jade lozenge emblem, readable from above; intentionally no lettering.
    b.box(.13, .13, .035, [0, y + .02, .18], C.jade, [0, 0, Math.PI / 4], null);
  };
  arrow(1.08, 1, '#d3a368');
  if (v) arrow(.69, -1, '#ab7d51');
  b.add(G.ico(.22, 0).scale(1.4, .55, 1), C.stone, [0, .1, 0], [0, 0, 0], 'stone');
  return b.done();
}

function stoneLan(v) {
  const b = new Builder(), s = [1, .8, 1.18][v], y = 1.02 * s;
  b.box(.7 * s, .16 * s, .7 * s, [0, .08 * s, 0], C.stone, [0, 0, 0], 'stone');
  b.add(G.cyl(.17 * s, .26 * s, .65 * s, v === 1 ? 6 : 8), C.stone, [0, .16 * s, 0], [0, 0, 0], 'stone');
  b.box(.58 * s, .13 * s, .58 * s, [0, .87 * s, 0], '#b6c4b8', [0, 0, 0], 'stone');
  b.add(G.sph(.18 * s, 8, 6), v === 2 ? '#9ce4ca' : '#ffcc7a', [0, y, 0], [0, 0, 0], null, 'glow');
  for (const x of [-.23, .23]) for (const z of [-.23, .23]) b.box(.075 * s, .39 * s, .075 * s, [x * s, 1.08 * s, z * s], C.stone, [0, 0, 0], 'stone');
  b.add(G.cone(.55 * s, .28 * s, v === 1 ? 6 : 4), C.stone, [0, 1.28 * s, 0], [0, Math.PI / 4, 0], 'stone');
  b.add(G.sph(.1 * s, 8, 4), C.jade, [0, 1.62 * s, 0]);
  return b.done({ color: v === 2 ? '#91e5c3' : '#ffc07a', i: .65, d: 3.4, y, flicker: false });
}

function lanPost(v) {
  const b = new Builder(), y = v ? 1.65 : 1.5, color = v ? C.jade : C.red;
  b.box(.42, .18, .42, [0, .09, 0], C.stone, [0, 0, 0], 'stone');
  b.box(.15, 2.1, .15, [0, 1.2, 0], C.dark);
  b.box(.92, .12, .14, [.3, 2.19, 0], C.red);
  b.rod([.07, 1.81, 0], [.42, 2.15, 0], .045, C.wood);
  b.rod([.64, y + .3, 0], [.64, 2.19, 0], .025, C.gold);
  b.add(G.sph(.32, 12, 8).scale(1, v ? 1.18 : .9, 1), color, [.64, y, 0]);
  b.add(G.sph(.17, 8, 6), '#ffd996', [.64, y, .235], [0, 0, 0], null, 'glow');
  for (const dy of [-.29, .29]) b.add(G.cyl(.2, .2, .055, 10), C.gold, [.64, y + dy, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    b.rod([.64 + Math.cos(a) * .18, y - .27, Math.sin(a) * .18], [.64 + Math.cos(a) * .32, y, Math.sin(a) * .32], .018, C.gold);
    b.rod([.64 + Math.cos(a) * .32, y, Math.sin(a) * .32], [.64 + Math.cos(a) * .18, y + .29, Math.sin(a) * .18], .018, C.gold);
  }
  b.rod([.64, y - .32, 0], [.64, y - .57, 0], .035, C.red);
  return b.done({ color: '#ffc07a', i: .85, d: 4.2, y, flicker: true });
}

function steps(v) {
  const b = new Builder(), rng = mulberry32(180 + v), count = v === 0 ? 3 : v === 1 ? 5 : 4;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * .55, z = v === 2 ? Math.sin(i * 1.6) * .3 : (rng() - .5) * .22;
    const g = G.cyl(.28 + rng() * .07, .32 + rng() * .05, .1 + rng() * .06, 7);
    g.scale(1.2, 1, .82); g.rotateY(rng());
    b.add(g, v === 1 ? '#b8b49c' : C.stone, [x, 0, z], [0, 0, 0], 'stone');
    if (v === 2) b.add(G.ico(.1, 0).scale(1.2, .2, .7), '#88a36d', [x + .12, .14, z + .1]);
  }
  return b.done();
}

function bridge(v) {
  const b = new Builder(), L = v ? 4.8 : 4.2, N = 16, width = v ? 1.55 : 1.35;
  const arch = x => .18 + .63 * (1 - (2 * x / L) ** 2);
  const col = v ? C.red : C.wood;
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + (i + .5) * L / N, slope = -5.04 * x / (L * L);
    b.box(L / N - .012, .16, width, [x, arch(x), 0], v ? '#c18e60' : '#bc955f', [0, 0, Math.atan(slope)]);
  }
  // Two continuous arched structural beams under the deck, rails above it.
  for (const z of [-width * .44, width * .44]) for (let i = 0; i < N; i++) {
    const x0 = -L / 2 + i * L / N, x1 = x0 + L / N;
    b.rod([x0, arch(x0) - .13, z], [x1, arch(x1) - .13, z], .105, C.dark, 'wood');
    b.rod([x0, arch(x0) + .76, z], [x1, arch(x1) + .76, z], .065, col, 'wood');
    if (v) b.rod([x0, arch(x0) + .4, z], [x1, arch(x1) + .4, z], .04, C.red);
  }
  for (const z of [-width * .44, width * .44]) for (let i = 0; i < 5; i++) {
    const x = -L / 2 + i * L / 4, y = arch(x);
    b.box(.12, .86, .12, [x, y + .32, z], col);
    b.add(G.sph(.09, 6, 4), v ? C.gold : C.jade, [x, y + .79, z]);
    if (i === 0 || i === 4) b.box(.4, .16, .42, [x, .035, z], C.stone, [0, 0, 0], 'stone');
  }
  return b.done();
}

export const ASSETS = {
  well: { name: '水井', n: 2, make: well },
  scarecrow: { name: '稻草人', n: 2, make: scarecrow },
  fence: { name: '篱笆', n: 4, make: fence },
  barrel: { name: '木桶', n: 3, make: barrel },
  crate: { name: '木箱', n: 3, make: crate },
  jar: { name: '陶罐', n: 4, make: jar },
  sign: { name: '路牌', n: 2, make: sign },
  stoneLan: { name: '石灯笼', n: 3, make: stoneLan },
  lanPost: { name: '灯笼柱', n: 2, make: lanPost },
  steps: { name: '踏脚石', n: 3, make: steps },
  bridge: { name: '拱桥', n: 2, make: bridge },
};
