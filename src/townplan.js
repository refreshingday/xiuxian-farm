// 青竹村规划（2026-11-03 重做）：按 Kevin Lynch《城市意象》五要素排布——
//   路 Paths：南大街（迎客门 → 牌坊 → 商铺 → 广场，石板）是中轴，往北接石板小径直到瀑布；西路通竹海门，东北玄晶大道通矿洞；
//             两条横巷（东巷、南横巷）串起民居。路都按人真实的走法连：每户门口自动接一段小路到最近的街巷。
//   边 Edges：村墙；北边石峰 + 瀑布 + 溪 + 荷塘是山水边；台基、篱笆分开田园和住家。
//   区 Districts：南街商铺区 / 中心广场 / 北山水清修区（观瀑亭、学堂、云鹤居、文昌塔）/ 东北工坊区（铁铺、猎户、木料场）
//                 / 东南民居区（村长家、杨家、空地）/ 西田园区（你家、灵田、兽圈、打谷场、谷仓）。
//   节点 Nodes：中心广场（井、古银杏、戏台、茶摊、委托板）；三座村门口；南横巷口；观瀑台。
//   地标 Landmarks：远景——瀑布石峰（正对中轴）、七层文昌塔（西北，哪儿都望得见）；近景——牌坊、古银杏、戏台、铁铺炉烟、观瀑亭。
// 这里只放数据（world.js 和 town.js 都用），不 import 任何东西。
export const TAU = Math.PI * 2;
export const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
// 本地（门朝 +z）→ 世界偏移
export const rotXZ = (lx, lz, yaw) => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)];

export const PLAZA = { x: 0, z: 0, r: 9.5 };
export const BOARD = { x: -3.4, z: -9.4 };
// 石板地（kind 1）：矩形 [x0, z0, x1, z1] / 圆 { x, z, r }
export const PAVED_RECTS = [
  [-2.6, 8, 2.6, 39],          // 南大街
  [-5.1, 21, -2.6, 35], [2.6, 21, 5.1, 35], // 商铺门前的檐下石板
  [-1.3, -20, 1.3, -9],        // 北石板小径
  [-1.6, -24.4, 4.6, -19.2],   // 观瀑台
];
export const PAVED_DISCS = [{ x: -14.5, z: 14.5, r: 3.6 }]; // 打谷场
// 土路 [ax, az, bx, bz]（大路 roadDist 另算）
export const LANES = [
  [-9, -3.4, -40.9, -3.0],     // 西路 → 竹海门
  [8.5, 7.5, 31, 7.5],         // 东巷
  [-2.6, 19.5, -26.5, 19.5],   // 南横巷 · 西
  [2.6, 19.5, 28.5, 19.5],     // 南横巷 · 东
  [-1.3, -12.5, -3.4, -15.2],  // 去荷塘码头
  [-19.5, -4, -19.5, -21],     // 去文昌塔
  [-19.5, -21, -21, -21.5],
];
// 装饰建筑（town.js 建）：kind = shop / inn / tea / stage / school / granary / shrine / pavilion / house
// w = 正面宽，d = 进深（hall 的台基比 w、d 各大 1.6 米，tower 大 1.4 米）
export const DECOR = [
  { kind: 'shop', name: '布庄', x: -7.5, z: 24.3, face: 'e', w: 5.2, d: 5, flag: '布', fc: '#3a6ab0' },
  { kind: 'inn', name: '青竹客栈', x: -7.5, z: 31.6, face: 'e', w: 5.2, d: 5, flag: '酒', fc: '#c83a2a' },
  { kind: 'shop', name: '米铺', x: 7.5, z: 24.3, face: 'w', w: 5.2, d: 5, flag: '米', fc: '#c8a24a' },
  { kind: 'tea', name: '听雨茶楼', x: 7.5, z: 31.6, face: 'w', w: 5.2, d: 5, flag: '茶', fc: '#3a8a5a' },
  { kind: 'stage', name: '戏台', x: 13.5, z: 0.8, face: 'w', w: 6.4, d: 5 },
  { kind: 'school', name: '青竹学堂', x: 6.4, z: -15.2, face: 'w', w: 5.4, d: 4 },
  { kind: 'granary', name: '谷仓', x: -21, z: 13, face: 'e', w: 5, d: 4 },
  { kind: 'shrine', name: '土地庙', x: -34, z: -9, face: 'e', w: 2.4, d: 2 },
  { kind: 'pavilion', name: '观瀑亭', x: 1.8, z: -21.8, face: 's', w: 3.6, d: 3.6 },
];
// 不进人的民居（buildHouse 建，能进门，屋里有家具）
export const COTTAGES = [
  { x: 15, z: 25, w: 6, d: 5, face: 'n', roof: '#6a6e7c', wall: '#bc8450' },
  { x: 23.5, z: 24.5, w: 6, d: 5, face: 'n', roof: '#5e6878', wall: '#b47a48' },
  { x: -15, z: 25, w: 6, d: 5, face: 'n', roof: '#706a78', wall: '#c08a54' },
  { x: -23, z: 23, w: 6, d: 5, face: 'n', roof: '#686c7a', wall: '#b88250' },
];
export const PAGODA = { x: -21, z: -24, r: 2, levels: 7, name: '文昌塔' };
export const PAIFANG = { x: 0, z: 36.8, w: 8.4, name: '青竹村' };
export const GINKGO = { x: -6.5, z: -6.5 };
export const PEN = { x0: -25.5, z0: 0, x1: -21, z1: 6.5 };
export const LOT = { x: 23.5, z: 13 };

// 占地矩形（世界坐标）：草、树、花都避开
export function decorFoot(o) {
  const pad = o.kind === 'inn' || o.kind === 'tea' ? 1.4 : 1.6, fw = o.w + pad, fd = o.d + pad;
  const [a, b] = Math.abs(Math.sin(FACE[o.face])) > 0.5 ? [fd, fw] : [fw, fd];
  return [o.x - a / 2, o.z - b / 2, o.x + a / 2, o.z + b / 2];
}
export function houseFoot(o) {
  const [a, b] = Math.abs(Math.sin(FACE[o.face || 's'])) > 0.5 ? [o.d, o.w] : [o.w, o.d];
  return [o.x - a / 2, o.z - b / 2, o.x + a / 2, o.z + b / 2];
}
// 门口：本地 (0, d/2 + k) 转到世界
export function doorOf(o, k = 1.2) { const [dx, dz] = rotXZ(0, o.d / 2 + k, FACE[o.face || 's']); return { x: o.x + dx, z: o.z + dz }; }
export const BLOCKS = [
  ...DECOR.filter((o) => o.kind !== 'pavilion').map(decorFoot),
  [PAGODA.x - 3, PAGODA.z - 3, PAGODA.x + 3, PAGODA.z + 3],
  [PEN.x0, PEN.z0, PEN.x1, PEN.z1],
  [LOT.x - 3.5, LOT.z - 3, LOT.x + 3.5, LOT.z + 3],
  [-1, -24.6, 4.6, -19],       // 观瀑亭
];
