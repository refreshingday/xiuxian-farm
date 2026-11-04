// 门派 6、7：百花谷、丹鼎派（规划见 SECTS.md）。规矩同 sectsites2.js：本地坐标，正门朝 +z；边缘 0 级。
// 百花谷：两侧花田梯台（1~5 级）夹着的山谷。粉墙月洞门 → 一条长长的紫藤花廊 → 谷心百花台（比试场 / 百花会会场）
//   → 北面 2 级台地上的百花堂；西边荷塘水榭，东边斗花台、小丘上的听琴亭；梯台上开满随季节换色的花。
// 丹鼎派：方城炉坊。城中八角广场正中一尊巨鼎，八座丹炉围成一圈（弟子在炉前扇火）；东侧六级「丹房街」拾级而上，
//   每间丹房一根烟囱；西边熔岩地火池；北面 3 级台地上丹鼎殿（殿后烟囱）、丹王阁宝塔。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh, at, toon, canvasTex, boxUV, vnoise, smooth } from './util.js';
import { M, TX, shade, roof, plaque, hall, tower, pagoda, paifang, banner, brazier, cauldron } from './sectkit.js';
import { TAU, rng32, well, woodpile, tableSet, herbBed, bridge, terraceStairs, cylUVs } from './sectprops.js';
import { makeTerrain, plat, shape, polyDist } from './terrace.js';
import { makeLabWater } from './water.js';
import { P, faceTo, faceIn, openAt, wallLine, markLine, paveStrip, paveOct, batch, steep } from './sectsites2.js';
import { rod, ringFence } from './sectsites3.js';

const near = (S, R) => { const p = S.g.player?.pos; return p && Math.hypot(p.x - S.x, p.z - S.z) < R; };

// ===================== 6 百花谷：花谷（大宗，半径约 84 米）=====================
const BC = { wall: '#fff2f4', col: '#b0607a', roof: '#d88aa0', ridge: '#9a4a62', stone: '#e8d8dc', pave: '#f2e4e8', col2: '#8a5a5a', roof2: '#c87a90', signC: { bg: '#6a2a44', rim: '#ffc8dc', fg: '#fff4f8' } };
const BH_POND = [-14, 18], BH_WY = -0.14;
const BH_PATHS = [{ pts: [[0, -14], [0, -31]], w: 2.2 }, { pts: [[-22, 30], [-52, 30]], w: 1.3 }, { pts: [[23, -8], [49.5, -8]], w: 1.3 }, { pts: [[7, -12], [12, -12]], w: 1.1 }];
const BH_T = makeTerrain({
  LH: 1.7, rock: '#a8949a',
  shapes: [
    // 东西两侧花田梯台：越往外越高（顶上 5 级），北面也围起来；靠近谷口和外圈回落到 0 级
    shape([-80, -80, 80, 56.5], (x, z) => { const ax = Math.abs(x), r = Math.hypot(x, z), base = Math.max((ax - 24) / 5, (-54 - z) / 3) + (vnoise(x * 0.09 + 3, z * 0.09, 5) - 0.5) * 0.9; return Math.min(5.3, base, (76 - r) / 2.4, (55.8 - z) / 0.25); }),
    plat({ x: 0, z: -38, w: 44, d: 22, round: 5, lv: 2, ring: 3, seed: 51 }),   // 百花堂台地
    plat({ x: 14, z: -12, w: 8, d: 8, round: 4, lv: 1, ring: 2.5, seed: 53 }),  // 听琴小丘
  ],
  paths: BH_PATHS,
  // 荷塘：一圈环形水，中间小岛（水榭），东边一道堤（拱桥压在上面）
  dig: (x, z) => { const d = Math.hypot(x - BH_POND[0], z - BH_POND[1]); if (d > 8) return 0; let k = smooth(8, 6.2, d) * smooth(3, 4.2, d); if (x > BH_POND[0] && Math.abs(z - BH_POND[1]) < 1.4) k *= 1 - smooth(1.4, 0.9, Math.abs(z - BH_POND[1])); return 0.6 * k; },
});
const bhPathD = (x, z) => { let d = 1e9; for (const p of BH_PATHS) d = Math.min(d, polyDist(x, z, p.pts) - p.w); return d; };
// 梯台上找一点：第 k 级平台、离坎 0.3~0.55 级的地方（站人用）
const terX = (s, k, z) => { for (let ax = 25; ax <= 52; ax += 0.25) { const F = BH_T.F(s * ax, z); if (Math.floor(F) === k && F - k >= 0.3 && F - k <= 0.55) return [s * ax, z]; } return [s * (26.5 + 5 * k), z]; };

