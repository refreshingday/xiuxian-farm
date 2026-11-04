// 青竹村的街景与地标（布局数据在 townplan.js；能进门的房子、井、村墙、石峰、池塘在 world.js）
// 南大街两侧商铺（布庄、客栈、米铺、茶楼）+ 牌坊 + 跨街灯笼串；广场上的古银杏石凳、路标、戏台；
// 北边观瀑亭、学堂、文昌塔、小石桥；东北工坊的柴垛、矿车、矿石堆、木料场、晾皮架；东南民居的菜畦、晾衣绳；西边打谷场、草垛、谷仓、稻草人；竹海门内土地庙。
import * as THREE from 'three';
import { Site } from './sectsites.js';
import { hall, tower, pagoda, paifang, banner, plaque, scroll, lion, roof, M, TX, shade } from './sectkit.js';
import { woodpile, tableSet, crystalCluster, bridge, herbBed, rng32 } from './sectprops.js';
import { glow, mesh, at, canvasTex, toon } from './util.js';
import { DECOR, FACE, rotXZ, PAGODA, PAIFANG, GINKGO, TAU } from './townplan.js';

const SHOP = { wall: '#ece0c4', col: '#6a4630', beam: '#4a3020', roof: '#4a505c', ridge: '#2e323c', lattice: '#5a3a22' };

export class Town {
  constructor(g) {
    this.g = g;
    const S = this.S = new Site(g, 0, 0);
    const rng = rng32(303);
    for (const o of DECOR) this.decor(S, o, rng);
    this.landmarks(S, rng);
    this.street(S, rng);
    this.districts(S, rng);
  }
  update(dt) { this.S.update(dt, this.g.time ?? performance.now() / 1000); }

  // 建筑本地坐标 → 世界（门朝本地 +z）
  W(o, lx, lz) { const [dx, dz] = rotXZ(lx, lz, FACE[o.face]); return [o.x + dx, o.z + dz]; }

