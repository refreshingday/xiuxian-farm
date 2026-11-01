// 世界事件（GDD 第 3 / 6 / 7 节）。
// 血月：满月夜按概率出现，18:30 升起，妖兽更强（+50%）、掉落翻倍。
// 妖虫夜袭：大约每 20–30 天一次，21:00 起妖虫分三波冲向灵田啃庄稼——家门口的轻度塔防。背包里有护田阵旗就能挡住。
import { dateOf } from './calendar.js';
import { FARM, GATES } from './world.js';

export class Events {
  constructor(g) {
    this.g = g;
    this.raidDay = 10 + Math.floor(Math.random() * 6); // 第一次早一点，让玩家见识一下
    this.raid = null; this.bloodTonight = false; this.bloodShown = false;
    this.tideDay = 24 + Math.floor(Math.random() * 10); this.tide = null; // 兽潮：从万妖谷沿路打向村子；魔道入侵：从血魔宫（南）夜袭
    this.invadeDay = -1;
    g.bloodMoon = false;
    g.moonK = () => 1 - Math.abs(dateOf(g.day).moon - 7) / 7; // 离满月多近：0（新月）… 1（满月）
    g.life.dayHooks.push((d) => this.newDay(d));
  }
  newDay(d) {
    this.bloodTonight = d.fullMoon && Math.random() < 0.4;
    this.bloodShown = false; this.g.bloodMoon = false;
    if (this.raid) this.endRaid(true);
    if (this.tide) this.endTide(true);
    for (const v of this.g.village?.list || []) if (v.injured && v.injured <= d.day) { v.injured = 0; }
    // 筑基以后，血魔宫开始盯上青竹村（GDD：魔道入侵村庄从血魔宫发起）
    if (this.invadeDay < 0 && this.g.player.layer >= 10) this.invadeDay = d.day + 12 + Math.floor(Math.random() * 10);
    if (d.day === this.tideDay) return '李猎户：东北万妖谷那边动静不对……今天下午怕是有兽潮冲村子！';
    if (d.day === this.invadeDay) return '吴镖头：南边来了一伙来路不明的人，身上一股血腥味……今晚多半要出事！';
    if (d.day === this.raidDay) return '何二愣：田边的虫子多得不对劲……今晚怕是要闹妖虫，守好灵田！';
    if (d.fullMoon) return '今晚满月——狼群最凶，血月也可能出来。';
    return '';
  }
  update(dt) {
    const g = this.g, h = g.hours;
    g.bloodMoon = this.bloodTonight && h >= 18.5;
    if (g.bloodMoon && !this.bloodShown) { this.bloodShown = true; g.toast('血月当空！\n今夜妖兽更凶，掉落翻倍', 4); g.shake(0.4); }
    if (g.day === this.raidDay && h >= 21 && !this.raid) this.startRaid();
    if (this.raid) this.updateRaid(dt);
    if (g.day === this.tideDay && g.quests?.flags.has('beastPeace')) this.tideDay = g.day + 30; // 万妖谷调停过：兽潮不再来
    if (g.day === this.tideDay && h >= 14 && !this.tide) this.startTide('tide');
    if (g.day === this.invadeDay && h >= 21 && !this.tide) this.startTide('invade');
    if (this.tide) this.updateTide(dt);
    g.villageAlarm = !!this.tide;
  }

  // ---------- 冲村（GDD 世界事件）：兽潮从东北（白天）、魔道入侵从南边（夜里），三波冲进村子；
  // 守住全村感激，没守住会有村民重伤卧床几天 ----------
  startTide(kind) {
    const inv = kind === 'invade';
    this.tide = { kind, waves: 3, next: 0, reached: 0, ang: GATES.find((g) => g.id === (inv ? 's' : 'ne')).a, mobs: inv ? ['demoncult'] : ['wolf', 'boar', 'python', 'wolf'], end: inv ? 25.5 : 20 };
    this.g.toast(inv ? '魔道入侵！\n血魔宫的魔修夜袭青竹村——村民都躲进屋里了' : '兽潮来了！\n妖兽从东北冲向青竹村——村民都躲进屋里了', 4); this.g.shake(0.5);
  }
  updateTide(dt) {
    const g = this.g, T = this.tide;
    T.next -= dt;
    if (T.next <= 0 && T.waves > 0) {
      const n = (T.kind === 'invade' ? 3 : 5) + (3 - T.waves) * (T.kind === 'invade' ? 2 : 3), lvl = 1 + Math.floor(g.player.layer / 2);
      for (let i = 0; i < n; i++) {
        const a = T.ang + (Math.random() - 0.5) * 0.12, r = 46 + Math.random() * 6; // 对着村门冲
        const e = g.enemies.spawn(T.mobs[i % T.mobs.length], Math.sin(a) * r, -Math.cos(a) * r, lvl);
        e.raid = { x: 0, z: 0 }; e.tide = true; e.state = 'chase';
      }
      T.waves--; T.next = 30; g.toast(`${T.kind === 'invade' ? '魔修' : '兽潮'} · 第 ${3 - T.waves} 波`, 1.6);
    }
    for (const e of g.enemies.list) if (e.tide && Math.hypot(e.pos.x, e.pos.z) < 7 && !e.hitVillage) { e.hitVillage = true; T.reached++; }
    const left = g.enemies.list.filter((e) => e.tide).length;
    if ((T.waves === 0 && !left) || g.hours >= T.end) this.endTide();
  }
  endTide(silent) {
    const g = this.g, T = this.tide;
    for (const e of [...g.enemies.list]) if (e.tide) g.enemies.remove(e);
    this.tide = null;
    if (T.kind === 'invade') this.invadeDay = g.day + 35 + Math.floor(Math.random() * 15); else this.tideDay = g.day + 26 + Math.floor(Math.random() * 10);
    if (silent) return;
    if (!T.reached) {
      for (const v of g.village.list) v.addAff(T.kind === 'invade' ? 25 : 15);
      g.addMoney(T.kind === 'invade' ? 800 : 400, g.player.pos);
      if (T.kind === 'invade') g.realm?.addKarma(-5);
      g.toast(`${T.kind === 'invade' ? '魔修' : '兽潮'}退了！村子毫发无伤\n全村人都记着你的好`, 4); return;
    }
    const hurt = [...g.village.list].filter((v) => !v.d.hidden).sort(() => Math.random() - 0.5).slice(0, Math.min(3, 1 + Math.floor(T.reached / 3)));
    for (const v of hurt) v.injured = g.day + 3;
    g.toast(`${T.kind === 'invade' ? '魔修' : '兽潮'}冲进了村子……\n${hurt.map((v) => v.name).join('、')}受了重伤，要卧床几天`, 4.5);
  }

