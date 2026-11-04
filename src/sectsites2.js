// 门派 3–7 的山门布局（规划见 SECTS.md）：阵法阁 · 剑宗 · 御兽宗 · 百花谷 · 丹鼎派。
// 和 sectsites.js 一样：本地坐标（正门朝 +z = 镜头这一侧），build(S) 返回执事 / 弟子 / 门人 / 练武场 / 藏经阁 / 石碑。
// 这五派都有多级台地（src/terrace.js，最多 7 级，剑宗九重剑阶 10 级）：terrain 写在门派定义上，Site.put 等自动贴地。
// 规矩（ENVIRONMENT.md 规则 9）：宗门边缘、院墙在 0 级；台地往北（远离镜头）升高；试炼场、石碑、Boss、矿点留在 0 级。
import * as THREE from 'three';
import { glow, mesh, at, toon, canvasTex, boxUV } from './util.js';
import { M, TX, shade, plaque, podium, hall, tower, pagoda, paifang, wallSeg, banner, brazier, cauldron, lion } from './sectkit.js';
import { TAU, rng32, dummy, well, woodpile, anvil, tableSet, bell, fence, herbBed, crystal, crystalCluster, bigSword, swordRack, medStone, bridge, terraceStairs, cylUVs } from './sectprops.js';
import { makeTerrain, plat, hill, shape, oct, polyDist } from './terrace.js';

const D2R = Math.PI / 180;
const P = (adeg, r) => [Math.sin(adeg * D2R) * r, Math.cos(adeg * D2R) * r];          // 本地极坐标：0° = +z（正南），90° = +x（东）
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const faceIn = (x, z) => Math.atan2(-x, -z);                                              // 面朝宗门中心

// ---------- 共用小工具 ----------
// 斜放的建筑（朝向中心）：AABB 碰撞不行，沿占地四边排一圈小圆
function obbCol(S, lx, lz, w, d, ry, r = 0.9) {
  const c = Math.cos(ry), s = Math.sin(ry), W = (u, v) => [lx + u * c + v * s, lz - u * s + v * c];
  const edge = (u0, v0, u1, v1) => { const n = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / (r * 1.3))); for (let i = 0; i <= n; i++) { const [x, z] = W(u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n); S.circ(x, z, r); } };
  const hu = w / 2 - r, hv = d / 2 - r;
  edge(-hu, -hv, hu, -hv); edge(-hu, hv, hu, hv); edge(-hu, -hv, -hu, hv); edge(hu, -hv, hu, hv);
  const cs = [W(-w / 2, -d / 2), W(w / 2, -d / 2), W(-w / 2, d / 2), W(w / 2, d / 2)];
  S.mark(Math.min(...cs.map((q) => q[0])), Math.min(...cs.map((q) => q[1])), Math.max(...cs.map((q) => q[0])), Math.max(...cs.map((q) => q[1])));
}
function bldR(S, obj, lx, lz, ry) {
  if (Math.abs(Math.sin(ry * 2)) < 0.01) return S.bld(obj, lx, lz, ry);
  const f = obj.userData.foot; obj = S.put(obj, lx, lz, ry, 0, { bake: true }); if (f) obbCol(S, lx, lz, f[0], f[1], ry); return obj;
}
// 开敞的亭 / 廊：四角柱子碰撞
function openAt(S, o, lx, lz, ry = 0) {
  S.put(o, lx, lz, ry, 0, { bake: true }); const [fw, fd] = o.userData.foot, hw = fw / 2 - 1.05, hd = fd / 2 - 1.05, c = Math.cos(ry), s = Math.sin(ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const u = sx * hw, v = sz * hd; S.circ(lx + u * c + v * s, lz - u * s + v * c, 0.35); }
  S.mark(lx - Math.max(hw, hd), lz - Math.max(hw, hd), lx + Math.max(hw, hd), lz + Math.max(hw, hd));
}
// 一段院墙（任意方向）：轴向的用盒子碰撞，斜的用一串小圆
function wallLine(S, x0, z0, x1, z1, o = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
  S.put(wallSeg(len + 0.3, o), (x0 + x1) / 2, (z0 + z1) / 2, ry, 0, { bake: true });
  if (Math.abs(x1 - x0) < 0.01 || Math.abs(z1 - z0) < 0.01) { S.box(Math.min(x0, x1) - 0.35, Math.min(z0, z1) - 0.35, Math.max(x0, x1) + 0.35, Math.max(z0, z1) + 0.35); return; }
  const n = Math.ceil(len / 0.8); for (let i = 0; i <= n; i++) S.circ(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0.5);
  markLine(S, x0, z0, x1, z1, 1);
}
function markLine(S, x0, z0, x1, z1, w) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5)); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; S.mark(x - w, z - w, x + w, z + w); } }
// 一条铺石带（任意方向，贴地细分）
function paveStrip(S, x0, z0, x1, z1, w, color) {
  const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(w, len, 1, Math.max(1, Math.ceil(len / 0.5))).rotateX(-Math.PI / 2).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  markLine(S, x0, z0, x1, z1, w / 2); return S.pave(g, color);
}
// 八角铺地（边朝 0°/45°…，和 oct() 一致）；apothem = 边心距
function paveOct(S, lx, lz, apothem, color) { const g = new THREE.CircleGeometry(apothem / Math.cos(Math.PI / 8), 8).rotateX(-Math.PI / 2).rotateY(Math.PI / 8).translate(lx, 0, lz); S.mark(lx - apothem, lz - apothem, lx + apothem, lz + apothem); return S.pave(g, color); }
// 一批静态小件（剑林、栅栏、草垛……）：各自贴地，合成一块（abs 放在门派原点）
function batch(S, items, { ink = true } = {}) {
  const G = new THREE.Group();
  for (const [o, lx, lz, ry = 0, y = 0] of items) { o.position.set(lx, y + S.hy(lx, lz), lz); o.rotation.y = ry; G.add(o); }
  return S.put(G, 0, 0, 0, 0, { abs: true, bake: true, ink });
}
// 陡坎上不长树
const steep = (S, x, z) => Math.abs(S.hy(x + 1.2, z) - S.hy(x - 1.2, z)) + Math.abs(S.hy(x, z + 1.2) - S.hy(x, z - 1.2)) > 0.5;

