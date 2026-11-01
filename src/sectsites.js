// 十五门派各自的山门布局（规划见 SECTS.md）。每派一个 build 函数，在本地坐标里画（正门朝 +z，也就是镜头这一侧）。
// 每派返回：执事站位、弟子站位与动作、练武场（偷师观摩点 / 试炼刷怪点）、藏经阁门口（偷翻秘籍点）、石碑位置、每帧动画。
// ground(lx, lz, n)：铺地（1 石板 / 3 泥土 / 4 岩地），区块生成地面颜色时调用。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh, at, addOutline, toon, PNG, boxUV } from './util.js';
import { getRefAsset } from './lab/ref/index.js';
import { makeLabWater } from './water.js';
import { M, TX, shade, roof, plaque, scroll, podium, hall, tower, pagoda, paifang, wallSeg, banner, brazier, cauldron, lion } from './sectkit.js';

const TAU = Math.PI * 2;
const disc = (lx, lz, x, z, r) => Math.hypot(lx - x, lz - z) < r;
const rect = (lx, lz, x0, z0, x1, z1) => lx > x0 && lx < x1 && lz > z0 && lz < z1;

export class Site {
  constructor(g, x, z) { this.g = g; this.w = g.world; this.x = x; this.z = z; this.anims = []; this.cloths = []; this.flames = []; this.disc = []; this.occ = []; }
  put(obj, lx, lz, ry = 0, y = 0, { ink = true, bake = false } = {}) {
    obj.position.set(this.x + lx, y, this.z + lz); obj.rotation.y = ry;
    obj.traverse((o) => { if (o.userData.cloth) this.cloths.push(o.userData.cloth); if (o.userData.flame) this.flames.push(o.userData.flame); if (o.userData.fire) this.flames.push(o.userData.fire); });
    if (bake) obj = this.bake(obj);
    if (ink) addOutline(obj, this.w.M.line);
    this.g.scene.add(obj); return obj;
  }
  box(x0, z0, x1, z1) { this.w.addBox(this.x + Math.min(x0, x1), this.z + Math.min(z0, z1), this.x + Math.max(x0, x1), this.z + Math.max(z0, z1)); this.mark(x0, z0, x1, z1); }
  // 占地登记（不加碰撞）：撒树、撒石头时避开
  mark(x0, z0, x1, z1) { this.occ.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
  free(lx, lz, m = 1.5) { return !this.occ.some(([a, b, c, d]) => lx > a - m && lx < c + m && lz > b - m && lz < d + m); }
  // 放一栋建筑并按占地加碰撞（静态网格按材质合并，省 draw call）
  bld(obj, lx, lz, ry = 0) { const f = obj.userData.foot; obj = this.put(obj, lx, lz, ry, 0, { bake: true }); if (f) { const [fw, fd] = Math.abs(Math.sin(ry)) > 0.5 ? [f[1], f[0]] : f; this.box(lx - fw / 2, lz - fd / 2, lx + fw / 2, lz + fd / 2); obj.userData.at = [lx, lz, fw, fd]; } return obj; }
  // 把一组静态网格按材质合并成几块（带动画的布幡、火焰原样保留）
  bake(obj) {
    obj.updateMatrixWorld(true);
    const live = new Set(), by = new Map(), G = new THREE.Group();
    obj.traverse((o) => { for (const k of ['cloth', 'flame', 'fire']) if (o.userData[k]) live.add(o.userData[k]); });
    const isLive = (o) => { for (let a = o; a; a = a.parent) if (live.has(a)) return true; return false; };
    const keep = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (isLive(o)) { if (live.has(o)) keep.push(o); return; }
      if (Array.isArray(o.material) || o.material.transparent) { keep.push(o); return; }
      let gm = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(gm.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gm.deleteAttribute(k);
      if (!gm.attributes.uv) gm.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gm.attributes.position.count * 2), 2));
      if (!gm.attributes.normal) gm.computeVertexNormals();
      gm.applyMatrix4(o.matrixWorld);
      const key = o.material.uuid + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : '');
      if (!by.has(key)) by.set(key, { m: o.material, recv: o.receiveShadow, cast: o.castShadow, list: [] });
      by.get(key).list.push(gm);
    });
    for (const { m, recv, cast, list } of by.values()) G.add(mesh(mergeGeometries(list), m, { cast, recv }));
    for (const o of keep) G.attach(o);
    G.userData = { ...obj.userData };
    return G;
  }
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
  paveRect(x0, z0, x1, z1, color) { this.mark(x0, z0, x1, z1); return this.pave(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2), color); }
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

// ===================== 1 青锋剑派：雪坡下的剑派（大场地，半径约 90 米）=====================
// 由南往北一条中轴：牌坊 → 山门 → 外院（演武场、擂台、执事堂、膳堂、外门弟子居、灵药园、杂役院）→ 二山门
// → 中院（钟鼓楼、香鼎广场、青锋殿、藏经阁、丹房、铸剑坊）→ 后院（凌霄阁、内门弟子居、长老院、执法堂、八角亭、剑塔、剑冢、思过崖）
// 四周院墙，墙外雪松林。灭门后：所有建筑烧成焦黑台基 + 断柱 + 瓦砾，门人全部不见。
const QF_WALL = { x: 56, s: 60, n: -70 };
const QF_PAVE = [[-2.5, -31, 2.5, 84], [-22, 24, 22, 54], [-9, 58, 9, 80], [-14, -2, 14, 17], [-9, -31.5, 9, -25.5], [-36, 1.5, 36, 4.5], [-46, 19.5, 46, 22.5], [-36, -24, 36, -21], [-2, -54, 2, -31]];
// 颜色
const QC = { col: '#3a6a9a', wall: '#eef0f2', roof: '#3a4658', ridge: '#232a36', wall2: '#e8e2d4', col2: '#5a4030', roof2: '#4a5262', pave: '#dcd6ca' };
// 小件：木人桩、水井、柴堆、铁砧、桌凳、钟、鼓
function dummy() {
  const G = new THREE.Group(), w = M('#7a5030', { tx: TX.wood });
  G.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.9, 8).translate(0, 0.95, 0), w));
  for (const [y, r] of [[1.35, 0.4], [0.95, -0.5], [0.6, 0.9]]) { const a = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6).rotateZ(Math.PI / 2).translate(0.3, 0, 0), w); a.position.y = y; a.rotation.y = r; G.add(a); }
  G.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.15, 10).translate(0, 0.07, 0), M('#8a8680', { tx: TX.stone })));
  return G;
}
function well() {
  const G = new THREE.Group(), st = M('#9a958c', { tx: TX.stone }), w = M('#6a4029', { tx: TX.wood });
  G.add(mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.75, 14, 1, true).translate(0, 0.37, 0), st));
  G.add(mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 18).rotateX(Math.PI / 2).translate(0, 0.75, 0), st));
  G.add(mesh(new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2).translate(0, 0.3, 0), M('#2a3a4a')));
  for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14).translate(0, 1, 0), w), s * 1.0, 0, 0));
  G.add(at(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8).rotateZ(Math.PI / 2), w), 0, 1.6, 0));
  const r = roof(2.6, 1.6, 0.6, QC.roof2, { k: 0.3 }); r.position.y = 2.0; G.add(r);
  G.add(at(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 8), w), 0.4, 1.1, 0));
  return G;
}
function woodpile() {
  const G = new THREE.Group(), w = M('#8a5a34'), e = M('#d8b080');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 7).rotateX(Math.PI / 2), w); l.position.set(-0.85 + i * 0.34 + r * 0.17, 0.16 + r * 0.29, 0); G.add(l);
    const c = mesh(new THREE.CircleGeometry(0.15, 7), e); c.position.set(l.position.x, l.position.y, 0.71); G.add(c);
  }
  G.add(at(mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.5, 9).translate(0, 0.25, 0), w), 1.6, 0, 0.3)); // 劈柴墩
  return G;
}
function anvil() {
  const G = new THREE.Group(), m = M('#4a4a50', { tx: 'rusty_iron' });
  G.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4).translate(0, 0.25, 0), M('#6a4029')));
  G.add(mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4).translate(0.1, 0.62, 0), m));
  G.add(mesh(new THREE.ConeGeometry(0.13, 0.4, 6).rotateZ(Math.PI / 2).translate(0.75, 0.66, 0), m));
  return G;
}
function tableSet() {
  const G = new THREE.Group(), w = M('#7a5030', { tx: TX.wood });
  G.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 1.0).translate(0, 0.78, 0), w));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1).translate(0, 0.39, 0), w), sx * 1.05, 0, sz * 0.4));
  for (const sz of [-1, 1]) { G.add(at(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.32).translate(0, 0.45, 0), w), 0, 0, sz * 0.85)); for (const sx of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08).translate(0, 0.22, 0), w), sx * 1.05, 0, sz * 0.85)); }
  for (let i = 0; i < 4; i++) G.add(at(mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.1, 8), M('#e8e2d4')), -0.8 + i * 0.55, 0.88, (i % 2 - 0.5) * 0.4));
  return G;
}
function bell(drum) {
  if (drum) { const G = new THREE.Group(); G.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 16).rotateX(Math.PI / 2), M('#a83a2a'))); for (const s of [-1, 1]) { const f = at(mesh(new THREE.CircleGeometry(0.72, 16), M('#e8d8b0')), 0, 0, s * 0.46); f.rotation.y = s > 0 ? 0 : Math.PI; G.add(f); } return G; }
  const pts = [[0, 0], [0.62, 0], [0.58, 0.2], [0.45, 0.9], [0.4, 1.1], [0.15, 1.2], [0, 1.2]].map(([x, y]) => new THREE.Vector2(x, y));
  return mesh(new THREE.LatheGeometry(pts, 16).translate(0, -1.2, 0), M('#7a6a3a', { metal: true }));
}
// 钟楼 / 鼓楼：高台基上一座四角攒尖亭，亭里吊钟 / 架鼓
function bellTower(name, drum) {
  const G = hall({ w: 5, d: 5, h: 3.0, open: true, col: QC.col, roof: QC.roof, ridge: QC.ridge, base: 1.6, pyramid: true, k: 1, rise: 2.2, stairW: 1.8 });
  const b = bell(drum); b.position.y = drum ? 2.5 : 4.4; G.add(b);
  const p = plaque(name, 1.6, 0.5); p.position.set(0, 4.35, 2.55); G.add(p);
  return G;
}
// 一圈栅栏
function fence(w, d) {
  const G = new THREE.Group(), m = M('#7a5a3a', { tx: TX.wood });
  const side = (len, x, z, ry) => { const s = new THREE.Group(); for (let i = 0; i <= Math.round(len / 1.2); i++) s.add(at(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1).translate(0, 0.45, 0), m), -len / 2 + i * len / Math.round(len / 1.2), 0, 0)); for (const y of [0.35, 0.75]) s.add(at(mesh(new THREE.BoxGeometry(len, 0.07, 0.05), m), 0, y, 0)); s.position.set(x, 0, z); s.rotation.y = ry; G.add(s); };
  side(w, 0, -d / 2, 0); side(w * 0.4, -w * 0.3, d / 2, 0); side(w * 0.4, w * 0.3, d / 2, 0); side(d, -w / 2, 0, Math.PI / 2); side(d, w / 2, 0, Math.PI / 2);
  return G;
}
// 一畦药田：耕土 + 几排药苗
function herbBed(w, d, rng) {
  const G = new THREE.Group(), soil = M('#8a6a4a', { tx: 'tilled_soil' });
  G.add(mesh(boxUV(new THREE.BoxGeometry(w, 0.2, d), w, 0.2, d, 0.5).translate(0, 0.1, 0), soil, { recv: true }));
  const leaf = [M('#5aa04a'), M('#7ac05a'), M('#4a8a6a')], fl = [M('#e86a8a'), M('#f0d060'), M('#a87ae8')];
  for (let x = -w / 2 + 0.5; x < w / 2; x += 0.8) for (let z = -d / 2 + 0.5; z < d / 2; z += 0.9) {
    const h = 0.3 + rng() * 0.3, p = mesh(new THREE.ConeGeometry(0.22, h, 5).translate(0, h / 2 + 0.2, 0), leaf[Math.floor(rng() * 3)]); p.position.set(x, 0, z); G.add(p);
    if (rng() < 0.35) G.add(at(mesh(new THREE.SphereGeometry(0.08, 6, 5), fl[Math.floor(rng() * 3)]), x, h + 0.25, z));
  }
  return G;
}
// 思过崖：几块大岩叠成崖壁
function cliff(S, lx, lz, rng) { for (let i = 0; i < 6; i++) S.ref('snowRock', i + 3, lx + (i - 2.5) * 2.6 + rng(), lz - rng() * 2.5, 2.6 + rng() * 1.8, rng() * TAU, 2.2); S.mark(lx - 9, lz - 4, lx + 9, lz + 2); }

