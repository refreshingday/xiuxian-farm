// 境界、灵根、神识、天劫（GDD 第 5 / 11 / 4 节）。
// 等级 L：炼气 1–9 层（L 1–9），之后筑基 / 金丹 / 元婴 / 化神各分初期、中期、后期、圆满（L 10–25），渡劫 L 26。
// 小境界只要修为够就自动突破；大境界要在圆满后服破境丹、渡过天劫。
// 灵根：每条只有品级（凡 20 / 良 45 / 上 80 / 极 150），修炼倍率 = 1 + 2 × (1 − e^(−S/300))，S = 已激活灵根值之和。
// 异灵根（雷冰风暗）要先有两条前置五行灵根才激活。每种灵根带一个生活被动。
import { VILLAGE_R } from './world.js';
import { ITEMS, itemName } from './items.js';
import { near } from './life.js';
import { btn, el } from './ui.js';

const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const REALMS = ['炼气', '筑基', '金丹', '元婴', '化神', '渡劫'];
const STAGE = ['初期', '中期', '后期', '圆满'];
export const MAX_L = 26;
export const ROOT_VAL = [20, 45, 80, 150], ROOT_GRADE = ['凡品', '良品', '上品', '极品'];
export const ROOT_NEED = { 冰: ['金', '水'], 风: ['水', '木'], 雷: ['木', '火'], 暗: ['土', '金'] };
export const ROOT_LIFE = { 金: '采矿产量更多', 木: '作物长得更快', 水: '浇水范围更大', 火: '炼丹火候更宽', 土: '灵草少耗灵气', 雷: '雨天修炼加速', 冰: '作物不怕冬天', 风: '移动更快', 暗: '夜里看得更清' };
// 突破到这个大境界时天劫新增的机制（GDD 表）
const TRIB = { 1: ['bolt'], 2: ['bolt', 'beast'], 3: ['bolt', 'beast', 'mirror'], 4: ['bolt', 'beast', 'mirror', 'fire'], 5: ['bolt', 'beast', 'mirror', 'fire'] };
const UNLOCK = { 1: '御剑飞行（G）· 可以拜入大宗、结道侣', 2: '二阶炼丹、法宝制作', 3: '分身技能、天外陨铁矿', 4: '可以登天劫峰', 5: '最终天劫已过 —— 问道长生' };

export function levelInfo(L) {
  if (L <= 9) return { realm: 0, stage: L, name: `炼气${NUM[L - 1]}层`, top: L === 9 };
  if (L >= MAX_L) return { realm: 5, stage: 0, name: '渡劫', top: true, end: true };
  const k = L - 10, r = 1 + Math.floor(k / 4), s = k % 4;
  return { realm: r, stage: s, name: REALMS[r] + STAGE[s], top: s === 3 };
}
// 修为需求：时长分配约 炼气 3h / 筑基 7h / 金丹 9h / 元婴 11h / 化神 10h（GDD 第 5 节）
export const xpNeed = (L) => Math.round(40 * 1.24 ** (L - 1) + 30 * L);

export class Realm {
  constructor(g) {
    this.g = g;
    this.trib = null; this.dark = 0; this.cool = 0; this.fly = false;
    this.senseMax = 0; this.scanT = 0;
    const P = g.player;
    P.roots = P.roots || [{ e: '金', grade: 0 }];
    P.hpBonus = P.hpBonus || 0; P.sense = 0; P.karma = P.karma || 0; P.stolen = P.stolen || [];
    for (const e of ['金', '木', '水', '火', '土', '雷', '冰', '风', '暗']) ITEMS['root_' + e].use = () => this.acquireRoot(e);
    ITEMS.pill_purify.use = () => { if (!P.karma) { g.toast('你心中没有戾气', 1.4); return false; } g.inv.take('pill_purify'); this.addKarma(-50); g.toast(`洗去戾气，业力 ${P.karma}`, 2); return true; };
    for (const k of ['pill_break', 'pill_break2', 'pill_break3', 'pill_break4', 'pill_break5']) ITEMS[k].use = () => this.tryBreak(k);
    ITEMS.pill_avert.use = () => this.takeAvert();
    g.rootMul = () => this.mul();
    g.rootPassive = (e) => this.passive(e);
    g.sense = () => this.senseMax;
    this.recalc(true);
  }
  get info() { return levelInfo(this.g.player.layer); }
  sfx(f) { const s = this.g.sfx; if (s?.ok) f(s); } // 音频没解锁时不出声

