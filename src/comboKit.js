// 试炼场三种武器（GDD 原型：拳 / 剑 / 符）：连招树、灵力消耗、四个技能槽、五行。
// 剑的招式在 comboAir.js；拳和符的招式、连招树在这里。
import { AIR_MOVES, AIR_TREE, AIR_ROUTES } from './comboAir.js';

// 五行相克：KE[a] 克 b。金克木、木克土、土克水、水克火、火克金
export const ELEM = ['金', '木', '水', '火', '土'];
export const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

// 剑的灵力消耗（连招第一击 slash1 免费）
const SWORD_QI = { slash2: 5, rise: 8, slash3: 8, flurry: 12, whirl: 12, pierce: 10, backslash: 12, chase: 15, quake: 18, gale: 20, thunder: 20, airFlurry: 20, meteor: 30, spike: 25, skyspin: 25 };
for (const k in SWORD_QI) AIR_MOVES[k].qi = SWORD_QI[k];

const arcH = (t, o) => ({ t, shape: 'arc', range: 2.2, arc: 1.1, ...o });
const boltH = (t, o) => ({ t, shape: 'bolt', spd: 22, range: 9, dmg: 9, knock: 4, ...o });

// 拳：近身，快招连环，慢招崩拳 / 重崩
export const FIST_MOVES = {
  ft_jab1: { name: '拳·一', pose: 'thrust', dur: 0.26, cancel: 0.16, color: '#ffe28a', motion: [{ t0: 0, t1: 0.08, dist: 0.6, seek: true }],
    hits: [arcH(0.08, { range: 1.9, arc: 1.2, dmg: 8, knock: 3 })] },
  ft_jab2: { name: '拳·二', pose: 'thrust', dur: 0.26, cancel: 0.16, color: '#ffe28a', qi: 4, motion: [{ t0: 0, t1: 0.08, dist: 0.6, seek: true }],
    hits: [arcH(0.08, { range: 1.9, arc: 1.2, dmg: 8, knock: 3 })] },
  ft_crush: { name: '崩拳', pose: 'over', dur: 0.5, cancel: 0.36, color: '#ffb84a', qi: 12, motion: [{ t0: 0, t1: 0.14, dist: 1.2, seek: true }],
    hits: [arcH(0.22, { range: 2.3, arc: 0.9, dmg: 22, knock: 12, stop: 0.06, shake: 0.3 })] },
  ft_hook: { name: '勾拳', pose: 'U', dur: 0.4, cancel: 0.28, color: '#ffe28a', qi: 8, motion: [{ t0: 0, t1: 0.1, dist: 0.5 }],
    hits: [arcH(0.14, { range: 2.2, arc: 1.3, dmg: 13, knock: 6, launch: 3 })] },
  ft_quake: { name: '撼山', pose: 'over', dur: 0.8, cancel: 0.62, end: true, color: '#ffb84a', qi: 20,
    hits: [{ t: 0.3, shape: 'circle', at: 1.2, r: 2.4, dmg: 16, knock: 8, stop: 0.05, shake: 0.3 }, { t: 0.45, shape: 'circle', at: 2.6, r: 2.2, dmg: 12, knock: 10, stop: 0.04 }] },
  ft_flurry: { name: '连环拳', pose: 'thrust', dur: 0.5, cancel: 0.4, end: true, color: '#ffe28a', qi: 12,
    hits: [0.06, 0.14, 0.22, 0.3, 0.38].map((t, i) => arcH(t, { range: 2.2, arc: 0.6, dmg: 4, knock: i < 4 ? 1 : 9, stop: 0.02 })) },
  ft_bagua: { name: '八极靠', pose: 'over', dur: 0.6, cancel: 0.45, end: true, color: '#ffe28a', qi: 20, motion: [{ t0: 0, t1: 0.14, dist: 1.5, seek: true }],
    hits: [{ t: 0.2, shape: 'circle', at: 1.2, r: 2.2, dmg: 26, knock: 16, launch: 4, stop: 0.08, shake: 0.4 }] },
  ft_crush2: { name: '重崩', pose: 'over', dur: 0.6, cancel: 0.44, end: true, color: '#ffb84a', qi: 25, motion: [{ t0: 0, t1: 0.16, dist: 1.4, seek: true }],
    hits: [arcH(0.24, { range: 2.6, arc: 1.0, dmg: 30, knock: 18, stop: 0.08, shake: 0.45 })] },
};
export const FIST_TREE = {
  '': 'ft_jab1', F: 'ft_jab2', S: 'ft_crush',
  FF: 'ft_hook', FS: 'ft_quake', FFF: 'ft_flurry', FFS: 'ft_bagua',
  SF: 'ft_hook', SS: 'ft_crush2',
};
export const FIST_ROUTES = [
  { name: '连环拳', seq: 'FFF', tag: '5连 · 近身' },
  { name: '八极靠', seq: 'FFS', tag: '4连 · 贴身爆发' },
  { name: '撼山', seq: 'FS', tag: '3连 · 范围' },
  { name: '崩勾', seq: 'SF', tag: '3连 · 慢起手' },
  { name: '重崩', seq: 'SS', tag: '3连 · 重击' },
  { name: '连勾', seq: 'FF', tag: '3连 · 挑' },
];

