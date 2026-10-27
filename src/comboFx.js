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
    };
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
  bolt(x, z, color) {
    const pts = [];
    let px = x + rand(-1.5, 1.5), pz = z + rand(-1.5, 1.5);
    for (let i = 0; i <= 9; i++) {
      const k = i / 9;
      pts.push(new THREE.Vector3(px + (x - px) * k + (i && i < 9 ? rand(-0.5, 0.5) : 0), 12 * (1 - k), pz + (z - pz) * k + (i && i < 9 ? rand(-0.5, 0.5) : 0)));
    }
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const g1 = new THREE.TubeGeometry(path, 36, 0.18, 5), g2 = new THREE.TubeGeometry(path, 36, 0.06, 5);
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
  whirl(getPos, color, dur) {
    const g = new THREE.Group(), mats = [];
    for (let i = 0; i < 3; i++) {
      const m = this.mat(i ? color : '#ffffff', 2); mats.push(m);
      const a = new THREE.Mesh(i ? this.geo('arcWide') : this.geo('arcEdge'), m); a.rotation.y = i * Math.PI * 2 / 3; g.add(a);
    }
    return this.spawn(g, dur, (k, dt) => {
      const p = getPos(); g.position.set(p.x, 0.9 + Math.sin(k * 20) * 0.08, p.z);
      g.rotation.y += dt * 22;
      const f = Math.min(1, k * 6) * (1 - Math.max(0, k - 0.75) / 0.25);
      mats.forEach((m, i) => { m.opacity = (i ? 0.5 : 0.9) * f; });
    }, { mats });
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
