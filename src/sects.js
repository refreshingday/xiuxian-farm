// 宗门（GDD 第 10 节，数据在 data/sects.json）。
// - 同一时间只属于一个门派；小宗炼气就能拜入，大宗要到所在圈的境界。入门要过试炼（和守山弟子比一场）。
// - 外门 → 内门 → 真传 → 长老：每升一级要境界 + 贡献点，再过一场晋升试炼。
// - 贡献点：宗门任务（每周一刷新）、每周日宗门大比。贡献点换功法（被动加成，阵法阁有灵田阵法）。
// - 出师（内门以上）保留学会的功法，可以转投；外门就走算叛出，原门派从此不认你。
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
import { toon, glow, mesh, at, addOutline, outlineMat, canvasTex } from './util.js';

export const RANK = ['外门', '内门', '真传', '长老'];
const PROMOTE = [null, { realm: 1, contrib: 200 }, { realm: 2, contrib: 600 }, { realm: 3, contrib: 1500 }];
const TRIAL_T = 120;
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

export class Sects {
  constructor(g, landmarks, data) {
    this.g = g; this.data = data.sects;
    this.member = null;          // { name, rank, contrib }
    this.learned = new Set(); this.traitor = new Set(); this.alumni = new Set();
    this.week = -1; this.tourneyDay = -1;
    this.trial = null; this.pet = null;
    g.player.mods = {};
    this.list = landmarks.list.filter((L) => L.kind === 'sect' && this.data[L.name]).map((L) => this.build(L));
    g.sects = this;
    this.recalc();
  }
  at(p, r = 24) { return this.list.find((s) => Math.hypot(p.x - s.x, p.z - s.z) < r); }

