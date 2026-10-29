// 地标与地图（GDD 第 7 节）：宗门、坊市、秘境、妖王巢穴、独特地点、矿点。
// 在世界里立一块刻着名字的石碑，远处能看见一道光柱（矿点没有）；走到 50 米内算「发现」，地图（M）上才显示名字。
import * as THREE from 'three';
import { toon, mesh, at, canvasTex, addOutline, outlineMat } from './util.js';
import { SECTORS, RINGS, polar, sectorAt, edgeR } from './worldmap.js';
import { el, btn } from './ui.js';

const KIND = {
  sect: { icon: '⛩', color: '#ffd27a', name: '宗门' }, hub: { icon: '🏮', color: '#7dffb0', name: '坊市' },
  secret: { icon: '🌀', color: '#c8a8ff', name: '秘境' }, boss: { icon: '☠', color: '#ff6a5a', name: '妖王' },
  unique: { icon: '✦', color: '#9ef0ff', name: '奇地' }, mine: { icon: '⛏', color: '#c8c0b0', name: '矿点' },
};
const FOUND_R = 50;
const SECTOR_COLOR = { snow: '#c8d8e0', bamboo: '#6aa858', swamp: '#4a7a58', volcano: '#a85a40', desert: '#d8c088', battle: '#8a8274' };

export class Landmarks {
  constructor(g, data) {
    this.g = g; this.list = [];
    const seen = new Map();
    const add = (kind, o, extra = {}) => {
      const p = polar(o.ang, o.dist);
      const L = { kind, name: o.name, x: p.x, z: p.z, realm: o.realm, info: o.style || o.mech || o.ore || '', found: false, ...extra };
      if (seen.has(o.name)) { const a = seen.get(o.name); a.info = [a.info, L.info].filter(Boolean).join(' · '); return a; }
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
    for (const L of this.list) if (L.name !== '玄晶矿洞' && !L.hidden) this.build(L);
    this.lastEdge = 0;
  }
  // 石碑（名字竖着写）+ 光柱
  build(L) {
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
    g.position.set(L.x, 0, L.z); g.rotation.y = Math.atan2(-L.x, -L.z); // 碑面朝村子
    this.g.scene.add(g);
    this.g.world.addCircle(L.x, L.z, 0.9);
    if (L.kind !== 'mine') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 70, 10, 1, true).translate(0, 35, 0), new THREE.MeshBasicMaterial({
        color: new THREE.Color(K.color).multiplyScalar(1.6), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.position.set(L.x, 0, L.z); this.g.scene.add(m); this.beacons.push({ m, L });
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

  // ---------- 地图（M） ----------
  open() {
    const g = this.g, P = g.player;
    let sel = null;
    g.ui.panel('舆图', (body) => {
      const size = Math.min(560, innerWidth * 0.9 - 30, innerHeight * 0.86 - 120), S = size / (2 * 1200);
      const cv = el('canvas', 'mapcv'); cv.width = size * devicePixelRatio; cv.height = size * devicePixelRatio; cv.style.width = cv.style.height = size + 'px';
      const c = cv.getContext('2d'); c.scale(devicePixelRatio, devicePixelRatio);
      const X = (x) => size / 2 + x * S, Y = (z) => size / 2 + z * S;
      c.fillStyle = '#1a2220'; c.fillRect(0, 0, size, size);
      // 扇区楔形（北在上，顺时针）
      SECTORS.forEach((s) => {
        const a0 = (s.ang - 30 - 90) * Math.PI / 180, a1 = (s.ang + 30 - 90) * Math.PI / 180;
        c.beginPath(); c.moveTo(X(0), Y(0)); c.arc(X(0), Y(0), 1010 * S, a0, a1); c.closePath();
        c.fillStyle = SECTOR_COLOR[s.id]; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
        const lp = polar(s.ang, 620);
        c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `${Math.round(size / 26)}px "STKaiti","KaiTi",serif`; c.textAlign = 'center'; c.fillText(s.name, X(lp.x), Y(lp.z));
      });
      // 天劫峰那一截
      c.beginPath(); c.moveTo(X(0), Y(0)); c.arc(X(0), Y(0), 1170 * S, (-25 - 90) * Math.PI / 180, (25 - 90) * Math.PI / 180); c.closePath();
      c.fillStyle = '#d8e0ff'; c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1;
      // 境界圈
      c.strokeStyle = 'rgba(255, 231, 168, .35)'; c.lineWidth = 1; c.setLineDash([4, 4]);
      for (const r of RINGS.slice(0, 4)) { c.beginPath(); c.arc(X(0), Y(0), r.to * S, 0, Math.PI * 2); c.stroke(); }
      c.setLineDash([]);
      c.fillStyle = 'rgba(255, 231, 168, .6)'; c.font = `${Math.round(size / 48)}px sans-serif`; c.textAlign = 'left';
      RINGS.slice(0, 4).forEach((r) => c.fillText(r.realm + '圈', X(4), Y(-r.to + 14)));
      // 村子
      c.fillStyle = '#ffe7a8'; c.beginPath(); c.arc(X(0), Y(0), 4, 0, Math.PI * 2); c.fill();
      c.font = `${Math.round(size / 40)}px "STKaiti","KaiTi",serif`; c.textAlign = 'center'; c.fillText('青竹村', X(0), Y(0) + 16);
      // 地标
      c.textBaseline = 'middle';
      for (const L of this.list) {
        if (L.hidden && !L.found) continue;
        const K = KIND[L.kind];
        c.font = `${Math.round(size / 36)}px sans-serif`; c.fillStyle = L.found ? K.color : 'rgba(255,255,255,.35)';
        c.fillText(L.found ? K.icon : '?', X(L.x), Y(L.z));
        if (L.found && L.kind !== 'mine') { c.font = `${Math.round(size / 52)}px sans-serif`; c.fillText(L.name, X(L.x), Y(L.z) + size / 40); }
      }
      // 玩家
      c.save(); c.translate(X(P.pos.x), Y(P.pos.z)); c.rotate(-P.yaw + Math.PI);
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore();
      cv.addEventListener('click', (e) => {
        const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) - size / 2) / S, z = ((e.clientY - r.top) - size / 2) / S;
        sel = this.near(x, z, 40); g.ui.refresh();
      });
      body.append(cv);
      const sec = sectorAt(P.pos.x, P.pos.z);
      body.append(el('div', 'pempty', sel ? `${KIND[sel.kind].icon} ${sel.found ? sel.name : '？？？'} · ${KIND[sel.kind].name} · ${sel.realm || ''}圈 · ${Math.round(Math.hypot(sel.x, sel.z))} 米${sel.found && sel.info ? '<br>' + sel.info : ''}` :
        `你在 ${sec.name} · 离村 ${Math.round(Math.hypot(P.pos.x, P.pos.z))} 米。点地图上的标记看说明。已发现 ${this.list.filter((L) => L.found).length} / ${this.list.length} 处。`));
    });
  }
  save() { return this.list.filter((L) => L.found).map((L) => L.name); }
  load(s) { const f = new Set(s); for (const L of this.list) L.found = f.has(L.name) || L.name === '玄晶矿洞'; }
}
