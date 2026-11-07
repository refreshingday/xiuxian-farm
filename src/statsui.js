// 属性面板（I 键 / 菜单「📊 属性」）和突破时的庆祝：光柱、灵气环、金色横幅 + 突破前后对比。
// 数值都来自 stats.js 的 derive()；这里只管怎么摆、怎么让人看清楚「加了什么」。
import { STATS, STAT_KEYS, derive, freePts, capPts, autoPts, totalPts, spentPts, spreadLike, evenSpread, emptyAlloc, fmtNum, fmtMul } from './stats.js';
import { DASH_CD } from './combat.js';

const CSS = `
#stPanel { display: flex; flex-direction: column; gap: 10px; }
#stPanel .st-head { position: relative; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 10px;
  background: radial-gradient(120% 140% at 0% 0%, rgba(255,214,120,.18), rgba(0,0,0,0) 60%), rgba(0,0,0,.28); border: 1px solid rgba(214,182,112,.35); }
#stPanel .st-realm { font-family: "STKaiti","KaiTi",serif; font-size: 24px; letter-spacing: 3px; color: #ffe7a8; text-shadow: 0 0 12px rgba(255,200,100,.35); }
#stPanel .st-sub { font-size: 12px; opacity: .7; margin-top: 2px; }
#stPanel .st-left { margin-left: auto; text-align: center; min-width: 86px; padding: 6px 10px; border-radius: 10px; border: 1px solid rgba(214,182,112,.35); background: rgba(0,0,0,.25); }
#stPanel .st-left b { display: block; font-size: 26px; line-height: 1.1; color: #ffe7a8; font-family: "STKaiti","KaiTi",serif; }
#stPanel .st-left small { font-size: 11px; opacity: .75; }
#stPanel .st-left.on { border-color: #ffd36a; box-shadow: 0 0 0 1px rgba(255,211,106,.4), 0 0 18px rgba(255,190,80,.45); animation: stPulse 1.6s ease-in-out infinite; }
@keyframes stPulse { 50% { box-shadow: 0 0 0 1px rgba(255,211,106,.7), 0 0 28px rgba(255,190,80,.75); } }
#stPanel .st-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 560px) { #stPanel .st-grid { grid-template-columns: 1fr; } }
#stPanel .st-card { --c: #ffd27a; position: relative; padding: 10px 12px 10px; border-radius: 10px; overflow: hidden;
  background: linear-gradient(160deg, color-mix(in srgb, var(--c) 16%, transparent), rgba(0,0,0,.25) 55%); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); }
#stPanel .st-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); box-shadow: 0 0 10px var(--c); }
#stPanel .st-top { display: flex; align-items: baseline; gap: 8px; }
#stPanel .st-ic { font-size: 20px; }
#stPanel .st-nm { font-family: "STKaiti","KaiTi",serif; font-size: 20px; letter-spacing: 2px; color: color-mix(in srgb, var(--c) 55%, #fff); }
#stPanel .st-pts { margin-left: auto; font-size: 12px; opacity: .85; white-space: nowrap; }
#stPanel .st-pts b { font-size: 18px; color: #fff; }
#stPanel .st-desc { font-size: 11px; opacity: .6; margin: 2px 0 6px; }
#stPanel .st-bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; margin-bottom: 7px; }
#stPanel .st-bar i { display: block; height: 100%; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 60%, #000), var(--c)); box-shadow: 0 0 8px var(--c); }
#stPanel .st-fx { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 13px; }
#stPanel .st-fx span:nth-child(odd) { opacity: .8; }
#stPanel .st-fx span:nth-child(even) { text-align: right; font-weight: bold; }
#stPanel .st-fx em { font-style: normal; font-weight: normal; font-size: 11px; color: #8dff9a; margin-left: 4px; }
#stPanel .st-btns { display: flex; gap: 6px; margin-top: 8px; }
#stPanel .st-btns button { flex: 1; padding: 5px 0 !important; }
#stPanel .st-btns button.plus { border-color: color-mix(in srgb, var(--c) 70%, transparent) !important; background: color-mix(in srgb, var(--c) 18%, rgba(0,0,0,.3)) !important; }
#stPanel .st-btns button.off { opacity: .3; pointer-events: none; }
#stPanel .st-foot { display: flex; gap: 8px; flex-wrap: wrap; }
#stPanel .st-foot button { flex: 1; }
#stPanel .st-note { font-size: 11px; opacity: .55; line-height: 1.6; }

#bkBanner { position: fixed; left: 50%; top: 5%; z-index: 25; transform: translateX(-50%); width: min(440px, calc(100vw - 32px)); text-align: center;
  pointer-events: none; opacity: 0; transition: opacity .35s; }
#bkBanner.show { opacity: 1; pointer-events: auto; }
#bkBanner .bk-rays { position: absolute; left: 50%; top: 34px; width: 360px; height: 360px; margin: -180px 0 0 -180px; border-radius: 50%; pointer-events: none;
  background: repeating-conic-gradient(from 0deg, rgba(255,222,140,.0) 0 7deg, rgba(255,222,140,.22) 9deg 11deg, rgba(255,222,140,0) 13deg 20deg);
  -webkit-mask: radial-gradient(circle, #000 15%, transparent 68%); mask: radial-gradient(circle, #000 15%, transparent 68%); animation: bkSpin 14s linear infinite; }
#bkBanner.major .bk-rays { width: 520px; height: 520px; margin: -260px 0 0 -260px; background: repeating-conic-gradient(from 0deg, rgba(255,210,110,0) 0 5deg, rgba(255,210,110,.4) 7deg 10deg, rgba(255,210,110,0) 12deg 16deg); }
@keyframes bkSpin { to { transform: rotate(360deg); } }
#bkBanner .bk-head { position: relative; padding: 10px 0 4px; }
#bkBanner .bk-head::before { content: ""; position: absolute; left: 6%; right: 6%; top: 0; bottom: -6px; border-radius: 50%; background: radial-gradient(closest-side, rgba(20,10,0,.62), rgba(20,10,0,.3) 60%, transparent); }
#bkBanner .bk-word { position: relative; -webkit-text-stroke: 1.5px rgba(90,40,0,.85); font-family: "STKaiti","KaiTi",serif; font-size: 58px; line-height: 1; letter-spacing: 12px; margin-right: -12px; color: #fff4cf;
  text-shadow: 0 2px 0 #5a2800, 0 0 18px #ffc65a, 0 0 42px #ff9a2a, 0 3px 10px #000; animation: bkIn .7s cubic-bezier(.2,1.6,.4,1) both; }
#bkBanner.major .bk-word { font-size: 74px; color: #fff8e0; text-shadow: 0 0 22px #ffd36a, 0 0 60px #ff8a1a, 0 0 100px #ff6a00, 0 3px 6px #000; }
@keyframes bkIn { 0% { transform: scale(2.6); opacity: 0; filter: blur(8px); } 60% { opacity: 1; filter: blur(0); } 100% { transform: scale(1); } }
#bkBanner .bk-name { position: relative; margin-top: 6px; font-family: "STKaiti","KaiTi",serif; font-size: 22px; letter-spacing: 3px; color: #ffe7a8; text-shadow: 0 0 3px #000, 0 2px 6px #000, 0 0 12px rgba(0,0,0,.8); animation: bkUp .5s .25s both; }
#bkBanner .bk-name s { opacity: .75; text-decoration: none; font-size: 16px; }
#bkBanner .bk-card { position: relative; margin-top: 12px; padding: 10px 14px 12px; border-radius: 12px; text-align: left; background: rgba(14,18,20,.86); border: 1px solid rgba(255,211,106,.55);
  box-shadow: 0 0 0 3px rgba(0,0,0,.3), 0 0 26px rgba(255,190,80,.35); animation: bkUp .5s .4s both; }
@keyframes bkUp { from { transform: translateY(14px); opacity: 0; } }
#bkBanner .bk-pts { display: flex; align-items: center; justify-content: center; gap: 10px; font-family: "STKaiti","KaiTi",serif; font-size: 18px; color: #ffe7a8; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,.12); margin-bottom: 6px; }
#bkBanner .bk-pts b { font-size: 34px; color: #fff; text-shadow: 0 0 14px #ffc65a; }
#bkBanner .bk-row { display: grid; grid-template-columns: 22px 64px 1fr auto; align-items: center; gap: 6px; font-size: 14px; padding: 2px 0; animation: bkUp .35s both; }
#bkBanner .bk-row .k { color: #cfc6b0; }
#bkBanner .bk-row .v { color: #fff; font-weight: bold; white-space: nowrap; }
#bkBanner .bk-row .v small { color: #9a9488; font-weight: normal; }
#bkBanner .bk-row .up { color: #8dff9a; font-weight: bold; text-shadow: 0 0 8px rgba(120,255,140,.5); white-space: nowrap; }
#bkBanner .bk-tip { font-size: 11px; opacity: .55; text-align: center; margin-top: 4px; }
#bkBanner .bk-btns { display: flex; gap: 8px; margin-top: 10px; }
#bkBanner .bk-btns button { flex: 1; font: inherit; font-size: 14px; color: #fff3d0; padding: 8px 6px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,211,106,.7); background: linear-gradient(180deg, rgba(160,110,30,.65), rgba(90,58,14,.75)); }
#bkBanner .bk-btns button.alt { background: rgba(0,0,0,.4); border-color: rgba(214,182,112,.45); }
#bkBanner .bk-btns button:hover { filter: brightness(1.25); }
#bkFlash { position: fixed; inset: 0; z-index: 24; pointer-events: none; opacity: 0; background: radial-gradient(circle at 50% 55%, rgba(255,236,170,.75), rgba(255,200,90,.25) 40%, transparent 70%); }
#bkFlash.go { animation: bkFlash 1.1s ease-out; }
@keyframes bkFlash { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
`;

