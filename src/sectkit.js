// 门派建筑零件：台基、殿（歇山 / 庑殿顶，翘角）、楼阁、塔、牌坊、院墙、幡、匾。全部在本地坐标里画，正面朝 +z。
// 参考画风着色（toon ref：三阶色阶、冷暗暖亮），和村子一致。
import * as THREE from 'three';
import { toon, glow, mesh, at, canvasTex, boxUV, PNG } from './util.js';

// 贴图（Codex 生成，assets/textures/）：tx 写贴图名，带「或」的按顺序取第一张已加载的
// 青瓦 roof_tiles · 石砖 stone_carved · 粉墙 plaster_wall|cloth_canvas · 木 lacquer_wood|wood_planks
export const TX = { roof: 'roof_tiles', stone: 'stone_carved|stone_plaza', wall: 'plaster_wall|cloth_canvas', wood: 'lacquer_wood|wood_planks' };
export function texOf(names) {
  for (const n of names.split('|')) { const t = PNG[n]; if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; } }
  return null;
}
const _mc = new Map();
export const M = (c, o = {}) => {
  const { tx, ...rest } = o, k = c + (tx || '') + JSON.stringify(rest);
  if (!_mc.has(k)) _mc.set(k, toon(c, { occ: true, ref: true, ...rest, map: tx ? texOf(tx) : null }));
  return _mc.get(k);
};
// 圆柱 UV：u 绕一圈 = 周长，v = 高；swap 让木纹竖着走
export function cylUV(geo, r, h, k = 1, swap = true) {
  const uv = geo.attributes.uv, C = Math.PI * 2 * r;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i) * C * k, v = uv.getY(i) * h * k; if (swap) uv.setXY(i, v, u); else uv.setXY(i, u, v); }
  return geo;
}
const col = (r0, r1, h, m, seg = 10) => mesh(cylUV(new THREE.CylinderGeometry(r0, r1, h, seg), r1, h, 0.6).translate(0, h / 2, 0), m);
const box = (w, h, d, m, k = 0.5) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, k), m);
export const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// 屋顶：底边 w×d，屋脊长 w-d*k（k=1 就是攒尖），高 rise。四面坡 + 檐板 + 屋脊 + 四角起翘
export function roof(w, d, rise, color, o = {}) {
  const G = new THREE.Group(), tile = M(color, { tx: o.tx || TX.roof }), dark = M(o.ridge || shade(color, 0.55));
  const hx = w / 2, hz = d / 2, rx = Math.max(0, hx - hz * (o.k ?? 0.9)), rz = o.pyramid ? 0 : 0.06;
  const v = [[-hx, 0, hz], [hx, 0, hz], [rx, rise, rz], [-rx, rise, rz], [hx, 0, -hz], [-hx, 0, -hz], [-rx, rise, -rz], [rx, rise, -rz]];
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [1, 4, 7, 2], [5, 0, 3, 6]];
  const pos = [];
  for (const [a, b, c, e] of quads) for (const i of [a, b, c, a, c, e]) pos.push(...v[i]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = geo.attributes.position;
  geo.computeVertexNormals();
  // 瓦垄顺着坡往下：前后坡 u 沿 x，左右坡 u 沿 z；v = 离檐口的坡长
  const uv = [], K = 0.4;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), side = Math.floor(i / 6) >= 2;
    uv.push((side ? z : x) * K, (side ? hx - Math.abs(x) : hz - Math.abs(z)) * K * 0.8 + y * K);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  G.add(mesh(geo, tile));
  G.add(at(mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), dark), 0, 0, 0));        // 檐板
  if (rx > 0.05) G.add(at(mesh(new THREE.BoxGeometry(rx * 2 + 0.4, 0.22, 0.26), dark), 0, rise + 0.06, 0)); // 正脊
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {            // 翘角
    const h = mesh(new THREE.ConeGeometry(0.07 + w * 0.003, 0.42 + w * 0.012, 5), dark);
    h.position.set(sx * (hx + 0.05), 0.14, sz * (hz + 0.05)); h.rotation.set(sz * 0.55, 0, -sx * 0.55); G.add(h);
  }
  if (rx > 0.05) for (const sx of [-1, 1]) { const c = mesh(new THREE.ConeGeometry(0.13, 0.5, 5), dark); c.position.set(sx * (rx + 0.2), rise + 0.3, 0); c.rotation.z = -sx * 0.35; G.add(c); } // 鸱吻
  if (o.pyramid || rx <= 0.05) { // 宝顶
    G.add(at(mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.5, 8), dark), 0, rise + 0.2, 0));
    G.add(at(mesh(new THREE.SphereGeometry(0.22, 10, 8), M(o.knob || '#d8b450')), 0, rise + 0.55, 0));
  }
  return G;
}