// 发光阵纹贴图：0 外圈八卦 / 1 中圈符文 + 八角星 / 2 内圈太极
const TRI_BITS = { 离: 5, 巽: 6, 震: 1, 艮: 4, 坎: 2, 乾: 7, 兑: 3, 坤: 0 };   // 初爻 = bit0（最里面一道）
function runeTex(kind) {
  return canvasTex(512, 512, (c, w) => {
    const R = w / 2; c.translate(R, R); c.strokeStyle = c.fillStyle = '#ffffff'; c.lineCap = 'round';
    const ring = (r, lw) => { c.lineWidth = lw; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); };
    if (kind === 0) {
      ring(R - 6, 7); ring(R - 24, 3); ring(R * 0.6, 4);
      for (let i = 0; i < 72; i++) { const a = i / 72 * TAU; c.lineWidth = i % 9 ? 2 : 5; c.beginPath(); c.moveTo(Math.sin(a) * (R - 24), -Math.cos(a) * (R - 24)); c.lineTo(Math.sin(a) * (R - 8), -Math.cos(a) * (R - 8)); c.stroke(); }
      // 后天八卦：离南 坎北 震东 兑西 …（画布上方 = 北，画布角度 θ = 180° - 本地角）
      for (const [name, a] of [['离', 0], ['巽', 45], ['震', 90], ['艮', 135], ['坎', 180], ['乾', 225], ['兑', 270], ['坤', 315]]) {
        c.save(); c.rotate((180 - a) * D2R);
        for (let j = 0; j < 3; j++) { const y = -(R * 0.6 + 24 + j * 18), on = (TRI_BITS[name] >> j) & 1; c.lineWidth = 10; c.beginPath(); if (on) { c.moveTo(-36, y); c.lineTo(36, y); } else { c.moveTo(-36, y); c.lineTo(-8, y); c.moveTo(8, y); c.lineTo(36, y); } c.stroke(); }
        c.restore();
      }
    } else if (kind === 1) {
      ring(R - 8, 5); ring(R - 52, 4);
      c.font = 'bold 32px "STKaiti","KaiTi","Noto Serif SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const G = '乾坤震巽坎离艮兑天地风雷水火山泽';
      for (let i = 0; i < 16; i++) { c.save(); c.rotate(i / 16 * TAU); c.fillText(G[i], 0, -(R - 30)); c.restore(); }
      for (const off of [0, Math.PI / 4]) { c.lineWidth = 4; c.beginPath(); for (let k = 0; k <= 4; k++) { const a = off + k * Math.PI / 2, x = Math.sin(a) * (R - 56), y = -Math.cos(a) * (R - 56); if (k) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
      ring((R - 56) * 0.7, 3);
    } else {
      const r = R - 12; ring(r, 8);
      c.beginPath(); c.arc(0, 0, r - 14, -Math.PI / 2, Math.PI / 2); c.arc(0, (r - 14) / 2, (r - 14) / 2, Math.PI / 2, -Math.PI / 2, true); c.arc(0, -(r - 14) / 2, (r - 14) / 2, Math.PI / 2, -Math.PI / 2); c.closePath(); c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
      for (const s of [-1, 1]) { c.beginPath(); c.arc(0, s * (r - 14) / 2, 16, 0, TAU); c.fill(); }
    }
  }, { pixel: false, repeat: false });
}
// 一张贴地的发光阵盘
function runeDisc(r, kind, color, k = 1.6, o = 0.9) {
  const m = new THREE.MeshBasicMaterial({ map: runeTex(kind), transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  m.color.set(color).multiplyScalar(k); m.userData.base = m.color.clone();
  return mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), m, { cast: false });
}

// ===================== 3 阵法阁：整座宗门就是一座八卦阵（大宗，半径约 96 米）=====================
// 八角院墙（边心距 60）；院内三圈台地：
//   0 级「阵心」八角下沉广场（大法阵）→ 1 级一圈石阶看台 → 2 级「八门台」（八座卦殿朝向阵心）→ 0 级外院（八座外院建筑、阵田、演阵场）
//   北面「阵眼台」5 级八角高台，上立三层阵法阁；东北「观星台」4 级圆台。八条石阶辐路（沿 0°、45°…）从外院穿过八门台下到阵心。
const ZC = { wall: '#eee8f4', col: '#5a4a82', roof: '#4a3e6e', ridge: '#2a2244', col2: '#6a5040', roof2: '#5a5280', pave: '#d2ccdc', stone: '#a8a2b4', glow: '#b48aff', signC: { bg: '#2a2040', rim: '#c8a8ff', fg: '#f2eaff' } };
const ZF = { A: 60, ring0: 19, ring1: 33, alt: [0, -46], altTop: 8.6, star: P(135, 48), yard: [0, 51] };
const ZF_SPOKES = (() => {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = k * 45;
    if (k === 4) out.push({ pts: [P(a, 11), [0, -38.4]], w: 2.2 });                 // 北：阵心 → 八门台 → 阵眼台
    else if (k === 3) out.push({ pts: [P(a, 11), P(a, 44.6)], w: 1.6 });             // 东北：下到鞍部再上观星台顶
    else out.push({ pts: [P(a, 11), P(a, 42)], w: k === 0 ? 2.4 : 1.6 });
  }
  return out;
})();
const ZF_T = makeTerrain({
  LH: 2.2, rock: '#8a8698',
  shapes: [
    shape([-46, -46, 46, 46], (x, z) => { const o = oct(x, z); return 2 - Math.max(0, o - ZF.ring1) / 4 - Math.max(0, ZF.ring0 - o) / 4.5; }),
    shape([-18, -64, 18, -28], (x, z) => 5 - Math.max(0, oct(x - ZF.alt[0], z - ZF.alt[1]) - ZF.altTop) / 1.6),
    plat({ x: ZF.star[0], z: ZF.star[1], w: 8, d: 8, round: 1.2, rot: Math.PI / 4, lv: 4, ring: 1.6, wob: 0.8, seed: 11 }),
  ],
  paths: ZF_SPOKES,
});
const zfSpokeD = (lx, lz) => { let d = 1e9; for (const p of ZF_SPOKES) d = Math.min(d, polyDist(lx, lz, p.pts)); return d; };
const zhenfa = {
  r: 96, terrain: ZF_T,
  ground: (lx, lz, n) => {
    if (Math.abs(lx) > 70 || Math.abs(lz) > 70) return Math.abs(lx) < 2.8 + n && lz > 60 && lz < 94 ? 1 : 0;
    if (oct(lx, lz) < 14 + n * 0.4 || oct(lx - ZF.yard[0], lz - ZF.yard[1]) < 8.6 + n * 0.4 || oct(lx - ZF.alt[0], lz - ZF.alt[1]) < ZF.altTop + 0.3 + n * 0.3 || Math.hypot(lx - ZF.star[0], lz - ZF.star[1]) < 4.2 + n * 0.3) return 1;
    if (oct(lx, lz) < 46.5 && zfSpokeD(lx, lz) < 2.6 + n * 0.5) return 1;
    if (Math.abs(lx) < 2.8 + n && lz > 40) return 1;
    return 0;
  },
  build(S) {
    const rng = rng32(31), g = S.g, A = ZF.A, RV = A / Math.cos(Math.PI / 8);
    const hallZ = (sign, w, d, extra = {}) => hall({ w, d, h: 2.9, wall: ZC.wall, col: ZC.col, roof: ZC.roof, ridge: ZC.ridge, sign, base: 0.5, baseC: ZC.stone, signC: ZC.signC, ...extra });
    const hallO = (sign, w, d, extra = {}) => hall({ w, d, h: 2.6, wall: '#ece6ee', col: ZC.col2, roof: ZC.roof2, ridge: ZC.ridge, sign, base: 0.35, baseC: ZC.stone, rise: d * 0.34, signC: ZC.signC, ...extra });

    // ---- 铺地：阵心八角广场、演阵场、八条辐路在台上的平段、阵眼台顶、山门甬道 ----
    paveOct(S, 0, 0, 13.6, ZC.pave);
    paveOct(S, ZF.yard[0], ZF.yard[1], 8.4, ZC.pave);
    paveStrip(S, 0, 59.4, 0, 92, 4.4, ZC.pave);
    paveOct(S, ZF.alt[0], ZF.alt[1], ZF.altTop, ZC.pave);
    for (let k = 0; k < 8; k++) if (k !== 4) { const [x0, z0] = P(k * 45, 19.6), [x1, z1] = P(k * 45, 32.6); paveStrip(S, x0, z0, x1, z1, k === 0 ? 4.8 : 3.2, ZC.pave); }
    paveStrip(S, 0, -19.6, 0, -24.4, 4.4, ZC.pave);
    for (let k = 1; k < 8; k++) if (k !== 4 && k !== 3) { const [x0, z0] = P(k * 45, 41.2), [x1, z1] = P(k * 45, 46); paveStrip(S, x0, z0, x1, z1, 3.2, ZC.pave); }
    terraceStairs(S, ZF_T, { color: '#bab2c6', rail: '#9a92a8' });
    for (const p of ZF_SPOKES) markLine(S, ...p.pts[0], ...p.pts[p.pts.length - 1], p.w + 0.8);

    // ---- 八角院墙 + 八座八角角楼 + 山门 ----
    const V = Array.from({ length: 8 }, (_, k) => P(22.5 + 45 * k, RV));
    for (let k = 0; k < 8; k++) {
      const [x0, z0] = V[(k + 7) % 8], [x1, z1] = V[k];
      if (k === 0) { wallLine(S, x0, z0, -5.4, A, { h: 2.6, wall: ZC.wall, cap: ZC.roof }); wallLine(S, 5.4, A, x1, z1, { h: 2.6, wall: ZC.wall, cap: ZC.roof }); }
      else wallLine(S, x0, z0, x1, z1, { h: 2.6, wall: ZC.wall, cap: ZC.roof });
    }
    for (const [x, z] of V) { S.put(pagoda({ levels: 2, r: 1.7, seg: 8, h0: 3.0, h: 1.6, body: ZC.wall, bodyTx: TX.wall, roof: ZC.roof, trim: ZC.ridge, baseC: ZC.stone }), x, z, 0, 0, { bake: true }); S.circ(x, z, 2.5); S.mark(x - 3, z - 3, x + 3, z + 3); }
    openAt(S, hallZ('阵法阁', 9, 4.4, { open: true, h: 3.4, base: 0.4, tiers: 2, rise: 1.8 }), 0, A);
    for (const s of [-1, 1]) { S.put(lion(s, '#b8b2c0'), s * 5.4, 64.6, 0, 0, { bake: true }); S.circ(s * 5.4, 64.6, 0.8); }
    for (const z of [70, 77, 84]) for (const s of [-1, 1]) S.ref('stoneLan', z + s, s * 3.4, z, 1.1, 0, 0.35);

    // ---- 阵心：大法阵（三层阵盘：外圈八卦不动，中圈顺转，内圈太极逆转）+ 八根阵柱 + 浮空石 ----
    const disc0 = runeDisc(7.2, 0, ZC.glow, 1.5), disc1 = runeDisc(5.0, 1, '#d0b0ff', 1.7), disc2 = runeDisc(2.4, 2, '#f0e0ff', 1.9);
    S.put(disc0, 0, 0, 0, 0.03, { ink: false }); S.put(disc1, 0, 0, 0, 0.045, { ink: false }); S.put(disc2, 0, 0, 0, 0.06, { ink: false });
    const coreE = S.emit(0, 1.0, 0, '#b48aff', 1.2, 'lantern');
    const pillars = [];
    for (let k = 0; k < 8; k++) {
      const [x, z] = P(22.5 + 45 * k, 11.2), G = new THREE.Group();
      G.add(mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 8).translate(0, 0.25, 0), M(ZC.stone, { tx: TX.stone }), { recv: true }));
      G.add(mesh(new THREE.CylinderGeometry(0.45, 0.55, 4.2, 8).translate(0, 2.35, 0), M('#c4bcd0', { tx: TX.stone })));
      const gm = glow(ZC.glow, 1.4, true);
      for (const y of [1.4, 2.4, 3.4]) G.add(at(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.14, 8), gm, { cast: false }), 0, y, 0));
      const cr = crystal(1.3, '#d8c0ff'); cr.position.y = 4.55; cr.material = gm; G.add(cr);
      S.put(G, x, z, (22.5 + 45 * k) * D2R, 0, { ink: true }); S.circ(x, z, 0.85); pillars.push(gm);
    }
    const rocks = [];
    for (let i = 0; i < 6; i++) { const o = S.ref('floatRock', i, 0, 0, 0.7 + rng() * 0.4, rng() * TAU); if (o) rocks.push({ o, a: i / 6 * TAU, r: 5.5 + (i % 2) * 2.5, y: 4.5 + rng() * 2.5, ph: rng() * TAU }); }
    S.anims.push((dt, t) => {
      disc1.rotation.y = t * 0.12; disc2.rotation.y = -t * 0.3;
      const pk = 0.75 + 0.25 * Math.sin(t * 1.4); disc0.material.color.copy(disc0.material.userData.base).multiplyScalar(pk); disc2.material.color.copy(disc2.material.userData.base).multiplyScalar(0.8 + 0.3 * Math.sin(t * 2.1));
      for (let k = 0; k < 8; k++) { const u = Math.max(0, Math.sin(t * 1.6 - k * Math.PI / 4)); pillars[k].color.copy(pillars[k].userData.base).multiplyScalar(0.55 + 0.9 * u ** 4); }
      for (const r of rocks) { const a = r.a + t * 0.08; r.o.position.set(S.x + Math.sin(a) * r.r, r.y + Math.sin(t * 0.7 + r.ph) * 0.4, S.z + Math.cos(a) * r.r); r.o.rotation.y = t * 0.2 + r.ph; }
      coreE.power = 1.0 + 0.4 * Math.sin(t * 1.4);
      if (Math.random() < dt * 5) { const a = Math.random() * TAU, rr = Math.random() * 6.5; g.fx.mote(S.x + Math.sin(a) * rr, 0.3, S.z + Math.cos(a) * rr, '#c8a8ff', { life: 2.6, size: 0.35, vy: 0.9, bright: 1.2 }); }
    });
    S.anims[S.anims.length - 1](0, 0);
    S.mark(-14, -14, 14, 14);

    // ---- 八门台：八座卦殿（22.5° + 45°k，朝向阵心）----
    const TRI = [['炼符堂', 11, 6.4], ['傀儡库', 10, 6], ['丹房', 9.4, 6], ['推演殿', 12, 6.8], ['藏经阁', 0, 0], ['阵器坊', 10, 6], ['讲阵堂', 12, 6.6], ['静室', 8, 5.4]];
    const TR = 28.6, tFront = [];
    TRI.forEach(([name, w, d], k) => {
      const a = 22.5 + 45 * k, [x, z] = P(a, TR), ry = (a + 180) * D2R;
      let o;
      if (name === '藏经阁') o = tower({ w: 7, d: 6, levels: 3, h: 2.8, wall: ZC.wall, col: ZC.col, roof: ZC.roof, ridge: ZC.ridge, sign: '藏经阁', base: 0.6, baseC: ZC.stone, k: 0.5, signC: ZC.signC });
      else if (name === '推演殿') o = hallZ(name, w, d, { tiers: 2, h: 3.2, base: 0.7 });
      else o = hallZ(name, w, d);
      bldR(S, o, x, z, ry);
      const fd = o.userData.foot[1] / 2 + 1.4; tFront.push(P(a, TR - fd));
    });
    // 卦殿门口的小件：炼符堂幡、丹房丹炉、傀儡库木傀儡、阵器坊铁砧
    { const a = 22.5, [x, z] = P(a, TR - 6.2); for (const s of [-1, 1]) { const [bx, bz] = [x + Math.cos(a * D2R) * s * 3.4, z - Math.sin(a * D2R) * s * 3.4]; S.put(banner('#5a3a9a', '符'), bx, bz, (a + 180) * D2R); S.circ(bx, bz, 0.25); } }
    { const [x, z] = P(112.5, TR - 7.4); S.put(cauldron(0.7, '#5a5068', { brew: '#c8a8ff', fire: '#a87aff' }), x, z); S.circ(x, z, 0.9); }
    { const [x, z] = P(67.5, TR - 6.4); for (const s of [-1, 1]) { const px = x + Math.cos(67.5 * D2R) * s * 2.6, pz = z - Math.sin(67.5 * D2R) * s * 2.6; S.put(dummy(), px, pz, (67.5 + 180) * D2R, 0, { bake: true }); S.circ(px, pz, 0.4); } }
    { const [x, z] = P(247.5, TR - 6.4); S.put(anvil(), x, z, (247.5 + 180) * D2R, 0, { bake: true }); S.circ(x, z, 0.6); }

    // ---- 阵眼台：三层阵法阁 + 顶上悬一面阵盘 ----
    const [ax, az] = ZF.alt;
    const tw = tower({ w: 8.4, d: 8.4, levels: 3, h: 3.2, wall: ZC.wall, col: ZC.col, roof: ZC.roof, ridge: ZC.ridge, sign: '阵法阁', base: 0.8, baseC: ZC.stone, k: 1, signC: ZC.signC });
    S.bld(tw, ax, az - 1.6);
    const topDisc = runeDisc(2.6, 1, '#e0c8ff', 2.0, 0.95); S.put(topDisc, ax, az - 1.6, 0, (tw.userData.top || 12) + 2.4, { ink: false });
    S.emit(ax, (tw.userData.top || 12) + 2.4, az - 1.6, '#b48aff', 1.0, 'lantern');
    S.anims.push((dt, t) => { topDisc.rotation.y = t * 0.5; topDisc.position.y = S.hy(ax, az) + (tw.userData.top || 12) + 2.4 + Math.sin(t * 0.9) * 0.25; });
    S.anims[S.anims.length - 1](0, 0);
    for (const s of [-1, 1]) S.ref('stoneLan', 40 + s, ax + s * 3.6, az + 6.4, 1, 0, 0.35);

    // ---- 观星台：圆台顶一座攒尖亭 + 浑天仪 ----
    const [spx, spz] = P(135, 48.6), spr = -45 * D2R;
    openAt(S, hall({ w: 4.4, d: 4.4, h: 2.6, open: true, col: ZC.col, roof: ZC.roof, ridge: ZC.ridge, base: 0.25, baseC: ZC.stone, pyramid: true, k: 1, rise: 2.0, sign: '观星台', signC: ZC.signC }), spx, spz, spr);
    const arm = new THREE.Group(), bronze = M('#b88a4a', { metal: true });
    for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2]]) { const t = mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 28), bronze); t.rotation.set(rx, 0, rz); arm.add(t); }
    arm.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), glow('#ffe0a0', 1.6)));
    const armS = new THREE.Group(); armS.add(mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.2, 6).translate(0, 0.6, 0), bronze)); arm.position.y = 1.95; armS.add(arm);
    S.put(armS, spx, spz, 0, 0.25);
    S.anims.push((dt, t) => { arm.rotation.y = t * 0.4; arm.rotation.x = Math.sin(t * 0.3) * 0.3; });

    // ---- 外院：八座外院建筑（22.5° + 45°k，朝向阵心）----
    const OUT = [['执事堂', 11, 6, 52], ['膳堂', 12, 6.4, 52], ['傀儡工坊', 11, 6.4, 52], ['执法堂', 10, 6, 58], ['宗主居', 11, 6.4, 58], ['长老院', 11, 6.2, 52], ['阵田', 0, 0, 51], ['外门弟子居', 13, 5.6, 52]];
    const oFront = [];
    OUT.forEach(([name, w, d, r], k) => {
      const a = 22.5 + 45 * k, [x, z] = P(a, r), ry = (a + 180) * D2R;
      if (name === '阵田') { oFront.push(P(a, r - 6)); return; }
      const o = name === '宗主居' ? hallZ(name, w, d, { tiers: 2, base: 0.6 }) : name === '执事堂' || name === '执法堂' ? hallZ(name, w, d) : hallO(name, w, d);
      bldR(S, o, x, z, ry); oFront.push(P(a, r - o.userData.foot[1] / 2 - 1.4));
    });
    // 阵田：两块方格灵田，田埂刻发光阵纹（聚灵阵 / 灵雨阵）
    const fieldPts = [];
    {
      const a = 292.5, [cx, cz] = P(a, 51), ry = (a + 180) * D2R, c = Math.cos(ry), s = Math.sin(ry);
      for (const u of [-4.4, 4.4]) {
        const x = cx + u * c, z = cz - u * s; fieldPts.push([x, z]);
        const F = new THREE.Group(); F.add(herbBed(7, 7, rng));
        const gm = glow('#b48aff', 1.3);
        for (const [w2, d2, px, pz] of [[7.4, 0.12, 0, 3.7], [7.4, 0.12, 0, -3.7], [0.12, 7.4, 3.7, 0], [0.12, 7.4, -3.7, 0], [7.4, 0.08, 0, 0], [0.08, 7.4, 0, 0]]) F.add(at(mesh(new THREE.BoxGeometry(w2, 0.06, d2), gm, { cast: false }), px, 0.23, pz));
        const rd = runeDisc(1.2, 1, '#c8a8ff', 1.6, 0.9); rd.position.y = 0.26; F.add(rd);
        S.put(F, x, z, ry, 0, { ink: false }); S.mark(x - 4, z - 4, x + 4, z + 4);
      }
      S.put(fence(19, 8.6), cx, cz, ry, 0, { bake: true });
    }
    // 膳堂门口桌凳、水井、柴堆
    { const [x, z] = P(67.5, 44.5); S.put(tableSet(), x, z, (67.5 + 90) * D2R, 0, { bake: true }); S.circ(x, z, 1.2); }
    { const [x, z] = P(80, 46); S.put(well(ZC.roof2), x, z, 0, 0, { bake: true }); S.circ(x, z, 1.1); }
    { const [x, z] = P(56, 57); S.put(woodpile(), x, z, (56 + 180) * D2R, 0, { bake: true }); S.circ(x, z, 1.0); }
    // 傀儡工坊门口：一排没装好的木傀儡
    { for (let i = 0; i < 3; i++) { const [x, z] = P(102 + i * 6.5, 45.5); S.put(dummy(), x, z, faceIn(x, z), 0, { bake: true }); S.circ(x, z, 0.4); } }

    // ---- 演阵场（南面，0 级）：八角石坪，四角阵旗 ----
    for (let k = 0; k < 4; k++) { const [x, z] = P(45 + 90 * k, 8.0); S.put(banner('#4a3a7a', '阵'), x, ZF.yard[1] + z, 0); S.circ(x, ZF.yard[1] + z, 0.25); }
    for (const s of [-1, 1]) { S.put(brazier('#b48aff'), s * 10.6, ZF.yard[1], 0); S.circ(s * 10.6, ZF.yard[1], 0.5); }

    // ---- 人 ----
    const R = ZF_PEOPLE({ tFront, oFront, fieldPts });
    for (const [x, z] of [...R.disciples, ...R.npcs.map((n) => n.p), ...R.npcs.flatMap((n) => n.route || []), R.elder]) S.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2);

    // ---- 树：院内台上零星雪松，墙外雪松林 ----
    const inside = (x, z) => oct(x, z) < A + 2;
    S.scatter(rng, 50, 15, 62, (x, z, r, i) => S.ref(i % 4 ? 'snowPine' : 'pineTree', i, x, z, 0.9 + r() * 0.5, r() * TAU, 0.7), (x, z) => !inside(x, z) || oct(x, z) < 15 || !S.free(x, z, 2.2) || steep(S, x, z) || zfSpokeD(x, z) < 4 || oct(x - ZF.yard[0], z - ZF.yard[1]) < 11);
    S.scatter(rng, 120, 68, 94, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.1 + r() * 0.6, r() * TAU, 0.8), (x, z) => oct(x, z) < A + 5 || (Math.abs(x) < 10 && z > 0));
    S.scatter(rng, 30, 66, 92, (x, z, r, i) => S.ref(i % 3 ? 'drift' : 'snowRock', i, x, z, 0.9 + r() * 0.8, r() * TAU, i % 3 ? 0 : 0.7), (x, z) => oct(x, z) < A + 4 || (Math.abs(x) < 10 && z > 0));
    return { ...R, look: { robe: '#c8a8ff', robe2: '#f4eeff', belt: '#5a4a8a', hairStyle: [1, 2, 3, 0], hair: '#1e1a24', sword: false }, elderName: '温良' };
  },
};

