// 宗门（GDD 第 10 节，数据在 data/sects.json）。
// - 同一时间只属于一个门派；小宗炼气就能拜入，大宗要到所在圈的境界。入门要过试炼（和守山弟子比一场）。
// - 外门 → 内门 → 真传 → 长老：每升一级要境界 + 贡献点，再过一场晋升试炼。
// - 贡献点：宗门任务（每周一刷新）、每周日宗门大比。贡献点换功法（被动加成，阵法阁有灵田阵法）。
// - 出师（内门以上）保留学会的功法，可以转投；外门就走算叛出，原门派从此不认你。
// - 别派只外传外门那两门「小技能」：好感 60 执事肯指点一门，做满三件委托受封客卿两门都教；
//   也能偷师（观摩练武场、夜里潜进藏经阁），被发现掉好感、被那一派的弟子追杀三天。
// 功法效果汇总在 P.mods，战斗 / 境界 / 灵田 / 炼丹各自读。
import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { near } from './life.js';
import { btn, el } from './ui.js';
import { dateOf } from './calendar.js';
import { dangerFor } from './worldmap.js';
import { levelInfo, REALMS } from './realm.js';
import { TYPES, SECTOR_MOBS } from './enemies.js';
import { sectorAt } from './worldmap.js';
import { itemName } from './items.js';
import { VILLAGE_R } from './world.js';
import { toon, glow, mesh, at, addOutline, outlineMat, canvasTex } from './util.js';
import { Site, siteOf } from './sectsites.js';

export const RANK = ['外门', '内门', '真传', '长老'];
const PROMOTE = [null, { realm: 1, contrib: 200 }, { realm: 2, contrib: 600 }, { realm: 3, contrib: 1500 }];
const TRIAL_T = 120;
const GUEST_JOBS = 3, FAV_TEACH = 60;
const isNight = (h) => h < 5.5 || h > 19.5;
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

export class Sects {
  constructor(g, landmarks, data) {
    this.g = g; this.data = data.sects;
    this.member = null;          // { name, rank, contrib }
    this.learned = new Set(); this.traitor = new Set(); this.alumni = new Set();
    this.tourneyDay = -1;
    this.trial = null; this.pet = null;
    this.rel = {};               // 别派关系：{ 门派名: { fav 好感, jobs 做过的委托, guest 客卿, visit / peek 当天拜会过 / 偷师过, hunt 追杀到哪天 } }
    this.peek = null; this.huntT = 40; this.missions = {};
    this.steps = 0; this.stepDay = -1; this.stepsToday = 0;   // 剑宗九重剑阶
    this.crisis = { day: 22 + Math.floor(Math.random() * 10), state: 'wait' }; // 青锋剑派灭门危机：wait / alarm / fight / saved / ruined
    g.player.mods = {};
    this.list = landmarks.list.filter((L) => L.kind === 'sect' && this.data[L.name]).map((L) => this.build(L));
    g.sects = this;
    this.recalc();
  }
  // r 按标准小宗（半径 22）给；大场地的门派按自己的半径往外放
  at(p, r = 24) { return this.list.find((s) => Math.hypot(p.x - s.x, p.z - s.z) < r + (s.r - 22)); }