const qingfeng = {
  r: 92,
  ground: (lx, lz, n) => (QF_PAVE.some(([a, b, c, d]) => lx > a - n * 0.3 && lx < c + n * 0.3 && lz > b - n * 0.3 && lz < d + n * 0.3) ? 1 : 0),
  build(S) {
    const rng = rng32(11), W = QF_WALL;
    const H = [];   // 灭门后要烧掉的东西
    const B = (o, x, z, ry = 0) => { const b = S.bld(o, x, z, ry); H.push(b); return b; };
    const hallQ = (sign, w, d, extra = {}) => hall({ w, d, h: 2.9, wall: QC.wall, col: QC.col, roof: QC.roof, ridge: QC.ridge, sign, base: 0.5, ...extra });
    const hallP = (sign, w, d, extra = {}) => hall({ w, d, h: 2.5, wall: QC.wall2, col: QC.col2, roof: QC.roof2, ridge: '#2a2e38', sign, base: 0.35, rise: d * 0.32, ...extra });
    // 开敞的门殿 / 亭：不按占地加碰撞，只给柱子加
    const openHall = (o, x, z) => { const b = S.put(o, x, z, 0, 0, { bake: true }); H.push(b); const hw = o.userData.foot[0] / 2 - 1.05, hd = o.userData.foot[1] / 2 - 1.05; for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.circ(x + sx * hw, z + sz * hd, 0.35); b.userData.at = [x, z, o.userData.foot[0], o.userData.foot[1]]; S.mark(x - hw, z - hd, x + hw, z + hd); return b; };

    // ---- 铺地 ----
    for (const [a, b, c, d] of QF_PAVE) S.paveRect(a, b, c, d, QC.pave);

    // ---- 院墙（南墙在山门处断开、中间一道隔开外院和中院）----
    const wall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      S.put(wallSeg(len, { h: 2.6, wall: '#eef0f2', cap: QC.roof }), (x0 + x1) / 2, (z0 + z1) / 2, ry, 0, { bake: true }); // 石墙烧不塌，灭门后照样立着
      S.box(Math.min(x0, x1) - 0.35, Math.min(z0, z1) - 0.35, Math.max(x0, x1) + 0.35, Math.max(z0, z1) + 0.35);
    };
    wall(-W.x, W.s, -5.2, W.s); wall(5.2, W.s, W.x, W.s);
    wall(-W.x, W.n, W.x, W.n); wall(-W.x, W.n, -W.x, W.s); wall(W.x, W.n, W.x, W.s);
    wall(-W.x, 18, -5.2, 18); wall(5.2, 18, W.x, 18);
    // 角楼
    for (const sx of [-1, 1]) for (const z of [W.s, W.n]) B(tower({ w: 3.4, d: 3.4, levels: 2, h: 2.4, wall: QC.wall, col: QC.col, roof: QC.roof, ridge: QC.ridge, base: 0.5, door: false }), sx * W.x, z);

    // ---- 山门外：牌坊、石狮、石灯 ----
    H.push(S.put(paifang('青锋剑派', { col: QC.col, roof: QC.roof, w: 12, h: 7, bays: 3 }), 0, 74, 0, 0, { bake: true }));
    for (const x of [-6, -2, 2, 6]) S.circ(x, 74, 0.45);
    for (const s of [-1, 1]) { S.put(lion(s), s * 4.6, 69.5, 0, 0, { bake: true }); S.box(s * 4.6 - 0.6, 68.8, s * 4.6 + 0.6, 70.2); }
    for (const z of [78, 66, 63]) for (const s of [-1, 1]) S.ref('stoneLan', z + s, s * 4, z, 1.1, 0, 0.35);
    // 山门殿（开敞，穿堂而过）
    openHall(hall({ w: 9, d: 4.5, h: 3.4, open: true, col: QC.col, roof: QC.roof, ridge: QC.ridge, base: 0, sign: '山门', rise: 2.0 }), 0, W.s);

    // ---- 外院 ----
    // 演武场：四边剑架、木人桩一排、擂台
    for (const z of [30, 38, 46]) for (const s of [-1, 1]) { H.push(S.put(swordRack(4), s * 21, z, s * Math.PI / 2, 0, { bake: true })); S.box(s * 21 - 0.5, z - 1.4, s * 21 + 0.5, z + 1.4); }
    for (let i = 0; i < 6; i++) { const x = 5 + i * 2.6; H.push(S.put(dummy(), x, 50, 0, 0, { bake: true })); S.circ(x, 50, 0.35); }
    const arena = podium(10, 10, 0.35, '#b8b2a6', { stairW: 3 }); S.put(arena, 13, 36, 0, 0, { bake: true, ink: false }); S.mark(8, 31, 18, 41);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { H.push(S.put(banner('#3a6a9a', sz > 0 ? '试剑' : '青锋', { h: 4 }), 13 + sx * 4.6, 36 + sz * 4.6, 0)); S.circ(13 + sx * 4.6, 36 + sz * 4.6, 0.2); }
    // 东：执事堂、膳堂、杂役院（井、柴堆）
    B(hallQ('执事堂', 10, 6), 38, 50);
    B(hallP('膳堂', 11, 6), 38, 36);
    for (const [x, z] of [[34, 29], [40, 29]]) { H.push(S.put(tableSet(), x, z, 0, 0, { bake: true })); S.box(x - 1.3, z - 1, x + 1.3, z + 1); }
    H.push(S.put(well(), 46, 25, 0, 0, { bake: true })); S.circ(46, 25, 1.1);
    H.push(S.put(woodpile(), 28, 25.5, 0, 0, { bake: true })); S.box(26.9, 25, 30.2, 26.2);
    // 西：外门弟子居两排、灵药园
    B(hallP('外门弟子居', 11, 5.5), -40, 50); B(hallP('外门弟子居', 11, 5.5), -40, 39);
    H.push(S.put(fence(16, 10), -40, 27.5, 0, 0, { bake: true })); S.mark(-48, 22.5, -32, 32.5);
    for (const [x, z] of [[-44, 25.5], [-36, 25.5], [-44, 29.5], [-36, 29.5]]) S.put(herbBed(6, 2.6, rng), x, z, 0, 0, { bake: true, ink: false });
    // 二山门
    openHall(hall({ w: 8, d: 4, h: 3.2, open: true, col: QC.col, roof: QC.roof, ridge: QC.ridge, base: 0, sign: '问剑', rise: 1.8 }), 0, 18);

    // ---- 中院 ----
    B(bellTower('钟楼'), -17, 11); B(bellTower('鼓楼', true), 17, 11);
    const ding = cauldron(1.1, '#5a5a4a', { brew: '#ffcf8a' }); H.push(S.put(ding, 0, 8)); S.circ(0, 8, 1.4);
    for (const s of [-1, 1]) { H.push(S.put(banner('#3a6a9a', '青锋', { h: 6, len: 3.4 }), s * 10, 1, 0)); S.circ(s * 10, 1, 0.22); }
    B(hall({ w: 18, d: 10, h: 4.2, wall: QC.wall, col: QC.col, roof: QC.roof, ridge: QC.ridge, sign: '青锋殿', base: 1.2, tiers: 2, stairW: 5 }), 0, -8.5);
    for (const s of [-1, 1]) H.push(S.lantern(s * 4.5, -1.6, 2.6));
    const lib = B(tower({ w: 7, d: 6, levels: 3, wall: QC.wall, col: QC.col, roof: QC.roof, ridge: QC.ridge, sign: '藏经阁', base: 0.6, k: 0.5 }), -34, -3.5);
    lib.userData.at = [-34, -3.5, 8.4, 7.4];
    B(hallQ('丹房', 9, 6), 34, -4);
    const dan = cauldron(0.8, '#6a5a3a', { brew: '#8aff9a' }); H.push(S.put(dan, 34, 7.5)); S.circ(34, 7.5, 1.0);
    openHall(hall({ w: 6.5, d: 5, h: 2.6, open: true, col: QC.col2, roof: QC.roof2, ridge: '#2a2e38', base: 0.2, sign: '铸剑坊', rise: 1.5 }), 47, 9);
    const forge = brazier('#ff7a2a'); H.push(S.put(forge, 45.6, 9)); H.push(S.put(anvil(), 48, 9.5, 0.3)); H.push(S.put(swordRack(3), 47, 6.2, 0));
    B(hallQ('讲武堂', 8, 6), -48, 6);
    B(hallP('库房', 8, 5), -48, -14); B(hallP('客舍', 8, 5), 46, -15);
    // 碑林：殿前两侧几通石碑
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const x = s * (21 + i * 2.2), z = -4 + (i % 2) * 1.2; S.put(plaque(['剑心', '守正', '问道', '青锋', '不悔', '如雪'][i + (s > 0 ? 3 : 0)], 0.9, 0.5, { bg: '#5a5a5a', rim: '#3a3a3a', fg: '#f0f0f0' }), x, z + 0.17, 0, 1.6, { ink: false }); H.push(S.put(mesh(boxUV(new THREE.BoxGeometry(1.1, 2.2, 0.3), 1.1, 2.2, 0.3, 0.5).translate(0, 1.1, 0), M('#8a8680', { tx: TX.stone })), x, z)); S.box(x - 0.6, z - 0.2, x + 0.6, z + 0.2); }
    // ---- 后院 ----
    B(tower({ w: 9, d: 7, levels: 3, h: 3.0, wall: QC.wall, col: QC.col, roof: QC.roof, ridge: QC.ridge, sign: '凌霄阁', base: 1.0, k: 0.45 }), 0, -36);
    B(hallP('内门弟子居', 11, 5.5), -30, -28); B(hallP('内门弟子居', 11, 5.5), -30, -40);
    B(hallQ('长老院', 10, 6), 30, -28); B(hallQ('执法堂', 10, 6), 30, -41);
    B(hallP('静室', 6, 4.5, { base: 0.5 }), -48, -36);
    openHall(hall({ w: 4.2, d: 4.2, h: 2.6, open: true, col: QC.col, roof: QC.roof, ridge: QC.ridge, base: 0.3, pyramid: true, k: 1, rise: 2.0 }), -14, -50);
    const ta = pagoda({ levels: 7, r: 2.4, seg: 8, body: '#e8e4dc', roof: QC.roof, trim: QC.ridge }); H.push(S.put(ta, 0, -58, 0, 0, { bake: true })); S.circ(0, -58, 3.2); S.mark(-3.5, -61.5, 3.5, -54.5);
    // 剑冢：大石插镇派巨剑 + 一圈剑林
    S.ref('snowRock', 2, 40, -58, 2.8, 0.6, 2.4);
    const sw = bigSword(7.5, { blade: '#cfe6f2', glow: '#6ad8ff', grip: '#2a4a6a' }); sw.rotation.set(0.1, 0.4, -0.14); S.put(sw, 40, -58, 0, 0.6); H.push(sw);
    const swE = S.emit(40, 5, -58, '#7ad8ff', 1.3, 'lantern');
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + rng() * 0.2, r = 4 + rng() * 3, b = bigSword(1.2 + rng() * 0.9, { blade: '#b8c4cc', grip: '#3a3a40' }); b.rotation.set((rng() - 0.5) * 0.4, rng() * TAU, (rng() - 0.5) * 0.4); S.put(b, 40 + Math.sin(a) * r, -58 + Math.cos(a) * r, 0, -0.3, { bake: true }); }
    S.mark(32, -66, 48, -50);
    S.put(plaque('剑冢', 1.6, 0.55), 40, -50.4, 0, 0.8, { ink: false });
    // 思过崖
    cliff(S, -42, -61, rng);
    S.put(plaque('思过崖', 1.8, 0.55), -42, -56.6, 0, 1.2, { ink: false });
    // 石灯沿中轴
    for (const z of [52, 42, 32, 24, -18, -26]) for (const s of [-1, 1]) S.ref('stoneLan', z * 3 + s, s * 3.3, z, 1, 0, 0.35);
    for (const s of [-1, 1]) for (const z of [-24, -46]) H.push(S.lantern(s * 3.2, z, 2.4));
    const R = QF_PEOPLE();
    // 人站的地方别长树
    for (const [x, z] of [...R.disciples, ...R.npcs.map((n) => n.p), ...R.npcs.flatMap((n) => n.route || []), R.elder]) S.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5);
    // 院内雪松 + 墙外一圈雪松林 + 雪堆
    const inside = (x, z) => Math.abs(x) < W.x + 3 && z > W.n - 3 && z < W.s + 3;
    S.scatter(rng, 70, 8, W.x * 1.2, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.0 + r() * 0.5, r() * TAU, 0.7), (x, z) => !inside(x, z) || !S.free(x, z, 2.2) || Math.abs(x) < 6);
    S.scatter(rng, 120, 76, 92, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.1 + r() * 0.6, r() * TAU, 0.8), (x, z) => inside(x, z) || (Math.abs(x) < 12 && z > 0));
    S.scatter(rng, 40, 10, 88, (x, z, r, i) => S.ref(i % 3 ? 'drift' : 'snowRock', i, x, z, 0.9 + r() * 0.8, r() * TAU, i % 3 ? 0 : 0.7), (x, z) => !S.free(x, z, 2) || (Math.abs(x) < 12 && z > W.s));

    return { ...R,
      look: { robe: '#c8d8e4', robe2: '#eef2f6', belt: '#5a6a7a', hairStyle: [2, 2, 1, 3], sword: true },
      elderName: '陈守拙',
      // 灭门（GDD：放任就变废墟，永久保留）：所有建筑烧成焦黑台基、断柱、瓦砾；镇派巨剑断成两截
      ruin() { for (const o of H) { o.visible = false; if (o.userData.em) o.userData.em.power = 0; } swE.power = 0; ruinQingfeng(S, H); },
    };
  },
};