  // ---------- 灵根 ----------
  active() {
    const R = this.g.player.roots, has = (e) => R.some((r) => r.e === e);
    return R.filter((r) => !ROOT_NEED[r.e] || ROOT_NEED[r.e].every(has));
  }
  mul() { const S = this.active().reduce((s, r) => s + ROOT_VAL[r.grade], 0); return 1 + 2 * (1 - Math.exp(-S / 300)); }
  // 生活被动强度：没有这条灵根 0，凡品 0.1 … 极品 0.4
  passive(e) { const r = this.active().find((x) => x.e === e); return r ? 0.1 * (r.grade + 1) : 0; }
  rootText() { return this.g.player.roots.map((r) => `${r.e}·${ROOT_GRADE[r.grade]}${this.active().includes(r) ? '' : '（未激活）'}`).join(' ') + `　修炼 ×${this.mul().toFixed(2)}`; }

  // ---------- 灵根：机缘、提升品级、夺取 / 归还、业力 ----------
  acquireRoot(e) {
    const g = this.g, P = g.player;
    if (P.roots.some((r) => r.e === e)) { g.toast(`已经有${e}灵根了`, 1.6); return false; }
    g.inv.take('root_' + e);
    P.roots.push({ e, grade: ROOT_NEED[e] ? 3 : 0 }); // 异灵根固定极品（GDD）
    this.recalc();
    g.fx.burst(P.pos, '#ffe7a8', 60, { speed: 3, up: 7, life: 1.4, grav: -2 });
    g.toast(`长出了一条${e}灵根！${ROOT_NEED[e] && !this.active().some((r) => r.e === e) ? `
（要先有${ROOT_NEED[e].join('、')}灵根才会激活）` : ''}
修炼倍率 ×${this.mul().toFixed(2)}`, 4);
    return true;
  }
  // 提升品级：淬灵丹 + 本圈的该元素天材地宝（凡→良 筑基圈、良→上 金丹圈、上→极 元婴圈）；鬼市里可以用修为代替天材地宝
  upgradeRoot(r, ghost) {
    const g = this.g, P = g.player, inv = g.inv, tc = `tc_${r.e}_${r.grade + 1}`, cost = this.xpCost(r);
    const pill = ['pill_root+2', 'pill_root+1', 'pill_root'].find((k) => inv.count(k));
    if (r.grade >= 3 || ROOT_NEED[r.e]) return;
    if (!pill) return g.toast('需要一颗淬灵丹', 1.6);
    if (ghost) { if (P.xp < cost) return g.toast('修为不够', 1.6); P.xp -= cost; }
    else { if (!inv.count(tc)) return g.toast(`需要${itemName(tc)}`, 1.6); inv.take(tc); }
    inv.take(pill); r.grade++; this.recalc();
    g.fx.burst(P.pos, '#9ef0ff', 50, { speed: 3, up: 6, life: 1.2, grav: -2 });
    g.toast(`${r.e}灵根提升到${ROOT_GRADE[r.grade]}！修炼倍率 ×${this.mul().toFixed(2)}`, 3);
    g.ui.refresh();
  }
  xpCost(r) { return Math.round(xpNeed(this.g.player.layer) * 0.6 * (r.grade + 1)); }
  openRoots(ghost) {
    const g = this.g, P = g.player;
    g.ui.panel(ghost ? '鬼市 · 灵根洗炼' : '灵根', (body) => {
      const S = this.active().reduce((s, r) => s + ROOT_VAL[r.grade], 0);
      body.append(el('div', 'pmoney', `灵根总值 ${S}　修炼倍率 ×${this.mul().toFixed(2)}　业力 ${P.karma}`));
      for (const r of P.roots) {
        const act = this.active().includes(r), variant = !!ROOT_NEED[r.e], top = r.grade >= 3 || variant;
        const need = top ? '' : ghost ? `淬灵丹 + 修为 ${this.xpCost(r)}` : `淬灵丹 + ${itemName(`tc_${r.e}_${r.grade + 1}`)}`;
        body.append(g.ui.row(variant ? '✨' : '🌱', `${r.e}灵根 · ${ROOT_GRADE[r.grade]}${r.stolen ? ' <i>夺来的</i>' : ''}${act ? '' : ' <i>未激活</i>'}`,
          `生活被动：${ROOT_LIFE[r.e]}${variant ? `　前置：${ROOT_NEED[r.e].join(' + ')}` : ''}${need ? `　提升要：${need}` : ''}`,
          top ? [] : [btn('提升', () => this.upgradeRoot(r, ghost))]));
      }
      body.append(el('div', 'pempty', '新灵根靠机缘（秘境宝箱、鬼市），也能走邪修路线夺人灵根——夺来的保持原品级，代价是业力、正道敌视、天劫峰上多一只心魔。'));
    });
  }
  addKarma(n) {
    const g = this.g, P = g.player, before = P.karma;
    P.karma = Math.max(0, P.karma + n);
    if (n > 0) g.toast(`业力 +${n}（${P.karma}）`, 1.8);
    if (before < 100 && P.karma >= 100) { for (const v of g.village?.list || []) v.addAff(-30); g.toast('业力太重，村里人看你的眼神都变了……', 3); }
  }
  evil() { const s = this.g.sects; return s?.member?.name === '血魔宫' || [...(s?.learned || [])].some((t) => t.startsWith('xm')); }
  // 村民对话里的邪修选项：夺取灵根 / 归还灵根（GDD 第 9 / 11 节）
  rootChoices(v) {
    const g = this.g, P = g.player, out = [];
    if (v.robbed) {
      if (P.stolen.some((x) => x.id === v.d.id)) out.push({ label: '🙏 归还灵根（业力 −15）', fn: () => this.giveBack(v) });
    } else if (this.evil() && v.d.root && !v.d.hidden) out.push({ label: '🩸 夺取灵根（邪修 · 业力 +30）', fn: () => this.steal(v) });
    return out;
  }
  steal(v) {
    const g = this.g, P = g.player, { e, grade } = v.d.root;
    v.robbed = { e, grade, realm: v.d.realm }; v.d.root = null; v.d.realm = [0, 0]; v.aff = -200;
    // 记下这一夺改了什么，归还时原样退回：new 新长出一条 / upgrade 把自己的提了品级 / held 自己的更好，只是攥在手里
    const mine = P.roots.find((r) => r.e === e), rec = { id: v.d.id, e, grade, mode: 'held' };
    if (!mine) { P.roots.push({ e, grade, stolen: v.d.id }); rec.mode = 'new'; }
    else if (mine.grade < grade) { rec.mode = 'upgrade'; rec.prev = mine.grade; mine.grade = grade; mine.stolen = v.d.id; }
    P.stolen.push(rec);
    this.recalc(); this.addKarma(30);
    g.fx.burst(v.pos, '#ff2a3a', 40, { speed: 4, up: 4, life: 0.8 }); g.shake(0.5);
    g.ui.dialog({ name: v.name, line: '啊——！我的灵根……你、你这个魔头！', info: `夺得${e}灵根（${ROOT_GRADE[grade]}）。${v.name}成了凡人，从此敌视你。`, hint: '归还灵根，好感才会慢慢回升。' });
  }
  giveBack(v) {
    const g = this.g, P = g.player, rec = P.stolen.find((x) => x.id === v.d.id), r = P.roots.find((x) => x.stolen === v.d.id);
    if (rec?.mode === 'new' && r) P.roots.splice(P.roots.indexOf(r), 1);
    else if (rec?.mode === 'upgrade' && r) { r.grade = rec.prev; delete r.stolen; }
    v.d.root = { e: v.robbed.e, grade: v.robbed.grade }; v.d.realm = v.robbed.realm; v.robbed = null; v.aff = -100;
    P.stolen = P.stolen.filter((s) => s.id !== v.d.id);
    this.recalc(); this.addKarma(-15);
    g.ui.dialog({ name: v.name, line: '……灵根回来了。我不会原谅你，但……谢谢你还回来。', hint: '好感会随着送礼慢慢回升。' });
  }

