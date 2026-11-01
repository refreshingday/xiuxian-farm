import * as THREE from 'three';
import { toon, flat } from './util.js';

// 连招特效：每招独立的刀光、地裂、落雷、残影……与 combo.js 一起搬进主游戏

const glowMat = (c, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// 软边几何：顶点色当亮度遮罩（加法混合下黑 = 透明），两头收尖、边缘渐隐，不再一条条硬线
const taper = (u) => Math.sin(Math.PI * u) ** 0.7;
function grid(R, K, fn) { // (R+1) 行 × K 列，fn(u 0..1, j) → [x, y, z, 亮度]
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= R; i++) for (let j = 0; j < K; j++) { const [x, y, z, c] = fn(i / R, j); pos.push(x, y, z); col.push(c, c, c); }
  for (let i = 0; i < R; i++) for (let j = 0; j < K - 1; j++) { const a = i * K + j, b = a + K; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
// 月牙：外缘 r1 不动，内缘随 taper 收拢，两端成尖。fill = 宽刀光（外亮内透），否则 = 刃线（中间亮两侧透）
const crescent = (r0, r1, a, fill) => grid(40, 3, (u, j) => {
  const w = taper(u), th = -a + 2 * a * u, r = r1 - (r1 - r0) * w * [0, 0.5, 1][j];
  return [r * Math.cos(th), r * Math.sin(th), 0, w * (fill ? [0.8, 0.4, 0][j] : [0.15, 1, 0.15][j])];
}).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
const TAU = Math.PI * 2;
// 金钟轮廓：[高度 0..1, 半径]，钟口外翻
const BELL = [[0, 1.25], [0.12, 1.05], [0.5, 0.9], [0.8, 0.78], [0.93, 0.5], [1, 0.05]];
const bellR = (u) => { let i = 0; while (u > BELL[i + 1][0]) i++; const [a, ra] = BELL[i], [b, rb] = BELL[i + 1]; return ra + (rb - ra) * (u - a) / (b - a); };

// ---- 符纸 / 法阵贴图：画在 canvas 上，按字缓存 ----
const INK = '#c0281a', FONT = '"KaiTi","STKaiti","Kaiti SC","BiauKai","SimSun","Songti SC",serif';
const texCache = new Map();
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// 黄纸朱砂：边框 + 竖写的字 + 底下一笔符尾
function paperMat(glyph) {
  if (texCache.has(glyph)) return texCache.get(glyph);
  const map = canvasTex(64, 112, (x) => {
    const gr = x.createLinearGradient(0, 0, 0, 112); gr.addColorStop(0, '#fbe592'); gr.addColorStop(1, '#eac35a');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 112);
    x.strokeStyle = INK; x.fillStyle = INK; x.lineWidth = 2.5; x.strokeRect(3, 3, 58, 106); x.lineWidth = 1; x.strokeRect(7, 7, 50, 98);
    x.beginPath(); x.arc(32, 15, 4, 0, TAU); x.fill();
    const n = glyph.length, sz = n > 1 ? 26 : 34;
    x.font = `bold ${sz}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    [...glyph].forEach((ch, i) => x.fillText(ch, 32, n > 1 ? 38 + i * 28 : 50));
    x.lineWidth = 2.2; x.beginPath(); x.moveTo(32, 80); x.bezierCurveTo(16, 86, 48, 92, 30, 98); x.bezierCurveTo(22, 102, 40, 104, 32, 106); x.stroke();
  });
  const m = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) });
  texCache.set(glyph, m);
  return m;
}
// 法阵：两圈外环 + 刻度 + 八卦爻 + 八角星 + 太极点，白色画，材质再上色
const GUA = [7, 6, 5, 4, 3, 2, 1, 0];
let sigilMap = null;
const sigilTex = () => (sigilMap ??= canvasTex(256, 256, (x) => {
  x.translate(128, 128); x.strokeStyle = x.fillStyle = '#fff';
  const circ = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); };
  circ(122, 4); circ(110, 2); circ(80, 2.5); circ(36, 3);
  for (let i = 0; i < 48; i++) { x.save(); x.rotate(i / 48 * TAU); x.fillRect(-1, -120, 2, i % 6 ? 6 : 10); x.restore(); }
  GUA.forEach((bits, i) => {
    x.save(); x.rotate(i / 8 * TAU);
    for (let b = 0; b < 3; b++) { const y = -102 + b * 8; if (bits >> b & 1) x.fillRect(-12, y, 24, 4.5); else { x.fillRect(-12, y, 10, 4.5); x.fillRect(2, y, 10, 4.5); } }
    x.restore();
  });
  x.lineWidth = 2;
  for (const off of [0, Math.PI / 4]) { x.beginPath(); for (let i = 0; i <= 4; i++) { const a = off + i / 4 * TAU; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 78, Math.sin(a) * 78); } x.stroke(); }
  x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill();
}));

export class ComboFX {
  // soft: 软边版刀光/光束/光圈（先在试炼场试，主游戏仍用旧版）
  constructor(scene, fx, { soft = false } = {}) {
    this.scene = scene; this.fx = fx; this.list = []; this.soft = soft;
    const arc = (r0, r1, a) => new THREE.RingGeometry(r0, r1, 28, 1, -a, a * 2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
    this.G = {
      arcWide: arc(0.7, 2.7, 1.05),
      arcEdge: arc(2.45, 2.75, 1.1),
      disc: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      strip: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      pillar: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
      shard: flat(new THREE.ConeGeometry(0.3, 1.3, 5)).translate(0, 0.65, 0),
      vring: new THREE.RingGeometry(0.82, 1, 40),
      dome: new THREE.SphereGeometry(1, 24, 8, 0, TAU, 0, Math.PI / 2),
      bell: new THREE.LatheGeometry(BELL.map(([u, r]) => new THREE.Vector2(r, u * 2.3)), 24),
      fist: new THREE.SphereGeometry(0.3, 14, 10).scale(1, 0.85, 1.3),
      paper: new THREE.PlaneGeometry(0.3, 0.52),
      sigil: new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    };
    this.S = {
      arcWide: crescent(0.7, 2.7, 1.1, true),
      arcEdge: crescent(2.4, 2.75, 1.15, false),
      // 中心亮、外圈淡出
      disc: grid(2, 33, (u, j) => { const r = [0, 0.55, 1][Math.round(u * 2)], a = j / 32 * Math.PI * 2; return [r * Math.cos(a), 0, r * Math.sin(a), r < 1 ? 1 : 0]; }),
      // 菱形光带：两头尖，中线亮两侧透
      strip: grid(16, 3, (v, j) => { const w = taper(v); return [(j - 1) * 0.5 * w, 0, v, j === 1 ? w ** 0.5 : 0]; }),
      // 光柱：底亮顶透
      pillar: grid(1, 25, (u, j) => { const a = j / 24 * Math.PI * 2; return [Math.cos(a), u, Math.sin(a), (1 - u) ** 1.5]; }),
      // 竖环（XY 平面，朝 +z）：环中线亮、内外淡出
      vring: grid(2, 41, (u, j) => { const r = 0.8 + 0.2 * u, a = j / 40 * TAU; return [r * Math.cos(a), r * Math.sin(a), 0, u === 0.5 ? 1 : 0]; }),
      // 半球壳：贴地处亮、顶上透
      dome: grid(8, 25, (u, j) => { const la = u * Math.PI / 2, a = j / 24 * TAU; return [Math.cos(la) * Math.cos(a), Math.sin(la), Math.cos(la) * Math.sin(a), (1 - u) ** 1.5]; }),
      bell: grid(12, 25, (u, j) => { const r = bellR(u), a = j / 24 * TAU; return [r * Math.cos(a), u * 2.3, r * Math.sin(a), 0.3 + 0.7 * (1 - u) ** 2]; }),
    };
    // 冲击星（八长八短的尖角）、柔光团：只有软边版，材质固定读顶点色
    const SPK = [1, 0.62, 0.9, 0.55, 1.05, 0.7, 0.85, 0.5];
    this.starGeo = grid(1, 33, (u, j) => { if (!u) return [0, 0, 0, 1]; const a = j / 32 * TAU, r = j % 2 ? 0.28 : SPK[(j / 2) % 8]; return [r * Math.cos(a), r * Math.sin(a), 0, j % 2 ? 0 : 0.35]; });
    this.puffGeo = grid(1, 33, (u, j) => { const a = j / 32 * TAU; return [u * Math.cos(a), u * Math.sin(a), 0, 1 - u]; });
    this.rock = toon('#8a7a68');
    this.light = new THREE.PointLight(0xffffff, 0, 16, 1.5); scene.add(this.light);
    this.lightT = 0; this.lightDur = 1; this.lightI = 0;
  }

  // 当前用哪套几何/材质（soft 时材质读顶点色当遮罩）
  geo(n) { return (this.soft && this.S[n]) || this.G[n]; }
  mat(c, k) { const m = glowMat(c, k); m.vertexColors = this.soft; return m; }

  // delay 秒后才出现；fn(k 0..1, dt) 每帧更新；结束时回收材质/几何体
  spawn(obj, dur, fn, { mats = [], geos = [], delay = 0 } = {}) {
    obj.visible = delay <= 0;
    this.scene.add(obj);
    this.list.push({ obj, t: -delay, dur, fn, mats, geos });
    return obj;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i]; e.t += dt;
      if (e.t < 0) continue;
      e.obj.visible = true;
      const k = Math.min(1, e.t / e.dur);
      e.fn?.(k, dt);
      if (k >= 1) { this.scene.remove(e.obj); e.mats.forEach((m) => m.dispose()); e.geos.forEach((g) => g.dispose()); this.list.splice(i, 1); }
    }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = this.lightI * Math.max(0, this.lightT / this.lightDur) ** 2; }
  }

  flash(x, z, color, intensity = 40, dur = 0.25, y = 1.5) {
    this.light.position.set(x, y, z); this.light.color.set(color);
    this.lightI = intensity; this.lightT = this.lightDur = dur; this.light.intensity = intensity;
  }

  // 刀光：外层彩色宽弧 + 白色刃线，在倾斜平面内扫过。tilt<0 右高左低，>0 左高右低，-π/2 竖劈
  arc(p, yaw, color, o = {}) {
    const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner);
    outer.position.set(p.x, o.y ?? 1.05, p.z); outer.rotation.order = 'YXZ'; outer.rotation.set(0, yaw, o.tilt ?? 0);
    const s = o.scale ?? 1;
    outer.scale.set(o.flip ? -s : s, s, s);
    const m1 = this.mat(color), m2 = this.mat('#ffffff', 2);
    inner.add(new THREE.Mesh(this.geo('arcWide'), m1), new THREE.Mesh(this.geo('arcEdge'), m2));
    const sweep = o.sweep ?? 0.8, op = o.opacity ?? 0.5;
    return this.spawn(outer, o.dur ?? 0.22, (k) => {
      const e = easeOut(Math.min(1, k * 2.2));
      inner.rotation.y = -sweep * 0.75 + sweep * e;
      m1.opacity = op * (1 - k); m2.opacity = 0.8 * (1 - k);
      const sc = 0.88 + 0.18 * e; inner.scale.set(sc, 1, sc);
    }, { mats: [m1, m2], delay: o.delay });
  }

  // 突刺光束
  stab(p, yaw, color, lateral = 0, y = 1.1, len = 3.2) {
    const g = new THREE.Group();
    g.position.set(p.x + Math.cos(yaw) * lateral, y, p.z - Math.sin(yaw) * lateral); g.rotation.y = yaw;
    const m1 = this.mat(color), m2 = this.mat('#ffffff', 2);
    const a = new THREE.Mesh(this.geo('strip'), m1), b = new THREE.Mesh(this.geo('strip'), m2);
    a.position.z = b.position.z = 0.4; g.add(a, b);
    return this.spawn(g, 0.16, (k) => {
      const e = easeOut(Math.min(1, k * 3));
      a.scale.set(0.3 * (1 - k), 1, len * e); b.scale.set(0.08 * (1 - k), 1, len * e * 1.05);
      m1.opacity = 0.8 * (1 - k); m2.opacity = 1 - k;
    }, { mats: [m1, m2] });
  }

  // 两道交叉小刀光（突刺命中目标）
  xslash(p, color, delay = 0) {
    const yaw = Math.random() * Math.PI;
    this.arc(p, yaw, color, { tilt: 0.9, scale: 0.5, y: 1.2, dur: 0.18, delay });
    this.arc(p, yaw, color, { tilt: -0.9, scale: 0.5, y: 1.2, dur: 0.18, flip: true, delay: delay + 0.05 });
  }

  disc(x, z, r, color, dur = 0.25, op = 0.4) {
    const m = this.mat(color), d = new THREE.Mesh(this.geo('disc'), m); d.position.set(x, 0.07, z);
    return this.spawn(d, dur, (k) => { d.scale.setScalar(r * (0.6 + 0.4 * easeOut(k))); m.opacity = op * (1 - k); }, { mats: [m] });
  }

  // 地面焦痕（普通混合，慢慢淡出）
  scorch(x, z, r, dur = 1.6) {
    const m = new THREE.MeshBasicMaterial({ color: '#1e1610', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = new THREE.Mesh(this.G.disc, m); d.position.set(x, 0.03, z); d.scale.setScalar(r);
    return this.spawn(d, dur, (k) => { m.opacity = 0.5 * (1 - k * k); }, { mats: [m] });
  }

  pillar(x, z, r, h, color, dur = 0.4) {
    const m = this.mat(color), p = new THREE.Mesh(this.geo('pillar'), m); p.position.set(x, 0, z);
    return this.spawn(p, dur, (k) => { const e = easeOut(Math.min(1, k * 3)); p.scale.set(r * (1 - k * 0.7), h * e, r * (1 - k * 0.7)); m.opacity = 0.6 * (1 - k); }, { mats: [m] });
  }

  // 天降落雷：折线管
  bolt(x, z, color, h = 12) {
    return this.zap(new THREE.Vector3(x + rand(-1.5, 1.5), h, z + rand(-1.5, 1.5)), new THREE.Vector3(x, 0, z), color);
  }
  // 两点间的电弧（落雷、雷符连锁）
  zap(a, b, color, j = 0.5, r = 0.18) {
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const p = a.clone().lerp(b, i / 9);
      if (i && i < 9) p.add(new THREE.Vector3(rand(-j, j), rand(-j, j) * 0.6, rand(-j, j)));
      pts.push(p);
    }
    return this.tube(pts, color, r);
  }
  tube(pts, color, r) {
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const g1 = new THREE.TubeGeometry(path, 36, r, 5), g2 = new THREE.TubeGeometry(path, 36, r / 3, 5);
    const m1 = glowMat(color, 3), m2 = glowMat('#ffffff', 3);
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(g1, m1), new THREE.Mesh(g2, m2));
    return this.spawn(grp, 0.3, (k) => { const f = (1 - k) * (0.6 + Math.random() * 0.4); m1.opacity = f * 0.8; m2.opacity = f; }, { mats: [m1, m2], geos: [g1, g2] });
  }

  // 地刺：从地下顶出再沉回去
  shards(x, z, n, r, delay = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const s = new THREE.Mesh(this.G.shard, this.rock); s.castShadow = true;
      s.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      s.rotation.set(Math.sin(a) * 0.4 * d / r, rand(0, 3), -Math.cos(a) * 0.4 * d / r);
      const sc = rand(0.6, 1.2); g.add(s); list.push({ s, sc });
    }
    return this.spawn(g, 0.9, (k) => {
      const up = k < 0.15 ? easeOut(k / 0.15) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      for (const { s, sc } of list) s.scale.set(sc, sc * up, sc);
    }, { delay });
  }

  // 地面光缝
  crack(x0, z0, x1, z1, color, w = 0.35, dur = 0.9) {
    const m = this.mat(color, 2.8), s = new THREE.Mesh(this.geo('strip'), m);
    const len = Math.hypot(x1 - x0, z1 - z0); s.position.set(x0, 0.06, z0); s.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    return this.spawn(s, dur, (k) => { s.scale.set(w * (1 - k * 0.6), 1, len * easeOut(Math.min(1, k * 5))); m.opacity = 0.9 * (1 - k); }, { mats: [m] });
  }

  // 残影：克隆角色，换成半透明发光材质
  ghost(root, color, dur = 0.3) {
    const c = root.clone(true), m = glowMat(color, 1.4);
    c.traverse((o) => { if (o.isMesh) { if (o.userData.isLine) o.visible = false; else { o.material = m; o.castShadow = false; } } });
    return this.spawn(c, dur, (k) => { m.opacity = 0.45 * (1 - k); }, { mats: [m] });
  }

  // 回旋剑舞：三道刀光绕身旋转，跟随角色
  // getY：可选，返回离地高度（空中回旋用）
  whirl(getPos, color, dur, getY) {
    const g = new THREE.Group(), mats = [];
    for (let i = 0; i < 3; i++) {
      const m = this.mat(i ? color : '#ffffff', 2); mats.push(m);
      const a = new THREE.Mesh(i ? this.geo('arcWide') : this.geo('arcEdge'), m); a.rotation.y = i * Math.PI * 2 / 3; g.add(a);
    }
    return this.spawn(g, dur, (k, dt) => {
      const p = getPos(); g.position.set(p.x, 0.9 + (getY?.() ?? 0) + Math.sin(k * 20) * 0.08, p.z);
      g.rotation.y += dt * 22;
      const f = Math.min(1, k * 6) * (1 - Math.max(0, k - 0.75) / 0.25);
      mats.forEach((m, i) => { m.opacity = (i ? 0.5 : 0.9) * f; });
    }, { mats });
  }

  // ======== 拳：气环、拳影、冲击星、速度线、地裂、气浪、金钟 ========
  // p.y = 离地高度（空中出拳）。右手方向 = (-cos yaw, sin yaw)

  // 拳劲气环：竖着的圆环，朝出拳方向一边撑开一边往前推。pitch = -π/2 朝上（勾拳），flat = 贴地横着扩（砸地）
  airRing(p, yaw, color, o = {}) {
    const g = new THREE.Group(), m1 = this.mat(color, 1.7), m2 = this.mat('#ffffff', 1.5);
    const a = new THREE.Mesh(this.geo('vring'), m1), b = new THREE.Mesh(this.geo('vring'), m2); b.scale.setScalar(0.9);
    g.add(a, b); g.rotation.order = 'YXZ'; g.rotation.set(o.flat ? -Math.PI / 2 : o.pitch ?? 0, yaw, 0);
    const dir = new THREE.Vector3(0, 0, 1).applyEuler(g.rotation), y0 = (p.y ?? 0) + (o.y ?? 1.05);
    const r0 = o.r0 ?? 0.3, r1 = o.r1 ?? 1.2, go = o.travel ?? 0.8;
    return this.spawn(g, o.dur ?? 0.2, (k) => {
      const e = easeOut(k);
      g.position.set(p.x + dir.x * go * e, y0 + dir.y * go * e, p.z + dir.z * go * e);
      g.scale.setScalar(r0 + (r1 - r0) * e);
      m1.opacity = (o.op ?? 0.8) * (1 - k); m2.opacity = 0.55 * (o.op ?? 0.8) * (1 - k) ** 2;
    }, { mats: [m1, m2], delay: o.delay });
  }

  // 拳影：一团发光的拳头带着尾迹从手边打出去。side = 往右手边偏多少米，rise = 往上打多高（勾拳）
  fistShadow(p, yaw, color, o = {}) {
    const g = new THREE.Group(), m1 = glowMat(color, 1.6), m2 = glowMat('#ffffff', 1.4), m3 = this.mat(color, 1.8);
    const a = new THREE.Mesh(this.G.fist, m1), b = new THREE.Mesh(this.G.fist, m2), tr = new THREE.Mesh(this.geo('strip'), m3);
    b.scale.setScalar(0.55); tr.rotation.y = Math.PI; g.add(a, b, tr);
    const fx0 = Math.sin(yaw), fz0 = Math.cos(yaw), sd = o.side ?? 0, len = o.len ?? 1.4, s = o.size ?? 1, rise = o.rise ?? 0;
    const x0 = p.x + fx0 * 0.5 - Math.cos(yaw) * sd, z0 = p.z + fz0 * 0.5 + Math.sin(yaw) * sd, y0 = (p.y ?? 0) + (o.y ?? 1.05);
    g.rotation.order = 'YXZ'; g.rotation.set(-Math.atan2(rise, len), yaw, 0);
    return this.spawn(g, o.dur ?? 0.16, (k) => {
      const e = easeOut(Math.min(1, k * 1.6));
      g.position.set(x0 + fx0 * len * e, y0 + rise * e, z0 + fz0 * len * e);
      g.scale.setScalar(s * (0.6 + 0.6 * e));
      tr.scale.set(0.5, 1, Math.hypot(len, rise) * e / s / (0.6 + 0.6 * e) + 0.01);
      m1.opacity = 0.55 * (1 - k); m2.opacity = 0.5 * (1 - k); m3.opacity = 0.6 * (1 - k);
    }, { mats: [m1, m2, m3], delay: o.delay });
  }

  // 冲击星：正对镜头的尖角爆闪（打中那一下）。往镜头方向提一点，不被木桩挡住
  star(p, color, o = {}) {
    const g = new THREE.Group(), m1 = glowMat(color, 1.8), m2 = glowMat('#ffffff', 1.4);
    m1.vertexColors = m2.vertexColors = true;
    const a = new THREE.Mesh(this.starGeo, m1), b = new THREE.Mesh(this.starGeo, m2);
    a.rotation.z = rand(0, TAU); b.rotation.z = a.rotation.z + 0.4; b.scale.setScalar(0.5); g.add(a, b);
    const v = new THREE.Vector3(); this.fx.camera.getWorldDirection(v);
    g.position.set(p.x, (p.y ?? 0) + (o.y ?? 1.1), p.z).addScaledVector(v, -0.8);
    const s = o.size ?? 1;
    return this.spawn(g, o.dur ?? 0.15, (k) => {
      g.quaternion.copy(this.fx.camera.quaternion);
      g.scale.setScalar(s * (0.4 + 0.9 * easeOut(Math.min(1, k * 3))));
      m1.opacity = 0.85 * (1 - k); m2.opacity = 0.6 * (1 - k) ** 2;
    }, { mats: [m1, m2], delay: o.delay });
  }

  // 速度线：顺着出拳方向一闪而过的细线；up = 竖着往上（勾拳）
  streaks(p, yaw, color, o = {}) {
    const g = new THREE.Group(), m = this.mat(color, 2.2), list = [];
    g.position.set(p.x, p.y ?? 0, p.z); g.rotation.y = yaw;
    for (let i = 0; i < (o.n ?? 6); i++) {
      const s = new THREE.Mesh(this.geo('strip'), m), z0 = rand(0.2, 1);
      if (o.up) { s.rotation.x = -Math.PI / 2; s.position.set(rand(-0.7, 0.7), z0, rand(0.6, 1.4)); } else s.position.set(rand(-0.7, 0.7), (o.y ?? 1.05) + rand(-0.45, 0.45), z0);
      g.add(s); list.push({ s, z0, len: rand(1, 2) * (o.len ?? 1) });
    }
    return this.spawn(g, o.dur ?? 0.18, (k) => {
      const e = easeOut(k);
      for (const { s, z0, len } of list) { s.position[o.up ? 'y' : 'z'] = z0 + 1.6 * e; s.scale.set(0.06, 1, len * (1 - k * 0.5)); }
      m.opacity = 0.75 * (1 - k);
    }, { mats: [m], delay: o.delay });
  }

  // 地裂：深色蛛网裂缝（慢慢淡去）+ 一闪的拳劲光
  dent(x, z, r, color, o = {}) {
    const pos = [], idx = [], n = o.n ?? 8;
    for (let i = 0; i < n; i++) {
      let a = i / n * TAU + rand(-0.25, 0.25), px = Math.cos(a) * r * 0.12, pz = Math.sin(a) * r * 0.12;
      const L = r * rand(0.6, 1.05) / 4;
      for (let s = 0; s < 4; s++) {
        a += rand(-0.4, 0.4);
        const nx = px + Math.cos(a) * L, nz = pz + Math.sin(a) * L, w = 0.1 * (1 - s / 4) + 0.025, ox = -Math.sin(a) * w / 2, oz = Math.cos(a) * w / 2, b = pos.length / 3;
        pos.push(px + ox, 0, pz + oz, px - ox, 0, pz - oz, nx + ox, 0, nz + oz, nx - ox, 0, nz - oz);
        idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
        px = nx; pz = nz;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m1 = new THREE.MeshBasicMaterial({ color: '#2a1d12', transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const m2 = glowMat(color, 2.5), g = new THREE.Group(), a = new THREE.Mesh(geo, m1), b = new THREE.Mesh(geo, m2);
    a.position.y = 0.035; b.position.y = 0.05; g.add(a, b); g.position.set(x, 0, z); g.rotation.y = rand(0, TAU);
    return this.spawn(g, o.dur ?? 1.4, (k) => { m1.opacity = 0.75 * (1 - k ** 3); m2.opacity = 0.9 * Math.max(0, 1 - k * 5); }, { mats: [m1, m2], geos: [geo], delay: o.delay });
  }

  // 气浪：贴地的半球壳一下撑开
  dome(x, z, r, color, o = {}) {
    const m = this.mat(color, 1.6), d = new THREE.Mesh(this.geo('dome'), m); d.position.set(x, o.y ?? 0, z);
    return this.spawn(d, o.dur ?? 0.3, (k) => { const e = easeOut(k); d.scale.set(r * (0.3 + 0.7 * e), r * (0.25 + 0.45 * e), r * (0.3 + 0.7 * e)); m.opacity = (o.op ?? 0.5) * (1 - k); }, { mats: [m] });
  }

  // 金钟罩：金色大钟从头顶罩下来，跟着角色走，最后 25% 淡出
  bell(getPos, color, dur) {
    const g = new THREE.Group(), m = this.mat(color, 1.5), w = this.mat('#ffffff', 2);
    const a = new THREE.Mesh(this.geo('bell'), m), rim = new THREE.Mesh(this.geo('vring'), w);
    rim.rotation.x = -Math.PI / 2; rim.scale.setScalar(1.28); rim.position.y = 0.04; g.add(a, rim);
    return this.spawn(g, dur, (k) => {
      const p = getPos(), t = k * dur, drop = Math.min(1, t / 0.12);
      g.position.set(p.x, p.y + (1 - easeOut(drop)) * 2.5, p.z);
      g.scale.set(1, 1 + (1 - drop) * 0.4, 1);
      const f = Math.min(1, t / 0.08) * (k > 0.75 ? (1 - k) / 0.25 : 1);
      m.opacity = (0.4 + 0.15 * Math.sin(t * 18) * (1 - drop)) * f; w.opacity = (drop < 1 ? 0.3 : 0.9 * Math.max(0.35, 1 - (t - 0.12) * 3)) * f;
    }, { mats: [m, w] });
  }

  // ======== 符：符纸、法阵、缚环、灵光线、烧尽 ========

  // 一张符纸 + 背后一团光。返回 { g, paper, gm }，调用方自己加进场景、摆位置；gm 用完要 dispose（burn 会代劳）
  talisman(glyph = '敕令', color = '#ffd27a', s = 1) {
    const g = new THREE.Group(), paper = new THREE.Mesh(this.G.paper, paperMat(glyph)), gm = glowMat(color, 1.4);
    gm.vertexColors = true; gm.opacity = 0.55;
    const glow = new THREE.Mesh(this.puffGeo, gm); glow.scale.set(0.38, 0.55, 1); glow.position.z = -0.01;
    paper.add(glow); paper.scale.setScalar(s); paper.rotation.order = 'XYZ'; g.add(paper);
    return { g, paper, gm, s };
  }
  // 法阵（地上的发光阵图，半径 = scale）。透明度由调用方控制，用完 dispose 材质
  sigil(color) {
    const m = new THREE.MeshBasicMaterial({ map: sigilTex(), color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    return new THREE.Mesh(this.G.sigil, m);
  }
  // 法阵炸开：放大、转一下、淡出（接管已有的法阵，结束时回收材质）
  sigilFlare(s, dur = 0.4, grow = 1.4) {
    const s0 = s.scale.x, op = s.material.opacity || 0.8;
    return this.spawn(s, dur, (k, dt) => { s.scale.setScalar(s0 * (1 + (grow - 1) * easeOut(k))); s.rotation.y += dt * 4; s.material.opacity = Math.min(1, op * 1.6) * (1 - k); }, { mats: [s.material] });
  }
  // 符纸烧尽：缩小、往上飘、冒火星（接管符纸，结束时回收光晕材质）
  burn(t, color = '#ff8a3a', dur = 0.35) {
    const p = t.g.position, s0 = t.paper.scale.x;
    return this.spawn(t.g, dur, (k, dt) => {
      p.y += dt * 1.2; t.paper.rotation.y += dt * 6; t.paper.scale.setScalar(s0 * (1 - k * 0.9)); t.gm.opacity = 0.9 * (1 - k);
      if (Math.random() < 0.7) this.fx.mote(p.x + rand(-0.15, 0.15) * s0, p.y, p.z + rand(-0.15, 0.15) * s0, color, { life: 0.5, size: 0.7, vy: 1.6 });
    }, { mats: [t.gm] });
  }
  // 缚：三道光环箍住目标，一下收紧，持续 dur 秒
  chains(getPos, color, dur) {
    const g = new THREE.Group(), m = this.mat(color, 2.2), rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(this.geo('vring'), m);
      r.rotation.set(-Math.PI / 2 + rand(-0.3, 0.3), 0, rand(-0.3, 0.3)); r.position.y = 0.6 + i * 0.45; g.add(r); rings.push(r);
    }
    return this.spawn(g, dur, (k, dt) => {
      const p = getPos(), t = k * dur, sq = t < 0.15 ? 1.5 - easeOut(t / 0.15) * 0.95 : 0.55;
      g.position.set(p.x, p.y, p.z); g.rotation.y += dt * 3;
      rings.forEach((r, i) => r.scale.setScalar(sq * (1 - i * 0.1)));
      m.opacity = (k > 0.8 ? (1 - k) / 0.2 : 1) * (0.7 + 0.3 * Math.sin(t * 30));
    }, { mats: [m] });
  }
  // 灵光线：从 a 连到 b，一闪即逝（引爆时剑指连到每个陷阱）
  beam(x0, z0, x1, z1, color, o = {}) {
    const m = this.mat(color, 2.6), s = new THREE.Mesh(this.geo('strip'), m), len = Math.hypot(x1 - x0, z1 - z0);
    s.position.set(x0, o.y ?? 0.9, z0); s.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    return this.spawn(s, o.dur ?? 0.25, (k) => { s.scale.set((o.w ?? 0.3) * (1 - k * 0.5), 1, len * easeOut(Math.min(1, k * 5))); m.opacity = 0.9 * (1 - k); }, { mats: [m], delay: o.delay });
  }
}

// 每招的特效脚本。c = { cfx, fx, x, z, yaw, fx0/fz0 前方单位向量, color, cx, cz（圆形判定中心）, getPos }
const R = -0.6, L = 0.6;
export const MOVE_FX = {
  slash1: { hit(c) { c.cfx.arc(c, c.yaw, c.color, { tilt: R }); } },
  slash2: { hit(c) { c.cfx.arc(c, c.yaw, c.color, { tilt: L, flip: true }); } },
  slash3: {
    hit(c) {
      c.cfx.arc(c, c.yaw, c.color, { tilt: 0.75, scale: 1.15 });
      c.cfx.arc(c, c.yaw, '#ffffff', { tilt: 0.55, scale: 1.4, opacity: 0.35, delay: 0.05, dur: 0.25 });
      c.fx.burst({ x: c.x + c.fx0 * 2, z: c.z + c.fz0 * 2 }, c.color, 10, { speed: 4, up: 4, life: 0.35, y: 1 });
    },
  },
  flurry: {
    hit(c, h, i) {
      c.cfx.stab(c, c.yaw, c.color, rand(-0.45, 0.45), rand(0.85, 1.35));
      if (i === 3) c.cfx.stab(c, c.yaw, '#ffffff', 0, 1.1, 4);
      c.fx.burst({ x: c.x + c.fx0 * 2.6, z: c.z + c.fz0 * 2.6 }, '#ffffff', 3, { speed: 3, life: 0.2, y: 1 });
    },
  },
  gale: {
    start(c) { c.fx.burst(c, c.color, 16, { speed: 3, up: 1, life: 0.3, y: 1 }); },
    hit(c) {
      c.cfx.arc(c, c.yaw, c.color, { tilt: -Math.PI / 2, scale: 1.3, y: 1.3, sweep: 1.4 });
      c.cfx.flash(c.x + c.fx0 * 2, c.z + c.fz0 * 2, c.color, 15, 0.3);
      c.fx.shockRing(c.x, c.z, 2.2, c.color, 0.3);
      c.cfx.crack(c.x, c.z, c.x + c.fx0 * 7, c.z + c.fz0 * 7, c.color, 0.5, 0.6);
    },
  },
  thunder: {
    start(c) { c.fx.burst(c, c.color, 20, { speed: 2, up: 6, life: 0.4, grav: 0 }); },
    hit(c) {
      c.cfx.bolt(c.cx, c.cz, c.color); c.cfx.bolt(c.cx, c.cz, '#ffffff');
      c.cfx.pillar(c.cx, c.cz, 1.2, 8, c.color, 0.35);
      c.cfx.disc(c.cx, c.cz, 3.4, c.color, 0.3);
      c.cfx.scorch(c.cx, c.cz, 2.6);
      c.cfx.flash(c.cx, c.cz, c.color, 30, 0.35, 3);
      c.fx.shockRing(c.cx, c.cz, 4.2, '#ffffff', 0.4);
      c.fx.burst({ x: c.cx, z: c.cz }, c.color, 30, { speed: 9, up: 5, life: 0.5, y: 0.3 });
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + rand(0, 1); c.cfx.crack(c.cx, c.cz, c.cx + Math.cos(a) * 3.4, c.cz + Math.sin(a) * 3.4, c.color, 0.25, 0.7); }
    },
  },
  whirl: {
    start(c, m) { c.cfx.whirl(c.getPos, c.color, m.cancel + 0.05); },
    hit(c, h, i) {
      c.cfx.arc(c, c.yaw + i * 1.9, c.color, { tilt: i % 2 ? 0.25 : -0.25, scale: 1.05, flip: i % 2 === 1, y: 0.9 });
      c.fx.burst(c, c.color, 6, { speed: 7, up: 1, life: 0.3, y: 0.9 });
    },
  },
  pierce: {
    start(c) {
      c.cfx.crack(c.x, c.z, c.x + c.fx0 * 7, c.z + c.fz0 * 7, c.color, 0.9, 0.5);
      c.fx.shockRing(c.x, c.z, 1.8, c.color, 0.25);
    },
  },
  heavy: {
    hit(c) {
      c.cfx.arc(c, c.yaw, c.color, { tilt: -Math.PI / 2, scale: 1.2, y: 1.25, sweep: 1.2 });
      const ex = c.x + c.fx0 * 2.6, ez = c.z + c.fz0 * 2.6;
      c.cfx.crack(c.x + c.fx0 * 0.8, c.z + c.fz0 * 0.8, ex, ez, c.color, 0.3, 0.7);
      c.cfx.disc(ex, ez, 1.2, c.color, 0.25);
      c.fx.burst({ x: ex, z: ez }, '#b89a6a', 12, { speed: 4, up: 4, life: 0.5, y: 0.2, bright: 1 });
    },
  },
  quake: {
    hit(c, h, i) {
      if (i === 0) c.cfx.arc(c, c.yaw, c.color, { tilt: -Math.PI / 2, scale: 1.25, y: 1.25, sweep: 1.3 });
      const back = i === 0 ? 0.6 : (h.at - 1.6);
      c.cfx.crack(c.x + c.fx0 * back, c.z + c.fz0 * back, c.cx, c.cz, c.color, 0.45, 0.9);
      c.cfx.shards(c.cx, c.cz, 5 + i, h.r * 0.7);
      c.cfx.disc(c.cx, c.cz, h.r, c.color, 0.3, 0.5);
      c.fx.burst({ x: c.cx, z: c.cz }, '#b89a6a', 16, { speed: 5, up: 5, life: 0.6, y: 0.2, bright: 1 });
      if (i === 3) c.cfx.flash(c.cx, c.cz, c.color, 18, 0.3);
    },
  },
  meteor: {
    start(c) { c.fx.burst(c, c.color, 18, { speed: 3, up: 5, life: 0.4 }); },
    hit(c) {
      c.cfx.pillar(c.cx, c.cz, 2.2, 5, c.color, 0.4);
      c.cfx.disc(c.cx, c.cz, 3.6, '#ffe28a', 0.3);
      c.cfx.scorch(c.cx, c.cz, 3.2, 2);
      c.cfx.shards(c.cx, c.cz, 10, 3.2);
      c.cfx.flash(c.cx, c.cz, c.color, 35, 0.4, 2.5);
      c.fx.shockRing(c.cx, c.cz, 5, c.color, 0.45);
      c.fx.shockRing(c.cx, c.cz, 3, '#ffffff', 0.3);
      c.fx.burst({ x: c.cx, z: c.cz }, c.color, 40, { speed: 10, up: 6, life: 0.6, y: 0.3 });
      c.fx.burst({ x: c.cx, z: c.cz }, '#8a7a68', 20, { speed: 6, up: 8, life: 0.9, y: 0.3, bright: 0.8, grav: -18, drag: 0.5 });
    },
  },
};
