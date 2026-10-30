// 委托板的进阶委托（GDD 第 7 节任务模板 × 词缀）：护送、守护、寻踪采集、异象争夺、试炼切磋、讨伐·精英，
// 每张随机挂 0–2 个词缀：血月、雷雨、竞争者、背叛、同伴、限时、精英。
// 委托本身存在 quests 里（from: 'board'，def.job = 这里生成的参数），接下就开始；做完当场结算。
// 跑起来的东西（护送的人、阵眼、刷出来的妖兽、跟着的村民）不存档，读档或过夜后这一段从头来。
import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { glow, mesh, lerpAngle } from './util.js';
import { RINGS, dangerFor, sectorAt } from './worldmap.js';
import { SECTOR_MOBS, TYPES } from './enemies.js';
import { MINE, regionName } from './world.js';
import { levelInfo } from './realm.js';
import { near } from './life.js';
import { itemName } from './items.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const pct = (o) => Math.max(0, Math.round(o.hp / o.maxHp * 100)) + '%';
const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const dirOf = (dx, dz) => DIRS[Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8]; // 北 = -z
export const AFFIX = {
  blood: { name: '血月', pay: 1.4, tip: '妖兽气血、伤害 ×1.5，掉落翻倍' },
  storm: { name: '雷雨', pay: 1.2, tip: '天雷乱劈，看地上红圈躲开（妖兽也会挨劈）；火属性妖兽变弱' },
  rival: { name: '竞争者', pay: 1.3, tip: '有散修来抢，得把他打跑' },
  betray: { name: '背叛', pay: 1 }, // 暗词缀：不写在委托上
  ally: { name: '同伴', pay: 1.1, tip: '委托人跟你一起去、帮你打；护着点，倒了要躺三天' },
  timed: { name: '限时', pay: 1.3, tip: '接下后 8 小时内做完' },
  elite: { name: '精英', pay: 1.3, tip: '混着一只精英妖兽' },
};
const ELITE = { split: '分裂', stealth: '隐身', boom: '自爆' };
const KINDS = {
  escort: ['blood', 'storm', 'rival', 'betray', 'betray', 'timed'],
  guard: ['blood', 'storm', 'elite', 'ally'],
  track: ['rival', 'timed', 'storm', 'ally'],
  omen: ['blood', 'storm', 'elite'],
  duel: ['storm', 'timed'],
  hunt: ['blood', 'storm', 'rival', 'ally', 'timed'],
};
const WHO = [{ name: '药童', age: 'child', robe: '#7aa86a' }, { name: '货郎', age: 'adult', robe: '#a8845a' }, { name: '采药老人', age: 'elder', robe: '#8a9a7a' }, { name: '小道童', age: 'child', robe: '#6a8ac8' }];
const GUARD = ['猎户的陷阱营地', '采药人的帐篷', '灵脉阵眼', '山神小庙'];
const LOST = ['走失的樵夫', '采药未归的药农', '迷路的放牛娃'];
const OMEN = { 宝光: { color: '#ffe28a', verb: '✨ 收取宝光', sky: '冒起一道宝光' }, 灵泉: { color: '#7af0ff', verb: '💧 饮下灵泉', sky: '升起白雾，怕是有灵泉涌出' }, 陨石: { color: '#ff8a4a', verb: '☄ 撬下陨铁', sky: '落下一团火光，像是陨石' } };
const FOES = [{ type: 'bandit', name: '擂主', line: '听说村里出了个修士？来，过两招！' }, { type: 'demoncult', name: '通缉魔修', line: '就凭你，也想拿我去领赏？' }, { type: 'bandit', name: '游方剑客', line: '久闻青竹村有高人，在下讨教了。' }];
const RULES = { nohit: '挨打不超过 2 下', kit: '只许用{kit}', nopill: '不许服丹', time: '60 秒内取胜' };
const KIT_ID = ['sword', 'fist', 'talisman'], KIT_NAME = ['剑', '拳', '符'];
const RIVALS = ['散修·赵四', '散修·钱老怪', '散修·孙不二', '散修·周独眼'];
const BOLT = new THREE.CylinderGeometry(0.08, 0.35, 24, 6, 1, true).translate(0, 12, 0);

export class Jobs {
  constructor(g) {
    this.g = g;
    this.run = new Map(); // quest 对象 → 运行状态
    g.life.on((P) => {
      for (const R of this.run.values()) { const d = R.pick ? near(P, R.pick, 2.2) : false; if (d !== false) return { label: R.pick.label, act: R.pick.act, d: d - 1 }; }
      return false;
    });
    g.life.dayHooks.push(() => { for (const R of this.run.values()) this.clear(R); this.run.clear(); }); // 过夜：妖兽都散了，从头来
    g.on('kill', (e) => this.onKill(e));
    g.on('pill', () => { for (const R of [...this.run.values()]) if (R.J.rule === 'nopill' && R.stage === 'fight') this.fail(R, '说好不许服丹的！'); });
  }