  // 按等级重算属性（任务给的护甲等加成另算）
  recalc(full) {
    const P = this.g.player, L = P.layer, r = levelInfo(L).realm, M = P.mods || {};
    const hp = Math.round((100 + (L - 1) * 12 + r * 60 + P.hpBonus + (M.hp || 0)) * (1 + (M.hpPct || 0))), qi = 100 + (L - 1) * 8 + r * 40 + (M.qiMax || 0);
    if (full) { P.hp = hp; P.qi = qi; }
    P.hp = Math.min(P.hp + Math.max(0, hp - P.maxHp), hp); P.qi = Math.min(P.qi + Math.max(0, qi - P.maxQi), qi);
    P.maxHp = hp; P.maxQi = qi;
    this.senseMax = 20 + L * 8 + r * 20 + (M.sense || 0);
    P.sense = Math.min(P.sense || this.senseMax, this.senseMax);
  }
  // 修为：打坐、斩妖、服丹都走这里，乘灵根倍率；小境界自动突破，大境界卡在圆满
  addXP(n, p, quiet) {
    const g = this.g, P = g.player, fx = g.fx;
    if (levelInfo(P.layer).end) return;
    n *= this.mul() * (g.weatherToday === 'rain' ? 1 + this.passive('雷') * 2 : 1);
    if (levelInfo(P.layer).top && P.xp >= xpNeed(P.layer)) { if (!quiet) fx.num(p, '修为圆满', 'xp'); return; }
    P.xp += n;
    if (!quiet) fx.num({ x: p.x + 0.6, z: p.z }, `+${Math.round(n)} 修为`, 'xp');
    while (P.xp >= xpNeed(P.layer)) {
      if (levelInfo(P.layer).top) { P.xp = xpNeed(P.layer); g.toast(`${levelInfo(P.layer).name}！\n服下破境丹、渡过天劫，才能突破到${REALMS[levelInfo(P.layer).realm + 1]}`, 4); break; }
      P.xp -= xpNeed(P.layer); P.layer++;
      this.recalc(true);
      fx.burst(P.pos, '#9ef0ff', 50, { speed: 3, up: 6, life: 1.2, grav: -2 });
      fx.shockRing(P.pos.x, P.pos.z, 5, '#9ef0ff', 0.6);
      g.toast(`突破！${levelInfo(P.layer).name}`, 3);
      g.emit?.('layer', P.layer);
    }
  }

