// 十五门派各自的山门布局（规划见 SECTS.md）。每派一个 build 函数，在本地坐标里画（正门朝 +z，也就是镜头这一侧）。
// 每派返回：执事站位、弟子站位与动作、练武场（偷师观摩点 / 试炼刷怪点）、藏经阁门口（偷翻秘籍点）、石碑位置、每帧动画。
// ground(lx, lz, n)：铺地（1 石板 / 3 泥土 / 4 岩地），区块生成地面颜色时调用。
import * as THREE from 'three';
import { glow, mesh, at, addOutline, toon, PNG } from './util.js';
import { getRefAsset } from './lab/ref/index.js';
import { M, shade, roof, plaque, scroll, podium, hall, tower, pagoda, paifang, wallSeg, banner, brazier, cauldron, lion } from './sectkit.js';

const TAU = Math.PI * 2;
const disc = (lx, lz, x, z, r) => Math.hypot(lx - x, lz - z) < r;
const rect = (lx, lz, x0, z0, x1, z1) => lx > x0 && lx < x1 && lz > z0 && lz < z1;

export class Site {
  constructor(g, x, z) { this.g = g; this.w = g.world; this.x = x; this.z = z; this.anims = []; this.cloths = []; this.flames = []; this.disc = []; }
  put(obj, lx, lz, ry = 0, y = 0, { ink = true } = {}) {
    obj.position.set(this.x + lx, y, this.z + lz); obj.rotation.y = ry;
    if (ink) addOutline(obj, this.w.M.line);
    obj.traverse((o) => { if (o.userData.cloth) this.cloths.push(o.userData.cloth); if (o.userData.flame) this.flames.push(o.userData.flame); if (o.userData.fire) this.flames.push(o.userData.fire); });
    this.g.scene.add(obj); return obj;
  }
  box(x0, z0, x1, z1) { this.w.addBox(this.x + Math.min(x0, x1), this.z + Math.min(z0, z1), this.x + Math.max(x0, x1), this.z + Math.max(z0, z1)); }
  // 放一栋建筑并按占地加碰撞
  bld(obj, lx, lz, ry = 0) { this.put(obj, lx, lz, ry); const f = obj.userData.foot; if (f) { const [fw, fd] = Math.abs(Math.sin(ry)) > 0.5 ? [f[1], f[0]] : f; this.box(lx - fw / 2, lz - fd / 2, lx + fw / 2, lz + fd / 2); } return obj; }
  // 铺地：真石板面片（雪地 / 沙地扇区会盖掉地面着色，所以铺实物），UV 按世界坐标走，纹理不拉伸
  pave(geo, color = '#cfc8bc', k = 0.22) {
    const p = geo.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + this.x) * k, (p.getZ(i) + this.z) * k);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const tex = PNG.stone_plaza; if (tex) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = toon(color, { map: tex || null, ref: true, unique: true }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
    const o = mesh(geo, m, { cast: false, recv: true }); o.position.set(this.x, 0.015, this.z); this.g.scene.add(o); return o;
  }
  paveDisc(lx, lz, r, color) { return this.pave(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2).translate(lx, 0, lz), color); }
  paveRect(x0, z0, x1, z1, color) { return this.pave(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2), color); }
  circ(lx, lz, r) { return this.w.addCircle(this.x + lx, this.z + lz, r); }
  ref(id, v, lx, lz, s = 1, r = 0, col = 0) {
    const o = this.w.ref(id, Math.abs(Math.round(v)), this.x + lx, this.z + lz, s, r);
    if (o && col) this.circ(lx, lz, col);
    return o;
  }
  emit(lx, y, lz, color, power = 0.8, kind = 'lantern', m = null) { return this.w.addEmitter(this.x + lx, y, this.z + lz, color, power, kind, m); }
  lantern(lx, lz, y = 2.0, color = '#ff4a2a') {
    const l = mesh(new THREE.SphereGeometry(0.24, 10, 8).scale(1, 1.2, 1), glow(color, 1.8, true), { cast: false });
    this.put(l, lx, lz, 0, y, { ink: false }); l.userData.em = this.emit(lx, y, lz, '#ff7a4a', 0.7, 'lantern', l); return l;
  }
  // 环形散布：在 r0..r1 的环上撒素材，跳过 skip(lx, lz)
  scatter(rng, n, r0, r1, fn, skip = () => false) {
    for (let i = 0, k = 0; i < n * 4 && k < n; i++) {
      const a = rng() * TAU, r = r0 + rng() * (r1 - r0), lx = Math.sin(a) * r, lz = Math.cos(a) * r;
      if (skip(lx, lz)) continue; fn(lx, lz, rng, k++);
    }
  }
  update(dt, t) {
    for (const c of this.cloths) c.rotation.y = Math.sin(t * 1.7 + c.id) * 0.25;
    for (const f of this.flames) f.scale.set(1, 0.85 + Math.sin(t * 9 + f.id) * 0.15, 1);
    for (const a of this.anims) a(dt, t);
  }
}
function rng32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 巨剑（剑冢、剑林用）
function bigSword(len, o = {}) {
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
function swordRack(n = 4) {
  const G = new THREE.Group(), wood = M('#6a4029');
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(0, 0.75, 0), wood), s * 1.2, 0, 0));
  G.add(at(mesh(new THREE.BoxGeometry(2.6, 0.12, 0.16), wood), 0, 1.3, 0));
  G.add(at(mesh(new THREE.BoxGeometry(2.6, 0.1, 0.4), wood), 0, 0.15, 0.1));
  for (let i = 0; i < n; i++) { const sw = bigSword(1.15, { grip: '#2a3a4a' }); sw.rotation.set(-0.18, 0, 0.05); sw.position.set(-0.9 + i * 0.6, 0.12, 0.2); G.add(sw); }
  return G;
}

