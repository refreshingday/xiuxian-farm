// 任务（GDD 第 3 节「第一个小时」主线教学、第 7 节任务模板、第 9 节村民个人任务）。数据在 data/quests.json。
// 进度靠事件推进：g.emit('kill' | 'harvest' | 'plant' | 'water' | 'soilQi' | 'craft' | 'talk', …)；
// have（交物品）、layer（修为）随时按背包 / 境界算；reach 按位置算。
// 主线完成就结算，云鹤传音接下一步；村民委托要回去找委托人交付；委托板上的活在委托板交。
import { item, itemName, CROPS } from './items.js';
import { TYPES } from './enemies.js';
import { near } from './life.js';
import { btn, el } from './ui.js';
import { screenOf } from './hpbar.js';

const BOARD_MAX = 4, BOARD_DAYS = 4;
const rint = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ENEMY = (t) => (t === 'wolfking' ? '赤枫狼王' : TYPES[t]?.name || t);

export async function loadQuestData() { return (await fetch('data/quests.json')).json(); }

export class Quests {
  constructor(g, data) {
    this.g = g; this.data = data;
    this.defs = {}; for (const q of [...data.story, ...data.personal]) this.defs[q.id] = q;
    this.active = [];  // { id, def, prog, from: story | personal | board, exp }
    this.done = new Set(); this.flags = new Set();
    this.board = [];   // 委托板上还没接的：{ id, def, exp }
    this.seq = 0; this.t = 0;
    const bump = (type, test) => {
      for (const q of this.active) q.def.goals.forEach((go, i) => { if (go.type === type && test(go)) q.prog[i] = (q.prog[i] || 0) + 1; });
      this.dirty = true;
    };
    g.on('kill', (e) => bump('kill', (go) => go.target === e.type));
    g.on('harvest', (id) => bump('harvest', (go) => !go.item || go.item === id || go.item === item(id)?.base));
    g.on('plant', (crop) => bump('plant', (go) => !go.kind || CROPS[crop]?.kind === go.kind));
    g.on('water', () => bump('water', () => true));
    g.on('soilQi', () => bump('soilQi', () => true));
    g.on('craft', (id) => bump('craft', (go) => !go.item || go.item === id));
    g.on('talk', (v) => bump('talk', (go) => go.who === v.d.id));
    g.village.quests = (v) => this.choicesFor(v);
    g.life.on((P) => near(P, g.world.board, 1.9) && { label: '委托板', act: () => this.openBoard(), d: 1 });
    g.life.dayHooks.push(() => this.newDay());
    this.marks = new Map();
    this.layer = document.getElementById('markLayer');
    this.track = document.getElementById('qtrack');
    this.track.addEventListener('click', () => this.openLog());
  }

  // ---------- 进度 ----------
  cur(q, i) {
    const go = q.def.goals[i], g = this.g;
    if (go.type === 'have') return Math.min(go.n, g.inv.count(go.item));
    if (go.type === 'layer') return Math.min(go.n, g.player.layer);
    return Math.min(go.n, q.prog[i] || 0);
  }
  complete(q) { return q.def.goals.every((go, i) => this.cur(q, i) >= go.n); }
  goalText(go) {
    if (go.text) return go.text;
    return {
      kill: `击杀${ENEMY(go.target)}`, have: `交付 ${itemName(go.item)}`, harvest: `收获${go.item ? itemName(go.item) : ''}`,
      plant: '播种', water: '浇水', soilQi: '补灵气', craft: `炼成${go.item ? itemName(go.item) : '丹药'}`, talk: '交谈', layer: `修为到炼气${go.n}层`, reach: '前往',
    }[go.type] || go.type;
  }
  // 奖励说明
  describe(r = {}) {
    const out = [];
    if (r.money) out.push(`${r.money} 文`);
    if (r.stones) out.push(`${r.stones} 灵石`);
    if (r.xp) out.push(`修为 +${r.xp}`);
    for (const [id, n] of Object.entries(r.items || {})) out.push(`${itemName(id)}×${n}`);
    if (r.atk) out.push(`攻击 +${Math.round(r.atk * 100)}%`);
    if (r.hp) out.push(`气血上限 +${r.hp}`);
    if (r.recipe) out.push(`丹方·${itemName(r.recipe)}`);
    if (r.contrib) out.push(`宗门贡献 ${r.contrib}`);
    if (r.sect) out.push(`${r.sect[0]}好感 ${r.sect[1]}`);
    for (const id of Object.keys(r.aff || {})) out.push(`${this.g.village.byId[id]?.name || id} 好感`);
    return out.join(' · ') || '——';
  }
  give(r = {}) {
    const g = this.g, P = g.player;
    if (r.money) g.inv.money += r.money;
    if (r.stones) g.inv.stones += r.stones;
    if (r.xp) g.addXP(r.xp, P.pos);
    for (const [id, n] of Object.entries(r.items || {})) g.inv.add(id, n);
    for (const [id, n] of Object.entries(r.aff || {})) g.village.byId[id]?.addAff(n);
    if (r.atk) P.atkBonus += r.atk;
    if (r.hp) { P.hpBonus += r.hp; g.realm.recalc(); P.hp += r.hp; }
    if (r.recipe) g.alchemy.learn(r.recipe, true);
    if (r.flag) this.flags.add(r.flag);
    if (r.contrib) g.sects?.addContrib(r.contrib);
    if (r.sect) g.sects?.commission(...r.sect);
  }

