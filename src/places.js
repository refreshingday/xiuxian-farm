// 独特地点（GDD 第 7 节「15 个独特地点」）：每处绑一个只属于它的机制。
// - 鬼市（古战场 590m）：只在夜里或新月开放，禁止动手；能用修为洗炼灵根，邪修在这里卖夺来的灵根。
// - 古剑冢（沙漠 860m）：拔剑就要和前主人的残影单挑，赢了学一招；连胜三个残影，剑魂认主成本命法宝。
// - 天火陨坑（火山 660m）：流星雨夜陨石随机落下（地面预警圈），抢新落的天外陨铁碎片，有散修来争。
// - 天劫峰心魔路（北端 1000m 以外）：三道关，每道一群心魔；业力越高、夺过的灵根越多，心魔越多。
// - 玄晶矿洞的灯火：点着灯才看得清，灯油烧完了暗处的石傀更凶。
import * as THREE from 'three';
import { TYPES } from './enemies.js';
import { near } from './life.js';
import { btn, el } from './ui.js';
import { dateOf } from './calendar.js';
import { item, itemName } from './items.js';
import { MINE } from './world.js';
import { createChibi, animChibi } from './chibi.js';
import { toon, glow, mesh } from './util.js';

const ELEM = ['金', '木', '水', '火', '土'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Places {
  constructor(g, landmarks) {
    this.g = g;
    const find = (n) => landmarks.list.find((L) => L.name === n);
    this.ghost = find('鬼市'); this.tomb = find('古剑冢'); this.crater = find('天火陨坑'); this.peak = find('天劫峰');
    TYPES.heartdemon = { ...TYPES.bandit, name: '心魔', c: ['#3a2a5a', '#1a1030', '#ff4aff'], hp: 220, dmg: 22, speed: 4.4, drops: [['yaodan', 0.6]], stones: [2, 4] };
    TYPES.swordghost = { ...TYPES.bandit, name: '剑冢残影', c: ['#c8d8ff', '#6a7ab8', '#9ef0ff'], hp: 380, dmg: 26, speed: 4.8, drops: [], stones: [6, 10] };
    this.tombWins = 0; this.tombDay = -1; this.duel = null;
    this.showerTonight = false; this.meteorT = 0; this.frags = [];
    this.peakGates = new Set(); this.peakDay = -1;
    this.oil = 60; this.lampWarn = 0;
    this.stalls = null;
    // 鬼市：夜里的摊子
    g.life.on((P) => this.ghostOpen() && this.stalls && near(P, this.ghost, 9) !== false && { label: '鬼市 · 蒙面摊主', act: () => this.openGhost(), d: 1 });
    // 古剑冢：拔剑
    g.life.on((P) => this.tomb && near(P, this.tomb, 3.5) !== false && !this.duel && { label: this.tombWins >= 3 ? '古剑冢（剑魂已认主）' : `拔剑（第 ${this.tombWins + 1} 道残影）`, act: this.tombWins >= 3 ? null : () => this.drawSword(), d: 1 });
    // 天火陨坑：捡陨铁碎片
    g.life.on((P) => { for (const f of this.frags) { const d = near(P, f, 1.6); if (d !== false) return { label: '捡起天外陨铁碎片', act: () => this.pickFrag(f), d }; } return null; });
    g.life.dayHooks.push((d) => {
      this.showerTonight = g.weatherToday !== 'rain' && Math.random() < 0.3;
      for (const f of this.frags) g.scene.remove(f.m); this.frags = [];
      return this.showerTonight ? '刘半仙：今夜火山那边天象异动，天火陨坑怕是有流星雨。' : '';
    });
  }

  // ---------- 鬼市 ----------
  ghostOpen() { const g = this.g; return g.hours >= 20 || dateOf(g.day).newMoon; }
  updateGhost(dt) {
    const g = this.g, P = g.player, L = this.ghost;
    if (!L) return;
    const open = this.ghostOpen(), close = Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < 80;
    if (open && close && !this.stalls) {
      this.stalls = [];
      const lantern = glow('#7affd0', 2.2);
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4, x = L.x + Math.cos(a) * 6, z = L.z + Math.sin(a) * 6;
        const c = createChibi({ skin: '#c8c8d0', hair: '#1a1a20', hairStyle: 1, robe: '#2a2a3a', robe2: '#1a1a24', belt: '#101018', age: 'adult' });
        c.root.position.set(x, 0, z); c.root.rotation.y = Math.atan2(L.x - x, L.z - z);
        c.root.traverse((o) => { if (o.material && !Array.isArray(o.material)) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.7; } });
        const lamp = mesh(new THREE.SphereGeometry(0.22, 10, 8), lantern, { cast: false }); lamp.position.set(x, 2.2, z);
        g.scene.add(c.root, lamp); this.stalls.push(c, { root: lamp });
      }
    } else if ((!open || !close) && this.stalls) { for (const s of this.stalls) g.scene.remove(s.root); this.stalls = null; }
    if (this.stalls) for (const s of this.stalls) if (s.arms) animChibi(s, dt, { move: 0, attack: -1, cast: 0 });
    // 鬼市禁止动手：妖兽不进来，你也出不了招
    g.noFight = !!(this.stalls && Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < 16);
    if (g.noFight) for (const e of [...g.enemies.list]) if (!e.boss && Math.hypot(e.pos.x - L.x, e.pos.z - L.z) < 30) g.enemies.remove(e);
  }
  openGhost() {
    const g = this.g, inv = g.inv;
    const sells = [...ELEM.map((e) => 'root_' + e), 'pill_root', 'pill_purify', 'tc_金_1', 'tc_木_1', 'tc_水_1', 'tc_火_1', 'tc_土_1'];
    g.ui.panel('鬼市', (body) => {
      body.append(el('div', 'pmoney', `💎 灵石 ${inv.stones}　业力 ${g.player.karma || 0}`));
      body.append(el('div', 'pempty', '蒙面摊主压低声音：「灵根、天材、丹药……都是好货，别问来路。」'));
      body.append(btn('🌱 灵根洗炼（用修为代替天材地宝）', () => { g.ui.closePanel(); g.realm.openRoots(true); }, 'wide'));
      for (const id of sells) {
        const it = item(id), stolen = id.startsWith('root_'), p = stolen ? 260 : Math.max(8, Math.ceil(it.sell / 70));
        body.append(g.ui.row(it.icon, `${it.name} <i>${p} 灵石${stolen ? ' · 业力 +10' : ''}</i>`, stolen ? '夺来的灵根，原主人已成凡人……' : it.desc, [btn('买', () => {
          if (inv.stones < p) return g.toast('灵石不够', 1.2);
          inv.stones -= p; inv.add(id); if (stolen) g.realm.addKarma(10); g.ui.refresh();
        }, inv.stones < p ? 'off' : '')]));
      }
    });
  }

  // ---------- 古剑冢 ----------
  drawSword() {
    const g = this.g, L = this.tomb;
    if (this.tombDay === g.day) { g.toast('残影今天已经散了，明天再来', 2); return; }
    const e = g.enemies.spawn('swordghost', L.x, L.z + 3, 18 + this.tombWins * 2); e.state = 'chase'; e.trial = true;
    this.duel = e; this.tombDay = g.day;
    g.toast(`剑冢第 ${this.tombWins + 1} 道残影现身！`, 2.5);
  }
  updateTomb() {
    const g = this.g, P = g.player, D = this.duel;
    if (!D) return;
    if (P.dead || Math.hypot(P.pos.x - this.tomb.x, P.pos.z - this.tomb.z) > 30) { g.enemies.remove(D); this.duel = null; g.toast('残影散去了', 1.6); return; }
    if (D.alive) return;
    this.duel = null; this.tombWins++;
    P.atkBonus += 0.08;
    if (this.tombWins >= 3) { P.atkBonus += 0.2; g.ui.dialog({ narrate: true, lines: ['三道残影都散了。', '冢中那柄古剑轻轻一颤，化作一道光没入你的眉心——剑魂认主。'], info: '本命法宝：攻击再 +20%' }); }
    else g.ui.dialog({ narrate: true, line: `残影临散前，把一招剑意传给了你。（${this.tombWins}/3）`, info: '攻击 +8%' });
  }

  // ---------- 天火陨坑：流星雨夜 ----------
  updateCrater(dt) {
    const g = this.g, P = g.player, L = this.crater;
    if (!L || !this.showerTonight || g.nightK < 0.6) return;
    if (Math.hypot(P.pos.x - L.x, P.pos.z - L.z) > 45) return;
    this.meteorT -= dt;
    if (this.meteorT > 0) return;
    this.meteorT = 1.6 + Math.random() * 1.6;
    const a = Math.random() * 6.28, r = Math.random() < 0.5 ? Math.random() * 6 : 8 + Math.random() * 20;
    const x = (r < 6 ? P.pos.x : L.x) + Math.cos(a) * r, z = (r < 6 ? P.pos.z : L.z) + Math.sin(a) * r;
    g.fx.circle(x, z, 2.6, 1.3, () => {
      g.cfx?.pillar(x, z, 1.2, 12, '#ff8a3a', 0.4); g.cfx?.flash(x, z, '#ff8a3a', 40, 0.3, 2);
      g.fx.shockRing(x, z, 3, '#ff8a3a', 0.4); g.fx.burst({ x, z }, '#ffb03a', 24, { speed: 6, up: 6, life: 0.6, y: 0.3 }); g.shake(0.5);
      if (Math.hypot(P.pos.x - x, P.pos.z - z) < 2.6 + P.r) P.hurt(P.maxHp * 0.25, x, z, 8);
      if (Math.random() < 0.55) {
        const m = mesh(new THREE.OctahedronGeometry(0.35, 0), glow('#ffb03a', 2.6), { cast: false }); m.position.set(x, 0.4, z); g.scene.add(m);
        this.frags.push({ x, z, m });
      }
    });
    if (Math.random() < 0.12) { const b = g.enemies.spawn('bandit', L.x + (Math.random() - 0.5) * 30, L.z + (Math.random() - 0.5) * 30, 13); b.state = 'chase'; g.toast('有散修来抢陨铁！', 1.6); }
  }
  pickFrag(f) { this.g.scene.remove(f.m); this.frags.splice(this.frags.indexOf(f), 1); this.g.addItem('meteor_iron', 1, f); }

  // ---------- 天劫峰心魔路 ----------
  updatePeak() {
    const g = this.g, P = g.player;
    if (!this.peak || P.pos.z > -980) return;
    if (this.peakDay !== g.day) { this.peakDay = g.day; this.peakGates.clear(); }
    const d = Math.hypot(P.pos.x, P.pos.z);
    for (const [i, gate] of [1030, 1070, 1110].entries()) {
      if (d < gate || this.peakGates.has(i)) continue;
      this.peakGates.add(i);
      const n = 1 + i + (P.stolen?.length || 0) + Math.floor((P.karma || 0) / 40);
      for (let k = 0; k < n; k++) { const a = k / n * 6.28, e = g.enemies.spawn('heartdemon', P.pos.x + Math.cos(a) * 7, P.pos.z + Math.sin(a) * 7, 22 + i); e.state = 'chase'; }
      g.toast(`心魔路 · 第 ${i + 1} 关\n${n} 只心魔从你的过往里走了出来${P.stolen?.length ? '（其中有被你夺过灵根的人）' : ''}`, 3.5);
    }
  }

  // ---------- 玄晶矿洞：灯火 ----------
  updateMine(dt) {
    const g = this.g, P = g.player, inMine = g.world.mineFactor > 0.5;
    if (!inMine) { g.lampOn = true; return; }
    if (this.oil <= 0 && g.inv.take('lamp_oil')) { this.oil = 60; g.toast('添了灯油', 1.2); }
    this.oil -= dt;
    g.lampOn = this.oil > 0;
    if (!g.lampOn && g.time - this.lampWarn > 8) { this.lampWarn = g.time; g.toast('灯灭了！暗处的石傀更凶了……（杂货铺有灯油卖）', 2.5); }
    if (!g.lampOn) for (const e of g.enemies.list) if (e.type === 'golem' && !e.dark) { e.dark = true; e.dmg *= 1.3; }
  }

  update(dt) {
    this.updateGhost(dt); this.updateTomb(); this.updateCrater(dt); this.updatePeak(); this.updateMine(dt);
  }
  save() { return { tombWins: this.tombWins, tombDay: this.tombDay, shower: this.showerTonight, oil: this.oil }; }
  load(s) { this.tombWins = s.tombWins || 0; this.tombDay = s.tombDay ?? -1; this.showerTonight = !!s.shower; this.oil = s.oil ?? 60; }
}