// ===================== 1 青锋剑派：雪坡下的清贫小剑派 =====================
// 牌坊 → 石板路 → 圆形练剑坪（两排剑架）→ 青锋殿；殿后右侧剑冢巨石插着镇派巨剑；左边二层藏经阁，右边弟子居；雪松环抱
const qingfeng = {
  r: 22,
  ground: (lx, lz, n) => (disc(lx, lz, 0, 3.5, 6.2 + n) || rect(lx, lz, -1.5, -5, 1.5, 17) || rect(lx, lz, -6.5 + n, -11, 6.5, -4) ? 1 : 0),
  build(S) {
    const rng = rng32(11);
    const H = [];   // 灭门后要拆掉的东西
    H.push(S.put(paifang('青锋剑派', { col: '#3a6a9a', roof: '#2e3a4c', w: 7.2, h: 4.8, bays: 3 }), 0, 13.5));
    for (const x of [-3.6, -1.2, 1.2, 3.6]) S.circ(x, 13.5, 0.4);
    // 青锋殿
    H.push(S.bld(hall({ w: 10, d: 6, h: 2.9, wall: '#eef0f2', col: '#3a6a9a', roof: '#3a4658', ridge: '#232a36', sign: '青锋殿', base: 0.7 }), 0, -7.5));
    // 练剑坪：边缘一圈石栏 + 剑架
    for (const s of [-1, 1]) for (const z of [1.2, 5.6]) { S.put(swordRack(4), s * 7.6, z, 0); S.box(s * 7.6 - 1.4, z - 0.3, s * 7.6 + 1.4, z + 0.5); }
    // 铺地：练剑坪 + 中轴甬道 + 殿前月台
    S.paveDisc(0, 3.5, 6.1, '#e4ded2'); S.paveRect(-1.5, 9, 1.5, 17, '#e4ded2'); S.paveRect(-7, -4.2, 7, -1.5, '#e4ded2');
    // 练剑坪石边（深色一圈）
    const ring = mesh(new THREE.RingGeometry(6.0, 6.45, 48).rotateX(-Math.PI / 2), M('#8a8680'), { cast: false, recv: true });
    ring.material.polygonOffset = true; ring.material.polygonOffsetFactor = -2; S.put(ring, 0, 3.5, 0, 0.02, { ink: false });
    // 山门石狮（GDD §12 中式元素）
    for (const s of [-1, 1]) { S.put(lion(s), s * 2.4, 15.4, 0); S.box(s * 2.4 - 0.6, 14.7, s * 2.4 + 0.6, 16.1); }
    // 青锋幡
    for (const s of [-1, 1]) { H.push(S.put(banner('#3a6a9a', '青锋'), s * 6.2, -2.6, 0)); S.circ(s * 6.2, -2.6, 0.2); }
    // 藏经阁（二层）+ 弟子居
    H.push(S.bld(tower({ w: 4.2, d: 3.6, levels: 2, wall: '#eef0f2', col: '#3a6a9a', roof: '#3a4658', ridge: '#232a36', sign: '藏经阁', base: 0.4, k: 0.5 }), -11.5, -6, 0));
    S.box(-14, -8.2, -9, -3.8);
    H.push(S.bld(hall({ w: 6.5, d: 4, h: 2.4, wall: '#e8e2d4', col: '#5a4030', roof: '#4a5262', ridge: '#2a2e38', sign: '弟子居', base: 0.3, rise: 1.4 }), 11.5, -5.5));
    // 剑冢：大石 + 斜插巨剑「青锋」，剑身泛青光
    S.ref('snowRock', 2, 9.5, -14, 2.6, 0.6, 2.2);
    const sw = bigSword(6.5, { blade: '#cfe6f2', glow: '#6ad8ff', grip: '#2a4a6a' }); sw.rotation.set(0.1, 0.4, -0.14); S.put(sw, 9.5, -14, 0, 0.6); H.push(sw);
    const swE = S.emit(9.5, 4.5, -14, '#7ad8ff', 1.2, 'lantern');
    S.put(plaque('剑冢', 1.4, 0.5), 9.5, -11.6, 0, 0.7, { ink: false });
    // 石灯笼沿路
    for (const z of [11, 8.5]) for (const s of [-1, 1]) { S.ref('stoneLan', z * 3 + s, s * 2.3, z, 1, 0, 0.35); }
    for (const s of [-1, 1]) H.push(S.lantern(s * 2.6, -3.6, 2.2));
    // 雪松一圈 + 雪堆 + 雪岩
    S.scatter(rng, 20, 15, 21, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.1 + r() * 0.4, r() * TAU, 0.8), (x, z) => Math.abs(x) < 8 && z > 8);
    S.scatter(rng, 10, 9, 19, (x, z, r, i) => S.ref(i % 2 ? 'drift' : 'snowRock', i, x, z, 0.9 + r() * 0.6, r() * TAU, i % 2 ? 0 : 0.7),
      (x, z) => disc(x, z, 0, 3.5, 7.5) || rect(x, z, -2.5, -12, 2.5, 18) || rect(x, z, -15, -10, 15, -2) || disc(x, z, 9.5, -14, 3.5));
    return {
      look: { robe: '#7ab8e8', robe2: '#eef4fa', belt: '#2a4a6a', hairStyle: 2, sword: true },
      // 灭门（GDD：放任就变废墟，永久保留）：殿、阁、牌坊、幡都烧塌，只剩焦黑台基、断柱、瓦砾；巨剑断成两截
      ruin() { for (const o of H) { o.visible = false; if (o.userData.em) o.userData.em.power = 0; } swE.power = 0; ruinQingfeng(S); },
      elder: [0, -3.2, 0], yard: [0, 3.5], lib: [-11.5, -3.2], stele: [-6.4, 14.6], front: [0, 9],
      disciples: [[-3, 2.5, Math.PI / 2, 'spar'], [-1.4, 2.5, -Math.PI / 2, 'spar'], [1.4, 4.8, Math.PI / 2, 'spar'], [3, 4.8, -Math.PI / 2, 'spar'], [-2, 6.2, Math.PI, 'drill'], [2, 1.2, Math.PI, 'drill']],
    };
  },
};

