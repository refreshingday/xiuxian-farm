// 门派 5：御兽宗（规划见 SECTS.md）。规矩同 sectsites2.js：本地坐标，正门朝 +z；台地往北升高，边缘 0 级。
// 竹海里的一座木栅山寨：一圈原木栅栏 + 四座箭楼，正门是一对交叉的巨兽獠牙；中间圆形驯兽台（白虎、三尾狐、野猪绕着驯兽师转）；
// 东西两座兽栏（灵鹿、灵狐 / 灵狼在栏里走动）；北面 3 级台地上御兽殿，东北 5 级孤崖上灵禽阁（仙鹤绕崖飞），西北竹楼小丘。
// 这里也放几件别的门派会借用的小工具（rod / taperTube / ringFence / beast…）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh, at, toon, boxUV, addOutline } from './util.js';
import { M, TX, shade, roof, plaque, hall, tower, banner, brazier, latticeTex } from './sectkit.js';
import { TAU, rng32, well, woodpile, tableSet, fence, terraceStairs, cylUVs } from './sectprops.js';
import { makeTerrain, plat, polyDist } from './terrace.js';
import { P, faceTo, faceIn, markLine, paveStrip, batch, steep } from './sectsites2.js';

const UP = new THREE.Vector3(0, 1, 0);

// ---------- 共用小工具 ----------
// 两点之间一根圆杆（r0 底，r1 顶）
export function rod(a, b, r0, r1, m, seg = 7) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const o = mesh(new THREE.CylinderGeometry(r1, r0, L, seg).translate(0, L / 2, 0), m);
  o.position.copy(A); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
// 沿曲线由粗到细的管子（獠牙、尾巴、鹤颈）
export function taperTube(pts, r0, r1, m, seg = 24, rad = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, seg, 1, rad, false), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg), r = r0 + (r1 - r0) * (i / seg) ** 0.8;
    for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  geo.computeVertexNormals(); return mesh(geo, m);
}
const ell = (sx, sy, sz, m, x, y, z, seg = 12) => at(mesh(new THREE.SphereGeometry(0.5, seg, Math.max(6, Math.round(seg * 0.7))).scale(sx, sy, sz), m), x, y, z);

// 圆形围栏（驯兽台、熔岩池）：木桩 + 两道绳，gapsDeg 处留口子
export function ringFence(S, cx, cz, R, gapsDeg = [], o = {}) {
  const G = new THREE.Group(), post = M(o.post || '#7a5a3a', { tx: TX.wood }), rope = M(o.rope || '#c8a870');
  const half = 1.5 / R, n = Math.round(TAU * R / 1.3), y0 = S.hy(cx, cz), pts = [];
  const inGap = (a) => gapsDeg.some((g) => { let d = a - g * Math.PI / 180; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < half; });
  for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(inGap(a) ? null : [Math.sin(a) * R, Math.cos(a) * R]); }
  pts.forEach((p, i) => {
    if (!p) return; const [x, z] = p, y = S.hy(cx + x, cz + z) - y0;
    G.add(at(mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.15, 6).translate(0, 0.57, 0), post), x, y, z));
    S.circ(cx + x, cz + z, 0.3);
    const q = pts[(i + 1) % n]; if (!q) return;
    for (const h of [0.45, 0.85]) G.add(rod([x, y + h, z], [q[0], y + h, q[1]], 0.03, 0.03, rope, 4));
    S.circ(cx + (x + q[0]) / 2, cz + (z + q[1]) / 2, 0.3);
  });
  S.put(G, cx, cz, 0, 0, { bake: true });
  S.mark(cx - R - 0.5, cz - R - 0.5, cx + R + 0.5, cz + R + 0.5);
}

