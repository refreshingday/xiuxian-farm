// 青竹村村民（GDD 第 9 节）：有名有姓、有日程、有喜好和好感、有自己的店。数据在 data/villagers.json。
// 好感：每 100 一颗心，最多 10 颗；每天第一次聊天 +10，每天能送一次礼。
// 平时不会因为冷落掉好感，只有恶行才会掉；真实下限 -200，界面最低只显示到 -100。
import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { lerpAngle } from './util.js';
import { item, itemName, CROPS, SHOPS } from './items.js';
import { realmText } from './npc.js';

export const HEART = 100;
const MAX_AFF = 1000, FLOOR = -200, SHOW_FLOOR = -100;
const GRADE = ['凡品', '良品', '上品', '极品'];
const GIFT_PTS = { love: 80, like: 45, neutral: 20, dislike: 0 };
const HAIR = ['#2e1e18', '#4a2e22', '#5e3c26', '#3a2a24'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

export async function loadVillageData() { return (await fetch('data/villagers.json')).json(); }

class Villager {
  constructor(v, d, slot) {
    this.v = v; this.d = d; this.g = v.g;
    const L = d.look;
    this.c = createChibi({
      skin: L.skin, hair: L.hair || (d.age === 'elder' ? '#e8e8ec' : HAIR[d.id.length % 4]), hairStyle: L.hairStyle ?? 0,
      robe: L.robe, robe2: L.robe2 || shade(L.robe, 0.65), belt: L.belt || shade(L.robe, 0.4), age: d.age, beard: !!L.beard,
    });
    this.pos = this.c.root.position;
    this.house = v.g.world.houses.find((h) => h.id === d.home);
    this.slot = slot; // 同一屋里第几个人：错开站位
    this.r = 0.35; this.yaw = 0; this.speed = d.age === 'child' ? 2.4 : d.age === 'elder' ? 1.3 : 1.8;
    this.path = []; this.place = null; this.wait = 0; this.stuck = 0; this.stuckT = 0; this.last = new THREE.Vector2();
    this.away = false; this.talking = 0;
    this.aff = 0; this.talked = false; this.gifted = false;
    const p = this.spot('home'); this.pos.set(p.x, 0, p.z);
    v.g.scene.add(this.c.root);
  }
  get name() { return this.d.name; }
  get hearts() { return Math.max(0, Math.floor(this.aff / HEART)); }
  addAff(n) { this.aff = Math.max(FLOOR, Math.min(MAX_AFF, this.aff + n)); }

  // 日程：当前时刻该在哪
  schedPlace(hour) {
    let cur = this.d.sched[0][1];
    for (const [h, p] of this.d.sched) if (hour >= h) cur = p;
    return cur;
  }
  // 地点 → 具体坐标（同一地点的人错开一点）
  spot(place) {
    const w = this.g.world, k = this.slot, off = (r) => ({ x: Math.cos(k * 2.1) * r, z: Math.sin(k * 2.1) * r * 0.6 });
    if (place === 'home') { const o = off(1.1); return { x: this.house.inside.x + o.x, z: this.house.inside.z - 0.6 + o.z, house: this.house }; }
    if (place === 'work') {
      if (this.d.id === 'smith' || this.d.id === 'hu') { const a = w.anvil; return { x: a.x + (this.d.id === 'hu' ? 1.2 : 0), z: a.z + 0.4 }; }
      if (this.d.shop === 'tea') return { ...w.stall };
      return { x: this.house.inside.x, z: this.house.inside.z - 0.3, house: this.house };
    }
    if (place === 'stall') { const o = off(1.6); return { x: w.stall.x + o.x, z: w.stall.z + 0.4 + Math.abs(o.z) }; }
    if (place === 'plaza') { const a = k * 1.3 + this.d.id.length; return { x: Math.cos(a) * 4.5, z: Math.sin(a) * 4.5 }; }
    if (place === 'away') return { x: 26, z: -23, away: true };
    if (place[0] === 'wander') return { x: place[1], z: place[2], wander: place[3] };
    return { x: place[0], z: place[1] };
  }

  update(dt, hour) {
    const w = this.g.world;
    const pl = this.schedPlace(hour);
    if (pl !== this.place) { this.place = pl; this.goTo(this.spot(pl)); }
    let moving = 0;
    if (this.talking > 0) {
      this.talking -= dt;
      const P = this.g.player.pos;
      this.yaw = lerpAngle(this.yaw, Math.atan2(P.x - this.pos.x, P.z - this.pos.z), 1 - Math.exp(-8 * dt));
    } else if (this.path.length) {
      const t = this.path[0], dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { this.path.shift(); this.stuckT = 0; if (!this.path.length) this.arrive(); }
      else {
        this.pos.x += dx / d * this.speed * dt; this.pos.z += dz / d * this.speed * dt;
        this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        moving = this.speed / 2.4;
        // 卡住（被墙、人挡住）：先绕一下，再不行直接跳到路点
        this.stuck += dt; this.stuckT += dt;
        if (this.stuck > 1) {
          if (Math.hypot(this.pos.x - this.last.x, this.pos.z - this.last.y) < 0.25) { const a = Math.random() * 6.28; this.pos.x += Math.cos(a) * 0.4; this.pos.z += Math.sin(a) * 0.4; }
          this.stuck = 0; this.last.set(this.pos.x, this.pos.z);
        }
        if (this.stuckT > 6) { this.pos.x = t.x; this.pos.z = t.z; this.stuckT = 0; }
      }
    } else if (this.target?.wander) {
      this.wait -= dt;
      if (this.wait <= 0) {
        const T = this.target;
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * 6.28, r = Math.random() * T.wander, x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
          if (!w.insideHouse(x, z, 1) && !w.farmTileAt(x, z)) { this.path = [{ x, z }]; break; }
        }
        this.wait = 2 + Math.random() * 5;
      }
    }
    if (!this.away) w.resolve(this.pos, this.r);
    this.c.root.visible = !this.away;
    this.c.root.rotation.y = this.yaw;
    animChibi(this.c, dt, { move: moving, attack: -1, cast: 0, talk: this.talking > 0 });
  }
  // 出门要先走到门口，进别人家也要先到门口
  goTo(t) {
    const w = this.g.world, here = w.insideHouse(this.pos.x, this.pos.z), path = [];
    if (this.away) { this.away = false; this.pos.set(26, 0, -23); }
    if (here && here !== t.house) path.push({ ...here.door });
    if (t.house && here !== t.house) path.push({ ...t.house.door });
    path.push({ x: t.x, z: t.z });
    this.path = path; this.target = t; this.wait = 0; this.stuckT = 0;
  }
  arrive() {
    if (this.target?.away) this.away = true;
    else if (this.target && !this.target.wander) this.yaw = this.target.house ? 0 : Math.atan2(-this.pos.x, -this.pos.z);
  }

  // 送礼口味
  taste(id) {
    const it = item(id), hit = (list) => list?.some((k) => k === id || k === it.base || k === 'cat:' + it.cat);
    return hit(this.d.loves) ? 'love' : hit(this.d.likes) ? 'like' : hit(this.d.dislikes) ? 'dislike' : 'neutral';
  }
  line() {
    const L = this.d.lines, g = this.g, pool = [...L.greet];
    if (this.hearts >= 3 && L.h3) pool.push(...L.h3, ...L.h3);
    if (this.hearts >= 6 && L.h6) pool.push(...L.h6, ...L.h6);
    if (g.weatherToday === 'rain' && L.rain && Math.random() < 0.4) return pick(L.rain);
    if (g.hours >= 20 && L.night && Math.random() < 0.5) return pick(L.night);
    return pick(pool);
  }
  heartText() {
    if (this.aff < 0) return `好感 ${Math.max(SHOW_FLOOR, this.aff)}`;
    const h = this.hearts;
    return '♥'.repeat(h) + '♡'.repeat(Math.max(0, 10 - h));
  }
  // 灵根要神识够才看得清（GDD：村民灵根，神识够高才能看到）
  rootText(sense) {
    const d = this.d;
    if (sense < d.sense) return d.hidden ? '灵根：深不可测' : `灵根：看不清（神识 ${d.sense}）`;
    return `灵根：${d.root.e}·${GRADE[d.root.grade]} ｜ 修为：${realmText(d.realm[0], d.realm[1])}`;
  }
}