  // ---------- 山门、大殿、偏殿、练武场上的弟子、执事 ----------
  build(L) {
    const g = this.g, w = g.world, d = this.data[L.name], x = L.x, z = L.z;
    const robe = d.robe;
    w.buildHouse(x, z - 6, 9, 6, { name: L.name.replace(/\s.*$/, ''), id: 'sect_' + d.id, roof: shade(robe, 0.55), wall: '#c8a878' });
    for (const s of [-1, 1]) w.buildHouse(x + s * 10, z - 4, 5, 4, { name: s < 0 ? '藏经阁' : '丹房', id: `sect_${d.id}_${s}`, roof: '#5a6070', wall: '#b89a6a' });
    // 山门：两根柱子 + 匾额
    const gate = new THREE.Group(), pillar = toon(shade(robe, 0.8), { occ: true }), roofM = toon('#3a3e48', { occ: true });
    for (const s of [-1, 1]) gate.add(at(mesh(new THREE.BoxGeometry(0.55, 4.6, 0.55).translate(0, 2.3, 0), pillar), s * 3.2, 0, 0));
    gate.add(at(mesh(new THREE.BoxGeometry(8.2, 0.5, 0.8), roofM), 0, 4.7, 0));
    const tex = canvasTex(320, 80, (c, cw, ch) => {
      c.fillStyle = '#2a1a10'; c.fillRect(0, 0, cw, ch); c.strokeStyle = '#d6b670'; c.lineWidth = 6; c.strokeRect(4, 4, cw - 8, ch - 8);
      c.fillStyle = '#ffe7a8'; c.font = 'bold 44px "STKaiti","KaiTi","Noto Serif SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(L.name.replace(/\s.*$/, ''), cw / 2, ch / 2 + 2);
    }, { pixel: false, repeat: false });
    gate.add(at(mesh(new THREE.PlaneGeometry(3.2, 0.8), toon('#ffffff', { map: tex }), { cast: false }), 0, 4.0, 0.3));
    gate.position.set(x, 0, z + 9); addOutline(gate, outlineMat('#2b1d14', 0.03)); g.scene.add(gate);
    for (const s of [-1, 1]) w.addCircle(x + s * 3.2, z + 9, 0.4);
    const mk = (px, pz, elder) => {
      const c = createChibi({ skin: '#eac3a0', hair: elder ? '#e8e8ec' : '#2e1e18', hairStyle: 2, robe: elder ? '#f0ece0' : robe, robe2: shade(robe, 0.6), belt: shade(robe, 0.4), age: elder ? 'elder' : 'adult', beard: elder, sword: !elder });
      c.root.position.set(px, 0, pz); g.scene.add(c.root); return c;
    };
    const elder = mk(x, z - 1.6, true);
    const disciples = [-3, -1, 1, 3].map((dx, i) => ({ c: mk(x + dx * 1.3, z + 3 + (i % 2) * 1.6), t: i * 0.4 }));
    const s = { name: L.name, d, x, z, elder, disciples, lvl: Math.max(1, Math.floor(dangerFor(x, z))) };
    TYPES['disciple_' + d.id] = { ...TYPES.bandit, name: `${L.name.replace(/\s.*$/, '')}弟子`, c: [robe, shade(robe, 0.5), '#ffe7a8'], drops: [], stones: null, xp: 20 };
    g.life.on((P) => { const dd = near(P, elder.root.position, 2.3); return dd !== false && { label: `${L.name} · 执事`, act: () => this.talk(s), d: dd - 0.4 }; });
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
    if (!d.evil && (P.karma || 0) >= 150 && !mine) { g.ui.dialog({ name: `${s.name} 执事`, line: '你身上的血腥气隔着山门都闻得到。正道不收魔头。', hint: '业力太重，正道门派都敌视你。洗心丹能洗去业力。' }); return; }
    if (mine) {
      line = `${RANK[m.rank]}弟子，有事？`; sub = `${RANK[m.rank]} · 贡献 ${m.contrib}`;
      choices.push({ label: '📖 功法（贡献兑换）', fn: () => this.openTechs(s) });
      for (const q of g.quests.active) if (q.from === 'sect' && g.quests.complete(q)) choices.push({ label: `✅ 交付：${q.def.title}`, fn: () => g.quests.finish(q) });
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
    choices.push({ label: '离开' });
    g.ui.dialog({ name: `${s.name} 执事`, sub, line, info: `功法：${d.techs.map((t) => t.name).join('、')}`, choices });
  }
  openTechs(s) {
    const g = this.g, m = this.member;
    g.ui.panel(`${s.name} · 功法`, (body) => {
      body.append(el('div', 'pmoney', `${RANK[m.rank]} · 贡献 ${m.contrib}`));
      for (const t of s.d.techs) {
        const have = this.learned.has(t.id), lockR = m.rank < t.rank;
        body.append(g.ui.row(have ? '✅' : '📖', `${t.name} <i>${RANK[t.rank]}可学 · ${t.cost} 贡献</i>`, t.desc,
          [btn(have ? '已学会' : lockR ? `要${RANK[t.rank]}` : '学习', () => {
            if (have || lockR || m.contrib < t.cost) return;
            m.contrib -= t.cost; this.learned.add(t.id); this.recalc(); g.toast(`学会了 ${t.name}`, 2); g.ui.refresh();
          }, have || lockR || m.contrib < t.cost ? 'off' : '')]));
      }
    });
  }
  // 宗门任务：每周一刷新三件（本扇区的妖兽、材料）
  openMissions(s) {
    const g = this.g, Q = g.quests, wk = Math.floor((g.day - 1) / 7);
    if (this.week !== wk || this.missionsFor !== s.name) {
      this.week = wk; this.missionsFor = s.name;
      const sec = sectorAt(s.x, s.z), mobs = SECTOR_MOBS[sec.id], lvl = s.lvl;
      this.missions = [0, 1, 2].map((i) => {
        const mob = mobs[i % mobs.length], n = 4 + i * 2 + Math.floor(lvl / 4);
        return i < 2
          ? { id: `sm${wk}_${i}`, def: { title: `宗门 · 清剿${TYPES[mob].name}×${n}`, desc: `执事吩咐：山门外的${TYPES[mob].name}越来越多，去清掉 ${n} 只。`, goals: [{ type: 'kill', target: mob, n }], reward: { contrib: 40 + n * 6, stones: 2 + Math.floor(lvl / 3) }, giver: 'sect' } }
          : { id: `sm${wk}_${i}`, def: { title: '宗门 · 上缴妖丹', desc: '丹房缺妖丹，上缴 6 颗。', goals: [{ type: 'have', item: 'yaodan', n: 6 }], reward: { contrib: 90, stones: 3 }, giver: 'sect' } };
      });
    }
    g.ui.panel(`${s.name} · 宗门任务（每周一刷新）`, (body) => {
      for (const ms of this.missions) {
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

  // ---------- 试炼：入门 / 晋升 / 大比，在练武场上一对一 ----------
  startTrial(s, kind) {
    const g = this.g, P = g.player, m = this.member, rounds = kind === 'tourney' ? 3 : 1;
    const lvl = s.lvl + (kind === 'promote' ? (m.rank + 1) * 2 : kind === 'tourney' ? (m?.rank || 0) * 2 : 0);
    this.trial = { s, kind, lvl, round: 0, rounds, t: TRIAL_T, foe: null };
    for (const e of [...g.enemies.list]) if (!e.boss && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 30) g.enemies.remove(e);
    P.pos.set(s.x, 0, s.z + 5.5);
    this.nextFoe();
    g.toast({ join: '入门试炼', promote: '晋升试炼', tourney: '宗门大比' }[kind] + '：开始！', 2);
  }
  nextFoe() {
    const T = this.trial, g = this.g;
    T.round++;
    const e = g.enemies.spawn('disciple_' + T.s.d.id, T.s.x, T.s.z + 1.5, T.lvl + (T.round - 1));
    e.state = 'chase'; e.trial = true; T.foe = e;
  }
  updateTrial(dt) {
    const T = this.trial, g = this.g, P = g.player;
    if (!T) return;
    T.t -= dt;
    const far = Math.hypot(P.pos.x - T.s.x, P.pos.z - T.s.z) > 26;
    if (P.dead || far || T.t <= 0) { this.endTrial(false, far ? '离开了练武场' : P.dead ? '你被打倒了' : '时间到了'); return; }
    if (!T.foe.alive) {
      if (T.round < T.rounds) { g.toast(`第 ${T.round} 场胜！下一场`, 1.6); this.nextFoe(); }
      else this.endTrial(true);
    }
    document.getElementById('tribBar').textContent = `${{ join: '入门试炼', promote: '晋升试炼', tourney: '宗门大比' }[T.kind]} · 第 ${T.round}/${T.rounds} 场　${Math.ceil(T.t)}`;
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

  update(dt) {
    const g = this.g, P = g.player;
    this.updateTrial(dt);
    if (this.trial) document.body.classList.add('trib');
    this.updatePet(dt);
    // 回春术：脱战回血
    const M = P.mods;
    if (M.regen && !P.dead && !g.enemies.list.some((e) => e.state !== 'idle' && e.pos.distanceTo(P.pos) < 15)) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * M.regen * dt);
    for (const s of this.list) {
      if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) > 80) continue;
      s.elder.root.rotation.y = 0; animChibi(s.elder, dt, { move: 0, attack: -1, cast: 0 });
      for (const dsc of s.disciples) { dsc.t += dt; dsc.c.root.rotation.y = Math.PI; animChibi(dsc.c, dt, { move: 0, attack: (dsc.t % 1.6) / 1.6 < 0.4 ? (dsc.t % 1.6) / 0.64 : -1, cast: 0 }); }
    }
  }
  save() { return { member: this.member, learned: [...this.learned], traitor: [...this.traitor], alumni: [...this.alumni], tourney: this.tourneyDay }; }
  load(s) {
    this.member = s.member; this.learned = new Set(s.learned); this.traitor = new Set(s.traitor); this.alumni = new Set(s.alumni); this.tourneyDay = s.tourney ?? -1;
    this.recalc();
  }
}