// ---------- 灵兽：身子一块（烘焙），四条腿各自摆动 ----------
// body = 椭球全宽 / 全高 / 全长；leg 腿长；head = 头椭球
const BEASTS = {
  deer: { body: [0.5, 0.56, 1.1], leg: 0.78, lr: 0.055, c: '#c8884a', belly: '#f6ead6', dark: '#3a2a20', head: [0.3, 0.3, 0.46], snout: 0, neck: 0.5, ears: 'leaf', antler: '#9ef0ff', spots: true, tail: 'stub', speed: 1.3 },
  wolf: { body: [0.46, 0.5, 1.05], leg: 0.52, lr: 0.07, c: '#8a929c', belly: '#d8dce0', dark: '#2a2e34', head: [0.34, 0.32, 0.4], snout: 0.3, neck: 0.25, ears: 'point', tail: 'bush', ruff: true, speed: 1.7 },
  tiger: { body: [0.72, 0.68, 1.55], leg: 0.6, lr: 0.11, c: '#f4f0e6', belly: '#ffffff', dark: '#2a2a34', head: [0.58, 0.52, 0.52], snout: 0.16, neck: 0.15, ears: 'round', stripes: true, tail: 'long', glowEye: '#8ad8ff', speed: 1.2 },
  fox: { body: [0.32, 0.32, 0.68], leg: 0.28, lr: 0.045, c: '#f08a3a', belly: '#fff4e8', dark: '#3a2418', head: [0.26, 0.24, 0.28], snout: 0.2, neck: 0.12, ears: 'point', tail: 'fox', tails: 1, speed: 2.0 },
  boar: { body: [0.68, 0.66, 1.15], leg: 0.36, lr: 0.09, c: '#6a4a3a', belly: '#8a6a52', dark: '#2a1a14', head: [0.44, 0.42, 0.44], snout: 0.22, neck: 0, ears: 'point', tusks: true, mane: true, tail: 'stub', speed: 1.0 },
};
function beastParts(kind, o = {}) {
  const K = { ...BEASTS[kind], ...o }, core = new THREE.Group(), legs = [];
  const [bw, bh, bl] = K.body, L = K.leg, by = L + bh * 0.4;
  const mc = M(K.c), mb = M(K.belly), md = M(K.dark);
  core.add(ell(bw, bh, bl, mc, 0, by, 0, 14));
  core.add(ell(bw * 0.82, bh * 0.5, bl * 0.8, mb, 0, by - bh * 0.22, 0));
  const [hw, hh, hl] = K.head, hz = bl * 0.44 + hl * 0.2 + K.neck * 0.35, hy = by + bh * 0.22 + K.neck * 0.85;
  if (K.neck > 0.05) core.add(rod([0, by + bh * 0.1, bl * 0.34], [0, hy - hh * 0.2, hz - hl * 0.15], Math.min(bw, bh) * 0.3, hw * 0.34, mc));
  core.add(ell(hw, hh, hl, mc, 0, hy, hz));
  if (K.snout) core.add(ell(hw * 0.58, hh * 0.5, K.snout + hl * 0.3, mb, 0, hy - hh * 0.16, hz + hl * 0.32));
  const nz = hz + hl * 0.5 + (K.snout ? K.snout * 0.5 : 0);
  core.add(ell(hw * 0.24, hh * 0.18, 0.08, md, 0, hy - hh * (K.snout ? 0.06 : 0.02), nz - 0.02));
  const em = K.glowEye ? glow(K.glowEye, 2) : md;
  for (const s of [-1, 1]) core.add(ell(hw * 0.15, hh * 0.18, 0.07, em, s * hw * 0.28, hy + hh * 0.1, hz + hl * 0.37));
  // 耳朵
  for (const s of [-1, 1]) {
    if (K.ears === 'leaf') { const e = ell(hw * 0.28, hh * 0.75, 0.05, mc, s * hw * 0.46, hy + hh * 0.36, hz - hl * 0.1); e.rotation.z = -s * 0.9; core.add(e); }
    else if (K.ears === 'point') { const e = at(mesh(new THREE.ConeGeometry(hw * 0.18, hh * 0.55, 4), mc), s * hw * 0.3, hy + hh * 0.52, hz - hl * 0.05); e.rotation.z = -s * 0.25; core.add(e); }
    else core.add(ell(hw * 0.34, hh * 0.34, hw * 0.2, mc, s * hw * 0.36, hy + hh * 0.42, hz - hl * 0.05));
  }
  // 灵鹿的鹿角：发光
  if (K.antler) { const am = glow(K.antler, 1.6); for (const s of [-1, 1]) { const a0 = [s * hw * 0.18, hy + hh * 0.42, hz - hl * 0.1], a1 = [s * hw * 0.62, hy + hh * 0.42 + 0.4, hz - hl * 0.32], m1 = [s * hw * 0.4, hy + hh * 0.42 + 0.2, hz - hl * 0.2]; core.add(rod(a0, a1, 0.03, 0.018, am, 5)); core.add(rod(m1, [s * hw * 0.95, hy + hh * 0.42 + 0.3, hz - hl * 0.05], 0.022, 0.014, am, 5)); core.add(rod(a1, [s * hw * 0.7, hy + hh * 0.42 + 0.6, hz - hl * 0.1], 0.018, 0.01, am, 5)); } }
  if (K.spots) for (const [f, gz] of [[0.15, 0.2], [-0.13, 0.06], [0.1, -0.14], [-0.17, -0.26], [0.02, 0.32], [0.2, -0.3]]) core.add(ell(0.07, 0.03, 0.07, mb, f * bw, by + bh / 2 * Math.sqrt(Math.max(0, 1 - 4 * f * f - 4 * gz * gz)), gz * bl, 6));
  if (K.stripes) for (const fz of [-0.34, -0.2, -0.06, 0.08, 0.22]) { const f = Math.sqrt(1 - (2 * fz) ** 2); core.add(at(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16, 1, true).rotateX(Math.PI / 2).scale(bw * f * 1.04, bh * f * 1.04, 1), md), 0, by, fz * bl)); }
  if (K.tusks) for (const s of [-1, 1]) { const t = at(mesh(new THREE.ConeGeometry(0.04, 0.22, 5), M('#f2ead2')), s * hw * 0.3, hy - hh * 0.22, nz - 0.08); t.rotation.x = 0.4; t.rotation.z = -s * 0.3; core.add(t); }
  if (K.mane) for (let i = 0; i < 6; i++) { const z = (0.3 - i * 0.12) * bl; core.add(at(mesh(new THREE.ConeGeometry(0.06, 0.2, 4), md), 0, by + bh / 2 * Math.sqrt(Math.max(0, 1 - (2 * z / bl) ** 2)) + 0.04, z)); }
  if (K.ruff) core.add(ell(bw * 1.05, bh * 0.9, bl * 0.35, mb, 0, by + bh * 0.1, bl * 0.3));
  // 尾巴
  const tz = -bl * 0.46, ty = by + bh * 0.12;
  if (K.tail === 'bush') { const t = new THREE.Group(); t.add(ell(0.16, 0.16, 0.5, mc, 0, 0, -0.24)); t.add(ell(0.11, 0.11, 0.16, mb, 0, 0, -0.5)); t.position.set(0, ty, tz); t.rotation.x = -0.5; core.add(t); }
  else if (K.tail === 'long') core.add(taperTube([[0, ty, tz], [0, ty - 0.05, tz - 0.35], [0.1, ty + 0.25, tz - 0.7], [0.18, ty + 0.55, tz - 0.85]], 0.075, 0.04, mc, 12, 6));
  else if (K.tail === 'fox') { const n = K.tails || 1; for (let i = 0; i < n; i++) { const t = new THREE.Group(), yaw = n > 1 ? (i - (n - 1) / 2) * 0.45 : 0; t.add(ell(0.2, 0.2, 0.55, mc, 0, 0, -0.27)); t.add(ell(0.14, 0.14, 0.2, mb, 0, 0, -0.53)); t.position.set(0, ty, tz); t.rotation.set(0.7, yaw, 0, 'YXZ'); core.add(t); } }
  else core.add(ell(0.12, 0.12, 0.12, mb, 0, ty + 0.04, tz - 0.02, 8));
  // 腿：髋关节为轴（四个枢轴组，动画里摆）
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group(); p.position.set(sx * bw * 0.27, L + 0.06, sz * bl * 0.3);
    p.add(mesh(new THREE.CylinderGeometry(K.lr, K.lr * 0.75, L + 0.06, 6).translate(0, -(L + 0.06) / 2, 0), mc)); legs.push(p);
  }
  return { core, legs, K };
}
export function beast(S, kind, o = {}) {
  const { core, legs, K } = beastParts(kind, o), G = new THREE.Group();
  const C = S.bake(core); addOutline(C, S.w.M.line); G.add(C);
  for (const l of legs) { G.add(l); if (K.lr > 0.08) addOutline(l, S.w.M.line); }   // 细腿不描边（省 draw call）
  G.scale.setScalar(o.s || 1); S.g.scene.add(G);
  return { G, core: C, legs, K };
}
// 石雕灵兽（殿前石虎）：同一套身子，石头颜色，腿并进身子
function beastStatue(kind, stone) {
  const { core, legs } = beastParts(kind, { c: stone, belly: shade(stone, 1.08), dark: shade(stone, 0.7), antler: null, glowEye: null });
  for (const l of legs) core.add(l);
  return core;
}
// 一群灵兽：wander 在矩形里随走随停；orbit 绕一点转圈（驯兽台上绕着驯兽师）
function herd(S, list, rng) {
  const g = S.g, all = [];
  for (const it of list) for (let i = 0; i < (it.n || 1); i++) {
    const b = beast(S, it.kind, it.o || {}), st = { b, it, ph: rng() * TAU, mv: 0, wait: rng() * 3 };
    if (it.orbit) st.a = (it.off || 0) + i * TAU / (it.n || 1);
    else { st.x = it.x + (rng() * 2 - 1) * it.hw * 0.8; st.z = it.z + (rng() * 2 - 1) * it.hd * 0.8; st.yaw = rng() * TAU; st.tx = st.x; st.tz = st.z; }
    all.push(st);
  }
  S.anims.push((dt) => {
    dt = Math.min(dt, 0.1);
    for (const st of all) {
      const { b, it } = st, K = b.K; let v = 0, x, z, yaw;
      if (it.orbit) { const [cx, cz, R, w] = it.orbit; st.a += w * dt; x = cx + Math.sin(st.a) * R; z = cz + Math.cos(st.a) * R; yaw = st.a + Math.sign(w) * Math.PI / 2; v = Math.abs(w) * R; }
      else {
        if (st.wait > 0) st.wait -= dt;
        else {
          const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz);
          if (d < 0.3) { st.wait = 1.5 + rng() * 4; st.tx = it.x + (rng() * 2 - 1) * it.hw; st.tz = it.z + (rng() * 2 - 1) * it.hd; }
          else {
            let df = Math.atan2(dx, dz) - st.yaw; df = Math.atan2(Math.sin(df), Math.cos(df));
            st.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, df));
            if (Math.abs(df) < 1) { v = K.speed * 0.55; st.x += Math.sin(st.yaw) * v * dt; st.z += Math.cos(st.yaw) * v * dt; }
          }
        }
        x = st.x; z = st.z; yaw = st.yaw;
      }
      st.mv += ((v > 0.05 ? 1 : 0) - st.mv) * Math.min(1, dt * 6);
      st.ph += dt * (v + 0.2) * 6 / (K.leg + 0.3);
      b.G.position.set(S.x + x, S.hy(x, z), S.z + z); b.G.rotation.y = yaw;
      const sw = Math.sin(st.ph) * 0.6 * st.mv; b.legs[0].rotation.x = b.legs[3].rotation.x = sw; b.legs[1].rotation.x = b.legs[2].rotation.x = -sw;
      b.core.position.y = Math.abs(Math.sin(st.ph)) * 0.04 * st.mv;
      if (it.mote && g.fx && Math.random() < dt * 4) g.fx.mote(S.x + x + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, S.z + z + (Math.random() - 0.5) * 0.6, it.mote, { life: 1.6, size: 0.3, vy: 0.4, bright: 1.4 });
    }
  });
  S.anims[S.anims.length - 1](0, 0);
  return all;
}
// 飞鸟（仙鹤 / 鹰）：身子烘焙，两片翅膀扇动；绕一点盘旋，转弯时侧倾
function flyer(S, list) {
  const all = [];
  for (const it of list) {
    const G = new THREE.Group(), core = new THREE.Group(), c = M(it.c || '#f8f8f4'), k = M(it.k || '#1a1a1e');
    core.add(ell(0.5, 0.42, 1.0, c, 0, 0, 0));
    core.add(taperTube([[0, 0.05, 0.4], [0, 0.12, 0.75], [0, 0.15, 1.05]], 0.09, 0.05, c, 8, 6));
    core.add(ell(0.2, 0.2, 0.24, c, 0, 0.16, 1.12, 8));
    if (it.crown !== false) core.add(ell(0.1, 0.06, 0.1, M('#e8303a'), 0, 0.26, 1.12, 6));
    core.add(at(mesh(new THREE.ConeGeometry(0.035, 0.32, 5).rotateX(Math.PI / 2), M(it.beak || '#c8a040')), 0, 0.14, 1.36));
    core.add(ell(0.36, 0.12, 0.42, k, 0, 0.02, -0.52, 8));
    for (const s of [-1, 1]) core.add(rod([s * 0.06, -0.12, -0.3], [s * 0.05, -0.16, -1.0], 0.02, 0.015, M('#2a2a2a'), 4));
    const C = S.bake(core); addOutline(C, S.w.M.line); G.add(C);
    const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.18, 0.06, 0); w.add(at(mesh(new THREE.BoxGeometry(1.3, 0.04, 0.5), c), s * 0.65, 0, 0)); w.add(at(mesh(new THREE.BoxGeometry(0.42, 0.045, 0.42), k), s * 1.15, 0, -0.04)); G.add(w); return w; });
    G.scale.setScalar(it.s || 1); S.g.scene.add(G);
    all.push({ G, wings, it, a: it.off || 0, ph: it.off * 3 || 0 });
  }
  S.anims.push((dt, t) => {
    dt = Math.min(dt, 0.1);
    for (const f of all) {
      const [cx, cz, R, w] = f.it.orbit; f.a += w * dt;
      f.G.position.set(S.x + cx + Math.sin(f.a) * R, f.it.y + Math.sin(t * 0.6 + f.ph) * 0.4, S.z + cz + Math.cos(f.a) * R);
      f.G.rotation.set(0, f.a + Math.sign(w) * Math.PI / 2, -Math.sign(w) * 0.25);
      const fl = Math.sin(t * 5 + f.ph) * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.4 + f.ph)); f.wings[0].rotation.z = -fl; f.wings[1].rotation.z = fl;
    }
  });
  S.anims[S.anims.length - 1](0, 0);
}