// 月洞门：粉墙上开一个圆门（圆心高于地面，底下截平），一圈石框，门头小瓦顶，两面匾，门框上一簇簇花
function moonGate(sign) {
  const G = new THREE.Group(), W = 10, H = 5.2, R = 2.5, C = 1.8, a = Math.sqrt(R * R - C * C), b = Math.atan2(C, a);
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0); sh.lineTo(-a, 0); sh.absarc(0, C, R, Math.PI + b, -b, true); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H); sh.lineTo(-W / 2, H); sh.lineTo(-W / 2, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, -0.35);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.35, uv.getY(i) * 0.35);
  G.add(mesh(geo, M(BC.wall, { tx: TX.wall }), { recv: true }));
  const trim = M(BC.stone, { tx: TX.stone });
  for (const z of [-0.36, 0.36]) G.add(at(mesh(new THREE.TorusGeometry(R, 0.1, 6, 40, Math.PI + 2 * b).rotateZ(-b), trim), 0, C, z));
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(W + 0.2, 0.5, 0.9), W + 0.2, 0.5, 0.9, 0.45).translate(0, 0.25, 0), M('#c8b8bc', { tx: TX.stone })), 0, 0, 0));
  const R1 = roof(W + 0.8, 1.6, 0.55, BC.roof, { ridge: BC.ridge, k: 0.3 }); R1.position.y = H; G.add(R1);
  for (const s of [1, -1]) { const p = plaque(sign, 2.6, 0.62, BC.signC); p.position.set(0, C + R + 0.42, s * 0.37); if (s < 0) p.rotation.y = Math.PI; G.add(p); }
  const fl = [M('#ff9ab8'), M('#fff0f4'), M('#e8a0ff')], lf = M('#6a9a4a');
  for (let i = 0; i < 14; i++) {
    const t = -b + (Math.PI + 2 * b) * (i + 0.5) / 14, x = Math.cos(t) * (R + 0.3), y = C + Math.sin(t) * (R + 0.3);
    for (const z of [-0.42, 0.42]) { G.add(at(mesh(new THREE.IcosahedronGeometry(0.2 + (i % 3) * 0.04, 0), fl[i % 3]), x, y, z)); if (i % 2) G.add(at(mesh(new THREE.IcosahedronGeometry(0.16, 0), lf), x * 1.06, y + 0.12, z * 1.1)); }
  }
  G.userData.foot = [W, 0.9]; G.userData.name = sign;
  return G;
}
// 紫藤花廊：两排木柱、两根顺梁、一排椽子，椽下挂满紫藤花串，顶上叶团（全部按材质合并）
function pergola(S, z0, z1, X) {
  const wood = [], beams = [], fa = [], fb = [], lv = [], rng = rng32(77);
  for (let z = z0; z >= z1 - 0.01; z -= 3) for (const s of [-1, 1]) { const y = S.hy(s * X, z); wood.push(cylUVs(new THREE.CylinderGeometry(0.12, 0.14, 3.1, 6), 0.14, 3.1).translate(s * X, y + 1.55, z)); S.circ(s * X, z, 0.22); }
  const L = z0 - z1 + 0.8, zc = (z0 + z1) / 2;
  for (const s of [-1, 1]) beams.push(boxUV(new THREE.BoxGeometry(0.16, 0.2, L), 0.16, 0.2, L, 0.5).translate(s * X, 3.05, zc));
  for (let z = z0 + 0.3; z >= z1 - 0.3; z -= 0.8) beams.push(new THREE.BoxGeometry(X * 2 + 0.9, 0.1, 0.1).translate(0, 3.22, z));
  for (let z = z0; z >= z1; z -= 0.55) for (let i = 0; i < 3; i++) {
    const x = (rng() * 2 - 1) * (X + 0.3), h = 0.6 + rng() * 0.7;
    (rng() < 0.55 ? fa : fb).push(new THREE.ConeGeometry(0.16 + rng() * 0.08, h, 5).rotateX(Math.PI).translate(x, 3.1 - h / 2, z + (rng() - 0.5) * 0.4));
    if (i < 2) lv.push(new THREE.IcosahedronGeometry(0.4 + rng() * 0.2, 0).scale(1.4, 0.42, 1.1).rotateY(rng() * TAU).translate(x * 0.9, 3.36 + rng() * 0.1, z));
  }
  const G = new THREE.Group();
  G.add(mesh(mergeGeometries(wood), M('#7a5a3a', { tx: TX.wood })));
  G.add(mesh(mergeGeometries(beams), M('#8a6a44', { tx: TX.wood })));
  G.add(mesh(mergeGeometries(fa), M('#b48ae8'), { cast: false }));
  G.add(mesh(mergeGeometries(fb), M('#d8b8ff'), { cast: false }));
  G.add(mesh(mergeGeometries(lv), M('#5a8a3a')));
  S.put(G, 0, 0, 0, 0, { abs: true, bake: true });
  for (const s of [-1, 1]) markLine(S, s * X, z0, s * X, z1, 0.6);
}
// 花海：梯台平面上（和谷底稀疏一些）的成片小花，实例化；颜色跟季节换
const SEASON_FL = [
  ['#ffa8c8', '#fff4f8', '#ff7aa8', '#e8a0ff', '#ffd0e0'],
  ['#ff6a8a', '#ffd8e4', '#b48aff', '#ff9a5a', '#fff07a'],
  ['#ffc83a', '#ff8a2a', '#fff0a0', '#e85a3a', '#c88aff'],
  ['#e8304a', '#ffffff', '#ff6a80', '#f4f0ff', '#c8203a'],
];
function flowerSea(S, skip, rng) {
  const pts = [];
  for (let x = -72; x <= 72; x += 1.25) for (let z = -72; z <= 52; z += 0.9) {
    const px = x + (rng() - 0.5) * 1.3, pz = z + (rng() - 0.5) * 0.9;
    if (Math.hypot(px, pz) > 75) continue;
    const F = BH_T.F(px, pz), k = Math.floor(F);
    if (k > 4 || F - k > 0.76) continue;
    if (k === 0 && rng() > 0.3) continue;
    if (skip(px, pz)) continue;
    pts.push([px, pz, rng(), rng(), Math.floor(rng() * 5)]);
  }
  const head = mergeGeometries([new THREE.IcosahedronGeometry(0.17, 0).translate(0, 0.44, 0), new THREE.IcosahedronGeometry(0.12, 0).translate(0.14, 0.3, 0.06), new THREE.IcosahedronGeometry(0.1, 0).translate(-0.1, 0.26, -0.1)]);
  const leaf = new THREE.ConeGeometry(0.16, 0.42, 4).translate(0, 0.21, 0).toNonIndexed();
  const H = new THREE.InstancedMesh(head, toon('#ffffff', { unique: true }), pts.length), Lm = new THREE.InstancedMesh(leaf, M('#5a9a4a'), pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  pts.forEach(([x, z, a, s], i) => { q.setFromEuler(e.set(0, a * TAU, 0)); sc.setScalar(0.9 + s * 0.7); m.compose(v.set(x, S.hy(x, z), z), q, sc); H.setMatrixAt(i, m); Lm.setMatrixAt(i, m); });
  const c = new THREE.Color(), paint = (se) => { const pal = SEASON_FL[se]; pts.forEach((p, i) => H.setColorAt(i, c.set(pal[p[4]]))); H.instanceColor.needsUpdate = true; };
  paint(0);
  for (const o of [H, Lm]) { o.position.set(S.x, 0, S.z); o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; S.g.scene.add(o); }
  let last = 0;
  S.anims.push(() => { const se = S.g.farm?.season ?? 0; if (se !== last) { last = se; paint(se); } });
  return pts.length;
}
// 花瓣地画（百花台）：一张透明贴图贴在铺地上
function mosaic(S, lx, lz, r) {
  const tex = canvasTex(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.translate(w / 2, h / 2);
    const ring = (n, rr, len, wid, col, off = 0) => { c.fillStyle = col; for (let i = 0; i < n; i++) { c.save(); c.rotate((i + off) / n * TAU); c.beginPath(); c.ellipse(0, -rr, wid, len, 0, 0, TAU); c.fill(); c.restore(); } };
    c.strokeStyle = '#d88aa0'; c.lineWidth = 8; c.beginPath(); c.arc(0, 0, 246, 0, TAU); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 228, 0, TAU); c.stroke();
    ring(32, 204, 20, 9, '#f8b8cc'); ring(32, 204, 10, 4, '#fff4f8', 0.5);
    ring(16, 136, 50, 20, '#ff9ab8'); ring(16, 120, 30, 12, '#ffc8d8', 0.5);
    ring(8, 64, 54, 26, '#fff0f4'); ring(8, 52, 30, 12, '#ffb0c8', 0.5);
    c.fillStyle = '#ffd070'; c.beginPath(); c.arc(0, 0, 26, 0, TAU); c.fill();
  }, { pixel: false, repeat: false });
  const m = toon('#ffffff', { map: tex, unique: true }); m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3;
  const o = mesh(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), m, { cast: false, recv: true }); o.position.set(S.x + lx, S.hy(lx, lz) + 0.035, S.z + lz); S.g.scene.add(o);
}
// 斗花台：三层石圆台，每层一圈花盆，顶上一大盆
function flowerStand() {
  const G = new THREE.Group(), st = M(BC.stone, { tx: TX.stone }), pot = M('#a85a4a'), fl = [M('#ff7aa8'), M('#fff4f8'), M('#ffd070'), M('#c88aff')], lf = M('#5a9a4a');
  [[3.2, 0.5], [2.2, 1.0], [1.2, 1.5]].forEach(([r, top], i) => {
    G.add(mesh(cylUVs(new THREE.CylinderGeometry(r, r + 0.1, 0.5, 24), r, 0.5).translate(0, top - 0.25, 0), st, { recv: true }));
    const n = Math.round(TAU * (r - 0.35) / 0.9);
    for (let k = 0; k < n; k++) { const a = k / n * TAU, x = Math.sin(a) * (r - 0.35), z = Math.cos(a) * (r - 0.35); G.add(at(mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.3, 8).translate(0, 0.15, 0), pot), x, top, z)); G.add(at(mesh(new THREE.IcosahedronGeometry(0.24, 0), fl[(k + i) % 4]), x, top + 0.45, z)); G.add(at(mesh(new THREE.IcosahedronGeometry(0.16, 0), lf), x * 1.04, top + 0.3, z * 1.04)); }
  });
  G.add(at(mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.6, 12).translate(0, 0.3, 0), pot), 0, 1.5, 0));
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; G.add(at(mesh(new THREE.IcosahedronGeometry(0.3, 0), fl[k % 4]), Math.sin(a) * 0.35, 2.35 + (k % 2) * 0.2, Math.cos(a) * 0.35)); }
  G.add(at(mesh(new THREE.IcosahedronGeometry(0.42, 1), M('#ff5a8a')), 0, 2.75, 0));
  return G;
}
// 蜂箱：木腿上的方箱，几层抽屉，小瓦顶
function beeHive() {
  const G = new THREE.Group(), w = M('#c8a070', { tx: TX.wood }), d = M('#8a6a44', { tx: TX.wood });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(0, 0.25, 0), d), sx * 0.3, 0, sz * 0.25));
  for (let i = 0; i < 3; i++) G.add(at(mesh(boxUV(new THREE.BoxGeometry(0.8, 0.28, 0.66), 0.8, 0.28, 0.66, 0.5).translate(0, 0.14, 0), i % 2 ? d : w), 0, 0.5 + i * 0.3, 0));
  G.add(at(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.04), M('#2a1a10')), 0, 0.56, 0.34));
  const R = roof(1.05, 0.9, 0.3, '#8a5a3a', { k: 0.3 }); R.position.y = 1.42; G.add(R);
  return G;
}
// 琴案：矮几 + 古琴 + 小香炉
function qinTable() {
  const G = new THREE.Group(), w = M('#5a3a24', { tx: TX.wood });
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(1.5, 0.08, 0.55), 1.5, 0.08, 0.55, 0.5), w), 0, 0.4, 0));
  for (const sx of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.08, 0.38, 0.45).translate(0, 0.19, 0), w), sx * 0.66, 0, 0));
  G.add(at(mesh(new THREE.BoxGeometry(1.25, 0.06, 0.24), M('#2a1a14')), 0, 0.47, 0));
  for (let i = 0; i < 7; i++) G.add(at(mesh(new THREE.BoxGeometry(1.15, 0.008, 0.008), M('#f0e0b0')), 0, 0.505, -0.09 + i * 0.03));
  G.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 8).translate(0, 0.05, 0), M('#8a7040', { metal: true })), 0.62, 0.44, 0.15));
  return G;
}

