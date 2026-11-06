// 舆图（M）：整张世界实时画出来（maptiles.js 的瓦片，只画看得见的），北在上；
//   拖动平移、滚轮 / 双指缩放、点标记看说明、点空地看坐标和离你多远。
//   右边列出进行中的任务：点「定位」飞到它的目的地，点「追踪」让它在地图 / 小地图 / 屏幕边缘箭头里高亮（再点取消）。
//   委托板上还没接的委托如果有固定地点，也能先「看地方」再决定接不接。
import { KIND } from './landmarks.js';
import { SECTORS, RINGS, polar } from './worldmap.js';
import { regionName } from './world.js';
import { project, unproject } from './maptiles.js';
import { paintMap } from './maprender.js';
import { el } from './ui.js';

const MIN_MPP = 0.35, MAX_MPP = 10, LIM = 1300;
const $ = (id) => document.getElementById(id);

let styled = false;
function css() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .bm { display: flex; gap: 12px; align-items: stretch; }
  .bmL { position: relative; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .bmCv { position: relative; width: 100%; height: min(64vh, 640px); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; touch-action: none; cursor: grab; background: #141b1a; }
  .bmCv.drag { cursor: grabbing; }
  .bmCv canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .bmTools { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 5px; }
  .bmTools button { width: 34px; height: 34px; padding: 0 !important; font-size: 18px !important; line-height: 1; background: rgba(14,22,24,.82) !important; }
  .bmInfo { min-height: 44px; font-size: 13px; line-height: 1.6; padding: 4px 6px; background: rgba(0,0,0,.25); border-radius: 6px; }
  .bmInfo b { color: #ffe7a8; } .bmInfo button { margin-left: 6px; padding: 3px 9px !important; font-size: 12px !important; }
  .bmR { flex: 0 0 250px; max-height: min(64vh, 640px); overflow: auto; font-size: 13px; }
  .bmR h4 { margin: 10px 0 4px; font-size: 12px; font-weight: normal; color: #ffe7a8; opacity: .85; } .bmR h4:first-child { margin-top: 0; }
  .bmq { padding: 7px 8px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 7px; background: rgba(0,0,0,.22); }
  .bmq.sel { border-color: #ffd23a; box-shadow: 0 0 0 1px rgba(255,210,58,.4) inset; background: rgba(255,210,58,.1); }
  .bmq b { display: block; } .bmq small { display: block; opacity: .75; line-height: 1.5; margin: 2px 0 5px; }
  .bmq .bt { display: flex; gap: 6px; } .bmq button { padding: 3px 9px !important; font-size: 12px !important; }
  .bmLeg { opacity: .8; line-height: 1.9; font-size: 12px; }
  @media (max-width: 760px) { .bm { flex-direction: column; } .bmR { flex: none; max-height: none; } .bmCv { height: 52vh; } }`;
  document.head.append(s);
}

export class BigMap {
  constructor(g) { this.g = g; this.isOpen = false; this.v = { cx: 0, cz: 0, mpp: 2, rot: 0, W: 600, H: 400 }; this.raf = 0; this.flash = null; }

  // opts: { quest: id } 飞到这个任务的目的地并追踪；{ preview: [targets] } 看还没接的委托在哪
  open(opts = {}) {
    const g = this.g, P = g.player;
    css();
    this.preview = opts.preview || null; this.sel = null; this.info = ''; this.pointers = new Map(); this.sig = ''; this.first = false;
    const targets = opts.quest ? this.targets().filter((t) => t.qid === opts.quest) : this.preview || [];
    this.v.cx = P.pos.x; this.v.cz = P.pos.z; this.v.mpp = 2;
    this.fitWorld = !targets.length; // 默认先看整个世界，要细看再放大
    if (targets.length) this.fit([...targets, { x: P.pos.x, z: P.pos.z }]);
    if (opts.quest) { g.quests.sel = opts.quest; g.quests.dirty = true; }
    this.root = el('div', 'bm');
    this.cvWrap = el('div', 'bmCv'); this.cv = document.createElement('canvas'); this.cvWrap.append(this.cv);
    const tools = el('div', 'bmTools');
    for (const [t, f, tip] of [['＋', () => this.zoomAt(1.5), '放大'], ['－', () => this.zoomAt(1 / 1.5), '缩小'], ['⌖', () => this.center(P.pos.x, P.pos.z, 1), '回到自己（放大）'], ['🌐', () => { this.fitWorld = true; }, '看整个世界']]) {
      const b = el('button', '', t); b.title = tip; b.addEventListener('click', f); b.addEventListener('pointerdown', (e) => e.stopPropagation()); tools.append(b);
    }
    this.cvWrap.append(tools);
    this.infoEl = el('div', 'bmInfo'); this.side = el('div', 'bmR');
    const L = el('div', 'bmL'); L.append(this.cvWrap, this.infoEl); this.root.append(L, this.side);
    this.bind();
    this.isOpen = true;
    $('panel').style.width = 'min(1020px, 97vw)';
    g.ui.panel('舆图', (body) => { body.append(this.root); }, () => this.close());
    this.renderSide(); this.setInfo(this.defaultInfo());
    const loop = () => { if (!this.isOpen) return; this.raf = requestAnimationFrame(loop); this.frame(); };
    this.raf = requestAnimationFrame(loop);
  }
  close() {
    this.isOpen = false; cancelAnimationFrame(this.raf); $('panel').style.width = '';
    if (this.g.quests) this.g.quests.dirty = true;
  }

  // ---------- 视图 ----------
  fit(pts) {
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    this.v.cx = (x0 + x1) / 2; this.v.cz = (z0 + z1) / 2;
    this.v.mpp = Math.max(0.6, Math.min(MAX_MPP, Math.max(x1 - x0, z1 - z0, 80) * 1.5 / 520));
  }
  center(x, z, mpp) { this.v.cx = x; this.v.cz = z; if (mpp) this.v.mpp = mpp; }
  zoomAt(f, sx = this.v.W / 2, sy = this.v.H / 2) {
    const v = this.v, [wx, wz] = unproject(v, sx, sy);
    v.mpp = Math.max(MIN_MPP, Math.min(MAX_MPP, v.mpp / f));
    const [wx2, wz2] = unproject(v, sx, sy); v.cx += wx - wx2; v.cz += wz - wz2;
  }
  clampView() { const v = this.v; v.cx = Math.max(-LIM, Math.min(LIM, v.cx)); v.cz = Math.max(-LIM, Math.min(LIM, v.cz)); }

  bind() {
    const cv = this.cvWrap, ps = this.pointers;
    let moved = 0, pinch = 0;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); ps.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; cv.classList.add('drag');
      if (ps.size === 2) { const [a, b] = [...ps.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ps.get(e.pointerId); if (!p) return;
      const r = cv.getBoundingClientRect(), v = this.v;
      if (ps.size === 2) {
        ps.set(e.pointerId, [e.clientX, e.clientY]);
        const [a, b] = [...ps.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
        pinch = d; moved = 99; return;
      }
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 5) return;
      v.cx -= dx * v.mpp; v.cz -= dy * v.mpp; this.clampView();
    });
    const up = (e) => {
      const had = ps.delete(e.pointerId); if (!ps.size) cv.classList.remove('drag');
      if (had && e.type === 'pointerup' && moved < 5 && !ps.size) { const r = cv.getBoundingClientRect(); this.click(e.clientX - r.left, e.clientY - r.top); }
      pinch = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(Math.exp(-e.deltaY * 0.0014), e.clientX - r.left, e.clientY - r.top); this.clampView(); }, { passive: false });
  }

  // ---------- 数据 ----------
  targets() { return this.g.quests?.tgt || this.g.quests?.targets?.() || []; }
  // 点到的东西：目的地 > 地标 > 空地
  click(sx, sy) {
    const g = this.g, v = this.v;
    let best = null, bd = 18;
    for (const t of [...this.targets(), ...(this.preview || [])]) { const [x, y] = project(v, t.x, t.z), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = { type: 't', t }; } }
    if (!best) for (const L of g.landmarks.list) {
      if (L.hidden && !L.found) continue;
      const [x, y] = project(v, L.x, L.z), d = Math.hypot(x - sx, y - sy); if (d < Math.min(bd, 14)) { bd = d; best = { type: 'l', L }; }
    }
    this.pick = best;
    if (best?.type === 't') { this.sel = best.t.qid || null; }
    if (best) this.setInfo(this.describe(best));
    else { const [x, z] = unproject(v, sx, sy); this.pick = { type: 'p', x, z }; this.setInfo(this.describe(this.pick)); }
    this.renderSide();
  }
  distTo(x, z) { const P = this.g.player.pos; return Math.round(Math.hypot(x - P.x, z - P.z)); }
  describe(p) {
    const g = this.g;
    if (p.type === 't') {
      const t = p.t, wrap = el('span'); wrap.innerHTML = `${t.ic === '❓' ? '❓' : '📍'} <b>${t.title}</b>${t.goal ? ' · ' + t.goal : t.back ? ' · 回去交付' : ''} · 离你 ${this.distTo(t.x, t.z)} 米`;
      if (t.qid) wrap.append(this.btn(g.quests.sel === t.qid ? '取消追踪' : '追踪', () => { g.quests.track(t.qid); this.setInfo(this.describe(p)); this.renderSide(); }));
      return wrap;
    }
    if (p.type === 'l') {
      const L = p.L, K = KIND[L.kind], wrap = el('span');
      wrap.innerHTML = `${K.icon} <b>${L.found ? L.name : '？？？'}</b> · ${K.name}${L.realm ? ' · ' + L.realm + '圈' : ''} · 离你 ${this.distTo(L.x, L.z)} 米${L.found && L.info ? '<br>' + L.info : L.found ? '' : '<br>走近 50 米才能看清'}`;
      return wrap;
    }
    const wrap = el('span'); wrap.innerHTML = `${regionName(p.x, p.z)} · 坐标 (${Math.round(p.x)}, ${Math.round(p.z)}) · 离你 ${this.distTo(p.x, p.z)} 米`; return wrap;
  }
  defaultInfo() {
    const P = this.g.player.pos, wrap = el('span');
    wrap.innerHTML = `你在 <b>${regionName(P.x, P.z)}</b> · 离村 ${Math.round(Math.hypot(P.x, P.z))} 米。拖动平移，滚轮缩放，点标记看说明。已发现 ${this.g.landmarks.list.filter((L) => L.found).length} / ${this.g.landmarks.list.length} 处。`;
    return wrap;
  }
  setInfo(n) { this.infoEl.innerHTML = ''; this.infoEl.append(n); }
  btn(t, f) { const b = el('button', '', t); b.addEventListener('click', (e) => { e.stopPropagation(); f(); }); return b; }

  renderSide() {
    const g = this.g, Q = g.quests, S = this.side, tg = this.targets();
    S.innerHTML = '';
    S.append(el('h4', '', '进行中的任务'));
    const list = [...(Q?.active || [])].sort((a, b) => (a.from === 'story' ? -1 : 0) - (b.from === 'story' ? -1 : 0));
    if (!list.length) S.append(el('div', 'pempty', '没有进行中的任务。'));
    for (const q of list) {
      const mine = tg.filter((t) => t.qid === q.id), card = el('div', 'bmq' + (Q.sel === q.id ? ' sel' : ''));
      card.append(el('b', '', `${q.from === 'story' ? '◆ ' : ''}${q.def.title}`), el('small', '', `${Q.progText(q)}${mine.length ? '' : ' · 无固定地点'}`));
      const bt = el('div', 'bt');
      if (mine.length) bt.append(this.btn('定位', () => { this.fit([...mine, { x: g.player.pos.x, z: g.player.pos.z }].filter((p, i) => i < mine.length || mine.length === 1)); this.flash = { t: performance.now(), ids: mine }; this.pick = { type: 't', t: mine[0] }; this.setInfo(this.describe(this.pick)); }));
      bt.append(this.btn(Q.sel === q.id ? '取消追踪' : '追踪', () => { Q.track(q.id); this.renderSide(); }));
      card.append(bt); S.append(card);
    }
    const prev = (Q?.board || []).map((b) => ({ b, ts: Q.previewTargets(b.def) })).filter((o) => o.ts.length);
    if (prev.length) {
      S.append(el('h4', '', '委托板上可接的（看地方）'));
      for (const { b, ts } of prev) {
        const card = el('div', 'bmq'); card.append(el('b', '', b.def.title), el('small', '', b.def.desc));
        const bt = el('div', 'bt'); bt.append(this.btn('看地方', () => { this.preview = ts; this.fit([...ts, { x: g.player.pos.x, z: g.player.pos.z }]); this.pick = { type: 't', t: ts[0] }; this.setInfo(this.describe(this.pick)); }));
        card.append(bt); S.append(card);
      }
    }
    S.append(el('h4', '', '图例'));
    S.append(el('div', 'bmLeg', Object.values(KIND).map((K) => `${K.icon} ${K.name}`).join('　') + '<br>📍 任务地点　❓ 回去交付　❗ 可接委托<br>🔴 妖兽（附近）　◆ 青竹村'));
  }

  // ---------- 画 ----------
  frame() {
    const g = this.g, cv = this.cv, wrap = this.cvWrap, dpr = Math.min(devicePixelRatio || 1, 2);
    const W = wrap.clientWidth, H = wrap.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const v = this.v; v.W = W; v.H = H;
    if (this.fitWorld) { this.fitWorld = false; v.cx = 0; v.cz = -80; v.mpp = Math.min(MAX_MPP, 2440 / Math.min(W, H)); }
    const c = cv.getContext('2d'), mpp = v.mpp, now = performance.now(), Q = g.quests, sel = Q?.selected?.();
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#141b1a'; c.fillRect(0, 0, W, H);
    this.tiles = g.tiles;
    // 和小地图同一套画法（maprender.js），这里只是更大、多显示名字
    const r = paintMap(c, g, this.tiles, v, { dpr, big: true, main: null, extra: (this.preview || []).map((t) => ({ ...t, pre: true })) });
    const { px, py, txt } = r, at = (x, z) => project(v, x, z), KAI = '"STKaiti","KaiTi",serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (mpp > 2.2) for (const s of SECTORS) { const p = polar(s.ang, 640), [x, y] = at(p.x, p.z); txt(s.name, x, y, `bold ${Math.round(Math.min(34, 78 / Math.sqrt(mpp) * 1.3))}px ${KAI}`, 'rgba(255,255,255,.75)', 4); }
    if (mpp > 1.6) RINGS.slice(0, 4).forEach((q) => { const [x, y] = at(0, -q.to + 12); txt(q.realm + '圈', x, y, `12px ${KAI}`, '#ffe7a8'); });
    // 追踪中的任务：虚线连过去 + 距离；「定位」后闪一下
    for (const t of this.targets()) {
      const [x, y] = at(t.x, t.z), mine = t.qid && t.qid === sel, fl = this.flash && now - this.flash.t < 2500 && this.flash.ids.includes(t);
      if (mine) { c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,210,58,.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke(); c.setLineDash([]); txt(`${this.distTo(t.x, t.z)} 米`, x, y + 18, '11px sans-serif'); }
      if (fl) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 18 + (now % 600) / 30, 0, 7); c.stroke(); }
    }
    if (this.pick?.type === 'p') { const [x, y] = at(this.pick.x, this.pick.z); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.moveTo(x, y - 7); c.lineTo(x, y + 7); c.stroke(); }
    if (this.pick?.L) { const [x, y] = at(this.pick.L.x, this.pick.L.z); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 13, 0, 7); c.stroke(); }
    const nice = [10, 20, 50, 100, 200, 500, 1000].find((n) => n / mpp > 60) || 1000, len = nice / mpp;
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, H - 16); c.lineTo(12, H - 11); c.lineTo(12 + len, H - 11); c.lineTo(12 + len, H - 16); c.stroke();
    c.textAlign = 'left'; txt(nice + ' 米', 14, H - 24, '11px sans-serif'); c.textAlign = 'center'; txt('北 ↑', W - 52, 18, `bold 13px ${KAI}`);
    this.tiles.pump(this.first ? 14 : 45); this.first = true;
    // 任务有变化就刷新右边的列表
    const sig = (Q?.active || []).map((q) => q.id + ':' + q.prog.join(',')).join('|') + (Q?.sel || '') + (Q?.board?.length || 0);
    if (sig !== this.sig) { if (this.sig) this.renderSide(); this.sig = sig; }
  }
}
