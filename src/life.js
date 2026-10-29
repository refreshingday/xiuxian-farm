// 日常：一天的节奏、睡觉 / 昏倒、死亡掉落、吃东西，以及 F 交互的统一入口。
// GDD 第 3 节「每日规则」：只有时间限制，不设体力。2:00 不在安全点（家、坊市、宗门）就昏倒，被村民救回、丢一点钱；
// 在家睡觉回满状态，并得打坐修为。死亡丢部分金钱和数量多、价值低的材料，掉在原地，天亮前可以回去捡。
import * as THREE from 'three';
import { DAY_START, DAY_END, SEC_PER_HOUR, dateOf, rollWeather } from './calendar.js';
import { item, itemName } from './items.js';
import { glow } from './util.js';

// 离点 p 不到 r 米就返回距离，否则 false
export const near = (P, p, r) => { const d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z); return d < r && d; };

export class Life {
  constructor(g) {
    this.g = g;
    this.interactors = [];  // (P) => { label, act?, d } | null —— 每帧挑最近的那个显示提示
    this.dayHooks = [];     // (date) => void，新的一天开始时调用（农田、村民、任务……）
    this.loot = null;       // 死亡掉落的包袱
    this.ending = false;
    this.tox = {};          // 丹毒：今天吃过几颗同种丹药
    this.home = g.world.houses.find((h) => h.player);
    this.bed = { x: this.home.x0 + 1.0, z: this.home.z0 + 1.3 };
    this.on((P) => near(P, this.bed, 1.8) && { label: '睡觉（结束这一天 · 存档）', act: () => this.askSleep() });
    this.on((P) => this.loot && near(P, this.loot, 1.6) && { label: '拾回遗失的物品', act: () => this.pickLoot() });
  }
  on(fn) { this.interactors.push(fn); }
  find() {
    const P = this.g.player; let best = null;
    for (const f of this.interactors) { const c = f(P); if (c && (!best || c.d < best.d)) best = c; }
    return best;
  }
  get atHome() { const h = this.home, p = this.g.player.pos; return p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1; }

  // ---------- 时间 ----------
  // 返回本帧经过的游戏小时
  tick(dt, fast) {
    const g = this.g, dh = dt / SEC_PER_HOUR * (fast ? 40 : 1);
    g.hours += dh;
    if (g.hours >= DAY_END && !this.ending) this.passOut();
    return dh;
  }
  askSleep() {
    const g = this.g, early = g.hours < 18;
    g.ui.dialog({ narrate: true, line: early ? '天色还早。现在就睡到明天早上吗？' : '要睡到明天早上吗？睡前会自动存档。', choices: [{ label: '睡觉', fn: () => this.endDay('sleep') }, { label: '再等等' }] });
  }
  // 2:00：在家就倒头睡；在坊市、宗门这些安全点就地歇下；都不是就昏倒
  passOut() {
    if (this.atHome) { this.g.toast('太晚了，你倒头就睡……', 2); this.endDay('sleep'); return; }
    const safe = this.g.safeAt?.(this.g.player.pos);
    if (safe) { this.g.toast(`太晚了，在${safe.name}歇下了`, 2); this.endDay('sleep', { at: safe.bed, meditate: false }); }
    else this.endDay('faint');
  }
  // o.at = 在哪醒来（默认自家床边）；o.meditate = 打坐修为只有自家洞府才有
  endDay(kind, o = {}) {
    if (this.ending) return;
    this.ending = true;
    const g = this.g, P = g.player, inv = g.inv, fade = document.getElementById('fade');
    g.paused = true; fade.classList.add('on');
    setTimeout(() => {
      let note = '';
      if (kind === 'sleep') {
        // 在安全点睡觉回满；在自家洞府睡觉额外得打坐修为（约占修为来源的 20%）
        P.hp = P.maxHp; P.qi = P.maxQi;
        if (o.meditate !== false) {
          const xp = Math.round(g.xpNeed() * 0.22 * (1 + (P.mods?.meditate || 0)));
          g.addXP(xp, P.pos, true);
          note = `打坐一夜，修为 +${Math.round(xp * (g.rootMul?.() ?? 1))}`;
        } else note = '一夜好眠';
      } else {
        const lost = Math.min(inv.money, Math.max(0, Math.round(inv.money * 0.1)));
        inv.money -= lost;
        P.hp = Math.round(P.maxHp * 0.6); P.qi = P.maxQi;
        note = `你昏倒在外，被村民背了回来${lost ? `，丢了 ${lost} 文` : ''}`;
      }
      const notes = this.newDay();
      const at = o.at || { x: this.bed.x + 1.3, z: this.bed.z + 0.6 };
      P.pos.set(at.x, 0, at.z); P.vy = 0; P.dead = false; P.c.root.visible = true;
      g.save?.();
      fade.classList.remove('on');
      g.paused = false; this.ending = false;
      const d = dateOf(g.day);
      g.toast([`${d.seasonName}季 第${d.dayOfSeason}天 · ${d.weekName} ${d.moonIcon}${d.event ? ' · ' + d.event : ''}${g.weatherToday === 'rain' ? ' · 下雨' : ''}`, note, ...notes].filter(Boolean).join('\n'), 5);
    }, 900);
  }
  newDay() {
    const g = this.g;
    g.day++; g.hours = DAY_START; g.world.day = g.day;
    g.weatherToday = rollWeather(g.day); g.weather.setDay(g.weatherToday === 'rain');
    g.inv.newDay(); this.tox = {};
    this.clearLoot();
    for (const e of [...g.enemies.list]) if (!e.boss) g.enemies.remove(e);
    const d = dateOf(g.day);
    return this.dayHooks.map((f) => f(d)).filter(Boolean); // 各系统的早报（灵田、委托……）
  }