// 匾：深底金字
export function plaque(text, w = 2.4, h = 0.7, o = {}) {
  const tex = canvasTex(Math.round(110 * w), Math.round(110 * h), (c, cw, ch) => {
    c.fillStyle = o.bg || '#2a1a10'; c.fillRect(0, 0, cw, ch); c.strokeStyle = o.rim || '#d6b670'; c.lineWidth = 7; c.strokeRect(5, 5, cw - 10, ch - 10);
    c.fillStyle = o.fg || '#ffe7a8'; const fs = Math.min(ch * 0.62, (cw - 24) / Math.max(1, [...text].length) * 0.95);
    c.font = `bold ${fs}px "STKaiti","KaiTi","Noto Serif SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 2);
  }, { pixel: false, repeat: false });
  return mesh(new THREE.PlaneGeometry(w, h), toon('#ffffff', { map: tex }), { cast: false });
}

// 竖匾 / 对联
export function scroll(text, w, h, o = {}) {
  const tex = canvasTex(Math.round(120 * w), Math.round(120 * h), (c, cw, ch) => {
    c.fillStyle = o.bg || '#b8242a'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = o.fg || '#ffe08a'; const ch2 = [...text], step = ch / (ch2.length + 0.6);
    c.font = `bold ${Math.min(cw * 0.8, step * 0.85)}px "STKaiti","KaiTi","Noto Serif SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    ch2.forEach((t, i) => c.fillText(t, cw / 2, step * (i + 0.8)));
  }, { pixel: false, repeat: false });
  return mesh(new THREE.PlaneGeometry(w, h), toon('#ffffff', { map: tex }), { cast: false });
}

// 台基 + 正面台阶
export function podium(w, d, h, color = '#a8a29a', o = {}) {
  const G = new THREE.Group(), m = M(color, { tx: o.tx || TX.stone });
  G.add(mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 0.45).translate(0, h / 2, 0), m, { recv: true }));
  G.add(mesh(new THREE.BoxGeometry(w + 0.16, 0.1, d + 0.16).translate(0, h, 0), M(shade(color, 0.8)), { recv: true }));
  const n = Math.max(1, Math.round(h / 0.22)), sw = o.stairW ?? Math.min(3.2, w * 0.4);
  for (let i = 0; i < n; i++) G.add(mesh(boxUV(new THREE.BoxGeometry(sw, h * (i + 1) / n, 0.42), sw, h * (i + 1) / n, 0.42, 0.45).translate(0, h * (i + 1) / n / 2, d / 2 + 0.21 + (n - 1 - i) * 0.42), m, { recv: true }));
  if (o.rail) for (const sx of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.2, 0.5, d), M(o.rail)), sx * (w / 2 - 0.1), h + 0.25, 0));
  return G;
}