  // ---------- 山门、大殿、偏殿、练武场上的弟子、执事 ----------
  build(L) {
    const g = this.g, d = this.data[L.name], x = L.x, z = L.z, robe = d.robe;
    // 每派自己的布局（sectsites.js，规划见 SECTS.md）
    const site = new Site(g, x, z), A = siteOf(L.name).build(site, d, L.name.replace(/\s.*$/, ''));
    const W = ([lx, lz]) => ({ x: x + lx, z: z + lz });
    if (!L.hidden) g.landmarks.build(L, W(A.stele));
    const lk = A.look;
    const mk = (px, pz, elder, i = 0) => {
      const c = createChibi(elder ? { skin: '#eac3a0', hair: '#e8e8ec', hairStyle: 2, robe: lk.elderRobe || '#f0ece0', robe2: lk.robe2 || shade(robe, 0.6), belt: lk.belt || shade(robe, 0.4), age: 'elder', beard: true }
        : { skin: lk.skin || '#eac3a0', hair: lk.hair || '#2e1e18', hairStyle: Array.isArray(lk.hairStyle) ? lk.hairStyle[i % lk.hairStyle.length] : lk.hairStyle ?? 2, robe: lk.robe || robe, robe2: lk.robe2 || shade(robe, 0.6), belt: lk.belt || shade(robe, 0.4), pants: lk.pants, age: 'adult', sword: lk.sword ?? true });
      c.root.position.set(px, 0, pz); g.scene.add(c.root); return c;
    };
    const elder = mk(x + A.elder[0], z + A.elder[1], true); elder.face = A.elder[2] ?? 0; elder.root.rotation.y = elder.face;
    const disciples = A.disciples.map(([lx, lz, face, act], i) => { const c = mk(x + lx, z + lz, false, i); c.root.rotation.y = face; return { c, t: i * 0.4, face, act, home: { x: x + lx, z: z + lz } }; });
    const s = { name: L.name, d, x, z, r: siteOf(L.name).r, elder, disciples, site, ruinFx: A.ruin, yard: W(A.yard), lib: W(A.lib), front: W(A.front), arena: W(A.arena || A.yard), lvl: Math.max(1, Math.floor(dangerFor(x, z))) };
    // 有名有姓的门人（掌门、长老、师兄师姐、杂役……）：各有站位、动作、几句台词，走近按 F 说话
    s.npcs = (A.npcs || []).map((n, i) => {
      const c = createChibi({ skin: '#eac3a0', hair: '#2e1e18', hairStyle: 2, robe: lk.robe || robe, robe2: lk.robe2 || shade(robe, 0.6), belt: lk.belt || shade(robe, 0.4), age: 'adult', sword: lk.sword ?? true, ...n.look });
      const [lx, lz, face = 0] = n.p; c.root.position.set(x + lx, 0, z + lz); c.root.rotation.y = face; g.scene.add(c.root);
      const npc = { ...n, c, t: i * 0.37, face, act: n.act || 'idle', home: { x: x + lx, z: z + lz }, route: n.route && n.route.map(([rx, rz]) => ({ x: x + rx, z: z + rz })), ri: 0, wait: 0, said: 0 };
      g.life.on((P) => { if (s.ruined) return false; const dd = near(P, c.root.position, 1.8); return dd !== false && { label: `💬 ${n.name} · ${n.title}`, act: () => this.npcTalk(s, npc), d: dd - 0.2 }; });
      return npc;
    });
    TYPES['disciple_' + d.id] = { ...TYPES.bandit, name: `${L.name.replace(/\s.*$/, '')}弟子`, c: [robe, shade(robe, 0.5), '#ffe7a8'], drops: [], stones: null, xp: 20 };
    g.life.on((P) => { const dd = near(P, elder.root.position, 2.3); return dd !== false && { label: `${L.name} · 执事${A.elderName ? ' ' + A.elderName : ''}`, act: () => this.talk(s), d: dd - 0.4 }; });
    // 偷师：练武场边观摩、藏经阁里翻秘籍（藏经阁在大殿左边，门朝南）
    g.life.on((P) => { const dd = this.canPeek(s) && near(P, s.yard, 4); return dd !== false && { label: `👀 偷师 · 观摩${L.name.replace(/\s.*$/, '')}弟子练功`, act: () => this.startPeek(s), d: dd }; });
    g.life.on((P) => { const dd = this.canPeek(s) && near(P, s.lib, 2); return dd !== false && { label: '📜 偷翻藏经阁的秘籍', act: () => this.sneak(s), d: dd }; });
    return s;
  }

  // ---------- 功法效果 ----------
  recalc() {
    const M = {};
    for (const s of Object.values(this.data)) for (const t of s.techs) if (this.learned.has(t.id)) for (const [k, v] of Object.entries(t.fx)) M[k] = (M[k] || 0) + v;
    this.g.player.mods = M;
    this.g.realm?.recalc();
  }
  addContrib(n) { if (this.member) { this.member.contrib += n; this.g.toast(`宗门贡献 +${n}`, 1.5); } }