  // ---------- 死亡掉落 ----------
  deathDrop() {
    const g = this.g, P = g.player, inv = g.inv;
    const money = Math.round(inv.money * 0.1), items = {};
    inv.money -= money;
    for (const id of inv.ids((it) => ['mat', 'crop', 'herb'].includes(it.cat) && it.sell <= 60 && !it.age)) {
      const k = Math.ceil(inv.count(id) / 2); inv.take(id, k); items[id] = k;
    }
    if (money || Object.keys(items).length) this.dropLoot(P.pos.x, P.pos.z, items, money);
    const n = Object.values(items).reduce((a, b) => a + b, 0);
    return money || n ? `丢了 ${money} 文和 ${n} 件材料，包袱还在原地，天亮前回去捡` : '';
  }
  dropLoot(x, z, items, money) {
    this.clearLoot();
    const m = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8).scale(1, 0.8, 1), glow('#ffd27a', 2.2));
    bag.position.y = 0.3; m.add(bag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 24).rotateX(-Math.PI / 2), glow('#ffd27a', 1.6));
    ring.position.y = 0.05; m.add(ring);
    m.position.set(x, 0, z); this.g.scene.add(m);
    this.loot = { x, z, items, money, m };
  }
  pickLoot() {
    const L = this.loot, inv = this.g.inv; if (!L) return;
    inv.money += L.money;
    for (const [id, k] of Object.entries(L.items)) inv.add(id, k);
    this.g.toast(`拾回了 ${L.money} 文${Object.keys(L.items).length ? ' 和 ' + Object.entries(L.items).map(([id, k]) => itemName(id) + '×' + k).join('、') : ''}`, 3);
    this.clearLoot();
  }
  clearLoot() { if (this.loot) { this.g.scene.remove(this.loot.m); this.loot = null; } }
  update(dt) { if (this.loot) { this.loot.m.rotation.y += dt * 1.5; this.loot.m.children[0].position.y = 0.3 + Math.sin(this.g.time * 3) * 0.08; } }

  // ---------- 吃东西 / 服丹 ----------
  // 同一种丹药一天吃多了效果递减（丹毒，GDD 第 8 节）；睡一觉排掉
  use(id) {
    const g = this.g, P = g.player, it = item(id), inv = g.inv;
    if (!it || !inv.count(id) || P.dead) return false;
    if (it.use) return it.use(g);                 // 特殊物品（破境丹等）自己处理
    if (!(it.heal || it.qiHeal || it.xp)) return false;
    if (P.pillCd > 0) return false;
    inv.take(id); P.pillCd = 0.8;
    const M = P.mods || {}, tk = it.base || id;
    const k = it.cat === 'pill' ? 0.7 ** (((this.tox[tk] = (this.tox[tk] || 0) + 1) - 1) * (1 - (M.tox || 0))) * (1 + (M.pillPow || 0)) : 1;
    if (it.heal) { const v = Math.round(it.heal * k); P.hp = Math.min(P.maxHp, P.hp + v); g.fx.num(P.pos, '+' + v, 'heal'); }
    if (it.qiHeal) P.qi = Math.min(P.maxQi, P.qi + it.qiHeal * k * P.maxQi / 100);
    if (it.xp) g.addXP(it.xp * k, P.pos);
    if (k < 1 && it.cat === 'pill' && this.tox[tk] > 1) g.fx.num({ x: P.pos.x + 0.6, z: P.pos.z }, '丹毒 ' + Math.round(k * 100) + '%', 'hurt');
    g.fx.burst(P.pos, it.cat === 'pill' ? '#ffe28a' : '#7dffb0', 20, { speed: 2, up: 4, life: 0.8, grav: -1 });
    return true;
  }

  save() { return { tox: this.tox, loot: this.loot && { x: this.loot.x, z: this.loot.z, items: this.loot.items, money: this.loot.money } }; }
  load(s) { this.tox = s.tox || {}; this.clearLoot(); if (s.loot) this.dropLoot(s.loot.x, s.loot.z, s.loot.items, s.loot.money); }
}