  // ---------- 接 / 交 ----------
  accept(id, from = 'personal', def = this.defs[id], exp) {
    const g = this.g, P = g.player, q = { id, def, prog: def.goals.map(() => 0), from, exp };
    this.active.push(q);
    if (def.startReward) this.give(def.startReward);
    for (const [type, dx, dz] of def.spawn || []) { const e = g.enemies.spawn(type, P.pos.x + dx, P.pos.z + dz, 0); e.state = 'chase'; }
    g.toast(`新任务：${def.title}`, 2);
    if (def.job) g.jobs?.start(q);
    this.dirty = true;
    return q;
  }
  finish(q) {
    const g = this.g, d = q.def;
    if (!this.complete(q)) return;
    for (const go of d.goals) if (go.type === 'have') g.inv.take(go.item, go.n);
    this.active.splice(this.active.indexOf(q), 1);
    if (q.from !== 'board') this.done.add(d.id);
    this.give(d.reward);
    g.sfx?.respawn?.();
    const next = d.next && this.defs[d.next];
    if (next) this.accept(next.id, 'story');
    const v = g.village.byId[d.giver], far = q.from === 'story' && v && v.pos.distanceTo(g.player.pos) > 6;
    g.ui.dialog({
      name: q.from === 'board' ? '委托板' : (v?.name || d.giverName || '') + (far ? '（传音）' : ''), narrate: q.from === 'board',
      lines: q.from === 'board' ? [`委托完成：${d.title}`] : [...(d.done || ['多谢！']), ...(next?.start || [])],
      info: `完成「${d.title}」· 获得 ${this.describe(d.reward)}`, hint: next ? `新任务：${next.title} —— ${next.desc}` : '',
    });
    this.dirty = true;
  }
  // 村民对话里的委托选项
  choicesFor(v) {
    const out = [];
    for (const q of this.active) if (q.from === 'personal' && q.def.giver === v.d.id && this.complete(q)) out.push({ label: `✅ 交付：${q.def.title}`, fn: () => this.finish(q) });
    for (const d of this.data.personal) if (d.giver === v.d.id && this.available(d, v)) out.push({ label: `❗ 委托：${d.title}`, fn: () => this.offer(d, v) });
    return out;
  }
  available(d, v) {
    if (this.done.has(d.id) || this.active.some((q) => q.id === d.id)) return false;
    const n = d.need || {};
    return !(n.hearts && v.hearts < n.hearts) && !(n.done && !this.done.has(n.done)) && !(n.flag && !this.flags.has(n.flag)) && !(n.layer && this.g.player.layer < n.layer);
  }
  offer(d, v) {
    this.g.ui.dialog({
      name: v.name, sub: `委托 · ${d.title}`, lines: d.start || [d.desc], info: d.desc, hint: '奖励：' + this.describe(d.reward),
      choices: [{ label: '接下', fn: () => this.accept(d.id, 'personal') }, { label: '再想想' }],
    });
  }

