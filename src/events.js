// 世界事件（GDD 第 3 / 6 / 7 节）。
// 血月：满月夜按概率出现，18:30 升起，妖兽更强（+50%）、掉落翻倍。
// 妖虫夜袭：大约每 20–30 天一次，21:00 起妖虫分三波冲向灵田啃庄稼——家门口的轻度塔防。背包里有护田阵旗就能挡住。
import { dateOf } from './calendar.js';
import { FARM } from './world.js';

export class Events {
  constructor(g) {
    this.g = g;
    this.raidDay = 10 + Math.floor(Math.random() * 6); // 第一次早一点，让玩家见识一下
    this.raid = null; this.bloodTonight = false; this.bloodShown = false;
    g.bloodMoon = false;
    g.moonK = () => 1 - Math.abs(dateOf(g.day).moon - 7) / 7; // 离满月多近：0（新月）… 1（满月）
    g.life.dayHooks.push((d) => this.newDay(d));
  }
  newDay(d) {
    this.bloodTonight = d.fullMoon && Math.random() < 0.4;
    this.bloodShown = false; this.g.bloodMoon = false;
    if (this.raid) this.endRaid(true);
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
      if (!e.raid) continue;
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
    const left = g.enemies.list.filter((e) => e.raid).length;
    if ((R.waves === 0 && !left) || g.hours >= 25.5) this.endRaid();
  }
  endRaid(silent) {
    const g = this.g, R = this.raid;
    for (const e of [...g.enemies.list]) if (e.raid) g.enemies.remove(e);
    this.raid = null;
    this.raidDay = g.day + 20 + Math.floor(Math.random() * 11);
    if (silent) return;
    if (R.eaten) g.toast(`妖虫退了……被啃坏了 ${R.eaten} 块地`, 3);
    else { g.toast('妖虫夜袭守住了！灵田一株没少', 3); g.village?.byId.farmer?.addAff(30); g.village?.byId.chief?.addAff(20); g.addMoney?.(200, g.player.pos); }
  }
  save() { return { raidDay: this.raidDay, blood: this.bloodTonight }; }
  load(s) { this.raidDay = s.raidDay; this.bloodTonight = !!s.blood; }
}