// 青锋剑派的人：执事 / 锚点 / 无名弟子（位置、朝向、动作）/ 有名有姓的门人
function QF_PEOPLE() {
  const elderLook = (o) => ({ skin: '#eac3a0', hair: '#e8e8ec', hairStyle: 2, age: 'elder', beard: true, robe: '#f0ece0', robe2: '#7ab8e8', belt: '#2a4a6a', sword: false, ...o });
  const outer = { robe: '#c8d8e4', robe2: '#eef2f6', belt: '#5a6a7a' };    // 外门：灰蓝
  const inner = { robe: '#7ab8e8', robe2: '#eef4fa', belt: '#2a4a6a' };    // 内门：青蓝
  const servant = { robe: '#8a7058', robe2: '#c8b8a0', belt: '#4a3828', sword: false };
  return {
    elder: [38, 44.2, 0], yard: [-11, 44.5], lib: [-34, 1.3], stele: [-8, 68], front: [0, 68], arena: [13, 36],
    disciples: [
      // 外院演武场：大师兄领着十二个外门弟子操练（四列三排，面朝南）
      ...[30, 34, 38].flatMap((z) => [-16, -12.7, -9.4, -6.1].map((x) => [x, z, 0, 'drill'])),
      // 擂台上两对对练
      [11.5, 34.5, Math.PI / 2, 'spar'], [13.1, 34.5, -Math.PI / 2, 'spar'], [12.9, 37.8, Math.PI / 2, 'spar'], [14.5, 37.8, -Math.PI / 2, 'spar'],
      // 青锋殿前打坐听讲
      ...[-6, -3, 0, 3, 6].flatMap((x) => [[x, 3, Math.PI, 'sit'], [x + 1.5, 5.4, Math.PI, 'sit']]),
      // 后院内门弟子对练
      [-21.5, -34, Math.PI / 2, 'spar'], [-19.9, -34, -Math.PI / 2, 'spar'], [-21.5, -36.5, Math.PI / 2, 'spar'], [-19.9, -36.5, -Math.PI / 2, 'spar'],
    ],
    npcs: [
      { name: '凌青锋', title: '掌门', p: [0, -30.5, 0], look: elderLook({ hair: '#9a9aa4', robe: '#eef4fa', robe2: '#3a6a9a', sword: true }), act: 'idle', lines: ['青锋剑派立派三百年，靠的不是剑利，是心正。', '后山剑冢里那柄「青锋」，是开派祖师的佩剑。剑在，派在。', '近来山下魔修的踪迹越来越多……你在外行走，多加小心。'] },
      { name: '柳寒松', title: '大长老', p: [6, -1.2, 0], look: elderLook({ robe2: '#4a7aa8' }), lines: ['掌门闭关参剑，派中俗务都由老夫照看。', '外门弟子三年一考，过了才能入内门。'] },
      { name: '苏慕白', title: '传功长老', p: [0, 0.2, 0], look: elderLook({ hair: '#d8d8e0', beard: false, robe2: '#7ab8e8' }), act: 'cast', lines: ['剑招是死的，剑意是活的。坐下，静心。', '你听得懂几分，就看你的悟性了。'] },
      { name: '铁无情', title: '执法长老', p: [30, -36.6, 0], look: elderLook({ hair: '#3a3438', robe: '#3a3e48', robe2: '#8a2a2a', belt: '#1a1a20', sword: true }), lines: ['门规十八条，条条见血。', '偷学别派剑法的人，在我这里是要上思过崖的。'] },
      { name: '何济生', title: '丹房长老', p: [36.2, 8.6, -Math.PI / 2], look: elderLook({ robe: '#e8e4d8', robe2: '#5a8a4a' }), act: 'cast', lines: ['火候差一分，丹就废了。别靠太近。', '灵药园的药苗是我一棵一棵看着长大的。'] },
      { name: '欧冶平', title: '铸剑师', p: [48.6, 8.4, -0.6], look: { skin: '#c89a78', hair: '#2a2420', hairStyle: 0, robe: '#5a4a3a', robe2: '#3a2e24', belt: '#2a1e14', sword: false, beard: true }, act: 'work', lines: ['剑要千锤，人也一样。', '弟子们的剑都是我打的。断了拿来，给你补。'] },
      { name: '老墨', title: '守阁人', p: [-30.4, 1.6, -0.5], look: elderLook({ robe: '#8a8478', robe2: '#5a5448', sword: false }), act: 'sit', lines: ['嘘——藏经阁里不许大声说话。', '书不会跑。夜里也有人来翻？呵呵，老头子睡得沉。'] },
      { name: '林逸风', title: '大师兄', p: [-11, 26.2, Math.PI], look: { ...inner, hairStyle: 2 }, act: 'drill', lines: ['出剑要稳！手腕不许抖！', '你也是来学剑的？先扎三个月马步再说。', '师父说我的剑太急……我还在想是什么意思。'] },
      { name: '叶清霜', title: '二师姐', p: [-14, -50, 0], look: { ...inner, hair: '#1a1418', hairStyle: 1 }, act: 'drill', lines: ['……（她收剑回鞘，冷冷看了你一眼）', '八角亭这里清静，练剑最好。别站在我剑路上。'] },
      { name: '苏小鱼', title: '小师妹', p: [-6, 12, 0], look: { ...inner, hairStyle: 3, age: 'child' }, route: [[-6, 12], [6, 12], [6, 15], [-6, 15]], speed: 1.6, pause: 1.2, lines: ['你是新来的吗？我带你逛逛呀！', '大师兄又在骂人了……其实他人很好的。', '听说后山剑冢晚上会发光！我不敢一个人去。'] },
      { name: '韩岳', title: '内门弟子', p: [-23.2, -38.6, Math.PI / 2], look: { ...inner, hairStyle: 0 }, act: 'spar', lines: ['赵师弟，再来一局！', '内门大比我一定要进前三。'] },
      { name: '赵临川', title: '内门弟子', p: [-21.6, -38.6, -Math.PI / 2], look: { ...inner, hairStyle: 2 }, act: 'spar', lines: ['韩师兄力气大，可惜慢了点。', '我想去剑宗看看，听说那里有九重剑阶。'] },
      { name: '王二虎', title: '外门弟子', p: [7.6, 51.4, Math.PI], look: { ...outer, hairStyle: 0 }, act: 'drill', lines: ['嘿！哈！……这木桩比我还硬。', '俺爹说进了青锋剑派就能吃饱饭。'] },
      { name: '李小满', title: '外门弟子', p: [46, 23.4, 0], look: { ...outer, hairStyle: 3 }, route: [[46, 23.4], [38, 32.5], [34, 31.6], [38, 32.5]], speed: 1.2, pause: 3, act: 'work', lines: ['挑水、劈柴、扫地……什么时候才能练剑啊。', '刘婶做的馒头最好吃！'] },
      { name: '周铁柱', title: '外门弟子', p: [29.6, 27, 0], look: { ...outer, hairStyle: 0, sword: false }, act: 'work', lines: ['劈柴也是练功！师兄说的。', '一百……一百零一……'] },
      { name: '张伯', title: '杂役', p: [-1.6, 56, 0], look: { ...servant, hair: '#a8a8a8', age: 'elder', beard: true }, route: [[-1.6, 56], [-1.6, 21], [1.6, 21], [1.6, 56]], speed: 0.9, pause: 2, act: 'work', lines: ['老头子在这扫了四十年地，看着掌门从娃娃长成掌门。', '雪天路滑，慢点走。'] },
      { name: '刘婶', title: '膳堂厨娘', p: [37, 31.4, 0], look: { ...servant, hair: '#3a2a20', hairStyle: 1 }, act: 'idle', lines: ['饿了吧？来，刚出笼的馒头。', '这帮小子，一个比一个能吃。'] },
      { name: '阿青', title: '药童', p: [-40, 27.6, 0], look: { robe: '#7ab06a', robe2: '#e8f0e0', belt: '#3a5a2a', hairStyle: 3, age: 'child', sword: false }, act: 'work', lines: ['这是凝露草，那是火灵芝……别踩！', '何长老说我再认错一味药就不许吃晚饭。'] },
      { name: '孟坚', title: '守山弟子', p: [-3.4, 64.5, 0], look: { ...inner, hairStyle: 0 }, act: 'idle', lines: ['青锋剑派山门。来者何事？', '拜师？去外院执事堂找陈执事。'] },
      { name: '孙平', title: '守山弟子', p: [3.4, 64.5, 0], look: { ...inner, hairStyle: 2 }, act: 'idle', lines: ['站岗一整天，脚都冻麻了。', '最近山下不太平，夜里有怪声。'] },
      { name: '楚狂', title: '思过弟子', p: [-42, -54.2, Math.PI], look: { ...inner, hair: '#2a1a14', hairStyle: 1 }, act: 'sit', lines: ['……我没错。那一剑，我不后悔。', '面壁三年，还剩两年零七个月。'] },
      { name: '哑叔', title: '撞钟人', p: [-17, 15.6, 0], look: { ...servant, hair: '#6a6a6a', age: 'elder', beard: true }, act: 'idle', lines: ['（他比划着：早晚各撞一百零八下）', '（他指了指钟楼，笑着点点头）'] },
    ],
  };
}

