import * as THREE from 'three';
import { flat, toon, glow, mesh, at, angDiff, lerpAngle, setFlash, clamp } from './util.js';
import { ARENA } from './world.js';
import { SIG } from './bossmoves.js';

const G = {};
function geos() {
  if (G.box) return G;
  G.box = flat(new THREE.BoxGeometry(1, 1, 1));
  G.ico = flat(new THREE.IcosahedronGeometry(1, 0));
  G.ico1 = flat(new THREE.IcosahedronGeometry(1, 1));
  G.cone = flat(new THREE.ConeGeometry(1, 1, 5));
  G.oct = flat(new THREE.OctahedronGeometry(1, 0));
  G.legBox = flat(new THREE.BoxGeometry(1, 1, 1)).translate(0, -0.5, 0);
  return G;
}

// 妖兽（GDD 第 4 / 7 节）。kind = 行为：charger 前摇后直线冲撞 | shooter 保持距离吐弹 | brute 预警圈砸地。
// look = 模型；c = 配色 [主色, 暗色, 眼睛 / 发光]；shot = 弹的颜色。elem = 五行属性（克制 ×1.5，被克 ×0.75）
// drops = [物品 id, 概率]；stones = 灵石 [最少, 最多]；h = 头顶血条高度
const T = (o) => ({ r: 0.75, speed: 3, dmg: 10, xp: 14, drops: [['yaodan', 0.3]], h: 1.7, ...o });
export const TYPES = {
  // 各处都有
  boar: T({ name: '野猪妖', hp: 75, speed: 3.4, dmg: 12, elem: '土', kind: 'charger', look: 'boar', c: ['#7a5a3e', '#4a3424', '#ff3a2a'], drops: [['yaodan', 0.35], ['hide', 0.5], ['tusk', 0.25]] }),
  spider: T({ name: '毒蛛', hp: 50, r: 0.7, speed: 3.0, dmg: 8, xp: 12, elem: '木', kind: 'shooter', look: 'spider', c: ['#3d2f4a', '#6adf6a', '#7aff5a'], shot: '#7aff5a', h: 1.4, drops: [['yaodan', 0.3], ['silk', 0.5], ['venom', 0.2]] }),
  golem: T({ name: '石傀', hp: 150, r: 0.9, speed: 2.2, dmg: 18, xp: 26, elem: '金', kind: 'brute', look: 'golem', c: ['#6b6b78', '#55556a', '#ff9a3a'], h: 2.7, drops: [['shard', 0.5], ['core_stone', 0.2], ['iron', 0.4]], stones: [1, 2] }),
  // 雪峰
  snowwolf: T({ name: '雪狼', hp: 70, speed: 4.2, dmg: 12, xp: 16, elem: '水', kind: 'charger', look: 'wolf', c: ['#e8eef2', '#9aa8b4', '#7ad8ff'], drops: [['yaodan', 0.35], ['hide', 0.5]] }),
  icebeast: T({ name: '冰甲兽', hp: 160, r: 0.95, speed: 2.0, dmg: 18, xp: 28, elem: '水', kind: 'brute', look: 'golem', c: ['#a8d8f0', '#6a98b8', '#bff4ff'], h: 2.7, drops: [['yaodan', 0.4], ['shard', 0.4]] }),
  // 竹海
  wolf: T({ name: '赤眼狼', hp: 65, speed: 4.4, dmg: 11, xp: 15, elem: '火', kind: 'charger', look: 'wolf', c: ['#7a7470', '#4a4440', '#ff4a2a'], drops: [['yaodan', 0.35], ['hide', 0.5]] }),
  python: T({ name: '青蟒', hp: 110, r: 0.8, speed: 2.6, dmg: 15, xp: 22, elem: '木', kind: 'charger', look: 'snake', c: ['#4a9a4a', '#2a5a2a', '#ffe24a'], h: 1.2, drops: [['yaodan', 0.45], ['hide', 0.4]] }),
  // 沼泽
  bug: T({ name: '毒虫', hp: 45, r: 0.6, speed: 3.2, dmg: 8, xp: 12, elem: '木', kind: 'shooter', look: 'bug', c: ['#3a6a3a', '#8adf3a', '#c8ff5a'], shot: '#9aff3a', h: 1.2, drops: [['yaodan', 0.3], ['venom', 0.35]] }),
  jiao: T({ name: '小蛟', hp: 120, r: 0.85, speed: 3.0, dmg: 16, xp: 24, elem: '水', kind: 'charger', look: 'snake', c: ['#3a6ab8', '#24407a', '#9ef0ff'], h: 1.3, drops: [['yaodan', 0.5], ['spring', 0.4]] }),
  // 火山
  firecrow: T({ name: '火鸦', hp: 50, r: 0.6, speed: 3.6, dmg: 10, xp: 15, elem: '火', kind: 'shooter', look: 'crow', c: ['#2a2224', '#c8401a', '#ffb03a'], shot: '#ff7a2a', h: 2.4, drops: [['yaodan', 0.3], ['shard', 0.3]] }),
  flamebeast: T({ name: '炎兽', hp: 100, r: 0.85, speed: 3.4, dmg: 15, xp: 22, elem: '火', kind: 'charger', look: 'boar', c: ['#a83a1a', '#5a1a0a', '#ffb03a'], drops: [['yaodan', 0.45], ['hide', 0.3]] }),
  // 沙漠遗迹
  scorpion: T({ name: '沙蝎', hp: 70, r: 0.75, speed: 3.0, dmg: 11, xp: 16, elem: '土', kind: 'shooter', look: 'scorpion', c: ['#c8a060', '#8a6a3a', '#ff5a3a'], shot: '#ffb03a', h: 1.5, drops: [['yaodan', 0.35], ['venom', 0.3]] }),
  puppet: T({ name: '沙傀儡', hp: 170, r: 0.9, speed: 2.1, dmg: 18, xp: 28, elem: '金', kind: 'brute', look: 'golem', c: ['#c8a878', '#9a7a50', '#ffd27a'], h: 2.7, drops: [['shard', 0.5], ['core_stone', 0.25], ['iron', 0.4]], stones: [1, 2] }),
  // 古战场
  zombie: T({ name: '行尸', hp: 130, r: 0.8, speed: 1.8, dmg: 16, xp: 22, elem: '土', kind: 'brute', look: 'zombie', c: ['#7a8a6a', '#4a5a44', '#c8ff9a'], h: 2.2, drops: [['yaodan', 0.3], ['shard', 0.3]] }),
  ghost: T({ name: '游魂', hp: 55, r: 0.65, speed: 3.2, dmg: 11, xp: 16, elem: '阴', kind: 'shooter', look: 'ghost', c: ['#b8c8ff', '#6a7ab8', '#e8f0ff'], shot: '#c8d8ff', h: 2.2, night: true, drops: [['yaodan', 0.3], ['shard', 0.35]] }),
  // 夜里才有
  flower: T({ name: '花妖', hp: 60, r: 0.65, speed: 2.4, dmg: 10, xp: 16, elem: '木', kind: 'shooter', look: 'flower', c: ['#3a8a3a', '#ff7ab8', '#fff0a0'], shot: '#ff9ac8', h: 1.8, night: true, drops: [['yaodan', 0.3], ['yuehua', 0.25], ['ninglu', 0.25]] }),
  // 黑吃黑：坊市拍到重宝后，回程路上截杀的劫修
  bandit: T({ name: '劫修', hp: 140, r: 0.7, speed: 4.0, dmg: 16, xp: 30, elem: '金', kind: 'charger', look: 'zombie', c: ['#3a3e48', '#22242a', '#ff4a3a'], h: 2.2, drops: [['yaodan', 0.5], ['shard', 0.5]], stones: [2, 5] }),
  // 魔道：血魔宫的魔修（魔道入侵村庄、青锋剑派灭门危机）
  demoncult: T({ name: '魔修', hp: 150, r: 0.7, speed: 4.2, dmg: 17, xp: 34, elem: '火', kind: 'charger', look: 'zombie', c: ['#5a1a24', '#2a0a10', '#ff3a3a'], h: 2.2, drops: [['yaodan', 0.5], ['shard', 0.4]], stones: [2, 4] }),
  foxclone: T({ name: '狐影', hp: 1, r: 1.4, speed: 6, dmg: 20, xp: 0, elem: '火', kind: 'charger', look: 'wolf', c: ['#f0a85a', '#a85a2a', '#ff6aff'], h: 3.6, drops: [] }), // 九尾妖狐的分身：一碰就散
  insect: T({ name: '妖虫', hp: 40, r: 0.55, speed: 3.6, dmg: 7, xp: 10, elem: '木', kind: 'charger', look: 'bug', c: ['#5a3a2a', '#c8a03a', '#ffcc3a'], h: 1.1, drops: [['yaodan', 0.2]] }),
};
// 妖王（GDD 第 7 节：20 个；炼气圈 1、筑基 / 金丹 / 元婴各 6、化神 1，再加原型的赤岩妖王）。
// 复用本地妖兽的模型放大，多阶段；只掉材料（突破材料 + 丹方）。attacks 从 slam 砸地 / ring 弹幕 / charge 冲锋 / summon 召唤 里挑，
// sig = 自己的招（bossmoves.js），狂暴后出得更勤
const B = (o) => ({ r: 1.9, speed: 2.6, dmg: 24, xp: 800, boss: true, h: 4.6, scale: 2.2, attacks: ['slam', 'ring', 'charge'], sig: [], drops: [], ...o });
export const BOSSES = {
  boss: B({ name: '赤岩妖王', hp: 1500, elem: '火', kind: 'brute', look: 'golem', c: ['#5a3a3a', '#3e2828', '#ff4a1a'], minion: 'golem', drop: 'heart', recipe: 'pill_break', lvl: 2, scale: 2.3, attacks: ['slam', 'ring'], sig: ['quake', 'magma'] }),
  wolfking: B({ name: '赤枫狼王', hp: 1500, elem: '火', kind: 'charger', look: 'wolf', c: ['#a84a2a', '#5a2414', '#ffd23a'], minion: 'wolf', drop: 'wolf_fang', recipe: 'pill_break', lvl: 4, moon: true, attacks: ['charge', 'slam'], sig: ['pounce', 'howl'] }),
  frosthorn: B({ name: '霜角兽王', hp: 1600, elem: '水', kind: 'charger', look: 'boar', c: ['#e0eef8', '#8aa8c0', '#7ad8ff'], minion: 'snowwolf', drop: 'b_frosthorn', recipe: 'pill_break2', lvl: 9, attacks: ['slam', 'ring'], sig: ['frostnova', 'icecharge'] }),
  viperking: B({ name: '竹叶青王', hp: 1500, elem: '木', kind: 'charger', look: 'snake', c: ['#5ac85a', '#2a6a2a', '#ffe24a'], minion: 'python', drop: 'b_viper', recipe: 'pill_break2', lvl: 9, attacks: ['charge', 'ring'], sig: ['venom', 'constrict'] }),
  spiderqueen: B({ name: '毒蛛后', hp: 1400, elem: '木', kind: 'shooter', look: 'spider', c: ['#4a2a5a', '#c84ac8', '#ff6aff'], shot: '#e05aff', minion: 'spider', drop: 'b_spiderqueen', recipe: 'pill_break2', lvl: 9, attacks: ['ring'], sig: ['web', 'eggs', 'venom'] }),
  flameking: B({ name: '炎兽王', hp: 1600, elem: '火', kind: 'charger', look: 'boar', c: ['#c84a1a', '#6a1a0a', '#ffd03a'], minion: 'flamebeast', drop: 'b_flamehorn', recipe: 'pill_break2', lvl: 9, attacks: ['slam', 'ring'], sig: ['firetrail', 'eruption'] }),
  bronze: B({ name: '铜甲傀儡', hp: 1800, elem: '金', kind: 'brute', look: 'golem', c: ['#b8783a', '#7a4a1a', '#ffd27a'], minion: 'puppet', drop: 'b_bronze', recipe: 'pill_break2', lvl: 9, attacks: ['slam', 'ring'], sig: ['whirl', 'stomp'] }),
  ghostgeneral: B({ name: '游魂将', hp: 1400, elem: '阴', kind: 'shooter', look: 'ghost', c: ['#8a9ae8', '#4a5aa8', '#ffffff'], shot: '#b8c8ff', minion: 'ghost', drop: 'b_ghostseal', recipe: 'pill_break2', lvl: 9, attacks: ['ring', 'slam'], sig: ['blink', 'souls'] }),
  snowwolfking: B({ name: '雪狼王', hp: 1800, elem: '水', kind: 'charger', look: 'wolf', c: ['#f4f8fc', '#a8b8c8', '#7ad8ff'], minion: 'snowwolf', drop: 'b_snowwolf', recipe: 'pill_break3', lvl: 15, attacks: ['charge'], sig: ['pounce', 'icicles', 'frostnova'] }),
  pythonking: B({ name: '青鳞蟒王', hp: 1900, elem: '木', kind: 'charger', look: 'snake', c: ['#3a8a6a', '#1a4a3a', '#ffe24a'], minion: 'python', drop: 'b_python', recipe: 'pill_break3', lvl: 15, attacks: ['charge', 'slam'], sig: ['constrict', 'whirl'] }),
  jiaoking: B({ name: '沼蛟', hp: 1900, elem: '水', kind: 'charger', look: 'snake', c: ['#2a5ab8', '#14306a', '#9ef0ff'], minion: 'jiao', drop: 'b_jiao', recipe: 'pill_break3', lvl: 15, attacks: ['charge', 'ring'], sig: ['tidewave', 'whirlpool'] }),
  crowking: B({ name: '火鸦王', hp: 1600, elem: '火', kind: 'shooter', look: 'crow', c: ['#1a1418', '#e04a1a', '#ffd03a'], shot: '#ff8a2a', minion: 'firecrow', drop: 'b_crow', recipe: 'pill_break3', lvl: 15, attacks: ['ring'], sig: ['dive', 'foxfire'] }),
  scorpionking: B({ name: '沙蝎王', hp: 1800, elem: '土', kind: 'shooter', look: 'scorpion', c: ['#d8a850', '#8a5a2a', '#ff4a2a'], shot: '#ffa03a', minion: 'scorpion', drop: 'b_scorpion', recipe: 'pill_break3', lvl: 15, attacks: ['ring', 'charge'], sig: ['burrow', 'tailstab'] }),
  zombieking: B({ name: '尸王', hp: 2000, elem: '土', kind: 'brute', look: 'zombie', c: ['#6a7a5a', '#3a4a34', '#d0ff8a'], minion: 'zombie', drop: 'b_zombie', recipe: 'pill_break3', lvl: 15, attacks: ['slam'], sig: ['grasp', 'raise'] }),
  snowdemon: B({ name: '雪妖王', hp: 2200, elem: '水', kind: 'shooter', look: 'ghost', c: ['#e8f4ff', '#8ab8e0', '#7ad8ff'], shot: '#bff4ff', minion: 'icebeast', drop: 'b_snowdemon', recipe: 'pill_break4', lvl: 20, attacks: ['ring'], sig: ['spiral', 'frostnova', 'icicles'] }),
  fox: B({ name: '九尾妖狐', hp: 2100, elem: '火', kind: 'charger', look: 'wolf', c: ['#f0a85a', '#a85a2a', '#ff6aff'], minion: 'wolf', drop: 'b_fox', recipe: 'pill_break4', lvl: 20, attacks: ['charge', 'ring'], sig: ['foxfire', 'clones', 'blink'] }),
  jiaomu: B({ name: '千年蛟母', hp: 2400, elem: '水', kind: 'charger', look: 'snake', c: ['#1a4ac8', '#0a2470', '#9ef0ff'], minion: 'jiao', drop: 'b_jiaomu', recipe: 'pill_break4', lvl: 20, attacks: ['charge'], sig: ['tsunami', 'tidewave', 'whirlpool'] }),
  qilin: B({ name: '炎麒麟', hp: 2400, elem: '火', kind: 'charger', look: 'boar', c: ['#e8a83a', '#a83a1a', '#fff0a0'], minion: 'flamebeast', drop: 'b_qilin', recipe: 'pill_break4', lvl: 20, attacks: ['slam'], sig: ['meteor', 'firetrail', 'eruption'] }),
  swordpuppet: B({ name: '古剑傀', hp: 2400, elem: '金', kind: 'brute', look: 'golem', c: ['#8a8aa0', '#4a4a60', '#9ef0ff'], minion: 'puppet', drop: 'b_swordpuppet', recipe: 'pill_break4', lvl: 20, attacks: ['ring'], sig: ['swordrain', 'whirl', 'stomp'] }),
  ghostking: B({ name: '鬼王', hp: 2200, elem: '阴', kind: 'shooter', look: 'ghost', c: ['#6a4a9a', '#2a1a4a', '#ff6a8a'], shot: '#c87aff', minion: 'ghost', drop: 'b_ghostking', recipe: 'pill_break4', lvl: 20, attacks: ['ring'], sig: ['soulpull', 'blink', 'souls'] }),
  roc: B({ name: '太古雷鹏', hp: 3200, elem: '雷', kind: 'shooter', look: 'crow', c: ['#3a3a5a', '#c8b8ff', '#e8e0ff'], shot: '#d8c8ff', minion: 'firecrow', drop: 'b_roc', recipe: 'pill_break5', lvl: 25, scale: 3, attacks: ['ring'], sig: ['thunder', 'storm', 'dive'] }),
};
for (const [k, v] of Object.entries(BOSSES)) TYPES[k] = v;
export const BOSS_BY_NAME = Object.fromEntries(Object.entries(BOSSES).map(([k, v]) => [v.name, k]));
// 各扇区的本地妖兽（GDD 第 7 节「六个扇区」）；走得越远越常见
export const SECTOR_MOBS = {
  snow: ['snowwolf', 'snowwolf', 'icebeast'], bamboo: ['wolf', 'wolf', 'python'], swamp: ['bug', 'bug', 'jiao'],
  volcano: ['firecrow', 'flamebeast', 'flamebeast'], desert: ['scorpion', 'scorpion', 'puppet'], battle: ['zombie', 'ghost', 'ghost'],
};
const GRAV = 26;
const NIGHT = 0.5; // nightK 超过这个算夜晚：敌人属性 +30%，掉落 +50%（GDD 第 3 节）；血月再 +50% / 掉落翻倍