export class Village {
  constructor(g, data) {
    this.g = g; this.data = data;
    const per = {};
    this.list = data.villagers.map((d) => { per[d.home] = (per[d.home] || 0) + 1; return new Villager(this, d, per[d.home] - 1); });
    this.byId = Object.fromEntries(this.list.map((v) => [v.d.id, v]));
    this.quests = null; // quests.js 填：(villager) => [{ label, fn }]
    g.life.on((P) => {
      let best = null, bd = 2.2;
      for (const v of this.list) { if (v.away) continue; const d = v.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = v; } }
      return best && { label: `交谈 · ${best.name}（${best.d.role}）`, act: () => this.talk(best), d: bd - 0.5 };
    });
    g.life.dayHooks.push(() => { for (const v of this.list) { v.talked = false; v.gifted = false; } });
  }
  update(dt) { for (const v of this.list) v.update(dt, this.g.hours); }

  shopOpen(v) { const [a, b] = v.d.hours || [0, 0]; return v.d.shop && this.g.hours >= a && this.g.hours < b && v.place === 'work'; }
  talk(v, line) {
    const g = this.g, P = g.player;
    v.talking = 4;
    if (!v.talked) { v.talked = true; v.addAff(10); }
    const choices = [];
    if (!v.gifted) choices.push({ label: '🎁 送礼', fn: () => this.giftMenu(v) });
    if (v.d.shop) {
      const open = this.shopOpen(v), [a, b] = v.d.hours;
      choices.push({ label: open ? '💰 买卖' : `💰 买卖（${a}:00–${b % 24}:00 在店里）`, off: !open, fn: () => open && this.openShop(v) });
    }
    for (const q of this.quests?.(v) || []) choices.push(q);
    choices.push({ label: '离开' });
    g.ui.dialog({
      name: v.name, sub: `${v.d.role} · ${v.d.pers}　${v.heartText()}`,
      line: line || v.line(), info: v.rootText(g.sense?.() ?? 20), hint: v.d.bio, choices,
    });
  }
  giftMenu(v) {
    const g = this.g;
    g.ui.openBag(g.inv, {
      title: `送给 ${v.name}`, filter: (it) => it.cat !== 'seed',
      gift: (id) => {
        g.ui.closePanel();
        const t = v.taste(id); g.inv.take(id); v.gifted = true; v.addAff(GIFT_PTS[t]);
        g.fx.num({ x: v.pos.x, z: v.pos.z }, t === 'dislike' ? '……' : `♥ +${GIFT_PTS[t]}`, t === 'dislike' ? 'hurt' : 'heal');
        const say = t === 'neutral' ? '谢谢你的心意。' : v.d.gift[t];
        this.talk(v, `${say}（${itemName(id)}）`);
      },
    });
  }
  // 好感折扣：每颗心便宜 1.5%，最多 15%
  openShop(v) {
    const g = this.g, shop = SHOPS[v.d.shop], season = Math.floor((g.day - 1) / 14) % 4;
    g.ui.openShop(shop, g.inv, {
      discount: 1 - Math.min(0.15, v.hearts * 0.015),
      exchange: v.d.shop === 'merchant',
      filterBuy: (it) => it.cat !== 'seed' || CROPS[it.crop].seasons.includes(season),
      toast: (m) => g.toast(m, 1.5),
      onSell: (id, k, got) => g.onSell?.(id, k, got, v),
      onBuy: (id, k) => g.onBuy?.(id, k, v),
    });
  }
  save() { return Object.fromEntries(this.list.map((v) => [v.d.id, [v.aff, v.talked ? 1 : 0, v.gifted ? 1 : 0]])); }
  load(s) {
    for (const v of this.list) {
      const [a, t, gf] = s[v.d.id] || [0, 0, 0];
      v.aff = a; v.talked = !!t; v.gifted = !!gf; v.place = null; v.path = []; v.away = false;
      const p = v.spot(v.schedPlace(this.g.hours)); v.pos.set(p.x, 0, p.z);
    }
  }
}
