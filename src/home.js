// 家（GDD 第 6 / 7 / 8 节）：灵兽圈、村民帮工、洞府升级、制符台 / 阵法台、在村中空地建房引村民入住。
// - 灵兽：灵鸡、灵牛放进灵田西边的圈里，每天往食槽里放一样庄稼，第二天早上下灵蛋 / 出灵乳。
// - 帮工：何二愣好感 6 颗心以后可以雇来，每天 200 文，早上替你浇遍灵田。
// - 洞府升级、工作台、建房都找村长张罗（固定地块 + 升级，不是自由建造）。
import * as THREE from 'three';
import { ITEMS, CRAFTS, item, itemName } from './items.js';
import { near } from './life.js';
import { btn, el } from './ui.js';
import { toon, glow, mesh, at, addOutline, outlineMat } from './util.js';

const PEN = { x0: -25.5, z0: 0, x1: -21, z1: 6.5 }, MAX = { chick: 4, calf: 2 };
const LOT = { x: 23.5, z: 13 };
const UPG = [
  { id: 'room2', name: '静室', desc: '打坐修为 +20%', cost: 3000, mats: { iron: 10 } },
  { id: 'room3', name: '聚灵室', desc: '打坐修为再 +20%', cost: 9000, stones: 20, mats: { iron: 20 }, need: 'room2' },
  { id: 'fu', name: '制符台', desc: '画爆炎符、寒冰符、传送符', cost: 2000, mats: { iron: 5 } },
  { id: 'zhen', name: '阵法台', desc: '布护田阵旗、聚灵阵、灵雨阵、渡劫阵旗', cost: 4000, mats: { shard: 10 } },
  { id: 'lot', name: '在村中空地建房', desc: '盖好了会有散修搬来住，还开个小摊', cost: 8000, mats: { iron: 20 } },
];

export class Home {
  constructor(g) {
    this.g = g;
    this.animals = []; this.food = 0; this.goods = []; this.hired = false; this.built = new Set();
    this.buildPen();
    const P = () => g.player, inv = g.inv;
    // 灵兽：用灵鸡苗 / 灵牛犊
    for (const k of ['chick', 'calf']) ITEMS[k].use = () => this.addAnimal(k);
    // 符
    ITEMS.fu_fire.use = () => { inv.take('fu_fire'); const p = P(), x = p.pos.x + Math.sin(p.yaw) * 4, z = p.pos.z + Math.cos(p.yaw) * 4; g.combat.ring(3, 45, { knock: 10, launch: 3, stop: 0.05, shake: 0.4 }, '#ff7a3a', x, z); g.cfx?.pillar(x, z, 1.5, 4, '#ff7a3a', 0.4); return true; };
    ITEMS.fu_ice.use = () => { inv.take('fu_ice'); const p = P(); for (const e of g.enemies.list) if (e.pos.distanceTo(p.pos) < 7 && !e.boss) { e.rootT = 3; g.fx.burst(e.pos, '#bff4ff', 10, { speed: 2, up: 3, life: 0.6, y: 1 }); } g.fx.shockRing(p.pos.x, p.pos.z, 7, '#bff4ff', 0.5); return true; };
    ITEMS.fu_tp.use = () => { inv.take('fu_tp'); const d = g.life.home.door; g.player.pos.set(d.x, 0, d.z + 1); g.realm.fly = false; g.toast('传送回家', 1.4); return true; };
    // 交互：食槽、捡东西、工作台
    g.life.on((p) => this.animals.length && near(p, this.trough, 1.8) !== false && { label: `喂食（食槽里 ${this.food} 份，${this.animals.length} 只灵兽每天各吃一份）`, act: () => this.feed(), d: 0.8 });
    g.life.on((p) => { for (const it of this.goods) { const d = near(p, it, 1.4); if (d !== false) return { label: `捡起${itemName(it.id)}`, act: () => this.collect(it), d }; } return null; });
    g.life.on((p) => this.built.has('fu') && near(p, this.stations.fu, 1.7) !== false && { label: '制符台', act: () => this.openCraft('fu'), d: 0.8 });
    g.life.on((p) => this.built.has('zhen') && near(p, this.stations.zhen, 1.7) !== false && { label: '阵法台', act: () => this.openCraft('zhen'), d: 0.8 });
    g.life.dayHooks.push((d) => this.newDay(d));
    const h = g.life.home;
    this.stations = { fu: { x: h.x1 + 1.2, z: h.z0 + 1.5 }, zhen: { x: h.x1 + 1.2, z: h.z0 + 3.5 } };
    this.lot = LOT;
  }