  // ---------- 委托板（GDD 任务模板：讨伐令 / 收购 / 求购，按模板 × 敌人 × 奖励表批量生成；
  // 护送 / 守护 / 寻踪 / 异象 / 切磋 / 精英讨伐 带词缀，在 jobs.js）----------
  genBoard() {
    const B = this.data.board, g = this.g, kind = pick(['kill', 'kill', 'fetch', 'crop', 'escort', 'guard', 'track', 'omen', 'duel', 'hunt']);
    const who = pick(g.village.list.filter((v) => !['mentor', 'wanderer'].includes(v.d.id)));
    const job = !['kill', 'fetch', 'crop'].includes(kind) && g.jobs?.gen(kind, who);
    if (job) return { id: 'b' + ++this.seq, ...job };
    const season = Math.floor((g.day - 1) / 14) % 4, crops = Object.values(CROPS).filter((c) => c.kind === 'crop' && c.seasons.includes(season));
    let goal, pay, title, name;
    if (kind === 'kill' || !['fetch', 'crop'].includes(kind)) {
      const t = pick(B.kill), n = rint(t.n); name = t.name;
      goal = { type: 'kill', target: t.target, n }; pay = t.pay * n; title = `讨伐令 · ${t.name}×${n}${t.where ? `（${t.where}）` : ''}`;
    } else if (kind === 'crop' && crops.length) {
      const c = pick(crops), n = rint(B.crop.n); name = c.name;
      goal = { type: 'have', item: c.id, n }; pay = Math.round(c.sell * n * 1.6); title = `求购 · ${c.name}×${n}`;
    } else {
      const t = pick(B.fetch), n = rint(t.n); name = itemName(t.item);
      goal = { type: 'have', item: t.item, n }; pay = Math.round(item(t.item).sell * n * 1.8); title = `收购 · ${name}×${n}`;
    }
    const k = goal.type === 'kill' ? 'kill' : kind === 'crop' && crops.length ? 'crop' : 'fetch';
    const desc = pick(B.flavor[k]).replace('{who}', who.name).replace('{name}', name).replace('{item}', name);
    return { id: 'b' + ++this.seq, def: { title, desc, goals: [goal], reward: { money: pay, aff: { [who.d.id]: 15 } }, giver: 'board' }, exp: g.day + BOARD_DAYS };
  }
  newDay() {
    const day = this.g.day;
    this.board = this.board.filter((b) => b.exp >= day);
    let lost = 0;
    for (const q of [...this.active]) if ((q.from === 'board' || q.from === 'sect') && q.exp < day) { this.active.splice(this.active.indexOf(q), 1); lost++; }
    const n = BOARD_MAX - this.board.length;
    for (let i = 0; i < n; i++) this.board.push(this.genBoard());
    this.dirty = true;
    return [n ? `委托板来了 ${n} 张新委托` : '', lost ? `${lost} 个委托过期了` : ''].filter(Boolean).join('，');
  }
  openBoard() {
    const g = this.g;
    g.ui.panel('委托板', (body) => {
      const mine = this.active.filter((q) => q.from === 'board');
      if (mine.length) body.append(el('div', 'pcat', '已接'));
      for (const q of mine) {
        const ok = this.complete(q);
        body.append(g.ui.row('📜', `${q.def.title} <i>${q.exp - g.day + 1} 天内</i>`, `${q.def.desc}　${this.progText(q)}　奖励 ${this.describe(q.def.reward)}`,
          [btn(ok ? '交付' : '进行中', () => { if (ok) { g.ui.closePanel(); this.finish(q); } }, ok ? '' : 'off')]));
      }
      body.append(el('div', 'pcat', '可接'));
      if (!this.board.length) body.append(el('div', 'pempty', '今天的委托都被接走了，明天再来看看。'));
      for (const b of this.board) {
        body.append(g.ui.row('📄', `${b.def.title} <i>${b.exp - g.day + 1} 天内</i>`, `${b.def.desc}　奖励 ${this.describe(b.def.reward)}`,
          [btn('接下', () => { this.board.splice(this.board.indexOf(b), 1); this.accept(b.id, 'board', b.def, b.exp); g.ui.refresh(); })]));
      }
    });
  }
  count(q, i) { const go = q.def.goals[i]; return go.type === 'job' ? '' : ` ${this.cur(q, i)}/${go.n}`; }
  progText(q) { return q.def.goals.map((go, i) => this.goalText(go) + this.count(q, i)).join('，'); }
  openLog() {
    const g = this.g;
    g.ui.panel('任务', (body) => {
      if (!this.active.length) body.append(el('div', 'pempty', '没有进行中的任务。村民头上有 ❗ 的可以接委托，委托板每天也会有新活。'));
      for (const q of this.active) {
        const tag = { story: '主线', personal: '委托', board: '委托板', sect: '宗门' }[q.from];
        body.append(g.ui.row(this.complete(q) ? '✅' : '📜', `${q.def.title} <i>${tag}</i>`, `${q.def.desc}<br>${this.progText(q)}<br>奖励：${this.describe(q.def.reward)}`));
      }
    });
  }