  // ---------- 生成（quests.genBoard 调用）----------
  realm() { return Math.min(3, levelInfo(this.g.player.layer).realm); }
  // 野外随便一处：本境界圈里，离村子、地标、矿洞都远一点
  site(minD = 70) {
    const g = this.g, k = this.realm(), lo = Math.max(minD, k ? RINGS[k].from : 0), hi = RINGS[k].to - 25;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(lo, hi), x = Math.sin(a) * d, z = -Math.cos(a) * d;
      if (Math.hypot(x - MINE.x, z - MINE.y) < 45 || g.landmarks?.list.some((L) => Math.hypot(L.x - x, L.z - z) < 45)) continue;
      return { x, z };
    }
    return null;
  }
  gen(kind, who) {
    const g = this.g, ring = this.realm(), poster = who.name, aff = [];
    let pool = [...KINDS[kind]];
    const na = Math.random() < 0.3 ? 0 : Math.random() < 0.7 ? 1 : 2;
    while (aff.length < na && pool.length) { const a = pick(pool); pool = pool.filter((x) => x !== a); aff.push(a); }
    const J = { kind, aff, ring, poster: who.d.id };
    const at = (s) => { J.x = s.x; J.z = s.z; J.lvl = Math.floor(dangerFor(s.x, s.z)); J.place = regionName(s.x, s.z).split(' · ')[0]; };
    const where = (s) => { const d = Math.hypot(s.x, s.z); return `${dirOf(s.x, s.z)}边 ${Math.round(d / 10) * 10} 米外`; };
    let title, desc, s, exp = g.day + 4;
    if (kind === 'escort') {
      const dests = [...(g.hubs?.list || []), ...(g.sects?.list || []).filter((x) => !x.ruined && !x.d?.hidden)]
        .filter((L) => { const d = Math.hypot(L.x, L.z); return d > 100 && d < RINGS[ring].to + 20; });
      const L = dests.length && Math.random() < 0.8 ? pick(dests) : null;
      s = L ? { x: L.x, z: L.z } : this.site(110); if (!s) return null;
      at(s); J.name = L ? L.name.replace(/\s.*$/, '') : '猎户营地'; J.r = L ? 13 : 8; J.who = Math.floor(Math.random() * WHO.length);
      J.lvl = Math.floor(dangerFor(s.x * 0.6, s.z * 0.6)); // 一路上的平均
      const w = WHO[J.who].name;
      title = `护送 · ${w}去${J.name}`; desc = `${poster}：${w}要去${J.name}（${where(s)}）办事，路上不太平，劳烦道友护送一程。`;
    } else if (kind === 'guard') {
      if (!(s = this.site(80))) return null;
      at(s); J.name = pick(GUARD);
      title = `守护 · ${J.name}`; desc = `${poster}：${J.place}的${J.name}（${where(s)}）被妖兽盯上了，帮忙守住三波。`;
    } else if (kind === 'track') {
      if (!(s = this.site(80))) return null;
      at(s);
      const a = Math.random() * Math.PI * 2, r = rnd(8, 22); J.tx = s.x + Math.sin(a) * r; J.tz = s.z + Math.cos(a) * r;
      if (Math.random() < 0.3) { J.thing = pick(LOST); J.cond = null; }
      else {
        J.cond = pick([null, null, 'night', 'rain']);
        J.herb = J.cond === 'night' ? 'yuehua@100' : J.cond === 'rain' ? 'renshen@100' : pick(['lingcao@100', 'chiyang@10', 'ninglu@10']);
        J.thing = itemName(J.herb);
      }
      title = `寻踪 · ${J.thing}`;
      desc = J.herb ? `${poster}：听说${J.place}一带（${where(s)}）长着${J.thing}，${J.cond === 'night' ? '只在夜里显形，' : J.cond === 'rain' ? '要下雨天才冒头，' : ''}得用神识（V）仔细找。`
        : `${poster}：${J.thing}进了${J.place}（${where(s)}），到现在还没回来！用神识（V）找找吧。`;
    } else if (kind === 'omen') {
      if (!(s = this.site(90))) return null;
      at(s); J.type = pick(Object.keys(OMEN)); exp = g.day + 1;
      title = `异象 · ${J.place}${J.type}`; desc = `${poster}：${where(s)}${OMEN[J.type].sky}！去晚了就被散修抢光了（明天就散）。`;
    } else if (kind === 'duel') {
      if (!(s = this.site(70))) return null;
      at(s); J.foe = Math.floor(Math.random() * FOES.length); J.rule = pick(Object.keys(RULES));
      if (J.rule === 'kit') J.kit = Math.floor(Math.random() * KIT_ID.length);
      const F = FOES[J.foe];
      title = `切磋 · ${F.name}（${this.ruleText(J)}）`; desc = `${poster}：${J.place}（${where(s)}）有个${F.name}放话要会会村里的修士。规矩：${this.ruleText(J)}。`;
    } else if (kind === 'hunt') {
      if (!(s = this.site(80))) return null;
      at(s); J.mob = pick(SECTOR_MOBS[sectorAt(s.x, s.z).id]); J.n = 3 + ring; J.ab = pick(Object.keys(ELITE));
      const nm = TYPES[J.mob].name;
      title = `讨伐 · 精英${nm}（${ELITE[J.ab]}）`; desc = `${poster}：${J.place}（${where(s)}）有一窝${nm}，领头的那只会${ELITE[J.ab]}，小心。`;
    }
    const tags = aff.filter((a) => AFFIX[a].tip);
    if (tags.length) { title += `【${tags.map((a) => AFFIX[a].name).join('·')}】`; desc += '<br>' + tags.map((a) => `【${AFFIX[a].name}】${AFFIX[a].tip}`).join(' '); }
    const pay = aff.reduce((k, a) => k * AFFIX[a].pay, 1);
    return {
      def: {
        title, desc, giver: 'board', job: J,
        goals: [{ type: 'job', n: 1, text: title.replace(/【.*$/, ''), x: J.x, z: J.z }],
        reward: { money: Math.round(380 * (1 + J.lvl * 0.12) * pay / 10) * 10, stones: 2 + Math.floor(J.lvl / 2) + (kind === 'duel' ? 2 : 0), aff: { [who.d.id]: 15 } },
      },
      exp,
    };
  }
  ruleText(J) { return RULES[J.rule].replace('{kit}', KIT_NAME[J.kit]); }

  // ---------- 运行 ----------
  start(q) {
    const g = this.g, J = q.def.job;
    if (J.aff.includes('timed')) J.deadline = g.day * 24 + g.hours + 8;
    this.R(q);
  }
  R(q) {
    let R = this.run.get(q);
    if (!R) { R = { q, J: q.def.job, stage: 'go', mobs: [], objs: [], ui: 0 }; this.run.set(q, R); this.setup(R); }
    return R;
  }
  add(o, x, z) { o.position.set(x, 0, z); this.g.scene.add(o); return o; }
  setup(R) {
    const g = this.g, J = R.J;
    if (J.kind === 'escort') {
      const w = WHO[J.who], b = g.world.board;
      const c = createChibi({ skin: '#eac3a0', hair: w.age === 'elder' ? '#e8e8ec' : '#3a2a24', hairStyle: J.who % 4, robe: w.robe, robe2: shade(w.robe, 0.65), belt: shade(w.robe, 0.4), age: w.age });
      R.objs.push(this.add(c.root, b.x + 1.6, b.z + 1.4));
      R.npc = { c, pos: c.root.position, yaw: 0, hp: 100 + J.lvl * 25, maxHp: 100 + J.lvl * 25, name: w.name, numT: 0 };
      R.stage = 'meet'; R.amb = 0;
    } else if (J.kind === 'guard') {
      const m = new THREE.Group();
      m.add(mesh(new THREE.OctahedronGeometry(0.55).scale(1, 1.7, 1).translate(0, 1.5, 0), glow('#9ef0ff', 2.4), { cast: false }));
      m.add(mesh(new THREE.RingGeometry(1.0, 1.25, 28).rotateX(-Math.PI / 2).translate(0, 0.05, 0), glow('#9ef0ff', 1.6), { cast: false }));
      R.objs.push(this.add(m, J.x, J.z));
      R.node = { x: J.x, z: J.z, m, hp: 200 + J.lvl * 30, maxHp: 200 + J.lvl * 30, numT: 0 };
    } else if (J.kind === 'omen') {
      const col = OMEN[J.type].color, m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 60, 12, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({
        color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, toneMapped: false,
      })));
      m.add(mesh(new THREE.IcosahedronGeometry(0.6, 1).translate(0, 0.7, 0), glow(col, 3), { cast: false }));
      R.objs.push(this.add(m, J.x, J.z)); R.beam = m;
    }
    if (J.aff.includes('ally')) this.allyUp(R);
  }
  update(dt) {
    const Q = this.g.quests;
    for (const [q, R] of this.run) if (!Q.active.includes(q)) { this.clear(R); this.run.delete(q); } // 读档 / 过期
    for (const q of [...Q.active]) if (q.def.job && !Q.complete(q)) this.tick(this.R(q), dt);
    this.updateElites(dt);
  }
  tick(R, dt) {
    const g = this.g, P = g.player, J = R.J;
    if (J.deadline && g.day * 24 + g.hours > J.deadline) return this.fail(R, '时限已过');
    if (P.dead && R.engaged) return this.fail(R, '你倒下了');
    this[J.kind](R, dt, P);
    if (!this.run.has(R.q)) return; // 这一帧做完 / 失败了
    if (R.rival?.alive && (R.raceT -= dt) <= 0) return this.fail(R, `${R.rival.title}抢先一步得手了`);
    if (R.ally) this.allyTick(R, dt, P);
    if (J.aff.includes('storm')) this.storm(R, dt, P);
    if ((R.ui -= dt) <= 0) { R.ui = 0.5; this.text(R, P); }
  }
  alive(R) { return R.mobs.filter((e) => e.alive); }
  // 委托刷出来的妖兽：词缀在这里生效
  mob(R, type, x, z, lvl, o = {}) {
    const J = R.J, e = this.g.enemies.spawn(type, x, z, Math.max(0, lvl));
    if (J.aff.includes('blood') && !e.blood) { e.hp = e.maxHp *= 1.5; e.dmg *= 1.5; e.blood = true; }
    if (J.aff.includes('storm') && e.elem === '火') e.hp = e.maxHp *= 0.75; // 雷雨浇火
    e.state = o.idle ? 'idle' : 'chase'; e.jobR = R;
    if (o.raid) e.raid = o.raid;
    if (o.title) e.title = o.title;
    R.mobs.push(e);
    return e;
  }
  // 竞争者：比普通妖兽强得多的散修，往目标那边去；限时内不打跑就被抢走
  rival(R, x, z, target) {
    const e = this.mob(R, 'bandit', x, z, R.J.lvl + 3, { raid: target, title: pick(RIVALS) });
    e.hp = e.maxHp *= 2; R.rival = e; R.raceT = R.J.kind === 'escort' ? Infinity : 120;
    this.g.toast(`${e.title}也盯上了这里：「这东西归我了！」`, 2.4);
    return e;
  }
  elite(e, ab) {
    e.hp = e.maxHp *= 1.8; e.dmg *= 1.2; e.elite = ab; e.stT = 3; e.r *= 1.15;
    e.root.scale.multiplyScalar(1.25);
    e.title = `精英·${e.T.name}（${ELITE[ab]}）`;
    return e;
  }

  // ---------- 各模板 ----------
  escort(R, dt, P) {
    const g = this.g, J = R.J, n = R.npc, dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, d = Math.hypot(dx, dz);
    let move = 0;
    if (R.stage === 'meet') {
      if (d < 6) { R.stage = 'go'; R.engaged = true; R.total = Math.hypot(J.x - n.pos.x, J.z - n.pos.z); g.toast(`${n.name}：「有劳道友了，咱们走吧！」`, 2); }
    } else if (R.stage === 'go') {
      // 跟在你身后；你跑太远就停下来喊
      if (d > 26) { if ((R.waitT = (R.waitT || 0) - dt) <= 0) { R.waitT = 6; g.fx.num(n.pos, '等等我！', 'hurt'); } }
      else if (d > 2.4) { const sp = Math.min(7.5, 3 + d * 0.6); n.pos.x += dx / d * sp * dt; n.pos.z += dz / d * sp * dt; move = sp / 6; n.yaw = lerpAngle(n.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt)); }
      g.world.resolve(n.pos, 0.35);
      let hurt = 0;
      for (const e of g.enemies.list) if (e.alive && !e.hidden && Math.hypot(e.pos.x - n.pos.x, e.pos.z - n.pos.z) < e.r + 0.7) hurt += e.dmg * 0.5 * dt;
      if (hurt) { n.hp -= hurt; n.c.flash = 0.1; if ((n.numT -= dt) <= 0) { n.numT = 0.8; g.fx.num(n.pos, `${n.name}受伤`, 'hurt'); } }
      if (n.hp <= 0) return this.fail(R, `${n.name}被害了`);
      const left = Math.hypot(J.x - n.pos.x, J.z - n.pos.z);
      if (R.amb < 2 && 1 - left / R.total > (R.amb ? 0.66 : 0.33)) this.ambush(R);
      if (left < J.r && !this.alive(R).length) {
        if (J.aff.includes('betray')) this.betray(R);
        else return this.done(R, () => g.addStones(1 + Math.floor(J.lvl / 2), P.pos));
      }
    } else if (R.stage === 'betray' && !this.alive(R).length) return this.done(R, () => g.addStones(4 + J.lvl, P.pos));
    if (n.c.root.parent) { n.c.root.rotation.y = n.yaw; animChibi(n.c, dt, { move, attack: -1, cast: 0, talk: R.stage === 'meet' }); }
  }
  ambush(R) {
    const g = this.g, J = R.J, n = R.npc, a = Math.atan2(J.x - n.pos.x, J.z - n.pos.z);
    const cx = n.pos.x + Math.sin(a) * 14, cz = n.pos.z + Math.cos(a) * 14, bandits = ++R.amb === 2;
    const types = bandits ? ['bandit'] : SECTOR_MOBS[sectorAt(cx, cz).id], k = bandits ? 1 + J.ring : 3 + J.ring;
    for (let i = 0; i < k; i++) { const b = i / k * Math.PI * 2; this.mob(R, pick(types), cx + Math.cos(b) * 3, cz + Math.sin(b) * 3, J.lvl, { raid: n.pos, title: bandits ? '劫道的' : '' }); }
    g.toast(bandits ? '劫道的跳出来了：「留下买路钱！」' : `路边窜出一群妖兽——护住${n.name}！`, 2.2);
    if (R.amb === 1 && J.aff.includes('rival')) this.rival(R, cx, cz + 4, n.pos);
  }
  betray(R) {
    const g = this.g, n = R.npc, J = R.J;
    R.stage = 'betray';
    g.scene.remove(n.c.root);
    g.fx.burst(n.pos, '#ff3a3a', 40, { speed: 5, up: 4, y: 1 });
    for (let i = 0; i < 3; i++) {
      const e = this.mob(R, 'demoncult', n.pos.x + (i - 1) * 1.6, n.pos.z + 1, J.lvl + 2, { title: i === 1 ? `魔修·假${n.name}` : '魔修' });
      if (i === 1) e.hp = e.maxHp *= 1.8;
    }
    g.ui.dialog({ name: n.name, sub: '露出了真面目', line: '嘿嘿……多谢道友一路护送。这条命，就留在这儿吧！', info: '背叛！委托人是魔修假扮的。打赢了照样有赏，还多给灵石。' });
  }
  guard(R, dt, P) {
    const g = this.g, J = R.J, N = R.node, d = Math.hypot(P.pos.x - J.x, P.pos.z - J.z);
    N.m.rotation.y += dt;
    if (R.stage === 'go') { if (d < 14) { R.stage = 'fight'; R.engaged = true; R.wave = 0; R.next = 1.5; g.toast(`守住${J.name}！一共三波`, 2.2); } return; }
    if (d > 35) { if ((R.away = (R.away || 0) + dt) > 8) return this.fail(R, `你离开太久，${J.name}被妖兽毁了`); } else R.away = 0;
    let hurt = 0;
    for (const e of this.alive(R)) if (!e.hidden && Math.hypot(e.pos.x - J.x, e.pos.z - J.z) < e.r + 1.2) hurt += e.dmg * 0.6 * dt;
    if (hurt) { N.hp -= hurt; if ((N.numT -= dt) <= 0) { N.numT = 0.8; g.fx.num({ x: J.x, z: J.z }, `阵眼 ${pct(N)}`, 'hurt'); } }
    if (N.hp <= 0) return this.fail(R, `${J.name}被毁了`);
    if (!this.alive(R).length) {
      if (R.wave >= 3) return this.done(R);
      if ((R.next -= dt) <= 0) { this.wave(R); R.next = 3; }
    }
  }
  wave(R) {
    const g = this.g, J = R.J, types = SECTOR_MOBS[sectorAt(J.x, J.z).id], n = 2 + ++R.wave + J.ring, a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) { const a = a0 + (i % 2 ? Math.PI : 0) + rnd(-0.6, 0.6), r = rnd(18, 24); this.mob(R, pick(types), J.x + Math.sin(a) * r, J.z + Math.cos(a) * r, J.lvl, { raid: R.node }); }
    if (R.wave === 3 && J.aff.includes('elite')) this.elite(this.mob(R, pick(types), J.x + Math.sin(a0) * 22, J.z + Math.cos(a0) * 22, J.lvl, { raid: R.node }), pick(Object.keys(ELITE)));
    g.toast(`第 ${R.wave} / 3 波`, 1.6);
  }
  track(R, dt, P) {
    const g = this.g, J = R.J;
    if (R.stage === 'go') {
      if (Math.hypot(P.pos.x - J.x, P.pos.z - J.z) < 40) {
        R.stage = 'search'; R.engaged = true; R.scan0 = g.realm.scanT;
        const types = SECTOR_MOBS[sectorAt(J.x, J.z).id];
        for (let i = 0; i < 1 + J.ring; i++) this.mob(R, pick(types), J.tx + rnd(-5, 5), J.tz + rnd(-5, 5), J.lvl, { idle: true });
        if (J.aff.includes('rival')) this.rival(R, J.x + rnd(-8, 8), J.z + rnd(-8, 8), { x: J.tx, z: J.tz });
        g.toast(`到了。按 V 放出神识，搜寻${J.thing}`, 2.5);
      }
      return;
    }
    if (R.stage !== 'search') return;
    const s = g.realm.scanT, fresh = s > (R.scan0 ?? 0) + 1; R.scan0 = s;
    if (!fresh) return;
    const d = Math.hypot(P.pos.x - J.tx, P.pos.z - J.tz);
    if (J.cond && !(J.cond === 'night' ? g.nightK > 0.5 : g.weather.raining)) { g.toast(`神识里什么也没有……${J.cond === 'night' ? '这东西只在夜里显形' : '这东西要下雨才冒头'}`, 2.5); return; }
    if (d > 24) { g.toast(`神识隐约感到：在${dirOf(J.tx - P.pos.x, J.tz - P.pos.z)}边，约 ${Math.round(d / 5) * 5} 米`, 2.5); return; }
    this.reveal(R);
  }
  reveal(R) {
    const g = this.g, J = R.J;
    R.stage = 'found';
    if (J.herb) {
      const m = new THREE.Group();
      m.add(mesh(new THREE.ConeGeometry(0.22, 0.7, 6).translate(0, 0.35, 0), glow('#9effc0', 2.6), { cast: false }));
      m.add(mesh(new THREE.RingGeometry(0.5, 0.65, 20).rotateX(-Math.PI / 2).translate(0, 0.05, 0), glow('#9effc0', 1.6), { cast: false }));
      R.objs.push(this.add(m, J.tx, J.tz));
    } else {
      const c = createChibi({ skin: '#eac3a0', hair: '#3a2a24', hairStyle: 1, robe: '#8a7a5a', robe2: '#5a4e3a', belt: '#3a3024', age: J.thing.includes('娃') ? 'child' : 'adult' });
      R.objs.push(this.add(c.root, J.tx, J.tz)); c.root.rotation.z = 1.3; // 倒在地上
    }
    g.fx.shockRing(J.tx, J.tz, 3, '#9effc0', 0.8); g.fx.burst({ x: J.tx, z: J.tz }, '#9effc0', 30, { speed: 3, up: 4, y: 0.4 });
    g.toast(`找到了！${J.thing}就在${dirOf(J.tx - g.player.pos.x, J.tz - g.player.pos.z)}边`, 2.5);
    R.pick = { x: J.tx, z: J.tz, label: J.herb ? `🌿 采下${J.thing}` : `🤝 扶起${J.thing}`, act: () => this.done(R, () => { if (J.herb) g.addItem(J.herb, 1, g.player.pos); }) };
  }
  omen(R, dt, P) {
    const g = this.g, J = R.J;
    R.beam.children[1].position.y = Math.sin(g.time * 2.5) * 0.15; R.beam.rotation.y += dt;
    if (R.stage === 'go') {
      if (Math.hypot(P.pos.x - J.x, P.pos.z - J.z) < 18) {
        R.stage = 'fight'; R.engaged = true;
        const n = 2 + J.ring;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.mob(R, 'bandit', J.x + Math.sin(a) * 5, J.z + Math.cos(a) * 5, J.lvl, { raid: J, title: '散修' }); }
        if (J.aff.includes('elite')) this.elite(this.mob(R, pick(SECTOR_MOBS[sectorAt(J.x, J.z).id]), J.x, J.z + 4, J.lvl, { raid: J }), pick(Object.keys(ELITE)));
        g.toast(`几个散修已经围在${J.type}边上了：「先到先得！」`, 2.5);
      }
      return;
    }
    if (R.stage === 'fight' && !this.alive(R).length) {
      R.stage = 'loot';
      R.pick = { x: J.x, z: J.z, label: OMEN[J.type].verb, act: () => this.done(R, () => this.omenLoot(R)) };
    }
  }
  omenLoot(R) {
    const g = this.g, P = g.player, J = R.J;
    if (J.type === '宝光') { if (Math.random() < 0.5) g.addItem(`tc_${pick(['金', '木', '水', '火', '土'])}_1`, 1, P.pos); g.addStones(3 + J.lvl, { x: P.pos.x, z: P.pos.z + 0.6 }); }
    else if (J.type === '灵泉') { g.addItem('spring', 3, P.pos); P.hp = P.maxHp; P.qi = P.maxQi; g.fx.num({ x: P.pos.x, z: P.pos.z + 0.6 }, '伤势尽复', 'heal'); }
    else { g.addItem('meteor_iron', 1, P.pos); g.addItem('iron', 3, { x: P.pos.x, z: P.pos.z + 0.6 }); }
  }
  duel(R, dt, P) {
    const g = this.g, J = R.J, d = Math.hypot(P.pos.x - J.x, P.pos.z - J.z);
    if (R.stage === 'go') {
      if (d < 12) {
        const F = FOES[J.foe];
        R.stage = 'fight'; R.engaged = true; R.hits = 0; R.hp0 = P.hp; R.hitCd = 0; R.clock = 60;
        R.foe = this.mob(R, F.type, J.x, J.z, J.lvl + 2, { title: F.name }); R.foe.hp = R.foe.maxHp *= 2.2;
        if (J.rule === 'kit') g.combat.setKit(J.kit);
        g.ui.dialog({ name: F.name, sub: '切磋', line: F.line, info: `规矩：${this.ruleText(J)}`, hint: '跑出 30 米算认输' });
      }
      return;
    }
    if (d > 30) return this.fail(R, '你跑出了场地，算认输');
    if (J.rule === 'nohit') {
      R.hitCd -= dt;
      if (P.hp < R.hp0 - 0.5 && R.hitCd <= 0) { R.hitCd = 0.5; g.fx.num({ x: P.pos.x, z: P.pos.z - 0.6 }, `挨打 ${++R.hits}/2`, 'hurt'); if (R.hits > 2) return this.fail(R, '挨打超过 2 下'); }
      R.hp0 = P.hp;
    }
    if (J.rule === 'kit' && g.combat.kit.id !== KIT_ID[J.kit]) return this.fail(R, `说好只许用${KIT_NAME[J.kit]}的`);
    if (J.rule === 'time' && (R.clock -= dt) <= 0) return this.fail(R, '60 秒没能取胜');
    if (!R.foe.alive) return this.done(R, () => g.addStones(2 + J.lvl, P.pos));
  }
  hunt(R, dt, P) {
    const g = this.g, J = R.J, d = Math.hypot(P.pos.x - J.x, P.pos.z - J.z);
    if (R.stage === 'go') {
      if (d < 45) {
        R.stage = 'fight'; R.engaged = true;
        for (let i = 0; i < J.n - 1; i++) { const a = Math.random() * Math.PI * 2, r = rnd(2, 8); this.mob(R, J.mob, J.x + Math.sin(a) * r, J.z + Math.cos(a) * r, J.lvl, { idle: true }); }
        this.elite(this.mob(R, J.mob, J.x, J.z, J.lvl + 1, { idle: true }), J.ab);
        if (J.aff.includes('rival')) this.rival(R, J.x + rnd(-10, 10), J.z + rnd(-10, 10), J);
        g.toast(`前面就是${TYPES[J.mob].name}的窝，领头的那只会${ELITE[J.ab]}`, 2.5);
      }
      return;
    }
    if (d > 75) { for (const e of this.alive(R)) g.enemies.remove(e); R.mobs = []; R.rival = null; R.stage = 'go'; R.engaged = false; return; } // 走远了：窝里重新聚起来
    if (!this.alive(R).length) return this.done(R);
  }

  // ---------- 词缀 ----------
  // 雷雨：只在委托现场（护送路上）打雷
  storm(R, dt, P) {
    const g = this.g, W = g.weather, J = R.J;
    const hot = J.kind === 'escort' ? R.stage !== 'meet' : Math.hypot(P.pos.x - J.x, P.pos.z - J.z) < 60;
    if (hot !== !!R.storming) {
      R.storming = hot;
      if (hot) { R.rain0 = W.raining; g.toast('雷雨压顶——看地上的红圈，躲开天雷！', 2.5); } else W.raining = R.rain0 && W.dayRain;
    }
    if (!hot) return;
    W.raining = true;
    if ((R.boltT = (R.boltT ?? 2) - dt) > 0) return;
    R.boltT = rnd(2.2, 4);
    const a = Math.random() * Math.PI * 2, r = Math.random() < 0.35 ? 0 : rnd(3, 10), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    g.fx.circle(x, z, 2.4, 1, () => this.bolt(x, z, J.lvl));
  }
  bolt(x, z, lvl) {
    const g = this.g, P = g.player, fx = g.fx, m = mesh(BOLT, glow('#e8f6ff', 6), { cast: false });
    m.position.set(x, 0, z); g.scene.add(m); g.after(0.12, () => g.scene.remove(m));
    fx.shockRing(x, z, 2.8, '#bfe8ff'); fx.burst({ x, z }, '#dff4ff', 26, { speed: 6, up: 5, life: 0.5, y: 0.3 });
    g.shake(0.4); g.sfx?.impact?.({ heavy: 1 });
    for (const e of [...g.enemies.list]) if (e.alive && !e.boss && Math.hypot(e.pos.x - x, e.pos.z - z) < 2.4 + e.r) g.enemies.damage(e, e.maxHp * 0.35, x, z, 4);
    if (Math.hypot(P.pos.x - x, P.pos.z - z) < 2.4 + P.r) P.hurt(14 + lvl * 3, x, z, 8);
  }
  // 同伴：委托人（小孩、高人除外）或随便一个村民跟着你，自己找妖兽打
  allyUp(R) {
    const g = this.g, V = g.village, P = g.player;
    const ok = (v) => v && !v.away && !v.injured && !v.robbed && !v.job && v.d.age !== 'child' && !['mentor', 'wanderer'].includes(v.d.id);
    const v = ok(V.byId[R.J.poster]) ? V.byId[R.J.poster] : pick(V.list.filter(ok));
    if (!v) return;
    v.job = { anim: { move: 0, attack: -1, cast: 0 } }; v.path = []; v.talking = 0;
    v.pos.set(P.pos.x + 1.5, 0, P.pos.z + 1.5); g.fx.burst(v.pos, '#ffffff', 12, { speed: 2, up: 2 });
    const hp = 80 + R.J.lvl * 20;
    R.ally = { v, hp, maxHp: hp, cd: 0, atk: 0 };
    g.toast(`${v.name}：「我跟你一起去！」`, 2);
  }
  allyTick(R, dt, P) {
    const g = this.g, A = R.ally, v = A.v;
    A.cd -= dt; A.atk -= dt;
    let tgt = null, td = 9;
    for (const e of g.enemies.list) { if (!e.alive || e.hidden || e.boss) continue; const d = Math.hypot(e.pos.x - v.pos.x, e.pos.z - v.pos.z); if (d < td) { td = d; tgt = e; } }
    const tx = tgt ? tgt.pos.x : P.pos.x, tz = tgt ? tgt.pos.z : P.pos.z, stop = tgt ? tgt.r + 0.9 : 2.5;
    const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
    let move = 0;
    if (Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z) > 40) v.pos.set(P.pos.x + 1.5, 0, P.pos.z + 1.5); // 你飞走了就直接追上来
    else if (d > stop) { const sp = Math.min(8, 2.5 + d * 0.8); v.pos.x += dx / d * sp * dt; v.pos.z += dz / d * sp * dt; move = sp / 6; }
    if (d > 0.1) v.yaw = lerpAngle(v.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
    g.world.resolve(v.pos, v.r);
    if (tgt && td < tgt.r + 1.4 && A.cd <= 0) { A.cd = 1.2; A.atk = 0.35; g.enemies.damage(tgt, 12 + R.J.lvl * 4, v.pos.x, v.pos.z, 5); }
    for (const e of g.enemies.list) if (e.alive && !e.hidden && Math.hypot(e.pos.x - v.pos.x, e.pos.z - v.pos.z) < e.r + 0.8) A.hp -= e.dmg * 0.4 * dt;
    if (A.hp <= 0) { v.injured = g.day + 3; this.release(R); g.toast(`${v.name}受了重伤，被路过的猎户背回了村里（卧床 3 天）`, 3); return; }
    v.job.anim = { move, attack: A.atk > 0 ? 1 - A.atk / 0.35 : -1, cast: 0 };
  }
  release(R) {
    const A = R.ally; if (!A) return;
    const v = A.v, p = v.spot('home');
    v.job = null; v.place = null; v.path = []; v.pos.set(p.x, 0, p.z);
    R.ally = null;
  }
  // 精英：分裂（死了裂成两只小的）、隐身（隔一会儿消失 2 秒，打不到）、自爆（残血定住发光，红圈里炸开）
  updateElites(dt) {
    const g = this.g, P = g.player;
    for (const e of g.enemies.list) {
      if (!e.elite || !e.alive) continue;
      if (e.elite === 'stealth') {
        if ((e.stT -= dt) <= 0) { e.hidden = !e.hidden; e.root.visible = !e.hidden; e.stT = e.hidden ? 2 : rnd(3.5, 5); g.fx.burst(e.pos, '#c8b8ff', 18, { speed: 3, up: 2, y: 1 }); }
        if (e.hidden && Math.random() < 0.3) g.fx.mote(e.pos.x + rnd(-0.5, 0.5), rnd(0.3, 1.5), e.pos.z + rnd(-0.5, 0.5), '#c8b8ff', { life: 0.5, size: 0.8, vy: 0.5, bright: 1.5 });
      } else if (e.elite === 'boom' && !e.booming && e.hp < e.maxHp * 0.35) {
        e.booming = true; e.rootT = 1.5; e.flash = 1.5;
        g.fx.num(e.pos, '要自爆了！', 'crit');
        const x = e.pos.x, z = e.pos.z;
        g.fx.circle(x, z, 3.6, 1.4, () => {
          if (!e.alive) return;
          g.fx.shockRing(x, z, 4.2, '#ff7a3a'); g.fx.burst(e.pos, '#ffb070', 60, { speed: 9, up: 5, life: 0.7, y: 0.8 }); g.shake(0.8);
          if (Math.hypot(P.pos.x - x, P.pos.z - z) < 3.6 + P.r) P.hurt(e.dmg * 2.2, x, z, 14);
          g.enemies.kill(e);
        });
      }
    }
  }
  onKill(e) {
    if (e.elite !== 'split' || e.child) return;
    const g = this.g, R = e.jobR && this.run.has(e.jobR.q) ? e.jobR : null;
    for (const s of [-1, 1]) {
      const x = e.pos.x + s * 1.2, z = e.pos.z, c = R ? this.mob(R, e.type, x, z, e.lvl, { raid: e.raid }) : g.enemies.spawn(e.type, x, z, e.lvl);
      c.hp = c.maxHp = e.maxHp * 0.35; c.child = true; c.state = 'chase'; c.title = `${e.T.name}（分身）`;
      c.root.scale.multiplyScalar(0.85);
    }
    g.fx.num(e.pos, '分裂！', 'crit');
  }

  // ---------- 结算 ----------
  done(R, extra) {
    const g = this.g;
    if (R.rival?.alive) { g.toast(`${R.rival.title}还在边上虎视眈眈，先把他打跑`, 2); return; }
    R.q.prog[0] = 1;
    extra?.();
    if (R.ally) R.ally.v.addAff(25);
    this.clear(R, true); this.run.delete(R.q);
    g.quests.finish(R.q);
  }
  fail(R, why) {
    const g = this.g, Q = g.quests, i = Q.active.indexOf(R.q);
    if (i >= 0) Q.active.splice(i, 1);
    this.clear(R); this.run.delete(R.q); Q.dirty = true;
    g.toast(`委托失败：${R.q.def.title.replace(/【.*$/, '')}\n${why}`, 4);
  }
  // keep = 做完了：剩下的妖兽留在野外当普通妖兽
  clear(R, keep = false) {
    const g = this.g;
    for (const e of R.mobs) if (e.alive) { if (keep) { e.raid = null; e.jobR = null; } else g.enemies.remove(e); }
    for (const o of R.objs) g.scene.remove(o);
    R.mobs = []; R.objs = []; R.pick = null;
    this.release(R);
    if (R.storming) { g.weather.raining = R.rain0 && g.weather.dayRain; R.storming = false; }
  }
  // 追踪栏文字和 📍 位置
  text(R, P) {
    const g = this.g, J = R.J, go = R.q.def.goals[0], n = R.npc;
    const far = (x, z) => { const d = Math.hypot(x - P.pos.x, z - P.pos.z); return d > 15 ? `（${dirOf(x - P.pos.x, z - P.pos.z)} ${Math.round(d)} 米）` : ''; };
    let t = '', x = J.x, z = J.z;
    if (J.kind === 'escort') {
      if (R.stage === 'meet') { t = `回委托板接上${n.name}`; x = n.pos.x; z = n.pos.z; }
      else if (R.stage === 'go') t = `护送${n.name}到${J.name}${far(J.x, J.z)} · ${n.name} ${pct(n)}`;
      else t = `打退假扮${n.name}的魔修（剩 ${this.alive(R).length}）`;
    } else if (J.kind === 'guard') t = R.stage === 'go' ? `前往${J.name}${far(x, z)}` : `守住${J.name}：第 ${R.wave}/3 波 · 阵眼 ${pct(R.node)}`;
    else if (J.kind === 'track') {
      if (R.stage === 'go') t = `去${J.place}一带找${J.thing}${far(x, z)}`;
      else if (R.stage === 'search') t = `按 V 用神识搜寻${J.thing}${J.cond === 'night' ? '（夜里才显形）' : J.cond === 'rain' ? '（下雨才冒头）' : ''}`;
      else { t = `${J.herb ? '采下' : '扶起'}${J.thing}${far(J.tx, J.tz)}`; x = J.tx; z = J.tz; }
    } else if (J.kind === 'omen') t = R.stage === 'go' ? `赶去${J.type}${far(x, z)}` : R.stage === 'fight' ? `打跑抢${J.type}的散修（剩 ${this.alive(R).length}）` : OMEN[J.type].verb.slice(2);
    else if (J.kind === 'duel') t = R.stage === 'go' ? `去${J.place}找${FOES[J.foe].name}${far(x, z)}` : `切磋：${this.ruleText(J)}${J.rule === 'time' ? ` · ${Math.ceil(R.clock)} 秒` : J.rule === 'nohit' ? ` · 挨打 ${R.hits}/2` : ''}`;
    else if (J.kind === 'hunt') t = R.stage === 'go' ? `去${J.place}讨伐${TYPES[J.mob].name}${far(x, z)}` : `讨伐${TYPES[J.mob].name}（剩 ${this.alive(R).length}）`;
    if (R.ally) t += ` · ${R.ally.v.name} ${pct(R.ally)}`;
    if (R.rival?.alive && R.raceT < 1e9) t += ` · 散修抢夺 ${Math.ceil(R.raceT)} 秒`;
    if (J.deadline) t += ` · 剩 ${Math.max(0, J.deadline - (g.day * 24 + g.hours)).toFixed(1)} 小时`;
    if (t !== go.text || x !== go.x || z !== go.z) { go.text = t; go.x = x; go.z = z; g.quests.dirty = true; }
  }
}