  // ---------- 和执事说话 ----------
  talk(s) {
    const g = this.g, P = g.player, m = this.member, d = s.d, realm = levelInfo(P.layer).realm, mine = m?.name === s.name;
    const choices = [];
    let line, sub = d.intro;
    if (this.traitor.has(s.name)) { g.ui.dialog({ name: `${s.name} 执事`, line: '叛出师门之人，还有脸回来？', hint: '叛出过的门派不会再收你。' }); return; }
    if (d.hidden && !g.quests.flags.has('bloodClue')) { g.ui.dialog({ narrate: true, line: '这里只有一片焦黑的岩地，什么也没有……', hint: '也许该去问问知道内情的人。' }); return; }
    if (s.ruined) { g.ui.dialog({ narrate: true, line: '山门已经塌了，到处是烧焦的梁柱。青锋剑派……没了。', hint: '灭门危机时没人来救。' }); return; }
    if (!d.evil && (P.karma || 0) >= 150 && !mine) { g.ui.dialog({ name: `${s.name} 执事`, line: '你身上的血腥气隔着山门都闻得到。正道不收魔头。', hint: '业力太重，正道门派都敌视你。洗心丹能洗去业力。' }); return; }
    const r = this.R(s);
    if (r.hunt > g.day) {
      const fine = 10 + s.lvl * 2;
      g.ui.dialog({ name: `${s.name} 执事`, line: '偷师的贼，还敢自己送上门？', hint: `${s.name}弟子还要追杀你 ${r.hunt - g.day} 天。`, choices: [
        { label: `🙇 赔罪（${fine} 灵石，了结此事）`, off: g.inv.stones < fine, fn: () => { if (g.inv.stones < fine) return; g.inv.stones -= fine; r.hunt = 0; g.toast(`${s.name}不再追究了`, 2); } },
        { label: '离开' }] });
      return;
    }
    if (mine) {
      line = `${RANK[m.rank]}弟子，有事？`; sub = `${RANK[m.rank]} · 贡献 ${m.contrib}`;
      choices.push({ label: '📖 功法（贡献兑换）', fn: () => this.openTechs(s) });
      for (const q of g.quests.active) if (q.from === 'sect' && (q.def.sect ? q.def.sect === s.name : true) && g.quests.complete(q)) choices.push({ label: `✅ 交付：${q.def.title}`, fn: () => g.quests.finish(q) });
      choices.push({ label: '📜 宗门任务', fn: () => this.openMissions(s) });
      const nx = m.rank + 1, need = PROMOTE[nx];
      if (need) choices.push({ label: `⬆ 晋升${RANK[nx]}（${REALMS[need.realm]}、贡献 ${need.contrib}）`, off: realm < need.realm || m.contrib < need.contrib, fn: () => { if (realm >= need.realm && m.contrib >= need.contrib) this.startTrial(s, 'promote'); } });
      if (dateOf(g.day).weekday === 6) choices.push({ label: '🏆 宗门大比（今天周日）', off: this.tourneyDay === g.day, fn: () => { if (this.tourneyDay !== g.day) this.startTrial(s, 'tourney'); } });
      choices.push({ label: m.rank >= 1 ? '🙇 出师（保留功法，可以转投）' : '🚪 叛出（外门就走，门派从此敌视）', fn: () => this.leave(s) });
    } else if (m) {
      line = `你已是${m.name}的弟子。同一时间只能属于一个门派——先出师，再来拜入。`;
    } else if (realm < d.join) {
      line = `本门只收${REALMS[d.join]}以上的修士。等你修为够了再来。`;
    } else {
      line = d.hidden ? '……你居然找到了这里。想入魔道？这条路可回不了头。' : `${d.intro}想拜入本门？先和守山弟子过过招。`;
      choices.push({ label: `⚔ 入门试炼（${TRIAL_T / 60} 分钟内打败试炼弟子）`, fn: () => this.startTrial(s, 'join') });
    }
    // 不是本门弟子：结交、接本门委托（攒客卿）、求教外传小技能
    if (!mine) {
      if (r.guest) line = `客卿来了。${line}`;
      sub = `好感 ${r.fav}${r.guest ? ' · 本门客卿' : ` · 委托 ${Math.min(r.jobs, GUEST_JOBS)}/${GUEST_JOBS}`}`;
      for (const q of g.quests.active) if (q.from === 'sect' && q.def.sect === s.name && g.quests.complete(q)) choices.push({ label: `✅ 交付：${q.def.title}`, fn: () => g.quests.finish(q) });
      choices.push({ label: `🤝 结交 · 外传小技能（好感 ${r.fav}）`, fn: () => this.openCross(s) });
      choices.push({ label: `📜 本门委托（做满 ${GUEST_JOBS} 件可受封客卿）`, fn: () => this.openMissions(s) });
    }
    // 剑宗九重剑阶：元婴起谁都能登，每一阶和更高辈分的弟子单挑（一天最多三阶）
    if (d.id === 'jianzong' && realm >= 3 && this.steps < 9) choices.unshift({ label: `🗡 登九重剑阶（第 ${this.steps + 1} 阶）`, off: this.stepDay === g.day && this.stepsToday >= 3, fn: () => { if (!(this.stepDay === g.day && this.stepsToday >= 3)) this.startTrial(s, 'step'); } });
    if (s.vassal) line = '恩公来了！本门上下随时听候差遣。（附属门派：功法贡献打七折）';
    choices.push({ label: '离开' });
    g.ui.dialog({ name: `${s.name} 执事`, sub, line, info: `功法：${d.techs.map((t) => t.name).join('、')}`, choices });
  }
  openTechs(s) {
    const g = this.g, m = this.member;
    g.ui.panel(`${s.name} · 功法`, (body) => {
      body.append(el('div', 'pmoney', `${RANK[m.rank]} · 贡献 ${m.contrib}`));
      for (const t of s.d.techs) {
        const have = this.learned.has(t.id), lockR = m.rank < t.rank, cost = Math.round(t.cost * (s.vassal ? 0.7 : 1));
        body.append(g.ui.row(have ? '✅' : '📖', `${t.name} <i>${RANK[t.rank]}可学 · ${cost} 贡献</i>`, t.desc,
          [btn(have ? '已学会' : lockR ? `要${RANK[t.rank]}` : '学习', () => {
            if (have || lockR || m.contrib < cost) return;
            m.contrib -= cost; this.learned.add(t.id); this.recalc(); g.toast(`学会了 ${t.name}`, 2); g.ui.refresh();
          }, have || lockR || m.contrib < cost ? 'off' : '')]));
      }
    });
  }
  // 宗门任务：每周一刷新三件（本扇区的妖兽、材料）。外人来接就是委托：不给贡献，给好感，做满三件能受封客卿
  openMissions(s) {
    const g = this.g, Q = g.quests, wk = Math.floor((g.day - 1) / 7), mine = this.member?.name === s.name, key = `${wk}${mine ? 'm' : 'g'}`;
    if (this.missions[s.name]?.key !== key) {
      const sec = sectorAt(s.x, s.z), mobs = SECTOR_MOBS[sec.id], lvl = s.lvl, tag = mine ? '宗门' : '委托';
      const pay = (contrib, stones) => mine ? { contrib, stones } : { sect: [s.name, 15], stones: stones + 1 };
      const mk = (i, o) => { const id = `sm${wk}_${s.d.id}_${mine ? '' : 'g'}${i}`; return { id, def: { id, giver: 'sect', sect: s.name, giverName: `${s.name} 执事`, ...o } }; };
      this.missions[s.name] = { key, list: [0, 1, 2].map((i) => {
        const mob = mobs[i % mobs.length], n = 4 + i * 2 + Math.floor(lvl / 4);
        return i < 2
          ? mk(i, { title: `${tag} · 清剿${TYPES[mob].name}×${n}`, desc: `执事吩咐：山门外的${TYPES[mob].name}越来越多，去清掉 ${n} 只。`, goals: [{ type: 'kill', target: mob, n }], reward: pay(40 + n * 6, 2 + Math.floor(lvl / 3)) })
          : mk(i, { title: `${tag} · 上缴妖丹`, desc: '丹房缺妖丹，上缴 6 颗。', goals: [{ type: 'have', item: 'yaodan', n: 6 }], reward: pay(90, 3) });
      }) };
    }
    g.ui.panel(`${s.name} · ${mine ? '宗门任务' : '本门委托'}（每周一刷新）`, (body) => {
      for (const ms of this.missions[s.name].list) {
        const act = Q.active.find((q) => q.id === ms.id), done = Q.done.has(ms.id);
        body.append(g.ui.row('📜', `${ms.def.title}`, `${ms.def.desc}　奖励 ${Q.describe(ms.def.reward)}`,
          [btn(done ? '已完成' : act ? (Q.complete(act) ? '交付' : '进行中') : '接下', () => {
            if (done) return;
            if (act) { if (Q.complete(act)) { g.ui.closePanel(); Q.finish(act); } return; }
            Q.accept(ms.id, 'sect', ms.def, (Math.floor((g.day - 1) / 7) + 1) * 7); g.ui.refresh();
          }, done || (act && !Q.complete(act)) ? 'off' : '')]));
      }
    });
  }
  leave(s) {
    const g = this.g, m = this.member;
    if (m.rank >= 1) { this.alumni.add(s.name); g.toast(`你从${s.name}出师了。学会的功法都还在。`, 3); }
    else { this.traitor.add(s.name); g.toast(`你叛出了${s.name}……`, 3); g.emit?.('karma', 5); }
    this.member = null;
  }