// 殿：o = { w, d, h, wall, col, roof, tiers, sign, base, open(四面开敞=亭/廊) }
export function hall(o) {
  const G = new THREE.Group(), w = o.w, d = o.d, h = o.h ?? 2.8, base = o.base ?? 0.6;
  const wallM = M(o.wall || '#ece2cc', { tx: TX.wall }), colM = M(o.col || '#a83a2a', { tx: TX.wood }), beamM = M(o.beam || shade(o.col || '#a83a2a', 0.65), { tx: TX.wood });
  if (base > 0) G.add(podium(w + 1.6, d + 1.6, base, o.baseC || '#a8a29a', { stairW: o.stairW }));
  const y0 = base;
  if (!o.open) {
    G.add(mesh(boxUV(new THREE.BoxGeometry(w - 0.8, h, d - 0.9), w - 0.8, h, d - 0.9, 0.35).translate(0, y0 + h / 2, -0.25), wallM, { recv: true }));
    // 墙脚一圈石砖裙
    G.add(at(box(w - 0.7, 0.5, d - 0.8, M('#9a958c', { tx: TX.stone }), 0.45), 0, y0 + 0.25, -0.25));
    // 正面：门 + 两边格窗
    const doorW = Math.min(1.8, w * 0.22);
    G.add(at(box(doorW, h * 0.78, 0.1, M(o.door || '#5a2a1a', { tx: TX.wood }), 0.6), 0, y0 + h * 0.39, d / 2 - 0.68));
    const lat = latticeTex(o.lattice || '#7a3a22');
    for (const sx of [-1, 1]) for (let k = 1; k <= Math.floor((w - 0.8 - doorW) / 2 / 1.6); k++) {
      const wn = mesh(new THREE.PlaneGeometry(1.2, h * 0.55), toon('#ffffff', { map: lat }), { cast: false });
      wn.position.set(sx * (doorW / 2 + k * 1.6 - 0.6), y0 + h * 0.55, d / 2 - 0.69); G.add(wn);
    }
  }
  // 檐柱
  const nc = Math.max(2, Math.round(w / 2.2) + 1);
  for (let i = 0; i < nc; i++) {
    const x = -w / 2 + 0.25 + i * (w - 0.5) / (nc - 1);
    for (const z of o.open ? [d / 2 - 0.25, -d / 2 + 0.25] : [d / 2 - 0.25]) G.add(at(col(0.17, 0.2, h, colM), x, y0, z));
  }
  if (o.open) for (const z of [-1, 1]) for (const x of [-1, 1]) G.add(at(col(0.17, 0.2, h, colM), x * (w / 2 - 0.25), y0, z * (d / 2 - 0.25)));
  G.add(at(box(w + 0.1, 0.36, d + 0.1, beamM, 0.6), 0, y0 + h + 0.12, 0)); // 额枋
  const tiers = o.tiers || 1, rc = o.roof || '#3f4552';
  let ry = y0 + h + 0.3;
  const R1 = roof(w + 1.8, d + 1.8, o.rise ?? d * 0.42, rc, { ridge: o.ridge, k: o.k, pyramid: o.pyramid, knob: o.knob });
  if (tiers === 2) { // 重檐：下层一圈短檐，上面再起一层
    const low = roof(w + 1.8, d + 1.8, 0.7, rc, { ridge: o.ridge, k: 0.2 }); low.position.y = ry; G.add(low);
    G.add(at(box(w - 0.6, 1.0, d - 0.6, wallM, 0.35), 0, ry + 0.8, 0));
    const R2 = roof(w + 0.4, d + 0.4, o.rise ?? d * 0.4, rc, { ridge: o.ridge, k: o.k, pyramid: o.pyramid, knob: o.knob }); R2.position.y = ry + 1.25; G.add(R2);
  } else { R1.position.y = ry; G.add(R1); }
  if (o.sign) { const s = plaque(o.sign, Math.min(3.2, w * 0.36), 0.8, o.signC); s.position.set(0, y0 + h - 0.35, d / 2 + 0.02); G.add(s); }
  G.userData.foot = [w + 1.6, d + 1.6];
  return G;
}

export function latticeTex(color) {
  return canvasTex(96, 96, (c, w, h) => {
    c.fillStyle = '#f2e6c8'; c.fillRect(0, 0, w, h); c.strokeStyle = color; c.lineWidth = 5; c.strokeRect(2, 2, w - 4, h - 4);
    c.lineWidth = 3; for (let i = 1; i < 6; i++) { const t = i * w / 6; c.beginPath(); c.moveTo(t, 0); c.lineTo(t, h); c.moveTo(0, t); c.lineTo(w, t); c.stroke(); }
  }, { pixel: false, repeat: false });
}

