// 物品表与背包。数据在 data/items.json（GDD：数据驱动）；作物自动生成种子 seed_<id>，
// 灵草的药龄变体（@10 十年 / @100 百年）按需生成。
import { SEASONS } from './calendar.js';

export const ITEMS = {}, CROPS = {}, SHOPS = {};
const CAT_ORDER = ['seed', 'herb', 'crop', 'food', 'pill', 'mat', 'boss'];
export const CAT_NAME = { seed: '种子', herb: '灵草', crop: '作物', food: '食物', pill: '丹药', mat: '材料', boss: '妖王材料' };

export async function loadItems() {
  const d = await (await fetch('data/items.json')).json();
  Object.assign(CROPS, d.crops); Object.assign(SHOPS, d.shops);
  for (const [id, c] of Object.entries(d.crops)) {
    c.id = id;
    const when = c.seasons.map((s) => SEASONS[s]).join('/');
    ITEMS[id] = { ...c, cat: c.kind, desc: c.kind === 'herb' ? `灵草（${c.elem}）。熟了可以留在地里长药龄，年份越高越值钱。` : '普通作物，可以卖给村里，也能吃。' };
    ITEMS['seed_' + id] = { name: c.name + '种子', icon: '🌰', cat: 'seed', crop: id, sell: Math.floor(c.seed / 2), buy: c.seed,
      desc: `${when}季播种 · ${c.days} 天成熟${c.regrow ? ` · 之后每 ${c.regrow} 天再收` : ''}${c.qi ? ` · 每天耗 ${c.qi} 点土壤灵气` : ' · 不耗灵气'}` };
  }
  for (const [id, it] of Object.entries(d.items)) ITEMS[id] = { ...it, buy: it.buy ?? it.sell * 2 };
  for (const [id, it] of Object.entries(ITEMS)) it.id = id;
}

// 取物品定义；药龄变体（如 renshen@100）第一次用到时生成
export function item(id) {
  if (ITEMS[id]) return ITEMS[id];
  const [base, age] = id.split('@'), b = ITEMS[base];
  if (!b || !age) return null;
  const old = age === '100';
  return (ITEMS[id] = { ...b, id, base, age: +age, name: (old ? '百年' : '十年') + b.name, sell: b.sell * (old ? 5 : 2), heal: (b.heal || 0) * (old ? 3 : 1.5), qiHeal: (b.qiHeal || 0) * (old ? 3 : 1.5) });
}
export const itemName = (id) => item(id)?.name ?? id;
export const itemIcon = (id) => item(id)?.icon ?? '❔';
// 能放进快捷栏的：种子、能吃的、能补灵田灵气的
export const usable = (it) => it.cat === 'seed' || it.heal || it.qiHeal || it.xp || it.soilQi || it.cat === 'pill';

export class Inventory {
  constructor() {
    this.n = {};                    // id → 数量
    this.money = 0; this.stones = 0; // 金钱（文）/ 灵石
    this.hot = Array(8).fill(null); // 快捷栏 1–8
    this.sel = 0;
    this.sold = {};                 // 今天卖出的数量（同一天卖太多会压价）
    this.onChange = null;
  }
  count(id) { return this.n[id] || 0; }
  add(id, k = 1) {
    if (k <= 0) return;
    this.n[id] = this.count(id) + k;
    const it = item(id);
    if (it && usable(it) && !this.hot.includes(id)) { const i = this.hot.indexOf(null); if (i >= 0) this.hot[i] = id; }
    this.onChange?.();
  }
  take(id, k = 1) {
    if (this.count(id) < k) return false;
    this.n[id] -= k;
    if (!this.n[id]) { delete this.n[id]; const i = this.hot.indexOf(id); if (i >= 0) this.hot[i] = null; }
    this.onChange?.();
    return true;
  }
  // 按类别排好的 id 列表
  ids(filter = () => true) {
    return Object.keys(this.n).filter((id) => item(id) && filter(item(id)))
      .sort((a, b) => CAT_ORDER.indexOf(item(a).cat) - CAT_ORDER.indexOf(item(b).cat) || item(a).name.localeCompare(item(b).name, 'zh'));
  }
  get selId() { return this.hot[this.sel]; }
  // 卖价：同一天同一种卖超过 20 个，之后八折再八折……最低六折
  sellPrice(id, mul = 1) {
    const it = item(id), over = Math.max(0, (this.sold[id] || 0) - 20);
    return Math.max(1, Math.round(it.sell * mul * Math.max(0.6, 1 - over * 0.02)));
  }
  newDay() { this.sold = {}; }
  save() { return { n: this.n, money: this.money, stones: this.stones, hot: this.hot, sel: this.sel }; }
  load(s) { this.n = { ...s.n }; this.money = s.money; this.stones = s.stones; this.hot = s.hot.slice(0, 8); this.sel = s.sel || 0; this.onChange?.(); }
}