// 灭门废墟：每栋烧掉的建筑原地留一座焦黑台基 + 几根断柱 + 瓦砾，有的压着半片塌顶
function ruinQingfeng(S, H) {
  const rng = rng32(7), char = M('#2a2624'), ash = M('#4a4440'), burnt = M('#3a2a22');
  const G = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); G.add(o); };
  for (const o of H) {
    const a = o.userData.at; if (!a) continue;
    const [x, z, w, d] = a;
    add(new THREE.BoxGeometry(w, 0.4, d).translate(0, 0.2, 0), M('#5a5450'), x, 0, z);
    const n = Math.max(3, Math.round(w / 2));
    for (let i = 0; i < n; i++) { const h = 0.5 + rng() * 2.2; add(new THREE.CylinderGeometry(0.17, 0.2, h, 7).translate(0, h / 2, 0), burnt, x - w / 2 + 0.8 + i * (w - 1.6) / Math.max(1, n - 1), 0.4, z + d / 2 - 0.9); }
    for (let i = 0; i < Math.round(w * d / 6); i++) add(new THREE.BoxGeometry(0.4 + rng() * 1.2, 0.2 + rng() * 0.5, 0.3 + rng() * 0.8), rng() < 0.5 ? char : ash, x + (rng() - 0.5) * w * 0.9, 0.5 + rng() * 0.3, z + (rng() - 0.5) * d * 0.9, rng() * 0.6, rng() * TAU, rng() * 0.6);
    if (w > 6) add(new THREE.BoxGeometry(w * 0.7, 0.16, d * 0.5), char, x + (rng() - 0.5), 1.4, z - d * 0.1, 0.35, rng() * 0.3, 0.12);
  }
  S.put(G, 0, 0, 0, 0, { bake: true });
  // 镇派巨剑：断在石头里，上半截倒在地上
  const lo = bigSword(7.5, { blade: '#8a949a', grip: '#2a3a4a' }); lo.scale.set(1, 0.38, 1); lo.children.slice(1).forEach((c) => (c.visible = false)); lo.rotation.set(0.1, 0.4, -0.14); S.put(lo, 40, -58, 0, 0.6);
  const hi = bigSword(7.5, { blade: '#8a949a', grip: '#2a3a4a' }); hi.rotation.set(0, 0.9, Math.PI / 2 - 0.08); S.put(hi, 43.5, -54.5, 0, 0.3);
}