const baihua = {
  r: 84, terrain: BH_T,
  ground: (lx, lz, n) => {
    if (lz > 56.5) return Math.abs(lx) < 1.9 + n * 0.5 && lz < 90 ? 1 : 0;
    const dp = Math.hypot(lx - BH_POND[0], lz - BH_POND[1]); if (dp > 3.2 && dp < 8.4) return 3;
    if (lx > -21.6 && lx < -8.4 && lz > -18.6 && lz < -7.4) return 2;
    if (Math.abs(lx) < 1.9 && lz > -31 && lz < 56) return 1;
    if (Math.hypot(lx, lz) < 9) return 1;
    return 0;
  },
  build(S) {
    const rng = rng32(61), g = S.g;
    const hallB = (sign, w, d, extra = {}) => hall({ w, d, h: 2.8, wall: BC.wall, col: BC.col, roof: BC.roof, ridge: BC.ridge, sign, base: 0.5, baseC: BC.stone, signC: BC.signC, ...extra });
    const hallB2 = (sign, w, d, extra = {}) => hall({ w, d, h: 2.6, wall: '#fbeef0', col: BC.col2, roof: BC.roof2, ridge: BC.ridge, sign, base: 0.4, baseC: BC.stone, rise: d * 0.36, signC: BC.signC, ...extra });
    const ting = (sign, w, d, extra = {}) => hall({ w, d, h: 2.6, open: true, wall: BC.wall, col: BC.col, roof: BC.roof, ridge: BC.ridge, sign, base: 0.35, baseC: BC.stone, pyramid: true, rise: Math.max(w, d) * 0.5, signC: BC.signC, ...extra });

    // ---- 谷口：月洞门 + 粉墙；门外桃花夹道 ----
    S.put(moonGate('百花谷'), 0, 56, 0, 0, { bake: true });
    for (const s of [-1, 1]) S.box(s * 1.75, 55.6, s * 5, 56.4);
    for (const s of [-1, 1]) wallLine(S, s * 5.3, 56, s * 52, 56, { h: 3, wall: BC.wall, cap: BC.roof, base: '#c8b8bc' });
    paveStrip(S, 0, 56.6, 0, 90, 3.2, BC.pave);
    for (const s of [-1, 1]) for (const z of [64, 70, 76, 82, 88]) S.ref('peach', z + s, s * 5.4, z, 1.0 + rng() * 0.25, rng() * TAU, 0.5);
    for (const s of [-1, 1]) for (const z of [61, 79]) S.ref('stoneLan', 0, s * 3, z, 0.9, 0, 0.35);

    // ---- 紫藤花廊（谷口 → 百花台），廊下铺石 ----
    pergola(S, 53, 11, 2.4);
    paveStrip(S, 0, 55.6, 0, 9.5, 3.2, BC.pave);
    paveStrip(S, 0, -8.5, 0, -21, 3.2, BC.pave);

    // ---- 百花台：谷心圆形花瓣广场（比试场、百花会会场）----
    S.paveDisc(0, 0, 8.5, BC.pave); S.mark(-8.5, -8.5, 8.5, 8.5); mosaic(S, 0, 0, 8.3);
    for (let k = 0; k < 4; k++) {
      const [x, z] = P(45 + 90 * k, 7.4), G = new THREE.Group(), st = M(BC.stone, { tx: TX.stone });
      G.add(mesh(cylUVs(new THREE.CylinderGeometry(0.95, 1.05, 0.7, 12), 1.0, 0.7).translate(0, 0.35, 0), st));
      G.add(at(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 12), M('#6a4a30')), 0, 0.7, 0));
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr = i % 3 ? 0.55 : 0.2; G.add(at(mesh(new THREE.IcosahedronGeometry(0.26, 0), M(SEASON_FL[0][i % 5])), Math.sin(a) * rr, 0.95 + (i % 2) * 0.12, Math.cos(a) * rr)); }
      G.add(at(mesh(new THREE.IcosahedronGeometry(0.34, 0), M('#5a9a4a')), 0, 0.85, 0));
      S.put(G, x, z, 0, 0, { bake: true }); S.circ(x, z, 1.0);
    }
    for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) { const [x, z] = P(a, 9.4); S.ref('stoneLan', 0, x, z, 0.85, faceIn(x, z), 0.35); }

    // ---- 荷塘 + 水榭 + 拱桥 ----
    {
      const [px, pz] = BH_POND, depth = (x, z) => Math.max(0, BH_WY - S.hy(x - S.x, z - S.z));
      const water = makeLabWater({ x0: S.x + px - 8.5, z0: S.z + pz - 8.5, size: 17, N: 96, depthAt: depth });
      const wm = new THREE.Mesh(new THREE.CircleGeometry(8.1, 48).rotateX(-Math.PI / 2), water); wm.position.set(S.x + px, BH_WY, S.z + pz); wm.receiveShadow = false; g.scene.add(wm);
      g.world.extraWater.push((x, z) => { const lx = x - S.x - px, lz = z - S.z - pz; return lx * lx + lz * lz < 64 ? depth(x, z) : 0; });
      S.anims.push(() => { water.uniforms.uTime.value = g.world.time; if (g.world.water) water.uniforms.uLight.value = g.world.water.uniforms.uLight.value; });
      const hide = (g.world.iceHide ||= []);
      for (let i = 0; i < 12; i++) { const a = rng() * TAU, d = 4.4 + rng() * 2.8, x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d; if (Math.abs(z - pz) < 1.6 && x > px) continue; const o = S.ref('lily', i, x, z, 0.9 + rng() * 0.4, rng() * TAU); if (o) { o.position.y = BH_WY + 0.02; hide.push(o); } }
      for (const [a, d] of [[210, 5.6], [320, 5.2]]) { const [x, z] = P(a, d), o = S.ref('lotus', 0, px + x, pz + z, 0.8); if (o) { o.position.y = BH_WY + 0.02; hide.push(o); } S.emit(px + x, 0.4, pz + z, '#ffb0d0', 0.5, 'lantern'); }
      S.mark(px - 8.4, pz - 8.4, px + 8.4, pz + 8.4);
      openAt(S, ting('水榭', 2.8, 2.8), px, pz, Math.PI / 2);
      S.put(bridge(5.4, 1.8, { color: BC.stone }), px + 5.4, pz, Math.PI / 2, 0, { bake: true });
      for (let x = px + 2.9; x <= px + 8; x += 0.9) for (const s of [-1, 1]) S.circ(x, pz + s * 0.85, 0.15);
    }

    // ---- 斗花台 ----
    S.paveDisc(14, 21, 6, BC.pave); S.mark(8, 15, 20, 27);
    S.put(flowerStand(), 14, 21, 0, 0, { bake: true }); S.circ(14, 21, 3.3);
    for (const [x, z, t] of [[8.6, 25.6, '斗'], [19.4, 25.6, '花']]) { S.put(banner('#c84a7a', t, { fg: '#fff4f8' }), x, z, 0); S.circ(x, z, 0.25); }

    // ---- 谷底两侧的堂、亭、楼 ----
    openAt(S, ting('听琴亭', 3.2, 3.2), 14, -12);
    S.put(qinTable(), 14, -11.7, 0, 0, { bake: true });
    openAt(S, ting('迎香亭', 5.6, 4, { pyramid: false, rise: 1.6 }), -20, 49);
    S.bld(hallB('医庐', 10, 6), 20, 48, -Math.PI / 2);
    S.bld(hallB2('香坊', 7, 5), -20.5, 36, Math.PI / 2);
    S.bld(tower({ w: 5, d: 4.4, levels: 2, h: 2.8, wall: BC.wall, col: BC.col, roof: BC.roof, ridge: BC.ridge, sign: '绣楼', baseC: BC.stone, signC: BC.signC }), 20.5, 34, -Math.PI / 2);
    S.bld(hallB('执事堂', 11, 6.4), -20, 2, Math.PI / 2);
    S.bld(hallB2('膳堂', 12, 6.4), 20, 2, -Math.PI / 2);
    // 药圃 + 晒药架
    for (const x of [-19.5, -15, -10.5]) for (const z of [-9, -13, -17]) { S.put(herbBed(3.4, 2.4, rng), x, z, 0, 0, { bake: true }); S.mark(x - 1.7, z - 1.2, x + 1.7, z + 1.2); }
    for (const z of [-12, -15.5, -19]) S.ref('herbRack', z, 23, z, 1, Math.PI / 2, 0.6);
    // 演武（舞剑）场两块
    S.paveRect(-16, 32, -4, 41, BC.pave); S.paveRect(4, 32, 16, 41, BC.pave);
    S.put(well(BC.roof2), -8.6, 46, 0, 0, { bake: true }); S.circ(-8.6, 46, 1.1);
    S.put(tableSet(), 8.6, 46, 0, 0, { bake: true }); S.circ(8.6, 46, 1.2);
    for (const [x, z, k] of [[-24.6, 38.6, 'jar'], [-24.6, 39.6, 'jar'], [-24.4, 33, 'crate'], [24.6, 45, 'barrel'], [24.4, 51, 'crate']]) S.ref(k, 0, x, z, 1, rng() * TAU, 0.45);

    // ---- 北台：百花堂、谷主居、长老院、赏花 / 观云亭 ----
    S.bld(hallB('百花堂', 18, 10, { tiers: 2, h: 3.4, base: 0.7, rise: 3.0, stairW: 4 }), 0, -39);
    S.bld(hallB('谷主居', 9, 5.6), -16, -41, Math.PI / 2);
    S.bld(hallB2('长老院', 9, 5.6), 16, -41, -Math.PI / 2);
    S.paveRect(-9, -32.2, 9, -27.4, BC.pave);
    openAt(S, ting('赏花亭', 3.2, 3.2), -15.5, -31.5);
    openAt(S, ting('观云亭', 3.2, 3.2), 15.5, -31.5);
    for (const s of [-1, 1]) { S.ref('incense', 0, s * 5.2, -30.6, 1, 0, 0.5); S.lantern(s * 9.6, -27.8, 2.0, '#ff7aa8'); }
    S.ref('stele', 0, -8.6, 65, 1.1, 0.2, 0.8);

    // ---- 梯台顶上：弟子居、客舍、花房、两座亭、蜂箱 ----
    S.bld(hallB2('弟子居', 12, 6.4), -57, 12, Math.PI / 2);
    S.bld(hallB2('弟子居', 12, 6.4), -57, -10, Math.PI / 2);
    S.bld(hallB2('客舍', 12, 6.4), 57, 10, -Math.PI / 2);
    S.bld(hallB2('花房', 12, 6.4), 57, -12, -Math.PI / 2);
    openAt(S, ting('望花亭', 3.2, 3.2), -55.3, -24);
    openAt(S, ting('听风亭', 3.2, 3.2), 55.3, -24);
    const hives = [[53.4, 21.6], [55.2, 22.4], [57, 21.6], [54.4, 26.4], [56.4, 26.6]];
    for (const [x, z] of hives) { S.put(beeHive(), x, z, faceTo(x, z, 51, 24), 0, { bake: true }); S.circ(x, z, 0.5); }

    // ---- 梯台石阶（粉白石）、路 ----
    terraceStairs(S, BH_T, { color: '#e8d8dc', rail: '#d0b8c0' });
    for (const p of BH_PATHS) for (let i = 1; i < p.pts.length; i++) markLine(S, ...p.pts[i - 1], ...p.pts[i], p.w + 0.6);

    // ---- 人 ----
    const RR = BH_PEOPLE();
    for (const [x, z] of [...RR.disciples, ...RR.npcs.map((n) => n.p), ...RR.npcs.flatMap((n) => n.route || []), RR.elder]) S.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2);

    // ---- 苔石围塘 ----
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + 0.1, [x, z] = [BH_POND[0] + Math.sin(a) * 8.6, BH_POND[1] + Math.cos(a) * 8.6]; if (Math.abs(a - Math.PI / 2) < 0.5 || !S.free(x, z, 0.4)) continue; S.ref('mossRock', i, x, z, 0.7 + rng() * 0.4, rng() * TAU, 0.5); }

    // ---- 花海 + 散布 ----
    const pond = (x, z) => Math.hypot(x - BH_POND[0], z - BH_POND[1]) < 9.4;
    flowerSea(S, (x, z) => pond(x, z) || bhPathD(x, z) < 0.6 || !S.free(x, z, 0.2) || (Math.abs(x) < 4 && z > -30 && z < 56) || Math.hypot(x, z) < 11, rng);
    S.scatter(rng, 60, 10, 60, (x, z, r, i) => (i % 3 === 0 ? S.ref('peach', i, x, z, 0.9 + r() * 0.4, r() * TAU, 0.5) : i % 3 === 1 ? S.ref('wisteria', i, x, z, 0.9 + r() * 0.3, r() * TAU, 0.5) : S.ref('flowerBed', i, x, z, 0.9 + r() * 0.3, r() * TAU)),
      (x, z) => z > 55 || !S.free(x, z, 2) || steep(S, x, z) || bhPathD(x, z) < 2 || pond(x, z) || Math.abs(x) < 5 || BH_T.F(x, z) > 0.5);
    S.scatter(rng, 50, 30, 74, (x, z, r, i) => S.ref(i % 2 ? 'peach' : 'flowerTree', i, x, z, 0.9 + r() * 0.4, r() * TAU, 0.5),
      (x, z) => z > 55 || !S.free(x, z, 2.5) || steep(S, x, z) || bhPathD(x, z) < 2 || BH_T.F(x, z) < 0.5);
    S.scatter(rng, 160, 77, 98, (x, z, r, i) => S.ref(i % 3 === 0 ? 'peach' : i % 3 === 1 ? 'tree' : 'bush', i, x, z, 1.0 + r() * 0.5, r() * TAU, 0.6),
      (x, z) => (Math.abs(x) < 9 && z > 0) || Math.hypot(x + 28.2, z - 77.8) < 9);

    // ---- 效果：飘花瓣、紫藤落花、夜里荷塘萤火、蜂箱边的蜜蜂 ----
    S.anims.push((dt) => {
      const fx = g.fx; if (!fx || !near(S, 120)) return;
      if (Math.random() < dt * 10) { const a = Math.random() * TAU, r = Math.random() * 45; fx.mote(S.x + Math.sin(a) * r, 3 + Math.random() * 3, S.z + Math.cos(a) * r - 6, '#ffc0d8', { life: 4, size: 0.35, vy: -0.45, vx: 0.4, vz: 0.15, bright: 1.2 }); }
      if (Math.random() < dt * 5) fx.mote(S.x + (Math.random() * 2 - 1) * 2.6, 2.9, S.z + 11 + Math.random() * 42, '#c8a8ff', { life: 3, size: 0.3, vy: -0.6, vx: 0.15, bright: 1.2 });
      if ((g.hours >= 19 || g.hours < 5) && Math.random() < dt * 6) { const a = Math.random() * TAU, r = 3 + Math.random() * 7; fx.mote(S.x + BH_POND[0] + Math.sin(a) * r, 0.5 + Math.random() * 1.4, S.z + BH_POND[1] + Math.cos(a) * r, '#d8ff8a', { life: 2.5, size: 0.22, vy: 0.08, vx: (Math.random() - 0.5) * 0.4, bright: 2.4 }); }
      if (g.hours > 6 && g.hours < 18 && Math.random() < dt * 4) { const [x, z] = hives[Math.floor(Math.random() * hives.length)]; fx.mote(S.x + x + (Math.random() - 0.5) * 2, 1.4 + Math.random(), S.z + z + (Math.random() - 0.5) * 2, '#ffd040', { life: 1.5, size: 0.14, vy: 0.1, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2, bright: 1.6 }); }
    });
    return { ...RR, look: { robe: '#ffb8d0', robe2: '#fff0f6', belt: '#c86a8a', hairStyle: [1, 1, 0, 1, 2], hair: '#2a1a1a', sword: true }, elderName: '温如玉' };
  },
};

