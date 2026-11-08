// 对话立绘（assets/npc/portraits/，透明 PNG，底部居中对齐）。
// 有名有姓的村民按 id 配；门派 NPC 按「门派 + 名字」配（两个门派都有叫老墨的守阁人）；
// 执事按门派配；其它说话的人按名字里的关键词配；都配不上就用默认立绘。
import { SECT_NPC, SECT_ZHISHI, GENERIC } from './portraits_npc.js';

const DIR = 'assets/npc/portraits/';
export const DEFAULT_PORTRAIT = '16_disciple';

const BY_ID = {
  chief: '20_chief', granny: '07_grandmother', stone: '08_boy', merchant: '05_merchant', bao: 'v_bao',
  doctor: '12_herbalist', ling: '09_girl', smith: '11_blacksmith', guihua: '22_mother', hu: 'v_hu',
  mentor: '06_elder', wanderer: '21_rogue', hunter: '14_hunter', yu: '04_timid_girl', scholar: '10_scholar',
  weaver: '23_dreamy_girl', fortune: '18_taoist', fisher: '15_fisherman', tea: '19_innkeeper',
  guard: '02_burly_man', farmer: '24_father', luyuan: '03_swordsman',
};
const BY_WORD = [
  ['村长', '20_chief'], ['掌柜', '19_innkeeper'], ['老板', '19_innkeeper'], ['管事', '05_merchant'],
  ['摊主', '21_rogue'], ['杂役', GENERIC.servant], ['执事', DEFAULT_PORTRAIT], ['弟子', DEFAULT_PORTRAIT],
];

const url = (k) => `${DIR}${k}.png`;
export function portraitById(id) { return BY_ID[id] ? url(BY_ID[id]) : null; }
// 门派里有名字的 NPC（sects.js 的 npcTalk）
export function portraitBySect(sect, name) { const k = SECT_NPC[sect]?.[name]; return k ? url(k) : null; }
export function portraitByName(name = '') {
  // 「青锋剑派 执事」
  const zs = name.match(/^(\S+).*执事$/);
  if (zs && SECT_ZHISHI[zs[1]]) return url(SECT_ZHISHI[zs[1]]);
  // 「凌青锋 · 掌门」：名字只在一个门派里出现时直接认
  const nm = name.split(' · ')[0];
  const hits = Object.values(SECT_NPC).map((m) => m[nm]).filter(Boolean);
  if (hits.length === 1) return url(hits[0]);
  for (const [w, k] of BY_WORD) if (name.includes(w)) return url(k);
  return url(DEFAULT_PORTRAIT);
}
// 预加载村民和常用的几张，第一次打开对话框时立绘不闪；门派立绘多（160+），进门派时再加载
export function preloadPortraits() {
  for (const k of new Set([...Object.values(BY_ID), ...BY_WORD.map((w) => w[1]), DEFAULT_PORTRAIT])) new Image().src = url(k);
}
const loadedSects = new Set();
export function preloadSectPortraits(sect) {
  if (loadedSects.has(sect)) return;
  loadedSects.add(sect);
  for (const k of Object.values(SECT_NPC[sect] || {})) new Image().src = url(k);
  if (SECT_ZHISHI[sect]) new Image().src = url(SECT_ZHISHI[sect]);
}
