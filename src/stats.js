// 属性点（力量 / 体质 / 敏捷 / 精神）。纯数据，不碰 three，node 里能直接测。
// 每升一个小境界 40 点：四项各固定 3 点，玩家自由分配 28 点；每突破一个大境界 108 点：各固定 9 点，自由 72 点。
// 力量 / 体质 / 精神：境界决定大头——每个小境界 ×1.1、突破大境界 ×1.5（四项平均分配的人），加点决定偏向哪项。
// 敏捷、精神的灵力部分：越加越少（1 − e^(−点数/S)），有上限，免得后期速度、灵力翻几千倍。
// 存档只记「自由点加到了哪里」，总点数永远按层数现算 —— 旧存档读进来就是一笔没分配的点，和新玩家一路加上来完全一样；
// 旧版页面把这个字段弄丢了（或者旧的 atk/hp/def 分配）也只是点数变回未分配，不会多发、少发。
export const STAT_KEYS = ['str', 'con', 'agi', 'spi'];
export const STATS = {
  str: { name: '力量', icon: '💪', color: '#ff9a5a', desc: '拳的全部招式，剑、符的普通连招' },
  con: { name: '体质', icon: '🛡', color: '#ff6a6a', desc: '气血上限、防御、丹药回血' },
  agi: { name: '敏捷', icon: '🍃', color: '#7ae0a0', desc: '移动速度、闪避冷却、暴击率（越加越少）' },
  spi: { name: '精神', icon: '🔮', color: '#9ab8ff', desc: '剑、符的收招和 Q/E/R 技能伤害；灵力上限、回灵（越加越少）' },
};
export const SMALL = 40, BIG = 108, SMALL_AUTO = 3, BIG_AUTO = 9; // AUTO：每项固定给的点
export const SHARE = 0.25; // 成长曲线按「四项平均分配」校准
export const SMALL_UP = 1.1, BIG_UP = 1.5; // 每个小境界 ×1.1，跨大境界 ×1.5
export const CAP = 0.35; // 单项（固定 + 自由）最多占总点数的 35%
export const AGI_S = 80, DASH_S = 40, SPI_S = 120; // 敏捷 / 闪避 / 灵力的「越加越少」速度（闪避收得快：筑基左右就接近 0.5 秒一次）
export const AGI_MAX = { speed: 0.4, dash: 0.8, crit: 0.2 }, SPI_QI_MAX = 1, SPI_REGEN_MAX = 1;
export const MAX_L = 26;
export const isMajor = (L) => L >= 10 && (L - 10) % 4 === 0; // 筑基 / 金丹 / 元婴 / 化神初期、渡劫

// 升到第 L 层累计的总点数、每项固定点、自由点
export function totalPts(L) { let n = 0; for (let i = 2; i <= L; i++) n += isMajor(i) ? BIG : SMALL; return n; }
export function autoPts(L) { let n = 0; for (let i = 2; i <= L; i++) n += isMajor(i) ? BIG_AUTO : SMALL_AUTO; return n; }
export const freePts = (L) => totalPts(L) - autoPts(L) * STAT_KEYS.length;
export const capPts = (L) => Math.max(0, Math.floor(totalPts(L) * CAP) - autoPts(L)); // 单项自由点的上限
export const spentPts = (alloc) => STAT_KEYS.reduce((s, k) => s + (alloc?.[k] || 0), 0);
export const emptyAlloc = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

