// 世界地图（GDD 第 7 节，数据在 data/world_map.json）：青竹村为中心，六个扇区、五个境界圈。
// 坐标用极坐标：ang = 从正北（-z）顺时针的角度，dist = 离村米数。x = sin(ang)·dist，z = -cos(ang)·dist。
// 这里只放纯计算（world.js 也要用），地标模型和地图面板在 landmarks.js。

export const SECTORS = [
  { id: 'snow', name: '雪峰', ang: 0, tint: [236, 244, 250], tree: 'pine', crown: '#d8e6e8', trees: 0.7, rocks: 1.2, grass: 0.6 },
  { id: 'bamboo', name: '竹海', ang: 60, tint: null, tree: 'maple', trees: 1, rocks: 1, grass: 1 },
  { id: 'swamp', name: '沼泽', ang: 120, tint: [80, 150, 96], tree: 'dark', crown: '#3f7a46', trees: 1.1, rocks: 0.5, grass: 1.2 },
  { id: 'volcano', name: '火山', ang: 180, tint: [168, 82, 58], tree: 'dead', trees: 0.25, rocks: 3, rockC: ['#4a3a38', '#5a4038'], grass: 0.35 },
  { id: 'desert', name: '沙漠遗迹', ang: 240, tint: [255, 222, 146], tree: 'dead', trees: 0.12, rocks: 2.2, rockC: ['#c8a878', '#b89868'], grass: 0.25 },
  { id: 'battle', name: '古战场', ang: 300, tint: [128, 116, 96], tree: 'dead', trees: 0.35, rocks: 1.6, rockC: ['#8a8a84', '#6a6a66'], grass: 0.6, tomb: true },
];
export const RINGS = [
  { realm: '炼气', from: 0, to: 220 }, { realm: '筑基', from: 220, to: 480 }, { realm: '金丹', from: 480, to: 740 },
  { realm: '元婴', from: 740, to: 1000 }, { realm: '化神', from: 1000, to: 1160 },
];
export const WORLD_R = 1010, PEAK_R = 1170; // 世界边缘；只有北边（天劫峰）能走到更远
export const PEAK = { x: 0, z: -1150 };

export const polar = (ang, dist) => ({ x: Math.sin(ang * Math.PI / 180) * dist, z: -Math.cos(ang * Math.PI / 180) * dist });
export const angleOf = (x, z) => ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360;
const n2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
// 扇区（边界带一点抖动，不是一刀切）
export function sectorAt(x, z) {
  const a = angleOf(x, z) + (Math.sin(x * 0.013 + z * 0.007) + Math.sin(z * 0.011 - x * 0.005)) * 6;
  return SECTORS[Math.round(((a % 360) + 360) % 360 / 60) % 6];
}
// 生态强度：村子附近没有，走出 70 米开始渐变，140 米外完全是本扇区的样子
export function biomeK(x, z) { const d = Math.hypot(x, z); return Math.max(0, Math.min(1, (d - 70) / 70)); }
export function ringAt(x, z) { const d = Math.hypot(x, z); return RINGS.findIndex((r) => d < r.to); }
// 危险度 = 离村距离 + 靠近天劫峰的额外加成（GDD）。≈ 妖兽等级：炼气圈 0–4、筑基圈 4–10、金丹圈 10–16、元婴圈 16–22、化神 22+
export function dangerFor(x, z) {
  const d = Math.hypot(x, z), peak = Math.max(0, 1 - Math.hypot(x - PEAK.x, z - PEAK.z) / 400);
  return Math.max(0, Math.min(26, (d - 30) / 44 + peak * 3));
}
// 边缘：北边扇区可以走到天劫峰，其他方向到 1 公里为止
export function edgeR(x, z) { const a = angleOf(x, z), off = Math.min(a, 360 - a); return off < 25 ? PEAK_R : WORLD_R; }
export { n2 as hash2 };
