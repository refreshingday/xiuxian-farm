// 普攻连招：数据 + 状态机。与渲染无关，试炼场打磨好后可直接搬进主游戏。
//
// 节奏判定以"本招可衔接点 cancel"为基准：
//   在 cancel 之前点击（预输入）或 cancel 后 fastWin 内点击 → 快
//   cancel 后 fastWin ~ slowWin 内点击                      → 慢
//   超过 slowWin，或本招是收招（end）                       → 断，重新起手

export const TUNE = { fastWin: 0.15, slowWin: 0.8 };

// pose: R 右上→左下斜劈 | L 左上→右下斜劈 | U 右下→左上撩 | over 竖劈 | thrust | spin | leap | dash
// hits[].shape: arc（扇形，range/arc）| circle（圆，r，at=前方偏移）| wave（剑气，len/w）
// lunge: [t0, t1, 距离] 朝面向推进；leap: 跳跃（to:'aim' 跳向鼠标，最远 max）；sweep: 冲刺路径判定
export const MOVES = {
  slash1: { name: '斩·一', pose: 'R', dur: 0.34, cancel: 0.22, lunge: [0, 0.12, 0.5],
    hits: [{ t: 0.11, shape: 'arc', range: 2.6, arc: 1.1, dmg: 10, knock: 4 }] },
  slash2: { name: '斩·二', pose: 'L', dur: 0.34, cancel: 0.22, lunge: [0, 0.12, 0.5],
    hits: [{ t: 0.11, shape: 'arc', range: 2.6, arc: 1.1, dmg: 11, knock: 4 }] },
  slash3: { name: '斩·三', pose: 'U', dur: 0.36, cancel: 0.24, lunge: [0, 0.14, 0.8], scale: 1.15,
    hits: [{ t: 0.12, shape: 'arc', range: 2.8, arc: 1.2, dmg: 12, knock: 5 }] },
  flurry: { name: '连刺', pose: 'thrust', dur: 0.5, cancel: 0.4, lunge: [0, 0.36, 1.0],
    hits: [0.06, 0.15, 0.24, 0.33].map((t) => ({ t, shape: 'arc', range: 3.0, arc: 0.4, dmg: 5, knock: 1.5, stop: 0.02 })) },
  gale: { name: '疾风·终', pose: 'over', dur: 0.7, cancel: 0.55, end: true, color: '#9ef0ff',
    hits: [{ t: 0.24, shape: 'wave', len: 7, w: 1.6, dmg: 30, knock: 12, stop: 0.08, shake: 0.45 }] },
  thunder: { name: '落雷', pose: 'leap', dur: 0.75, cancel: 0.6, end: true, color: '#c8a8ff',
    leap: { t0: 0.04, t1: 0.42, dist: 1.5, h: 1.8 },
    hits: [{ t: 0.42, shape: 'circle', r: 3.4, at: 0, dmg: 32, knock: 11, stop: 0.09, shake: 0.55 }] },
  whirl: { name: '回旋剑舞', pose: 'spin', dur: 0.66, cancel: 0.56, end: true, moveSpd: 3,
    hits: [0.1, 0.24, 0.38, 0.52].map((t) => ({ t, shape: 'circle', r: 2.8, at: 0, dmg: 7, knock: 3, stop: 0.03, shake: 0.15 })) },
  pierce: { name: '惊鸿突刺', pose: 'dash', dur: 0.55, cancel: 0.42, end: true, iframe: 0.3,
    lunge: [0.04, 0.22, 7], sweep: { w: 1.3, dmg: 24, knock: 8, stop: 0.05, shake: 0.3 }, hits: [] },
  heavy: { name: '沉剑', pose: 'over', dur: 0.5, cancel: 0.36, lunge: [0.1, 0.24, 0.6], scale: 1.2, color: '#ffe28a',
    hits: [{ t: 0.26, shape: 'arc', range: 3.0, arc: 0.8, dmg: 20, knock: 9, stop: 0.07, shake: 0.3 }] },
  quake: { name: '破军·地裂', pose: 'over', dur: 0.8, cancel: 0.62, end: true, color: '#ffb84a',
    hits: [[0.3, 1.6, 2.2, 18], [0.4, 3.3, 1.8, 14], [0.5, 4.9, 1.8, 14], [0.6, 6.5, 2.1, 16]]
      .map(([t, at, r, dmg]) => ({ t, shape: 'circle', at, r, dmg, knock: 7, stop: 0.04, shake: 0.3 })) },
  meteor: { name: '流星坠', pose: 'leap', dur: 0.8, cancel: 0.62, end: true, color: '#ff8a5a', iframe: 0.45,
    leap: { t0: 0.04, t1: 0.45, to: 'aim', max: 6.5, h: 2.6 },
    hits: [{ t: 0.45, shape: 'circle', r: 3.6, at: 0, dmg: 40, knock: 14, stop: 0.1, shake: 0.7 }] },
};