// ---------- 御兽宗的寨子零件 ----------
const bark = () => M('#c8a880', { tx: 'tree_bark' }), thatchC = '#f4e4c0';
// 原木栅栏：一圈削尖的原木（合成一块）+ 两道横箍，gapA（弧度）处是山门
function palisade(S, R, gapA, rng) {
  const geos = [], tips = [], n = Math.round(TAU * R / 0.5);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, da = a > Math.PI ? a - TAU : a; if (Math.abs(da) < gapA) continue;
    const h = 3.1 + rng() * 0.7, x = Math.sin(a) * R, z = Math.cos(a) * R, y0 = S.hy(x, z) - 0.2;
    geos.push(cylUVs(new THREE.CylinderGeometry(0.15, 0.17, h, 6, 1, true), 0.17, h).translate(x, y0 + h / 2, z));
    tips.push(new THREE.ConeGeometry(0.15, 0.45, 6, 1, true).translate(x, y0 + h + 0.22, z));
  }
  const G = new THREE.Group();
  G.add(mesh(mergeGeometries(geos), bark()));
  G.add(mesh(mergeGeometries(tips), M('#8a6a44')));
  for (const y of [0.9, 2.1]) G.add(at(mesh(new THREE.TorusGeometry(R - 0.2, 0.06, 4, 200, TAU - 2 * gapA).rotateX(Math.PI / 2).rotateY(-(Math.PI / 2 + gapA)), M('#6a4a2a')), 0, y, 0));
  S.put(G, 0, 0, 0, 0, { abs: true });
  const m = Math.ceil((TAU - 2 * gapA) * R / 0.9);
  for (let i = 0; i <= m; i++) { const a = gapA + i / m * (TAU - 2 * gapA); S.circ(Math.sin(a) * R, Math.cos(a) * R, 0.5); }
}
// 箭楼：四根原木柱、平台、栏板、剪刀撑、茅草攒尖顶、前面一架梯子
function watchTower() {
  const G = new THREE.Group(), H = 4.4, wood = bark(), plank = M('#a88a5a', { tx: TX.wood }), p = 1.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(rod([sx * p * 1.1, 0, sz * p * 1.1], [sx * p, H + 1.35, sz * p], 0.17, 0.13, wood));
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(3.4, 0.22, 3.4), 3.4, 0.22, 3.4, 0.5), plank), 0, H, 0));
  for (const [x, z, ry] of [[0, 1.65, 0], [0, -1.65, 0], [1.65, 0, Math.PI / 2], [-1.65, 0, Math.PI / 2]]) { const r = mesh(boxUV(new THREE.BoxGeometry(3.3, 0.9, 0.08), 3.3, 0.9, 0.08, 0.5).translate(0, 0.45, 0), plank); r.position.set(x, H + 0.1, z); r.rotation.y = ry; G.add(r); }
  for (const s of [-1, 1]) { G.add(rod([-p * 1.08, 0.4, s * p * 1.05], [p * 1.02, H - 0.2, s * p * 1.02], 0.07, 0.07, wood, 5)); G.add(rod([p * 1.08, 0.4, s * p * 1.05], [-p * 1.02, H - 0.2, s * p * 1.02], 0.07, 0.07, wood, 5)); }
  const R = roof(4.2, 4.2, 1.5, thatchC, { pyramid: true, k: 1, tx: 'thatch_straw', ridge: '#8a7040' }); R.position.y = H + 1.3; G.add(R);
  for (const s of [-1, 1]) G.add(rod([s * 0.35, 0, 2.5], [s * 0.35, H + 0.2, 1.75], 0.05, 0.05, wood, 5));
  for (let i = 1; i < 12; i++) { const t = i / 12; G.add(at(mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), plank), 0, t * (H + 0.2), 2.5 - t * 0.75)); }
  G.userData.foot = [3.4, 3.4];
  return G;
}
// 吊脚竹楼：木桩架高 + 一圈回廊栏杆 + 茅草顶 + 正面木梯
function stiltHouse(w, d, sign, o = {}) {
  const G = new THREE.Group(), H = o.H ?? 1.8, W = w + 1.4, D = d + 1.4, wood = bark(), plank = M('#a88a5a', { tx: TX.wood }), bam = M('#9aa85a');
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) G.add(at(mesh(cylUVs(new THREE.CylinderGeometry(0.16, 0.19, H, 7), 0.19, H).translate(0, H / 2, 0), wood), sx * (W / 2 - 0.3), 0, sz * (D / 2 - 0.3)));
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(W, 0.2, D), W, 0.2, D, 0.5), plank, { recv: true }), 0, H + 0.1, 0));
  const h = 2.5, y0 = H + 0.2;
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 0.35).translate(0, h / 2, 0), M('#d8c48e', { tx: TX.wall }), { recv: true }), 0, y0, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(at(mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 6).translate(0, h / 2, 0), wood), sx * (w / 2 + 0.02), y0, sz * (d / 2 + 0.02)));
  G.add(at(mesh(new THREE.BoxGeometry(1.1, 1.9, 0.08).translate(0, 0.95, 0), M('#5a3a20', { tx: TX.wood })), 0, y0, d / 2 + 0.03));
  const lat = latticeTex('#6a4a28');
  for (const sx of [-1, 1]) { const wn = mesh(new THREE.PlaneGeometry(1.0, 0.9), toon('#ffffff', { map: lat }), { cast: false }); wn.position.set(sx * Math.min(w / 2 - 0.9, 1.9), y0 + 1.4, d / 2 + 0.02); G.add(wn); }
  const rail = (len, x, z, ry) => { const s = new THREE.Group(); s.add(at(mesh(new THREE.BoxGeometry(len, 0.08, 0.08), plank), 0, 0.9, 0)); const n = Math.max(1, Math.round(len / 0.6)); for (let i = 0; i <= n; i++) s.add(at(mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07).translate(0, 0.45, 0), bam), -len / 2 + i * len / n, 0, 0)); s.position.set(x, y0, z); s.rotation.y = ry; G.add(s); };
  const gap = 1.3, fl = (W - gap) / 2;
  rail(fl, -(gap / 2 + fl / 2), D / 2 - 0.05, 0); rail(fl, gap / 2 + fl / 2, D / 2 - 0.05, 0);
  rail(W, 0, -D / 2 + 0.05, 0); rail(D, -W / 2 + 0.05, 0, Math.PI / 2); rail(D, W / 2 - 0.05, 0, Math.PI / 2);
  const R = roof(w + 1.6, d + 1.6, d * 0.5, thatchC, { tx: 'thatch_straw', ridge: '#8a7040', k: 0.5 }); R.position.y = y0 + h + 0.05; G.add(R);
  const n = Math.ceil(H / 0.3), sh = (H + 0.2) / n;
  for (let i = 0; i < n; i++) G.add(at(mesh(new THREE.BoxGeometry(gap, sh * (i + 1), 0.34).translate(0, sh * (i + 1) / 2, 0), plank), 0, 0, D / 2 + 0.17 + (n - 1 - i) * 0.32));
  if (sign) { const p = plaque(sign, Math.min(2.2, w * 0.4), 0.6, o.signC); p.position.set(0, y0 + h - 0.35, d / 2 + 0.05); G.add(p); }
  G.userData.foot = [W, D]; G.userData.name = sign || '';
  return G;
}
// 图腾柱：彩带 + 兽头 + 牛角（偶数根带翅膀）
function totem(i) {
  const G = new THREE.Group(), cs = ['#b8402a', '#2a6a8a', '#d8a030', '#3a7a3a'], H = 3.6;
  G.add(mesh(cylUVs(new THREE.CylinderGeometry(0.28, 0.34, H, 8), 0.34, H).translate(0, H / 2, 0), M('#b08a60', { tx: 'tree_bark' })));
  for (let k = 0; k < 3; k++) G.add(at(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 8), M(cs[(i + k) % 4])), 0, 0.8 + k * 0.9, 0));
  const hc = M(cs[i % 4], { tx: TX.wood });
  G.add(at(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.7), hc), 0, H + 0.4, 0));
  for (const s of [-1, 1]) { G.add(at(mesh(new THREE.BoxGeometry(0.2, 0.16, 0.04), M('#f4ecd8')), s * 0.2, H + 0.55, 0.36)); G.add(at(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.05), M('#1a1410')), s * 0.2, H + 0.55, 0.37)); G.add(rod([s * 0.32, H + 0.75, 0], [s * 0.7, H + 1.25, 0.05], 0.08, 0.03, M('#f2ead2'), 6)); }
  G.add(at(mesh(new THREE.BoxGeometry(0.46, 0.26, 0.24), M(shade(cs[i % 4], 0.7))), 0, H + 0.2, 0.42));
  if (i % 2 === 0) for (const s of [-1, 1]) { const wg = at(mesh(new THREE.BoxGeometry(1.5, 0.45, 0.08), hc), s * 1.0, H - 0.35, 0); wg.rotation.z = s * 0.3; G.add(wg); }
  return G;
}
function trough(len) {
  const G = new THREE.Group(), w = M('#7a5a3a', { tx: TX.wood });
  G.add(mesh(boxUV(new THREE.BoxGeometry(len, 0.55, 0.7), len, 0.55, 0.7, 0.5).translate(0, 0.38, 0), w));
  G.add(at(mesh(new THREE.BoxGeometry(len - 0.16, 0.02, 0.54), M('#5ab0c8')), 0, 0.64, 0));
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), w), s * (len / 2 - 0.2), 0.06, 0));
  return G;
}
function hay() {
  const G = new THREE.Group(), m = M('#f6e4b0', { tx: 'thatch_straw' });
  for (const [x, y, z] of [[-0.6, 0.55, 0], [0.6, 0.55, 0], [0, 1.5, 0]]) G.add(at(mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12).rotateZ(Math.PI / 2), m), x, y, z));
  return G;
}
// 兽栏碰撞：栅栏四边（前面中间开口），沿局部 u（宽）/ v（深）
function penCol(S, cx, cz, w, d, ry) {
  const c = Math.cos(ry), s = Math.sin(ry), W = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
  const seg = (u0, v0, u1, v1) => { const [x0, z0] = W(u0, v0), [x1, z1] = W(u1, v1); S.box(Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15); };
  seg(-w / 2, -d / 2, w / 2, -d / 2); seg(-w / 2, d / 2, -w * 0.1, d / 2); seg(w * 0.1, d / 2, w / 2, d / 2); seg(-w / 2, -d / 2, -w / 2, d / 2); seg(w / 2, -d / 2, w / 2, d / 2);
}