function BH_PEOPLE() {
  const elderLook = (o) => ({ skin: '#f0c8a8', hair: '#e8e2e0', hairStyle: 1, age: 'elder', beard: false, robe: '#d88aa0', robe2: '#fff0f4', belt: '#9a4a62', sword: false, ...o });
  const outer = { robe: '#ffc8d8', robe2: '#fff4f8', belt: '#d88aa0' };   // 外门：浅粉
  const inner = { robe: '#ff9ab8', robe2: '#fff0f6', belt: '#b0607a' };   // 内门：桃红
  const servant = { robe: '#c8a8a8', robe2: '#f4e8e8', belt: '#8a5a5a', sword: false };
  const drill = [34.5, 38.5].flatMap((z) => [-14, -10, -6, 6, 10, 14].map((x) => [x, z, 0, 'drill', { t: 0 }]));
  const pick = [1, 2, 3, 4].flatMap((k) => [-1, 1].map((s) => [...terX(s, k, [-15, 5, 20, -5][k - 1] + s * 3), s * -Math.PI / 2, 'work']));
  return {
    elder: [-14.4, 2, Math.PI / 2], yard: [10, 36.5], lib: [14.8, 48], stele: [-8.6, 65], front: [0, 62], arena: [0, 0],
    disciples: [
      ...drill, ...pick,
      [-6, 2, Math.PI / 2, 'cast'], [6, 2, -Math.PI / 2, 'cast'],
      [12.4, 45.6, Math.PI / 2, 'sit'], [12.4, 50.4, Math.PI / 2, 'sit'],
      [-6, -29.4, Math.PI, 'cast'], [-3, -29.4, Math.PI, 'cast'], [3, -29.4, Math.PI, 'cast'], [6, -29.4, Math.PI, 'cast'],
      [-17.25, -11, 0, 'work'], [-12.75, -9, Math.PI, 'work'], [-19.5, -15, 0, 'work'],
      [21.4, -15.5, Math.PI / 2, 'work'], [21.4, -19, Math.PI / 2, 'work'],
      [-51.6, -19.5, -Math.PI / 2, 'idle'], [-51.6, 21.5, -Math.PI / 2, 'idle'], [51.6, 1, Math.PI / 2, 'idle'], [51.6, -21.5, Math.PI / 2, 'idle'],
      [-21.5, 23, faceTo(-21.5, 23, ...BH_POND), 'sit'], [-8, 11.5, faceTo(-8, 11.5, ...BH_POND), 'sit'],
    ],
    npcs: [
      { name: '花解语', title: '谷主', p: [0, -30.6, 0], look: elderLook({ hair: '#2a1a1a', hairStyle: 1, age: 'adult', robe: '#ff8ab0', robe2: '#fff4f8', belt: '#c8a050' }), lines: ['百花谷不拦人，也不留人。花开了，自然有人来。', '修行和养花一样，急不得，也懒不得。', '你闻得出这是什么花吗？……闻不出也无妨，记住它就好。'] },
      { name: '梅映雪', title: '大长老', p: [-8, -31.6, 0.2], look: elderLook({ robe: '#f4f0f4', robe2: '#c83a4a', belt: '#6a2a3a' }), lines: ['我只爱梅花。别的花开得太早，谢得也太早。', '冬天来百花谷，梯台上全是红梅白梅。', '谷主心软，我替她心硬。'] },
      { name: '孙妙手', title: '医庐主', p: [14.6, 51.2, -Math.PI / 2], look: elderLook({ hair: '#d8d2cc', beard: true, robe: '#e8e0d8', robe2: '#6a8a5a', belt: '#4a5a3a' }), lines: ['花能入药，也能害人。夹竹桃好看，可别嚼。', '医庐看病不收灵石，收一盆花。', '你气色不错，就是肝火旺——少打架。'] },
      { name: '柳如烟', title: '琴师', p: [14, -12.6, 0], look: { ...inner, hairStyle: 1, hair: '#1a1214', robe: '#e8d8f0', robe2: '#8a6aa8' }, act: 'sit', lines: ['（琴声停了）……有客人。', '这首《百花引》，弹给花听的，花开得就快些。', '听琴亭是谷里风最好的地方。'] },
      { name: '莲心', title: '守塘弟子', p: [BH_POND[0], BH_POND[1], 0], look: { ...inner, hairStyle: 1, hair: '#2a1a1a', robe: '#f4f8f0', robe2: '#5aa07a' }, act: 'sit', lines: ['荷塘里的莲子，一百年才结一次灵莲。', '夜里塘边有萤火虫，比灯好看。', '水不深，别怕。冬天还能在上面走。'] },
      { name: '陶伯', title: '花匠', p: terX(-1, 1, -20), look: elderLook({ hair: '#c8c0b8', beard: true, robe: '#8a7a5a', robe2: '#e8dcc0', belt: '#4a3a24' }), route: [-20, -5, 10, 25].map((z) => terX(-1, 1, z)), speed: 0.7, pause: 4, act: 'work', lines: ['五层梯台，五十年，我一锄一锄垦出来的。', '春桃夏荷秋菊冬梅——花不等人，人等花。', '踩花的人，我记得他的脸。'] },
      { name: '小茴', title: '药童', p: [21, -10.6, Math.PI / 2], look: { ...outer, hairStyle: 3, age: 'child' }, act: 'work', lines: ['晒药要翻面，不然一边干一边潮。', '师父说，闻一百种药，才算会闻。我闻到第三十七种了！'] },
      { name: '白芷', title: '药圃弟子', p: [-15, -11, 0], look: { ...outer, hairStyle: 1, hair: '#2a1a14', robe: '#f0f4e8', robe2: '#7aa05a' }, act: 'work', lines: ['我叫白芷，是一味药。师妹叫当归，也是一味药。', '这一畦是凝神草，下一畦是忘忧花，别搞混。'] },
      { name: '桃夭', title: '守谷弟子', p: [-3.4, 59, 0], look: { ...inner, hairStyle: 1 }, lines: ['百花谷到了。进门先闻花香，再说来意。', '月洞门里看出去的景，是谷主亲手挑的。'] },
      { name: '杏雨', title: '守谷弟子', p: [3.4, 59, 0], look: { ...inner, hairStyle: 2 }, lines: ['桃夭是我师姐。她的名字是桃花，我的是杏花。', '门外那些桃树，比我和师姐加起来还老。'] },
      { name: '苏晚晴', title: '大师姐', p: [-1.2, -3.6, Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#1a1214', robe: '#ff7aa8', robe2: '#fff4f8' }, act: 'spar', lines: ['百花剑法，一剑一朵花。我练到第十八朵了。', '百花会那天，百花台上会铺满花瓣。', '你来比剑？好啊，输了要替我浇花。'] },
      { name: '林采薇', title: '二师姐', p: [1.2, -3.6, -Math.PI / 2], look: { ...inner, hairStyle: 0, hair: '#2a1a14', robe: '#c88aff', robe2: '#f8f0ff' }, act: 'spar', lines: ['晚晴师姐的剑快，我的剑稳。', '你看台上的地画，是一千块花瓣石拼的。'] },
      { name: '糖糖', title: '小师妹', p: [-3.2, 44], look: { ...outer, hairStyle: 1, age: 'child' }, route: [[-3.2, 44], [-3.2, 9.6]], speed: 1.3, pause: 2, lines: ['紫藤花廊有一千步，我数过！', '紫藤花能做糕，可甜了。', '师姐说我再偷吃花糕就罚我扫花瓣。'] },
      { name: '芳嫂', title: '膳堂厨娘', p: [14.6, 2, -Math.PI / 2], look: { ...servant, hairStyle: 1, hair: '#3a2a20' }, lines: ['今天做桂花糕、玫瑰饼、荷叶饭。', '百花谷的饭，一半是花。另一半？也是花。'] },
      { name: '闻人笑', title: '客卿', p: [-6.4, 28, 0.6], look: { robe: '#4a5a7a', robe2: '#e8e0d0', belt: '#2a2a3a', hairStyle: 2, hair: '#1a1a1a', sword: true }, lines: ['我是来赏花的，一赏就赏了三年。', '谷主请我当客卿，条件是每年写一首咏花诗。', '你也是来赏花的？那小心，走不掉的。'] },
      { name: '紫鸢', title: '内门弟子', p: [0, 10, Math.PI], look: { ...inner, hairStyle: 1, robe: '#b48ae8', robe2: '#f4f0ff' }, lines: ['紫藤开的时候，整条花廊都是紫的。', '花廊里走慢一点，落花会落到你肩上。'] },
      { name: '兰心', title: '花房弟子', p: [51.8, -12, -Math.PI / 2], look: { ...outer, hairStyle: 2, robe: '#e8f4e0', robe2: '#5a9a6a' }, lines: ['花房里养的是怕冷的花，冬天也开。', '兰花不能多浇水。人也一样，不能太宠。'] },
      { name: '冷月', title: '谷主侍女', p: [-10.8, -41, Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#141014', robe: '#e8e0f0', robe2: '#6a5a8a' }, lines: ['谷主在百花堂前，有事去那里找。', '谷主居不见外客。'] },
      { name: '秋菊', title: '客舍管事', p: [51.8, 10, -Math.PI / 2], look: { ...servant, hairStyle: 2, robe: '#e8b860', robe2: '#fff4d8' }, lines: ['客舍住满了，百花会前后天天这样。', '东边梯台顶上看日出最好。'] },
      { name: '蝶衣', title: '内门弟子', p: terX(1, 2, -15), look: { ...inner, hairStyle: 1, robe: '#ffd0e0', robe2: '#e8a0ff' }, route: [-15, 0, 15, 30].map((z) => terX(1, 2, z)), speed: 0.9, pause: 3, lines: ['我在追一只灵蝶，它翅膀上有七种颜色。', '梯台第二层的花最香，因为风刚好吹到那里。'] },
      { name: '安宁', title: '外门弟子', p: [-20, 49, Math.PI / 2], look: { ...outer, hairStyle: 1 }, act: 'sit', lines: ['迎香亭，客人进谷第一眼看到的就是这里。', '我在这里绣花，等师姐们下课。'] },
      { name: '甜老头', title: '养蜂人', p: [51.4, 24, Math.PI / 2], look: elderLook({ hair: '#b8b0a8', beard: true, robe: '#c8a050', robe2: '#f4e8c8', belt: '#6a4a20' }), lines: ['百花蜜，一百种花的蜜，一年只得三坛。', '蜂不蜇好人。你别动，它们在认你。', '尝一口？……哈，甜到心里了吧。'] },
      { name: '锦绣', title: '绣娘', p: [-51.8, 1, Math.PI / 2], look: { ...servant, hairStyle: 1, robe: '#e88aa8', robe2: '#fff0f4' }, act: 'work', lines: ['绣楼的绣品，一针一线都照着谷里的花绣。', '弟子的衣裳也是我们做的，粉色的，不许嫌。'] },
      { name: '寒梅', title: '内门弟子', p: [-15.5, -31.5, 0], look: { ...inner, hairStyle: 0, robe: '#f4f0f4', robe2: '#c83a4a' }, act: 'sit', lines: ['我是梅长老的徒弟，所以叫寒梅。', '赏花亭里看得见整个百花台。'] },
    ],
  };
}

// ===================== 7 丹鼎派：方城炉坊（大宗，半径约 92 米）=====================
const DC = { wall: '#f4e8d8', col: '#8a3a1a', roof: '#6a3a22', ridge: '#3a1a0a', stone: '#b8a088', pave: '#d8c8b0', col2: '#6a4a30', roof2: '#7a5a3a', glow: '#ffa050', signC: { bg: '#3a1a0a', rim: '#e8a050', fg: '#ffe8c0' } };
const DD_PIT = [-30, 8], DD_PLAZA = [0, 14];
const DD_PATHS = [{ pts: [[0, -17], [0, -29]], w: 2.4 }, { pts: [[34, 46], [34, -27]], w: 1.6 }];
const DD_T = makeTerrain({
  LH: 1.7, rock: '#8a7a6a',
  shapes: [
    plat({ x: 0, z: -39, w: 48, d: 26, round: 4, lv: 3, ring: 2.6, wob: 1, seed: 61 }),                             // 丹鼎殿台地
    ...[0, 1, 2, 3, 4, 5].map((k) => plat({ x: 38, z: 36 - 12 * k, w: 14, d: 10, round: 1.5, lv: k + 1, ring: 1.6, seed: 63 + k })), // 丹房街：六级
  ],
  paths: DD_PATHS,
  dig: (x, z) => { const d = Math.hypot(x - DD_PIT[0], z - DD_PIT[1]); return d < 5.5 ? 2.2 * smooth(5.5, 3.8, d) : 0; },   // 地火池
});
// 丹炉：八角砖炉身、正面火口、炉上小鼎
function furnace() {
  const G = new THREE.Group(), br = M('#8a4a3a', { tx: TX.stone });
  G.add(mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.0, 8).rotateY(Math.PI / 8).translate(0, 0.5, 0), br, { recv: true }));
  G.add(at(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 8).rotateY(Math.PI / 8), M('#5a3a2a')), 0, 1.02, 0));
  const f = mesh(new THREE.CircleGeometry(0.3, 12), glow('#ff7a2a', 2.6), { cast: false }); f.position.set(0, 0.42, 0.94); G.add(f);
  G.add(at(mesh(new THREE.TorusGeometry(0.33, 0.05, 5, 14), M('#3a2a20')), 0, 0.42, 0.94));
  const c = cauldron(0.55, '#7a5a3a', { brew: '#ffc060' }); c.position.y = 1.0; G.add(c);
  return G;
}
// 烟囱：砖砌方柱，顶上一圈出檐
function chimney(H, w = 0.9) {
  const G = new THREE.Group(), br = M('#7a4a3a', { tx: TX.stone });
  G.add(mesh(boxUV(new THREE.BoxGeometry(w, H, w), w, H, w, 0.45).translate(0, H / 2, 0), br));
  G.add(at(mesh(new THREE.BoxGeometry(w + 0.3, 0.3, w + 0.3), M('#4a2a1a')), 0, H, 0));
  G.add(at(mesh(new THREE.BoxGeometry(w - 0.3, 0.05, w - 0.3), M('#1a1210')), 0, H + 0.16, 0));
  return G;
}