  // ---------- 每帧：reach 判定、主线结算、追踪栏、头顶标记 ----------
  update(dt) {
    const g = this.g, P = g.player;
    this.t -= dt;
    for (const q of this.active) q.def.goals.forEach((go, i) => { if (go.type === 'reach' && !q.prog[i] && near(P, go, go.r || 6) !== false) { q.prog[i] = 1; this.dirty = true; } });
    if (!g.ui.blocking && !g.paused) for (const q of this.active) if (q.from === 'story' && this.complete(q)) { this.finish(q); break; }
    if (this.t <= 0 || this.dirty) { this.t = 0.3; this.dirty = false; this.renderTrack(); }
    this.placeMarks();
  }
  renderTrack() {
    const list = [...this.active].sort((a, b) => (a.from === 'story' ? -1 : 0) - (b.from === 'story' ? -1 : 0)).slice(0, 3);
    this.track.innerHTML = list.map((q) => `<div class="qt${this.complete(q) ? ' ok' : ''}"><b>${q.from === 'story' ? '◆ ' : ''}${q.def.title}</b>${q.def.goals.map((go, i) => `<span>${this.goalText(go)}${this.count(q, i)}</span>`).join('')}${this.complete(q) && q.from !== 'story' ? `<span class="hint">${q.from === 'board' ? '回委托板交付' : q.from === 'sect' ? '回宗门找执事交付' : '回去找' + (this.g.village.byId[q.def.giver]?.name || '') + '交付'}</span>` : ''}</div>`).join('');
    this.track.hidden = !list.length;
  }
  // 任务指向（头顶 📍、小地图、屏幕边缘箭头共用）：没做完的目的地（reach / 委托坐标、要交谈的人、要打的妖王巢穴）
  // + 做完了该回去交付的人 / 委托板。主线排前面。
  targets() {
    const g = this.g, out = [];
    const list = [...this.active].sort((a, b) => (a.from === 'story' ? -1 : 0) - (b.from === 'story' ? -1 : 0));
    for (const q of list) {
      const story = q.from === 'story', title = q.def.title;
      if (this.complete(q)) {
        if (story) continue;
        const v = q.from === 'personal' ? g.village.byId[q.def.giver] : null;
        const p = q.from === 'board' ? g.world.board : v && !v.away ? v.pos : null;
        if (p) out.push({ x: p.x, z: p.z, ic: '❓', story, title });
        continue;
      }
      q.def.goals.forEach((go, i) => {
        if (this.cur(q, i) >= go.n) return;
        let p = go.x != null ? go : null;
        if (!p && go.type === 'talk') { const v = g.village.byId[go.who]; if (v && !v.away) p = v.pos; }
        if (!p && go.type === 'kill') p = g.enemies.lairs.find((l) => l.type === go.target);
        if (p) out.push({ x: p.x, z: p.z, ic: '📍', story, title });
      });
    }
    return out;
  }
  // 村民头上：❗ 有委托可接，❓ 有委托可交；委托板同理；主线 reach 目标 📍
  placeMarks() {
    const g = this.g, want = new Map();
    for (const v of g.village.list) {
      if (v.away) continue;
      const done = this.active.some((q) => q.from === 'personal' && q.def.giver === v.d.id && this.complete(q));
      const avail = !done && this.data.personal.some((d) => d.giver === v.d.id && this.available(d, v));
      if (done || avail) want.set(v.d.id, [done ? '❓' : '❗', v.pos.x, 2.6, v.pos.z]);
    }
    const bd = g.world.board, boardDone = this.active.some((q) => q.from === 'board' && this.complete(q));
    if (boardDone || this.board.length) want.set('board', [boardDone ? '❓' : '❗', bd.x, 3, bd.z - 1.2]);
    this.tgt = this.targets();
    this.tgt.forEach((t, i) => { if (t.ic === '📍') want.set('t' + i, ['📍', t.x, 3, t.z]); });
    this.pins = [...want.values()].filter((m) => m[0] !== '📍').map(([ic, x, , z]) => ({ ic, x, z }));
    for (const [k, m] of this.marks) if (!want.has(k)) { m.remove(); this.marks.delete(k); }
    for (const [k, [ic, x, y, z]] of want) {
      let m = this.marks.get(k);
      if (!m) { m = el('div', 'qmark'); this.layer.append(m); this.marks.set(k, m); }
      m.textContent = ic;
      const [sx, sy, front] = screenOf(g.camera, x, y + Math.sin(g.time * 3) * 0.12, z);
      m.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      m.style.visibility = front ? '' : 'hidden';
    }
  }

  save() {
    return { active: this.active.map((q) => ({ id: q.id, prog: q.prog, from: q.from, exp: q.exp, def: q.from === 'board' || q.from === 'sect' ? q.def : undefined })), done: [...this.done], flags: [...this.flags], board: this.board, seq: this.seq };
  }
  load(s) {
    this.active = s.active.map((q) => ({ ...q, def: q.def || this.defs[q.id] })).filter((q) => q.def);
    this.done = new Set(s.done); this.flags = new Set(s.flags); this.board = s.board || []; this.seq = s.seq || 0;
    this.dirty = true;
  }
}