  // ---------- 灵兽圈 ----------
  buildPen() {
    const g = this.g, w = g.world, wood = toon('#a8743f'), line = outlineMat('#2b1d14', 0.03);
    const fence = new THREE.Group(), post = new THREE.BoxGeometry(0.14, 0.8, 0.14).translate(0, 0.4, 0);
    const edge = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 1.2);
      for (let i = 0; i <= n; i++) fence.add(at(mesh(post, wood), ax + (bx - ax) * i / n, 0, az + (bz - az) * i / n));
      for (const y of [0.3, 0.6]) { const r = mesh(new THREE.BoxGeometry(L, 0.09, 0.07), wood); r.position.set((ax + bx) / 2, y, (az + bz) / 2); r.rotation.y = -Math.atan2(bz - az, bx - ax); fence.add(r); }
      w.addBox(Math.min(ax, bx) - 0.1, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, Math.max(az, bz) + 0.1);
    };
    const { x0, z0, x1, z1 } = PEN;
    edge(x0, z0, x1, z0); edge(x0, z1, x1, z1); edge(x0, z0, x0, z1); edge(x1, z0, x1, z0 + 2); edge(x1, z0 + 4, x1, z1); // 东边留门
    addOutline(fence, line); g.scene.add(fence);
    this.trough = { x: x0 + 1, z: z0 + 1 };
    const tr = mesh(new THREE.BoxGeometry(1.4, 0.4, 0.6).translate(0, 0.2, 0), toon('#7a4a2a'));
    tr.position.set(this.trough.x, 0, this.trough.z); addOutline(tr, line); g.scene.add(tr);
    this.foodMesh = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.45), toon('#c8a04a'), { cast: false }); this.foodMesh.position.set(this.trough.x, 0.38, this.trough.z); g.scene.add(this.foodMesh);
  }
  makeAnimal(kind) {
    const m = new THREE.Group(), cow = kind === 'calf';
    const body = toon(cow ? '#f2f0ea' : '#fff4d8'), dark = toon(cow ? '#3a3a3a' : '#e8a03a'), red = toon('#e83a2a');
    if (cow) {
      m.add(at(mesh(new THREE.BoxGeometry(0.9, 0.6, 1.3).translate(0, 0.75, 0), body), 0, 0, 0));
      m.add(at(mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), body), 0, 0.95, 0.8)); m.add(at(mesh(new THREE.BoxGeometry(0.35, 0.2, 0.15), toon('#e8b8a8')), 0, 0.85, 1.08));
      for (const [px, pz] of [[-0.3, 0.45], [0.3, 0.45], [-0.3, -0.45], [0.3, -0.45]]) m.add(at(mesh(new THREE.BoxGeometry(0.18, 0.45, 0.18).translate(0, 0.22, 0), dark), px, 0, pz));
      m.add(at(mesh(new THREE.BoxGeometry(0.35, 0.3, 0.02), dark), 0.46, 0.8, 0.1));
      for (const s of [-1, 1]) m.add(at(mesh(new THREE.ConeGeometry(0.05, 0.2, 5), toon('#f0e0c0')), s * 0.18, 1.25, 0.8));
    } else {
      m.add(at(mesh(new THREE.SphereGeometry(0.26, 10, 8).scale(1, 0.9, 1.2), body), 0, 0.32, 0));
      m.add(at(mesh(new THREE.SphereGeometry(0.15, 10, 8), body), 0, 0.55, 0.2));
      m.add(at(mesh(new THREE.ConeGeometry(0.05, 0.12, 4).rotateX(Math.PI / 2), dark), 0, 0.53, 0.38));
      m.add(at(mesh(new THREE.BoxGeometry(0.04, 0.1, 0.1), red), 0, 0.7, 0.2));
    }
    m.scale.setScalar(cow ? 0.9 : 1);
    return m;
  }
  addAnimal(kind) {
    const g = this.g, p = g.player.pos, c = { x: (PEN.x0 + PEN.x1) / 2, z: (PEN.z0 + PEN.z1) / 2 };
    if (Math.hypot(p.x - c.x, p.z - c.z) > 14) { g.toast('回灵兽圈（灵田西边）再放', 1.8); return false; }
    if (this.animals.filter((a) => a.kind === kind).length >= MAX[kind]) { g.toast('圈里放不下了', 1.5); return false; }
    g.inv.take(kind); this.spawnAnimal(kind);
    g.toast(kind === 'calf' ? '灵牛犊进圈了' : '灵鸡苗进圈了', 1.6);
    return true;
  }
  spawnAnimal(kind) {
    const m = this.makeAnimal(kind), a = { kind, m, t: Math.random() * 3, to: null };
    m.position.set(PEN.x0 + 1 + Math.random() * (PEN.x1 - PEN.x0 - 2), 0, PEN.z0 + 1.5 + Math.random() * (PEN.z1 - PEN.z0 - 2.5));
    this.g.scene.add(m); this.animals.push(a);
  }
  feed() {
    const g = this.g;
    g.ui.openBag(g.inv, { title: '往食槽里放庄稼', filter: (it) => it.cat === 'crop', gift: (id) => { g.inv.take(id); this.food++; g.ui.refresh(); g.toast(`食槽里 ${this.food} 份`, 1); } });
  }
  collect(it) { this.g.scene.remove(it.m); this.goods.splice(this.goods.indexOf(it), 1); this.g.addItem(it.id, 1, it); }

  // ---------- 早上：灵兽出产、帮工浇水 ----------
  newDay() {
    const g = this.g, notes = [];
    let made = 0, hungry = 0;
    for (const a of this.animals) {
      if (this.food <= 0) { hungry++; continue; }
      this.food--; made++;
      const id = a.kind === 'calf' ? 'milk' : 'egg', x = a.m.position.x + 0.5, z = a.m.position.z;
      const m = mesh(id === 'egg' ? new THREE.SphereGeometry(0.12, 8, 6).scale(1, 1.3, 1) : new THREE.CylinderGeometry(0.12, 0.14, 0.3, 8), toon(id === 'egg' ? '#fff8e8' : '#f0f4ff'));
      m.position.set(x, 0.15, z); g.scene.add(m); this.goods.push({ id, x, z, m });
    }
    if (made) notes.push(`灵兽出产了 ${made} 样`);
    if (hungry) notes.push(`${hungry} 只灵兽饿着（食槽空了）`);
    if (this.hired) {
      if (g.inv.money >= 200) {
        g.inv.money -= 200;
        for (const t of g.farm.tiles) if (t.state === 2 && !t.w) { t.w = true; g.farm.paint(t); }
        notes.push('何二愣一早把灵田浇了（−200 文）');
      } else notes.push('钱不够，何二愣今天没来帮工');
    }
    return notes.length ? notes.join('，') : '';
  }

  // ---------- 村民对话：雇帮工 / 洞府升级 ----------
  choices(v) {
    const out = [];
    if (v.d.id === 'farmer' && v.hearts >= 6) out.push({ label: this.hired ? '不用帮工了' : '💪 雇他帮工（每天 200 文，早上浇遍灵田）', fn: () => { this.hired = !this.hired; this.g.toast(this.hired ? '何二愣明天一早就来' : '何二愣不来了', 1.6); } });
    if (v.d.id === 'chief') out.push({ label: '🏠 洞府升级 / 工作台 / 建房', fn: () => this.openBuild() });
    return out;
  }
  openBuild() {
    const g = this.g, inv = g.inv;
    g.ui.panel('村长张罗 · 建造', (body) => {
      body.append(el('div', 'pmoney', `💰 ${inv.money} 文　💎 灵石 ${inv.stones}`));
      for (const u of UPG) {
        const have = this.built.has(u.id), lock = u.need && !this.built.has(u.need);
        const mats = Object.entries(u.mats).map(([k, n]) => `${itemName(k)} ${Math.min(inv.count(k), n)}/${n}`).join('、');
        const ok = !have && !lock && inv.money >= u.cost && (inv.stones >= (u.stones || 0)) && Object.entries(u.mats).every(([k, n]) => inv.count(k) >= n);
        body.append(g.ui.row(have ? '✅' : '🔨', `${u.name} <i>${u.cost} 文${u.stones ? ` + ${u.stones} 灵石` : ''}</i>`, `${u.desc}　材料：${mats}${lock ? '（先盖静室）' : ''}`,
          [btn(have ? '已建' : '建', () => { if (!ok) return; inv.money -= u.cost; inv.stones -= u.stones || 0; for (const [k, n] of Object.entries(u.mats)) inv.take(k, n); this.build(u.id); g.ui.refresh(); }, ok ? '' : 'off')]));
      }
    });
  }
  build(id, quiet) {
    const g = this.g, h = g.life.home;
    this.built.add(id);
    if ((id === 'room2' || id === 'room3') && !quiet) g.toast(`洞府升级：${id === 'room2' ? '静室' : '聚灵室'}（打坐修为 +20%）`, 2.5);
    if (id === 'fu' || id === 'zhen') {
      const s = this.stations[id], grp = new THREE.Group();
      grp.add(mesh(new THREE.BoxGeometry(1.2, 0.75, 0.7).translate(0, 0.375, 0), toon('#8a5a34', { occ: true })));
      grp.add(at(mesh(new THREE.BoxGeometry(1.0, 0.04, 0.5), id === 'fu' ? toon('#f2ead2') : glow('#c8a8ff', 1.4)), 0, 0.78, 0));
      if (id === 'zhen') grp.add(at(mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 20).rotateX(Math.PI / 2), glow('#c8a8ff', 2)), 0, 0.85, 0));
      else grp.add(at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), toon('#2a1a10')), 0.35, 0.9, 0));
      grp.position.set(s.x, 0, s.z); addOutline(grp, outlineMat('#2b1d14', 0.03)); g.scene.add(grp);
      g.world.addBox(s.x - 0.6, s.z - 0.35, s.x + 0.6, s.z + 0.35);
      if (!quiet) g.toast(`${id === 'fu' ? '制符台' : '阵法台'}搭好了（屋子东边）`, 2.5);
    }
    if (id === 'lot') {
      g.world.buildHouse(LOT.x, LOT.z, 6, 5, { name: '陆家', id: 'lot', roof: '#5a6a7a', wall: '#b88250' });
      const v = g.village.add({ id: 'luyuan', name: '陆远', role: '散修', age: 'adult', home: 'lot', shop: 'wanderer2', hours: [10, 22],
        look: { skin: '#eac3a0', hairStyle: 1, robe: '#4a6a8a' }, root: { e: '风', grade: 1 }, realm: [2, 1], sense: 90,
        pers: '洒脱、见多识广', bio: '云游四方的散修，被你盖的房子留了下来。卖些符箓和杂货。',
        loves: ['wine', 'meteor_iron'], likes: ['tea', 'yaodan', 'cat:boss'], dislikes: ['radish'],
        sched: [[6, 'home'], [10, 'plaza'], [22, 'home']],
        lines: { greet: ['多谢收留，这青竹村比我去过的地方都安生。', '我这儿有几张好符，要不要看看？', '天外陨铁？那可是炼器的好东西。'], h3: ['你这人不错，改天带你去个好地方。'], h6: ['我走过六个扇区……最后还是觉得这里最好。'], rain: ['雨天适合画符。'], night: ['夜里的星象，你看得懂吗？'] },
        gift: { love: '这……太贵重了！', like: '谢了，朋友。', dislike: '这个就算了吧。' } });
      if (!quiet) g.ui.dialog({ narrate: true, lines: ['空地上的新房子落成了。', '没过几天，一位叫陆远的散修搬了进来。'], info: '陆远在广场摆了个小摊，卖符箓和杂货（10:00–22:00）。' });
      void v;
    }
  }
  meditateBonus() { return (this.built.has('room2') ? 0.2 : 0) + (this.built.has('room3') ? 0.2 : 0); }

  // ---------- 工作台：制符 / 布阵 ----------
  openCraft(station) {
    const g = this.g, inv = g.inv;
    g.ui.panel(station === 'fu' ? '制符台' : '阵法台', (body) => {
      for (const [id, r] of Object.entries(CRAFTS)) {
        if (r.station !== station) continue;
        const it = item(id), ok = Object.entries(r.in).every(([k, n]) => inv.count(k) >= n);
        body.append(g.ui.row(it.icon, `${it.name}${r.n > 1 ? ` ×${r.n}` : ''}`, `${it.desc}<br>材料：${Object.entries(r.in).map(([k, n]) => `${itemName(k)} ${Math.min(inv.count(k), n)}/${n}`).join('、')}`,
          [btn('制作', () => { if (!ok) return; for (const [k, n] of Object.entries(r.in)) inv.take(k, n); inv.add(id, r.n); g.toast(`做好了 ${it.name}`, 1.4); g.ui.refresh(); }, ok ? '' : 'off')]));
      }
    });
  }

  update(dt) {
    const g = this.g;
    this.foodMesh.visible = this.food > 0;
    if (Math.hypot(g.player.pos.x + 23, g.player.pos.z - 3) > 60) return;
    for (const a of this.animals) {
      a.t -= dt;
      if (a.t <= 0) { a.t = 2 + Math.random() * 4; a.to = { x: PEN.x0 + 0.8 + Math.random() * (PEN.x1 - PEN.x0 - 1.6), z: PEN.z0 + 0.8 + Math.random() * (PEN.z1 - PEN.z0 - 1.6) }; }
      if (a.to) {
        const p = a.m.position, dx = a.to.x - p.x, dz = a.to.z - p.z, d = Math.hypot(dx, dz), sp = a.kind === 'calf' ? 0.6 : 1.1;
        if (d < 0.1) a.to = null; else { p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; a.m.rotation.y = Math.atan2(dx, dz); p.y = Math.abs(Math.sin(g.time * 10)) * 0.04; }
      }
    }
  }
  save() { return { animals: this.animals.map((a) => a.kind), food: this.food, goods: this.goods.map((x) => x.id), hired: this.hired, built: [...this.built] }; }
  load(s) {
    for (const a of this.animals) this.g.scene.remove(a.m); this.animals = [];
    for (const k of s.animals || []) this.spawnAnimal(k);
    this.food = s.food || 0; this.hired = !!s.hired;
    for (const id of s.built || []) if (!this.built.has(id)) this.build(id, true);
  }
}