  // ---------- 学别派小技能（GDD 第 10 节）：外门那两门能外传，其余只传本门 ----------
  R(s) { return this.rel[s.name] ||= { fav: 0, jobs: 0, guest: false, visit: -1, peek: -1, hunt: 0 }; }
  small(s) { return s.d.techs.filter((t) => t.rank === 0); }
  slots(s) { const r = this.R(s); return r.guest ? 2 : r.fav >= FAV_TEACH ? 1 : 0; }
  price(t) { return Math.max(3, Math.round(t.cost / 10)); }
  addFavor(name, n) {
    const s = this.list.find((x) => x.name === name); if (!s) return;
    const r = this.R(s); r.fav = Math.max(-100, Math.min(100, r.fav + n));
    if (n) this.g.toast(`${name}好感 ${n > 0 ? '+' : ''}${n}（${r.fav}）`, 1.6);
  }
  // 外人做完本门委托
  commission(name, fav) {
    const s = this.list.find((x) => x.name === name); if (!s) return;
    const r = this.R(s); r.jobs++; this.addFavor(name, fav);
    if (r.jobs === GUEST_JOBS && !r.guest) this.g.toast(`${name}的委托做满 ${GUEST_JOBS} 件了\n回去找执事，可以受封客卿`, 3);
  }
  openCross(s) {
    const g = this.g, r = this.R(s), inv = g.inv;
    g.ui.panel(`${s.name} · 结交`, (body) => {
      const have = this.small(s).filter((t) => this.learned.has(t.id)).length, slots = this.slots(s);
      body.append(el('div', 'pmoney', `好感 ${r.fav}${r.guest ? ' · 本门客卿' : ` · 委托 ${Math.min(r.jobs, GUEST_JOBS)}/${GUEST_JOBS}`} · 灵石 ${inv.stones}`));
      body.append(g.ui.row('🍵', '拜会执事', '喝杯茶、聊聊修行。每天一次，好感 +5', [btn(r.visit === g.day ? '今天来过了' : '拜会', () => { if (r.visit === g.day) return; r.visit = g.day; this.addFavor(s.name, 5); g.ui.refresh(); }, r.visit === g.day ? 'off' : '')]));
      body.append(g.ui.row('🎁', `送 ${itemName('yaodan')}`, `丹房总缺妖丹。好感 +8（有 ${inv.count('yaodan')} 颗）`, [btn('送一颗', () => { if (!inv.count('yaodan')) return; inv.take('yaodan', 1); this.addFavor(s.name, 8); g.ui.refresh(); }, inv.count('yaodan') ? '' : 'off')]));
      body.append(g.ui.row('💎', '捐 5 灵石', '给山门添点香火。好感 +10', [btn('捐', () => { if (inv.stones < 5) return; inv.stones -= 5; this.addFavor(s.name, 10); g.ui.refresh(); }, inv.stones >= 5 ? '' : 'off')]));
      if (!r.guest) {
        const ok = r.jobs >= GUEST_JOBS && r.fav >= 30;
        body.append(g.ui.row('🎖', '受封客卿', `做满 ${GUEST_JOBS} 件本门委托、好感 30 以上，执事请你做本门客卿：两门外传小技能都肯教`, [btn('受封', () => { if (!ok) return; r.guest = true; g.toast(`你成了${s.name}的客卿`, 2.5); g.ui.refresh(); }, ok ? '' : 'off')]));
      }
      body.append(el('div', 'pmoney', `外传小技能：能学 ${slots} 门，已会 ${have} 门`));
      for (const t of this.small(s)) {
        const own = this.learned.has(t.id), cost = this.price(t), ok = !own && have < slots && inv.stones >= cost;
        body.append(g.ui.row(own ? '✅' : '📖', `${t.name} <i>${cost} 灵石</i>`, t.desc, [btn(own ? '已学会' : have >= slots ? (slots ? '名额用完' : `好感 ${FAV_TEACH}`) : '请教', () => {
          if (!ok) return;
          inv.stones -= cost; this.learned.add(t.id); this.recalc(); g.toast(`学会了 ${s.name}的 ${t.name}`, 2); g.ui.refresh();
        }, ok ? '' : 'off')]));
      }
      body.append(el('div', 'pempty', `好感 ${FAV_TEACH}：执事肯指点一门；做了客卿两门都教。其余功法只传本门弟子。\n名额不够，也可以去偷师——练武场边看弟子练功，或者夜里潜进藏经阁。`));
    });
  }

