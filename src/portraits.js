// 对话立绘（assets/npc/portraits/，透明 PNG，底部居中对齐）。
// 有名有姓的村民按 id 配；其它说话的人按名字里的关键词配；都配不上就用默认立绘。
const DIR = 'assets/npc/portraits/';
export const DEFAULT_PORTRAIT = '16_disciple';

const BY_ID = {
  chief: '20_chief', granny: '07_grandmother', stone: '08_boy', merchant: '05_merchant', bao: '08_boy',
  doctor: '12_herbalist', ling: '09_girl', smith: '11_blacksmith', guihua: '22_mother', hu: '08_boy',
  mentor: '06_elder', wanderer: '21_rogue', hunter: '14_hunter', yu: '04_timid_girl', scholar: '10_scholar',
  weaver: '23_dreamy_girl', fortune: '18_taoist', fisher: '15_fisherman', tea: '19_innkeeper',
  guard: '02_burly_man', farmer: '24_father', luyuan: '03_swordsman',
};
const BY_WORD = [
  ['村长', '20_chief'], ['掌柜', '19_innkeeper'], ['老板', '19_innkeeper'], ['管事', '05_merchant'],
  ['摊主', '21_rogue'], ['执事', '16_disciple'], ['弟子', '16_disciple'],
];

const url = (k) => `${DIR}${k}.png`;
export function portraitById(id) { return BY_ID[id] ? url(BY_ID[id]) : null; }
export function portraitByName(name = '') {
  for (const [w, k] of BY_WORD) if (name.includes(w)) return url(k);
  return url(DEFAULT_PORTRAIT);
}
// 预加载，第一次打开对话框时立绘不闪
export function preloadPortraits() {
  for (const k of new Set([...Object.values(BY_ID), ...BY_WORD.map((w) => w[1]), DEFAULT_PORTRAIT])) new Image().src = url(k);
}