const danding = {
  r: 92, terrain: DD_T,
  ground: (lx, lz, n) => {
    if (Math.abs(lx) > 57 || Math.abs(lz) > 61) return Math.abs(lx) < 2.8 + n * 0.5 && lz > 60 && lz < 92 ? 1 : 0;
    if (Math.hypot(lx - DD_PIT[0], lz - DD_PIT[1]) < 6.4 + n * 0.5) return 2;
    if (lx > -38.5 - n && lx < -21.5 + n && lz > -19 && lz < -5) return 3;
    if (Math.abs(lx - 34) < 2 + n * 0.4 && lz > -27 && lz < 46) return 1;
    if (Math.abs(lx) < 2.6 + n * 0.4 && ((lz > -20 && lz < 1) || lz > 27)) return 1;
    return 0;
  },
  build(S) {
    const rng = rng32(71), g = S.g, smoke = [];
    const hallD = (sign, w, d, extra = {}) => hall({ w, d, h: 3.0, wall: DC.wall, col: DC.col, roof: DC.roof, ridge: DC.ridge, sign, base: 0.6, baseC: DC.stone, signC: DC.signC, ...extra });
    const hallD2 = (sign, w, d, extra = {}) => hall({ w, d, h: 2.7, wall: '#ece0cc', col: DC.col2, roof: DC.roof2, ridge: DC.ridge, sign, base: 0.4, baseC: DC.stone, rise: d * 0.36, signC: DC.signC, ...extra });
    const wo = { h: 3, wall: DC.wall, cap: DC.roof, base: '#8a7a6a' };
    const chim = (x, z, H) => { S.put(chimney(H), x, z, 0, 0, { bake: true }); S.circ(x, z, 0.6); smoke.push([x, H + 0.3, z]); };

    // ---- 方城：四面城墙，角楼，南面山门 ----
    wallLine(S, -56, -60, 56, -60, wo);
    for (const s of [-1, 1]) { wallLine(S, s * 56, -60, s * 56, 60, wo); wallLine(S, s * 5.4, 60, s * 56, 60, wo); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const o = S.bld(tower({ w: 3, d: 3, levels: 2, h: 3.2, wall: DC.wall, col: DC.col, roof: DC.roof, ridge: DC.ridge, baseC: DC.stone, door: false }), sx * 56, sz * 60); S.emit(sx * 56, 5.5, sz * 60, '#ffb060', 0.5, 'lantern'); }
    openAt(S, hallD('丹鼎派', 10.4, 4.4, { open: true, base: 0.3 }), 0, 60);
    for (const s of [-1, 1]) { S.put(cauldron(0.8, '#6a5a3a', { brew: '#ffb050' }), s * 5, 64.5, 0, 0, { bake: true }); S.circ(s * 5, 64.5, 0.9); S.emit(s * 5, 1.4, 64.5, '#ff9a3a', 0.7, 'lantern'); smoke.push([s * 5, 1.6, 64.5]); }
    { const pf = paifang('炉火纯青', { w: 12, col: DC.col, roof: DC.roof, ridge: DC.ridge, signC: DC.signC, stone: DC.stone }); S.put(pf, 0, 72, 0, 0, { bake: true }); for (const x of pf.userData.cols) S.circ(x, 72, 0.45); }
    paveStrip(S, 0, 60.4, 0, 92, 4.4, DC.pave);
    for (const s of [-1, 1]) for (const z of [66, 78, 86]) S.ref('stoneLan', 0, s * 3.4, z, 0.9, 0, 0.35);
    S.ref('stele', 0, -9, 68, 1.1, 0.2, 0.8);

    // ---- 中轴铺地、八角广场、巨鼎 ----
    paveStrip(S, 0, 59.6, 0, 27.5, 3.6, DC.pave);
    paveStrip(S, 0, 1, 0, -20, 4.4, DC.pave);
    paveOct(S, ...DD_PLAZA, 13, DC.pave);
    {
      const [cx, cz] = DD_PLAZA, G = new THREE.Group(), st = M(DC.stone, { tx: TX.stone });
      [4.6, 4.0, 3.4].forEach((r, i) => G.add(at(mesh(new THREE.CylinderGeometry(r, r, 0.35, 8).rotateY(Math.PI / 8).translate(0, 0.175, 0), st, { recv: true }), 0, i * 0.35, 0)));
      const big = cauldron(2.4, '#8a6a3a', { legs: 4, brew: '#ffc860' }); big.position.y = 1.05; big.rotation.y = Math.PI / 8; G.add(big);
      S.put(G, cx, cz, 0, 0, { bake: true }); S.circ(cx, cz, 4.7);
      S.emit(cx, 5, cz, '#ffb050', 1.4, 'lantern');
      const pills = [0, 1, 2].map(() => { const o = mesh(new THREE.SphereGeometry(0.22, 12, 10), glow('#ffd060', 2.4), { cast: false }); g.scene.add(o); return o; });
      S.anims.push((dt, t) => {
        const y0 = S.hy(cx, cz) + 6.2;
        pills.forEach((o, i) => { const a = t * 0.9 + i * TAU / 3; o.position.set(S.x + cx + Math.sin(a) * 1.4, y0 + Math.sin(t * 1.6 + i) * 0.25, S.z + cz + Math.cos(a) * 1.4); });
        const fx = g.fx; if (!fx || !near(S, 110)) return;
        if (Math.random() < dt * 8) fx.mote(S.x + cx + (Math.random() - 0.5) * 2.4, 5.0, S.z + cz + (Math.random() - 0.5) * 2.4, '#d8d0c8', { life: 4.5, size: 1.6, vy: 1.3, vx: 0.25, bright: 0.7 });
        if (Math.random() < dt * 6) fx.mote(S.x + cx + (Math.random() - 0.5) * 3, 5.4, S.z + cz + (Math.random() - 0.5) * 3, '#ffd060', { life: 2, size: 0.25, vy: 0.9, bright: 2.2 });
      });
      S.anims[S.anims.length - 1](0, 0);
    }
    // 八座丹炉围一圈（火口朝外，弟子在外面扇火）
    for (let k = 0; k < 8; k++) { const a = 22.5 + 45 * k, [x, z] = P(a, 8.5), X = DD_PLAZA[0] + x, Z = DD_PLAZA[1] + z; S.put(furnace(), X, Z, a * Math.PI / 180, 0, { bake: true }); S.circ(X, Z, 1.1); smoke.push([X, 2.4, Z]); }
    for (const s of [-1, 1]) { S.put(brazier('#ffa040'), s * 3.4, 29, 0, 0, { bake: true }); S.circ(s * 3.4, 29, 0.5); }

    // ---- 北台：丹鼎殿（殿后四根烟囱）、丹王阁、长老院 ----
    S.bld(hallD('丹鼎殿', 22, 12, { tiers: 2, h: 3.6, base: 1.0, rise: 3.4, stairW: 4.4 }), 0, -42);
    for (const x of [-8.5, -4.5, 4.5, 8.5]) chim(x, -45, 12 - Math.abs(x) * 0.2);
    { const o = pagoda({ levels: 5, r: 2.4, body: '#e8d8c0', roof: DC.roof, trim: DC.ridge, baseC: DC.stone }); S.put(o, -18, -43, 0, 0, { bake: true }); S.circ(-18, -43, 3.3); S.mark(-21.3, -46.3, -14.7, -39.7); S.emit(-18, o.userData.top - 2, -43, '#ffc070', 0.6, 'lantern'); }
    S.bld(hallD2('长老院', 9, 5.6), 18, -43, -Math.PI / 2);
    S.paveRect(-12, -33.4, 12, -27.4, DC.pave);
    for (const s of [-1, 1]) { S.put(brazier('#ffa040'), s * 10.6, -28.4, 0, 0, { bake: true }); S.circ(s * 10.6, -28.4, 0.5); S.emit(s * 10.6, 1.4, -28.4, '#ffa040', 0.7, 'lantern'); S.ref('incense', 0, s * 5, -32.6, 1, 0, 0.5); }

    // ---- 丹房街：六级，每间丹房一根烟囱 ----
    for (let k = 0; k < 6; k++) { const z = 36 - 12 * k; S.bld(hallD2(`丹房${'甲乙丙丁戊己'[k]}`, 7, 5), 40.5, z, -Math.PI / 2); chim(43, z + 1.6, 7.5); S.lantern(36.4, z - 2.8, 2.0, '#ff8a3a'); }
    terraceStairs(S, DD_T, { color: '#a89078', rail: '#8a7462' });
    for (const p of DD_PATHS) for (let i = 1; i < p.pts.length; i++) markLine(S, ...p.pts[i - 1], ...p.pts[i], p.w + 0.6);

    // ---- 地火池：熔岩、石圈、木栏 ----
    {
      const [px, pz] = DD_PIT, lm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1a').multiplyScalar(1.6), toneMapped: false });
      const lava = new THREE.Mesh(new THREE.CircleGeometry(4.4, 40).rotateX(-Math.PI / 2), lm); lava.position.set(S.x + px, -1.6, S.z + pz); g.scene.add(lava);
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, [x, z] = [px + Math.sin(a) * 5.8, pz + Math.cos(a) * 5.8]; S.ref('lavaRock', i, x, z, 0.6 + rng() * 0.4, rng() * TAU); }
      ringFence(S, px, pz, 6.3, [], { post: '#4a3a30', rope: '#8a6a4a' });
      S.emit(px, 0.6, pz, '#ff6a1a', 1.4, 'lantern');
      const base = new THREE.Color('#ff6a1a');
      S.anims.push((dt, t) => {
        lm.color.copy(base).multiplyScalar(1.4 + 0.35 * Math.sin(t * 1.3) + 0.15 * Math.sin(t * 3.7));
        const fx = g.fx; if (!fx || !near(S, 110)) return;
        if (Math.random() < dt * 9) { const a = Math.random() * TAU, r = Math.random() * 4; fx.mote(S.x + px + Math.sin(a) * r, 0.6, S.z + pz + Math.cos(a) * r, '#ff8a2a', { life: 1.8, size: 0.2, vy: 1.6, vx: (Math.random() - 0.5) * 0.5, bright: 2.6 }); }
      });
    }

    // ---- 其余院落 ----
    S.bld(hallD2('药材库', 10, 6), -44, 48, Math.PI / 2);
    S.bld(hallD('执事堂', 11, 6.4), -18, 46, Math.PI / 2);
    S.bld(hallD2('膳堂', 12, 6.4), 18, 48, -Math.PI / 2);
    S.bld(hallD2('外门弟子居', 13, 5.6), -48, 22, Math.PI / 2);
    S.bld(hallD2('外门弟子居', 13, 5.6), -48, 0, Math.PI / 2);
    S.bld(hallD('执法堂', 10, 6), -46, -26, Math.PI / 2);
    S.bld(hallD2('内门弟子居', 13, 5.6), -44, -48);
    S.bld(hallD('藏丹库', 11, 6), 42, -48);
    S.bld(hallD2('客舍', 11, 6), 44, 52, -Math.PI / 2);
    chim(-18, 49.4, 6.5); chim(18, 51.4, 6.5);
    // 药田 + 晒药架
    for (const x of [-36, -30, -24]) for (const z of [-7, -12, -17]) { S.put(herbBed(4, 3, rng), x, z, 0, 0, { bake: true }); S.mark(x - 2, z - 1.5, x + 2, z + 1.5); }
    for (const x of [-22, -26, -30]) S.ref('herbRack', x, x, -1.6, 1, 0, 0.6);
    // 比丹台（试炼场）+ 演武场
    { const [ax, az] = [-28, 36]; S.paveDisc(ax, az, 6.5, DC.pave); S.mark(ax - 6.5, az - 6.5, ax + 6.5, az + 6.5); for (let k = 0; k < 4; k++) { const [x, z] = P(45 + 90 * k, 7.2); S.put(banner(['#8a3a1a', '#c86a1a', '#6a2a1a', '#a85a2a'][k], ['丹', '火', '鼎', '炉'][k]), ax + x, az + z, 0); S.circ(ax + x, az + z, 0.25); } }
    S.paveRect(10, 28, 26, 39, DC.pave);
    S.ref('cart', 0, -8.6, 53, 1, 0.4, 1.0);
    S.put(well(DC.roof2), 8.6, 54, 0, 0, { bake: true }); S.circ(8.6, 54, 1.1);
    S.put(woodpile(), 24.6, 44, Math.PI / 2, 0, { bake: true }); S.circ(24.6, 44, 1.0);
    batch(S, [[woodpile(), -40.6, 38.4, 0.2]]); S.circ(-40.6, 38.4, 1.0);
    S.put(tableSet(), 8.6, 46, 0, 0, { bake: true }); S.circ(8.6, 46, 1.2);
    for (const [x, z, k] of [[-39.6, 43.4, 'jar'], [-39.4, 44.4, 'jar'], [-39.8, 52.6, 'crate'], [-38.8, 53.4, 'barrel'], [36.2, -44, 'jar'], [37.2, -43.6, 'jar'], [47.4, -43.6, 'crate']]) S.ref(k, 0, x, z, 1, rng() * TAU, 0.45);

    // ---- 人 ----
    const RR = DD_PEOPLE();
    for (const [x, z] of [...RR.disciples, ...RR.npcs.map((n) => n.p), ...RR.npcs.flatMap((n) => n.route || []), RR.elder]) S.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2);

    // ---- 散布：城里零星松树、灵草；地火池边火焰花；城外一圈松林 ----
    const inner = (x, z) => Math.abs(x) < 54 && Math.abs(z) < 58;
    S.scatter(rng, 40, 10, 80, (x, z, r, i) => (i % 3 ? S.ref('pineTree', i, x, z, 0.8 + r() * 0.3, r() * TAU, 0.5) : S.ref('mossRock', i, x, z, 0.8 + r() * 0.5, r() * TAU, 0.5)),
      (x, z) => !inner(x, z) || !S.free(x, z, 2.5) || steep(S, x, z) || Math.abs(x) < 5 || Math.abs(x - 34) < 4);
    for (let i = 0; i < 10; i++) { const a = rng() * TAU, r = 7.2 + rng() * 1.6, x = DD_PIT[0] + Math.sin(a) * r, z = DD_PIT[1] + Math.cos(a) * r; if (S.free(x, z, 0.3)) S.ref('fireFlower', i, x, z, 0.8 + rng() * 0.3, rng() * TAU); }
    for (const [x, z] of [[-38.6, -3.4], [-20.4, -19.6], [-38.6, -19.6]]) S.ref('lingzhi', 0, x, z, 1, rng() * TAU);
    S.scatter(rng, 170, 76, 104, (x, z, r, i) => S.ref(i % 4 ? 'pineTree' : i % 8 ? 'tree' : 'mossRock', i, x, z, 1.0 + r() * 0.5, r() * TAU, 0.6),
      (x, z) => inner(x + Math.sign(x) * 4, z + Math.sign(z) * 4) || (Math.abs(x) < 9 && z > 0) || Math.hypot(x + 68.2, z + 25.4) < 10);

    // ---- 烟：烟囱、丹炉 ----
    S.anims.push((dt) => {
      const fx = g.fx; if (!fx || !near(S, 110)) return;
      for (const [x, y, z] of smoke) if (Math.random() < dt * 1.2) fx.mote(S.x + x + (Math.random() - 0.5) * 0.4, y, S.z + z + (Math.random() - 0.5) * 0.4, '#c8beb4', { life: 4, size: 1.1, vy: 1.1, vx: 0.3, vz: 0.1, bright: 0.6 });
    });
    return { ...RR, look: { robe: '#e8a050', robe2: '#7a3a1a', belt: '#4a2a10', hairStyle: [0, 2, 1, 3], hair: '#1a1210', sword: false }, elderName: '黄精' };
  },
};