function ruinQingfeng(S) {
  const rng = rng32(7), char = M('#2a2624'), ash = M('#4a4440'), burnt = M('#3a2a22');
  const rubble = (cx, cz, w, d, n) => {
    for (let i = 0; i < n; i++) {
      const b = mesh(new THREE.BoxGeometry(0.4 + rng() * 1.2, 0.2 + rng() * 0.5, 0.3 + rng() * 0.8), rng() < 0.5 ? char : ash);
      b.rotation.set(rng() * 0.6, rng() * TAU, rng() * 0.6); S.put(b, cx + (rng() - 0.5) * w, cz + (rng() - 0.5) * d, 0, 0.15 + rng() * 0.3);
    }
  };
  const stump = (x, z, h) => S.put(mesh(new THREE.CylinderGeometry(0.17, 0.2, h, 8).translate(0, h / 2, 0), burnt), x, z, 0, 0);
  // 大殿：焦黑台基 + 断柱 + 塌下来的半片屋顶
  S.put(podium(11.6, 7.6, 0.7, '#5a5450'), 0, -7.5);
  for (let i = 0; i < 6; i++) stump(-4.75 + i * 1.9, -4.75, 0.6 + rng() * 2.2);
  const slab = mesh(new THREE.BoxGeometry(8, 0.16, 3.4), char); slab.rotation.set(0.35, 0.1, 0.12); S.put(slab, 0.5, -8.2, 0, 1.6);
  rubble(0, -7.5, 9, 5, 22);
  // 藏经阁、弟子居、牌坊
  S.put(podium(5.6, 5, 0.4, '#5a5450'), -11.5, -6); rubble(-11.5, -6, 4, 3.5, 10); for (const [x, z] of [[-13.6, -4.2], [-9.4, -7.8]]) stump(x, z, 1.4 + rng());
  S.put(podium(8.1, 5.6, 0.3, '#5a5450'), 11.5, -5.5); rubble(11.5, -5.5, 6, 4, 12);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) stump(x, 13.5, 0.8 + rng() * 2.4);
  const beam = mesh(new THREE.BoxGeometry(5, 0.4, 0.45), burnt); beam.rotation.set(0, 0.2, 0.3); S.put(beam, 0.4, 14.2, 0, 0.5);
  // 巨剑：剑身断在石头里，上半截连剑柄倒在地上
  const lo = bigSword(6.5, { blade: '#8a949a', grip: '#2a3a4a' }); lo.scale.set(1, 0.38, 1); lo.children.slice(1).forEach((c) => (c.visible = false)); lo.rotation.set(0.1, 0.4, -0.14); S.put(lo, 9.5, -14, 0, 0.6);
  const hi = bigSword(6.5, { blade: '#8a949a', grip: '#2a3a4a' }); hi.rotation.set(0, 0.9, Math.PI / 2 - 0.08); S.put(hi, 12.5, -10.8, 0, 0.3);
}