// 楼阁：levels 层，每层缩一点，层层出檐；o 同 hall
export function tower(o) {
  const G = new THREE.Group(), n = o.levels || 3, base = o.base ?? 0.6;
  if (base > 0) G.add(podium(o.w + 1.4, o.d + 1.4, base, o.baseC || '#a8a29a'));
  let y = base, w = o.w, d = o.d;
  const wallM = M(o.wall || '#ece2cc', { tx: TX.wall }), colM = M(o.col || '#a83a2a', { tx: TX.wood }), lat = latticeTex(o.lattice || '#7a3a22');
  for (let i = 0; i < n; i++) {
    const h = i === 0 ? (o.h ?? 2.6) : (o.h ?? 2.6) * 0.8;
    G.add(at(mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 0.35).translate(0, h / 2, 0), wallM, { recv: true }), 0, y, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(at(col(0.15, 0.17, h, colM, 8), sx * (w / 2 + 0.05), y, sz * (d / 2 + 0.05)));
    for (const [rx, rz, ry] of [[0, d / 2 + 0.01, 0], [0, -d / 2 - 0.01, Math.PI], [w / 2 + 0.01, 0, Math.PI / 2], [-w / 2 - 0.01, 0, -Math.PI / 2]]) {
      const len = Math.abs(ry) === Math.PI / 2 ? d : w;
      const wn = mesh(new THREE.PlaneGeometry(Math.min(2.2, len * 0.6), h * 0.5), toon('#ffffff', { map: lat }), { cast: false });
      wn.position.set(rx, y + h * 0.55, rz); wn.rotation.y = ry; G.add(wn);
    }
    if (i === 0 && o.door !== false) G.add(at(box(1.2, h * 0.75, 0.08, M('#5a2a1a', { tx: TX.wood }), 0.6), 0, y + h * 0.375, d / 2 + 0.03));
    y += h;
    const last = i === n - 1;
    const R = roof(w + 1.6, d + 1.6, last ? (o.rise ?? Math.max(w, d) * 0.45) : 0.6, o.roof || '#3f4552', { ridge: o.ridge, k: last ? (o.k ?? 1) : 0.15, pyramid: last && (o.k ?? 1) >= 0.99, knob: o.knob });
    R.position.y = y + 0.1; G.add(R);
    if (!last) { // 平座栏杆
      G.add(at(box(w + 0.6, 0.3, d + 0.6, M(shade(o.col || '#a83a2a', 0.7), { tx: TX.wood }), 0.6), 0, y + 0.75, 0));
      y += 0.85; w *= o.shrink ?? 0.86; d *= o.shrink ?? 0.86;
    }
  }
  if (o.sign) { const s = plaque(o.sign, Math.min(2.6, o.w * 0.55), 0.7, o.signC); s.position.set(0, base + (o.h ?? 2.6) - 0.35, o.d / 2 + 0.05); G.add(s); }
  G.userData.top = y; G.userData.foot = [o.w + 1.4, o.d + 1.4];
  return G;
}

// 塔：八角 / 四角密檐塔
export function pagoda(o) {
  const G = new THREE.Group(), n = o.levels || 5, seg = o.seg || 8;
  let r = o.r || 2.2, y = 0;
  const bodyM = M(o.body || '#d8c8a8', { tx: o.bodyTx || TX.stone }), roofM = M(o.roof || '#5a4a3a', { tx: TX.roof }), trim = M(o.trim || shade(o.roof || '#5a4a3a', 0.7));
  G.add(mesh(new THREE.CylinderGeometry(r + 0.7, r + 0.9, 0.7, seg).translate(0, 0.35, 0), M(o.baseC || '#a8a29a'), { recv: true }));
  y = 0.7;
  for (let i = 0; i < n; i++) {
    const h = i === 0 ? (o.h0 || 2.4) : (o.h || 1.5);
    G.add(at(mesh(new THREE.CylinderGeometry(r, r * 1.02, h, seg).translate(0, h / 2, 0), bodyM, { recv: true }), 0, y, 0));
    if (o.windows !== false) for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / seg, wn = mesh(new THREE.BoxGeometry(0.5, h * 0.45, 0.1), M(o.win || '#3a2a20'));
      wn.position.set(Math.sin(a) * r * 0.97, y + h * 0.55, Math.cos(a) * r * 0.97); wn.rotation.y = a; G.add(wn);
    }
    y += h;
    G.add(at(mesh(new THREE.CylinderGeometry(r + 0.5, r + 0.85, 0.35, seg).translate(0, 0.17, 0), roofM), 0, y, 0));
    G.add(at(mesh(new THREE.CylinderGeometry(r * 0.9, r + 0.5, 0.25, seg).translate(0, 0.47, 0), trim), 0, y, 0));
    for (let k = 0; k < seg; k++) { const a = k * Math.PI * 2 / seg, h2 = mesh(new THREE.ConeGeometry(0.08, 0.45, 4), trim); h2.position.set(Math.sin(a) * (r + 0.9), y + 0.3, Math.cos(a) * (r + 0.9)); h2.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); G.add(h2); }
    y += 0.55; r *= o.shrink || 0.84;
  }
  G.add(at(mesh(new THREE.ConeGeometry(r + 0.3, 1.2, seg).translate(0, 0.6, 0), roofM), 0, y, 0));
  G.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6).translate(0, 1.1, 0), M('#c8a24a')), 0, y + 0.9, 0));
  for (let k = 0; k < 4; k++) G.add(at(mesh(new THREE.TorusGeometry(0.28 - k * 0.04, 0.05, 6, 12).rotateX(Math.PI / 2), M('#d8b450')), 0, y + 1.5 + k * 0.32, 0));
  G.userData.top = y + 3.1;
  return G;
}

