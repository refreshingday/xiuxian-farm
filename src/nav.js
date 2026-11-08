// 村内格子寻路（A*）：0.8m 一格，第一次用时按 world.navCost 建格（碰撞体、塘、石峰不能走；路面便宜、草地贵），
// 找到的格子路再拉直：只有直线代价不比沿格子走更贵时才抄近路——所以村民走街，不会斜穿草地和房子。
const CELL = 0.8, HALF = 44, N = Math.ceil(HALF * 2 / CELL), SQ2 = Math.SQRT2;

export class NavGrid {
  constructor(world) { this.w = world; this.cost = null; }
  build() {
    this.cost = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.cost[j * N + i] = this.w.navCost(-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL);
  }
  cell(x, z) { return [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)]; }
  at(x, z) { if (!this.cost) this.build(); const [i, j] = this.cell(x, z); return i < 0 || j < 0 || i >= N || j >= N ? Infinity : this.cost[j * N + i]; }
  // 起终点落在不能走的格子（门口贴墙、摊位旁）就挪到最近能走的格子
  free(i, j) {
    for (let r = 0; r <= 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < N && b < N && this.cost[b * N + a] < Infinity) return b * N + a;
    }
    return -1;
  }
  // 这一点不能站人就换成最近能站的格子中心
  near(p) {
    if (!this.cost) this.build();
    if (this.at(p.x, p.z) < Infinity) return { x: p.x, z: p.z };
    const [i, j] = this.cell(p.x, p.z), k = i >= 0 && j >= 0 && i < N && j < N ? this.free(i, j) : -1;
    return k < 0 ? { x: p.x, z: p.z } : { x: -HALF + (k % N + 0.5) * CELL, z: -HALF + (((k / N) | 0) + 0.5) * CELL };
  }
  // 返回中间路点（不含起点；终点由调用者自己加）；找不到就返回 []，村民按原来的直线走
  find(A, B) {
    if (!this.cost) this.build();
    const [ai, aj] = this.cell(A.x, A.z), [bi, bj] = this.cell(B.x, B.z);
    if ([ai, aj, bi, bj].some((v) => v < 0 || v >= N)) return [];
    const s = this.free(ai, aj), e = this.free(bi, bj);
    if (s < 0 || e < 0 || s === e) return [];
    const C = this.cost, g = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    const ei = e % N, ej = (e / N) | 0, h = (k) => Math.hypot(k % N - ei, ((k / N) | 0) - ej);
    const heap = [], push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top[1]; };
    g[s] = 0; push(s, h(s));
    let found = false;
    while (heap.length) {
      const k = pop(); if (done[k]) continue; done[k] = 1;
      if (k === e) { found = true; break; }
      const i = k % N, j = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const n = b * N + a, c = C[n]; if (c === Infinity || done[n]) continue;
        if (di && dj && (C[j * N + a] === Infinity || C[b * N + i] === Infinity)) continue; // 不斜着切墙角
        const ng = g[k] + c * (di && dj ? SQ2 : 1);
        if (ng < g[n]) { g[n] = ng; from[n] = k; push(n, ng + h(n)); }
      }
    }
    if (!found) return [];
    const cells = []; for (let k = e; k >= 0; k = from[k]) cells.push(k); cells.reverse();
    // 拉直：从当前点往后找最远的、直线代价不超过沿格子代价的那一格
    const P = (k) => ({ x: -HALF + (k % N + 0.5) * CELL, z: -HALF + (((k / N) | 0) + 0.5) * CELL });
    const out = []; let a = 0;
    while (a < cells.length - 1) {
      let best = a + 1;
      for (let b = Math.min(cells.length - 1, a + 40); b > a + 1; b--) { const lc = this.lineCost(P(cells[a]), P(cells[b])); if (lc <= (g[cells[b]] - g[cells[a]]) / CELL * 1.02 + 0.05) { best = b; break; } }
      out.push(P(cells[best])); a = best;
    }
    return out;
  }
  // 直线代价（以格为单位）；穿过不能走的格就是无穷
  lineCost(p, q) {
    const L = Math.hypot(q.x - p.x, q.z - p.z), n = Math.max(1, Math.ceil(L / (CELL * 0.4)));
    let sum = 0;
    for (let t = 0; t < n; t++) { const f = (t + 0.5) / n, c = this.at(p.x + (q.x - p.x) * f, p.z + (q.z - p.z) * f); if (c === Infinity) return Infinity; sum += c; }
    return sum * L / n / CELL;
  }
}