function ZF_PEOPLE({ tFront, oFront, fieldPts }) {
  const elderLook = (o) => ({ skin: '#eac3a0', hair: '#e8e6ee', hairStyle: 2, age: 'elder', beard: true, robe: '#f2eef8', robe2: '#8a6ac8', belt: '#3a2a5a', sword: false, ...o });
  const outer = { robe: '#ddd0f2', robe2: '#f8f4fc', belt: '#7a6a96' };   // 外门：浅紫
  const inner = { robe: '#c8a8ff', robe2: '#f4eeff', belt: '#5a4a8a' };   // 内门：紫
  const servant = { robe: '#7a7488', robe2: '#c4c0cc', belt: '#3a3448', sword: false };
  const puppet = { skin: '#c8a070', hair: '#6a4a30', hairStyle: 0, robe: '#8a6a48', robe2: '#b89068', belt: '#4a3420', sword: false };
  const fi = ([x, z]) => faceIn(x, z);
  const at3 = (p, f = fi(p)) => [p[0], p[1], f];
  // 讲阵堂前听讲：两排面朝殿门
  const lect = []; { const a = 292.5; for (const [r, off] of [[22.4, [-3, -1, 1, 3]], [20.9, [-2, 0, 2]]]) for (const u of off) { const [x, z] = P(a, r), c = Math.cos((a + 180) * D2R), s = Math.sin((a + 180) * D2R); const px = x + u * c, pz = z - u * s; lect.push([px, pz, faceTo(px, pz, ...P(a, 30)), 'sit']); } }
  // 阵心：八个弟子绕着大法阵踱步施法（第 5 项 orbit）
  const orbit = Array.from({ length: 8 }, (_, i) => { const [x, z] = P(i * 45 + 10, 8.6); return [x, z, 0, 'orbit', { orbit: [0, 0, 8.6, 0.9] }]; });
  // 北面看台（1 级）：八个弟子打坐看阵
  const ledge = [151, 158, 165, 195, 202, 209].map((a) => { const [x, z] = P(a, 16.4); return [x, z, faceIn(x, z), 'sit']; });
  // 演阵场：十二人列阵施法，面朝南
  const yard = [45.5, 48.5, 51.5].flatMap((z) => [-6.6, -2.2, 2.2, 6.6].map((x) => [x, z, 0, 'cast']));
  const tf = (k, d = 0) => { const a = 22.5 + 45 * k, [x, z] = tFront[k], r = Math.hypot(x, z) - d; return P(a, r); };
  return {
    elder: at3(oFront[0]), yard: [0, 49], lib: tf(4, 0.6), stele: [-9, 66], front: [0, 64], arena: [0, 51],
    disciples: [
      ...orbit, ...ledge, ...yard, ...lect,
      // 阵田里两个外门弟子干活
      [fieldPts[0][0] + 1.5, fieldPts[0][1] + 1, 0.6, 'work'], [fieldPts[1][0] - 1.5, fieldPts[1][1] - 1, -2.4, 'work'],
      // 静室外对练
      [...tf(7, 2.2).map((v, i) => v + (i ? 0 : -0.8)), Math.PI / 2, 'spar'], [...tf(7, 2.2).map((v, i) => v + (i ? 0 : 0.8)), -Math.PI / 2, 'spar'],
    ],
    npcs: [
      { name: '公孙衍', title: '阁主', p: [-2.8, ZF.alt[1] + 5.8, 0], look: elderLook({ hair: '#f4f2f8', robe: '#f6f2fc', robe2: '#5a3a9a', beard: true }), lines: ['整座阵法阁，就是一座阵。你走进山门那一刻，已经在阵里了。', '阵者，借天地之势。地势高低，也是阵的一部分。', '八门之中，生门在哪？自己去找。'] },
      { name: '宁无涯', title: '大长老', p: at3(tf(3)), look: elderLook({ robe2: '#7a5ab0' }), lines: ['推演殿里的算筹，一百年没停过。', '阁主在阵眼台上闭关，宗里的事问我。', '你脚下这一圈台子，叫八门台。走错了门，可是会迷路的。'] },
      { name: '柳星河', title: '传功长老', p: at3(tf(6, -0.3)), look: elderLook({ hair: '#d8d4e2', hairStyle: 1, beard: false, robe2: '#9a7ad8' }), act: 'cast', lines: ['布阵先布心。心乱了，阵眼自己就偏了。', '聚灵阵画在田埂上，灵田的灵气能多三成。', '今天讲「困」字诀——你们谁先睡着，就先困谁。'] },
      { name: '铁守拙', title: '执法长老', p: at3(oFront[3]), look: elderLook({ hair: '#4a4652', robe: '#3a3448', robe2: '#9a7ad8', belt: '#1a1424' }), lines: ['擅闯阵心者，困阵里关三天。', '外人偷看阵图？看得懂算你本事。'] },
      { name: '闻符', title: '炼符长老', p: at3(tf(0)), look: elderLook({ hair: '#6a6470', robe2: '#c8a050' }), act: 'cast', lines: ['阵旗、阵盘、阵符，都是从炼符堂出去的。', '一张好符，墨里要掺灵砂，笔不能停。'] },
      { name: '墨机', title: '傀儡师', p: at3(oFront[2]), look: { ...inner, robe: '#6a5a7a', robe2: '#c8b8d8', hairStyle: 2, hair: '#3a3038' }, act: 'work', lines: ['木甲一号又跑去膳堂偷吃了……它根本没有嘴啊。', '傀儡也是阵：关节就是阵眼，灵石就是阵心。'] },
      { name: '木甲一号', title: '木傀儡', p: [...oFront[2]].map((v, i) => v + (i ? 1.6 : -1.6)), look: puppet, route: [oFront[2], P(90, 46), oFront[1], P(90, 46)], speed: 0.8, pause: 3, act: 'work', lines: ['（咔哒、咔哒……它朝你点了点头）', '（它胸口的灵石一闪一闪，像在思考）'] },
      { name: '木甲二号', title: '木傀儡', p: P(208, 48), look: { ...puppet, robe: '#7a5a3a' }, route: [P(208, 48), P(240, 47)], speed: 0.7, pause: 4, act: 'work', lines: ['（它扛着一捆阵旗，走得一板一眼）', '（咔——它停下来，把你也当成阵旗看了一眼）'] },
      { name: '司天', title: '观星长老', p: [...P(131, 45.2), faceIn(...P(131, 45.2))], look: elderLook({ hair: '#c8c4d4', hairStyle: 1, robe: '#2a2a4a', robe2: '#8a8ad8', belt: '#c8a050' }), lines: ['星位移了半度。今年的灵雨会晚。', '阵法要合天时。天上的阵，比地上的大得多。', '夜里来观星台，北斗就在阵法阁正上方。'] },
      { name: '老钟', title: '守阁人', p: tf(4, -0.8).concat([fi(tf(4))]), look: elderLook({ robe: '#9a94a6', robe2: '#6a6478' }), act: 'sit', lines: ['藏经阁里的阵图，别对着火看。', '上一个偷翻阵图的，在阁里转了三天没找到门。'] },
      { name: '沈丹青', title: '丹房长老', p: at3(tf(2, 0.2)), look: elderLook({ robe: '#ece6f2', robe2: '#a86ab0' }), act: 'cast', lines: ['阵法阁的丹，是拿阵火炼的，火候分毫不差。', '聚灵丹给布阵的弟子补灵气，一天一粒，不能多。'] },
      { name: '陆衡', title: '大师兄', p: P(0, 10.6), look: { ...inner, hairStyle: 2, hair: '#141018' }, route: Array.from({ length: 8 }, (_, i) => P(i * 45, 10.6)), speed: 1.1, pause: 1.2, lines: ['跟紧，阵心里一步都不能踩错。', '这大法阵是护山大阵的阵心，平时只开三成。'] },
      { name: '苏璇', title: '二师姐', p: [0, 55.4, Math.PI], look: { ...inner, hairStyle: 1, hair: '#1a1420' }, act: 'cast', lines: ['阵旗再插正一点！歪一寸，阵就漏一尺。', '想学阵法？先把八个方位背熟。'] },
      { name: '范离', title: '内门弟子', p: at3(tf(5, 0.2)), look: { ...inner, hairStyle: 2 }, act: 'work', lines: ['阵盘的纹路要刻三遍，一遍不对就废了。', '阵器坊的锤子比剑宗的剑还多。'] },
      { name: '小阵', title: '小师弟', p: P(0, 22.6), look: { ...inner, hairStyle: 3, age: 'child' }, route: Array.from({ length: 8 }, (_, i) => P(i * 45, 22.6)), speed: 1.6, pause: 0.8, lines: ['我在数八门台有几级台阶！……又数乱了。', '师父说我名字起得好，以后一定能成阵法大家！', '你知道吗，从观星台上看，整个宗门是个八卦！'] },
      { name: '阿禾', title: '外门弟子', p: [fieldPts[0][0] - 1.2, fieldPts[0][1] - 1.4, 0.6], look: { ...outer, hairStyle: 3 }, act: 'work', lines: ['阵田的苗长得比外面快一倍。', '田埂上的阵纹不能踩，踩断了灵气就漏了。'] },
      { name: '赵小方', title: '外门弟子', p: [fieldPts[1][0] + 1.2, fieldPts[1][1] + 1.4, -2.4], look: { ...outer, hairStyle: 0 }, act: 'work', lines: ['灵雨阵今天又下多了，我的鞋全湿了。', '种田也是修阵，师姐说的。'] },
      { name: '钱多多', title: '外门弟子', p: [9.6, 56.2, -0.4], look: { ...outer, hairStyle: 2, robe: '#e0c8a0' }, lines: ['迷踪符、困阵旗，便宜卖！……别告诉执法长老。', '我这阵盘是正品，阵器坊淘汰下来的。'] },
      { name: '胡大娘', title: '膳堂厨娘', p: at3(oFront[1]), look: { ...servant, robe: '#8a6a58', hair: '#3a2a20', hairStyle: 1 }, lines: ['灶台底下也刻了聚火阵，柴省一半。', '木甲一号又来了？去去去，你又不吃饭。'] },
      { name: '老孙', title: '杂役', p: [-12, 57.6, 0], look: { ...servant, hair: '#9a9a9a', age: 'elder', beard: true }, route: [[-12, 57.6], [12, 57.6]], speed: 0.9, pause: 2.5, act: 'work', lines: ['扫地也要按方位扫，不然阵纹会乱。', '我在这扫了四十年，阵法一窍不通。'] },
      { name: '齐方', title: '守山弟子', p: [-3.4, 62.6, 0], look: { ...inner, hairStyle: 0 }, lines: ['阵法阁山门。入门请往执事堂。', '别乱走，院子里每一步都在阵里。'] },
      { name: '齐圆', title: '守山弟子', p: [3.4, 62.6, 0], look: { ...inner, hairStyle: 0 }, lines: ['我叫齐圆，他叫齐方。不以规矩，不成方圆嘛。', '晚上法阵会亮，从山下都看得见。'] },
      { name: '云止', title: '闭关弟子', p: at3(tf(7, -0.4)), look: { ...inner, hair: '#2a2028', hairStyle: 1 }, act: 'sit', lines: ['……（她面前摆着一盘没解开的阵图）', '静室里的阵，一坐进去就听不见外面的声音。'] },
      { name: '青简', title: '书童', p: at3(oFront[4]), look: { ...outer, hairStyle: 3, age: 'child', robe: '#e8e0f4' }, lines: ['阁主的阵图都是我抄的，抄错一笔要重抄十遍。', '宗主居后面就是阵眼台，没有阁主的令牌上不去。'] },
    ],
  };
}

