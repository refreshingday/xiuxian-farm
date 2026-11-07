// 地标与地图（GDD 第 7 节）：宗门、坊市、秘境、妖王巢穴、独特地点、矿点。
// 在世界里立一块刻着名字的石碑，远处能看见一道光柱（矿点没有）；走到 50 米内算「发现」，地图（M）上才显示名字。
import * as THREE from 'three';
import { toon, mesh, at, canvasTex, addOutline, outlineMat } from './util.js';
import { polar, edgeR } from './worldmap.js';

export const KIND = {
  sect: { icon: '⛩', color: '#ffd27a', name: '宗门' }, hub: { icon: '🏮', color: '#7dffb0', name: '坊市' },
  secret: { icon: '🌀', color: '#c8a8ff', name: '秘境' }, boss: { icon: '☠', color: '#ff6a5a', name: '妖王' },
  unique: { icon: '✦', color: '#9ef0ff', name: '奇地' }, mine: { icon: '⛏', color: '#c8c0b0', name: '矿点' },
};
const FOUND_R = 50;
export const SECTOR_COLOR = { snow: '#c8d8e0', bamboo: '#6aa858', swamp: '#4a7a58', volcano: '#a85a40', desert: '#d8c088', battle: '#8a8274' };

export class Landmarks {
  constructor(g, data) {
    this.g = g; this.list = [];
    const seen = new Map();
    const add = (kind, o, extra = {}) => {
      const p = polar(o.ang, o.dist);
      const L = { kind, name: o.name, x: p.x, z: p.z, realm: o.realm, info: o.style || o.mech || o.ore || '', found: false, ...extra };
      if (seen.has(o.name)) { const a = seen.get(o.name); a.info = [a.info, L.info].filter(Boolean).join(' · '); return a; }
      // 奇地就在宗门里（「剑宗 · 万剑峰」= 剑宗）：并进宗门，不再在山门中间另立一块碑
      const host = kind === 'unique' && this.list.find((q) => q.kind === 'sect' && Math.hypot(q.x - L.x, q.z - L.z) < 5);
      if (host) { host.info = [host.info, L.info].filter(Boolean).join(' · '); return host; }
      seen.set(o.name, L); this.list.push(L); return L;
    };
    for (const s of data.sects) add('sect', s, { size: s.size });
    for (const h of data.hubs) add('hub', h);
    for (const s of data.secretRealms) add('secret', s);
    for (const b of data.bosses) add('boss', b);
    for (const u of data.unique) add('unique', u);
    for (const m of data.mines) add('mine', m, { info: m.ore });
    const mine = this.list.find((L) => L.name === '玄晶矿洞'); if (mine) mine.found = true; // 原型已经建好的矿洞，开局就知道
    this.beacons = [];
    const hide = this.list.find((L) => L.name === '血魔宫'); if (hide) hide.hidden = true; // GDD：入口隐藏
    for (const L of this.list) if (L.name !== '玄晶矿洞' && !L.hidden && L.kind !== 'sect') this.build(L); // 宗门的石碑由 sects.js 按各派布局摆
    this.lastEdge = 0;
  }
  // 石碑（名字竖着写）+ 光柱
  build(L, pos = L) {
    const g = new THREE.Group(), K = KIND[L.kind];
    const tex = canvasTex(96, 320, (c, w, h) => {
      c.fillStyle = '#8a8a84'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a2a28'; c.font = 'bold 40px "STKaiti","KaiTi","Noto Serif SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const chars = [...L.name.replace(/\s|·/g, '')].slice(0, 6), step = Math.min(50, (h - 40) / chars.length);
      chars.forEach((ch, i) => c.fillText(ch, w / 2, 30 + step * (i + 0.5)));
    }, { pixel: false, repeat: false });
    const stone = toon('#9a9a94', { occ: true }), face = toon('#ffffff', { map: tex });
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 0.9).translate(0, 0.2, 0), stone));
    const slab = mesh(new THREE.BoxGeometry(0.9, 2.6, 0.32).translate(0, 1.7, 0), [stone, stone, stone, stone, face, stone]);
    g.add(slab);
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.25, 0.45).translate(0, 3.1, 0), toon('#6a6a64', { occ: true })));
    addOutline(g, outlineMat('#2b1d14', 0.03));
    g.position.set(pos.x, 0, pos.z); g.rotation.y = pos === L ? Math.atan2(-L.x, -L.z) : 0; // 碑面朝村子（宗门的朝镜头）
    this.g.scene.add(g);
    this.g.world.addCircle(pos.x, pos.z, 0.9);
    if (L.kind !== 'mine') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 70, 10, 1, true).translate(0, 35, 0), new THREE.MeshBasicMaterial({
        color: new THREE.Color(K.color).multiplyScalar(1.6), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.position.set(pos.x, 0, pos.z); this.g.scene.add(m); this.beacons.push({ m, L });
    }
  }
  near(x, z, r = 40) { let best = null, bd = r; for (const L of this.list) { const d = Math.hypot(L.x - x, L.z - z); if (d < bd) { bd = d; best = L; } } return best; }
  regionName(x, z) {
    const L = this.near(x, z, 36);
    return L ? `${L.name}` : null;
  }
  update(dt) {
    const g = this.g, P = g.player;
    for (const L of this.list) if (!L.found && Math.hypot(L.x - P.pos.x, L.z - P.pos.z) < FOUND_R) {
      L.found = true; g.toast(`发现：${L.name}（${KIND[L.kind].name}）`, 2.5); g.emit?.('discover', L);
    }
    // 光柱远看清楚、走近了变淡，别挡视线
    for (const b of this.beacons) { const d = Math.hypot(b.L.x - P.pos.x, b.L.z - P.pos.z); b.m.material.opacity = Math.min(0.22, Math.max(0.03, (d - 15) / 120)); }
    // 世界边缘：云雾挡路（北边能一直走到天劫峰）
    const r = Math.hypot(P.pos.x, P.pos.z), er = edgeR(P.pos.x, P.pos.z);
    if (r > er) {
      P.pos.x *= er / r; P.pos.z *= er / r;
      if (g.time - this.lastEdge > 4) { this.lastEdge = g.time; g.toast('云雾茫茫，再往前就迷路了', 1.6); }
    }
  }

  // 舆图在 bigmap.js（实时地形 + 平移缩放 + 任务定位）
  open(opts) { this.g.bigmap.open(opts); }
  save() { return this.list.filter((L) => L.found).map((L) => L.name); }
  load(s) { const f = new Set(s); for (const L of this.list) L.found = f.has(L.name) || L.name === '玄晶矿洞'; }
}