// 旧版通用布局（还没重做的门派先用这个）
const generic = {
  r: 20,
  ground: (lx, lz, n) => (Math.abs(lx) < 9 + n && Math.abs(lz) < 6.75 + n ? 1 : 0),
  build(S, d, name) {
    S.bld(hall({ w: 9, d: 6, h: 2.6, col: shade(d.robe, 0.8), roof: shade(d.robe, 0.55), sign: name }), 0, -6);
    for (const s of [-1, 1]) S.bld(hall({ w: 5, d: 4, h: 2.3, col: '#6a4a30', roof: '#5a6070', sign: s < 0 ? '藏经阁' : '丹房', base: 0.3 }), s * 10, -4);
    S.put(paifang(name, { col: shade(d.robe, 0.8), bays: 1, w: 6.4 }), 0, 9);
    for (const s of [-1, 1]) S.circ(s * 3.2, 9, 0.4);
    return { look: { robe: d.robe, robe2: shade(d.robe, 0.6), belt: shade(d.robe, 0.4), hairStyle: 2, sword: true }, elder: [0, -1.6, 0], yard: [0, 3.8], lib: [-10, -0.5], stele: [-5, 8.5], front: [0, 5.5],
      disciples: [[-3.9, 3, Math.PI, 'spar'], [-1.3, 4.6, Math.PI, 'spar'], [1.3, 3, Math.PI, 'spar'], [3.9, 4.6, Math.PI, 'spar']] };
  },
};

export const SITES = { 青锋剑派: qingfeng };
export const siteOf = (name) => SITES[name] || generic;
