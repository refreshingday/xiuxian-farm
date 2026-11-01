// 村墙 + 村门 + 望楼：青竹村是一座围起来的村子，只有三个口子（东北通矿洞的大路、南门、西门）。
// 白墙黑瓦：石基 + 粉墙 + 小瓦顶，每隔一段立一根木柱；城墙用实例化画（60 来段）。参考画风着色（toon ref）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, mesh, at, addOutline, canvasTex, boxUV } from './util.js';

const TAU = Math.PI * 2, Y = new THREE.Vector3(0, 1, 0);
export const GATE_HALF = 3.4;      // 门洞半宽（米）
const SEG = 64, H = 2.45;           // 墙分多少段、墙高
const PIER_W = 2.0;                 // 门墩宽
const angDist = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };

function inst(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  list.forEach(([x, z, rot], i) => { q.setFromAxisAngle(Y, rot); p.set(x, 0, z); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
  return im;
}

// gates: [{ id, name, a, x, z }]，towers: 望楼在墙上的角度
export function buildWall(world, R, gates, towers) {
  const T = world.T, line = world.M.line, scene = world.scene;
  const stoneM = toon('#9c978f', { occ: true, ref: true, map: T.stone });
  const plasterM = toon('#ece5d3', { occ: true, ref: true });
  const tileM = toon('#3f4552', { occ: true, ref: true });
  const woodM = toon('#6a4029', { occ: true, ref: true });
  const step = TAU / SEG, L = 2 * R * Math.sin(step / 2);
  const nearGate = (a, d) => gates.some((g) => R * angDist(a, g.a) < d);

  // ---- 墙身 ----
  const base = boxUV(new THREE.BoxGeometry(L + 0.25, 0.6, 1.0), L, 0.6, 1.0, 1.4).translate(0, 0.3, 0);
  const body = new THREE.BoxGeometry(L + 0.15, H - 0.6, 0.66).translate(0, 0.6 + (H - 0.6) / 2, 0);
  const slab = (s) => new THREE.BoxGeometry(L + 0.5, 0.1, 0.85).rotateX(s * 0.55).translate(0, H + 0.14, -s * 0.36);
  const ridge = new THREE.BoxGeometry(L + 0.5, 0.1, 0.16).translate(0, H + 0.29, 0);
  const cap = mergeGeometries([slab(1), slab(-1), ridge]);
  const post = new THREE.BoxGeometry(0.5, H + 0.45, 0.5).translate(0, (H + 0.45) / 2, 0);
  const segs = [], posts = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i + 0.5) * step;
    if (!nearGate(a, GATE_HALF + 2.0 + PIER_W / 2)) segs.push([Math.sin(a) * R, -Math.cos(a) * R, -a]);
    const b = i * step;
    if (!nearGate(b, GATE_HALF + 0.4)) posts.push([Math.sin(b) * R, -Math.cos(b) * R, -b]);
  }
  for (const im of [inst(base, stoneM, segs), inst(body, plasterM, segs), inst(cap, tileM, segs), inst(post, woodM, posts)]) { addOutline(im, line); scene.add(im); }

  // ---- 碰撞：沿墙一圈小圆，门洞留空（tide 的妖兽可以穿过去，见 world.resolve） ----
  const n = Math.round(TAU * R / 1.5);
  for (let k = 0; k < n; k++) {
    const a = k * TAU / n;
    if (nearGate(a, GATE_HALF)) continue;
    world.addCircle(Math.sin(a) * R, -Math.cos(a) * R, 1.0).wall = true;
  }

  // ---- 村门 ----
  for (const g of gates) {
    const G = new THREE.Group();
    G.position.set(g.x, 0, g.z); G.rotation.y = -g.a;    // 本地 x 沿墙，本地 -z 朝村外
    const pierX = GATE_HALF + PIER_W / 2;
    for (const s of [-1, 1]) {
      G.add(at(mesh(boxUV(new THREE.BoxGeometry(PIER_W, 3.5, 1.7), PIER_W, 3.5, 1.7, 1.4).translate(0, 1.75, 0), stoneM), s * pierX, 0, 0));
      G.add(at(mesh(new THREE.BoxGeometry(PIER_W + 0.3, 0.2, 1.95).translate(0, 3.6, 0), woodM), s * pierX, 0, 0));
      // 开着的两扇门：贴着门墩往村里掀
      const leaf = mesh(boxUV(new THREE.BoxGeometry(0.16, 2.9, 2.5), 0.16, 2.9, 2.5, 1.2).translate(0, 1.45, 1.25), toon('#8a5a34', { occ: true, ref: true, map: T.plank }));
      G.add(at(leaf, s * (GATE_HALF - 0.15), 0, 0.5));
      // 门钉
      for (const dy of [0.9, 1.7, 2.5]) G.add(at(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 6).rotateZ(Math.PI / 2), toon('#c8a24a', { ref: true })), s * (GATE_HALF - 0.05), dy, 1.0));
    }
    // 门楣横梁 + 门楼瓦顶
    G.add(at(mesh(new THREE.BoxGeometry(2 * pierX + PIER_W + 0.6, 0.5, 1.2), woodM), 0, 3.35, 0));
    const roof = world.gableRoof(2 * pierX + PIER_W + 2.0, 3.4, 1.35, tileM, toon('#2e323c', { occ: true, ref: true }));
    roof.position.y = 3.65; G.add(roof);
    // 门匾（朝村外）
    const tex = canvasTex(256, 72, (c, w, h) => {
      c.fillStyle = '#3a2416'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d6b670'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = '#ffe7a8'; c.font = 'bold 42px "STKaiti","KaiTi","Noto Serif SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(g.name, w / 2, h / 2 + 2);
    }, { pixel: false, repeat: false });
    for (const s of [-1, 1]) { // 内外各挂一块
      const sign = mesh(new THREE.PlaneGeometry(2.2, 0.62), toon('#ffffff', { map: tex }), { cast: false });
      sign.position.set(0, 3.0, s * 0.64); if (s < 0) sign.rotation.y = Math.PI; G.add(sign);
    }
    // 灯笼：门洞两侧各一盏
    for (const s of [-1, 1]) {
      const lan = mesh(new THREE.SphereGeometry(0.26, 10, 8).scale(1, 1.2, 1), glow('#ff4a2a', 1.8, true), { cast: false });
      lan.position.set(s * (GATE_HALF - 0.9), 2.7, -0.4); G.add(lan);
      G.add(at(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 3), toon('#3a2a20')), s * (GATE_HALF - 0.9), 3.1, -0.4));
      const wp = lan.getWorldPosition(new THREE.Vector3());
      G.updateMatrixWorld(true);
      lan.getWorldPosition(wp);
      world.addEmitter(wp.x, wp.y, wp.z, '#ff7a4a', 0.9, 'lantern', lan);
    }
    addOutline(G, line);
    scene.add(G);
  }

  // ---- 望楼 ----
  for (const a of towers) {
    if (nearGate(a, 12)) continue;
    const x = Math.sin(a) * R, z = -Math.cos(a) * R, G = new THREE.Group();
    G.position.set(x, 0, z); G.rotation.y = -a;
    G.add(mesh(boxUV(new THREE.BoxGeometry(3.8, 3.2, 3.8), 3.8, 3.2, 3.8, 1.4).translate(0, 1.6, 0), stoneM));
    G.add(mesh(new THREE.BoxGeometry(3.1, 1.7, 3.1).translate(0, 3.2 + 0.85, 0), plasterM));
    for (const [px, pz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) G.add(at(mesh(new THREE.BoxGeometry(0.3, 1.9, 0.3).translate(0, 3.2 + 0.95, 0), woodM), px, 0, pz));
    G.add(at(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.12), toon('#2a2a30', { ref: true })), 0, 4.1, -1.56)); // 射口
    const roof = world.gableRoof(4.8, 4.6, 1.5, tileM, toon('#2e323c', { occ: true, ref: true }));
    roof.position.y = 4.95; G.add(roof);
    const lan = mesh(new THREE.SphereGeometry(0.24, 10, 8).scale(1, 1.2, 1), glow('#ff4a2a', 1.8, true), { cast: false });
    lan.position.set(0, 4.3, -2.1); G.add(lan);
    G.updateMatrixWorld(true);
    const wp = lan.getWorldPosition(new THREE.Vector3());
    world.addEmitter(wp.x, wp.y, wp.z, '#ff7a4a', 0.9, 'lantern', lan);
    addOutline(G, line);
    scene.add(G);
    world.addCircle(x, z, 2.3).wall = true;
  }
}