// 存档里读出来的分配：只认四项、去掉坏值，超出（理论上不会）就从大的往回削
export function cleanAlloc(a, L) {
  const out = {}, cap = capPts(L);
  for (const k of STAT_KEYS) out[k] = Math.max(0, Math.min(cap, Math.floor(+a?.[k] || 0)));
  let over = spentPts(out) - freePts(L);
  while (over > 0) { const k = STAT_KEYS.reduce((m, x) => (out[x] > out[m] ? x : m)); const d = Math.min(over, out[k]); out[k] -= d; over -= d; }
  return out;
}
// 剩下的自由点：按现在的比例分（一点没分过就四项拉平），受单项上限限制
export function spreadLike(a, L) {
  const out = { ...a }, cap = capPts(L), used = spentPts(a);
  let left = freePts(L) - used;
  const w = (k) => (used ? (a[k] || 0) / used : 1 / STAT_KEYS.length);
  const all = used + left, target = (k) => Math.min(cap, Math.round(all * w(k)));
  for (const k of STAT_KEYS) { const d = Math.max(0, Math.min(left, target(k) - out[k])); out[k] += d; left -= d; }
  while (left > 0) { // 取整剩下的、或者被上限挡住的，补给还能加的那项
    const k = STAT_KEYS.filter((x) => out[x] < cap).sort((x, y) => w(y) - w(x) || out[x] - out[y])[0];
    if (!k) break; out[k]++; left--;
  }
  return out;
}
// 剩下的自由点四项拉平
export function evenSpread(a, L) {
  const out = { ...a }, cap = capPts(L);
  let left = freePts(L) - spentPts(out);
  while (left > 0) { const k = STAT_KEYS.filter((x) => out[x] < cap).sort((x, y) => out[x] - out[y])[0]; if (!k) break; out[k]++; left--; }
  return out;
}

const soft = (n, s) => 1 - Math.exp(-n / s);
// 力量 / 体质 / 精神 = 境界曲线 × (这项占总点数的比例 ÷ 25%)^SHAPE：
//   境界决定大头（小境界 ×1.1、大境界 ×1.5），加点决定偏向——占 35%（上限）约 ×1.5，只有固定点（7.5%）约 ×0.24。
//   以前是每点直接乘法叠加，偏科到后期会差几十倍（筑基主修力量就是平均的 3 倍多，妖兽一两下就死），所以改成看比例。
export const SHAPE = 1.2;
const shareMul = (L, n) => { const T = totalPts(L); return T ? (n / T / SHARE) ** SHAPE : 1; };
// 第 L 层、这样分配时的全部数值
export function derive(L, a) {
  const au = autoPts(L), n = (k) => au + (a?.[k] || 0), fa = soft(n('agi'), AGI_S), fs = soft(n('spi'), SPI_S), C = curve(L);
  return {
    str: C * shareMul(L, n('str')), con: C * shareMul(L, n('con')), spi: C * shareMul(L, n('spi')),
    speed: AGI_MAX.speed * fa, dash: AGI_MAX.dash * soft(n('agi'), DASH_S), crit: AGI_MAX.crit * fa, // dash：闪避冷却少掉的比例，2.5 秒最多减到 0.5 秒
    qi: SPI_QI_MAX * fs, regen: SPI_REGEN_MAX * fs,
  };
}

// 四项平均分配的人第 L 层的倍率（L 可以是小数，按两层之间插值；超过渡劫按小境界往后外推）——妖兽按这条线涨
const lnCurve = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i <= MAX_L && isMajor(i) ? BIG_UP : SMALL_UP); return s; };
export function curve(L) {
  L = Math.max(1, L);
  const a = Math.floor(L), f = L - a;
  return Math.exp(lnCurve(a) + (lnCurve(a + 1) - lnCurve(a)) * f);
}
// 妖兽等级 → 对应的玩家层数（realm.foeLevel 的反函数）：炼气 (L−1)×0.5，筑基起 4.3 + (L−10)×1.45
export const layerForFoe = (lvl) => (lvl <= 4 ? 1 + lvl / 0.5 : lvl <= 4.3 ? 9 + (lvl - 4) / 0.3 : 10 + (lvl - 4.3) / 1.45);
// 妖兽气血按同级玩家的攻击倍率涨；伤害按 气血 × 防御 涨（体质两样一起涨，伤害要涨平方才守住同样的威胁）
// 出了炼气圈（等级 3.5 → 4.3 之间渐变），妖兽比刚到这一层的玩家再强一层（×1.1，下一层是大境界就 ×1.5）——筑基后不能一两下就砍死
export const FOE_AHEAD = 1;
export const foeLayer = (lvl) => layerForFoe(Math.max(0, lvl)) + FOE_AHEAD * Math.min(1, Math.max(0, (lvl - 3.5) / 0.8));
export const foeHpMul = (lvl) => curve(foeLayer(lvl));
export const foeDmgMul = (lvl) => foeHpMul(lvl) ** 2;

// 大数字：1.2万 / 3.4亿
export function fmtNum(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '亿';
  if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '万';
  return String(n);
}
export const fmtMul = (v) => '×' + (v >= 100 ? fmtNum(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