  // ---------- 偷师：被发现掉好感、被那一派追杀三天 ----------
  canPeek(s) {
    const g = this.g, r = this.rel[s.name];
    return this.member?.name !== s.name && !s.ruined && !(s.d.hidden && !g.quests.flags.has('bloodClue')) && !this.trial && !this.peek
      && !(r && (r.peek === g.day || r.hunt > g.day)) && this.small(s).some((t) => !this.learned.has(t.id));
  }
  startPeek(s) {
    const g = this.g;
    this.R(s).peek = g.day;
    this.peek = { s, t: 0, need: 12, look: 1.5, last: g.player.pos.clone() };
    g.toast('站在练武场边看他们练功，别乱走动……\n有弟子回头张望（？）的时候最容易露馅', 3);
  }
  updatePeek(dt) {
    const g = this.g, K = this.peek, P = g.player;
    if (!K) return;
    const s = K.s, moved = P.pos.distanceTo(K.last) > 2.2 * dt;
    K.last.copy(P.pos);
    if (P.dead || this.trial || Math.hypot(P.pos.x - s.yard.x, P.pos.z - s.yard.z) > 7) { this.endPeek(); g.toast('走远了，没看全……', 2); return; }
    if (!moved) K.t += dt;
    // 弟子时不时回头张望：被看到那一下有几成露馅（夜里、神识强、站着不动都更安全）
    K.look -= dt;
    if (K.look <= 0) {
      const night = isNight(g.hours), dsc = s.disciples[Math.floor(Math.random() * s.disciples.length)];
      K.look = (night ? 3.5 : 2.2) + Math.random() * 2; dsc.glance = 1.1;
      g.fx.num(dsc.c.root.position, '？');
      if (Math.random() < (moved ? 0.5 : night ? 0.08 : 0.14) * (P.mods.sense ? 0.6 : 1)) { this.caught(s, '练功的弟子回头看见了你：「你在偷看什么？！」'); return; }
    }
    document.body.classList.add('trib');
    document.getElementById('tribBar').textContent = `偷师 · ${s.name.replace(/\s.*$/, '')}　${Math.min(99, Math.floor(K.t / K.need * 100))}%${moved ? '　别乱动' : ''}`;
    if (K.t >= K.need) { this.endPeek(); this.steal(s, '看了半天，总算看出'); }
  }
  endPeek() { this.peek = null; if (!this.trial) document.body.classList.remove('trib'); }
  sneak(s) {
    const g = this.g, night = isNight(g.hours), chance = Math.min(0.85, (night ? 0.55 : 0.25) + (g.player.mods.sense ? 0.15 : 0));
    g.ui.dialog({ narrate: true, line: night ? '夜深了，藏经阁里黑漆漆的，守阁弟子在门口打盹。' : '藏经阁里有弟子在抄经，不时抬头看一眼。',
      hint: `大约 ${Math.round(chance * 100)}% 不被发现。被抓到：${s.name}好感 −40，被追杀三天。`, choices: [
        { label: '📜 偷偷翻看秘籍', fn: () => { this.R(s).peek = g.day; if (Math.random() < chance) this.steal(s, '翻到了'); else this.caught(s, '守阁弟子撞见你在翻秘籍：「抓贼啊！」'); } },
        { label: '算了' }] });
  }
  steal(s, how) {
    const g = this.g, left = this.small(s).filter((t) => !this.learned.has(t.id)), t = left[Math.floor(Math.random() * left.length)];
    if (!t) return;
    this.learned.add(t.id); this.recalc();
    g.ui.dialog({ narrate: true, line: `${how}《${t.name}》的门道，偷偷记在了心里。`, info: `偷学：${t.name} —— ${t.desc}`, hint: '偷来的功法和请教来的一样用。' });
  }
  caught(s, why) {
    const g = this.g, r = this.R(s), P = g.player;
    this.endPeek();
    r.hunt = g.day + 3; const wasGuest = r.guest; r.guest = false;
    this.addFavor(s.name, -40);
    for (let i = 0; i < 3; i++) { const e = g.enemies.spawn('disciple_' + s.d.id, s.front.x + (i - 1) * 1.5, s.front.z + 2, s.lvl + 2); e.state = 'chase'; e.hunter = s.name; }
    g.shake(0.4); g.sfx?.impact?.({});
    g.ui.dialog({ name: `${s.name} 弟子`, line: why, info: `${s.name}好感 −40${wasGuest ? '，客卿的名头也撤了' : ''}。接下来三天，${s.name}的弟子会在野外追杀你。`, hint: '回去找执事赔罪（灵石）能了结。' });
    g.emit?.('caughtStealing', s.name);
  }
  // 被追杀：野外隔一阵就有两三个弟子追上来（村里、坊市、宗门里不会）
  updateHunt(dt) {
    const g = this.g, P = g.player;
    if ((this.huntT -= dt) > 0) return;
    this.huntT = 70 + Math.random() * 60;
    const s = this.list.find((x) => this.rel[x.name]?.hunt > g.day);
    if (!s || P.dead || this.trial || g.paused || Math.hypot(P.pos.x, P.pos.z) < VILLAGE_R + 10 || g.hubs?.at?.(P.pos, 50) || this.at(P.pos, 30)) return;
    const a = Math.random() * Math.PI * 2, n = 2 + (s.lvl >= 6 ? 1 : 0);
    for (let i = 0; i < n; i++) { const e = g.enemies.spawn('disciple_' + s.d.id, P.pos.x + Math.sin(a) * 20 + i * 1.5, P.pos.z + Math.cos(a) * 20, s.lvl + 2); e.state = 'chase'; e.hunter = s.name; }
    g.toast(`${s.name.replace(/\s.*$/, '')}弟子追上来了：\n「偷师的贼，哪里走！」`, 2.5);
  }

