// 主游戏的多级台地（移植自实验场 src/lab/biomes.js 的 makeTerrace / terraceAt，最多 7 级）
// 连续的「级数场」F(x,z)（0..6；剑宗的九重剑阶用 levels: 10）量化成平台 + 陡坎；台阶路上改回连续坡度，并在每级中间自动摆一段石阶。
// 坐标都是门派局部坐标（相对宗门中心）。0 级 = 世界地面 y=0：宗门边缘保持 0 级，和野外接平。
// 用法见 sectsites2.js：makeTerrain({ shapes: [plat(...), hill(...)], paths: [{ pts, w }], LH, cliff, rock })
import { vnoise, smooth, clamp } from './util.js';

export const LEVELS = 7;
const seg = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
};
export const polyDist = (x, z, pts) => { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, seg(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return d; };

// 台基 / 院落：圆角矩形平台（顶面平整，建筑放在里面）。lv 顶面级数，ring 往外每降一级的宽度（米），
// rot 旋转，round 圆角，wob 轮廓起伏（石砌台基 0，天然台地 1~3）
export function plat(o) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), hw = o.w / 2, hd = o.d / 2, rr = Math.min(o.round ?? 1.5, hw, hd), ring = o.ring ?? 5, wob = o.wob ?? 0, seed = o.seed ?? 7;
  const ext = Math.hypot(hw, hd) + o.lv * ring + wob + 1;
  return {
    bb: [o.x - ext, o.z - ext, o.x + ext, o.z + ext],
    f(x, z) {
      const dx = x - o.x, dz = z - o.z, lx = Math.abs(dx * c - dz * s), lz = Math.abs(dx * s + dz * c);
      const qx = lx - (hw - rr), qz = lz - (hd - rr);
      let d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;
      if (wob && d > -1) d += (vnoise(x * 0.22 + seed, z * 0.22, seed) - 0.5) * wob * 2;
      return o.lv - Math.max(d, 0) / ring;
    },
  };
}
// 天然小山：不规则轮廓的阶梯山（和实验场 blob 一样）。r 半径，sx/sz 拉伸，p>1 顶部宽平
export function hill(o) {
  const wob = o.wob ?? 3, ext = o.r * Math.max(o.sx || 1, o.sz || 1) + wob + 1;
  return {
    bb: [o.x - ext, o.z - ext, o.x + ext, o.z + ext],
    f(x, z) {
      const dx = (x - o.x) / (o.sx || 1), dz = (z - o.z) / (o.sz || 1);
      const d = Math.hypot(dx, dz) + (vnoise(x * 0.12 + o.seed, z * 0.12, o.seed) - 0.5) * wob;
      return o.lv * (1 - Math.pow(clamp(d / o.r, 0, 1), o.p ?? 1));
    },
  };
}

const sampleLine = (pts, F, top, d = 0.1) => {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / d);
    for (let j = i === 1 ? 0 : 1; j <= n; j++) { const t = j / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; out.push({ x, z, F: clamp(F(x, z), 0, top) }); }
  }
  return out;
};

// paths：{ pts: [[x,z],...], w: 半宽（默认 1.6）, kind: 'stairs' | 'trail' }
//   stairs 石阶：路上连续坡，每穿过 k+0.5 级摆一段石阶（进深 = 这一级沿路的长度）
//   trail 土坡：只有坡，不摆东西
// dig(x,z)：往下挖（米），池塘 / 溪床用；bb 不写就由 shapes 算
export function makeTerrain(o) {
  const T = { levels: o.levels ?? LEVELS, LH: o.LH ?? 2.2, cliff: o.cliff ?? 0.16, rock: o.rock || '#9a948a', shapes: o.shapes, dig: o.dig || null, steps: [] };
  T.paths = (o.paths || []).map((p) => (Array.isArray(p) ? { pts: p } : p)).map((p) => ({ kind: 'stairs', w: 1.6, ...p }));
  for (const p of T.paths) { const m = p.w + 1; p.bb = [Math.min(...p.pts.map((q) => q[0])) - m, Math.min(...p.pts.map((q) => q[1])) - m, Math.max(...p.pts.map((q) => q[0])) + m, Math.max(...p.pts.map((q) => q[1])) + m]; }
  T.F = (x, z) => { let f = 0; for (const s of T.shapes) { const b = s.bb; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; const v = s.f(x, z); if (v > f) f = v; } return f; };
  const bb = [1e9, 1e9, -1e9, -1e9];
  for (const s of T.shapes) { bb[0] = Math.min(bb[0], s.bb[0]); bb[1] = Math.min(bb[1], s.bb[1]); bb[2] = Math.max(bb[2], s.bb[2]); bb[3] = Math.max(bb[3], s.bb[3]); }
  T.bb = o.bb || bb;
  const top = T.levels - 1, quant = (f) => { const k = Math.floor(f); return k >= top ? k : k + smooth(1 - T.cliff, 1, f - k); };
  // 局部高度（米）
  T.h = (x, z) => {
    const Fc = clamp(T.F(x, z), 0, top);
    let lv = quant(Fc), m = 0;
    for (const p of T.paths) { const b = p.bb; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; const d = polyDist(x, z, p.pts); if (d < p.w + 0.8) m = Math.max(m, smooth(p.w + 0.8, p.w, d)); }
    if (m > 0) lv += (Fc - lv) * m;
    return lv * T.LH - (T.dig ? T.dig(x, z) : 0);
  };
  T.level = (x, z) => Math.round(clamp(T.F(x, z), 0, top) - 0.49); // 所在平台级数（坎上算上一级）
  // 石阶摆放：沿路采样，穿过 k+0.5 处朝上坡摆一段
  for (const p of T.paths) {
    if (p.kind !== 'stairs') continue;
    const S = sampleLine(p.pts, T.F, top);
    for (let i = 1; i < S.length; i++) for (let k = 0; k < top; k++) {
      const c = k + 0.5;
      if ((S[i - 1].F - c) * (S[i].F - c) >= 0) continue;
      const { x, z } = S[i], e = 0.25, gx = (T.F(x + e, z) - T.F(x - e, z)) / (2 * e), gz = (T.F(x, z + e) - T.F(x, z - e)) / (2 * e), g = Math.hypot(gx, gz) || 1;
      T.steps.push({ x, z, rot: Math.atan2(-gx, -gz), run: clamp(1 / g, 1.2, 14), k, w: p.w });
    }
  }
  return T;
}

// 自定义形状：bb 包围盒 + f(x,z) 级数场
export const shape = (bb, f) => ({ bb, f });
// 八角距离：八条边的法线朝 0°、45°…（0° = +z 正南，一条边正对山门），返回到中心的边心距
export function oct(x, z) { let d = -1e9; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; d = Math.max(d, x * Math.sin(a) + z * Math.cos(a)); } return d; }