// ===================== 4 剑宗：万剑峰上的剑修大宗（大宗，半径约 100 米）=====================
// 一座十级的阶梯山：山门 → 0 级练剑场（二十四人列队同步挥剑）→ 九重剑阶（每阶一级台、一个守阶弟子，登过的那一阶亮起剑纹）
// → 9 级「万剑台」：重檐万剑殿，殿上一圈二十四柄飞剑环绕。两翼 4 级台地（西：剑阁、内门弟子居；东：铸剑堂、长老院），
// 西北 6 级「剑冢」（巨剑 + 残剑林），东北 7 级「悟剑崖」（悟剑亭）。0 级外院：执事堂、外门弟子居、膳堂、客舍、库房、试剑台、剑林。
const JC = { wall: '#f2f4f6', col: '#8a9aaa', roof: '#5a6878', ridge: '#3a4452', stone: '#c8ccd2', pave: '#e2e4e8', col2: '#6a5a4a', roof2: '#6a7482', glow: '#a8e0ff', signC: { bg: '#2a3440', rim: '#e0e8f0', fg: '#f4f8ff' } };
const JZ = { X: 71, S: 70, N: -66, run: 4.8, hc: [0, -27], arena: [44, 48] };
const jzTierZ = (k) => 40 - JZ.run * (k + 0.42);   // 第 k 阶平台中线
const jzRiseZ = (k) => 40 - JZ.run * k;            // 第 k 阶的坎顶
const JZ_PATHS = [
  { pts: [[0, 42], [0, -9]], w: 2.6 },                                   // 九重剑阶
  { pts: [[-48, 25], [-48, 11]], w: 1.8 }, { pts: [[48, 25], [48, 11]], w: 1.8 },
  { pts: [[-40, -10], [-25, -10]], w: 1.6 }, { pts: [[40, -10], [25, -10]], w: 1.6 },
  { pts: [[-44, -19], [-45.4, -25.4]], w: 1.4 }, { pts: [[45, -19], [46, -29]], w: 1.4 },
];
const JZ_T = makeTerrain({
  levels: 10, LH: 1.5, rock: '#8e949c',
  shapes: [
    shape([-30, -10, 30, 42], (x, z) => Math.min(9, Math.max(0, (40 - z) / JZ.run)) - Math.max(0, Math.abs(x) - 13) / 1.4),
    plat({ x: 0, z: -25, w: 56, d: 36, lv: 9, ring: 2.2, round: 3 }),
    plat({ x: -48, z: -6, w: 20, d: 38, lv: 4, ring: 2.4, round: 2.5, wob: 1, seed: 3 }),
    plat({ x: 48, z: -6, w: 20, d: 38, lv: 4, ring: 2.4, round: 2.5, wob: 1, seed: 5 }),
    plat({ x: -47, z: -31, w: 13, d: 13, round: 4, lv: 6, ring: 2.6, wob: 1.5, seed: 9 }),
    plat({ x: 47, z: -33, w: 14, d: 14, round: 7, lv: 7, ring: 2.4, wob: 1.5, seed: 13 }),
  ],
  paths: JZ_PATHS,
});
const jzPathD = (lx, lz) => { let d = 1e9; for (const p of JZ_PATHS) d = Math.min(d, polyDist(lx, lz, p.pts) - p.w); return d; };
const jianzong = {
  r: 102, terrain: JZ_T, tint: [222, 230, 238], tintK: 0.7,
  ground: (lx, lz, n) => {
    if (Math.abs(lx) > JZ.X + 1 || lz > JZ.S + 1 || lz < JZ.N - 1) return Math.abs(lx) < 2.8 + n && lz > JZ.S && lz < 98 ? 1 : 0;
    if (Math.abs(lx) < 13 + n * 0.3 && lz > 43 - n * 0.3 && lz < 65 + n * 0.3) return 1;
    if (Math.abs(lx) < 2.8 + n && lz > 40) return 1;
    if (Math.abs(lx) < 10 + n * 0.3 && lz > -21 && lz < -4) return 1;
    if (lz > 55 - n * 0.3 && lz < 58 + n * 0.3 && Math.abs(lx) > 12 && Math.abs(lx) < 58) return 1;
    if (Math.hypot(lx - JZ.arena[0], lz - JZ.arena[1]) < 7.8 + n * 0.3) return 1;
    return 0;
  },
  build(S) {
    const rng = rng32(41), g = S.g, { X, S: SZ, N } = JZ;
    const hallJ = (sign, w, d, extra = {}) => hall({ w, d, h: 3.0, wall: JC.wall, col: JC.col, roof: JC.roof, ridge: JC.ridge, sign, base: 0.5, baseC: JC.stone, signC: JC.signC, ...extra });
    const hallO = (sign, w, d, extra = {}) => hall({ w, d, h: 2.6, wall: '#eceef0', col: JC.col2, roof: JC.roof2, ridge: JC.ridge, sign, base: 0.35, baseC: JC.stone, rise: d * 0.34, signC: JC.signC, ...extra });
    const steel = ['#d8e2ea', '#c8d0d8', '#b8a888', '#e4ecf2'], hilt = ['#3a5a7a', '#2a3a4a', '#5a3a2a', '#4a4a5a'];
    const plant = (len, i, tilt = 0.12) => { const o = bigSword(len, { blade: steel[i % 4], grip: hilt[(i >> 1) % 4], guard: i % 3 ? '#c8a24a' : '#a8b4c0' }); o.rotation.set((rng() - 0.5) * tilt * 2, 0, (rng() - 0.5) * tilt * 2); return o; };

    // ---- 铺地 ----
    S.paveRect(-13, 43, 13, 65, JC.pave);                     // 练剑场
    paveStrip(S, 0, 65, 0, 97, 4.4, JC.pave);                 // 山门甬道
    paveStrip(S, 0, 40.4, 0, 43, 5.4, JC.pave);
    S.paveRect(-10, -21, 10, -4, JC.pave);                    // 万剑台前坪
    paveStrip(S, -13, 56.5, -43, 56.5, 3, JC.pave); paveStrip(S, 13, 56.5, 57, 56.5, 3, JC.pave);
    terraceStairs(S, JZ_T, { color: '#d4d8dc', rail: '#b0b6bc' });
    for (const p of JZ_PATHS) markLine(S, ...p.pts[0], ...p.pts[p.pts.length - 1], p.w + 0.8);

    // ---- 院墙 + 四座角楼 + 山门 + 白玉牌坊 ----
    const wo = { h: 2.8, wall: JC.wall, cap: JC.roof, base: '#b8bcc2' };
    wallLine(S, -X, SZ, -5.4, SZ, wo); wallLine(S, 5.4, SZ, X, SZ, wo);
    wallLine(S, -X, SZ, -X, N, wo); wallLine(S, X, SZ, X, N, wo); wallLine(S, -X, N, X, N, wo);
    for (const sx of [-1, 1]) for (const z of [SZ, N]) S.bld(tower({ w: 3.8, d: 3.8, levels: 2, h: 2.8, wall: JC.wall, col: JC.col, roof: JC.roof, ridge: JC.ridge, base: 0.5, baseC: JC.stone, door: false }), sx * X, z);
    openAt(S, hallJ('剑宗', 9, 4.4, { open: true, h: 3.6, base: 0.4, tiers: 2, rise: 1.8 }), 0, SZ);
    for (const s of [-1, 1]) { S.put(lion(s, '#dce0e4'), s * 5.6, SZ + 4.6, 0, 0, { bake: true }); S.circ(s * 5.6, SZ + 4.6, 0.8); }
    const pf = paifang('万剑峰', { col: '#eef0f2', beam: '#c8ccd2', roof: JC.roof, ridge: JC.ridge, w: 12, h: 6.4, bays: 3, signC: JC.signC, stone: '#d8dce0' });
    S.put(pf, 0, 86, 0, 0, { bake: true }); for (const x of pf.userData.cols) S.circ(x, 86, 0.5);
    for (const z of [77, 81, 91, 95]) for (const s of [-1, 1]) S.ref('stoneLan', z + s, s * 3.6, z, 1.1, 0, 0.35);

    // ---- 练剑场：两边剑架、幡、火盆 ----
    for (const s of [-1, 1]) {
      for (const z of [47, 53, 59]) { S.put(swordRack(4), s * 14.6, z, s * Math.PI / 2, 0, { bake: true }); S.box(s * 14.6 - 0.5, z - 1.4, s * 14.6 + 0.5, z + 1.4); }
      for (const z of [44, 64]) { S.put(banner('#4a5a6e', '剑', { fg: '#f4f8ff' }), s * 12.6, z, 0); S.circ(s * 12.6, z, 0.25); }
      S.put(brazier('#bfe8ff'), s * 4.2, 42.6, 0); S.circ(s * 4.2, 42.6, 0.5);
    }

    // ---- 九重剑阶：每阶一面剑纹阵盘 + 一柄插地剑（登过的阶亮起来）+ 坎下一块「第 k 阶」匾 ----
    const tiers = [];
    for (let k = 1; k <= 9; k++) {
      const z = jzTierZ(k), disc = runeDisc(1.7, 1, JC.glow, 1.6, 0.9);
      S.put(disc, 6.4, z, 0, 0.03, { ink: false });
      const sw = bigSword(1.9, { blade: '#e8f2fa', grip: '#3a5a7a', glow: '#bfe8ff' }), gm = sw.children[sw.children.length - 1].material; S.put(sw, 6.4, z, 0.3, -0.25); S.circ(6.4, z, 0.4);
      const pl = plaque(`第${'一二三四五六七八九'[k - 1]}阶`, 1.5, 0.5, JC.signC); S.put(pl, -9, jzRiseZ(k) + 0.85, 0, 0.5, { ink: false });
      tiers.push({ disc, gm });
    }
    S.anims.push((dt, t) => {
      const n = g.sects?.steps || 0;
      tiers.forEach((q, i) => { const on = i < n, k = on ? 1.1 + 0.35 * Math.sin(t * 2.2 - i * 0.6) : 0.18; q.disc.material.color.copy(q.disc.material.userData.base).multiplyScalar(k); q.gm.color.copy(q.gm.userData.base).multiplyScalar(on ? 1 : 0.15); });
    });
    S.anims[S.anims.length - 1](0, 0);
    // 剑阶两侧的石灯
    for (const k of [2, 4, 6, 8]) for (const s of [-1, 1]) S.ref('stoneLan', k * 3 + s, s * 12, jzTierZ(k), 1, 0, 0.35);

    // ---- 万剑台（9 级）：重檐万剑殿 + 飞剑环 + 掌门居 / 执法堂 / 传功堂 / 藏剑阁 / 钟鼓楼 / 万剑碑 ----
    const [hx, hz] = JZ.hc;
    S.bld(hallJ('万剑殿', 22, 12, { tiers: 2, h: 3.8, base: 1.0, rise: 3.6, stairW: 4.2 }), hx, hz);
    S.bld(hallJ('掌门居', 9, 5.6, { tiers: 2, base: 0.6 }), -19, -38);
    S.bld(hallJ('执法堂', 9, 5.6), 19, -38);
    S.bld(hallJ('传功堂', 11, 6.4), -21, -25, Math.PI / 2);
    S.bld(hallJ('藏剑阁', 11, 6.4, { tiers: 2 }), 21, -25, -Math.PI / 2);
    for (const [s, nm] of [[-1, '钟楼'], [1, '鼓楼']]) {
      const G = hall({ w: 5, d: 5, h: 3.0, open: true, col: JC.col, roof: JC.roof, ridge: JC.ridge, base: 1.6, baseC: JC.stone, pyramid: true, k: 1, rise: 2.2, stairW: 1.8 });
      const b = bell(s > 0); b.position.y = s > 0 ? 2.5 : 4.4; G.add(b);
      const p = plaque(nm, 1.6, 0.5, JC.signC); p.position.set(0, 4.35, 2.55); G.add(p);
      S.bld(G, s * 17, -12);
    }
    // 前坪：两柄插地巨剑、香炉
    for (const s of [-1, 1]) { S.put(bigSword(6.5, { blade: '#e8eef4', guard: '#a8b4c0', grip: '#4a6a8a', glow: '#bfe8ff' }), s * 8.4, -16, 0, -0.9, { bake: false }); S.put(podium(2.2, 2.2, 0.5, JC.stone), s * 8.4, -16, 0, 0, { bake: true }); S.box(s * 8.4 - 1.2, -17.2, s * 8.4 + 1.2, -14.8); }
    S.ref('incense', 1, 0, -15.5, 1.3, 0, 0.9);
    // 万剑碑
    { const G = new THREE.Group(); G.add(podium(3.6, 1.8, 0.6, JC.stone)); G.add(at(mesh(boxUV(new THREE.BoxGeometry(2.4, 4.6, 0.6), 2.4, 4.6, 0.6, 0.45).translate(0, 2.3, 0), M('#e4e8ec', { tx: TX.stone })), 0, 0.6, 0));
      const p = scrollPl('万剑归宗', 0.9, 3.4); p.position.set(0, 2.9, 0.31); G.add(p); S.bld(G, 0, -38.6); S.box(-1.8, -39.5, 1.8, -37.7); }
    // 飞剑环：二十四柄剑绕殿慢慢转，剑尖朝前，剑身发光
    const ring = new THREE.Group(), swords = [];
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, sw = bigSword(3.2, { blade: '#eef6ff', guard: '#b8c8d8', grip: '#4a6a8a', glow: '#9ad8ff' });
      sw.rotation.order = 'YXZ'; sw.rotation.set(-Math.PI / 2, a + Math.PI / 2, 0); sw.position.set(Math.sin(a) * 15, 0, Math.cos(a) * 15); ring.add(sw); swords.push(sw);
    }
    S.put(ring, hx, hz, 0, 7.2);
    const ringE = S.emit(hx, 7.2, hz, '#a8e0ff', 1.0, 'lantern');
    S.anims.push((dt, t) => {
      ring.rotation.y = t * 0.22;
      for (let i = 0; i < 24; i++) swords[i].position.y = Math.sin(t * 1.3 + i * 0.9) * 0.35;
      ringE.power = 0.9 + 0.2 * Math.sin(t * 1.7);
      if (Math.random() < dt * 6) { const sw = swords[(Math.random() * 24) | 0], p = sw.getWorldPosition(new THREE.Vector3()); g.fx.mote(p.x, p.y - S.hy(hx, hz), p.z, '#bfe8ff', { life: 1.4, size: 0.3, vy: -0.2, bright: 1.3 }); }
    });

    // ---- 西台（4 级）：剑阁（藏经阁）、内门弟子居 ----
    S.bld(tower({ w: 7, d: 6, levels: 4, h: 2.8, wall: JC.wall, col: JC.col, roof: JC.roof, ridge: JC.ridge, sign: '剑阁', base: 0.6, baseC: JC.stone, k: 0.5, signC: JC.signC }), -48, 4);
    S.bld(hallO('内门弟子居', 9, 5.6), -52, -13);
    for (const s of [-1, 1]) S.ref('stoneLan', 60 + s, -48 + s * 4.6, 8.6, 1, 0, 0.35);
    // ---- 东台（4 级）：铸剑堂 + 剑炉 + 铁砧、长老院 ----
    S.bld(hallJ('铸剑堂', 11, 6.4), 48, 4);
    S.bld(hallO('长老院', 9, 5.6), 52, -13);
    { // 剑炉：圆窑 + 发光炉口 + 烟
      const G = new THREE.Group(), st = M('#8a8480', { tx: TX.stone });
      G.add(mesh(cylUVs(new THREE.CylinderGeometry(1.4, 1.8, 2.6, 12), 1.8, 2.6).translate(0, 1.3, 0), st, { recv: true }));
      G.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 10).translate(0, 3.8, 0), st));
      G.add(at(mesh(new THREE.CircleGeometry(0.6, 12), glow('#ff8a3a', 2.4)), 0, 0.8, 1.76));
      S.bld(G, 42, -2); S.circ(42, -2, 1.9);
      S.emit(42, 1.0, -0.4, '#ff8a3a', 0.8, 'lantern');
      S.anims.push((dt) => { if (Math.random() < dt * 3) g.fx.mote(S.x + 42 + (Math.random() - 0.5) * 0.4, 5.2, S.z - 2, '#9a9490', { life: 3, size: 0.9, vy: 1.1, bright: 0.5 }); });
    }
    for (const x of [44.6, 51.4]) { S.put(anvil(), x, 11.2, 0, 0, { bake: true }); S.circ(x, 11.2, 0.6); }
    S.put(swordRack(4), 55.6, 9.6, -Math.PI / 2, 0, { bake: true }); S.box(55.1, 8.2, 56.1, 11);
    S.ref('barrel', 2, 40.6, 9.8, 1, 0, 0.5);

    // ---- 剑冢（6 级）：一柄巨剑 + 一圈残剑、残旗、坟冢 + 剑祠 ----
    { const cx = -47, cz = -29;
      const big = bigSword(7.5, { blade: '#c8d4de', guard: '#8a7a5a', grip: '#3a3a4a', glow: '#bfe8ff' }); big.rotation.z = 0.06; S.put(big, cx, cz, 0.4, -1.2); S.circ(cx, cz, 0.9);
      S.emit(cx, 3.5, cz, '#a8e0ff', 0.7, 'lantern');
      const items = [];
      for (let i = 0; i < 22; i++) { const a = i / 22 * TAU + rng() * 0.3, r = 2.2 + rng() * 2.2, x = cx + Math.sin(a) * r * 1.2, z = cz + Math.cos(a) * r * 0.9; if (z < cz - 2.6) continue; items.push([plant(1.2 + rng() * 1.4, i, 0.4), x, z, rng() * TAU, -0.2]); S.circ(x, z, 0.3); }
      batch(S, items);
      for (let i = 0; i < 5; i++) { const a = (rng() - 0.5) * 2.6, r = 3 + rng() * 1.8; S.ref(i % 2 ? 'sword' : 'banner', i, cx + Math.sin(a) * r * 1.3, cz + Math.cos(a) * r * 0.8, 1.1, rng() * TAU, 0.3); }
      S.bld(hallJ('剑祠', 5, 3.6, { base: 0.4 }), cx, cz - 5.4);
      S.anims.push((dt, t) => { if (Math.random() < dt * 2.5) { const a = Math.random() * TAU, r = Math.random() * 5; g.fx.mote(S.x + cx + Math.sin(a) * r, 0.4, S.z + cz + Math.cos(a) * r, '#cfe8ff', { life: 3, size: 0.3, vy: 0.5, bright: 1 }); } });
    }
    // ---- 悟剑崖（7 级）：悟剑亭 + 打坐石 ----
    openAt(S, hall({ w: 4.6, d: 4.6, h: 2.6, open: true, col: JC.col, roof: JC.roof, ridge: JC.ridge, base: 0.25, baseC: JC.stone, pyramid: true, k: 1, rise: 2.0, sign: '悟剑亭', signC: JC.signC }), 47, -33.4);
    for (const [x, z] of [[43.4, -30.6], [50.6, -30.2]]) { S.put(medStone(rng), x, z, rng() * TAU, 0, { bake: true }); S.circ(x, z, 0.9); }
    S.ref('bonsai', 1, 51.8, -33.6, 1.0, 2.2, 0.6);

    // ---- 0 级外院：执事堂、外门弟子居、膳堂、客舍、库房、试剑台、剑林 ----
    S.bld(hallJ('执事堂', 11, 6.4), -28, 50);
    S.bld(hallO('外门弟子居', 13, 5.6), -50, 63, Math.PI);
    S.bld(hallO('外门弟子居', 13, 5.6), -50, 49);
    S.bld(hallO('膳堂', 12, 6.4), -62, 36, Math.PI / 2);
    S.bld(hallO('客舍', 11, 6.4), 62, 61, -Math.PI / 2);
    S.bld(hallO('库房', 11, 6.4), 62, 35, -Math.PI / 2);
    S.put(tableSet(), -54, 36, Math.PI / 2, 0, { bake: true }); S.circ(-54, 36, 1.2);
    S.put(well(JC.roof2), -38, 42, 0, 0, { bake: true }); S.circ(-38, 42, 1.1);
    S.put(woodpile(), -66, 50, Math.PI / 2, 0, { bake: true }); S.circ(-66, 50, 1.0);
    for (const [x, z] of [[57, 30], [57.4, 32], [56.6, 40.6]]) S.ref(x > 57 ? 'barrel' : 'crate', (x * 3) | 0, x, z, 1, rng() * TAU, 0.6);
    // 试剑台：一座低圆台（宗门大比的擂台）+ 四面幡
    { const [ax, az] = JZ.arena, G = new THREE.Group(), st = M('#dfe3e7', { tx: TX.stone });
      G.add(mesh(cylUVs(new THREE.CylinderGeometry(7.5, 7.8, 0.4, 40), 7.8, 0.4).translate(0, 0.2, 0), st, { recv: true }));
      G.add(mesh(new THREE.TorusGeometry(7.55, 0.12, 6, 48).rotateX(Math.PI / 2).translate(0, 0.4, 0), M('#9aa4ae')));
      S.put(G, ax, az, 0, 0, { bake: true, ink: false }); S.mark(ax - 8, az - 8, ax + 8, az + 8);
      const sd = runeDisc(3.2, 1, '#cfe8ff', 1.1, 0.5); S.put(sd, ax, az, 0, 0.42, { ink: false });
      for (let k = 0; k < 4; k++) { const [x, z] = P(45 + 90 * k, 8.4); S.put(banner('#4a5a6e', k % 2 ? '试剑' : '剑宗', { fg: '#f4f8ff' }), ax + x, az + z, 0); S.circ(ax + x, az + z, 0.25); }
      for (const [x, z, r] of [[ax - 10.6, az, Math.PI / 2], [ax + 10.6, az, -Math.PI / 2]]) { S.put(swordRack(3), x, z, r, 0, { bake: true }); S.box(x - 0.5, z - 1.4, x + 0.5, z + 1.4); }
    }
    // 剑林：两片插地巨剑、残剑
    for (const s of [-1, 1]) {
      const items = [];
      for (let i = 0, k = 0; i < 120 && k < 22; i++) {
        const x = s * (19 + rng() * 17), z = 21 + rng() * 21;
        if (S.hy(x, z) > 0.03 || !S.free(x, z, 1.4) || items.some((q) => Math.hypot(q[1] - x, q[2] - z) < 2.2)) continue;
        const big = k % 5 === 0, len = big ? 3.6 + rng() * 1.6 : 1.4 + rng() * 1.6;
        items.push([plant(len, k, big ? 0.06 : 0.3), x, z, rng() * TAU, -len * 0.12]); S.circ(x, z, big ? 0.5 : 0.3); k++;
      }
      batch(S, items);
      for (let i = 0; i < 4; i++) S.ref('sword', i, s * (21 + i * 3.6), 40 - i * 4.4, 1.2, rng() * TAU, 0.3);
      S.mark(s > 0 ? 19 : -36, 21, s > 0 ? 36 : -19, 42);
    }

    // ---- 人 ----
    const R = JZ_PEOPLE();
    for (const [x, z] of [...R.disciples, ...R.npcs.map((n) => n.p), ...R.npcs.flatMap((n) => n.route || []), R.elder]) S.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2);

    // ---- 树：台地上零星雪松、墙外雪松林，北面一排石峰 ----
    const inside = (x, z) => Math.abs(x) < X + 3 && z < SZ + 3 && z > N - 3;
    S.scatter(rng, 70, 12, 96, (x, z, r, i) => S.ref(i % 4 ? 'snowPine' : 'pineTree', i, x, z, 0.9 + r() * 0.5, r() * TAU, 0.7), (x, z) => !inside(x, z) || Math.abs(x) > X - 3 || z > SZ - 3 || z < N + 3 || !S.free(x, z, 2.2) || steep(S, x, z) || jzPathD(x, z) < 3 || (Math.abs(x) < 15 && z > -8));
    S.scatter(rng, 140, 74, 104, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.1 + r() * 0.6, r() * TAU, 0.8), (x, z) => inside(x, z) || (Math.abs(x) < 12 && z > 0));
    S.scatter(rng, 30, 74, 100, (x, z, r, i) => S.ref(i % 3 ? 'drift' : 'snowRock', i, x, z, 0.9 + r() * 0.8, r() * TAU, i % 3 ? 0 : 0.7), (x, z) => inside(x, z) || (Math.abs(x) < 12 && z > 0));
    for (let i = 0; i < 7; i++) S.ref('karst', i % 4 === 2 ? 3 : i % 4, -54 + i * 18 + (rng() - 0.5) * 6, N - 12 - rng() * 10, 2.6 + rng() * 1.4, rng() * TAU, 3);
    return { ...R, look: { robe: '#e8f0f8', robe2: '#8aa0b8', belt: '#4a5a6a', hairStyle: [2, 1, 0, 2], hair: '#1a1c22', sword: true }, elderName: '周正' };
  },
};
// 竖匾（石碑上的刻字）
function scrollPl(text, w, h) {
  const tex = canvasTex(Math.round(110 * w), Math.round(110 * h), (c, cw, ch) => {
    c.fillStyle = '#3a4452'; c.fillRect(0, 0, cw, ch); c.strokeStyle = '#c8d8e8'; c.lineWidth = 5; c.strokeRect(4, 4, cw - 8, ch - 8);
    const ch2 = [...text], step = ch / (ch2.length + 0.4); c.fillStyle = '#eef6ff'; c.font = `bold ${Math.min(cw * 0.7, step * 0.8)}px "STKaiti","KaiTi","Noto Serif SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    ch2.forEach((t, i) => c.fillText(t, cw / 2, step * (i + 0.7)));
  }, { pixel: false, repeat: false });
  return mesh(new THREE.PlaneGeometry(w, h), toon('#ffffff', { map: tex }), { cast: false });
}

function JZ_PEOPLE() {
  const elderLook = (o) => ({ skin: '#eac3a0', hair: '#e8eaee', hairStyle: 2, age: 'elder', beard: true, robe: '#f4f6f8', robe2: '#6a8098', belt: '#2a3442', sword: true, ...o });
  const outer = { robe: '#dfe6ee', robe2: '#f6f8fa', belt: '#7a8a9a' };    // 外门：浅灰白
  const inner = { robe: '#e8f0f8', robe2: '#8aa0b8', belt: '#4a5a6a' };    // 内门：白袍银边
  const servant = { robe: '#7a7a80', robe2: '#c4c4c8', belt: '#3a3a40', sword: false };
  const T = (k) => jzTierZ(k);
  // 练剑场：四排、每排六人，同一个起始相位（{ t: 0 }）整齐挥剑
  const drill = [47, 50.5, 54, 57.5].flatMap((z) => [-10, -6, -2, 2, 6, 10].map((x) => [x, z, 0, 'drill', { t: 0 }]));
  const guards = ['莫小锋', '程铁', '秦川', '韩冰', '柳飞絮', '顾长歌', '燕北辰', '南宫月', '楚天阔'];
  const gLines = [
    ['第一阶，我守。连我都过不去，就别往上看了。', '剑阶一阶比一阶高，守阶的师兄一个比一个狠。'],
    ['第二阶。出剑要快，收剑更要快。', '上个月有个散修在我这阶趴了三天。'],
    ['第三阶。我的剑不快，但很重。', '你的步子乱了。剑修的脚，比手还要稳。'],
    ['第四阶，寒冰剑意。冷不冷？', '登到这里的人，十个里剩三个。'],
    ['第五阶。柳絮无根，剑意无形。', '别盯着我的剑看，看我的肩。'],
    ['第六阶。长歌当哭，一剑断愁。', '过了这阶，就能望见万剑殿的飞剑了。'],
    ['第七阶。北辰不动，众星拱之。', '我守这阶十年，被人登过去两次。'],
    ['第八阶。月下剑光最冷。', '再往上一阶，就是楚师兄了。他从来没输过。'],
    ['第九阶。登过我，你就站在万剑台上了。', '九重剑阶，一气登顶的，剑宗百年来不过五人。'],
  ];
  return {
    elder: [-28, 55.6, 0], yard: [0, 54], lib: [-48, 9.2], stele: [-9, 79], front: [0, 77], arena: JZ.arena,
    disciples: [
      ...drill,
      // 剑阶上打坐的弟子
      [-9.6, T(1), 0, 'sit'], [9.6, T(3), 0, 'sit'], [-9.6, T(5), 0, 'sit'], [9.6, T(7), 0, 'sit'],
      // 万剑台前坪：四人御剑（施法）
      [-4.6, -9.2, Math.PI, 'cast'], [4.6, -9.2, Math.PI, 'cast'], [-6.6, -11.6, Math.PI, 'cast'], [6.6, -11.6, Math.PI, 'cast'],
      // 试剑台：两对对练
      [39.6, 46, Math.PI / 2, 'spar'], [42.4, 46, -Math.PI / 2, 'spar'], [45.6, 46, Math.PI / 2, 'spar'], [48.4, 46, -Math.PI / 2, 'spar'],
      // 铸剑堂外抡锤
      [44.6, 12.6, Math.PI, 'work'], [51.4, 12.6, Math.PI, 'work'],
      // 剑林里打坐悟剑
      [-27.6, 27.4, 0.4, 'sit'], [26.4, 33.6, -0.5, 'sit'],
      // 剑阁门口读书、西台对练
      [-45.6, 9.8, -0.3, 'sit'], [-42.6, -4, Math.PI / 2, 'spar'], [-39.8, -4, -Math.PI / 2, 'spar'],
      // 悟剑崖上打坐
      [43.4, -30.6, 0.6, 'sit'], [50.6, -30.2, -0.6, 'sit'],
      // 外门弟子居前踱步
      [-46, 56.5, Math.PI / 2, 'idle'], [-44.2, 56.5, -Math.PI / 2, 'idle'],
    ],
    npcs: [
      { name: '剑无极', title: '宗主', p: [0, -19.4, 0], look: elderLook({ hair: '#f4f6f8', robe: '#f8fafc', robe2: '#4a6a8a', beard: true }), lines: ['剑宗的剑，只问快慢，不问出身。', '头顶那二十四柄飞剑，是历代宗主的佩剑。等我死了，也会飞上去。', '万剑归宗，不是一人御万剑，是万人同一心。'] },
      { name: '慕容锋', title: '大长老', p: [10.6, -19.6, -0.3], look: elderLook({ hair: '#d8dce2', robe2: '#5a7a9a' }), lines: ['宗主闭关的时候，万剑台归我管。', '九重剑阶不是台阶，是九道坎。', '外人上万剑台，先要有人领路。'] },
      { name: '萧问剑', title: '传剑长老', p: [0, 61.6, Math.PI], look: elderLook({ hair: '#3a3a40', hairStyle: 1, beard: false, robe2: '#7a90a8' }), act: 'drill', lines: ['起剑——刺！收！再来！', '二十四个人，要像一个人。差半拍，就不是剑阵了。', '你也想练？站到最后一排去。'] },
      { name: '铁衣', title: '执法长老', p: [19, -33, 0], look: elderLook({ hair: '#4a4c52', robe: '#3a4048', robe2: '#8aa0b8', belt: '#1a1e24' }), lines: ['剑宗门规第一条：剑不出鞘，不伤同门。', '偷学剑招的，断一指；偷剑的，断一手。'] },
      { name: '欧阳冶', title: '铸剑大师', p: [48, 9.4, 0], look: elderLook({ hair: '#5a4a40', robe: '#6a5a4a', robe2: '#c8a050', belt: '#3a2a20', sword: false }), act: 'work', lines: ['好剑要淬九次火，好剑修要摔九次跤。', '剑炉里的火三百年没灭过。灭了，我也就该退了。', '拿你的剑来我看看……啧，这也叫剑？'] },
      { name: '老剑', title: '守剑人', p: [-43.6, -26.6, 0.4], look: elderLook({ hair: '#c8c8c8', robe: '#9aa0a6', robe2: '#5a6068', belt: '#3a3a3a' }), act: 'sit', lines: ['剑冢里埋的都是断剑。剑断了，剑修的心也就断了。', '中间那柄巨剑，是开山祖师的。谁也拔不出来。', '夜里来，能听见剑在哭。'] },
      { name: '叶孤鸿', title: '守阁长老', p: [-50.6, 9.6, 0.2], look: elderLook({ hair: '#e0e2e6', hairStyle: 1, robe2: '#6a7a8a' }), act: 'sit', lines: ['剑阁四层，越往上的剑谱越难懂。', '剑谱不是看会的，是练会的。看十遍不如刺一千下。'] },
      { name: '沈白衣', title: '大师兄', p: [42.6, 51.4, Math.PI / 2], look: { ...inner, hairStyle: 2, hair: '#141418' }, act: 'spar', lines: ['周日宗门大比，试剑台见。', '我登九重剑阶用了三年。你呢？', '剑在人在。'] },
      { name: '凌霜', title: '二师姐', p: [45.4, 51.4, -Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#18161c' }, act: 'spar', lines: ['大师兄的剑快，我的剑冷。', '别站那么近，剑气会伤人的。', '你的剑意……还差得远。'] },
      { name: '小剑', title: '小师弟', p: [1.2, 44], look: { ...inner, hairStyle: 3, age: 'child' }, route: [[1.2, 44], [1.2, -5]], speed: 1.5, pause: 3, lines: ['我每天跑十趟剑阶！总有一天我要站着登上去！', '守阶的师兄都认识我，他们不跟小孩打。', '你看头顶的飞剑！我长大也要有一把飞上去！'] },
      ...guards.map((name, i) => ({ name, title: `守阶弟子 · 第${'一二三四五六七八九'[i]}阶`, p: [-4.2, T(i + 1), 0], look: { ...inner, hairStyle: [2, 0, 2, 1, 1, 2, 0, 1, 2][i], hair: i === 4 || i === 7 ? '#2a2026' : '#16161a', robe2: i >= 6 ? '#5a7a9a' : inner.robe2 }, act: 'idle', lines: gLines[i] })),
      { name: '公孙二娘', title: '剑舞教习', p: [-16.4, 52, Math.PI / 2], look: { ...inner, hairStyle: 1, hair: '#1e1820', robe: '#f2f4f8', robe2: '#b8a0c8' }, act: 'drill', lines: ['剑舞不是花架子。舞得好看，杀得也好看。', '外门弟子先学剑舞，脚步对了，剑自然就对了。'] },
      { name: '王婶', title: '膳堂厨娘', p: [-57.6, 36.4, Math.PI / 2], look: { ...servant, robe: '#8a7a68', hair: '#3a2a20', hairStyle: 1 }, lines: ['剑修吃饭也快，一碗面三口就没了。', '登剑阶的孩子饿得快，多盛点。'] },
      { name: '老黄', title: '杂役', p: [-12, 66.4, 0], look: { ...servant, hair: '#9a9a9a', age: 'elder', beard: true }, route: [[-12, 66.4], [12, 66.4]], speed: 0.9, pause: 2.5, act: 'work', lines: ['剑阶上的雪，得在天亮前扫干净。', '扫了四十年地，扫帚都快练成剑了。'] },
      { name: '金戈', title: '守山弟子', p: [-3.6, 74.4, 0], look: { ...inner, hairStyle: 0 }, lines: ['剑宗山门。元婴以上，才能登九重剑阶。', '牌坊上的「万剑峰」三个字，是用剑刻的。'] },
      { name: '铁马', title: '守山弟子', p: [3.6, 74.4, 0], look: { ...inner, hairStyle: 0 }, lines: ['我叫铁马，他叫金戈。宗主取的名字。', '晚上来看，万剑殿上的飞剑会发光。'] },
      { name: '洛小白', title: '外门弟子', p: [-22, 40], look: { ...outer, hairStyle: 3 }, route: [[-22, 40], [-32, 31], [-24, 23]], speed: 1.0, pause: 3, lines: ['剑林里的剑，每一柄都有名字。我在一柄一柄地记。', '这柄叫「惊鸿」，那柄叫「断水」……那柄我也忘了。'] },
      { name: '风清', title: '悟剑长老', p: [47, -33.4, 0], look: elderLook({ hair: '#f0f2f4', hairStyle: 1, beard: true, robe: '#eef2f6', robe2: '#9ab0c8' }), act: 'sit', lines: ['悟剑崖上风大。风往哪吹，剑意就往哪走。', '无招胜有招……你还早。先把有招练熟。', '坐下吧。看云，别看剑。'] },
      { name: '赵铁柱', title: '库房管事', p: [57.4, 35, -Math.PI / 2], look: { ...outer, hairStyle: 0, robe: '#9aa4ae' }, lines: ['领剑要登记。弄丢了，从月例里扣。', '库房里的剑，比剑宗的人还多。'] },
    ],
  };
}

export const SITES2 = { 阵法阁: zhenfa, 剑宗: jianzong };
export { obbCol, bldR, openAt, wallLine, markLine, paveStrip, paveOct, batch, steep, runeDisc, scrollPl, P, faceTo, faceIn };
