// 实时地形瓦片（小地图 + 舆图共用）。
// 取巧：不渲染整个世界，也不记住它——只给「看得见的那一圈」按需画 64×64 像素的瓦片，缓存起来（LRU），每帧限时画几行，
// 没画好的先用粗一级的瓦片放大顶上。瓦片大小跟缩放走（5 级：每像素 0.5 / 1 / 2 / 4 / 8 米）。
// 每个像素的颜色 = 游戏里地面着色函数（mapBase，同一套草 / 路 / 扇区色）+ 逐像素细节：树冠点（疏密、树种、树影按真实公式）、
// 石头、房子屋顶和投影、池塘 / 溪水深浅、台地高度阴影和崖壁、世界边缘雾。
import { hash01, vnoise, clamp, smooth } from './util.js';
import { SECTORS } from './worldmap.js';
import { SECTOR_COLOR } from './landmarks.js';
import { mapBase, terrainHit, groundY, mapEdgeR } from './world.js';

export const LODS = [0.5, 1, 2, 4, 8], TP = 64;
const CS = 2.6; // 树 / 石的格子（和 world.js 刷树的步长一样）
const ROAD = { 0: [218, 170, 104], 1: [204, 198, 186], 2: [226, 202, 142], 3: [118, 80, 52], 4: [104, 100, 108] };
const mixc = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
const SHALLOW = [118, 202, 208], DEEP = [30, 94, 148], ICE = [200, 228, 240], FOG = [20, 27, 31], SNOW = [232, 238, 246];

export class TileMap {
  constructor(world) {
    this.w = world; this.c = new Map(); this.want = new Map(); this.stamp = 0; this.iced = false;
    this.B = new Float32Array((TP / 2) * 12); this.views = Array.from({ length: TP / 2 }, (_, i) => this.B.subarray(i * 12, i * 12 + 12));
    this.fx = 0; this.fz = 0; this.rgb = [0, 0, 0];
  }
  lodFor(mpp) { let i = 0; for (let k = 0; k < LODS.length; k++) if (LODS[k] <= mpp * 1.25) i = k; return i; }
  key(l, tx, tz) { return (l * 4096 + tx + 2048) * 4096 + tz + 2048; }