  // ---------- 试炼：入门 / 晋升 / 大比，在练武场上一对一 ----------
  startTrial(s, kind) {
    const g = this.g, P = g.player, m = this.member, rounds = kind === 'tourney' ? 3 : 1;
    const lvl = s.lvl + (kind === 'promote' ? (m.rank + 1) * 2 : kind === 'tourney' ? (m?.rank || 0) * 2 : kind === 'step' ? this.steps : 0);
    this.trial = { s, kind, lvl, round: 0, rounds, t: TRIAL_T, foe: null };
    for (const e of [...g.enemies.list]) if (!e.boss && Math.hypot(e.pos.x - s.arena.x, e.pos.z - s.arena.z) < 30) g.enemies.remove(e);
    P.pos.set(s.arena.x, 0, s.arena.z + 4); P.yaw = Math.PI;
    this.nextFoe();
    g.toast({ join: '入门试炼', promote: '晋升试炼', tourney: '宗门大比', step: `九重剑阶 · 第 ${this.steps + 1} 阶` }[kind] + '：开始！', 2);
  }
  nextFoe() {
    const T = this.trial, g = this.g;
    T.round++;
    const e = g.enemies.spawn('disciple_' + T.s.d.id, T.s.arena.x, T.s.arena.z - 1.5, T.lvl + (T.round - 1));
    e.state = 'chase'; e.trial = true; T.foe = e;
  }
  updateTrial(dt) {
    const T = this.trial, g = this.g, P = g.player;
    if (!T) return;
    T.t -= dt;
    const far = Math.hypot(P.pos.x - T.s.arena.x, P.pos.z - T.s.arena.z) > 26;
    if (P.dead || far || T.t <= 0) { this.endTrial(false, far ? '离开了练武场' : P.dead ? '你被打倒了' : '时间到了'); return; }
    if (!T.foe.alive) {
      if (T.round < T.rounds) { g.toast(`第 ${T.round} 场胜！下一场`, 1.6); this.nextFoe(); }
      else this.endTrial(true);
    }
    document.getElementById('tribBar').textContent = `${{ join: '入门试炼', promote: '晋升试炼', tourney: '宗门大比', step: '九重剑阶' }[T.kind]} · 第 ${T.round}/${T.rounds} 场　${Math.ceil(T.t)}`;
  }
  endTrial(win, why) {
    const T = this.trial, g = this.g, s = T.s;
    this.trial = null; document.body.classList.remove('trib');
    for (const e of [...g.enemies.list]) if (e.trial) g.enemies.remove(e);
    if (!win) { g.toast(`试炼失败：${why}`, 2.5); return; }
    if (T.kind === 'join') {
      this.member = { name: s.name, rank: 0, contrib: 30 };
      g.ui.dialog({ name: `${s.name} 执事`, line: `好！从今天起，你就是${s.name}的外门弟子了。`, info: '宗门任务和每周日大比能挣贡献，贡献换功法；境界和贡献够了可以晋升。' });
      g.emit?.('joinSect', s.name);
    } else if (T.kind === 'promote') {
      this.member.rank++;
      g.ui.dialog({ name: `${s.name} 执事`, line: `恭喜晋升${RANK[this.member.rank]}弟子！`, info: '更深的功法解锁了。' });
    } else if (T.kind === 'step') {
      if (this.stepDay !== g.day) { this.stepDay = g.day; this.stepsToday = 0; }
      this.steps++; this.stepsToday++; g.addStones(5 + this.steps * 3, g.player.pos);
      if (this.steps >= 9) { g.player.atkBonus += 0.15; g.ui.dialog({ name: '剑宗 执事', line: '九重剑阶，一气登顶！剑宗上下，无人不服。', info: '攻击 +15%，剑宗记下了你的名字。' }); g.quests.flags.add('swordSteps'); }
      else g.toast(`登上第 ${this.steps} 阶剑阶`, 2);
    } else {
      this.tourneyDay = g.day; this.addContrib(150); g.addStones(5 + s.lvl, g.player.pos);
      g.ui.dialog({ name: `${s.name} 执事`, line: '大比三连胜！本周魁首，赏！', info: '贡献 +150，另有灵石。' });
    }
  }

