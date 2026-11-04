// 门派场景共用小件：木人桩、水井、柴堆、铁砧、桌凳、钟鼓、栅栏、药田、巨剑、剑架、冰晶、石桥……（sectsites*.js 都用）
import * as THREE from 'three';
import { mesh, at, boxUV, glow } from './util.js';
import { M, TX, shade, roof } from './sectkit.js';

export const TAU = Math.PI * 2;
export function rng32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 巨剑（剑冢、剑林用）
export function bigSword(len, o = {}) {
  const G = new THREE.Group(), bw = len * 0.075;
  const blade = new THREE.Shape([new THREE.Vector2(-bw, 0), new THREE.Vector2(bw, 0), new THREE.Vector2(bw * 0.9, len * 0.85), new THREE.Vector2(0, len), new THREE.Vector2(-bw * 0.9, len * 0.85)]);
  G.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: bw * 0.25, bevelEnabled: false }).translate(0, 0, -bw * 0.125).rotateZ(Math.PI).translate(0, len, 0), M(o.blade || '#d8e2ea')));
  G.add(at(mesh(new THREE.BoxGeometry(bw * 5, bw * 0.8, bw * 1.2), M(o.guard || '#c8a24a')), 0, len, 0));
  G.add(at(mesh(new THREE.CylinderGeometry(bw * 0.45, bw * 0.45, len * 0.25, 8), M(o.grip || '#3a5a7a')), 0, len + len * 0.13, 0));
  G.add(at(mesh(new THREE.SphereGeometry(bw * 0.8, 8, 6), M(o.guard || '#c8a24a')), 0, len * 1.27, 0));
  if (o.glow) { const e = mesh(new THREE.BoxGeometry(bw * 0.25, len * 0.8, bw * 0.4), glow(o.glow, 2.2, true), { cast: false }); e.position.y = len * 0.45; G.add(e); }
  return G;
}
// 剑架：两柱一横，架上斜靠几把剑
export function swordRack(n = 4) {
  const G = new THREE.Group(), wood = M('#6a4029');
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(0, 0.75, 0), wood), s * 1.2, 0, 0));
  G.add(at(mesh(new THREE.BoxGeometry(2.6, 0.12, 0.16), wood), 0, 1.3, 0));
  G.add(at(mesh(new THREE.BoxGeometry(2.6, 0.1, 0.4), wood), 0, 0.15, 0.1));
  for (let i = 0; i < n; i++) { const sw = bigSword(1.15, { grip: '#2a3a4a' }); sw.rotation.set(-0.18, 0, 0.05); sw.position.set(-0.9 + i * 0.6, 0.12, 0.2); G.add(sw); }
  return G;
}