// ===================== 2 寒溪宗：结冰溪谷里的冰系宗门（和青锋剑派同规格，院墙 104 × 120 米）=====================
// 一条半冻的寒溪从西往东斜穿院子，把宗门分成南北两半：南岸外院（冰石山门、演法场 + 比试台、执事堂、膳堂、冰窖、外门弟子居、雪莲园），
// 溪上一座白石桥 + 两座木桥，岸边打坐石台、观澜水榭、听雪阁（藏经）；北岸内院（冰莲池、寒溪殿、冰心堂、丹房、寒月楼、长老院、执法堂、
// 内门弟子居、观雪亭、寒玉台、寒魄巨冰晶、冰窟）。白蓝配色，屋顶积雪。
const HX_WALL = { x: 52, s: 56, n: -64 };
const HC = { col: '#5a7c9c', wall: '#f2f4f6', roof: '#dfe8f0', ridge: '#7a90a8', col2: '#6a7a88', roof2: '#cfd9e2', pave: '#d8dde2', ice: '#d6eefa' };
// 寒溪的中线（本地坐标，Catmull-Rom 平滑曲线，见 ENVIRONMENT.md 第 2 条）
const HX_STREAM = [[-64, -8], [-40, -5], [-20, 3], [0, 6], [20, 9], [38, 14], [64, 18]];
const HX_HW = 1.7, HX_ICE = 3.4;   // 水道半宽 / 冰岸外沿半宽
const HX_PAVE = [[-2.5, 11, 2.5, 66], [-20, 18, 20, 48], [-9, 54, 9, 68], [-2.5, -44, 2.5, 1], [-14, -21, 14, -3], [-40, 49.5, 40, 52], [-36, -33, 36, -30.5], [-40, 13, -2.5, 15.5], [2.5, 15.5, 40, 18]];