const pct = (v) => Math.round(v * 100) + '%';
const upPct = (a, b) => (a > 0 && b > a * 1.0005 ? `▲${Math.round((b / a - 1) * 100)}%` : '');

export class StatsUI {
  constructor(g, realm) {
    this.g = g; this.realm = realm;
    if (typeof document === 'undefined') return;
    if (!document.getElementById('statsCss')) { const s = document.createElement('style'); s.id = 'statsCss'; s.textContent = CSS; document.head.append(s); }
  }
  get P() { return this.g.player; }

  // 每项属性在面板上的效果行：[名字, 现在的值, 加 n 点后的值（同一种写法）]
  lines(k, D, P, M) {
    const atk = 1.25 * (1 + (P.atkBonus || 0)), hp = (v) => fmtNum(Math.round((100 + (P.hpBonus || 0) + (M.hp || 0)) * v * (1 + (M.hpPct || 0))));
    const qiBase = P.maxQi / (1 + (P.st?.qi || 0)), cd = (d) => Math.max(0.5, DASH_CD * (1 - d.dash) + (M.dashCd || 0)); // 和 main.js dashCd 一样
    switch (k) {
      case 'str': return [['招式伤害', (d) => fmtMul(atk * d.str), (d) => d.str]];
      case 'con': return [['气血上限', (d) => hp(d.con), (d) => d.con], ['受到伤害', (d) => '÷' + fmtMul(d.con).slice(1), (d) => d.con]];
      case 'agi': return [['移动速度', (d) => '+' + pct(d.speed), (d) => 1 + d.speed], ['闪避冷却', (d) => cd(d).toFixed(2) + '秒', (d) => 1 / cd(d), (d, n) => (cd(d) - cd(n) >= 0.005 ? `−${(cd(d) - cd(n)).toFixed(2)}秒` : '')], ['暴击率', (d) => pct(0.12 + (M.crit || 0) + d.crit), (d) => 0.12 + (M.crit || 0) + d.crit]];
      case 'spi': return [['技能 / 收招伤害', (d) => fmtMul(atk * d.spi), (d) => d.spi], ['灵力上限', (d) => fmtNum(Math.round(qiBase * (1 + d.qi))), (d) => 1 + d.qi], ['回灵速度', (d) => '+' + pct(d.regen), (d) => 1 + d.regen]];
    }
    return [];
  }