for (const k in MOVES) MOVES[k].id = k;

// 输入路径 → 招式。'' 为起手；F=快 S=慢
export const TREE = {
  '': 'slash1',
  F: 'slash2', S: 'heavy',
  FF: 'slash3', FS: 'pierce',
  FFF: 'flurry', FFS: 'whirl',
  FFFF: 'gale', FFFS: 'thunder',
  SF: 'quake', SS: 'meteor',
};

export const ROUTES = [
  { name: '疾风五连', seq: 'FFFF', tag: '5连 · 剑气' },
  { name: '落雷', seq: 'FFFS', tag: '5连 · 范围' },
  { name: '回旋剑舞', seq: 'FFS', tag: '4连 · 范围' },
  { name: '惊鸿突刺', seq: 'FS', tag: '3连 · 突进' },
  { name: '破军三式', seq: 'SF', tag: '3连 · 范围' },
  { name: '流星坠', seq: 'SS', tag: '3连 · 跃击' },
];

export class ComboRunner {
  // moves / tree 可换成别的招式表（试炼场实验新招用），默认就是上面这套
  constructor(tune = TUNE, moves = MOVES, tree = TREE) {
    this.tune = tune; this.moves = moves; this.tree = tree;
    this.clock = 0;       // 自己的时钟（受慢放/顿帧影响，判定与画面一致）
    this.path = null;     // 当前连段路径；null = 未在连段中
    this.move = null; this.t = 0; this.hitIdx = 0;
    this.readyAt = -99; this.buf = false;
    this.chain = 0;
    this.last = null;     // 最近一次点击：{ dt 相对可衔接点, type }
    this.on = {};         // start(move, path, type) / hit(move, hit, idx)
  }

  get open() {
    return this.path !== null && !this.moves[this.tree[this.path]].end && this.clock - this.readyAt <= this.tune.slowWin;
  }

  click() {
    const m = this.move;
    if (m && this.t < m.cancel) {
      if (!this.buf) { this.buf = true; this.last = { dt: this.t - m.cancel, type: 'F' }; }
      return;
    }
    const dt = this.clock - this.readyAt;
    if (!this.open) { this.last = { dt, type: '起' }; this.start('', '起'); return; }
    const type = dt <= this.tune.fastWin ? 'F' : 'S';
    this.last = { dt, type };
    this.advance(type);
  }

  advance(type) {
    const key = this.path + type;
    if (this.tree[key]) this.start(key, type); else this.start('', '起');
  }

  start(path, type) {
    this.path = path; this.move = this.moves[this.tree[path]];
    this.t = 0; this.hitIdx = 0; this.buf = false;
    this.chain = path === '' ? 1 : this.chain + 1;
    this.on.start?.(this.move, path, type);
  }

  cancel() { this.move = null; this.path = null; this.buf = false; this.chain = 0; }

  update(dt) {
    this.clock += dt;
    const m = this.move;
    if (!m) return;
    const t0 = this.t; this.t += dt;
    while (this.hitIdx < m.hits.length && m.hits[this.hitIdx].t <= this.t) { this.on.hit?.(m, m.hits[this.hitIdx], this.hitIdx); this.hitIdx++; }
    if (t0 < m.cancel && this.t >= m.cancel) {
      this.readyAt = this.clock - (this.t - m.cancel);
      if (this.buf) { this.advance('F'); return; }
    }
    if (this.t >= m.dur) this.move = null;
  }
}