// 冰晶：拉长的八面体
function crystal(h, color = '#bfe8ff') {
  return mesh(new THREE.OctahedronGeometry(1, 0).scale(0.28 * h / 1.6, h / 2, 0.28 * h / 1.6).translate(0, h / 2 * 0.9, 0), M(color, { emissive: '#5ab8f0', ei: 0.35 }));
}
function crystalCluster(n, size, rng) {
  const G = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = crystal(size * (0.45 + rng() * 0.7)); const a = rng() * TAU, r = i ? size * (0.15 + rng() * 0.3) : 0;
    c.position.set(Math.sin(a) * r, -0.1, Math.cos(a) * r); c.rotation.set((rng() - 0.5) * 0.7, rng() * TAU, (rng() - 0.5) * 0.7); G.add(c);
  }
  return G;
}
// 冰石山门：两根六棱冰石柱 + 石梁 + 匾，柱头冰晶
function iceGate(name) {
  const G = new THREE.Group(), st = M('#b8d0e2', { tx: TX.stone });
  for (const s of [-1, 1]) {
    G.add(at(mesh(cylUVs(new THREE.CylinderGeometry(0.7, 0.85, 6.5, 6), 0.85, 6.5).translate(0, 3.25, 0), st), s * 4.6, 0, 0));
    G.add(at(mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.6, 6).translate(0, 0.3, 0), M('#8a9aa8', { tx: TX.stone })), s * 4.6, 0, 0));
    const c = crystal(1.8); c.position.set(s * 4.6, 6.4, 0); G.add(c);
  }
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(11.6, 0.8, 1.1), 11.6, 0.8, 1.1, 0.45), st), 0, 5.6, 0));
  G.add(at(mesh(boxUV(new THREE.BoxGeometry(9.6, 0.4, 0.8), 9.6, 0.4, 0.8, 0.45), st), 0, 4.5, 0));
  const r = roof(12.4, 1.8, 0.7, HC.roof, { ridge: HC.ridge, k: 0.3 }); r.position.y = 6.0; G.add(r);
  for (const z of [0.42, -0.42]) { const p = plaque(name, 3.4, 0.9, { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' }); p.position.set(0, 5.05, z * 1.3); if (z < 0) p.rotation.y = Math.PI; G.add(p); }
  return G;
}
const cylUVs = (geo, r, h) => { const uv = geo.attributes.uv, C = TAU * r; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * C * 0.45, uv.getY(i) * h * 0.45); return geo; };
// 打坐石台：一块扁平大石
function medStone(rng) {
  return mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 7).translate(0, 0.17, 0).scale(1, 1, 0.8 + rng() * 0.3), M('#9aa4ae', { tx: TX.stone }), { recv: true });
}
// 石桥：平铺桥面（玩家地面是平的，桥面不能拱太高）+ 两侧弧形栏板 + 望柱
function bridge(len, w, o = {}) {
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
// 冰窟：几块大岩围出洞口，洞里透蓝光
function iceCave(S, lx, lz, rng) {
  for (let i = 0; i < 7; i++) { const a = Math.PI + (i - 3) * 0.45; S.ref('snowRock', i + 11, lx + Math.sin(a) * 4.2, lz + Math.cos(a) * 3.2 - 1, 2.4 + rng() * 1.6, rng() * TAU, 1.9); }
  const mouth = mesh(new THREE.CircleGeometry(1.6, 16, 0, Math.PI), glow('#3a8ad8', 1.4)); S.put(mouth, lx, lz + 0.6, 0, 0.02, { ink: false });
  S.put(crystalCluster(5, 1.8, rng), lx + 1.6, lz + 1.2); S.put(crystalCluster(4, 1.4, rng), lx - 1.8, lz + 1.4);
  S.mark(lx - 6, lz - 5, lx + 6, lz + 2);
  return S.emit(lx, 1.2, lz + 0.8, '#5ab8ff', 1.0, 'lantern');
}

// 溪道采样点（地面着色用：溪两岸不长草，铺冰岸沙石）
let HX_PTS = null;
function hxStreamDist(lx, lz) {
  if (!HX_PTS) HX_PTS = new THREE.CatmullRomCurve3(HX_STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(120).map((p) => [p.x, p.z]);
  if (lx < HX_STREAM[0][0] - 2 || lx > HX_STREAM[HX_STREAM.length - 1][0] + 2) return 99;
  let d = 1e9; for (const [x, z] of HX_PTS) { const q = (x - lx) ** 2 + (z - lz) ** 2; if (q < d) d = q; } return Math.sqrt(d);
}
const hanxi = {
  r: 88, tint: [228, 236, 242], tintK: 0.8,
  ground: (lx, lz, n) => (HX_PAVE.some(([a, b, c, d]) => lx > a - n * 0.3 && lx < c + n * 0.3 && lz > b - n * 0.3 && lz < d + n * 0.3) ? 1 : Math.abs(lz - 5) < 20 && hxStreamDist(lx, lz) < HX_ICE + 0.9 + n * 0.8 ? 2 : 0),
  build(S) {
    const rng = rng32(23), W = HX_WALL, g = S.g;
    const B = (o, x, z, ry = 0) => S.bld(o, x, z, ry);
    const hallH = (sign, w, d, extra = {}) => hall({ w, d, h: 2.9, wall: HC.wall, col: HC.col, roof: HC.roof, ridge: HC.ridge, sign, base: 0.5, signC: { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' }, ...extra });
    const hallP = (sign, w, d, extra = {}) => hall({ w, d, h: 2.5, wall: '#eceff2', col: HC.col2, roof: HC.roof2, ridge: HC.ridge, sign, base: 0.35, rise: d * 0.32, signC: { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' }, ...extra });
    const openHall = (o, x, z) => { S.put(o, x, z, 0, 0, { bake: true }); const hw = o.userData.foot[0] / 2 - 1.05, hd = o.userData.foot[1] / 2 - 1.05; for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.circ(x + sx * hw, z + sz * hd, 0.35); S.mark(x - hw, z - hd, x + hw, z + hd); };

    // ---- 寒溪：曲线采样 → 水道（lab 水面着色器，冬天自动结冰）+ 两岸冰面（不和水面重叠）----
    const curve = new THREE.CatmullRomCurve3(HX_STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const pts = curve.getSpacedPoints(160).map((p, i, a) => { const q = a[Math.min(a.length - 1, i + 1)], r = a[Math.max(0, i - 1)], tx = q.x - r.x, tz = q.z - r.z, l = Math.hypot(tx, tz) || 1; return { x: p.x, z: p.z, tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l }; });
    const near = (lx, lz) => { let best = 1e9, bi = 0; for (let i = 0; i < pts.length; i++) { const d = (pts[i].x - lx) ** 2 + (pts[i].z - lz) ** 2; if (d < best) { best = d; bi = i; } } return { d: Math.sqrt(best), p: pts[bi] }; };
    const streamZ = (lx) => { let b = pts[0]; for (const p of pts) if (Math.abs(p.x - lx) < Math.abs(b.x - lx)) b = p; return b.z; };
    const water = makeLabWater({
      x0: S.x - 66, z0: S.z - 66, size: 132, N: 256,
      depthAt: (x, z) => Math.max(0, HX_HW - near(x - S.x, z - S.z).d) * 0.3,
      flowAt: (x, z) => { const { d, p } = near(x - S.x, z - S.z), k = d < HX_HW + 0.3 ? 0.8 : 0; return [p.tx * k, p.tz * k]; },
    });
    {
      const P = [], E = [], I = [];
      pts.forEach((p, i) => { for (const k of [-1, 0, 1]) { P.push(S.x + p.x + p.nx * HX_HW * k, 0.031, S.z + p.z + p.nz * HX_HW * k); E.push(k === 0 ? 0.5 : 1); } if (i < pts.length - 1) { const a = i * 3; I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); } });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('edge', new THREE.Float32BufferAttribute(E, 1)); geo.setIndex(I);
      const wm = new THREE.Mesh(geo, water); wm.receiveShadow = false; g.scene.add(wm);
      // 冰岸：水道两边各一条，外沿带点起伏
      const iceM = toon(HC.ice, { ref: true, emissive: '#6ab8e8', ei: 0.12, unique: true }); iceM.polygonOffset = true; iceM.polygonOffsetFactor = -2; iceM.polygonOffsetUnits = -2;
      for (const s of [-1, 1]) {
        const Q = [], J = [];
        pts.forEach((p, i) => { const wOut = HX_ICE + Math.sin(i * 0.7 + s) * 0.5 + Math.sin(i * 0.23) * 0.4; for (const r of [HX_HW, wOut]) Q.push(S.x + p.x + p.nx * r * s, 0.03, S.z + p.z + p.nz * r * s); if (i < pts.length - 1) { const a = i * 2; J.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
        const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.Float32BufferAttribute(Q, 3)); ig.setIndex(J); ig.computeVertexNormals();
        if (ig.attributes.normal.getY(0) < 0) { ig.setIndex(J.map((v, i) => J[i - (i % 3) + [0, 2, 1][i % 3]])); ig.computeVertexNormals(); }
        g.scene.add(mesh(ig, iceM, { cast: false, recv: true }));
      }
      // 涉水：水道里水深 0.3（浅溪，只能涉水；冬天结冰为 0，见 world.waterDepth）
      g.world.extraWater.push((x, z) => { const lx = x - S.x, lz = z - S.z; if (Math.abs(lx) > 66 || lz < -20 || lz > 30) return 0; const d = near(lx, lz).d; return d < HX_HW ? 0.3 * Math.min(1, (HX_HW - d) / 0.4) : 0; });
      S.anims.push(() => { water.uniforms.uTime.value = g.world.time; if (g.world.water) water.uniforms.uLight.value = g.world.water.uniforms.uLight.value; });
      // 溪面寒雾：贴着水面慢慢飘的几片白雾
      const mistM = new THREE.MeshBasicMaterial({ color: '#f4faff', transparent: true, opacity: 0.25, depthWrite: false });
      const mists = [];
      for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4 + rng() * 4, 2.2).rotateX(-Math.PI / 2), mistM.clone()); m.userData.u = rng(); m.userData.ph = rng() * TAU; g.scene.add(m); mists.push(m); }
      S.anims.push((dt, t) => { for (const m of mists) { const u = (m.userData.u + t * 0.004) % 1, p = pts[Math.floor(u * (pts.length - 1))]; m.position.set(S.x + p.x + p.nx * Math.sin(t * 0.3 + m.userData.ph), 0.35 + Math.sin(t * 0.5 + m.userData.ph) * 0.12, S.z + p.z); m.rotation.y = Math.atan2(p.tx, p.tz); m.material.opacity = 0.16 + 0.12 * Math.sin(t * 0.4 + m.userData.ph); } });
    }
    // 水道里不长树：整条溪登记占地
    for (let i = 0; i < pts.length; i += 6) { const p = pts[i]; S.mark(p.x - HX_ICE - 0.5, p.z - HX_ICE - 0.5, p.x + HX_ICE + 0.5, p.z + HX_ICE + 0.5); }

    // ---- 铺地 ----
    for (const [a, b, c, d] of HX_PAVE) S.paveRect(a, b, c, d, HC.pave);

    // ---- 院墙 + 角楼 ----
    const wall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      S.put(wallSeg(len, { h: 2.4, wall: '#f2f4f6', cap: HC.roof }), (x0 + x1) / 2, (z0 + z1) / 2, ry, 0, { bake: true });
      S.box(Math.min(x0, x1) - 0.35, Math.min(z0, z1) - 0.35, Math.max(x0, x1) + 0.35, Math.max(z0, z1) + 0.35);
    };
    // 东西两面墙在溪口断开（水门）
    const zw = streamZ(-W.x), ze = streamZ(W.x);
    wall(-W.x, W.s, -6, W.s); wall(6, W.s, W.x, W.s); wall(-W.x, W.n, W.x, W.n);
    wall(-W.x, W.n, -W.x, zw - HX_ICE); wall(-W.x, zw + HX_ICE, -W.x, W.s); wall(W.x, W.n, W.x, ze - HX_ICE); wall(W.x, ze + HX_ICE, W.x, W.s);
    for (const sx of [-1, 1]) for (const z of [W.s, W.n]) B(tower({ w: 3.4, d: 3.4, levels: 2, h: 2.4, wall: HC.wall, col: HC.col, roof: HC.roof, ridge: HC.ridge, base: 0.5, door: false }), sx * W.x, z);

    // ---- 山门 ----
    S.put(iceGate('寒溪宗'), 0, W.s, 0, 0, { bake: true }); for (const s of [-1, 1]) S.circ(s * 4.6, W.s, 1.0);
    for (const s of [-1, 1]) { S.put(crystalCluster(6, 2.6, rng), s * 8.5, 62); S.circ(s * 8.5, 62, 1.4); }
    for (const z of [66, 60]) for (const s of [-1, 1]) S.ref('stoneLan', z + s, s * 3.6, z, 1.1, 0, 0.35);

    // ---- 南岸外院 ----
    // 演法场：东边比试台，四角冰柱
    const arena = podium(10, 10, 0.35, '#c8d2da', { stairW: 3 }); S.put(arena, 12, 30, 0, 0, { bake: true, ink: false }); S.mark(7, 25, 17, 35);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { S.put(crystal(3.2, '#cfeeff'), 12 + sx * 4.6, 30 + sz * 4.6); S.circ(12 + sx * 4.6, 30 + sz * 4.6, 0.45); }
    for (let i = 0; i < 5; i++) { const x = -16 + i * 3.2; S.put(crystal(2.2, '#d8f2ff'), x, 20.5); S.circ(x, 20.5, 0.35); }   // 练寒冰掌的冰柱靶
    B(hallH('执事堂', 10, 6), 36, 46);
    B(hallP('膳堂', 11, 6), 36, 33);
    for (const [x, z] of [[32, 26.5], [38, 26.5]]) { S.put(tableSet(), x, z, 0, 0, { bake: true }); S.box(x - 1.3, z - 1, x + 1.3, z + 1); }
    B(hallP('冰窖', 6.5, 4.5, { base: 0.3 }), 46, 22);
    S.put(well(), 26, 22.5, 0, 0, { bake: true }); S.circ(26, 22.5, 1.1);
    S.put(woodpile(), 44, 31, Math.PI / 2, 0, { bake: true }); S.box(43.4, 29.8, 44.6, 33);
    B(hallP('外门弟子居', 11, 5.5), -38, 46); B(hallP('外门弟子居', 11, 5.5), -38, 35);
    S.put(fence(16, 8), -38, 24.5, 0, 0, { bake: true }); S.mark(-46, 20.5, -30, 28.5);
    for (const [x, z] of [[-42, 23], [-34, 23], [-42, 26.2], [-34, 26.2]]) S.put(herbBed(6, 2.2, rng), x, z, 0, 0, { bake: true, ink: false });   // 雪莲园

    // ---- 溪上：白石桥（中轴）+ 东西两座木桥；岸边打坐石台、观澜水榭、听雪阁 ----
    const bz = streamZ(0); S.put(bridge(10, 4.2), 0, bz, 0, 0, { bake: true });
    for (const s of [-1, 1]) S.box(s * 2.1 - 0.15, bz - 5, s * 2.1 + 0.15, bz + 5);
    for (const x of [-30, 30]) { const z = streamZ(x), p = near(x, z).p; S.put(bridge(8.4, 2.4, { color: '#8a6a4a', tx: TX.wood }), x, z, Math.atan2(p.nx, p.nz), 0, { bake: true }); }
    const medPts = [-44, -34, -14, 14, 24, 42].map((x, i) => { const p = near(x, streamZ(x)).p, s = i % 2 ? 1 : -1, r = HX_ICE + 1.6; return [p.x + p.nx * r * s, p.z + p.nz * r * s, Math.atan2(-p.nx * s, -p.nz * s)]; });
    for (const [x, z] of medPts) S.put(medStone(rng), x, z, rng() * TAU, 0, { bake: true, ink: false });
    openHall(hall({ w: 6, d: 5, h: 2.6, open: true, col: HC.col, roof: HC.roof, ridge: HC.ridge, base: 0.25, sign: '观澜榭', rise: 1.6 }), 12, streamZ(12));
    B(tower({ w: 6.5, d: 5.5, levels: 3, wall: HC.wall, col: HC.col, roof: HC.roof, ridge: HC.ridge, sign: '听雪阁', base: 0.6, k: 0.5, signC: { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' } }), -26, -10);

    // ---- 北岸内院 ----
    // 冰莲池：常年封冻的圆池（实心冰面，能走），冰莲发光
    {
      const pr = 4.6, ice = mesh(new THREE.CircleGeometry(pr, 40).rotateX(-Math.PI / 2), toon('#cfeefc', { ref: true, emissive: '#5ab0e8', ei: 0.25, unique: true }), { cast: false, recv: true });
      ice.material.polygonOffset = true; ice.material.polygonOffsetFactor = -3; S.put(ice, 0, -12, 0, 0.035, { ink: false });
      S.put(mesh(new THREE.TorusGeometry(pr + 0.15, 0.28, 6, 40).rotateX(Math.PI / 2), M('#c8ccd0', { tx: TX.stone })), 0, -12, 0, 0.12, { bake: true });
      const lotus = () => { const L = new THREE.Group(); L.add(mesh(new THREE.CircleGeometry(0.55, 10).rotateX(-Math.PI / 2), M('#8ac8b8'), { cast: false })); for (let k = 0; k < 7; k++) { const p = mesh(new THREE.ConeGeometry(0.16, 0.5, 4).translate(0, 0.25, 0), glow('#bfefff', 1.3)); p.rotation.set(0.6, k / 7 * TAU, 0, 'YXZ'); p.position.y = 0.05; L.add(p); } return L; };
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3, r = 1.2 + (i % 3) * 1.0; S.put(lotus(), Math.sin(a) * r, -12 + Math.cos(a) * r, 0, 0.05, { ink: false }); }
      S.emit(0, 1.2, -12, '#8ad8ff', 0.8, 'lantern');
    }
    B(hall({ w: 18, d: 10, h: 4.2, wall: HC.wall, col: HC.col, roof: HC.roof, ridge: HC.ridge, sign: '寒溪殿', base: 1.2, tiers: 2, stairW: 5, signC: { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' } }), 0, -28.5);
    for (const s of [-1, 1]) { S.put(crystalCluster(7, 3.4, rng), s * 15, -23); S.circ(s * 15, -23, 1.8); S.mark(s * 15 - 2.5, -25.5, s * 15 + 2.5, -20.5); }
    for (const s of [-1, 1]) S.lantern(s * 4.5, -21.6, 2.6, '#7ad0ff');
    B(hallH('冰心堂', 11, 6.5), -30, -24);
    B(hallH('丹房', 9, 6), 30, -24);
    const dan = cauldron(0.8, '#5a6a7a', { brew: '#8ae0ff', fire: '#6ac8ff' }); S.put(dan, 30, -16.5); S.circ(30, -16.5, 1.0);
    B(hallP('客舍', 8, 5), 44, 3); B(hallP('库房', 7, 5), 45, -26);
    openHall(hall({ w: 4.2, d: 4.2, h: 2.6, open: true, col: HC.col, roof: HC.roof, ridge: HC.ridge, base: 0.3, pyramid: true, k: 1, rise: 2.0 }), 44, -11);
    B(tower({ w: 9, d: 7, levels: 3, h: 3.0, wall: HC.wall, col: HC.col, roof: HC.roof, ridge: HC.ridge, sign: '寒月楼', base: 1.0, k: 0.45, signC: { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' } }), 0, -48);
    B(hallP('内门弟子居', 11, 5.5), -32, -40); B(hallP('内门弟子居', 11, 5.5), -32, -53);
    B(hallH('长老院', 10, 6), 32, -40); B(hallH('执法堂', 10, 6), 32, -53);
    // 寒玉台：圆石台 + 冰晶，夜里有人抚琴
    S.put(mesh(new THREE.CylinderGeometry(4, 4.3, 0.3, 24).translate(0, 0.15, 0), M('#dfe6ec', { tx: TX.stone }), { recv: true }), -42, -12, 0, 0, { bake: true }); S.mark(-46.5, -16.5, -37.5, -7.5);
    S.put(crystalCluster(5, 2.2, rng), -44.5, -14); S.circ(-44.5, -14, 1.1);
    // 寒魄巨冰晶：镇宗之宝，十米高，远处就能看到
    S.put(podium(6, 6, 0.6, '#b8c8d6'), -16, -58, 0, 0, { bake: true }); S.box(-19, -61, -13, -55);
    const big = crystalCluster(1, 10, () => 0.5); big.children[0].rotation.set(0, 0.4, 0); S.put(big, -16, -58, 0, 0.6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; S.put(crystal(2 + rng() * 1.5), -16 + Math.sin(a) * 2.2, -58 + Math.cos(a) * 2.2, rng() * TAU, 0.5); }
    S.put(plaque('寒魄', 1.4, 0.5, { bg: '#2a3a4a', rim: '#cfe6f6', fg: '#eaf6ff' }), -16, -54.6, 0, 0.9, { ink: false });
    const bigE = S.emit(-16, 6, -58, '#7ad8ff', 1.4, 'lantern');
    const caveE = iceCave(S, 16, -58, rng);
    // 冰晶闪光（共用材质一起明暗）
    const cm = M('#bfe8ff', { emissive: '#5ab8f0', ei: 0.35 }), cm2 = M('#cfeeff', { emissive: '#5ab8f0', ei: 0.35 });
    S.anims.push((dt, t) => { cm.emissiveIntensity = 0.3 + 0.2 * Math.max(0, Math.sin(t * 1.3)) ** 6; cm2.emissiveIntensity = 0.3 + 0.25 * Math.max(0, Math.sin(t * 0.9 + 2)) ** 8; bigE.power = 1.2 + Math.sin(t * 0.8) * 0.3; });
    // 灯、石灯
    for (const z of [62, 40, 28, -36, -42]) for (const s of [-1, 1]) S.ref('stoneLan', z * 3 + s + 7, s * 3.3, z, 1, 0, 0.35);

    const R = HX_PEOPLE(medPts);
    for (const [x, z] of [...R.disciples, ...R.npcs.map((n) => n.p), ...R.npcs.flatMap((n) => n.route || []), R.elder]) S.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5);
    // 打坐的人口吐白气
    {
      const puffM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }), puffs = [];
      const src = R.disciples.filter((d) => d[3] === 'sit').map(([x, z, f]) => [x + Math.sin(f) * 0.35, z + Math.cos(f) * 0.35]);
      src.forEach(([x, z], i) => { for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), puffM.clone()); m.userData = { x: S.x + x, z: S.z + z, ph: i * 0.73 + k * 1.4 }; g.scene.add(m); puffs.push(m); } });
      S.anims.push((dt, t) => { for (const m of puffs) { const u = ((t + m.userData.ph) % 2.8) / 2.8; m.position.set(m.userData.x, 1.0 + u * 0.7, m.userData.z); m.scale.setScalar(1 + u * 3); m.material.opacity = 0.45 * (1 - u) * Math.min(1, u * 6); } });
    }
    // 院内雪松 + 墙外雪松林 + 冰晶簇 + 雪堆
    const inside = (x, z) => Math.abs(x) < W.x + 3 && z > W.n - 3 && z < W.s + 3;
    S.scatter(rng, 60, 8, W.x * 1.2, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.0 + r() * 0.5, r() * TAU, 0.7), (x, z) => !inside(x, z) || !S.free(x, z, 2.2) || Math.abs(x) < 6);
    S.scatter(rng, 14, 10, W.x * 1.1, (x, z, r) => { S.put(crystalCluster(3 + Math.floor(r() * 4), 1.2 + r() * 1.2, r), x, z); S.circ(x, z, 0.7); S.mark(x - 1, z - 1, x + 1, z + 1); }, (x, z) => !inside(x, z) || !S.free(x, z, 2));
    S.scatter(rng, 110, 72, 88, (x, z, r, i) => S.ref('snowPine', i, x, z, 1.1 + r() * 0.6, r() * TAU, 0.8), (x, z) => inside(x, z) || (Math.abs(x) < 12 && z > 0) || near(x, z).d < HX_ICE + 2);
    S.scatter(rng, 40, 10, 86, (x, z, r, i) => S.ref(i % 3 ? 'drift' : 'snowRock', i, x, z, 0.9 + r() * 0.8, r() * TAU, i % 3 ? 0 : 0.7), (x, z) => !S.free(x, z, 2) || (Math.abs(x) < 12 && z > W.s));
    return { ...R, look: { robe: '#a8d8f0', robe2: '#f2f8fc', belt: '#4a7a9a', hairStyle: [1, 1, 2, 3], hair: '#1e1a20', sword: true }, elderName: '沈清和' };
  },
};

// 寒溪宗的人
function HX_PEOPLE(medPts) {
  const elderLook = (o) => ({ skin: '#eac3a0', hair: '#eef0f4', hairStyle: 2, age: 'elder', beard: true, robe: '#f2f6fa', robe2: '#a8d8f0', belt: '#4a7a9a', sword: false, ...o });
  const outer = { robe: '#d4e6f2', robe2: '#f6f9fb', belt: '#7a92a6' };   // 外门：月白
  const inner = { robe: '#a8d8f0', robe2: '#f2f8fc', belt: '#4a7a9a' };   // 内门：浅蓝
  const servant = { robe: '#7a8088', robe2: '#c0c6cc', belt: '#3a4048', sword: false };
  return {
    elder: [36, 40.2, 0], yard: [-11, 23], lib: [-26, -5.6], stele: [-8, 64], front: [0, 63], arena: [12, 30],
    disciples: [
      // 演法场：大师姐领十二个外门弟子练寒冰掌（施法），面朝南
      ...[25, 29, 33].flatMap((z) => [-16, -12.7, -9.4, -6.1].map((x) => [x, z, 0, 'cast'])),
      // 比试台两对
      [10.5, 28.5, Math.PI / 2, 'spar'], [12.1, 28.5, -Math.PI / 2, 'spar'], [11.9, 31.8, Math.PI / 2, 'spar'], [13.5, 31.8, -Math.PI / 2, 'spar'],
      // 溪边打坐石台，面朝溪水
      ...medPts.map(([x, z, f]) => [x, z, f, 'sit']),
      // 冰心堂前听讲打坐
      ...[-36, -33, -30, -27, -24].flatMap((x) => [[x, -18.5, Math.PI, 'sit'], [x + 1.5, -16.4, Math.PI, 'sit']]),
      // 内门弟子对练
      [-19.5, -46, Math.PI / 2, 'spar'], [-17.9, -46, -Math.PI / 2, 'spar'],
    ],
    npcs: [
      { name: '慕容雪', title: '宗主', p: [0, -42.4, 0], look: elderLook({ hair: '#f4f6fa', hairStyle: 1, beard: false, robe: '#f6fafe', robe2: '#5a8ab0' }), lines: ['寒溪的水，三百年没有全化过。', '冰系功法讲究一个「静」字。心不静，掌就冷不下来。', '后山那块寒魄，是本宗的根。'] },
      { name: '白砚秋', title: '大长老', p: [6, -21.6, 0], look: elderLook({ robe2: '#7aa8c8' }), lines: ['宗主常年在寒月楼闭关，宗里的事问我便是。', '入冬之后寒溪全冻，弟子们最爱在冰上练步法。'] },
      { name: '冷千霜', title: '传功长老', p: [-29, -21.2, 0], look: elderLook({ hair: '#d8dce4', hairStyle: 1, beard: false, robe2: '#a8d8f0' }), act: 'cast', lines: ['吸气——让寒气从掌心走一圈，再回丹田。', '冰心诀第一层：先学会不发抖。'] },
      { name: '严冬', title: '执法长老', p: [32, -49.6, 0], look: elderLook({ hair: '#4a4a52', robe: '#3a4652', robe2: '#9ac8e8', belt: '#1a2028', sword: true }), lines: ['宗规第一条：不得在寒溪里斗殴。', '偷学本宗功法的，冻上三天再说。'] },
      { name: '葛青崖', title: '丹房长老', p: [31.8, -14.8, -Math.PI / 2], look: elderLook({ robe: '#e8eef2', robe2: '#5a8a9a' }), act: 'cast', lines: ['冰魄丹要用寒火炼，火不能热。', '雪莲园的雪莲，十年才开一回。'] },
      { name: '闻溪', title: '守阁人', p: [-23.2, -5.4, -0.5], look: elderLook({ robe: '#9aa4ae', robe2: '#6a747e', beard: true }), act: 'sit', lines: ['听雪阁里的书怕潮，进去别带雪。', '夜里阁里有动静？大概是猫吧……哪来的猫。'] },
      { name: '江映雪', title: '大师姐', p: [-11, 37.2, Math.PI], look: { ...inner, hairStyle: 1, hair: '#141018' }, act: 'cast', lines: ['手掌再沉一点！寒气是从脚底起的。', '你也想学寒冰掌？先在雪地里站一个时辰。'] },
      { name: '顾长风', title: '二师兄', p: [12, 36.4, Math.PI], look: { ...inner, hairStyle: 2 }, act: 'idle', lines: ['比试台上点到为止，谁要是冻伤了人，严长老可不饶。', '我看你骨骼清奇……开玩笑的。'] },
      { name: '阿凝', title: '小师妹', p: [-2, 13, 0], look: { ...inner, hairStyle: 3, age: 'child' }, route: [[-2, 13], [-2, 0], [2, 0], [2, 13]], speed: 1.5, pause: 1.5, lines: ['桥下的鱼冻在冰里了！你快来看！', '师姐说我的掌是温的……可我已经很努力了。', '冬天整条溪都会冻住，可以一直滑到墙外！'] },
      { name: '洛霜', title: '内门弟子', p: [-19.5, -49, Math.PI / 2], look: { ...inner, hairStyle: 1 }, act: 'spar', lines: ['秦师兄，你的玄冰护体又慢了半拍。', '我想去寒魄跟前打坐，可那里只许真传弟子去。'] },
      { name: '秦寒', title: '内门弟子', p: [-17.9, -49, -Math.PI / 2], look: { ...inner, hairStyle: 2 }, act: 'spar', lines: ['再来！', '听说青锋剑派的剑能劈开冰……我不信。'] },
      { name: '何小舟', title: '外门弟子', p: [-36, streamZ0(-36) + 4.2, Math.PI], look: { ...outer, hairStyle: 0 }, act: 'sit', lines: ['嘘——冰窟窿底下有鱼。', '钓鱼也算修炼，师兄说的。静心嘛。'] },
      { name: '唐圆圆', title: '外门弟子', p: [-30, 51, 0], look: { ...outer, hairStyle: 3 }, route: [[-30, 51], [30, 51]], speed: 1.0, pause: 3, act: 'work', lines: ['雪扫了又下，下了又扫……', '扫完这条路，我就能吃饭了！'] },
      { name: '石头', title: '外门弟子', p: [44, 25.8, 0], look: { ...outer, hairStyle: 0, sword: false }, act: 'work', lines: ['凿冰、搬冰、码冰……冰窖快满了。', '夏天的时候，山下的人拿灵石来换冰。'] },
      { name: '老吴', title: '杂役', p: [26, 25, 0], look: { ...servant, hair: '#9a9a9a', age: 'elder', beard: true }, route: [[26, 25], [36, 29.6], [43, 30.5], [36, 29.6]], speed: 0.9, pause: 2.5, act: 'work', lines: ['这么冷的地方，柴比灵石还金贵。', '年轻人，多穿点。'] },
      { name: '孙大娘', title: '膳堂厨娘', p: [35, 28.6, 0], look: { ...servant, robe: '#8a7058', hair: '#3a2a20', hairStyle: 1 }, lines: ['来碗热汤！冻坏了吧？', '宗主一年只来吃一顿饭，就是除夕那顿。'] },
      { name: '青萝', title: '药童', p: [-38, 21.4, 0], look: { robe: '#9ac8b0', robe2: '#eef6f0', belt: '#3a6a5a', hairStyle: 3, age: 'child', sword: false }, act: 'work', lines: ['雪莲要拿雪盖着，太阳一晒就蔫了。', '葛长老说我手太热，不适合炼冰魄丹。'] },
      { name: '卫冰', title: '守山弟子', p: [-3.2, 60.5, 0], look: { ...inner, hairStyle: 0 }, lines: ['寒溪宗山门。来者报上名来。', '拜师的话，去执事堂找沈执事。'] },
      { name: '卫霜', title: '守山弟子', p: [3.2, 60.5, 0], look: { ...inner, hairStyle: 0 }, lines: ['我和卫冰是双生子。分不出来？没关系，我们自己有时也分不出。', '晚上溪面起雾，什么都看不清。'] },
      { name: '叶寒舟', title: '闭关弟子', p: [16, -54.4, Math.PI], look: { ...inner, hair: '#2a2028', hairStyle: 1 }, act: 'sit', lines: ['……（他闭着眼，睫毛上结了一层霜）', '冰窟里的寒气……还差一点就能突破了。'] },
      { name: '林墨', title: '内门弟子', p: [1.2, 5.2, Math.PI], look: { ...inner, hairStyle: 2, sword: false }, act: 'idle', lines: ['我在画这座桥。雪落在栏板上的样子，每天都不一样。', '你挡着我的光了。'] },
      { name: '苏琴', title: '真传弟子', p: [-42, -10.4, Math.PI], look: { ...inner, robe: '#c8e6f6', hairStyle: 1, sword: false }, act: 'sit', lines: ['（琴声停了）……你也喜欢听？', '寒玉台上弹琴，琴弦不会受潮。'] },
      { name: '许清', title: '外门弟子', p: [-14.6, 21.8, 0], look: { ...outer, hairStyle: 2 }, act: 'cast', lines: ['冰柱靶又被我打歪了……', '我要在年底前凝出第一块冰！'] },
    ],
  };
}
// HX_PEOPLE 用：x 处寒溪的 z（和 build 里同一条曲线）
function streamZ0(lx) { const c = new THREE.CatmullRomCurve3(HX_STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z))); let b = null; for (const p of c.getSpacedPoints(160)) if (!b || Math.abs(p.x - lx) < Math.abs(b.x - lx)) b = p; return b.z; }

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

export const SITES = { 青锋剑派: qingfeng, 寒溪宗: hanxi };
export const siteOf = (name) => SITES[name] || generic;
