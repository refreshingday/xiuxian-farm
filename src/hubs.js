// 坊市（GDD 第 7 / 9 节）：青石（筑基圈）、赤岩（金丹圈）、玄冥（元婴圈）。
// - 安全区：不刷妖兽，禁止渡劫；客栈能住，2:00 前后也是安全点（不会昏倒）。
// - 修士的买卖用灵石；收东西比村里贵，每天还有 1–2 种「今日高价」；同一天卖太多照样压价。
// - 法器阁：用灵石炼器（攻击）、炼甲（气血），越往上越贵。
// - 青石坊市每周三 18:00–23:00 拍卖会：和散修竞价，也能寄卖高药龄灵草、极品丹、妖王材料；
//   拍到重宝后离开坊市，路上可能被劫修截杀（黑吃黑），东西越贵越凶。
import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { item, itemName, ITEMS } from './items.js';
import { near } from './life.js';
import { btn, el } from './ui.js';
import { dateOf } from './calendar.js';
import { dangerFor } from './worldmap.js';
import { toon, glow, mesh, at, addOutline, outlineMat } from './util.js';

const SAFE_R = 42;
const PILL_STOCK = ['pill_heal', 'pill_qi', 'pill_avert', 'lingtu', 'spring', 'shard', 'seed_renshen', 'seed_chiyang', 'seed_yuehua', 'seed_xuanbing', 'seed_ninglu', 'zhenqi', 'talisman_paper'];
const LOT_POOL = [['renshen@100', 1], ['renshen@10', 2], ['pill_xp+2', 2], ['pill_avert+2', 1], ['pill_heal+2', 3], ['xuanbing@10', 1], ['b_frosthorn', 1], ['b_viper', 1], ['b_bronze', 1], ['b_snowwolf', 1], ['b_jiao', 1], ['wolf_fang', 1], ['heart', 1]];
const BIDDERS = ['某散修', '丹鼎派外门长老', '赤霞宗弟子', '黄沙寺行脚僧', '一位蒙面客', '天机阁执事', '钱多宝（远远地举了牌）'];
const HAIR = ['#2e1e18', '#4a2e22', '#5e3c26', '#3a2a24'], ROBE = ['#c94f4f', '#4f7fc9', '#6aa86a', '#c9a24f', '#8a5fb0', '#e0e0d8', '#d07a3a', '#3f8a8a'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
// 每天固定的伪随机（读档后今日高价不变）
const seeded = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function person(g, x, z) {
  const robe = pick(ROBE), c = createChibi({ skin: '#eac3a0', hair: pick(HAIR), hairStyle: Math.floor(Math.random() * 4), robe, robe2: shade(robe, 0.65), belt: shade(robe, 0.4), age: Math.random() < 0.15 ? 'elder' : 'adult' });
  c.root.position.set(x, 0, z); g.scene.add(c.root);
  return { c, pos: c.root.position, home: { x, z }, t: Math.random() * 3, path: null, yaw: Math.random() * 6 };
}

export class Hubs {
  constructor(g, landmarks) {
    this.g = g;
    this.list = landmarks.list.filter((L) => L.kind === 'hub').map((L, i) => this.build(L, i));
    this.lots = null; this.lotDay = 0; this.ambush = null;
    g.safeAt = (p) => { const h = this.at(p, 30); return h && { name: h.name, bed: { x: h.inn.inside.x, z: h.inn.inside.z } }; };
  }
  at(p, r = SAFE_R) { return this.list.find((h) => Math.hypot(p.x - h.x, p.z - h.z) < r); }

  build(L, idx) {
    const g = this.g, w = g.world, x = L.x, z = L.z, auction = idx === 0;
    const names = auction ? ['客栈', '丹药阁', '法器阁', '拍卖行'] : ['客栈', '丹药阁', '法器阁'];
    const n = names.length, hs = names.map((nm, i) => {
      const cx = x + (i - (n - 1) / 2) * 9;
      w.buildHouse(cx, z - 8, 7, 6, { name: nm, id: `hub${idx}_${i}`, roof: ['#5a4a6a', '#6a4a3a', '#4a5a6a', '#7a3a3a'][i], wall: '#b08a5a' });
      return w.houses.at(-1);
    });
    // 广场上的摊子和人
    const wood = toon('#8a5a34', { occ: true });
    for (const [sx, col] of [[-6, '#c94f4f'], [6, '#4f7fc9']]) {
      const s = new THREE.Group();
      s.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 1.0).translate(0, 0.8, 0), wood));
      for (const [a, b] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) s.add(at(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1).translate(0, 0.4, 0), wood), a, 0, b));
      s.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), wood));
      s.add(mesh(new THREE.ConeGeometry(1.8, 0.7, 10).translate(0, 2.7, 0), toon(col, { occ: true })));
      for (let k = 0; k < 4; k++) s.add(at(mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), toon(pick(['#ffd27a', '#7dffb0', '#c8a8ff', '#ff8a5a']))), -0.6 + k * 0.4, 0.95, 0));
      s.position.set(x + sx, 0, z + 5); addOutline(s, outlineMat('#2b1d14', 0.03)); g.scene.add(s);
      w.addBox(x + sx - 0.95, z + 4.45, x + sx + 0.95, z + 5.55);
    }
    // 牌坊
    const gate = new THREE.Group(), red = toon('#a8382a', { occ: true });
    for (const s of [-1, 1]) gate.add(at(mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5).translate(0, 2.1, 0), red), s * 3.5, 0, 0));
    gate.add(at(mesh(new THREE.BoxGeometry(8.6, 0.5, 0.7), toon('#3a3e48', { occ: true })), 0, 4.3, 0));
    gate.add(at(mesh(new THREE.BoxGeometry(7.2, 0.35, 0.5), red), 0, 3.6, 0));
    gate.position.set(x, 0, z + 14); addOutline(gate, outlineMat('#2b1d14', 0.03)); g.scene.add(gate);
    for (const s of [-1, 1]) w.addCircle(x + s * 3.5, z + 14, 0.4);
    for (const [lx, lz] of [[-12, 3], [12, 3], [-12, 12], [12, 12]]) {
      const lan = mesh(new THREE.SphereGeometry(0.25, 10, 8).scale(1, 1.2, 1), glow('#ff4a2a', 1.8, true), { cast: false });
      lan.position.set(x + lx, 2.2, z + lz); g.scene.add(lan);
      g.scene.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6).translate(0, 1.2, 0), wood), x + lx, 0, z + lz));
      w.addEmitter(x + lx, 2.2, z + lz, '#ff7a4a', 0.8, 'lantern', lan);
    }
    // 掌柜站在柜台后，广场上有人闲逛
    const keepers = hs.map((h) => { const p = person(g, h.inside.x, h.inside.z - 1.2); p.fixed = true; p.yaw = 0; return p; });
    const crowd = Array.from({ length: 6 }, () => person(g, x + (Math.random() - 0.5) * 20, z + 1 + Math.random() * 8));
    const hub = { idx, name: L.name, x, z, houses: hs, inn: hs[0], keepers, crowd, auction, lvl: Math.floor(dangerFor(x, z)) };
    const kinds = ['inn', 'pills', 'forge', 'auction'];
    hs.forEach((h, i) => g.life.on((P) => {
      const d = near(P, keepers[i].pos, 2.4);
      return d !== false && { label: `${L.name} · ${names[i]}`, act: () => this.open(hub, kinds[i]), d: d - 0.3 };
    }));
    return hub;
  }

  // 今日高价：每个坊市每天挑 1–2 种
  hot(hub) {
    const g = this.g, pool = Object.values(ITEMS).filter((it) => ['herb', 'mat', 'crop'].includes(it.cat) && it.sell > 0).map((it) => it.id);
    const n = 1 + Math.floor(seeded(g.day * 7 + hub.idx) * 2);
    return Array.from({ length: n }, (_, k) => pool[Math.floor(seeded(g.day * 13 + hub.idx * 5 + k) * pool.length)]);
  }
  open(hub, kind) {
    const g = this.g, inv = g.inv;
    if (kind === 'inn') {
      g.ui.dialog({ name: '客栈掌柜', line: '客官住店？一晚 150 文，上房干净，保您睡到天亮。', choices: [
        { label: '住一晚（150 文）', off: inv.money < 150, fn: () => { if (inv.money < 150) return g.toast('钱不够', 1.5); inv.money -= 150; g.life.endDay('sleep', { at: { x: hub.inn.inside.x, z: hub.inn.inside.z }, meditate: false }); } },
        { label: '来壶灵茶（40 文）', fn: () => { if (inv.money >= 40) { inv.money -= 40; inv.add('tea'); } } }, { label: '离开' }] });
      return;
    }
    if (kind === 'auction') { this.openAuction(hub); return; }
    const hot = this.hot(hub), sellMul = (id) => (hot.includes(id) || hot.includes(item(id)?.base) ? 1.6 : 1.25);
    if (kind === 'pills') {
      g.ui.openShop({ name: `${hub.name} · 丹药阁`, sells: PILL_STOCK, buys: ['herb', 'pill', 'mat', 'crop'] }, inv,
        { currency: 'stones', sellMul, toast: (m) => g.toast(m, 1.5) });
      return;
    }
    // 法器阁：炼器 / 炼甲
    const P = g.player;
    P.forge ??= { atk: 0, hp: 0 };
    g.ui.panel(`${hub.name} · 法器阁`, (body) => {
      body.append(el('div', 'pmoney', `💎 灵石 ${inv.stones}　　今日高价：${hot.map(itemName).join('、')}`));
      const cost = (k) => Math.round(15 * (k + 1) ** 1.6);
      const row = (icon, name, sub, k, max, fn) => g.ui.row(icon, `${name} <i>${k}/${max}</i>`, sub, [btn(k >= max ? '已满' : `${cost(k)} 灵石`, () => { if (k >= max || inv.stones < cost(k)) return; inv.stones -= cost(k); fn(); g.ui.refresh(); }, k >= max || inv.stones < cost(k) ? 'off' : '')]);
      body.append(row('⚔', '炼器 · 兵器', '每炼一次，攻击 +8%', P.forge.atk, 10, () => { P.forge.atk++; P.atkBonus += 0.08; }));
      body.append(row('🛡', '炼甲 · 护身法衣', '每炼一次，气血上限 +25', P.forge.hp, 10, () => { P.forge.hp++; P.hpBonus += 25; g.realm.recalc(); }));
      body.append(el('div', 'pempty', '法器阁也收妖王材料和兽材，价钱比村里好。'));
      body.append(btn('卖东西', () => g.ui.openShop({ name: `${hub.name} · 法器阁`, sells: [], buys: ['mat', 'boss'] }, inv, { currency: 'stones', sellMul }), 'wide'));
    });
  }

  // ---------- 拍卖会（每周三晚上，只在青石坊市）----------
  openAuction(hub) {
    const g = this.g, inv = g.inv, d = dateOf(g.day), open = d.weekday === 2 && g.hours >= 18 && g.hours < 23;
    if (!open) { g.ui.dialog({ name: '拍卖行管事', line: '拍卖会每周三晚上 18 点开拍，23 点落槌。到时候带足灵石再来。', hint: `今天是${d.weekName}。寄卖也要等开拍的时候。` }); return; }
    if (this.lotDay !== g.day) {
      this.lotDay = g.day;
      this.lots = Array.from({ length: 3 }, () => {
        const [id, n] = pick(LOT_POOL), base = Math.max(5, Math.round(item(id).sell * n / 70));
        return { id, n, bid: Math.round(base * 0.6), base, max: Math.round(base * (1.2 + Math.random() * 1.2)), top: '无人出价', mine: false, done: false };
      });
    }
    g.ui.panel('青石拍卖会', (body) => {
      body.append(el('div', 'pmoney', `💎 灵石 ${inv.stones}`));
      body.append(el('div', 'pcat', '拍品'));
      for (const L of this.lots) {
        const it = item(L.id), nb = Math.ceil(L.bid * 1.1);
        const act = L.done ? [btn(L.mine ? '已拍下' : '已流拍 / 被拍走', () => {}, 'off')] : [btn(`出价 ${nb}`, () => this.bid(L, nb), inv.stones < nb ? 'off' : ''), btn('落槌', () => this.hammer(L), L.mine ? '' : 'off')];
        body.append(g.ui.row(it.icon, `${it.name} ×${L.n} <i>现价 ${L.bid} 灵石 · ${L.mine ? '你领先' : L.top}</i>`, it.desc || '', act));
      }
      body.append(el('div', 'pcat', '寄卖（高药龄灵草、极品丹、妖王材料）'));
      const ids = inv.ids((it) => it.age >= 10 || it.grade === 2 || it.cat === 'boss');
      if (!ids.length) body.append(el('div', 'pempty', '没有值得拍的东西。灵草多留几年药龄，或者炼出极品丹再来。'));
      for (const id of ids) {
        const it = item(id), est = Math.round(it.sell / 100 * 2.5);
        body.append(g.ui.row(it.icon, `${it.name} ×${inv.count(id)} <i>预估 ${est} 灵石上下</i>`, '', [btn('寄卖一件', () => {
          inv.take(id); const got = Math.max(1, Math.round(it.sell / 100 * (1.8 + Math.random() * 1.4)));
          inv.stones += got; g.toast(`${it.name} 拍出 ${got} 灵石！`, 2); g.ui.refresh();
        })]));
      }
    });
  }
  bid(L, v) {
    const g = this.g;
    if (g.inv.stones < v || L.done) return;
    L.bid = v; L.mine = true; L.top = '你';
    if (v < L.max && Math.random() < 0.85) { L.bid = Math.ceil(v * (1.05 + Math.random() * 0.06)); L.mine = false; L.top = pick(BIDDERS) + ' 跟价'; }
    g.ui.refresh();
  }
  hammer(L) {
    const g = this.g;
    if (!L.mine || L.done || g.inv.stones < L.bid) return;
    L.done = true; g.inv.stones -= L.bid; g.inv.add(L.id, L.n);
    g.toast(`落槌！${itemName(L.id)} ×${L.n} 归你了（${L.bid} 灵石）`, 3);
    if (L.bid >= 30) this.ambush = { value: L.bid, hub: this.list[0] }; // 有人盯上了
    g.ui.refresh();
  }

  update(dt) {
    const g = this.g, P = g.player;
    for (const h of this.list) {
      // 安全区：妖兽不进坊市
      for (const e of [...g.enemies.list]) if (!e.boss && !e.raid && Math.hypot(e.pos.x - h.x, e.pos.z - h.z) < SAFE_R) g.enemies.remove(e);
      if (Math.hypot(P.pos.x - h.x, P.pos.z - h.z) > 90) continue;
      for (const k of h.keepers) { k.c.root.rotation.y = 0; animChibi(k.c, dt, { move: 0, attack: -1, cast: 0 }); }
      for (const p of h.crowd) {
        p.t -= dt;
        if (p.t <= 0) { p.t = 2 + Math.random() * 4; p.path = { x: h.x + (Math.random() - 0.5) * 22, z: h.z + 1 + Math.random() * 9 }; }
        let mv = 0;
        if (p.path) {
          const dx = p.path.x - p.pos.x, dz = p.path.z - p.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.3) p.path = null; else { p.pos.x += dx / d * 1.4 * dt; p.pos.z += dz / d * 1.4 * dt; p.yaw = Math.atan2(dx, dz); mv = 0.6; }
        }
        g.world.resolve(p.pos, 0.35);
        p.c.root.rotation.y = p.yaw; animChibi(p.c, dt, { move: mv, attack: -1, cast: 0 });
      }
    }
    // 黑吃黑：揣着重宝离开坊市
    const A = this.ambush;
    if (A && Math.hypot(P.pos.x - A.hub.x, P.pos.z - A.hub.z) > 55) {
      this.ambush = null;
      const n = Math.min(5, 2 + Math.floor(A.value / 60));
      for (let i = 0; i < n; i++) { const a = i / n * 6.28, e = g.enemies.spawn('bandit', P.pos.x + Math.cos(a) * 9, P.pos.z + Math.sin(a) * 9, A.hub.lvl + Math.floor(A.value / 50)); e.state = 'chase'; }
      g.toast('有人盯上了你拍到的宝物！\n劫修拦路——', 3.5); g.shake(0.5);
    }
  }
  save() { return { ambush: this.ambush && { value: this.ambush.value }, forge: this.g.player.forge }; }
  load(s) { this.ambush = s.ambush ? { value: s.ambush.value, hub: this.list[0] } : null; if (s.forge) this.g.player.forge = s.forge; }
}