  decor(S, o, rng) {
    const ry = FACE[o.face], W = (lx, lz) => this.W(o, lx, lz);
    const front = (o.d + 1.6) / 2;
    const lanterns = (k = 0.6, y = 2.5) => { for (const s of [-1, 1]) { const [x, z] = W(s * (o.w / 2 + 0.2), front - k); S.lantern(x, z, y); } };
    const flag = () => { const [x, z] = W(-(o.w / 2 + 0.5), front - 0.5); S.put(banner(o.fc, o.flag, { h: 3.6, len: 1.6 }), x, z, ry + Math.PI / 2); S.circ(x, z, 0.15); };
    const goods = (list) => list.forEach(([id, v, lx, lz, s]) => { const [x, z] = W(lx, lz); S.ref(id, v, x, z, s ?? 1, rng() * TAU, 0.35); });
    if (o.kind === 'shop') {
      S.bld(hall({ w: o.w, d: o.d, h: 2.6, base: 0.3, sign: o.name, ...SHOP, rise: 1.7 }), o.x, o.z, ry);
      lanterns(); flag();
      goods(o.name === '米铺' ? [['crate', 1, o.w / 2 + 0.1, front + 0.3, 0.8], ['jar', 2, -o.w / 2 + 0.6, front + 0.35, 0.8]] : [['barrel', 1, o.w / 2 + 0.1, front + 0.3, 0.8]]);
    } else if (o.kind === 'inn' || o.kind === 'tea') {
      S.bld(tower({ w: o.w, d: o.d, levels: 2, h: 2.7, base: 0.3, sign: o.name, ...SHOP, roof: o.kind === 'inn' ? '#4a4652' : '#46524c', k: 0.35, rise: 1.6, shrink: 0.94 }), o.x, o.z, ry);
      lanterns(0.4, 2.4); flag();
      if (o.kind === 'inn') goods([['jar', 0, o.w / 2 + 0.1, front + 0.2, 0.9], ['jar', 1, o.w / 2 - 0.5, front + 0.45, 0.75]]);
      // 楼上挂一串红灯笼（远看就知道这里热闹）
      for (let i = 0; i < 4; i++) { const [x, z] = W(-o.w / 2 + 0.7 + i * (o.w - 1.4) / 3, o.d / 2 + 0.6); const l = mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.2, 1), glow('#ff4a2a', 1.8, true), { cast: false }); S.put(l, x, z, 0, 5.2, { ink: false }); }
    } else if (o.kind === 'stage') {
      const G = hall({ w: o.w, d: o.d, h: 3.0, open: true, base: 1.3, col: '#a83a2a', roof: '#3f4552', ridge: '#232a36', sign: '戏台', rise: 2.0, k: 0.5, stairW: 2.2 });
      // 后台：一面画墙 + 两侧红幕，台口挂一道横幅
      const back = canvasTex(256, 128, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a3a5a'); gr.addColorStop(1, '#4a5a7a'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = '#e8e0c8'; for (const [x, y, r] of [[60, 70, 30], [120, 60, 40], [190, 75, 28]]) { c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.fill(); }
        c.fillStyle = '#ffd25a'; c.beginPath(); c.arc(200, 32, 14, 0, TAU); c.fill(); c.strokeStyle = '#c8a24a'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
      }, { pixel: false, repeat: false });
      G.add(at(mesh(new THREE.BoxGeometry(o.w - 0.4, 3.0, 0.2), M('#5a2a1a', { tx: TX.wood })), 0, 1.3 + 1.5, -o.d / 2 + 0.35));
      G.add(at(mesh(new THREE.PlaneGeometry(o.w - 1.0, 2.6), toon('#ffffff', { map: back }), { cast: false }), 0, 1.3 + 1.5, -o.d / 2 + 0.47));
      for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.9, 2.9, 0.08), M('#b8242a')), s * (o.w / 2 - 0.9), 1.3 + 1.45, -o.d / 2 + 0.7));
      S.bld(G, o.x, o.z, ry);
      for (const s of [-1, 1]) { const [x, z] = W(s * (o.w / 2 + 1.1), front + 0.2); S.put(banner('#c8242a', s < 0 ? '锣鼓喧天' : '好戏连台', { h: 4.6, len: 2.4 }), x, z, ry + Math.PI / 2); S.circ(x, z, 0.15); }
      lanterns(0.2, 3.6);
    } else if (o.kind === 'school') {
      S.bld(hall({ w: o.w, d: o.d, h: 2.5, base: 0.3, wall: '#f0eadc', col: '#5a4030', beam: '#3e2c20', roof: '#46505a', ridge: '#2a3038', sign: o.name, rise: 1.6 }), o.x, o.z, ry);
      for (const s of [-1, 1]) { const sc = scroll(s < 0 ? '读书明理' : '修身立志', 0.36, 1.5); const [x, z] = W(s * 1.25, front - 0.75); S.put(sc, x, z, ry, 1.0, { ink: false }); }
      const [tx, tz] = W(1.6, front + 1.6); S.put(tableSet(), tx, tz, ry); S.circ(tx, tz, 1.0);
    } else if (o.kind === 'granary') {
      S.bld(hall({ w: o.w, d: o.d, h: 2.4, base: 0.6, wall: '#c49a62', col: '#6a4630', beam: '#4a3020', roof: '#c8a868', ridge: '#8a6a3a', rtx: 'thatch_straw', sign: o.name, rise: 1.8 }), o.x, o.z, ry);
    } else if (o.kind === 'shrine') {
      S.bld(hall({ w: o.w, d: o.d, h: 1.9, base: 0.35, col: '#a83a2a', roof: '#3f4552', sign: '土地', rise: 1.0, stairW: 1.2 }), o.x, o.z, ry);
      const [x, z] = W(0, front + 0.5); S.ref('incense', 0, x, z, 0.8, ry, 0.4);
    } else if (o.kind === 'pavilion') {
      // 开敞的亭子不加整块碰撞，只挡四根柱子
      S.put(hall({ w: o.w, d: o.d, h: 2.7, open: true, base: 0, col: '#a83a2a', roof: '#3a4a46', ridge: '#1e2a26', pyramid: true, k: 1, rise: 1.8 }), o.x, o.z, ry, 0, { bake: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.circ(o.x + sx * (o.w / 2 - 0.25), o.z + sz * (o.d / 2 - 0.25), 0.3);
      const p = plaque(o.name, 1.5, 0.45); S.put(p, o.x, o.z + o.d / 2 + 0.02, 0, 2.45, { ink: false });
      const p2 = plaque(o.name, 1.5, 0.45); S.put(p2, o.x, o.z - o.d / 2 - 0.02, Math.PI, 2.45, { ink: false });
      S.lantern(o.x - o.w / 2 + 0.25, o.z + o.d / 2 - 0.25, 2.3); S.lantern(o.x + o.w / 2 - 0.25, o.z + o.d / 2 - 0.25, 2.3);
    }
  }

  landmarks(S, rng) {
    // 远景：七层文昌塔（西北角，从村里哪儿都能望见）
    const P = PAGODA, pg = pagoda({ levels: P.levels, r: P.r, body: '#e4d8bc', roof: '#4a4a56', trim: '#2e2e38', baseC: '#a8a29a', h0: 2.6, h: 1.7 });
    S.put(pg, P.x, P.z, 0.4, 0, { bake: true }); S.circ(P.x, P.z, P.r + 0.9);
    const pl = plaque(P.name, 1.4, 0.45); S.put(pl, P.x + Math.sin(0.4 + Math.PI / 8) * 0, P.z + P.r + 0.06, 0, 2.2, { ink: false });
    S.ref('stele', 1, P.x + 1.8, P.z + 4.2, 0.9, 0, 0.5);
    // 牌坊：南大街入口（迎客门进来第一眼），两侧石狮
    const F = PAIFANG, pf = paifang(F.name, { w: F.w, h: 5.4, col: '#8a2a22' });
    S.put(pf, F.x, F.z, 0, 0, { bake: true });
    for (const x of pf.userData.cols) S.circ(F.x + x, F.z, 0.45);
    for (const s of [-1, 1]) { const l = lion(s, '#b8b2a6'); S.put(l, F.x + s * 5.6, F.z + 0.9, 0); S.circ(F.x + s * 5.6, F.z + 0.9, 0.7); }
    // 古银杏：一圈石凳 + 系红布条的护栏
    const G = new THREE.Group(), st = M('#a8a29a', { tx: TX.stone });
    G.add(mesh(new THREE.CylinderGeometry(1.9, 2.0, 0.45, 24, 1, true).translate(0, 0.22, 0), st));
    G.add(mesh(new THREE.TorusGeometry(1.95, 0.16, 6, 28).rotateX(Math.PI / 2).translate(0, 0.46, 0), M('#bcb6ac', { tx: TX.stone })));
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; G.add(at(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.12), M('#c8242a')), Math.cos(a) * 1.97, 0.3, Math.sin(a) * 1.97)); }
    S.put(G, GINKGO.x, GINKGO.z); S.circ(GINKGO.x, GINKGO.z, 2.0);
    // 路标：广场西南角，四块木牌指向四个方向（认路靠图形和地标，不靠长篇文字）
    const sp = new THREE.Group(), wd = M('#7a5030', { tx: TX.wood });
    sp.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6).translate(0, 1.3, 0), wd));
    const signs = [['迎客门', Math.atan2(0, 1), 2.1], ['观瀑亭', Math.atan2(0, -1), 1.75], ['竹海门', Math.atan2(-1, 0), 1.45], ['玄晶门', Math.atan2(0.75, -0.66), 1.15]];
    for (const [t, a, y] of signs) {
      const tex = canvasTex(192, 48, (c, w, h) => { c.fillStyle = '#d8b880'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w - 22, 0); c.lineTo(w, h / 2); c.lineTo(w - 22, h); c.lineTo(0, h); c.fill(); c.fillStyle = '#3a2416'; c.font = 'bold 30px "STKaiti","KaiTi","Noto Serif SC",serif'; c.textBaseline = 'middle'; c.fillText(t, 12, h / 2 + 1); }, { pixel: false, repeat: false });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25).translate(0.55, 0, 0), toon('#ffffff', { map: tex })); b.material.side = THREE.DoubleSide;
      b.position.y = y; b.rotation.y = a - Math.PI / 2; sp.add(b);
    }
    S.put(sp, -4.8, 7.4); S.circ(-4.8, 7.4, 0.2);
  }

  street(S, rng) {
    // 跨街红灯笼串（南大街的「路」要有自己的样子：石板 + 两排店 + 头顶灯笼）
    const cable = M('#2a1a10');
    for (const z of [12.2, 19.5, 27.9, 34.4]) {
      const pts = [new THREE.Vector3(-4.2, 3.7, z), new THREE.Vector3(0, 3.2, z), new THREE.Vector3(4.2, 3.7, z)];
      const tube = mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(...pts), 12, 0.025, 4), cable, { cast: false }); S.put(tube, 0, 0, 0, 0, { ink: false });
      for (let i = 0; i < 5; i++) {
        const t = (i + 1) / 6, x = -4.2 + 8.4 * t, y = 3.7 - (1 - (2 * t - 1) ** 2) * 0.5 - 0.35;
        const l = mesh(new THREE.SphereGeometry(0.19, 10, 8).scale(1, 1.25, 1), glow(i % 2 ? '#ff6a2a' : '#ff3a2a', 1.8, true), { cast: false });
        S.put(l, x, z, 0, y, { ink: false }); if (i === 2) S.emit(x, y, z, '#ff7a4a', 0.6, 'lantern', l);
      }
    }
    // 街口两块上马石、几只花盆
    for (const s of [-1, 1]) S.ref('flowerBed', 2 + s, s * 3.6, 37.6, 0.6, 0, 0.5);
  }

  districts(S, rng) {
    // —— 东北工坊：柴垛、矿车、矿石堆、木料场、猎户晾皮架
    for (const [x, z, r] of [[16.2, -1.8, 0.3], [25.2, -2.8, -0.2]]) { S.put(woodpile(), x, z, r); S.circ(x, z, 1.1); }
    S.ref('cart', 1, 19.6, -15.8, 1, 2.3, 0.9);
    const ore = crystalCluster(5, 0.9, rng); ore.traverse((m) => { if (m.isMesh) m.material = M('#5a4a7a', { emissive: '#4a3a8a', ei: 0.25 }); }); S.put(ore, 21.4, -14.8); S.circ(21.4, -14.8, 0.8);
    for (let i = 0; i < 3; i++) { // 木料场：一垛一垛的原木
      const G = new THREE.Group(), wd = M('#8a5a34', { tx: 'tree_bark' });
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) G.add(at(mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 8).rotateZ(Math.PI / 2), wd), 0, 0.22 + r * 0.38, -0.66 + k * 0.44 + r * 0.22));
      const x = 17.5 + i * 2.2, z = -25.2 + i * 1.6; S.put(G, x, z, 0.8); S.circ(x, z, 1.4);
    }
    { // 晾皮架
      const G = new THREE.Group(), wd = M('#6a4630', { tx: TX.wood });
      for (const s of [-1, 1]) G.add(at(mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1).translate(0, 0.95, 0), wd), s * 1.2, 0, 0));
      G.add(at(mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), wd), 0, 1.8, 0));
      for (let i = 0; i < 3; i++) G.add(at(mesh(new THREE.PlaneGeometry(0.6, 0.9), M(['#8a6040', '#a07a50', '#6a4a30'][i])), -0.8 + i * 0.8, 1.3, 0.05));
      S.put(G, 30.5, -9.2, Math.PI / 2); S.circ(30.5, -9.2, 0.5);
    }
    // —— 东南民居：菜畦、晾衣绳、花圃
    for (const [x, z, w, d] of [[19.3, 30.2, 5, 2.4], [-19.5, 30, 4, 2.4]]) { S.put(herbBed(w, d, rng), x, z); S.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2); }
    for (const [x, z, r] of [[30.5, 18.5, 0], [-27.5, 17.5, 0]]) {
      const G = new THREE.Group(), wd = M('#6a4630', { tx: TX.wood });
      for (const s of [-1, 1]) G.add(at(mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 5).translate(0, 1.0, 0), wd), s * 1.6, 0, 0));
      G.add(at(mesh(new THREE.BoxGeometry(3.2, 0.03, 0.03), wd), 0, 1.85, 0));
      ['#e8e0d0', '#5a7ab0', '#c86a5a', '#e8d8a0'].forEach((c, i) => { const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8).translate(0, -0.4, 0), toon(c, { unique: true })); cl.material.side = THREE.DoubleSide; cl.position.set(-1.1 + i * 0.72, 1.84, 0); cl.castShadow = true; G.add(cl); S.cloths.push(cl); });
      S.put(G, x, z, r); S.circ(x - 1.6, z, 0.15); S.circ(x + 1.6, z, 0.15);
    }
    // —— 西边田园：打谷场草垛、稻草人
    const hay = (x, z, s) => { const G = new THREE.Group(), m = M('#d8b860', { tx: 'thatch_straw' }); G.add(mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.2, 10).translate(0, 0.6, 0), m)); G.add(mesh(new THREE.ConeGeometry(1.05, 1.1, 10).translate(0, 1.75, 0), m)); G.scale.setScalar(s); S.put(G, x, z, rng() * TAU); S.circ(x, z, 1.0 * s); };
    hay(-17.6, 17.6, 1); hay(-11.2, 16.6, 0.85); hay(-12.2, 11.2, 0.9);
    S.ref('scarecrow', 0, -17, 9.4, 1, 0.3, 0.3);
    // —— 北边山水：石板小径两侧石灯、荷塘芦苇、溪上小石桥
    for (const z of [-12.5, -17]) for (const s of [-1, 1]) S.ref('stoneLan', 0, s * 2.1, z, 0.9, 0, 0.35);
    for (const [x, z] of [[-11.6, -16.4], [-10.8, -22.6], [-2.6, -18.6]]) S.ref('reeds', Math.floor(rng() * 3), x, z, 1, rng() * TAU);
    { // 小石桥：从观瀑台跨过溪到荷塘北岸
      const b = bridge(2.8, 1.5, { color: '#c8c2b8' }); S.put(b, -2.9, -23.6, -0.85 + Math.PI / 2);
    }
    S.ref('wisteria', 0, 6.2, -21.4, 1, 0.5, 0.5);
    // —— 广场：茶摊边几只坛子；委托板旁一张长凳
    S.ref('jar', 3, 8.6, 4.6, 0.8, 0, 0.3); S.ref('crate', 2, 4.2, 4.4, 0.7, 0.4, 0.4);
  }
}