// ---------- 模型：几种骨架 × 配色 ----------
function build(T) {
  const g = geos(), mats = [];
  const M = (c, o = {}) => { const m = toon(c, { ...o, unique: true }); mats.push(m); return m; };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = { body, legs: [], arms: [], wings: [], segs: [] };
  const part = (geo, mat, sx, sy, sz, x, y, z, parent = body) => { const m = mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };
  const [ca, cb, ce] = T.c, a = M(ca), b = M(cb), eye = glow(ce, 3);
  const quadLegs = (pts, w, len, mat) => { for (const [x, z] of pts) { const l = new THREE.Group(); l.position.set(x, len, z); body.add(l); part(g.legBox, mat, w, len, w, 0, 0, 0, l); parts.legs.push(l); } };
  switch (T.look) {
    case 'boar': {
      const tusk = M('#f4ecd8'), snout = M(T.boss ? cb : '#c48a7a');
      part(g.box, a, 1.1, 0.8, 1.5, 0, 0.75, 0); part(g.box, b, 0.5, 0.3, 1.3, 0, 1.2, -0.05);
      parts.head = new THREE.Group(); parts.head.position.set(0, 0.8, 0.85); body.add(parts.head);
      part(g.box, a, 0.75, 0.62, 0.6, 0, 0, 0.1, parts.head); part(g.box, snout, 0.38, 0.28, 0.2, 0, -0.08, 0.45, parts.head);
      for (const s of [-1, 1]) { const t = part(g.cone, tusk, 0.07, 0.3, 0.07, s * 0.22, -0.15, 0.48, parts.head); t.rotation.x = -0.6; part(g.box, eye, 0.08, 0.08, 0.04, s * 0.2, 0.12, 0.41, parts.head); }
      if (T.boss) for (const s of [-1, 1]) { const h = part(g.cone, eye, 0.1, 0.55, 0.1, s * 0.3, 0.42, 0, parts.head); h.rotation.z = -s * 0.5; }
      quadLegs([[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]], 0.24, 0.5, b);
      break;
    }
    case 'wolf': {
      part(g.box, a, 0.75, 0.6, 1.4, 0, 0.85, 0); part(g.box, b, 0.4, 0.2, 1.2, 0, 1.18, -0.05);
      parts.head = new THREE.Group(); parts.head.position.set(0, 1.05, 0.8); body.add(parts.head);
      part(g.box, a, 0.52, 0.48, 0.5, 0, 0, 0.05, parts.head); part(g.box, b, 0.28, 0.24, 0.4, 0, -0.08, 0.42, parts.head);
      for (const s of [-1, 1]) { part(g.cone, a, 0.11, 0.3, 0.11, s * 0.17, 0.33, -0.02, parts.head); part(g.box, eye, 0.08, 0.06, 0.04, s * 0.14, 0.08, 0.31, parts.head); }
      const tail = part(g.cone, a, 0.14, 0.8, 0.14, 0, 1.0, -0.95); tail.rotation.x = -2.2; parts.tail = tail;
      if (T.boss) for (let i = 0; i < (T.name === '九尾妖狐' ? 8 : 0); i++) { const t = part(g.cone, a, 0.12, 0.8, 0.12, (i - 3.5) * 0.12, 1.05, -0.9); t.rotation.set(-2.1, 0, (i - 3.5) * 0.18); }
      quadLegs([[-0.27, 0.5], [0.27, 0.5], [-0.27, -0.5], [0.27, -0.5]], 0.18, 0.6, b);
      break;
    }
    case 'snake': {
      for (let i = 0; i < 6; i++) { const s = 0.42 - i * 0.04, seg = part(g.ico1, i % 2 ? b : a, s, s * 0.85, s, 0, s * 0.85, -i * 0.55); parts.segs.push(seg); }
      parts.head = new THREE.Group(); parts.head.position.set(0, 0.55, 0.5); body.add(parts.head);
      part(g.box, a, 0.55, 0.4, 0.62, 0, 0, 0, parts.head);
      for (const s of [-1, 1]) part(g.box, eye, 0.09, 0.08, 0.05, s * 0.2, 0.1, 0.3, parts.head);
      if (T.boss || T.name.includes('蛟')) for (const s of [-1, 1]) { const h = part(g.cone, eye, 0.06, 0.4, 0.06, s * 0.15, 0.3, -0.1, parts.head); h.rotation.x = -0.6; }
      break;
    }
    case 'spider': case 'bug': case 'scorpion': {
      const spider = T.look === 'spider', sc = T.look === 'scorpion';
      part(g.ico1, a, spider ? 0.55 : 0.6, spider ? 0.45 : 0.38, spider ? 0.65 : 0.75, 0, spider ? 0.75 : 0.55, -0.35);
      part(g.box, M(cb, { emissive: cb, ei: 0.4 }), 0.12, 0.05, 0.5, 0, spider ? 1.17 : 0.93, -0.4);
      part(g.ico, a, 0.32, 0.28, 0.32, 0, spider ? 0.62 : 0.5, 0.25);
      for (const s of [-1, 1]) part(g.box, eye, 0.07, 0.07, 0.05, s * 0.1, spider ? 0.7 : 0.58, 0.55);
      const n = spider ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const s = i < n / 2 ? -1 : 1, k = i % (n / 2);
        const l = new THREE.Group(); l.position.set(s * 0.25, spider ? 0.65 : 0.45, 0.3 - k * 0.25); body.add(l);
        const up = new THREE.Group(); up.rotation.z = s * -0.9; l.add(up);
        part(g.box, a, 0.07, 0.07, spider ? 0.6 : 0.45, 0, 0, 0.3, up);
        const low = new THREE.Group(); low.position.set(0, 0, spider ? 0.6 : 0.45); low.rotation.x = 1.2; up.add(low);
        part(g.box, a, 0.06, 0.06, spider ? 0.7 : 0.5, 0, 0, 0.35, low);
        l.rotation.y = Math.PI / 2 * s + (k - (n / 2 - 1) / 2) * 0.45 * s;
        parts.legs.push(l);
      }
      if (sc) {
        for (const s of [-1, 1]) { part(g.box, b, 0.2, 0.15, 0.5, s * 0.35, 0.5, 0.75); part(g.box, b, 0.28, 0.12, 0.25, s * 0.38, 0.5, 1.05); }
        let px = 0, py = 0.7, pz = -0.95;
        for (let i = 0; i < 4; i++) { part(g.ico, i % 2 ? b : a, 0.16, 0.16, 0.16, 0, py, pz); pz -= 0.15 - i * 0.05; py += 0.28; }
        part(g.cone, eye, 0.1, 0.35, 0.1, px, py, pz + 0.2).rotation.x = 2.4;
      }
      break;
    }
    case 'crow': {
      const yb = 1.4;
      part(g.ico1, a, 0.38, 0.34, 0.6, 0, yb, 0);
      parts.head = new THREE.Group(); parts.head.position.set(0, yb + 0.25, 0.5); body.add(parts.head);
      part(g.ico1, a, 0.25, 0.25, 0.25, 0, 0, 0, parts.head);
      part(g.cone, M('#e8c03a'), 0.07, 0.3, 0.07, 0, -0.02, 0.28, parts.head).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) part(g.box, eye, 0.06, 0.06, 0.04, s * 0.12, 0.06, 0.2, parts.head);
      for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.3, yb + 0.1, 0); body.add(w); part(g.box, b, 0.9, 0.06, 0.45, s * 0.45, 0, 0, w); parts.wings.push(w); }
      part(g.box, b, 0.3, 0.05, 0.5, 0, yb, -0.6);
      break;
    }
    case 'ghost': {
      const gm = M(ca); gm.transparent = true; gm.opacity = 0.75;
      part(g.ico1, gm, 0.55, 0.6, 0.5, 0, 1.5, 0);
      const tail = part(g.cone, gm, 0.45, 1.1, 0.45, 0, 0.75, 0); tail.rotation.x = Math.PI;
      for (const s of [-1, 1]) { part(g.box, eye, 0.12, 0.16, 0.05, s * 0.17, 1.6, 0.45); const arm = new THREE.Group(); arm.position.set(s * 0.5, 1.4, 0.1); body.add(arm); part(g.cone, gm, 0.12, 0.6, 0.12, 0, -0.3, 0, arm); parts.arms.push(arm); }
      parts.float = true;
      break;
    }
    case 'flower': {
      part(g.box, a, 0.12, 1.1, 0.12, 0, 0.55, 0);
      for (let i = 0; i < 3; i++) { const l = part(g.cone, a, 0.15, 0.6, 0.06, 0, 0.3 + i * 0.25, 0); l.rotation.set(0.9, i * 2.1, 0); }
      parts.head = new THREE.Group(); parts.head.position.set(0, 1.35, 0.05); body.add(parts.head);
      for (let i = 0; i < 7; i++) { const p = part(g.cone, b, 0.18, 0.45, 0.08, 0, 0, 0, parts.head); p.rotation.set(Math.PI / 2, 0, i / 7 * Math.PI * 2); p.position.set(Math.cos(i / 7 * Math.PI * 2) * 0.22, Math.sin(i / 7 * Math.PI * 2) * 0.22, 0); }
      part(g.ico1, eye, 0.2, 0.2, 0.12, 0, 0, 0.04, parts.head);
      for (const s of [-1, 1]) { const r = new THREE.Group(); r.position.set(s * 0.15, 0.15, 0); body.add(r); part(g.legBox, a, 0.08, 0.15, 0.08, 0, 0, 0, r); parts.legs.push(r); }
      break;
    }
    default: { // golem / zombie：两条胳膊垂到地上的大块头
      const z = T.look === 'zombie', k = z ? 0.78 : 1;
      part(g.box, a, 1.2 * k, 1.0 * k, 0.8 * k, 0, 1.25 * k, 0);
      part(g.box, b, 0.9 * k, 0.5 * k, 0.7 * k, 0, 0.6 * k, 0);
      if (!z) part(g.oct, glow(ce, 3.2, true), 0.2, 0.26, 0.2, 0, 1.3, 0.42);
      parts.head = new THREE.Group(); parts.head.position.set(0, 1.95 * k, 0.05); body.add(parts.head);
      part(g.box, a, 0.55 * k, 0.45 * k, 0.5 * k, 0, 0, 0, parts.head);
      for (const s of [-1, 1]) part(g.box, eye, 0.1, 0.06, 0.04, s * 0.13 * k, 0.03, 0.26 * k, parts.head);
      if (T.boss) for (let i = -2; i <= 2; i++) { const c = part(g.cone, eye, 0.08, 0.35, 0.08, i * 0.12, 0.35, 0, parts.head); c.rotation.z = -i * 0.25; }
      for (const s of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(s * 0.8 * k, 1.6 * k, 0); body.add(arm);
        part(g.legBox, b, 0.42 * k, 1.1 * k, 0.42 * k, 0, 0, 0, arm); part(g.box, a, 0.55 * k, 0.45 * k, 0.55 * k, 0, -1.15 * k, 0, arm);
        parts.arms.push(arm);
        const l = new THREE.Group(); l.position.set(s * 0.3 * k, 0.55 * k, 0); body.add(l);
        part(g.legBox, b, 0.35 * k, 0.55 * k, 0.4 * k, 0, 0, 0, l); parts.legs.push(l);
      }
    }
  }
  if (T.boss) root.scale.setScalar(T.scale);
  return { root, parts, mats };
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.proj = [];
    this.zones = []; // 地上留着的火 / 毒 / 冰 / 漩涡（妖王招式留下的）
    this.boss = null;
    this.projGeo = flat(new THREE.IcosahedronGeometry(0.22, 0));
    // 妖王巢穴：{ type, x, z, deadDay } —— 打死后 3 天重新出现（材料不够、渡劫失败可以再打）
    this.lairs = [{ type: 'boss', x: ARENA.x, z: ARENA.y, deadDay: -99 }];
  }

  spawn(type, x, z, lvl = 0) {
    const T = TYPES[type];
    const { root, parts, mats } = build(T);
    const g = this.game, night = g.nightK > NIGHT && !T.boss, blood = night && g.bloodMoon;
    const k = (night ? 1.3 : 1) * (blood ? 1.5 : 1), hpMul = (1 + lvl * 0.35) * k;
    const e = {
      type, T, root, parts, mats, pos: root.position, r: T.r * (T.boss ? 1 : 1), hp: T.hp * hpMul, maxHp: T.hp * hpMul,
      dmg: T.dmg * (1 + lvl * 0.2) * k, lvl, night, blood, speed: T.speed, yaw: Math.random() * 6.28, kx: 0, kz: 0,
      state: 'idle', st: 0, cd: 1 + Math.random(), flash: 0, home: new THREE.Vector2(x, z),
      tx: x, tz: z, walk: Math.random() * 6, touchCd: 0, alive: true, phase: 1, queue: [], hitOnce: false, chargeDir: 0,
      elem: T.elem, boss: !!T.boss, kind: T.kind, vy: 0, airSpin: 0, airRot: 0, spiked: false, rootT: 0, stuck: [],
      gen: 0, hop: 0, hasteT: 0, open: 0, tick: null,
    };
    root.position.set(x, 0, z);
    g.scene.add(root);
    this.list.push(e);
    g.fx.burst(root.position, e.boss ? '#ff5a2a' : '#c8b8ff', e.boss ? 60 : 10, { speed: 3, up: 3 });
    return e;
  }

  remove(e) {
    e.alive = false;
    this.game.onEnemyGone?.(e);
    this.game.scene.remove(e.root);
    for (const m of e.mats) m.dispose();
    this.list.splice(this.list.indexOf(e), 1);
    if (e === this.boss) { this.boss = null; }
  }

  // h = 命中参数（combat.js / comboAir.js）：launch 挑飞 | lift 空中托住 | spike 砸向地面 | pull 吸到身前
  // tag = 伤害数字后缀（克 / 弱）
  damage(e, amt, fromX, fromZ, knock = 6, crit = false, h = null, tag = '') {
    if (!e.alive || e.hidden) return;
    if (e.fake) { this.poof(e); return; }
    const P = this.game.player, air = e.pos.y > 0.02 || e.vy > 0;
    // GDD 第 4 节：技能能打断普通妖兽的前摇；妖王只能在破绽时被技能打断，打断后倒地，倒地时挨打 ×1.5
    if (e.boss && e.state === 'down') { amt *= 1.5; tag ||= '倒'; }
    if (h?.skill && e.boss && e.state === 'open') this.knockDown(e);
    else if (h?.skill && !e.boss && e.state === 'windup') { this.stagger(e, 0.8); this.game.fx.num(e.pos, '打断', 'crit'); }
    e.hp -= amt;
    e.flash = 0.12;
    this.game.onEnemyHit?.(e, amt, crit);
    const dx = e.pos.x - fromX, dz = e.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
    const resist = e.boss ? 0.08 : e.kind === 'brute' ? 0.5 : 1;
    if (e.state !== 'charge') { const k = knock * resist * (air ? 0.7 : 1); e.kx += dx / d * k; e.kz += dz / d * k; }
    // 挑空：妖王挑不动，大块头沉一些。浮空时不能行动，前摇被打断（update 里处理）
    const lift = e.boss ? 0 : e.kind === 'brute' ? 0.6 : 1;
    if (h && lift) {
      if (h.pull) { // 吸到角色身前，连段不脱节
        const tx = P.pos.x + Math.sin(P.yaw) * 1.5, tz = P.pos.z + Math.cos(P.yaw) * 1.5;
        e.kx = e.kx * (1 - h.pull) + (tx - e.pos.x) * h.pull * 5; e.kz = e.kz * (1 - h.pull) + (tz - e.pos.z) * h.pull * 5;
      }
      if (h.spike) { e.vy = -h.spike; e.spiked = true; e.airSpin = 14; }
      else if (h.launch) { e.vy = Math.max(e.vy, h.launch * lift); e.pos.y = Math.max(e.pos.y, 0.03); e.airSpin = 3 + h.launch * 0.4; }
      else if (air) e.vy = Math.max(e.vy * 0.3, (h.lift ?? 3.5) * clamp(1 + (P.pos.y + 0.2 - e.pos.y) * 0.8, 0.15, 1.6)); // 空中挨打会被托住
    }
    const fx = this.game.fx;
    fx.num(e.pos, Math.round(amt) + (crit ? '!' : '') + tag, crit ? 'crit' : '');
    if (e.pos.y > 0) fx.nums.at(-1).p.y += e.pos.y;
    fx.burst(e.pos, crit ? '#ffe28a' : '#ffffff', crit ? 12 : 6, { speed: 5, up: 2, life: 0.3, y: 1 });
    this.game.sfx?.impact({ crit, heavy: Math.min(1, Math.max(0, (knock - 4) / 10)) });
    if (!e.boss && e.state === 'idle') e.state = 'chase';
    if (e.hp <= 0) this.kill(e);
  }

  // 拼刀用：正在出手、马上要打到人（冲锋中、扑击中、砸下来的前一刻）
  clashable(e) {
    if (e.fake || e.hitOnce && (e.state === 'charge' || e.dashing)) return false;
    return e.state === 'charge' || !!e.dashing || (e.kind === 'brute' && !e.boss && e.state === 'windup' && e.st < 0.4);
  }
  weight(e) { return (e.boss ? 1.6 : e.kind === 'brute' ? 1.5 : e.T.look === 'zombie' ? 1.15 : 1) * (1 + e.lvl * 0.04); }
  // 硬直：这一下作废；妖王改成露出破绽
  stagger(e, sec) {
    e.hitOnce = true; e.dashing = false; e.gen++; e.parts.body.rotation.z = 0;
    if (e.boss) { e.tick = null; e.hop = 0; this.openUp(e, sec); return; }
    e.state = 'recover'; e.st = sec; e.cd = Math.max(e.cd, sec + 0.8);
  }
  // 分身被打中：散成一团狐火
  poof(e) { this.game.fx.burst(e.pos, '#ff6aff', 30, { speed: 5, up: 3, y: 1.5 }); this.game.sfx?.impact({}); this.remove(e); }
  // 妖王破绽时被技能打中：倒地 3 秒，排好的后续招作废
  knockDown(e) {
    const g = this.game;
    e.state = 'down'; e.st = 3; e.gen++; e.tick = null; e.hop = 0; e.open = 0; e.dashing = false;
    g.fx.num(e.pos, '打断！', 'crit'); g.fx.nums.at(-1).p.y += e.T.h - 1;
    g.fx.shockRing(e.pos.x, e.pos.z, 4, '#ffe28a'); g.fx.burst(e.pos, '#ffe28a', 40, { speed: 6, up: 4 });
    g.shake(0.9); g.hitStop?.(0.12); g.toast(`${e.T.name} 被打倒了！趁现在！`, 1.8);
  }
  // 地上留一片：dmg = 每 0.8 秒扣一次（不给无敌帧），slow = 踩着走得慢，pull = 往中间吸（米 / 秒）
  zone(o) {
    const g = this.game, col = new THREE.Color(o.color || '#ff7a2a');
    const m = new THREE.Mesh(g.fx.circleGeo, new THREE.MeshBasicMaterial({ color: col.multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.position.set(o.x, 0.06 + this.zones.length % 8 * 0.002, o.z); m.scale.setScalar(o.r); g.scene.add(m);
    this.zones.push({ ...o, m, t: 0, tick: 0 });
  }
  updateZones(dt) {
    const g = this.game, P = g.player;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t += dt; z.tick -= dt;
      z.m.material.opacity = Math.max(0, Math.min(1, z.t * 4, (z.life - z.t) * 2)) * 0.32;
      if (Math.random() < dt * 2 * z.r) g.fx.mote(z.x + (Math.random() - 0.5) * z.r * 1.4, 0.1, z.z + (Math.random() - 0.5) * z.r * 1.4, z.color, { life: 0.7, size: 0.7, vy: z.slow ? 0.2 : 1 });
      const dx = z.x - P.pos.x, dz = z.z - P.pos.z, d = Math.hypot(dx, dz);
      if (!P.dead && d < z.r + P.r * 0.5) {
        if (z.slow) P.slowT = Math.max(P.slowT || 0, 0.3);
        if (z.pull && d > 0.3) { const k = z.pull * 10 * dt; P.kx += dx / d * k; P.kz += dz / d * k; }
        if (z.dmg && z.tick <= 0) { z.tick = 0.8; P.dot?.(z.dmg); }
      }
      if (z.t >= z.life) { g.scene.remove(z.m); z.m.material.dispose(); this.zones.splice(i, 1); }
    }
  }
  clearZones() { for (const z of this.zones) { this.game.scene.remove(z.m); z.m.material.dispose(); } this.zones.length = 0; }

  kill(e) {
    const g = this.game, fx = g.fx;
    g.sfx?.kill();
    fx.burst(e.pos, e.boss ? '#ff6a2a' : '#b9a8ff', e.boss ? 120 : 24, { speed: e.boss ? 9 : 5, up: 4, life: 0.8 });
    g.addXP(e.T.xp * (1 + e.lvl * 0.3) * (g.killXpK?.(e.lvl) ?? 1), e.pos);
    const luck = (e.night || g.nightK > NIGHT ? 1.5 : 1) * (e.blood ? 2 : 1) * (1 + (g.player.mods?.luck || 0));
    let k = 0;
    for (const [id, p] of e.T.drops) if (Math.random() < p * luck) g.addItem(id, Math.random() < p * luck - 1 ? 2 : 1, { x: e.pos.x, z: e.pos.z + 0.5 * k++ });
    if (e.T.stones) { const [a, b] = e.T.stones; g.addStones(Math.round((a + Math.random() * (b - a)) * luck), e.pos); }
    if (e.boss) {
      g.addItem(e.T.drop, e.doubleDrop ? 2 : 1, e.pos); g.addItem('yaodan', 2 + Math.floor(e.lvl / 4), { x: e.pos.x, z: e.pos.z + 0.5 });
      g.addStones(8 + e.lvl * 2, { x: e.pos.x, z: e.pos.z + 1 });
      if (e.T.recipe && !g.alchemy?.known.has(e.T.recipe)) g.alchemy?.learn(e.T.recipe);
      if (e.lair) e.lair.deadDay = g.day;
      g.toast(`击败 ${e.T.name}！获得 ${g.itemName?.(e.T.drop) ?? e.T.drop}`, 4);
      g.shake(1.2);
      fx.clearTele(); this.clearZones();
      for (const o of [...this.list]) if (o.fake) this.poof(o);
    }
    g.onKill?.(e);
    this.remove(e);
  }

  shoot(x, z, yaw, speed, dmg, color, size = 1, y = 1.0) {
    const m = mesh(this.projGeo, glow(color, 3.5), { cast: false });
    m.position.set(x, y, z); m.scale.setScalar(size);
    this.game.scene.add(m);
    const p = { m, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed, life: 3.2, dmg, r: 0.3 * size, color };
    this.proj.push(p);
    return p;
  }

  // 妖王苏醒：走到巢穴 14 米内（打死后 3 天才会再出现）
  wakeBoss() {
    const g = this.game, P = g.player;
    if (this.boss || P.dead) return;
    for (const L of this.lairs) {
      if (g.day < L.deadDay + 3 || Math.hypot(P.pos.x - L.x, P.pos.z - L.z) > 14) continue;
      const T = TYPES[L.type];
      this.boss = this.spawn(L.type, L.x, L.z, T.lvl);
      this.boss.lair = L; this.boss.state = 'roar'; this.boss.st = 1.6;
      // 赤枫狼王：狼群强度跟着月亮变，满月最凶（GDD 独特地点 2）
      if (T.moon) { const m = g.moonK?.() ?? 0; this.boss.hp = this.boss.maxHp *= 1 + m * 0.4; this.boss.dmg *= 1 + m * 0.3; }
      g.toast(`${T.name} 苏醒了！`, 3); g.shake(0.8);
      g.emit?.('bossWake', this.boss); // 独特地点可以改妖王（毒龙潭的水位……）
      return;
    }
  }

  update(dt) {
    const g = this.game, P = g.player, fx = g.fx;
    const night = g.nightK;
    this.wakeBoss();

    for (const e of [...this.list]) {
      if (!e.alive) continue;
      const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
      const toP = Math.atan2(dx, dz);
      let mx = 0, mz = 0, spd = 0, face = null;
      e.st -= dt; e.cd -= dt; e.touchCd -= dt; e.rootT -= dt; e.slowT = (e.slowT || 0) - dt; e.hasteT -= dt;
      if (e.fake && (e.life -= dt) <= 0) { this.poof(e); continue; }
      // 浮空受重力；浮空或被定身（缚符）时不能行动，前摇 / 冲锋被打断
      const air = e.pos.y > 0.02 || e.vy > 0;
      if (air) { e.vy -= GRAV * dt; e.pos.y += e.vy * dt; e.airRot += e.airSpin * dt; if (e.pos.y <= 0) this.land(e); }
      else e.airRot *= Math.exp(-10 * dt);
      if (e.rootT > 0) e.kx = e.kz = 0;
      const held = air || e.rootT > 0;
      if (held && !e.boss && (e.state === 'windup' || e.state === 'charge')) { e.state = 'recover'; e.st = 0.5; e.parts.body.rotation.z = 0; }
      const aggro = (e.kind === 'brute' ? 9 : 11) + night * 4;

      if (P.dead) { if (e.state !== 'idle' && !e.boss) e.state = 'idle'; }

      if (e.boss) this.bossAI(e, dt, dist, toP);
      else if (!held) {
        if (e.state === 'idle') {
          if (dist < aggro && !P.dead && !g.peaceful?.(e)) e.state = 'chase';
          if (e.st <= 0) { e.st = 2 + Math.random() * 3; const a = Math.random() * 6.28, r = Math.random() * 5; e.tx = e.home.x + Math.cos(a) * r; e.tz = e.home.y + Math.sin(a) * r; }
          const wx = e.tx - e.pos.x, wz = e.tz - e.pos.z, wd = Math.hypot(wx, wz);
          if (wd > 0.4) { mx = wx / wd; mz = wz / wd; spd = e.speed * 0.4; }
        } else if (e.state === 'chase') {
          if (dist > 26 || P.dead) { e.state = 'idle'; }
          face = toP;
          if (e.kind === 'charger') {
            mx = dx / dist; mz = dz / dist; spd = e.speed;
            if (dist < 8 && e.cd <= 0) {
              e.state = 'windup'; e.st = 0.65; e.chargeDir = toP;
              fx.line(e.pos.x, e.pos.z, toP, 10, 1.6, 0.65);
            }
          } else if (e.kind === 'shooter') {
            const want = dist > 9 ? 1 : dist < 6 ? -1 : 0;
            mx = dx / dist * want + Math.cos(toP) * 0.5; mz = dz / dist * want - Math.sin(toP) * 0.5; spd = e.speed;
            if (e.cd <= 0 && dist < 13) { e.state = 'windup'; e.st = 0.35; e.flash = 0.06; }
          } else {
            mx = dx / dist; mz = dz / dist; spd = e.speed;
            if (dist < 3.0 && e.cd <= 0) {
              e.state = 'windup'; e.st = 0.85;
              const cx = e.pos.x + Math.sin(toP) * 1.5, cz = e.pos.z + Math.cos(toP) * 1.5, gen = e.gen;
              fx.circle(cx, cz, 2.3, 0.85, () => {
                if (!e.alive || e.gen !== gen) return; // 被拼刀 / 技能打断了
                fx.shockRing(cx, cz, 2.6, '#ffb070'); fx.burst({ x: cx, z: cz }, '#c9b8a0', 14, { speed: 5, y: 0.2 });
                g.shake(0.35);
                if (Math.hypot(P.pos.x - cx, P.pos.z - cz) < 2.3 + P.r && !g.tryClash?.(e)) P.hurt(e.dmg, cx, cz);
              });
            }
          }
          if (e.kind !== 'brute' && Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.y) > 34 && !e.raid) e.state = 'idle';
        } else if (e.state === 'windup') {
          face = e.kind === 'charger' ? e.chargeDir : toP;
          if (e.kind === 'charger') e.parts.body.rotation.z = Math.sin(g.time * 60) * 0.08;
          if (e.st <= 0) {
            e.parts.body.rotation.z = 0;
            if (e.kind === 'charger') { e.state = 'charge'; e.st = 0.55; e.hitOnce = false; }
            else if (e.kind === 'shooter') { this.shoot(e.pos.x, e.pos.z, toP, 9, e.dmg, e.T.shot || '#7aff5a', 1, e.T.look === 'crow' ? 1.5 : 1); e.state = 'chase'; e.cd = 1.8 + Math.random() * 0.6; }
            else { e.state = 'recover'; e.st = 0.5; e.cd = 2.2; }
          }
        } else if (e.state === 'charge') {
          face = e.chargeDir; mx = Math.sin(e.chargeDir); mz = Math.cos(e.chargeDir); spd = 15;
          if (Math.random() < 0.5) fx.mote(e.pos.x, 0.2, e.pos.z, '#c8a070', { life: 0.4, size: 1.2, bright: 0.8 });
          if (!e.hitOnce && dist < e.r + P.r + 0.2 && !g.tryClash?.(e)) { e.hitOnce = true; P.hurt(e.dmg * 1.3, e.pos.x, e.pos.z, 10); }
          if (e.st <= 0) { e.state = 'recover'; e.st = 0.8; e.cd = 2.6; }
        } else if (e.state === 'recover') {
          if (e.st <= 0) e.state = 'chase';
        }
        // 普通接触伤害
        if (e.state !== 'charge' && dist < e.r + P.r && e.touchCd <= 0 && e.kind === 'charger') { P.hurt(e.dmg * 0.5, e.pos.x, e.pos.z); e.touchCd = 1; }
        // 妖虫夜袭：往灵田爬，碰到庄稼就啃（GDD 第 6 节）
        if (e.raid && e.state !== 'charge') { const t = e.raid; if (dist > 7) { const wx = t.x - e.pos.x, wz = t.z - e.pos.z, wd = Math.hypot(wx, wz) || 1; mx = wx / wd; mz = wz / wd; spd = e.speed; face = null; } }
      }

      if (e.boss) { const r = this.bossMove; mx = r.mx; mz = r.mz; spd = held ? 0 : r.spd; face = r.face; }

      // 移动 + 击退 + 碰撞（寒冰掌 / 封印符命中会减速）
      if (e.slowT > 0 && e.state !== 'charge') spd *= 0.6;
      e.pos.x += (mx * spd + e.kx) * dt;
      e.pos.z += (mz * spd + e.kz) * dt;
      const kd = Math.exp(-(air ? (e.pos.y > 1 ? 0.8 : 3) : 9) * dt); e.kx *= kd; e.kz *= kd;
      g.world.resolve(e.pos, e.r, !!e.tide);
      if (!e.boss) for (const o of this.list) {
        if (o === e) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, rr = e.r + o.r, d2 = ox * ox + oz * oz;
        if (d2 < rr * rr && d2 > 1e-6 && Math.abs(e.pos.y - o.pos.y) < 1.2) { const d = Math.sqrt(d2), k = (rr - d) / d * 0.5; e.pos.x += ox * k; e.pos.z += oz * k; }
      }
      if (face === null && spd > 0.1) face = Math.atan2(mx, mz);
      if (face !== null) e.yaw = lerpAngle(e.yaw, face, 1 - Math.exp(-10 * dt));
      e.root.rotation.y = e.yaw;

      // 动画
      e.walk += dt * (2 + spd * 3);
      const sw = Math.sin(e.walk) * Math.min(1, spd / 2), pt = e.parts;
      if (e.T.look === 'spider' || e.T.look === 'bug' || e.T.look === 'scorpion') pt.legs.forEach((l, i) => (l.children[0].rotation.x = Math.sin(e.walk * 1.5 + i * 1.3) * 0.35 * Math.min(1, spd)));
      else pt.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? sw : -sw) * 0.7));
      for (const [i, w] of pt.wings.entries()) w.rotation.z = (i ? -1 : 1) * Math.sin(g.time * 14 + e.walk) * 0.6;
      pt.segs.forEach((s, i) => (s.position.x = Math.sin(e.walk * 0.8 - i * 0.9) * 0.18 * (i / 5) * Math.min(1, spd + 0.3)));
      if (pt.tail) pt.tail.rotation.z = Math.sin(e.walk * 1.4) * 0.4;
      if (pt.arms.length) {
        const up = e.state === 'windup' || (e.boss && (e.state === 'ring' || e.state === 'roar')) ? -2.6 : sw * 0.4;
        for (const a of pt.arms) a.rotation.x += (up - a.rotation.x) * Math.min(1, dt * 12);
      }
      pt.body.position.y = (pt.float || pt.wings.length ? Math.sin(g.time * 3 + e.walk) * 0.15 : Math.abs(sw) * 0.06) + (e.state === 'windup' && e.kind === 'charger' ? -0.1 : 0) + e.hop;
      if (!e.boss) pt.body.rotation.x = e.airRot;
      else { // 破绽：往前耷拉着喘气；倒地：侧躺
        const k = Math.min(1, dt * 8);
        pt.body.rotation.x += ((e.state === 'open' ? 0.3 : 0) - pt.body.rotation.x) * k;
        pt.body.rotation.z += ((e.state === 'down' ? 1.25 : 0) - pt.body.rotation.z) * k;
      }
      if (e.flash > 0) { e.flash -= dt; setFlash(e.mats, e.flash > 0 ? 0.9 : 0); }

      if (dist > 80 && !e.boss && !e.raid) this.remove(e);
      if (e.boss && dist > 45) { g.toast(`${e.T.name} 退回了巢穴深处`, 2.5); fx.clearTele(); this.clearZones(); this.remove(e); }
    }
    this.updateZones(dt);

    // 投射物
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i];
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.life -= dt;
      p.m.rotation.y += dt * 8;
      if (Math.random() < 0.5) fx.mote(p.m.position.x, p.m.position.y, p.m.position.z, p.color, { life: 0.3, size: 0.8, vy: 0 });
      const d = Math.hypot(P.pos.x - p.m.position.x, P.pos.z - p.m.position.z);
      let dead = p.life <= 0;
      if (!dead && d < p.r + P.r && !P.dead) { if (P.hurt(p.dmg, p.m.position.x, p.m.position.z)) { dead = true; if (p.slow) P.slowT = Math.max(P.slowT || 0, p.slow); } }
      if (dead) { g.scene.remove(p.m); this.proj.splice(i, 1); }
    }
  }

  // 落地：重摔会弹起；被「坠龙」砸下来的会震飞周围的（game.onSlam → combat.slamAround）
  land(e) {
    const g = this.game, fx = g.fx, v = -e.vy;
    e.pos.y = 0;
    if (v > 10) {
      e.vy = Math.min(7, v * 0.32); e.airSpin *= 0.5;
      fx.shockRing(e.pos.x, e.pos.z, e.spiked ? 2.6 : 1.4, '#e8d8b0', 0.3);
      fx.burst(e.pos, '#b89a6a', e.spiked ? 24 : 12, { speed: 5, up: 4, life: 0.5, y: 0.2, bright: 1 });
      g.sfx?.impact({ heavy: 1 }); g.shake(e.spiked ? 0.55 : 0.25);
      if (e.spiked) { e.spiked = false; fx.num(e.pos, '砸地', 'crit'); g.onSlam?.(e); }
    } else if (v > 4) { e.vy = v * 0.22; fx.burst(e.pos, '#b89a6a', 5, { speed: 3, up: 2, life: 0.4, y: 0.2, bright: 1 }); }
    else { e.vy = 0; e.airSpin = 0; e.airRot = Math.atan2(Math.sin(e.airRot), Math.cos(e.airRot)); e.spiked = false; }
  }

  // ---------- 妖王：多阶段，前摇清晰、以闪避为主 ----------
  bossAI(e, dt, dist, toP) {
    const g = this.game, P = g.player;
    const mv = (this.bossMove = { mx: 0, mz: 0, spd: 0, face: toP });
    if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2; e.state = 'roar'; e.st = 1.4; e.queue = ['summon']; e.gen++; e.tick = null; e.hop = 0;
      if (e.hidden) { e.hidden = false; e.root.visible = true; }
      g.toast(`${e.T.name} 狂暴了！`, 2.5); g.shake(1);
      for (const m of e.mats) { m.userData.baseE?.set('#ff2a00'); m.userData.baseEI = 0.12; }
      setFlash(e.mats, 0);
    }
    const p2 = e.phase === 2;
    switch (e.state) {
      case 'roar':
        if (e.st <= 0) { e.state = 'walk'; e.st = 1; }
        break;
      case 'idle': case 'chase': case 'walk': {
        const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
        const keep = e.kind === 'shooter' ? 8 : 3;
        if (dist > keep) { mv.mx = dx / dist; mv.mz = dz / dist; mv.spd = e.speed * (p2 ? 1.3 : 1) * (e.hasteT > 0 ? 1.5 : 1); }
        if (dist < e.r + P.r + 0.3 && e.touchCd <= 0) { P.hurt(e.dmg * 0.6, e.pos.x, e.pos.z, 9); e.touchCd = 1; }
        if (e.st <= 0 && !P.dead) {
          // 一轮里每招出一次；狂暴后自己的招出两遍，再叫一次帮手
          if (!e.queue.length) e.queue = shuffle(p2 ? [...e.T.attacks, ...e.T.sig, ...e.T.sig, 'summon'] : [...e.T.attacks, ...e.T.sig]);
          this.bossStart(e, e.queue.shift(), toP, p2);
        }
        break;
      }
      case 'act':
        e.tick?.(dt, mv, dist, toP);
        if (e.st <= 0) {
          e.tick = null; e.hop = 0; e.dashing = false;
          if (e.hidden) { e.hidden = false; e.root.visible = true; }
          if (e.open > 0) this.openUp(e, e.open); else { e.state = 'walk'; e.st = p2 ? 0.7 : 1.2; }
        }
        break;
      case 'open': // 破绽：站着喘气、头上冒金星
        mv.face = null;
        if (Math.random() < 0.5) { const a = g.time * 6 + Math.random(); g.fx.mote(e.pos.x + Math.sin(a) * 1.4, e.T.h * 0.85, e.pos.z + Math.cos(a) * 1.4, '#ffe28a', { life: 0.4, size: 1, vy: 0, bright: 3 }); }
        if (e.st <= 0) { e.state = 'walk'; e.st = 0.4; }
        break;
      case 'down':
        mv.face = null;
        if (e.st <= 0) { e.state = 'walk'; e.st = 0.6; g.fx.burst(e.pos, '#c9b8a0', 20, { speed: 5, up: 3 }); }
        break;
      case 'slam': case 'ring': case 'summon':
        if (e.st <= 0) { e.state = 'walk'; e.st = p2 ? 0.7 : 1.2; }
        break;
      case 'windupCharge':
        mv.face = e.chargeDir;
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.85; e.hitOnce = false; g.shake(0.3); }
        break;
      case 'charge':
        mv.face = e.chargeDir; mv.mx = Math.sin(e.chargeDir); mv.mz = Math.cos(e.chargeDir); mv.spd = 17;
        g.fx.mote(e.pos.x + (Math.random() - 0.5) * 2, 0.3, e.pos.z + (Math.random() - 0.5) * 2, e.T.c[2], { life: 0.5, size: 1.5 });
        if (!e.hitOnce && dist < e.r + P.r + 0.3 && !g.tryClash?.(e)) { e.hitOnce = true; P.hurt(e.dmg * 1.2, e.pos.x, e.pos.z, 14); }
        if (e.st <= 0) this.openUp(e, p2 ? 0.7 : 1.0); // 冲过头了，收不住脚
        break;
    }
  }
  // 收招后的破绽：这时候用技能打它会把它打倒
  openUp(e, sec) {
    const g = this.game;
    e.state = 'open'; e.st = sec;
    g.fx.num(e.pos, '破绽', 'crit'); g.fx.nums.at(-1).p.y += e.T.h - 1;
    if (!this.openTip) { this.openTip = true; g.toast('妖王露出了破绽！\n这时用技能（Q / E / R）打中它，能把它打倒', 3.5); }
  }

  bossStart(e, a, toP, p2) {
    const g = this.game, P = g.player, fx = g.fx, col = e.T.c[2];
    if (a === 'slam') {
      e.state = 'slam'; const n = p2 ? 4 : 3, dur = p2 ? 0.7 : 0.9;
      e.st = n * 0.45 + dur + 0.3;
      for (let i = 0; i < n; i++) g.after(i * 0.45, () => {
        if (!e.alive) return;
        const x = P.pos.x + P.vel.x * 0.3, z = P.pos.z + P.vel.z * 0.3;
        fx.circle(x, z, 2.8, dur, () => {
          if (!e.alive) return;
          fx.shockRing(x, z, 3.2, col); fx.burst({ x, z }, col, 20, { speed: 6, y: 0.2, up: 4 });
          g.shake(0.5);
          if (Math.hypot(P.pos.x - x, P.pos.z - z) < 2.8 + P.r) P.hurt(e.dmg, x, z, 8);
        });
      });
    } else if (a === 'ring') {
      e.state = 'ring'; e.st = p2 ? 1.6 : 1.2;
      const waves = p2 ? 2 : 1;
      for (let w = 0; w < waves; w++) g.after(0.55 + w * 0.5, () => {
        if (!e.alive) return;
        const n = 16;
        for (let i = 0; i < n; i++) this.shoot(e.pos.x, e.pos.z, (i + w * 0.5) / n * Math.PI * 2, 7, e.dmg * 0.55, e.T.shot || col, 1.6);
        fx.shockRing(e.pos.x, e.pos.z, 5, col); g.shake(0.3);
      });
    } else if (a === 'charge') {
      e.state = 'windupCharge'; e.st = p2 ? 0.7 : 0.9; e.chargeDir = toP;
      fx.line(e.pos.x, e.pos.z, toP, 16, 3.2, e.st);
    } else if (a === 'summon') {
      e.state = 'summon'; e.st = 1.2;
      const n = e.T.moon ? 2 + Math.round((g.moonK?.() ?? 0) * 2) : 2;
      for (let i = 0; i < n; i++) { const ang = i / n * 6.28; this.spawn(e.T.minion, e.pos.x + Math.cos(ang) * 4, e.pos.z + Math.sin(ang) * 4, Math.max(0, e.lvl - 2)).state = 'chase'; }
      g.shake(0.6);
    } else SIG[a](this, e, toP, p2);
  }
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export { clamp, angDiff, at };