function DD_PEOPLE() {
  const elderLook = (o) => ({ skin: '#e2b08a', hair: '#d8d0c4', hairStyle: 2, age: 'elder', beard: true, robe: '#c87a3a', robe2: '#f4e0c0', belt: '#4a2a10', sword: false, ...o });
  const outer = { robe: '#f0c088', robe2: '#f8ecd8', belt: '#8a5a2a' };   // 外门：杏黄
  const inner = { robe: '#e8a050', robe2: '#7a3a1a', belt: '#4a2a10' };   // 内门：赤金
  const servant = { robe: '#8a7a64', robe2: '#d8ccb8', belt: '#3a3024', sword: false };
  const [cx, cz] = DD_PLAZA, fan = (k) => { const a = 22.5 + 45 * k, [x, z] = P(a, 10.2), [fx, fz] = P(a, 8.5); return [cx + x, cz + z, faceTo(cx + x, cz + z, cx + fx, cz + fz)]; };
  const drill = [30, 33.5, 37].flatMap((z) => [12, 16, 20, 24].map((x) => [x, z, 0, 'drill', { t: 0 }]));
  return {
    elder: [-12.0, 46, Math.PI / 2], yard: [18, 33.5], lib: [-38.8, 48], stele: [-9, 68], front: [0, 68], arena: [-28, 36],
    disciples: [
      ...[0, 1, 2, 4, 5, 6, 7].map((k) => [...fan(k), 'work']),
      ...drill,
      ...[-14.5, -10.5, -7, -3.5, 3.5, 11.5].map((x) => [x, -29, Math.PI, 'cast']),
      [-33, -9.5, 0, 'work'], [-21, -14.5, -Math.PI / 2, 'work'], [-30, -14.6, 0, 'work'],
      ...[1, 3, 5].map((k) => [36.6, 36 - 12 * k - 2.2, -Math.PI / 2, 'sit']),
      [-30, 32.4, 0, 'spar'], [-26, 32.4, 0, 'spar'],
      [-38.6, 44.6, Math.PI / 2, 'work'],
      [-42.6, 24, Math.PI / 2, 'idle'], [-42.6, 19, Math.PI / 2, 'idle'], [-42.6, 1, Math.PI / 2, 'idle'],
      [-37, 8, Math.PI / 2, 'cast'],
      [-46, -42.6, 0, 'idle'], [-41, -42.6, 0, 'idle'],
    ],
    npcs: [
      { name: '丹阳子', title: '掌门', p: [0, -30.4, 0], look: elderLook({ hair: '#f0ece4', robe: '#c83a1a', robe2: '#ffd890', belt: '#6a1a0a' }), lines: ['丹道九转，转转要命。你想学？先学会等。', '一炉好丹，七分火候，三分心性。', '巨鼎里那三颗金丹，炼了一百二十年，还差一转。'] },
      { name: '火云', title: '大长老', p: [8.4, -30.8, -0.3], look: elderLook({ hair: '#8a3a2a', hairStyle: 0, robe: '#a83a1a', robe2: '#f4c080' }), lines: ['我的头发是被丹炉燎红的，不是染的。', '炸炉不丢人，炸了不知道为什么才丢人。', '丹王阁里的丹方，一张抵一座城。'] },
      { name: '鼎老', title: '丹王', p: [-18, -38.6, 0], look: elderLook({ hair: '#ffffff', robe: '#e8d8b8', robe2: '#8a6a3a', belt: '#5a3a1a' }), act: 'sit', lines: ['……（他闭着眼，鼻子动了动）你身上有灵草味。田里种的？', '老夫炼了三百年丹，最好的一炉，是给一个凡人小孩退烧的。', '药无贵贱，用对了就是仙丹。'] },
      { name: '钱掌柜', title: '药材库管事', p: [-38.6, 51.6, Math.PI / 2], look: { ...servant, robe: '#6a5a3a', hairStyle: 2, hair: '#2a1a10', beard: true }, lines: ['药材库进出都要记账，一钱人参也不能少。', '你田里种的灵草，我们收。价钱好商量。', '最近血灵芝涨价了，涨得离谱。'] },
      { name: '炎小六', title: '守火弟子', p: [-30, 15.4, Math.PI], look: { ...outer, hairStyle: 3, hair: '#3a1a10' }, lines: ['地火池里的火三千年没灭过。', '别靠栏杆太近，眉毛会没的——问我怎么知道的。', '每天往池里扔一块赤铜，火就不会弱。'] },
      { name: '吕青炉', title: '巨鼎守炉', p: [0, 20.2, Math.PI], look: elderLook({ hair: '#4a4038', hairStyle: 0, robe: '#7a4a2a' }), lines: ['这尊鼎，开派祖师从地火里捞出来的。', '鼎上那三颗丹在转，说明还活着。', '离远点，鼎气冲人。'] },
      ...['赵炉', '孙鼎', '李汞', '周铅', '吴硝', '郑硫'].map((name, k) => ({
        name, title: `丹房${'甲乙丙丁戊己'[k]}主`, p: [36.6, 36 - 12 * k + 1.4, -Math.PI / 2], look: { ...inner, hairStyle: [0, 2, 1, 3, 0, 2][k], hair: ['#1a1210', '#4a3a2a', '#2a1a10', '#c8c0b8', '#1a1210', '#3a2a1a'][k], age: k === 3 ? 'elder' : undefined },
        lines: [
          ['丹房甲，炼的是辟谷丹。最便宜，最多人买。', '火要稳，像揉面。'],
          ['丹房乙，炼回春丹。上一炉卖给了青锋剑派。', '我叫孙鼎，生来就是炼丹的命。'],
          ['丹房丙炼的是水银……咳，是汞。别碰那个罐子。', '汞能化金，也能化人。'],
          ['老夫在丹房丁炼了六十年筑基丹。', '筑基丹十炉九废，剩下那一炉，值十炉的价。'],
          ['丹房戊，硝石爆裂，适合炼破障丹。', '我的炉子炸过十七次，房顶修了十七次。'],
          ['丹房己在最上面，硫磺味最重，所以没人跟我抢。', '站在这儿，整座城都在脚下冒烟。'],
        ][k],
      })),
      { name: '何婆', title: '药田婆婆', p: [-27, -9.5, 0], look: elderLook({ hair: '#e8e4dc', hairStyle: 1, beard: false, robe: '#6a7a4a', robe2: '#e0d8b8' }), act: 'work', lines: ['丹炉是男人的，药田是婆子的。没有药，炉子烧空气吗？', '这畦是何首乌，跟我同姓，长得也像我。', '你会种地？那咱们有得聊。'] },
      { name: '铁面', title: '执法长老', p: [-41, -26, Math.PI / 2], look: elderLook({ hair: '#3a3430', robe: '#3a2a20', robe2: '#c88a40', belt: '#1a1410' }), lines: ['偷丹者，断手。卖假丹者，断丹道。', '执法堂里关着三个想偷看丹方的。'] },
      { name: '丹砂', title: '守门弟子', p: [-3.6, 65.4, 0], look: { ...inner, hairStyle: 0 }, lines: ['丹鼎派。求丹的走左边，卖药的走右边。', '门口两尊香鼎，烧的是安神香。'] },
      { name: '朱砂', title: '守门弟子', p: [3.6, 65.4, 0], look: { ...inner, hairStyle: 2 }, lines: ['我叫朱砂，他叫丹砂。都是一种矿。', '炉火纯青——那块牌坊是丹王题的字。'] },
      { name: '阿福', title: '小药童', p: [-10, 28.6], look: { ...outer, hairStyle: 3, age: 'child' }, route: [[-10, 28.6], [10, 28.6]], speed: 1.5, pause: 2, lines: ['我在给八座丹炉送炭，一天跑八十趟！', '巨鼎上的金丹会转圈，我数过，一圈三十下心跳。', '长大我要炼一颗让人长高的丹。'] },
      { name: '胖厨', title: '膳堂大厨', p: [12.8, 48, -Math.PI / 2], look: { ...servant, hairStyle: 0, hair: '#1a1410', robe: '#e8e0d0' }, lines: ['丹鼎派的饭最好吃，因为灶火是地火引上来的。', '药膳？天天药膳，今天给你炖个不放药的。'] },
      { name: '吴苦', title: '试药弟子', p: [-20.6, 31.4, 0.4], look: { ...outer, hairStyle: 2, hair: '#3a2a1a', robe: '#c8b090' }, lines: ['我的工作是试药。今天试了三颗，脸还绿着吗？', '师兄说试药能长修为。我信了三年了。'] },
      { name: '秦丹心', title: '大师兄', p: [-30.6, 36, Math.PI / 2], look: { ...inner, hairStyle: 0, hair: '#1a1210' }, act: 'spar', lines: ['丹鼎派弟子也要会打架——不然丹被抢了怎么办？', '我出拳带火，你小心衣服。'] },
      { name: '柳毒心', title: '二师姐', p: [-25.4, 36, -Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#1a1214', robe: '#6a8a3a', robe2: '#e8e0c0' }, act: 'spar', lines: ['我专攻毒丹。名字是师父取的，人不毒。', '毒和药只差一钱。你想知道是哪一钱？'] },
      { name: '老马', title: '车夫', p: [-6.4, 52, -0.6], look: { ...servant, hairStyle: 0, hair: '#5a4a3a', beard: true }, lines: ['这车药材，从南边百花谷拉来的。', '一路上三拨劫匪，都被我车上的硫磺熏跑了。'] },
      { name: '风小扇', title: '扇火弟子', p: fan(3), look: { ...outer, hairStyle: 1, hair: '#2a1a14' }, act: 'work', lines: ['扇火也是功夫！快了火旺，慢了火虚。', '我一天扇一万下，胳膊比腿粗了。'] },
      { name: '温香', title: '晒药弟子', p: [-28, -0.6, Math.PI], look: { ...outer, hairStyle: 1, robe: '#f4e0b8' }, act: 'work', lines: ['晒药最怕下雨。下雨天我比谁都跑得快。', '这一架是陈皮，越陈越香。'] },
    ],
  };
}

export const SITES4 = { 百花谷: baihua, 丹鼎派: danding };
