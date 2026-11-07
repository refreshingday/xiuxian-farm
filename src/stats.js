// 属性点（攻击 / 气血 / 防御）。纯数据，不碰 three，node 里能直接测。
// 每升一个小境界 30 点：固定 9 点（三项各 3），玩家自由分配 21 点；每突破一个大境界 81 点：固定 27 点，自由 54 点。
// 每 1 点让那一项 ×PT_K（乘法叠加）。三项平均分配时：小境界每项 +31%，大境界每项 +108%（一倍多）。
// 存档只记「自由点加到了哪里」，总点数永远按层数现算 —— 旧存档读进来就是一笔没分配的点，和新玩家一路加上来完全一样；
// 旧版页面把这个字段弄丢了也只是点数变回未分配，不会多发、少发。
export const STAT_KEYS = ['atk', 'hp', 'def'];
export const STATS = {
  atk: { name: '攻击', icon: '⚔', desc: '招式伤害' },
  hp: { name: '气血', icon: '❤', desc: '气血上限、丹药回血' },
  def: { name: '防御', icon: '🛡', desc: '受到的伤害按防御倍率除掉' },
};
export const PT_K = 1.085 ** (1 / 3);
export const SMALL = 30, BIG = 81, SMALL_AUTO = 3, BIG_AUTO = 9; // AUTO：每项固定给的点
export const CAP = 0.4; // 单项（固定 + 自由）最多占总点数的 40%，免得全加攻击什么都秒
export const MAX_L = 26;
export const isMajor = (L) => L >= 10 && (L - 10) % 4 === 0; // 筑基 / 金丹 / 元婴 / 化神初期、渡劫

// 升到第 L 层累计的总点数、每项固定点、自由点
export function totalPts(L) { let n = 0; for (let i = 2; i <= L; i++) n += isMajor(i) ? BIG : SMALL; return n; }
export function autoPts(L) { let n = 0; for (let i = 2; i <= L; i++) n += isMajor(i) ? BIG_AUTO : SMALL_AUTO; return n; }
export const freePts = (L) => totalPts(L) - autoPts(L) * STAT_KEYS.length;
// 单项自由点的上限
export const capPts = (L) => Math.max(0, Math.floor(totalPts(L) * CAP) - autoPts(L));
export const spentPts = (alloc) => STAT_KEYS.reduce((s, k) => s + (alloc?.[k] || 0), 0);

// 存档里读出来的分配：去掉坏值，超出（理论上不会）就从大的往回削
export function cleanAlloc(a, L) {
  const out = {}, cap = capPts(L);
  for (const k of STAT_KEYS) out[k] = Math.max(0, Math.min(cap, Math.floor(+a?.[k] || 0)));
  let over = spentPts(out) - freePts(L);
  while (over > 0) { const k = STAT_KEYS.reduce((m, x) => (out[x] > out[m] ? x : m)); const d = Math.min(over, out[k]); out[k] -= d; over -= d; }
  return out;
}
// 剩下的自由点按三项尽量拉平（受单项上限限制）
export function autoSpread(a, L) {
  const out = { ...a }, cap = capPts(L);
  let left = freePts(L) - spentPts(out);
  while (left > 0) {
    const k = STAT_KEYS.filter((x) => out[x] < cap).sort((x, y) => out[x] - out[y])[0];
    if (!k) break;
    out[k]++; left--;
  }
  return out;
}
export const statMul = (L, free) => PT_K ** (autoPts(L) + (free || 0));

// 三项平均分配时，第 L 层每项的倍率（L 可以是小数，按两层之间插值；超过渡劫按小境界往后外推）
export function curve(L) {
  L = Math.max(1, L);
  const e = (n) => (n <= MAX_L ? totalPts(n) : totalPts(MAX_L) + (n - MAX_L) * SMALL) / STAT_KEYS.length;
  const a = Math.floor(L), f = L - a;
  return PT_K ** (e(a) + (e(a + 1) - e(a)) * f);
}
// 妖兽等级 → 对应的玩家层数（realm.foeLevel 的反函数）：炼气 (L−1)×0.5，筑基起 4.3 + (L−10)×1.45
export const layerForFoe = (lvl) => (lvl <= 4 ? 1 + lvl / 0.5 : lvl <= 4.3 ? 9 + (lvl - 4) / 0.3 : 10 + (lvl - 4.3) / 1.45);
// 妖兽气血按同级玩家的攻击倍率涨；伤害按 气血 × 防御 涨（玩家这两项一起涨，伤害要涨平方才守住同样的威胁）
export const foeHpMul = (lvl) => curve(layerForFoe(Math.max(0, lvl)));
export const foeDmgMul = (lvl) => foeHpMul(lvl) ** 2;

// 大数字：1.2万 / 3.4亿
export function fmtNum(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '亿';
  if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '万';
  return String(n);
}