  // ---------- 神识：V 扫描周围的妖兽和野生灵草（耗神识，慢慢恢复）----------
  scan() {
    const g = this.g, P = g.player;
    const cost = 20 * (1 - (P.mods?.scanCost || 0));
    if (P.sense < cost) { g.toast('神识不足', 1.2); return; }
    P.sense -= cost; this.scanT = 10;
    g.fx.shockRing(P.pos.x, P.pos.z, 30, '#c8b8ff', 0.8);
    this.sfx((s) => s.chant(0));
  }

  // ---------- 天劫（GDD「天劫」）----------
  // 破境丹分档：突破到筑基用 pill_break，金丹 pill_break2 …… 渡劫 pill_break5
  tryBreak(used) {
    const g = this.g, P = g.player, I = levelInfo(P.layer), need = I.realm === 0 ? 'pill_break' : 'pill_break' + (I.realm + 1);
    if (this.trib) return false;
    if (used && used !== need) { g.toast(`这是${itemName(used)}，你现在要的是${itemName(need)}`, 2.5); return false; }
    if (!I.top || P.xp < xpNeed(P.layer)) { g.toast(`修为还没圆满（${I.name}），破境丹现在吃了也是浪费`, 2.5); return false; }
    if (this.cool > g.day) { g.toast(`上次渡劫失败，${this.cool - g.day + 1} 天内不能再渡`, 2.5); return false; }
    const home = g.life.atHome || near(P, g.life.home.door, 10) !== false;
    if (!home && Math.hypot(P.pos.x, P.pos.z) < VILLAGE_R + 6) { g.toast('村子里禁止渡劫（自家洞府除外）', 2.5); return false; }
    if (g.hubs?.at(P.pos)) { g.toast('坊市里禁止渡劫', 2.5); return false; }
    const id = [need + '+2', need + '+1', need].find((k) => g.inv.count(k));
    if (!id) { g.toast(`需要${itemName(need)}`, 2); return false; }
    g.inv.take(id);
    this.startTrib(home, id.endsWith('+2') ? 0.7 : id.endsWith('+1') ? 0.85 : 1);
    return true;
  }
  takeAvert() {
    const g = this.g; g.inv.take(g.inv.count('pill_avert+2') ? 'pill_avert+2' : g.inv.count('pill_avert+1') ? 'pill_avert+1' : 'pill_avert');
    g.player.avert = true; g.toast('服下避劫丹：这次天劫伤害减半', 2); return true;
  }
  startTrib(home, pillK) {
    const g = this.g, P = g.player, target = levelInfo(P.layer).realm + 1;
    this.trib = { t: -4, stage: 0, home, target, mech: TRIB[target], k: pillK * (P.avert ? 0.5 : 1) * (home ? 0.75 : 1) * (1 - (P.mods?.tribRes || 0)), next: 0, beastT: 6, fires: [], x: P.pos.x, z: P.pos.z };
    P.avert = false;
    g.toast(`劫云汇聚……\n${REALMS[target]}天劫将至${home ? '（洞府阵法护身）' : '（野外渡劫，会引来妖兽）'}`, 4);
    g.shake(0.6); this.sfx((s) => s.thunderCharge(1));
    document.body.classList.add('trib');
  }
  updateTrib(dt) {
    const T = this.trib, g = this.g, P = g.player;
    this.dark += ((T ? 1 : 0) - this.dark) * Math.min(1, dt * 1.5);
    if (!T) return;
    T.t += dt;
    const banner = document.getElementById('tribBar');
    if (T.t < 0) { banner.textContent = `劫云汇聚 ${Math.ceil(-T.t)}`; return; }
    const stage = Math.min(2, Math.floor(T.t / 30));
    if (stage !== T.stage) { T.stage = stage; g.toast(['第一重', '第二重', '第三重'][stage] + '天劫', 1.6); }
    banner.textContent = `${REALMS[T.target]}天劫 · ${['第一重', '第二重', '第三重'][stage]}　${Math.ceil(90 - T.t)}`;
    // 雷击：地面预警圈，追着人劈；越往后越密
    T.next -= dt;
    if (T.next <= 0) {
      T.next = [1.6, 1.15, 0.85][stage];
      const n = stage + 1;
      for (let i = 0; i < n; i++) {
        const lead = i === 0 ? 0.5 : 0, a = Math.random() * 6.28, r = i === 0 ? 0 : 2 + Math.random() * 4;
        this.bolt(P.pos.x + P.vel.x * lead + Math.cos(a) * r, P.pos.z + P.vel.z * lead + Math.sin(a) * r, 2 + stage * 0.4, 0.22 * T.k);
      }
    }
    // 劫兽 / 野外引来的妖兽
    if (T.mech.includes('beast') || !T.home) {
      T.beastT -= dt;
      if (T.beastT <= 0) {
        T.beastT = T.home ? 12 : 8;
        const a = Math.random() * 6.28, lvl = Math.max(1, Math.floor(Math.hypot(P.pos.x, P.pos.z) / 60));
        const e = g.enemies.spawn(T.mech.includes('beast') ? 'golem' : Math.random() < 0.5 ? 'boar' : 'spider', P.pos.x + Math.cos(a) * 12, P.pos.z + Math.sin(a) * 12, lvl + T.target);
        e.state = 'chase'; e.trib = true;
      }
    }
    // 心魔（元婴起）：每一重劫来一只，夺过的灵根越多越多
    if (T.mech.includes('mirror') && !T.demons?.[stage]) {
      (T.demons ??= {})[stage] = true;
      const n = 1 + (P.stolen?.length || 0);
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = g.enemies.spawn('heartdemon', P.pos.x + Math.cos(a) * 8, P.pos.z + Math.sin(a) * 8, T.target * 5); e.state = 'chase'; e.trib = true; }
      g.toast('心魔现身……', 1.6);
    }
    // 天火：地上持续燃烧的圈（化神起）
    if (T.mech.includes('fire') && Math.random() < dt * 0.5) {
      const x = P.pos.x + (Math.random() - 0.5) * 10, z = P.pos.z + (Math.random() - 0.5) * 10;
      g.fx.circle(x, z, 2.2, 1.2, () => T.fires.push({ x, z, t: 6 }));
    }
    for (let i = T.fires.length - 1; i >= 0; i--) {
      const f = T.fires[i]; f.t -= dt;
      if (Math.random() < 0.6) g.fx.mote(f.x + (Math.random() - 0.5) * 3, 0.3, f.z + (Math.random() - 0.5) * 3, '#ff7a2a', { vy: 2, life: 0.6, size: 1.2 });
      if (Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < 2.2 && P.iframe <= 0) P.hurt(P.maxHp * 0.06 * T.k, f.x, f.z, 2);
      if (f.t <= 0) T.fires.splice(i, 1);
    }
    if (T.t >= 90) this.passTrib();
  }
  bolt(x, z, r, k) {
    const g = this.g, P = g.player;
    g.fx.circle(x, z, r, 1.1, () => {
      if (!this.trib) return;
      g.cfx?.bolt(x, z, '#d8c8ff', 18); g.cfx?.flash(x, z, '#c8b8ff', 45, 0.3, 3);
      g.fx.shockRing(x, z, r + 0.4, '#c8a8ff', 0.35); g.fx.burst({ x, z }, '#e8e0ff', 16, { speed: 6, up: 5, life: 0.4, y: 0.3 });
      g.shake(0.5); this.sfx((s) => s.thunderClap());
      if (Math.hypot(P.pos.x - x, P.pos.z - z) < r + P.r) P.hurt(P.maxHp * k, x, z, 6);
      for (const e of [...g.enemies.list]) if (Math.hypot(e.pos.x - x, e.pos.z - z) < r + e.r) g.enemies.damage(e, 80, x, z, 8);
    });
  }
  passTrib() {
    const g = this.g, P = g.player, T = this.trib;
    this.endTrib();
    P.layer++; P.xp = 0;
    this.recalc(true);
    g.fx.burst(P.pos, '#ffe7a8', 120, { speed: 6, up: 10, life: 1.6, grav: -2 });
    g.fx.shockRing(P.pos.x, P.pos.z, 12, '#ffe7a8', 1);
    g.emit?.('layer', P.layer); g.emit?.('breakthrough', T.target);
    if (!T.home) { g.addStones(10 + T.target * 5, P.pos); g.addItem('yaodan', 3, P.pos); }
    g.ui.dialog({ narrate: true, lines: ['雷云散去，天光倾泻而下。', `你突破到了「${levelInfo(P.layer).name}」！`], info: '解锁：' + UNLOCK[T.target], hint: T.home ? '' : '野外渡劫，额外得到灵石和妖丹。' });
    g.save?.();
  }
  // GDD：失败时修为退回圆满前一点，3 天内不能再渡，破境丹作废
  failTrib() {
    const g = this.g, P = g.player;
    this.endTrib();
    P.hp = Math.round(P.maxHp * 0.3); P.iframe = 2;
    P.xp = Math.floor(xpNeed(P.layer) * 0.9);
    this.cool = g.day + 3;
    g.ui.dialog({ narrate: true, lines: ['一道天雷劈下，你眼前一黑……', '醒来时劫云已散，经脉里的灵力乱成一团。'], info: '渡劫失败：修为退回圆满之前，3 天内不能再渡，破境丹作废。', hint: '下次试试：服避劫丹、在自家洞府渡劫、用闪避躲开雷击预警圈。' });
  }
  endTrib() {
    for (const e of [...this.g.enemies.list]) if (e.trib) this.g.enemies.remove(e);
    this.trib = null; document.body.classList.remove('trib');
  }

  // ---------- 御剑飞行（筑基起，G 开关；飞行中耗灵力、不能出招）----------
  toggleFly() {
    const g = this.g, P = g.player;
    if (levelInfo(P.layer).realm < 1) { g.toast('筑基之后才能御剑飞行', 1.5); return; }
    this.fly = !this.fly && P.qi > 10;
    g.toast(this.fly ? '御剑飞行' : '落地', 1);
    this.sfx((s) => s.leap(0.2));
  }

  update(dt) {
    const g = this.g, P = g.player;
    P.sense = Math.min(this.senseMax, P.sense + dt * 1.5);
    this.scanT -= dt;
    if (this.fly) { P.qi -= dt * 3 * (1 - (P.mods?.flyQi || 0)); if (P.qi <= 0) { P.qi = 0; this.fly = false; g.toast('灵力耗尽，落地', 1.2); } }
    this.updateTrib(dt);
  }
  save() { const P = this.g.player; return { roots: P.roots, hpBonus: P.hpBonus, cool: this.cool, karma: P.karma, stolen: P.stolen }; }
  load(s) { const P = this.g.player; P.roots = s.roots; P.hpBonus = s.hpBonus || 0; this.cool = s.cool || 0; P.karma = s.karma || 0; P.stolen = s.stolen || []; this.recalc(false); }
}