// ===================== 5 御兽宗：竹海山寨（大宗，半径约 88 米）=====================
const YC = { wall: '#e6d6a8', col: '#6a4426', roof: '#55663a', ridge: '#2a341e', stone: '#a8987a', pave: '#c4b494', col2: '#7a5a36', signC: { bg: '#3a2414', rim: '#d8b060', fg: '#fff0c8' } };
const YS = { R: 64, ring: [0, 22], crag: [30, -32], hill: [-40, -22.5] };
const YS_PATHS = [{ pts: [[0, -8], [0, -28]], w: 2.4 }, { pts: [[16, -31], [27, -33]], w: 1.3 }, { pts: [[-24, -12], [-34, -17.4]], w: 1.3 }];
const YS_T = makeTerrain({
  LH: 1.9, rock: '#7a6a52',
  shapes: [
    plat({ x: 0, z: -37, w: 48, d: 24, round: 3, lv: 3, ring: 3.6, wob: 1.2, seed: 21 }),           // 北面 3 级台地：御兽殿
    plat({ x: YS.hill[0], z: YS.hill[1], w: 16, d: 13, round: 3, lv: 2, ring: 3.4, wob: 1.2, seed: 23 }), // 西北竹楼小丘
    plat({ x: YS.crag[0], z: YS.crag[1], w: 10, d: 10, round: 4, lv: 5, ring: 2.2, wob: 1.4, seed: 25 }),  // 东北孤崖：灵禽阁
  ],
  paths: YS_PATHS,
});
const ysPathD = (x, z) => { let d = 1e9; for (const p of YS_PATHS) d = Math.min(d, polyDist(x, z, p.pts) - p.w); return d; };
const yushou = {
  r: 88, terrain: YS_T,
  ground: (lx, lz, n) => {
    if (Math.hypot(lx, lz) > YS.R + 1) return Math.abs(lx) < 2.6 + n && lz > 0 && lz < 92 ? 3 : 0;
    if (Math.hypot(lx - YS.ring[0], lz - YS.ring[1]) < 11.4 + n * 0.6) return 3;                         // 驯兽台：沙地
    if (Math.abs(Math.abs(lx) - 36) < 7.2 + n * 0.4 && Math.abs(lz - 16) < 9.2 + n * 0.4) return 3;     // 兽栏
    if (Math.abs(lx) < 2.4 + n * 0.5 && lz > 32) return 3;                                              // 山门土路
    if (lx > -30.4 - n && lx < -11.6 + n && lz > 27.3 && lz < 38.7) return 3;                          // 演武场
    if (Math.abs(lx) < 10 && lz > -32.5 && lz < -26) return 1;
    if (Math.abs(lx) < 2.4 + n * 0.5 && lz > -28 && lz < 11) return 1;
    return 0;
  },
  build(S) {
    const rng = rng32(51), g = S.g, R = YS.R, gapA = 5.8 / R;
    const hallY = (sign, w, d, extra = {}) => hall({ w, d, h: 3.0, wall: YC.wall, col: YC.col, roof: YC.roof, ridge: YC.ridge, sign, base: 0.6, baseC: YC.stone, signC: YC.signC, ...extra });
    const hallW = (sign, w, d, extra = {}) => hall({ w, d, h: 2.7, wall: '#e8d8b0', col: YC.col2, roof: thatchC, ridge: '#8a7040', rtx: 'thatch_straw', sign, base: 0.4, baseC: YC.stone, rise: d * 0.42, signC: YC.signC, ...extra });

    // ---- 路、铺地、台地石阶（原木色）----
    paveStrip(S, 0, 10.6, 0, -12, 4.4, YC.pave);
    S.paveRect(-12, -32.6, 12, -26.4, YC.pave);
    terraceStairs(S, YS_T, { color: '#8a6a48', rail: null, tx: TX.wood });
    for (const p of YS_PATHS) for (let i = 1; i < p.pts.length; i++) markLine(S, ...p.pts[i - 1], ...p.pts[i], p.w + 0.6);
    markLine(S, 0, 64, 0, 33, 2.6);

    // ---- 木栅 + 四座箭楼 ----
    palisade(S, R, gapA, rng);
    for (const a of [45, 135, 225, 315]) { const [x, z] = P(a, R - 3.4); S.put(watchTower(), x, z, faceIn(x, z), 0, { bake: true }); S.circ(x, z, 2.1); S.mark(x - 2, z - 2, x + 2, z + 2); S.emit(x, 5.4, z, '#ffb060', 0.6, 'lantern'); }

    // ---- 獠牙山门：一对弯曲交叉的巨兽獠牙，竹梁上挂匾，顶上牛头骨 ----
    {
      const G = new THREE.Group(), ivory = M('#f2ead2'), lea = M('#6a4426', { tx: TX.wood }), gold = M('#d8b050', { metal: true });
      for (const s of [-1, 1]) {
        G.add(taperTube([[s * 4.9, 0, 0], [s * 5.7, 3.4, 0], [s * 4.8, 6.8, s * 0.2], [s * 2.2, 9.1, s * 0.35], [-s * 0.9, 9.7, s * 0.35]], 0.85, 0.07, ivory, 30, 12));
        G.add(at(mesh(cylUVs(new THREE.CylinderGeometry(1.0, 1.08, 1.2, 12), 1.05, 1.2), lea), s * 4.95, 0.6, 0));
        G.add(at(mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 18).rotateX(Math.PI / 2), gold), s * 5.0, 1.4, 0));
      }
      G.add(rod([-5.3, 6.3, 0.3], [5.3, 6.3, 0.3], 0.14, 0.14, M('#c8b060'), 8));
      for (const s of [-1, 1]) G.add(rod([s * 1.1, 6.3, 0.3], [s * 1.1, 5.95, 0.3], 0.03, 0.03, M('#3a2a1a'), 4));
      const pl = plaque('御兽宗', 3.2, 0.9, YC.signC); pl.position.set(0, 5.5, 0.34); G.add(pl);
      const pb = pl.clone(); pb.position.z = 0.26; pb.rotation.y = Math.PI; G.add(pb);
      const bone = M('#efe6d0');
      G.add(ell(0.9, 0.7, 1.0, bone, 0, 6.82, 0.35)); G.add(ell(0.5, 0.4, 0.6, bone, 0, 6.62, 0.85));
      for (const s of [-1, 1]) { G.add(ell(0.2, 0.2, 0.1, M('#1a1410'), s * 0.22, 7.05, 0.83, 8)); G.add(rod([s * 0.35, 7.15, 0.35], [s * 1.15, 7.5, 0.45], 0.14, 0.09, bone, 6)); G.add(rod([s * 1.15, 7.5, 0.45], [s * 1.35, 8.15, 0.45], 0.09, 0.03, bone, 6)); }
      S.put(G, 0, R, 0, 0, { bake: true });
      for (const s of [-1, 1]) { S.circ(s * 4.95, R, 1.05); S.put(brazier('#ff9a3a'), s * 6.6, R + 1.6, 0, 0, { bake: true }); S.circ(s * 6.6, R + 1.6, 0.5); S.emit(s * 6.6, 1.4, R + 1.6, '#ffa040', 0.8, 'lantern'); }
    }
    // 山门外：八根图腾柱夹道
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const z = 70 + i * 6; S.put(totem(i + (s > 0 ? 1 : 0)), s * 4.4, z, -s * Math.PI / 2, 0, { bake: true }); S.circ(s * 4.4, z, 0.45); }
    for (const s of [-1, 1]) for (const z of [72.8, 84.8]) S.ref('stoneLan', 0, s * 3.4, z, 0.9, 0, 0.35);

    // ---- 驯兽台：圆形沙场 + 木桩绳栏（四面开口）+ 四面兽旗 + 两只火圈 ----
    const [rx, rz] = YS.ring;
    ringFence(S, rx, rz, 11.6, [0, 90, 180, 270]);
    for (let k = 0; k < 4; k++) { const [x, z] = P(45 + 90 * k, 12.8); S.put(banner(['#8a3a1a', '#3a5a2a', '#2a4a6a', '#6a4a1a'][k], ['驯', '兽', '御', '灵'][k]), rx + x, rz + z, 0); S.circ(rx + x, rz + z, 0.25); }
    for (const s of [-1, 1]) {
      const G = new THREE.Group(), w = M('#6a4426', { tx: TX.wood });
      for (const px of [-1.25, 1.25]) G.add(at(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.9, 6).translate(0, 1.45, 0), w), px, 0, 0));
      G.add(at(mesh(new THREE.TorusGeometry(1.0, 0.07, 6, 24), M('#3a2a1a')), 0, 1.8, 0));
      G.add(at(mesh(new THREE.TorusGeometry(1.0, 0.13, 6, 24), glow('#ff8a2a', 2.2, true), { cast: false }), 0, 1.8, 0));
      S.put(G, rx + s * 6, rz + 7.6, 0, 0, { bake: true }); S.circ(rx + s * 6 - 1.25, rz + 7.6, 0.2); S.circ(rx + s * 6 + 1.25, rz + 7.6, 0.2);
      S.emit(rx + s * 6, 1.8, rz + 7.6, '#ff8a3a', 0.9, 'lantern');
    }

    // ---- 东西兽栏：栅栏 + 水槽 + 草垛 ----
    for (const s of [-1, 1]) {
      const cx = s * 36, cz = 16, ry = -s * Math.PI / 2;
      S.put(fence(18, 14), cx, cz, ry, 0, { bake: true }); penCol(S, cx, cz, 18, 14, ry); S.mark(cx - 7.2, cz - 9.2, cx + 7.2, cz + 9.2);
      S.put(trough(2.6), s * 41.4, 12, Math.PI / 2, 0, { bake: true }); S.circ(s * 41.4, 11.2, 0.5); S.circ(s * 41.4, 12.8, 0.5);
      S.put(hay(), s * 41.2, 21.5, Math.PI / 2, 0, { bake: true }); S.circ(s * 41.2, 21.5, 1.0);
    }

    // ---- 灵兽：栏里走动的、驯兽台上绕圈的、殿前两只白狐 ----
    herd(S, [
      { kind: 'deer', n: 3, x: -36, z: 16, hw: 5.2, hd: 7.2 },
      { kind: 'fox', n: 1, x: -36, z: 16, hw: 5.2, hd: 7.2 },
      { kind: 'wolf', n: 3, x: 36, z: 16, hw: 5.2, hd: 7.2 },
      { kind: 'tiger', orbit: [rx - 5.5, rz, 3.2, 0.45] },
      { kind: 'fox', orbit: [rx + 5.5, rz, 2.2, -0.9], o: { c: '#f4f0ea', belly: '#ffffff', dark: '#6a5a6a', tails: 3, glowEye: '#ff9ad8' }, mote: '#ffb8e0' },
      { kind: 'boar', orbit: [rx, rz - 6.5, 2.2, 0.5] },
      { kind: 'fox', n: 2, orbit: [0, -29.8, 1.6, 0.6], o: { c: '#f6f2ec', belly: '#ffffff', dark: '#5a4a4a', s: 0.85 } },
    ], rng);
    // 仙鹤绕灵禽阁盘旋，一只鹰绕西北箭楼
    {
      const [cx, cz] = YS.crag, cy = S.hy(cx, cz), [hx, hz] = P(225, R - 3.4);
      flyer(S, [
        ...Array.from({ length: 6 }, (_, i) => ({ orbit: [cx, cz, 6 + (i % 3) * 2.5, (i % 2 ? -1 : 1) * (0.32 - (i % 3) * 0.05)], y: cy + 3.5 + (i % 3) * 1.6, off: i * 1.1, s: 0.9 + (i % 2) * 0.15 })),
        { orbit: [hx, hz, 5, 0.5], y: 9, off: 0.4, c: '#7a5a3a', k: '#3a2a1a', crown: false, beak: '#e8c040', s: 0.7 },
      ]);
    }

    // ---- 北台：御兽殿、掌门居、长老院；殿前石虎、石碑、火盆 ----
    S.bld(hallY('御兽殿', 20, 11, { tiers: 2, h: 3.6, base: 0.8, rise: 3.2, stairW: 4 }), 0, -39);
    S.bld(hallY('掌门居', 9, 5.6), -17, -41, Math.PI / 2);
    S.bld(hallW('长老院', 7, 5), 17, -42, -Math.PI / 2);
    for (const s of [-1, 1]) {
      const G = new THREE.Group(); G.add(mesh(boxUV(new THREE.BoxGeometry(2.4, 1.0, 3.2), 2.4, 1.0, 3.2, 0.45).translate(0, 0.5, 0), M(YC.stone, { tx: TX.stone })));
      const st = beastStatue('tiger', '#b8b0a0'); st.scale.setScalar(1.05); st.position.y = 1.0; G.add(st);
      S.put(G, s * 4.6, -29.4, 0, 0, { bake: true }); S.circ(s * 4.6, -29.4, 1.6);
    }
    S.ref('stele', 0, -14.6, -30.4, 1.2, 0.3, 0.8);
    for (const s of [-1, 1]) { S.put(brazier('#ffa040'), s * 8.6, -27.2, 0, 0, { bake: true }); S.circ(s * 8.6, -27.2, 0.5); S.emit(s * 8.6, 1.4, -27.2, '#ffa040', 0.7, 'lantern'); }
    // 孤崖上的灵禽阁、竹丘上的竹楼
    { const [cx, cz] = YS.crag; const o = tower({ w: 4, d: 4, levels: 3, h: 2.6, wall: YC.wall, col: YC.col, roof: YC.roof, ridge: YC.ridge, sign: '灵禽阁', baseC: YC.stone, signC: YC.signC }); S.bld(o, cx, cz - 0.5); S.emit(cx, o.userData.top - 1, cz - 0.5, '#ffd080', 0.6, 'lantern'); }
    S.bld(stiltHouse(9, 4.6, '竹楼', { signC: YC.signC }), YS.hill[0], YS.hill[1] - 0.5);

    // ---- 0 级外院：鹿舍、狼舍、执事堂、膳堂、饲料房、兽医堂、弟子居、兽经阁 ----
    S.bld(stiltHouse(6, 4.4, '鹿舍', { signC: YC.signC }), -50, 18, Math.PI / 2);
    S.bld(stiltHouse(6, 4.4, '狼舍', { signC: YC.signC }), 50, 18, -Math.PI / 2);
    S.bld(hallY('执事堂', 11, 6.4), -17, 47, Math.PI / 2);
    S.bld(hallW('膳堂', 12, 6.4), 17, 47, -Math.PI / 2);
    S.bld(hallW('饲料房', 8, 5), -34, 42, Math.PI / 2);
    S.bld(hallY('兽医堂', 9, 5.6), 35, 40, -Math.PI / 2);
    S.bld(hallW('外门弟子居', 12, 5.6), -53, 0, Math.PI / 2);
    S.bld(hallW('内门弟子居', 12, 5.6), 53, 0, -Math.PI / 2);
    { const o = tower({ w: 6.4, d: 6, levels: 3, h: 2.8, wall: YC.wall, col: YC.col, roof: YC.roof, ridge: YC.ridge, sign: '兽经阁', baseC: YC.stone, signC: YC.signC }); S.bld(o, 48, -16); }
    // 小件
    S.put(well(YC.roof), 8.6, 54, 0, 0, { bake: true }); S.circ(8.6, 54, 1.1);
    S.put(woodpile(), -26, 51, 0.3, 0, { bake: true }); S.circ(-26, 51, 1.0);
    S.put(tableSet(), 8.4, 46, Math.PI / 2, 0, { bake: true }); S.circ(8.4, 46, 1.2);
    S.ref('herbRack', 0, 21, 34, 1, 0, 0.6); S.ref('herbRack', 1, 25.4, 34, 1, 0, 0.6);
    batch(S, [[hay(), -28.6, 49.6, 0.4]]); S.circ(-28.6, 49.6, 1.0);
    for (const [x, z, k] of [[-29.6, 36.8, 'crate'], [-29.4, 47.4, 'barrel'], [-30.4, 48.4, 'barrel'], [30.4, 44.6, 'jar'], [30.2, 45.6, 'jar']]) S.ref(k, 0, x, z, 1, rng() * TAU, 0.45);
    // 演武场两侧木桩
    for (const z of [28.4, 37.6]) for (const x of [-30.6, -11.4]) S.ref('stump', 0, x, z, 1, rng() * TAU, 0.4);

    // ---- 人 ----
    const RR = YS_PEOPLE();
    for (const [x, z] of [...RR.disciples, ...RR.npcs.map((n) => n.p), ...RR.npcs.flatMap((n) => n.route || []), RR.elder]) S.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2);

    // ---- 竹海：寨里零星竹丛、浆果丛、苔石；寨外一圈竹林（间或几棵枫树）----
    const inPath = (x, z) => ysPathD(x, z) < 2 || (Math.abs(x) < 4 && z > -30 && z < 66);
    S.scatter(rng, 80, 8, R - 2.5, (x, z, r, i) => (i % 5 === 4 ? S.ref('mossRock', i, x, z, 0.9 + r() * 0.6, r() * TAU, 0.6) : i % 3 ? S.ref('bamboo', i, x, z, 0.9 + r() * 0.5, r() * TAU, 0.5) : S.ref('berryBush', i, x, z, 0.9 + r() * 0.4, r() * TAU)),
      (x, z) => !S.free(x, z, 2) || steep(S, x, z) || inPath(x, z) || Math.hypot(x - rx, z - rz) < 14);
    S.scatter(rng, 170, R + 2.5, 100, (x, z, r, i) => S.ref(i % 7 ? 'bamboo' : 'maple', i, x, z, 1.0 + r() * 0.6, r() * TAU, 0.6), (x, z) => Math.abs(x) < 9 && z > 0);
    return { ...RR, look: { robe: '#9a6e44', robe2: '#d8bc8a', belt: '#4a3020', hairStyle: [0, 1, 3, 2], hair: '#2a1a10', sword: false }, elderName: '陶朴' };
  },
};

