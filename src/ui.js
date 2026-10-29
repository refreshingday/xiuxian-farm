// 界面：对话框（分页 + 选项）、弹出面板（背包 / 商店 / 菜单 / 任务 …）、快捷栏。
// 对话或面板打开时游戏暂停（GDD：只在菜单和对话时暂停）
import { item, CAT_NAME } from './items.js';

const $ = (id) => document.getElementById(id);
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export function btn(label, fn, cls = '') {
  const b = el('button', cls, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

export class UI {
  constructor() {
    this.dialogOpen = false; this.panelOpen = null; this.d = null; this.page = 0;
    $('dialog').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) this.advance(); });
    $('pclose').addEventListener('click', () => this.closePanel());
    $('panelBack').addEventListener('pointerdown', (e) => { if (e.target.id === 'panelBack') this.closePanel(); });
  }
  get blocking() { return this.dialogOpen || !!this.panelOpen; }

  // ---------- 对话 ----------
  // d = { name, sub, lines: [...] 或 line, info, hint, choices: [{ label, fn, off }], onClose }
  dialog(d) {
    this.d = d; this.page = 0; this.dialogOpen = true;
    document.body.classList.add('talking');
    this.renderDialog();
  }
  get lines() { return this.d.lines || [this.d.line ?? '']; }
  renderDialog() {
    const d = this.d, box = $('dialog'), lines = this.lines, last = this.page >= lines.length - 1, t = lines[this.page];
    box.querySelector('.dname').textContent = d.name || '';
    box.querySelector('.dsub').textContent = d.sub || '';
    box.querySelector('.dline').textContent = d.name && !d.narrate ? `「${t}」` : t;
    box.querySelector('.dinfo').textContent = last ? d.info || '' : '';
    box.querySelector('.dhint').textContent = last ? d.hint || '' : '';
    const ch = box.querySelector('.dchoices'); ch.innerHTML = '';
    if (last && d.choices?.length) for (const c of d.choices) ch.append(btn(c.label, () => { if (!c.keep) this.closeDialog(true); c.fn?.(); }, c.off ? 'off' : ''));
    box.querySelector('.dmore').hidden = last;
    box.classList.remove('hidden');
  }
  advance() {
    if (!this.dialogOpen) return;
    if (this.page < this.lines.length - 1) { this.page++; this.renderDialog(); }
    else if (!this.d.choices?.length) this.closeDialog();
  }
  // chosen = 点了选项（不触发 onClose）
  closeDialog(chosen = false) {
    if (!this.dialogOpen) return;
    this.dialogOpen = false; $('dialog').classList.add('hidden'); document.body.classList.remove('talking');
    const f = this.d.onClose; this.d = null;
    if (!chosen) f?.();
  }

  // ---------- 面板 ----------
  panel(title, render, onClose) {
    this.panelOpen = { title, render, onClose };
    $('panelBack').classList.remove('hidden');
    this.refresh();
  }
  refresh() {
    const p = this.panelOpen; if (!p) return;
    $('ptitle').textContent = typeof p.title === 'function' ? p.title() : p.title;
    const b = $('pbody'), y = b.scrollTop; b.innerHTML = ''; p.render(b, this); b.scrollTop = y;
  }
  closePanel() {
    const p = this.panelOpen; if (!p) return;
    this.panelOpen = null; $('panelBack').classList.add('hidden'); p.onClose?.();
  }
  // 一行：图标、名字、说明、右侧按钮
  row(icon, name, sub, buttons = [], cls = '') {
    const r = el('div', 'prow ' + cls);
    r.append(el('span', 'pic', icon), el('div', 'ptxt', `<b>${name}</b><small>${sub || ''}</small>`));
    const bs = el('div', 'pbtns'); for (const b of buttons) bs.append(b); r.append(bs);
    return r;
  }

  // ---------- 背包 ----------
  // o = { onUse(id), gift(id) 送礼模式, title }
  openBag(inv, o = {}) {
    this.panel(o.title || '背包', (body) => {
      body.append(el('div', 'pmoney', `💰 ${inv.money} 文　💎 灵石 ${inv.stones}`));
      const ids = inv.ids(o.filter);
      if (!ids.length) body.append(el('div', 'pempty', o.gift ? '没有能送的东西。' : '背包空空如也。'));
      let cat = '';
      for (const id of ids) {
        const it = item(id);
        if (it.cat !== cat) { cat = it.cat; body.append(el('div', 'pcat', CAT_NAME[cat] || cat)); }
        const bs = [];
        if (o.gift) { if (it.cat !== 'tool') bs.push(btn('送出', () => o.gift(id))); }
        else {
          if (o.onUse && (it.heal || it.qiHeal || it.xp || it.cat === 'pill')) bs.push(btn('使用', () => { o.onUse(id); this.refresh(); }));
          const k = inv.hot.indexOf(id);
          bs.push(btn(k >= 0 ? `快捷 ${k + 1}` : '放快捷栏', () => { pinTo(inv, id); this.refresh(); }, k >= 0 ? 'on' : ''));
        }
        body.append(this.row(it.icon, `${it.name} <i>×${inv.count(id)}</i>`, it.desc || '', bs));
      }
    }, o.onClose);
  }

  // ---------- 商店 ----------
  // shop = { name, sells: [id], buys: [cat] }, priceMul = 好感折扣
  openShop(shop, inv, o = {}) {
    let tab = 'buy';
    const mul = o.discount ?? 1;
    this.panel(shop.name, (body) => {
      body.append(el('div', 'pmoney', `💰 ${inv.money} 文　💎 灵石 ${inv.stones}`));
      const tabs = el('div', 'ptabs');
      tabs.append(btn('买', () => { tab = 'buy'; this.refresh(); }, tab === 'buy' ? 'on' : ''), btn('卖', () => { tab = 'sell'; this.refresh(); }, tab === 'sell' ? 'on' : ''));
      if (o.exchange) tabs.append(btn('灵石换钱', () => { tab = 'ex'; this.refresh(); }, tab === 'ex' ? 'on' : ''));
      body.append(tabs);
      if (tab === 'buy') {
        const list = shop.sells.filter((id) => !o.filterBuy || o.filterBuy(item(id)));
        if (!list.length) body.append(el('div', 'pempty', '今天没有东西卖。'));
        // 坊市用灵石（1 灵石 ≈ 100 文，略贵一点）
        const stones = o.currency === 'stones', have = () => (stones ? inv.stones : inv.money), unit = stones ? '灵石' : '文';
        for (const id of list) {
          const it = item(id), p = stones ? Math.max(1, Math.ceil(it.buy * mul / 80)) : Math.round(it.buy * mul);
          const buy = (k) => { if (have() < p * k) return o.toast?.(stones ? '灵石不够' : '钱不够'); if (stones) inv.stones -= p * k; else inv.money -= p * k; inv.add(id, k); o.onBuy?.(id, k); this.refresh(); };
          body.append(this.row(it.icon, `${it.name} <i>${p} ${unit}</i>`, it.desc || '', [btn('买 1', () => buy(1), have() < p ? 'off' : ''), btn('买 5', () => buy(5), have() < p * 5 ? 'off' : '')]));
        }
      } else if (tab === 'sell') {
        const ids = inv.ids((it) => shop.buys.includes(it.cat) && it.sell > 0);
        if (!ids.length) body.append(el('div', 'pempty', '没有这家收的东西。'));
        const sm = (id) => (o.sellMul?.(id) ?? 1);
        for (const id of ids) {
          const it = item(id), p = inv.sellPrice(id, sm(id));
          const sell = (k) => {
            k = Math.min(k, inv.count(id)); let got = 0;
            for (let i = 0; i < k; i++) { got += inv.sellPrice(id, sm(id)); inv.sold[id] = (inv.sold[id] || 0) + 1; }
            inv.take(id, k); inv.money += got; o.onSell?.(id, k, got); this.refresh();
          };
          body.append(this.row(it.icon, `${it.name} ×${inv.count(id)} <i>${p} 文</i>`, (inv.sold[id] || 0) > 20 ? '今天卖太多，压价了' : sm(id) > 1.3 ? '🔥 今日高价' : '', [btn('卖 1', () => sell(1)), btn('全卖', () => sell(inv.count(id)))]));
        }
      } else {
        body.append(el('div', 'pempty', '灵石是修士的货币，可以换成金钱（1 灵石 = 100 文），金钱换不回灵石。'));
        const ex = (k) => { if (inv.stones < k) return; inv.stones -= k; inv.money += k * 100; this.refresh(); };
        body.append(this.row('💎', `灵石 ×${inv.stones}`, '', [btn('换 1', () => ex(1), inv.stones < 1 ? 'off' : ''), btn('换 10', () => ex(10), inv.stones < 10 ? 'off' : '')]));
      }
    }, o.onClose);
  }

  // ---------- 快捷栏 ----------
  renderHotbar(inv) {
    const bar = $('hotbar');
    if (!bar.children.length) for (let i = 0; i < 8; i++) {
      const s = el('div', 'hs', `<kbd>${i + 1}</kbd><span class="hi"></span><i class="hn"></i>`); s.dataset.i = i; bar.append(s);
    }
    [...bar.children].forEach((s, i) => {
      const id = inv.hot[i], it = id && item(id);
      s.querySelector('.hi').textContent = it ? it.icon : '';
      s.querySelector('.hn').textContent = it ? inv.countText?.(id) ?? inv.count(id) : '';
      s.title = it ? it.name : '';
      s.classList.toggle('sel', i === inv.sel);
      s.classList.toggle('empty', !it);
    });
    const id = inv.selId;
    $('hotName').textContent = id ? item(id).name : '';
  }
}

// 放进快捷栏：已经在里面就拿掉，不在就放进当前选中的格子
function pinTo(inv, id) {
  const k = inv.hot.indexOf(id);
  if (k >= 0) { inv.hot[k] = null; return; }
  const i = inv.hot[inv.sel] == null ? inv.sel : inv.hot.indexOf(null);
  inv.hot[i >= 0 ? i : inv.sel] = id;
  inv.onChange?.();
}