  open() {
    const g = this.g, R = this.realm;
    g.ui.panel('属性', (body) => {
      const P = this.P, L = P.layer, M = P.mods || {}, left = R.ptsLeft(), cap = capPts(L), au = autoPts(L), D = P.st;
      const root = document.createElement('div'); root.id = 'stPanel';
      root.innerHTML = `<div class="st-head"><div><div class="st-realm">${R.info.name}</div>
        <div class="st-sub">属性点共 ${totalPts(L)}：每项固定 ${au}，自由 ${freePts(L)}</div></div>
        <div class="st-left ${left > 0 ? 'on' : ''}"><b>${left}</b><small>${left > 0 ? '点待分配' : '已分配完'}</small></div></div>`;
      const grid = document.createElement('div'); grid.className = 'st-grid';
      for (const k of STAT_KEYS) {
        const S = STATS[k], a = P.alloc[k], step = Math.min(7, left, cap - a);
        const nx = step > 0 ? derive(L, { ...P.alloc, [k]: a + step }) : null;
        const card = document.createElement('div'); card.className = 'st-card'; card.style.setProperty('--c', S.color);
        card.innerHTML = `<div class="st-top"><span class="st-ic">${S.icon}</span><span class="st-nm">${S.name}</span>
          <span class="st-pts"><b>${au + a}</b> 点<small>（固定 ${au} + 自由 ${a}）</small></span></div>
          <div class="st-desc">${S.desc}</div><div class="st-bar"><i style="width:${Math.min(100, a / Math.max(1, cap) * 100)}%"></i></div>
          <div class="st-fx">${this.lines(k, D, P, M).map(([n, f, v, dl]) => { const up = nx ? (dl ? dl(D, nx) : upPct(v(D), v(nx))) : ''; return `<span>${n}</span><span>${f(D)}${up ? `<em>+${step}点 ${up}</em>` : ''}</span>`; }).join('')}</div>`;
        const bs = document.createElement('div'); bs.className = 'st-btns';
        const mk = (label, n, cls) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = (e) => { e.stopPropagation(); this.add(k, n); }; return b; };
        bs.append(mk('−7', -7, a > 0 ? '' : 'off'), mk('−1', -1, a > 0 ? '' : 'off'), mk('+1', 1, left > 0 && a < cap ? 'plus' : 'plus off'), mk('+7', 7, left > 0 && a < cap ? 'plus' : 'plus off'), mk('全部', 1e9, left > 0 && a < cap ? 'plus' : 'plus off'));
        card.append(bs); grid.append(card);
      }
      root.append(grid);
      const foot = document.createElement('div'); foot.className = 'st-foot';
      const fb = (label, fn, on) => { const b = document.createElement('button'); b.textContent = label; if (!on) b.className = 'off'; b.style.opacity = on ? '' : '.35'; b.onclick = (e) => { e.stopPropagation(); if (on) fn(); }; return b; };
      foot.append(fb('✨ 按现在的比例分配剩下的', () => this.set(spreadLike(P.alloc, P.layer)), left > 0),
        fb('⚖ 剩下的四项平均', () => this.set(evenSpread(P.alloc, P.layer)), left > 0),
        fb('↺ 全部收回', () => this.set(emptyAlloc()), spentPts(P.alloc) > 0));
      root.append(foot);
      root.insertAdjacentHTML('beforeend', `<div class="st-note">每升一个小境界 +40 点（四项各固定 3，自由 28），突破大境界 +108 点（各固定 9，自由 72）。力量、体质、精神每点 ×1.027 乘法叠加：四项平均分配，每个小境界就强约 31%、大境界强一倍多，主修的那项更多；敏捷、灵力越加越少。单项最多占总点数 35%。随时可以收回重新分配。<br>其他加成：兵器 +${pct(P.atkBonus || 0)}（炼器、剑阶、剑冢）· 功法减伤 ${pct(Math.min(0.7, M.dmgTaken || 0))} · 功法暴击 +${pct(M.crit || 0)}</div>`);
      body.append(root);
    });
  }
  add(k, n) {
    const P = this.P, cap = capPts(P.layer), a = P.alloc[k];
    n = n > 0 ? Math.min(n, this.realm.ptsLeft(), cap - a) : Math.max(n, -a);
    if (!n) return;
    this.set({ ...P.alloc, [k]: a + n });
  }
  set(alloc) { const P = this.P, hp = P.hp / P.maxHp; P.alloc = alloc; this.realm.recalc(); P.hp = Math.max(1, Math.round(P.maxHp * hp)); this.g.ui.refresh(); this.refreshBanner?.(); }

  // 「分配完」的数值：还有没分配的点就按现在的比例先假装分掉（一点没分过就四项平均）——突破前后都这样算，比出来才是这一层真正涨了多少
  view() {
    const P = this.P, L = P.layer, M = P.mods || {}, plan = this.realm.ptsLeft() > 0 ? spreadLike(P.alloc, L) : P.alloc, D = derive(L, plan);
    return { plan, name: this.realm.info.name, left: this.realm.ptsLeft(), str: D.str, spi: D.spi, def: D.con,
      hp: Math.round((100 + (P.hpBonus || 0) + (M.hp || 0)) * D.con * (1 + (M.hpPct || 0))), qi: Math.round(P.maxQi / (1 + (P.st?.qi || 0)) * (1 + D.qi)) };
  }

  // ---------- 突破 ----------
  // 场景特效：光柱冲天、一圈圈灵气环、往上飘的光点；大境界换成金色、更大更久
  burstFx(major) {
    const g = this.g, P = this.P, fx = g.fx, cfx = g.cfx, x = P.pos.x, z = P.pos.z;
    const col = major ? '#ffd36a' : '#9ef0ff', col2 = major ? '#fff2c0' : '#e0fbff';
    const t = (s, f) => (g.after ? g.after(s, f) : f());
    cfx?.pillar(x, z, major ? 2.2 : 1.3, major ? 26 : 16, col, major ? 1.6 : 1.0);
    cfx?.flash(x, z, col, major ? 70 : 35, major ? 1.0 : 0.6, 2);
    cfx?.dome(x, z, major ? 6 : 3.5, col2, { dur: major ? 0.9 : 0.6, op: 0.3 });
    g.shake?.(major ? 0.8 : 0.35);
    const rings = major ? 6 : 3;
    for (let i = 0; i < rings; i++) t(i * 0.14, () => fx.shockRing(P.pos.x, P.pos.z, (major ? 5 : 3.5) + i * (major ? 3.2 : 2.4), i % 2 ? col2 : col, 0.7 + i * 0.08));
    const waves = major ? 6 : 3;
    for (let w = 0; w < waves; w++) t(w * 0.18, () => {
      fx.burst(P.pos, col, major ? 60 : 36, { speed: major ? 5 : 3.5, up: major ? 11 : 8, life: 1.4, grav: -1.5, size: 1.2 });
      for (let i = 0; i < (major ? 26 : 16); i++) { // 一圈往上升的光点，像灵气从身上涌出
        const a = Math.random() * 6.28, r = 0.4 + Math.random() * (major ? 2.4 : 1.6);
        fx.mote(P.pos.x + Math.cos(a) * r, 0.2 + Math.random() * 0.6, P.pos.z + Math.sin(a) * r, Math.random() < 0.5 ? col : col2, { vy: 3 + Math.random() * 5, life: 1.2 + Math.random() * 0.8, size: 0.7 + Math.random() * 0.6 });
      }
    });
    if (major) for (let i = 0; i < 4; i++) t(0.3 + i * 0.35, () => cfx?.pillar(P.pos.x, P.pos.z, 1 + i * 0.6, 22, i % 2 ? col2 : col, 0.9));
    const f = document.getElementById('bkFlash') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'bkFlash' });
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  // 横幅：「突破」大字 + 新境界 + 属性点 + 每项分配后会变成多少（前后对比、涨了几成）
  celebrate(before, o = {}) {
    const major = !!o.major;
    if (o.fx !== false) this.burstFx(major);
    let el = document.getElementById('bkBanner');
    if (!el) { el = document.createElement('div'); el.id = 'bkBanner'; document.body.append(el); }
    this.bk = { before, major, el };
    clearTimeout(this.bkT);
    this.refreshBanner = () => this.renderBanner();
    this.renderBanner(true);
    el.className = 'show' + (major ? ' major' : '');
    this.bkT = setTimeout(() => this.closeBanner(), major ? 14000 : 9000);
  }
  closeBanner() { const el = document.getElementById('bkBanner'); if (el) el.className = el.className.replace('show', '').trim(); this.refreshBanner = null; }
  renderBanner(first) {
    const { before, major, el } = this.bk, P = this.P, R = this.realm, left = R.ptsLeft(), gained = left - (before.left || 0);
    // 还有没分配的点：按现在的比例先「假装分配」一下，给玩家看分配完是什么样子
    const V = this.view(), plan = V.plan;
    const rows = [
      ['💪', '力量', fmtMul(1.25 * before.str), fmtMul(1.25 * V.str), upPct(before.str, V.str)],
      ['❤', '气血', fmtNum(before.hp), fmtNum(V.hp), upPct(before.hp, V.hp)],
      ['🛡', '防御', '÷' + fmtMul(before.def).slice(1), '÷' + fmtMul(V.def).slice(1), upPct(before.def, V.def)],
      ['🔮', '精神', fmtMul(1.25 * before.spi), fmtMul(1.25 * V.spi), upPct(before.spi, V.spi)],
      ['💧', '灵力', fmtNum(before.qi), fmtNum(V.qi), upPct(before.qi, V.qi)],
    ].filter((r) => r[4]);
    el.innerHTML = `<div class="bk-rays"></div><div class="bk-head"><div class="bk-word">${major ? '破境' : '突破'}</div>
      <div class="bk-name"><s>${before.name} → </s>${R.info.name}</div></div>
      <div class="bk-card">
        <div class="bk-pts">${left > 0 ? `属性点 <b>+${Math.max(gained, 0) || left}</b>${left > gained ? `<small>（共 ${left} 点待分配）</small>` : ''}` : '属性点已分配'}</div>
        ${rows.map((r, i) => `<div class="bk-row" style="animation-delay:${(first ? 0.6 : 0) + i * 0.09}s"><span>${r[0]}</span><span class="k">${r[1]}</span><span class="v"><small>${r[2]} → </small>${r[3]}</span><span class="up">${r[4]}</span></div>`).join('')}
        ${left > 0 ? `<div class="bk-tip">${spentPts(P.alloc) ? '按你现在的加点比例' : '四项平均'}分配后的数值</div>` : ''}
        <div class="bk-btns">${left > 0 ? '<button data-a="auto">✨ 就这样分配</button><button class="alt" data-a="open">自己分配（I）</button>' : '<button data-a="close">好</button>'}</div>
      </div>`;
    for (const b of el.querySelectorAll('button')) b.onclick = (e) => {
      e.stopPropagation();
      const a = b.dataset.a;
      if (a === 'auto') { this.set(plan); this.burstFx(false); clearTimeout(this.bkT); this.bkT = setTimeout(() => this.closeBanner(), 3500); }
      else if (a === 'open') { this.closeBanner(); this.open(); }
      else this.closeBanner();
    };
  }
}