// 符：远程投掷、陷阱。陷阱 keep = 布下后等敌人踩 / 引爆，最多 6 秒
export const TALIS_MOVES = {
  tl_throw: { name: '投符', pose: 'thrust', dur: 0.3, cancel: 0.2, color: '#fff3c0', hits: [boltH(0.12)] },
  tl_fan: { name: '连符', pose: 'thrust', dur: 0.36, cancel: 0.26, color: '#fff3c0', qi: 6,
    hits: [boltH(0.12, { ang: -0.3 }), boltH(0.12, { ang: 0 }), boltH(0.12, { ang: 0.3 })] },
  tl_trap: { name: '陷阱符', pose: 'over', dur: 0.45, cancel: 0.34, color: '#ffe28a', qi: 12,
    hits: [{ t: 0.2, shape: 'trap', at: 3.5, delay: 0.6, keep: true, r: 2.2, dmg: 20, knock: 10, launch: 3 }] },
  tl_lightning: { name: '雷符', pose: 'thrust', dur: 0.36, cancel: 0.26, color: '#c8a8ff', qi: 10,
    hits: [boltH(0.12, { pierce: true, dmg: 16, knock: 6, spd: 26, range: 11 })] },
  tl_root: { name: '缚符', pose: 'over', dur: 0.45, cancel: 0.34, end: true, color: '#9ef0ff', qi: 12,
    hits: [{ t: 0.2, shape: 'trap', at: 3, delay: 0.35, r: 2.4, dmg: 6, knock: 0, root: 1.5 }] },
  tl_rain: { name: '符雨', pose: 'over', dur: 0.6, cancel: 0.46, end: true, color: '#fff3c0', qi: 22,
    hits: [{ t: 0.25, shape: 'rain', at: 4, n: 6, spread: 2.5, delay: 0.9, r: 1.8, dmg: 9, knock: 6 }] },
  tl_det: { name: '引爆', pose: 'over', dur: 0.4, cancel: 0.3, end: true, color: '#ff8a5a', qi: 15,
    hits: [{ t: 0.1, shape: 'detonate', mul: 1.3 }] },
  tl_seal: { name: '镇煞符', pose: 'over', dur: 0.7, cancel: 0.55, end: true, color: '#ff8a5a', qi: 25,
    hits: [{ t: 0.2, shape: 'trap', at: 4, delay: 0.8, r: 3.4, dmg: 30, knock: 14, launch: 6, stop: 0.08, shake: 0.5 }] },
};
export const TALIS_TREE = {
  '': 'tl_throw', F: 'tl_fan', S: 'tl_trap',
  FF: 'tl_lightning', FS: 'tl_root', FFF: 'tl_rain',
  SF: 'tl_det', SS: 'tl_seal',
};
export const TALIS_ROUTES = [
  { name: '符雨', seq: 'FFF', tag: '5连 · 范围落符' },
  { name: '雷符', seq: 'FF', tag: '3连 · 穿透' },
  { name: '缚符', seq: 'FS', tag: '3连 · 定身' },
  { name: '引爆', seq: 'SF', tag: '3连 · 引爆陷阱' },
  { name: '镇煞', seq: 'SS', tag: '3连 · 重压' },
  { name: '陷阱', seq: 'S', tag: '2连 · 布阵' },
];

for (const M of [FIST_MOVES, TALIS_MOVES]) for (const k in M) M[k].id = k;

// 技能槽（Q E F C）：灵力不够或在冷却中按不出。id 对应 arena.js 里的 SKILLS
export const SKILL_KEYS = ['KeyQ', 'KeyE', 'KeyF', 'KeyC'];
export const KITS = [
  { id: 'sword', name: '剑', moves: AIR_MOVES, tree: AIR_TREE, routes: AIR_ROUTES, skills: [
    { id: 'sw_spin', name: '剑旋', qi: 30, cd: 6 }, { id: 'sw_wave', name: '剑气', qi: 25, cd: 5 },
    { id: 'sw_lift', name: '挑空', qi: 35, cd: 10 }, { id: 'qi', name: '回气', qi: 0, cd: 8 }] },
  { id: 'fist', name: '拳', moves: FIST_MOVES, tree: FIST_TREE, routes: FIST_ROUTES, skills: [
    { id: 'ft_shock', name: '震拳', qi: 25, cd: 5 }, { id: 'ft_bell', name: '金钟', qi: 20, cd: 8 },
    { id: 'ft_charge', name: '撞山', qi: 25, cd: 6 }, { id: 'qi', name: '回气', qi: 0, cd: 8 }] },
  { id: 'talisman', name: '符', moves: TALIS_MOVES, tree: TALIS_TREE, routes: TALIS_ROUTES, skills: [
    { id: 'tl_nova', name: '符爆', qi: 25, cd: 5 }, { id: 'tl_guard', name: '护符', qi: 20, cd: 8 },
    { id: 'tl_put', name: '埋符', qi: 20, cd: 4 }, { id: 'qi', name: '回气', qi: 0, cd: 8 }] },
];
