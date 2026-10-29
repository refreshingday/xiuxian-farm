// 节日、道侣、结局（GDD 第 9 / 1 节）。
// 节日：百花会（春，百花谷：斗花 + 比武择道侣）、灯会（夏季满月夜：猜灯谜）、丰收祭（秋：评庄稼 + 比武大会）、除夕（冬：年夜饭 + 村民送礼）。
//   节日那段时间村民都去会场，村长主持。
// 道侣：筑基之后，好感 8 颗心以上的人送同心结就是求结道侣；之后住进你家，睡觉多一点双修修为（只是一点点，主要是陪伴）。
// 结局：渡过最终天劫后，按业力和选择分支——正道飞升、入魔、当掌门（彩蛋）；然后可以带着灵根再入轮回（NG+）。
import * as THREE from 'three';
import { dateOf } from './calendar.js';
import { item, itemName } from './items.js';
import { near } from './life.js';
import { btn, el } from './ui.js';
import { TYPES } from './enemies.js';
import { levelInfo } from './realm.js';
import { glow, mesh } from './util.js';

const FEST = [
  { id: 'flower', name: '百花会', season: 0, day: 10, from: 9, to: 17, place: '百花谷', acts: ['judge:flower', 'duel'], intro: '春暖花开，百花谷里斗花比武，据说比武胜者能得心上人青睐。' },
  { id: 'lantern', name: '灯会', season: 1, day: 8, from: 18, to: 24, place: 'plaza', acts: ['riddle'], intro: '夏夜满月，村口挂满花灯，猜中灯谜有彩头。' },
  { id: 'harvest', name: '丰收祭', season: 2, day: 12, from: 9, to: 17, place: 'plaza', acts: ['judge:crop', 'duel'], intro: '秋收时节，比比谁家的庄稼最好，再来一场比武大会。' },
  { id: 'newyear', name: '除夕', season: 3, day: 14, from: 18, to: 24, place: 'plaza', acts: ['feast'], intro: '一年到头，全村一起吃年夜饭。' },
];
const RIDDLES = [
  ['千条线，万条线，掉到水里看不见。（打一天象）', ['雨', '雪', '风']], ['有头无颈，有眼无眉，无脚能走，有翅难飞。（打一动物）', ['鱼', '鸟', '蛇']],
  ['红公鸡，绿尾巴，身子钻到地底下。（打一蔬菜）', ['胡萝卜', '白菜', '茄子']], ['麻屋子，红帐子，里面住个白胖子。（打一食物）', ['花生', '核桃', '栗子']],
  ['小小诸葛亮，独坐中军帐，摆下八卦阵，专捉飞来将。（打一动物）', ['蜘蛛', '蜜蜂', '蚂蚁']], ['身穿绿衣裳，肚里水汪汪，生的子儿多，个个黑脸膛。（打一水果）', ['西瓜', '葡萄', '南瓜']],
  ['一物生来真奇怪，肚里长出牙齿来。（打一庄稼）', ['玉米', '稻谷', '土豆']], ['两个月亮挨着坐。（打一字）', ['朋', '明', '用']],
  ['一口咬掉牛尾巴。（打一字）', ['告', '吉', '午']], ['有面无口，有脚无手，听人讲话，陪人吃酒。（打一家具）', ['桌子', '椅子', '柜子']],
  ['上不在上，下不在下；不可在上，且宜在下。（打一字）', ['一', '二', '三']], ['身披金甲在田间，弯腰点头笑开颜。（打一庄稼）', ['稻谷', '玉米', '高粱']],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Social {
  constructor(g) {
    this.g = g;
    this.done = {};          // 今年各节日哪些项目做过了：{ 'harvest:12': Set }
    this.spouse = null;      // 道侣的村民 id
    this.kills = 0; this.ended = null;
    this.deco = null; this.duel = null;
    TYPES.sparring = { ...TYPES.bandit, name: '比武对手', c: ['#c94f4f', '#8a2a2a', '#ffe7a8'], drops: [], stones: null, xp: 10 };
    g.on('kill', () => this.kills++);
    g.on('breakthrough', (t) => { if (t >= 5) setTimeout(() => this.ending(), 3500); });
    // 节日期间村民都去会场
    g.festivalPlace = () => { const f = this.active(); return f && (f.place === 'plaza' ? 'plaza' : this.valley && ['wander', this.valley.x, this.valley.z, 8]); };
    const host = () => (this.active()?.place === 'plaza' ? g.village.byId.chief : null);
    g.life.on((P) => {
      const f = this.active(); if (!f) return null;
      const at = f.place === 'plaza' ? g.village.byId.chief?.pos : this.valley, d = at && near(P, at, f.place === 'plaza' ? 2.6 : 6);
      return d !== false && at && { label: `${f.name} · ${f.place === 'plaza' ? '村长主持' : '百花会会场'}`, act: () => this.openFestival(f), d: d - 0.6 };
    });
    g.life.dayHooks.push((d) => { const f = this.festOf(d); return f ? `今天是${f.name}！${f.from}:00 起在${f.place === 'plaza' ? '村口广场' : f.place}。` : ''; });
    void host;
  }
  festOf(d) { return FEST.find((f) => f.season === d.season && f.day === d.dayOfSeason); }
  active() { const g = this.g, f = this.festOf(dateOf(g.day)); return f && g.hours >= f.from && g.hours < f.to ? f : null; }
  key(f) { return `${f.id}:${this.g.day}`; }
  did(f, a) { return this.done[this.key(f)]?.includes(a); }
  mark(f, a) { (this.done[this.key(f)] ??= []).push(a); }

  // ---------- 节日 ----------
  openFestival(f) {
    const g = this.g, choices = [];
    for (const a of f.acts) {
      const label = { 'judge:flower': '🌸 斗花（交一株花草）', 'judge:crop': '🥕 丰收评比（交一样庄稼或灵草）', duel: '⚔ 比武大会（三场，点到为止）', riddle: '🏮 猜灯谜（三题）', feast: '🍲 年夜饭' }[a];
      choices.push({ label: this.did(f, a) ? label + '（已参加）' : label, off: this.did(f, a), fn: () => !this.did(f, a) && this.act(f, a) });
    }
    choices.push({ label: '离开' });
    g.ui.dialog({ name: f.name, sub: '节日', line: f.intro, choices });
  }
  act(f, a) {
    const g = this.g, inv = g.inv;
    if (a === 'riddle') { this.mark(f, a); this.riddle(0, 0, [...RIDDLES].sort(() => Math.random() - 0.5).slice(0, 3)); return; }
    if (a === 'feast') {
      this.mark(f, a); const P = g.player; P.hp = P.maxHp; P.qi = P.maxQi; g.addXP(g.xpNeed() * 0.15, P.pos);
      const gifts = g.village.list.filter((v) => v.hearts >= 2 && !v.robbed).slice(0, 6);
      for (const v of gifts) inv.add(pick(['bun', 'tea', 'wine', 'pill_heal', 'yaodan', 'spring']));
      g.ui.dialog({ name: '除夕', narrate: true, lines: ['全村人围坐在广场上，热气腾腾的年夜饭摆了一桌又一桌。', `${gifts.length ? gifts.map((v) => v.name).join('、') + '都塞给你一份年礼。' : '村长给你夹了一大块肉。'}`], info: '气血灵力回满，修为小涨。' });
      return;
    }
    if (a.startsWith('judge')) {
      const flower = a === 'judge:flower';
      g.ui.openBag(inv, {
        title: flower ? '斗花：选一株花草' : '丰收评比：选一样',
        filter: (it) => (flower ? ['chiyang', 'yuehua', 'ninglu', 'xuanbing'].includes(it.base || it.id) : ['crop', 'herb'].includes(it.cat)),
        gift: (id) => {
          g.ui.closePanel(); inv.take(id); this.mark(f, a);
          const score = item(id).sell, rivals = flower ? [220, 300, 380] : [180, 260, 320];
          const rank = rivals.filter((r) => r > score).length;
          const prize = [[1200, 'tongxin'], [600, 'pill_heal+1'], [300, 'tea'], [100, 'bun']][rank];
          inv.money += prize[0]; inv.add(prize[1]);
          g.ui.dialog({ name: '村长', line: rank === 0 ? `好！${itemName(id)}拔得头筹！` : `${itemName(id)}——第 ${rank + 1} 名，不错不错。`, info: `奖：${prize[0]} 文 · ${itemName(prize[1])}` });
        },
      });
      return;
    }
    if (a === 'duel') this.startDuel(f);
  }
  riddle(i, right, list) {
    const g = this.g, inv = g.inv;
    if (i >= list.length) {
      inv.money += right * 100; if (right === 3) { inv.add('wine'); g.village.byId.chief?.addAff(20); }
      g.ui.dialog({ name: '灯会', narrate: true, line: `猜中 ${right} / 3 个灯谜。`, info: `奖：${right * 100} 文${right === 3 ? ' · 桃花酿（村长很高兴）' : ''}` });
      return;
    }
    const [q, opts] = list[i], ans = opts[0], shown = [...opts].sort(() => Math.random() - 0.5);
    g.ui.dialog({ name: `灯谜 ${i + 1} / 3`, narrate: true, line: q, choices: shown.map((o) => ({ label: o, fn: () => { g.toast(o === ans ? '猜对了！' : `不对，是「${ans}」`, 1.2); this.riddle(i + 1, right + (o === ans), list); } })) });
  }
  // 比武：三场，打到对方倒下；自己气血掉到两成就算输（点到为止，不会真死）
  startDuel(f) {
    const g = this.g, P = g.player, at = f.place === 'plaza' ? { x: 0, z: 4 } : this.valley;
    this.mark(f, 'duel');
    this.duel = { f, round: 0, at, t: 0 };
    for (const e of [...g.enemies.list]) if (!e.boss) g.enemies.remove(e);
    P.pos.set(at.x, 0, at.z + 3);
    this.nextFoe();
  }
  nextFoe() {
    const D = this.duel, g = this.g;
    D.round++;
    const e = g.enemies.spawn('sparring', D.at.x, D.at.z - 3, Math.max(0, Math.floor(g.player.layer / 2) + D.round - 1));
    e.state = 'chase'; e.trial = true; D.foe = e;
    g.toast(`比武第 ${D.round} 场`, 1.4);
  }
  updateDuel(dt) {
    const D = this.duel, g = this.g, P = g.player;
    if (!D) return;
    if (P.hp < P.maxHp * 0.2 || P.dead) { // 点到为止
      g.enemies.remove(D.foe); this.duel = null; P.hp = Math.max(P.hp, P.maxHp * 0.2); P.dead = false;
      g.ui.dialog({ name: D.f.name, line: `第 ${D.round} 场惜败！明年再来。`, info: `赢了 ${D.round - 1} 场：${(D.round - 1) * 150} 文` }); g.inv.money += (D.round - 1) * 150;
      return;
    }
    if (D.foe.alive) return;
    if (D.round < 3) { this.nextFoe(); return; }
    this.duel = null;
    g.inv.money += 800; g.addStones(5, P.pos);
    for (const v of g.village.list) v.addAff(10);
    const crush = this.spouse ? null : g.village.list.filter((v) => v.d.romance).sort((a, b) => b.aff - a.aff)[0];
    if (crush && D.f.id === 'flower') crush.addAff(100);
    g.ui.dialog({ name: D.f.name, line: '三场全胜！今年的魁首是你！', info: `奖：800 文、5 灵石，全村好感 +10${crush && D.f.id === 'flower' ? `；${crush.name}看你的眼神不一样了（好感 +100）` : ''}` });
  }
  // 节日装饰：广场上一圈灯笼
  updateDeco() {
    const g = this.g, f = this.active(), want = f && f.place === 'plaza';
    if (want && !this.deco) {
      this.deco = new THREE.Group();
      const m = glow(f.id === 'newyear' ? '#ff3a2a' : '#ff9a3a', 2.4);
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, l = mesh(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1.25, 1), m, { cast: false }); l.position.set(Math.cos(a) * 8.5, 3 + Math.sin(i * 1.7) * 0.2, Math.sin(a) * 8.5); this.deco.add(l); }
      g.scene.add(this.deco);
    } else if (!want && this.deco) { g.scene.remove(this.deco); this.deco = null; }
    if (this.deco) this.deco.rotation.y += 0.0015;
  }

  // ---------- 道侣 ----------
  // 村民对话里：好感 8 颗心、筑基以后，身上有同心结就能求结道侣
  choices(v) {
    const g = this.g, out = [];
    if (this.spouse || !v.d.romance || v.robbed) return out;
    if (v.hearts >= 8 && levelInfo(g.player.layer).realm >= 1 && g.inv.count('tongxin')) out.push({ label: '💞 送上同心结（求结道侣）', fn: () => this.propose(v) });
    return out;
  }
  propose(v) {
    const g = this.g;
    g.inv.take('tongxin'); this.spouse = v.d.id; v.addAff(200);
    g.fx.burst(v.pos, '#ff8ac8', 60, { speed: 3, up: 6, life: 1.4, grav: -1 });
    g.ui.dialog({ name: v.name, lines: ['……这是，同心结？', '我、我等这一天很久了。', '从今往后，我们一起问道。'], info: `${v.name}成了你的道侣，会住进你家。睡觉时双修，修为多一成。` });
    g.emit?.('spouse', v);
  }
  spouseLine(v) { return v.d.id === this.spouse ? pick(v.d.lines.spouse || ['你回来了。']) : null; }

  // ---------- 结局 ----------
  ending() {
    const g = this.g, P = g.player, S = g.sects;
    if (this.ended) return;
    const karma = P.karma || 0, evil = karma >= 100 || S?.member?.name === '血魔宫';
    const elder = S?.member && S.member.rank >= 3;
    const kind = evil ? 'demon' : elder ? 'master' : 'ascend';
    this.ended = kind;
    const sp = this.spouse && g.village.byId[this.spouse];
    const lines = {
      ascend: ['最后一道雷劫落下，你没有躲。', '雷光散尽的那一刻，天门在云海尽头缓缓打开。', `${sp ? sp.name + '握着你的手，' : ''}你回头望了一眼青竹村的炊烟。`, '——正道飞升。'],
      demon: ['雷劫劈在你身上，却被满身的血煞之气吞了下去。', '你睁开眼，眼底一片赤红。天门没有为你打开——你也不再需要它。', '——入魔。从此世间多了一位魔尊。'],
      master: ['渡劫功成，你没有急着飞升。', `${S?.member?.name}的长老们齐聚山门，把掌门令牌交到了你手里。`, '——你成了一派之主。（彩蛋结局）'],
    }[kind];
    const stats = `历时 ${g.day} 天 · 斩妖 ${this.kills} · 业力 ${karma} · 灵根 ${P.roots.map((r) => r.e).join('')} · ${S?.member ? S.member.name : '散修'}${sp ? ' · 道侣 ' + sp.name : ''}`;
    g.ui.dialog({ name: { ascend: '正道飞升', demon: '入魔', master: '一派之主' }[kind], narrate: true, lines, info: stats, hint: '谢谢游玩《灵田问道》。',
      choices: [{ label: '继续逍遥（留在这个世界）', fn: () => g.toast('你留了下来。灵田还在，故人还在。', 3) }, { label: '再入轮回（NG+：保留灵根，从炼气一层重来）', fn: () => this.newGamePlus() }] });
  }
  newGamePlus() {
    const g = this.g, P = g.player;
    P.layer = 1; P.xp = 0; g.realm.recalc(true);
    g.toast('再入轮回……\n灵根还在，修为从头再来', 4);
    this.ended = null;
  }

  update(dt) { this.updateDuel(dt); this.updateDeco(); }
  save() { return { done: this.done, spouse: this.spouse, kills: this.kills, ended: this.ended }; }
  load(s) { this.done = s.done || {}; this.spouse = s.spouse || null; this.kills = s.kills || 0; this.ended = s.ended || null; }
}