function YS_PEOPLE() {
  const elderLook = (o) => ({ skin: '#e2b48e', hair: '#d8d4cc', hairStyle: 2, age: 'elder', beard: true, robe: '#8a6440', robe2: '#e8d4a8', belt: '#3a2414', sword: false, ...o });
  const outer = { robe: '#b8946a', robe2: '#ece0c4', belt: '#5a4028' };   // 外门：浅皮色
  const inner = { robe: '#9a6e44', robe2: '#d8bc8a', belt: '#4a3020' };   // 内门：兽皮褐
  const servant = { robe: '#7a6a58', robe2: '#c8bca8', belt: '#3a3024', sword: false };
  const [rx, rz] = YS.ring;
  const drill = [29, 32.5, 36].flatMap((z) => [-27, -23, -19, -15].map((x) => [x, z, 0, 'drill', { t: 0 }]));
  const watch = [30, 60, 120, 150, 210, 240, 300, 330].map((a) => { const [x, z] = P(a, 13.4); return [rx + x, rz + z, faceIn(x, z), 'idle']; });
  return {
    elder: [-10.6, 47, Math.PI / 2], yard: [-10.4, 32.5], lib: [48, -10], stele: [-8.6, 74], front: [0, 70], arena: [rx, rz],
    disciples: [
      ...drill, ...watch,
      [-39.6, 10, -Math.PI / 2, 'work'], [39.6, 10, Math.PI / 2, 'work'],               // 兽栏喂食
      [-29, 38.9, Math.PI / 2, 'work'], [-29, 45.2, Math.PI / 2, 'work'],               // 饲料房搬料
      [7, -30.5, Math.PI, 'cast'], [-7, -30.5, Math.PI, 'cast'], [10.5, -30.5, Math.PI, 'cast'], [-10.5, -30.5, Math.PI, 'cast'],
      [-35.6, -18, 0.3, 'sit'], [-46.4, -18.2, -0.3, 'sit'], [32.6, -28.6, 0.6, 'sit'],
      [-38, -46, 0.6, 'work'], [-44, -40, 1.2, 'work'],                                 // 竹林砍竹
      [-46.5, -2, Math.PI / 2, 'idle'], [-46.5, 2, Math.PI / 2, 'idle'], [46.5, 2.4, -Math.PI / 2, 'idle'],
      [rx - 2.6, rz - 8.6, 0.3, 'cast'],                                                 // 野猪驯兽师
      [29.4, 37.4, -Math.PI / 2, 'work'],
    ],
    npcs: [
      { name: '拓跋烈', title: '宗主', p: [0, -29.8, 0], look: elderLook({ hair: '#5a4a3a', hairStyle: 0, robe: '#6a4426', robe2: '#e8c070', beard: true }), lines: ['御兽宗不养宠物，养的是同生共死的伙伴。', '你身上有兽的气味……是灵狐吧？它喜欢你。', '灵兽认主，先认心，后认血。'] },
      { name: '熊山', title: '大长老', p: [3, -27.6, -0.3], look: elderLook({ hair: '#8a8278', robe2: '#c8a070' }), lines: ['宗主讲话简短，我讲话也简短：别摸白虎。', '御兽殿后面的《灵兽谱》，记着三百年来每一只灵兽的名字。', '熊？我不养熊。是熊养我。'] },
      { name: '柳青禾', title: '驯兽长老', p: [rx - 3.2, rz + 9, Math.PI], look: elderLook({ hair: '#c8c4b8', hairStyle: 1, beard: false, robe: '#5a6a3a', robe2: '#d8d0a0' }), act: 'cast', lines: ['驯兽台上不许用鞭子。用鞭子驯出来的，只会咬你。', '先蹲下来，让它闻你的手。', '那头野猪叫「铁头」，别和它比谁的头硬。'] },
      { name: '赫连骁', title: '大师兄', p: [rx - 5.5, rz, Math.PI / 2], look: { ...inner, hairStyle: 2, hair: '#1a1210' }, act: 'cast', lines: ['白虎「啸月」跟了我八年，它比我先筑基。', '看好了——坐！……它今天心情不好。', '周日大比，啸月和我一起上台。'] },
      { name: '白灵', title: '二师姐', p: [rx + 5.5, rz, -Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#2a1a18', robe: '#e8dcc8', robe2: '#9a6e44' }, act: 'cast', lines: ['三尾狐「小雪」，一千年才长一条尾巴。', '它只喝桃花露，你身上有吗？', '别盯着它的尾巴数，它会害羞。'] },
      { name: '鹤千秋', title: '灵禽阁主', p: [27.4, -28.6, -0.4], look: elderLook({ hair: '#f4f2ee', robe: '#f2efe8', robe2: '#3a3a3a', belt: '#c83a2a' }), act: 'sit', lines: ['仙鹤一年来回一趟天劫峰，替宗门送信。', '灵禽阁顶上，看得见整片竹海。', '鹤不爱叫。叫的时候，就是有客人来了。'] },
      { name: '华小满', title: '兽医', p: [29.4, 40, -Math.PI / 2], look: { ...outer, hairStyle: 1, hair: '#2a1a14', robe: '#e8e0cc', robe2: '#6a8a5a' }, act: 'work', lines: ['狼崽子又把爪子扎了，第三回了。', '灵兽的病，七成是吃出来的。别乱喂！', '兽医堂的药人也能吃……就是苦。'] },
      { name: '牛大力', title: '饲养管事', p: [-28.8, 42, Math.PI / 2], look: { ...servant, hairStyle: 0, hair: '#1a1410', robe: '#6a5a44' }, lines: ['每天五百斤灵草、三百斤肉，饲料房从天亮忙到天黑。', '白虎只吃鲜肉，三尾狐只喝露水，最省心的是野猪——什么都吃。', '你来得正好，搭把手扛袋豆子？'] },
      { name: '鹿鸣', title: '牧鹿弟子', p: [-33, 20, Math.PI / 2], look: { ...inner, hairStyle: 3, hair: '#2a1a10' }, lines: ['这三只灵鹿，角上的光是月光养出来的。', '鹿胆小，你走慢一点。', '灵鹿蜕下的角能入药，丹鼎派年年来求。'] },
      { name: '阿雅', title: '狼语者', p: [33, 20, -Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#141010', robe: '#5a5a62', robe2: '#c8b8a0' }, lines: ['（她对着狼群低吼了两声，狼都趴下了）', '狼不是坏东西。坏的是把狼逼下山的人。', '它们说你身上有妖兽的血味。最近杀了不少吧？'] },
      { name: '胡九', title: '小师弟', p: [-26, 6], look: { ...inner, hairStyle: 3, age: 'child' }, route: [[-26, 6], [26, 6]], speed: 1.6, pause: 2, lines: ['我长大要骑白虎！师兄说我得先骑得稳野猪。', '你看见我的灵狐没？它又跑了！', '嘘——鹿舍的小鹿刚睡着。'] },
      { name: '雷豹', title: '守山弟子', p: [-3.8, YS.R + 3.6, 0], look: { ...inner, hairStyle: 0 }, lines: ['御兽宗山门。进门请把手里的肉藏好。', '这对獠牙，是开山祖师驯服的那头巨象留下的。'] },
      { name: '鹰扬', title: '守山弟子', p: [3.8, YS.R + 3.6, 0], look: { ...inner, hairStyle: 0 }, lines: ['天上那只鹰是我的，它比我先看见你。', '我叫鹰扬，他叫雷豹。名字都是照着灵兽取的。'] },
      { name: '老墨', title: '守阁人', p: [51.2, -10.4, -0.4], look: elderLook({ hair: '#e8e4dc', robe: '#9a8a70' }), act: 'sit', lines: ['兽经阁的书上都有爪印，是灵兽自己翻的。', '《百兽谱》第七卷缺了一页——被一只山羊吃了。'] },
      { name: '严铁', title: '执法长老', p: [12, -43, -Math.PI / 2], look: elderLook({ hair: '#4a4440', robe: '#3a3028', robe2: '#c8a070', belt: '#1a1410' }), lines: ['虐兽者，逐出山门。', '灵兽伤人，主人同罪。'] },
      { name: '桂嫂', title: '膳堂厨娘', p: [11.8, 47, -Math.PI / 2], look: { ...servant, robe: '#8a6a50', hair: '#3a2a20', hairStyle: 1 }, lines: ['人吃的饭在膳堂，兽吃的饭在饲料房，别走错门。', '今天炖竹笋，管饱。'] },
      { name: '苗婆婆', title: '竹楼老人', p: [-43.4, -18.4, 0.2], look: elderLook({ hair: '#e8e4e0', hairStyle: 1, beard: false, robe: '#6a7a4a', robe2: '#e0d8b8' }), act: 'sit', lines: ['我在竹楼住了六十年，竹子都认得我。', '年轻时我养过一只灵猫，活了一百二十岁。', '竹林里有竹鼠，别踩了它们的窝。'] },
      { name: '山猫', title: '杂役', p: [-20, 58], look: { ...servant, hairStyle: 3, hair: '#3a2a1a' }, route: [[-20, 58], [-40, 48]], speed: 0.9, pause: 2.5, act: 'work', lines: ['扫兽毛扫到手软，一天三筐。', '春天换毛的时候，整座寨子都是白的。'] },
      { name: '豆豆', title: '小师妹', p: [-33, 12], look: { ...inner, hairStyle: 1, age: 'child' }, route: [[-33, 12], [-33, 22]], speed: 1.2, pause: 3, lines: ['小鹿刚才舔我的脸了！', '我给小狐狸起名叫「包子」，师姐说不能用吃的起名。'] },
      { name: '竹生', title: '外门弟子', p: [-34, -50, 0.4], look: { ...outer, hairStyle: 2 }, act: 'work', lines: ['竹子砍了做栅栏，栅栏围住灵兽，灵兽守着竹林。', '这片竹子长得快，一夜一尺。'] },
      { name: '隼', title: '训鹰人', p: [-39, -39, faceTo(-39, -39, ...P(225, YS.R - 3.4))], look: { ...inner, hairStyle: 0, hair: '#1a1410', robe: '#5a4a3a' }, lines: ['鹰要熬。熬三天三夜，它才肯落在你手上。', '看那边箭楼上——那只就是「疾风」。'] },
      { name: '石敢当', title: '内门弟子', p: [46.5, -2.6, -Math.PI / 2], look: { ...inner, hairStyle: 0, hair: '#1a1410' }, lines: ['我的灵兽是只穿山甲，现在不知道钻哪去了。', '内门弟子居底下全是它挖的洞。'] },
      { name: '云儿', title: '外门弟子', p: [-1.6, 58], look: { ...outer, hairStyle: 1, hair: '#2a1a14' }, route: [[-1.6, 58], [-1.6, 36]], speed: 1.0, pause: 3, act: 'work', lines: ['我负责给驯兽台送水，一天跑二十趟。', '白虎喝水的时候最温顺，可以偷偷摸一下它的胡子。'] },
    ],
  };
}

export const SITES3 = { 御兽宗: yushou };