  // 把以 (cx,cz) 为中心、半径 rad 米的地形画进 ctx（ctx 已经设好「世界米 → 画布」的变换）；mpp = 每个画布像素多少米
  // 瓦片还没画好的地方先露出来的底：六个扇区的底色（世界坐标）
  backdrop(ctx) {
    ctx.fillStyle = '#16201d'; ctx.fillRect(-1300, -1300, 2600, 2600);
    ctx.globalAlpha = 0.55;
    for (const s of SECTORS) {
      const a0 = (s.ang - 30 - 90) * Math.PI / 180, a1 = (s.ang + 30 - 90) * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1010, a0, a1); ctx.closePath(); ctx.fillStyle = SECTOR_COLOR[s.id]; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw(ctx, cx, cz, rad, mpp) {
    this.backdrop(ctx);
    if (this.w.iced !== this.iced) { this.iced = this.w.iced; this.c.clear(); }
    this.fx = cx; this.fz = cz; this.stamp++;
    const l = this.lodFor(mpp), sz = TP * LODS[l], eps = mpp * 0.7;
    ctx.imageSmoothingEnabled = true;
    for (let tx = Math.floor((cx - rad) / sz); tx <= Math.floor((cx + rad) / sz); tx++) {
      for (let tz = Math.floor((cz - rad) / sz); tz <= Math.floor((cz + rad) / sz); tz++) {
        const nx = clamp(cx, tx * sz, tx * sz + sz) - cx, nz = clamp(cz, tz * sz, tz * sz + sz) - cz;
        if (nx * nx + nz * nz > rad * rad) continue;
        let t = this.c.get(this.key(l, tx, tz));
        if (!t) { t = { l, tx, tz, row: 0, done: false, used: 0 }; this.c.set(this.key(l, tx, tz), t); }
        t.used = this.stamp;
        if (t.done) { ctx.drawImage(t.cv, tx * sz, tz * sz, sz + eps, sz + eps); continue; }
        this.want.set(this.key(l, tx, tz), t);
        // 没画好：找粗一级的瓦片顶上，再没有就先铺底色
        let drawn = false;
        for (let l2 = l + 1; l2 < LODS.length && !drawn; l2++) {
          const s2 = TP * LODS[l2], ux = Math.floor(tx * sz / s2), uz = Math.floor(tz * sz / s2), p = this.c.get(this.key(l2, ux, uz));
          if (p?.done) {
            p.used = this.stamp;
            const k = TP / s2; ctx.drawImage(p.cv, (tx * sz - ux * s2) * k, (tz * sz - uz * s2) * k, sz * k, sz * k, tx * sz, tz * sz, sz + eps, sz + eps); drawn = true;
          }
        }
      }
    }
    if (this.c.size > 260) { // 淘汰最久没用的
      const old = [...this.c.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, 60);
      for (const [k, t] of old) if (t.used < this.stamp - 2) this.c.delete(k);
    }
  }
  // 每帧调用：在预算（毫秒）内按离视野中心近的顺序把要画的瓦片画几行
  pump(ms = 6) {
    const t0 = performance.now();
    const jobs = [...this.want.values()].filter((j) => !j.done);
    this.want.clear();
    const d = (j) => { const s = TP * LODS[j.l]; return Math.hypot((j.tx + 0.5) * s - this.fx, (j.tz + 0.5) * s - this.fz); };
    jobs.sort((a, b) => d(a) - d(b));
    for (const j of jobs) {
      while (!j.done && performance.now() - t0 < ms) this.step(j);
      if (performance.now() - t0 >= ms) break;
    }
  }
  step(j) {
    const w = this.w, lod = LODS[j.l], sz = TP * lod, x0 = j.tx * sz, z0 = j.tz * sz;
    if (!j.cv) {
      j.cv = document.createElement('canvas'); j.cv.width = j.cv.height = TP; j.cx = j.cv.getContext('2d');
      j.img = j.cx.createImageData(TP, TP); j.terr = terrainHit(x0 - 2, z0 - 2, x0 + sz + 2, z0 + sz + 2);
    }
    const D = j.img.data, zc = z0 + (j.row + 1) * lod;
    for (let i = 0; i < TP / 2; i++) mapBase(x0 + (2 * i + 1) * lod, zc, this.views[i]);
    for (let py = j.row; py < j.row + 2; py++) {
      const z = z0 + (py + 0.5) * lod;
      for (let px = 0; px < TP; px++) {
        const x = x0 + (px + 0.5) * lod, o = (py * TP + px) * 4;
        this.pixel(x, z, this.views[px >> 1], lod, j.terr, this.rgb);
        D[o] = this.rgb[0]; D[o + 1] = this.rgb[1]; D[o + 2] = this.rgb[2]; D[o + 3] = 255;
      }
    }
    j.row += 2;
    if (j.row >= TP) { j.cx.putImageData(j.img, 0, 0); j.done = true; j.img = null; }
  }

  boxAt(x, z) {
    const w = this.w;
    if (Math.abs(x) < 52 && Math.abs(z) < 52 && w.insideHouse(x, z, 0)) return 1;
    const b = w.prefabCols.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`);
    if (b) for (const q of b.b) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return 2;
    return 0;
  }

  pixel(x, z, b, mpp, terr, o) {
    const w = this.w, c = this.rgb, fine = mpp <= 1.25, mid = mpp <= 2.2;
    let r = b[0], g = b[1], bl = b[2];
    // 路 / 广场 / 田 / 池边沙 / 岩地
    const path = b[3], kind = b[4] | 0;
    if (path > 0.3) {
      const rc = ROAD[kind] || ROAD[0], t = smooth(0.3, 0.7, path), sp = 0.94 + hash01(Math.floor(x * 2), Math.floor(z * 2), 3) * 0.12;
      r += (rc[0] * sp - r) * t; g += (rc[1] * sp - g) * t; bl += (rc[2] * sp - bl) * t;
    }
    c[0] = r; c[1] = g; c[2] = bl;
    let k = 1, hard = path > 0.5 ? 1 : 0;
    // 台地：高度阴影（西北来光）+ 陡坡露岩
    if (terr && mid) {
      const hx = groundY(x + 0.6, z) - groundY(x - 0.6, z), hz = groundY(x, z + 0.6) - groundY(x, z - 0.6), sl = Math.hypot(hx, hz) / 1.2;
      k *= clamp(1 - (hx + hz) * 0.32, 0.62, 1.32) * (1 + groundY(x, z) * 0.012);
      if (sl > 0.5) { mixc(c, c, [112, 106, 98], smooth(0.5, 1.2, sl)); hard = 1; }
    }
    // 树
    const tp = b[5]; let painted = false;
    if (tp > 0.004 && !hard) {
      if (fine) {
        const cx0 = Math.floor(x / CS), cz0 = Math.floor(z / CS);
        let crown = -1, shadow = false;
        for (let dz = -1; dz <= 1 && crown < 0; dz++) for (let dx = -1; dx <= 1; dx++) {
          const cx = cx0 + dx, cz = cz0 + dz;
          if (hash01(cx, cz, 5) >= tp) continue;
          const px = (cx + hash01(cx, cz, 6)) * CS, pz = (cz + hash01(cx, cz, 7)) * CS, dead = b[10] > 0, rad = dead ? 0.38 : 1.5 + hash01(cx, cz, 8) * 0.8;
          const ex = x - px, ez = z - pz, d2 = ex * ex + ez * ez;
          if (d2 < rad * rad) { crown = dead ? 9 : (1.12 - 0.34 * ((ex + ez) / (rad * 1.414) * 0.5 + 0.5)) * (0.86 + hash01(cx, cz, 9) * 0.28); break; }
          if (!dead) { const sx = ex - 1.1, sz2 = ez - 1.1; if (sx * sx + sz2 * sz2 < rad * rad * 0.8) shadow = true; }
        }
        if (crown > 8) { c[0] = 92; c[1] = 70; c[2] = 52; k = 1; painted = true; }
        else if (crown > 0) { c[0] = b[7] * crown; c[1] = b[8] * crown; c[2] = b[9] * crown; k = 1; painted = true; }
        else if (shadow) k *= 0.76;
      } else {
        const n = vnoise(x * 0.13, z * 0.13, 3), cov = clamp(tp * 2.3 * (0.65 + 0.7 * n), 0, 0.9) * (b[10] > 0 ? 0.25 : 1);
        c[0] += (b[7] * 0.8 - c[0]) * cov; c[1] += (b[8] * 0.8 - c[1]) * cov; c[2] += (b[9] * 0.8 - c[2]) * cov;
      }
    }
    if (fine && b[6] > 0.001 && !hard && !painted && mpp <= 1.1) {
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      if (hash01(cx, cz, 10) < b[6] * 2) {
        const px = (cx + 0.37 + hash01(cx, cz, 11) * 0.26) * CS, pz = (cz + 0.37 + hash01(cx, cz, 12) * 0.26) * CS, rad = 0.45 + hash01(cx, cz, 13) * 0.5, ex = x - px, ez = z - pz;
        if (ex * ex + ez * ez < rad * rad) { const lit = 1.1 - 0.3 * ((ex + ez) / (rad * 1.414) * 0.5 + 0.5); const rc = b[11] ? 96 : 156; c[0] = rc * lit; c[1] = rc * 0.97 * lit; c[2] = rc * 0.92 * lit; }
      }
    }
    // 房子 / 门派建筑：屋顶 + 往东南投影
    if (fine) {
      const inB = this.boxAt(x, z);
      if (inB) { const e = this.boxAt(x - 0.9, z - 0.9) ? 1 : 1.22, rc = inB === 1 ? [92, 84, 86] : [120, 108, 98]; c[0] = rc[0] * e; c[1] = rc[1] * e; c[2] = rc[2] * e; k = 1; }
      else if (this.boxAt(x - 1.3, z - 1.3)) k *= 0.7;
    }
    // 水
    if (mid && (Math.abs(x) < 120 || Math.abs(z) < 120 || w.extraWater.length)) {
      const ic = w.iced; w.iced = false;
      const d = w.waterDepth(x, z); w.iced = ic;
      if (d > 0.012) {
        const t = clamp(d / 1.3, 0, 1);
        if (ic) { c[0] = ICE[0]; c[1] = ICE[1]; c[2] = ICE[2]; }
        else { mixc(c, SHALLOW, DEEP, t); if (d < 0.07) mixc(c, c, [236, 248, 250], 0.4 * (1 - d / 0.07)); }
        k = 1 + (hash01(Math.floor(x * 3), Math.floor(z * 3), 14) - 0.5) * 0.06;
      }
    }
    // 冬天：地面发白（路和石板薄一些）
    if (w.iced && !(hard)) mixc(c, c, SNOW, 0.7);
    else if (w.iced) mixc(c, c, SNOW, 0.35);
    // 世界边缘：云雾
    const dd = Math.hypot(x, z);
    if (dd > 900) { const er = mapEdgeR(x, z); if (dd > er - 2) mixc(c, c, FOG, smooth(er - 2, er + 22, dd)); }
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
  }
}

// 世界坐标 → 画布坐标：view = { cx, cz, mpp, rot, W, H }
export function project(v, x, z) {
  const dx = x - v.cx, dz = z - v.cz, cs = Math.cos(v.rot), sn = Math.sin(v.rot);
  return [v.W / 2 + (dx * cs - dz * sn) / v.mpp, v.H / 2 + (dx * sn + dz * cs) / v.mpp];
}
export function unproject(v, sx, sy) {
  const px = (sx - v.W / 2) * v.mpp, py = (sy - v.H / 2) * v.mpp, cs = Math.cos(-v.rot), sn = Math.sin(-v.rot);
  return [v.cx + px * cs - py * sn, v.cz + px * sn + py * cs];
}
// 把 ctx 设成「世界米 → 画布」
export function setWorld(ctx, v, dpr = 1) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(v.W / 2, v.H / 2); ctx.rotate(v.rot); ctx.scale(1 / v.mpp, 1 / v.mpp); ctx.translate(-v.cx, -v.cz);
}