// 牌坊：三间四柱（o.bays=1 就是两柱）
export function paifang(name, o = {}) {
  const G = new THREE.Group(), w = o.w || 7, h = o.h || 4.6, bays = o.bays || 3;
  const colM = M(o.col || '#a83a2a', { tx: TX.wood }), beam = M(o.beam || shade(o.col || '#a83a2a', 0.7), { tx: TX.wood });
  const xs = bays === 3 ? [-w / 2, -w / 6, w / 6, w / 2] : [-w / 2, w / 2];
  xs.forEach((x, i) => {
    const hh = bays === 3 && (i === 0 || i === 3) ? h * 0.78 : h;
    G.add(at(col(0.22, 0.26, hh, colM), x, 0, 0));
    G.add(at(box(0.75, 0.7, 0.75, M(o.stone || '#a8a29a', { tx: TX.stone }), 0.45), x, 0.35, 0)); // 夹杆石
  });
  G.add(at(box(w + 0.6, 0.4, 0.45, beam, 0.6), 0, h - 0.2, 0));
  G.add(at(box((bays === 3 ? w / 3 : w) + 0.2, 0.3, 0.4, beam, 0.6), 0, h - 1.25, 0));
  const R = roof(bays === 3 ? w / 3 + 1.4 : w + 1.4, 1.5, 0.75, o.roof || '#3f4552', { ridge: o.ridge, k: 0.3 }); R.position.y = h; G.add(R);
  if (bays === 3) for (const sx of [-1, 1]) { const r2 = roof(w / 3 + 0.8, 1.3, 0.6, o.roof || '#3f4552', { ridge: o.ridge, k: 0.3 }); r2.position.set(sx * w / 3, h * 0.78, 0); G.add(r2); G.add(at(mesh(new THREE.BoxGeometry(w / 3, 0.3, 0.4), beam), sx * w / 3, h * 0.78 - 0.15, 0)); }
  const p = plaque(name, Math.min(2.8, (bays === 3 ? w / 3 : w) * 0.9), 0.72, o.signC); p.position.set(0, h - 0.72, 0.24); G.add(p);
  const p2 = p.clone(); p2.position.z = -0.24; p2.rotation.y = Math.PI; G.add(p2);
  G.userData.cols = xs;
  return G;
}

// 院墙一段：沿 x，长 len
export function wallSeg(len, o = {}) {
  const G = new THREE.Group(), h = o.h || 2.2, t = o.t || 0.5;
  G.add(mesh(boxUV(new THREE.BoxGeometry(len, 0.6, t + 0.2), len, 0.6, t + 0.2, 0.45).translate(0, 0.3, 0), M(o.base || '#9c978f', { tx: TX.stone }), { recv: true }));
  G.add(mesh(boxUV(new THREE.BoxGeometry(len, h - 0.5, t), len, h - 0.5, t, 0.35).translate(0, 0.5 + (h - 0.5) / 2, 0), M(o.wall || '#ece5d3', { tx: TX.wall }), { recv: true }));
  const cap = M(o.cap || '#3f4552', { tx: TX.roof });
  for (const s of [-1, 1]) { const sl = mesh(new THREE.BoxGeometry(len + 0.2, 0.1, t * 0.9).rotateX(s * 0.5), cap); sl.position.set(0, h + 0.1, -s * t * 0.3); G.add(sl); }
  G.add(at(mesh(new THREE.BoxGeometry(len + 0.2, 0.12, 0.14), cap), 0, h + 0.25, 0));
  return G;
}