// 小件：木人桩、水井、柴堆、铁砧、桌凳、钟、鼓
export function dummy() {
  const G = new THREE.Group(), w = M('#7a5030', { tx: TX.wood });
  G.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.9, 8).translate(0, 0.95, 0), w));
  for (const [y, r] of [[1.35, 0.4], [0.95, -0.5], [0.6, 0.9]]) { const a = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6).rotateZ(Math.PI / 2).translate(0.3, 0, 0), w); a.position.y = y; a.rotation.y = r; G.add(a); }
  G.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.15, 10).translate(0, 0.07, 0), M('#8a8680', { tx: TX.stone })));
  return G;
}
export function well(roofC = '#4a5262') {
  const G = new THREE.Group(), st = M('#9a958c', { tx: TX.stone }), w = M('#6a4029', { tx: TX.wood });
  G.add(mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.75, 14, 1, true).translate(0, 0.37, 0), st));
  G.add(mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 18).rotateX(Math.PI / 2).translate(0, 0.75, 0), st));
  G.add(mesh(new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2).translate(0, 0.3, 0), M('#2a3a4a')));
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14).translate(0, 1, 0), w), s * 1.0, 0, 0));
  G.add(at(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8).rotateZ(Math.PI / 2), w), 0, 1.6, 0));
  const r = roof(2.6, 1.6, 0.6, roofC, { k: 0.3 }); r.position.y = 2.0; G.add(r);
  G.add(at(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 8), w), 0.4, 1.1, 0));
  return G;
}
export function woodpile() {
  const G = new THREE.Group(), w = M('#8a5a34'), e = M('#d8b080');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 7).rotateX(Math.PI / 2), w); l.position.set(-0.85 + i * 0.34 + r * 0.17, 0.16 + r * 0.29, 0); G.add(l);
    const c = mesh(new THREE.CircleGeometry(0.15, 7), e); c.position.set(l.position.x, l.position.y, 0.71); G.add(c);
  }
  G.add(at(mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.5, 9).translate(0, 0.25, 0), w), 1.6, 0, 0.3)); // 劈柴墩
  return G;
}
export function anvil() {
  const G = new THREE.Group(), m = M('#4a4a50', { tx: 'rusty_iron' });
  G.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4).translate(0, 0.25, 0), M('#6a4029')));
  G.add(mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4).translate(0.1, 0.62, 0), m));
  G.add(mesh(new THREE.ConeGeometry(0.13, 0.4, 6).rotateZ(Math.PI / 2).translate(0.75, 0.66, 0), m));
  return G;
}
export function tableSet() {
  const G = new THREE.Group(), w = M('#7a5030', { tx: TX.wood });
  G.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 1.0).translate(0, 0.78, 0), w));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1).translate(0, 0.39, 0), w), sx * 1.05, 0, sz * 0.4));
  for (const sz of [-1, 1]) { G.add(at(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.32).translate(0, 0.45, 0), w), 0, 0, sz * 0.85)); for (const sx of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08).translate(0, 0.22, 0), w), sx * 1.05, 0, sz * 0.85)); }
  for (let i = 0; i < 4; i++) G.add(at(mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.1, 8), M('#e8e2d4')), -0.8 + i * 0.55, 0.88, (i % 2 - 0.5) * 0.4));
  return G;
}
export function bell(drum) {
  if (drum) { const G = new THREE.Group(); G.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 16).rotateX(Math.PI / 2), M('#a83a2a'))); for (const s of [-1, 1]) { const f = at(mesh(new THREE.CircleGeometry(0.72, 16), M('#e8d8b0')), 0, 0, s * 0.46); f.rotation.y = s > 0 ? 0 : Math.PI; G.add(f); } return G; }
  const pts = [[0, 0], [0.62, 0], [0.58, 0.2], [0.45, 0.9], [0.4, 1.1], [0.15, 1.2], [0, 1.2]].map(([x, y]) => new THREE.Vector2(x, y));
  return mesh(new THREE.LatheGeometry(pts, 16).translate(0, -1.2, 0), M('#7a6a3a', { metal: true }));
}

// 一圈栅栏
export function fence(w, d) {
  const G = new THREE.Group(), m = M('#7a5a3a', { tx: TX.wood });
  const side = (len, x, z, ry) => { const s = new THREE.Group(); for (let i = 0; i <= Math.round(len / 1.2); i++) s.add(at(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1).translate(0, 0.45, 0), m), -len / 2 + i * len / Math.round(len / 1.2), 0, 0)); for (const y of [0.35, 0.75]) s.add(at(mesh(new THREE.BoxGeometry(len, 0.07, 0.05), m), 0, y, 0)); s.position.set(x, 0, z); s.rotation.y = ry; G.add(s); };
  side(w, 0, -d / 2, 0); side(w * 0.4, -w * 0.3, d / 2, 0); side(w * 0.4, w * 0.3, d / 2, 0); side(d, -w / 2, 0, Math.PI / 2); side(d, w / 2, 0, Math.PI / 2);
  return G;
}
// 一畦药田：耕土 + 几排药苗
export function herbBed(w, d, rng) {
  const G = new THREE.Group(), soil = M('#8a6a4a', { tx: 'tilled_soil' });
  G.add(mesh(boxUV(new THREE.BoxGeometry(w, 0.2, d), w, 0.2, d, 0.5).translate(0, 0.1, 0), soil, { recv: true }));
  const leaf = [M('#5aa04a'), M('#7ac05a'), M('#4a8a6a')], fl = [M('#e86a8a'), M('#f0d060'), M('#a87ae8')];
  for (let x = -w / 2 + 0.5; x < w / 2; x += 0.8) for (let z = -d / 2 + 0.5; z < d / 2; z += 0.9) {
    const h = 0.3 + rng() * 0.3, p = mesh(new THREE.ConeGeometry(0.22, h, 5).translate(0, h / 2 + 0.2, 0), leaf[Math.floor(rng() * 3)]); p.position.set(x, 0, z); G.add(p);
    if (rng() < 0.35) G.add(at(mesh(new THREE.SphereGeometry(0.08, 6, 5), fl[Math.floor(rng() * 3)]), x, h + 0.25, z));
  }
  return G;
}