  // ---------- 妖虫夜袭 ----------
  get farmC() { return { x: FARM.x0 + FARM.cols * FARM.size / 2, z: FARM.z0 + FARM.rows * FARM.size / 2 }; }
  protectedFarm() { return this.g.inv.count('zhenqi') > 0; }
  startRaid() {
    this.raid = { waves: 3, next: 0, eaten: 0, killed: 0, t: 0 };
    this.g.toast(`妖虫夜袭！\n${this.protectedFarm() ? '护田阵旗亮了起来——灵田有阵法护着' : '快回灵田守着，别让它们啃了庄稼！'}`, 4);
    this.g.emit?.('raid');
  }
  pickTile() {
    const tiles = this.g.farm.tiles.filter((t) => t.state === 2);
    const t = tiles.length ? tiles[Math.floor(Math.random() * tiles.length)] : null;
    return t ? { x: t.x, z: t.z } : this.farmC;
  }
  updateRaid(dt) {
    const g = this.g, R = this.raid, c = this.farmC, guard = this.protectedFarm();
    R.t += dt; R.next -= dt;
    if (R.next <= 0 && R.waves > 0) {
      const n = 5 + (3 - R.waves) * 3;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, e = g.enemies.spawn('insect', c.x + Math.cos(a) * 24, c.z + Math.sin(a) * 24, Math.floor(g.player.layer / 3));
        e.raid = this.pickTile(); e.state = 'chase'; e.eatT = 0;
      }
      R.waves--; R.next = 28;
      g.toast(`第 ${3 - R.waves} 波妖虫来了`, 1.6);
    }
    const F = FARM, inField = (p, pad = 0) => p.x > F.x0 - pad && p.x < F.x0 + F.cols * F.size + pad && p.z > F.z0 - pad && p.z < F.z0 + F.rows * F.size + pad;
    for (const e of g.enemies.list) {
      if (!e.raid || e.tide) continue;
      if (guard && inField(e.pos, 1.2)) {
        // 护田阵：碰到阵就挨电，被弹回去
        g.enemies.damage(e, e.maxHp * 0.6 * dt * 3, c.x, c.z, 10);
        if (Math.random() < 0.3) g.fx.mote(e.pos.x, 0.8, e.pos.z, '#ffd27a', { life: 0.3, size: 1.2, bright: 3 });
        continue;
      }
      const t = g.world.farmTileAt(e.pos.x, e.pos.z);
      if (t && t.state === 2 && e.state !== 'charge') {
        e.eatT += dt;
        if (Math.random() < 0.2) g.fx.mote(t.x, 0.4, t.z, '#8adf3a', { life: 0.4, size: 0.8 });
        if (e.eatT > 2.2) { t.state = 3; g.farm.paint(t); R.eaten++; e.eatT = 0; e.raid = this.pickTile(); g.fx.burst({ x: t.x, z: t.z }, '#8a6a3a', 10, { speed: 2, up: 2, life: 0.5 }); }
      } else if (t?.state !== 2 && Math.hypot(e.pos.x - e.raid.x, e.pos.z - e.raid.z) < 1) e.raid = this.pickTile();
    }
    const left = g.enemies.list.filter((e) => e.raid && !e.tide).length;
    if ((R.waves === 0 && !left) || g.hours >= 25.5) this.endRaid();
  }
  endRaid(silent) {
    const g = this.g, R = this.raid;
    for (const e of [...g.enemies.list]) if (e.raid && !e.tide) g.enemies.remove(e);
    this.raid = null;
    this.raidDay = g.day + 20 + Math.floor(Math.random() * 11);
    if (silent) return;
    if (R.eaten) g.toast(`妖虫退了……被啃坏了 ${R.eaten} 块地`, 3);
    else { g.toast('妖虫夜袭守住了！灵田一株没少', 3); g.village?.byId.farmer?.addAff(30); g.village?.byId.chief?.addAff(20); g.addMoney?.(200, g.player.pos); }
  }
  save() { return { raidDay: this.raidDay, blood: this.bloodTonight, tideDay: this.tideDay, invadeDay: this.invadeDay, hurt: this.g.village.list.filter((v) => v.injured).map((v) => [v.d.id, v.injured]) }; }
  load(s) { this.raidDay = s.raidDay; this.bloodTonight = !!s.blood; this.tideDay = s.tideDay ?? this.tideDay; this.invadeDay = s.invadeDay ?? -1; for (const [id, d] of s.hurt || []) if (this.g.village.byId[id]) this.g.village.byId[id].injured = d; }
}