// 幡：竖杆 + 布条（会被 update 里的风吹动：userData.cloth）
export function banner(color, text, o = {}) {
  const G = new THREE.Group(), h = o.h || 4.5;
  G.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 6).translate(0, h / 2, 0), M(o.pole || '#4a3424')));
  G.add(at(mesh(new THREE.SphereGeometry(0.12, 8, 6), M('#d8b450')), 0, h + 0.05, 0));
  G.add(at(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), M(o.pole || '#4a3424')), 0.45, h - 0.15, 0));
  const tex = text ? canvasTex(64, 256, (c, w, hh) => {
    c.fillStyle = color; c.fillRect(0, 0, w, hh); c.fillStyle = o.fg || '#fff2c0';
    const ch = [...text], step = hh / (ch.length + 0.5); c.font = `bold ${Math.min(46, step * 0.8)}px "STKaiti","KaiTi","Noto Serif SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    ch.forEach((t, i) => c.fillText(t, w / 2, step * (i + 0.75)));
  }, { pixel: false, repeat: false }) : null;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, o.len || 2.6, 1, 6).translate(0.45, -(o.len || 2.6) / 2, 0), toon(text ? '#ffffff' : color, { map: tex, unique: true }));
  cloth.material.side = THREE.DoubleSide;
  cloth.position.set(0, h - 0.2, 0); cloth.castShadow = true; G.add(cloth); G.userData.cloth = cloth;
  return G;
}

// 石灯 / 火盆 / 香炉这些小件
export function brazier(color = '#ff7a2a') {
  const G = new THREE.Group();
  G.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 6).translate(0, 0.5, 0), M('#3a3438')));
  G.add(at(mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.35, 8).translate(0, 0.17, 0), M('#4a4048')), 0, 1.0, 0));
  const f = mesh(new THREE.ConeGeometry(0.32, 0.8, 7).translate(0, 0.4, 0), glow(color, 3, true), { cast: false });
  f.position.y = 1.2; G.add(f); G.userData.flame = f;
  return G;
}
export function cauldron(r, color = '#6a5a3a', o = {}) {
  const G = new THREE.Group(), m = M(color, { metal: true });
  G.add(mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65).translate(0, r * 1.05, 0), m));
  G.add(at(mesh(new THREE.TorusGeometry(r * 0.82, r * 0.08, 8, 20).rotateX(Math.PI / 2), M(shade(color, 1.3))), 0, r * 1.05 + r * 0.82 * 0.6, 0));
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.TorusGeometry(r * 0.25, r * 0.06, 6, 12, Math.PI), m), s * r * 0.7, r * 1.95, 0)); // 鼎耳
  for (let k = 0; k < (o.legs || 3); k++) { const a = k * Math.PI * 2 / (o.legs || 3); G.add(at(mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.14, r * 0.7, 6).translate(0, r * 0.35, 0), m), Math.sin(a) * r * 0.6, 0, Math.cos(a) * r * 0.6)); }
  const fire = mesh(new THREE.ConeGeometry(r * 0.55, r * 0.6, 8).translate(0, r * 0.3, 0), glow(o.fire || '#ff7a2a', 3, true), { cast: false }); G.add(fire); G.userData.fire = fire;
  const top = mesh(new THREE.CircleGeometry(r * 0.78, 18).rotateX(-Math.PI / 2), glow(o.brew || '#ffb050', 1.6, true), { cast: false }); top.position.y = r * 1.5; G.add(top);
  G.userData.top = r * 1.6;
  return G;
}

// 石狮（Q 版）：须弥座 + 蹲坐的身子 + 大脑袋 + 卷鬃；side=-1 是母狮（爪下幼狮），1 是公狮（爪下绣球）
export function lion(side = 1, color = '#b8b2a6') {
  const G = new THREE.Group(), m = M(color), d = M(shade(color, 0.72));
  G.add(mesh(new THREE.BoxGeometry(1.1, 0.7, 1.4).translate(0, 0.35, 0), d, { recv: true }));
  G.add(mesh(new THREE.BoxGeometry(1.25, 0.12, 1.55).translate(0, 0.76, 0), m));
  G.add(at(mesh(new THREE.SphereGeometry(0.42, 12, 10).scale(1, 1.15, 1.25), m), 0, 1.25, -0.15));          // 身
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.6, 8), m), s * 0.22, 1.05, 0.3)); // 前腿
  G.add(at(mesh(new THREE.SphereGeometry(0.42, 12, 10), m), 0, 1.9, 0.12));                                    // 头
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; G.add(at(mesh(new THREE.SphereGeometry(0.16, 8, 6), d), Math.cos(a) * 0.4, 1.95 + Math.sin(a) * 0.4, -0.05)); } // 鬃
  G.add(at(mesh(new THREE.SphereGeometry(0.17, 10, 8).scale(1.2, 0.8, 1), m), 0, 1.78, 0.5));                 // 鼻吻
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.SphereGeometry(0.07, 8, 6), M('#2a2420')), s * 0.16, 2.0, 0.48)); // 眼
  const toy = side > 0 ? mesh(new THREE.SphereGeometry(0.2, 10, 8), M('#c8a24a')) : mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.8, 1.2), m);
  toy.position.set(side * 0.3, 0.98, 0.45); G.add(toy);
  return G;
}