  // ---------- 灵兽（御兽宗）：一只灵狐跟着你，扑咬附近的妖兽 ----------
  updatePet(dt) {
    const g = this.g, P = g.player, lv = P.mods.pet || 0;
    if (!lv) { if (this.pet) { g.scene.remove(this.pet.m); this.pet = null; } return; }
    if (!this.pet) {
      const m = new THREE.Group(), body = glow('#ffd8a8', 1.6);
      m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.8, 1.4), body), 0, 0.5, 0));
      m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), body), 0, 0.75, 0.35));
      for (const s of [-1, 1]) m.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), body), s * 0.1, 0.95, 0.35));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6).rotateX(-2.2), body); tail.position.set(0, 0.65, -0.45); m.add(tail);
      g.scene.add(m); this.pet = { m, cd: 0, target: null };
    }
    const pt = this.pet, p = pt.m.position;
    pt.cd -= dt;
    let tx = P.pos.x - Math.sin(P.yaw) * 1.4 + 0.8, tz = P.pos.z - Math.cos(P.yaw) * 1.4;
    const e = g.enemies.list.filter((o) => !o.trial || true).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
    if (e && e.pos.distanceTo(P.pos) < 7) { tx = e.pos.x; tz = e.pos.z; if (pt.cd <= 0 && Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < e.r + 0.8) { pt.cd = 1.2; g.enemies.damage(e, 6 * lv * g.atkMul(), p.x, p.z, 3); g.fx.burst(e.pos, '#ffd8a8', 8, { speed: 3, up: 2, life: 0.3, y: 0.8 }); } }
    const dx = tx - p.x, dz = tz - p.z, dd = Math.hypot(dx, dz);
    if (dd > 0.2) { const v = Math.min(dd, (dd > 6 ? 14 : 7) * dt); p.x += dx / dd * v; p.z += dz / dd * v; pt.m.rotation.y = Math.atan2(dx, dz); }
    p.y = Math.abs(Math.sin(g.time * 8)) * 0.15;
  }

  // ---------- 青锋剑派灭门危机（GDD 独特地点 3）：魔修围山，三天内去救；守住成你的附属门派，放任就成废墟（永久）----------
  updateCrisis() {
    const g = this.g, C = this.crisis, s = this.list.find((x) => x.d.id === 'qingfeng'), P = g.player;
    if (!s || C.state === 'saved' || C.state === 'ruined') return;
    if (C.state === 'wait' && g.day >= C.day) { C.state = 'alarm'; C.deadline = g.day + 3; g.toast('急报！青锋剑派遭魔修围攻，\n三天之内去救援，晚了就来不及了！', 5); }
    if (C.state === 'alarm' && g.day > C.deadline) { this.ruin(s); return; }
    if (C.state === 'alarm' && Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < s.r + 6) {
      C.state = 'fight'; C.wave = 0;
      g.toast('魔修正在攻山！', 2);
    }
    if (C.state === 'fight') {
      if (!g.enemies.list.some((e) => e.crisis)) {
        if (C.wave >= 3) { C.state = 'saved'; s.vassal = true; Object.assign(this.R(s), { guest: true, hunt: 0 }); this.addFavor(s.name, 100); this.member && this.member.name === s.name && this.addContrib(200); g.ui.dialog({ name: '青锋剑派 执事', lines: ['魔修退了……青锋剑派保住了！', '恩公大恩，本门愿奉你为上宾——从今往后，青锋剑派就是你的附属门派。'], info: '附属门派：在这里学功法贡献打七折，宗门大比奖励照拿；不入门也奉你为客卿，外传小技能随便学。' }); for (const v of g.village.list) v.addAff(10); return; }
        C.wave++;
        for (let i = 0; i < 2 + C.wave * 2; i++) { const a = Math.random() * 6.28, e = g.enemies.spawn('demoncult', s.yard.x + Math.cos(a) * 14, s.yard.z + Math.sin(a) * 14, s.lvl + C.wave); e.state = 'chase'; e.crisis = true; }
        g.toast(`魔修 · 第 ${C.wave} 波`, 1.5);
      }
      if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) > s.r + 40 || P.dead) { for (const e of [...g.enemies.list]) if (e.crisis) g.enemies.remove(e); C.state = 'alarm'; }
    }
  }
  ruin(s, quiet) {
    const g = this.g;
    this.crisis.state = 'ruined'; s.ruined = true;
    s.ruinFx?.();
    for (const dsc of s.disciples) dsc.c.root.visible = false;
    for (const n of s.npcs) n.c.root.visible = false;
    s.elder.root.visible = false;
    if (this.member?.name === s.name) this.member = null;
    if (!quiet) g.toast('青锋剑派……被魔修灭门了。\n山门成了一片废墟', 5);
  }

  update(dt) {
    const g = this.g, P = g.player;
    this.updateCrisis();
    this.updateTrial(dt);
    if (this.trial) document.body.classList.add('trib');
    this.updatePet(dt);
    this.updatePeek(dt);
    this.updateHunt(dt);
    // 回春术：脱战回血
    const M = P.mods;
    if (M.regen && !P.dead && !g.enemies.list.some((e) => e.state !== 'idle' && e.pos.distanceTo(P.pos) < 15)) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * M.regen * dt);
    for (const s of this.list) {
      if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) > s.r + 60) continue;
      s.site.update(dt, g.time ?? performance.now() / 1000);
      s.elder.root.rotation.y = s.elder.face; animChibi(s.elder, dt, { move: 0, attack: -1, cast: 0 });
      for (const dsc of s.disciples) {
        dsc.t += dt;
        // 回头张望（偷师时）：转过来盯着你看一会儿
        if (dsc.glance > 0) { dsc.glance -= dt; const q = dsc.c.root.position; dsc.c.root.rotation.y = Math.atan2(P.pos.x - q.x, P.pos.z - q.z); animChibi(dsc.c, dt, { move: 0, attack: -1, cast: 0 }); continue; }
        this.act(dsc, dt);
      }
      if (s.ruined) continue;
      for (const n of s.npcs) {
        n.t += dt;
        if (n.glance > 0) { n.glance -= dt; const q = n.c.root.position; n.c.root.rotation.y = Math.atan2(P.pos.x - q.x, P.pos.z - q.z); animChibi(n.c, dt, { move: 0, attack: -1, cast: 0 }); continue; }
        if (n.route) this.walkRoute(n, dt); else this.act(n, dt);
      }
    }
  }
  // 沿路线来回走：到一个点停一会儿（巡山、扫地、送饭）
  walkRoute(n, dt) {
    const c = n.c, p = c.root.position, T = n.route[n.ri], st = { move: 0, attack: -1, cast: 0 };
    if (n.wait > 0) { n.wait -= dt; if (n.act === 'work') st.work = (n.t % 1.2) / 1.2; }
    else {
      const dx = T.x - p.x, dz = T.z - p.z, d = Math.hypot(dx, dz), sp = n.speed || 1.3;
      if (d < 0.2) { n.ri = (n.ri + 1) % n.route.length; n.wait = n.pause ?? 2.5; }
      else { const k = Math.min(1, sp * dt / d); p.x += dx * k; p.z += dz * k; c.root.rotation.y = Math.atan2(dx, dz); st.move = sp / 3.2; }
    }
    animChibi(c, dt, st);
  }
  npcTalk(s, n) {
    const g = this.g, line = n.lines[n.said++ % n.lines.length];
    n.glance = 4;
    g.ui.dialog({ name: `${n.name} · ${n.title}`, line, hint: n.hint });
  }
  // 弟子的日常动作：spar 对练 / drill 独自练招 / cast 施法 / sit 打坐 / work 干活（抡锤、扇火、采药）/ walk 绕圈踱步 / idle 站着
  act(dsc, dt) {
    const c = dsc.c, t = dsc.t, a = dsc.act || 'spar', st = { move: 0, attack: -1, cast: 0 };
    c.root.rotation.y = dsc.face ?? Math.PI;
    if (a === 'spar') { const p = (t % 1.6) / 1.6; if (p < 0.4) { st.attack = p / 0.4; st.combo = Math.floor(t / 1.6) % 3; } }
    else if (a === 'drill') { const p = (t % 2.4) / 2.4; if (p < 0.3) { st.attack = p / 0.3; st.combo = Math.floor(t / 2.4) % 3; } else if (p > 0.6 && p < 0.75) st.dash = 1; }
    else if (a === 'cast') st.cast = 0.5 + 0.5 * Math.sin(t * 2);
    else if (a === 'work') st.work = (t % 1.2) / 1.2;
    else if (a === 'sit') { c.hips.position.y = 0.32; c.legs[0].rotation.x = c.legs[1].rotation.x = -1.4; st.talk = false; }
    else if (a === 'walk') {
      const R = dsc.walkR || 2.2, w = t * 0.35 + (dsc.ph || 0);
      c.root.position.set(dsc.home.x + Math.sin(w) * R, 0, dsc.home.z + Math.cos(w) * R - R); c.root.rotation.y = w + Math.PI / 2; st.move = 0.45;
    }
    animChibi(c, dt, st);
    if (a === 'sit') { c.hips.position.y = 0.3; c.legs[0].rotation.x = c.legs[1].rotation.x = -1.45; c.arms[0].sh.rotation.x = c.arms[1].sh.rotation.x = -0.5; }
  }
  save() { return { member: this.member, learned: [...this.learned], traitor: [...this.traitor], alumni: [...this.alumni], tourney: this.tourneyDay, steps: this.steps, crisis: this.crisis, rel: this.rel }; }
  load(s) {
    this.member = s.member; this.learned = new Set(s.learned); this.traitor = new Set(s.traitor); this.alumni = new Set(s.alumni); this.tourneyDay = s.tourney ?? -1;
    this.steps = s.steps || 0; if (s.crisis) this.crisis = s.crisis;
    this.rel = s.rel || {};
    const qf = this.list.find((x) => x.d.id === 'qingfeng');
    if (qf && this.crisis.state === 'ruined' && !qf.ruined) this.ruin(qf, true);
    if (qf && this.crisis.state === 'saved') qf.vassal = true;
    this.recalc();
  }
}