// 冰晶：拉长的八面体
export function crystal(h, color = '#bfe8ff') {
  return mesh(new THREE.OctahedronGeometry(1, 0).scale(0.28 * h / 1.6, h / 2, 0.28 * h / 1.6).translate(0, h / 2 * 0.9, 0), M(color, { emissive: '#5ab8f0', ei: 0.35 }));
}
export function crystalCluster(n, size, rng) {
  const G = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = crystal(size * (0.45 + rng() * 0.7)); const a = rng() * TAU, r = i ? size * (0.15 + rng() * 0.3) : 0;
    c.position.set(Math.sin(a) * r, -0.1, Math.cos(a) * r); c.rotation.set((rng() - 0.5) * 0.7, rng() * TAU, (rng() - 0.5) * 0.7); G.add(c);
  }
  return G;
}

export const cylUVs = (geo, r, h) => { const uv = geo.attributes.uv, C = TAU * r; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * C * 0.45, uv.getY(i) * h * 0.45); return geo; };
// 打坐石台：一块扁平大石
export function medStone(rng) {
  return mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 7).translate(0, 0.17, 0).scale(1, 1, 0.8 + rng() * 0.3), M('#9aa4ae', { tx: TX.stone }), { recv: true });
}
// 石桥：平铺桥面（玩家地面是平的，桥面不能拱太高）+ 两侧弧形栏板 + 望柱
export function bridge(len, w, o = {}) {
  const G = new THREE.Group(), st = M(o.color || '#e6e8ea', { tx: o.tx || TX.stone }), dark = M(shade(o.color || '#e6e8ea', 0.75), { tx: o.tx || TX.stone });
  G.add(mesh(boxUV(new THREE.BoxGeometry(w, 0.16, len), w, 0.16, len, 0.45).translate(0, 0.08, 0), st, { recv: true }));
  for (const s of [-1, 1]) {
    const n = 10;
    for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, h = (t) => 0.55 + Math.sin(t * Math.PI) * 0.35, z0 = -len / 2 + t0 * len, z1 = -len / 2 + t1 * len, hh = (h(t0) + h(t1)) / 2;
      G.add(at(mesh(new THREE.BoxGeometry(0.16, hh, z1 - z0).translate(0, hh / 2, 0), st), s * (w / 2 - 0.08), 0.16, (z0 + z1) / 2)); }
    for (let i = 0; i <= 4; i++) { const t = i / 4, h = 0.9 + Math.sin(t * Math.PI) * 0.35; G.add(at(mesh(new THREE.BoxGeometry(0.24, h, 0.24).translate(0, h / 2, 0), dark), s * (w / 2 - 0.08), 0.16, -len / 2 + t * len)); G.add(at(mesh(new THREE.SphereGeometry(0.15, 8, 6), dark), s * (w / 2 - 0.08), 0.16 + h + 0.08, -len / 2 + t * len)); }
  }
  G.userData.rails = [len, w];
  return G;
}

// 台地石阶（terrace.js 的 T.steps）：每段上一级，进深 = 这一级沿路的长度；每级一直埋到地下 2 米（露出的是实心石砌，不悬空）；两侧矮石栏
export function terraceStairs(S, T, { color = '#b4aea8', rail = '#9a948e', tx = TX.stone } = {}) {
  const sm = M(color, { tx }), rm = rail && M(rail, { tx });
  for (const st of T.steps) {
    const G = new THREE.Group(), W = st.w * 2 + 0.2, RUN = st.run, n = Math.max(3, Math.round(RUN / 0.45)), d = RUN / n;
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * T.LH / n, z = RUN / 2 - d * (i + 0.5);
      G.add(at(mesh(boxUV(new THREE.BoxGeometry(W, h + 2, d + 0.02), W, h + 2, d, 0.5), sm), 0, (h - 2) / 2, z));
      if (rm) for (const sx of [-1, 1]) G.add(at(mesh(boxUV(new THREE.BoxGeometry(0.3, h + 2.35, d + 0.02), 0.3, h + 2.35, d, 0.5), rm), sx * (W / 2 + 0.15), (h + 0.35 - 2) / 2, z));
    }
    S.put(G, st.x, st.z, st.rot, st.k * T.LH, { abs: true, bake: true });
  }
}
