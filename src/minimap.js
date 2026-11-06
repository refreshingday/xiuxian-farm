// 小地图 + 任务指针。
// 小地图：右上角圆形，跟着镜头转（屏幕上方 = 镜头朝向），地形是实时画的（maptiles.js：草 / 路 / 树冠 / 房子 / 水都看得出来），
//   滚轮或 ＋ － 缩放，按住拖动看别处（◎ 回到自己，10 秒不动也会自己回来），点一下开舆图（bigmap.js），N 键切 30 / 60 / 120 / 240 米。
//   上面叠地标、村民、近处妖兽、任务目的地；选中（追踪）的任务高亮，其余的变淡。
// 任务指针：目的地在屏幕外就在屏幕边缘出一个箭头 + 距离。追踪中的任务优先，其次主线，否则指最近的。
import * as THREE from 'three';
import { KIND } from './landmarks.js';
import { screenOf } from './hpbar.js';
import { WALL_R, GATES } from './world.js';
import { RINGS } from './worldmap.js';
import { TileMap, project, setWorld, unproject } from './maptiles.js';

const PRESETS = [30, 60, 120, 240], MIN_R = 18, MAX_R = 480;
const $ = (id) => document.getElementById(id);
const _d = new THREE.Vector3();

export class Minimap {
  constructor(g) {
    this.g = g;
    this.wrap = $('miniWrap'); this.cv = $('mini'); this.ctx = this.cv.getContext('2d');
    this.ptr = $('qptr'); this.ptrI = this.ptr.querySelector('i'); this.ptrB = this.ptr.querySelector('b');
    this.tiles = g.tiles = new TileMap(g.world);
    this.size = 0; this.fx = 0; this.fz = -1;
    this.range = 60; this.pan = { x: 0, z: 0 }; this.panT = 0; this.rot = 0; this.view = null;
    try { this.range = Math.max(MIN_R, Math.min(MAX_R, +localStorage.getItem('miniRange') || 60)); } catch (e) { /* 存不了就算了 */ }
    this.bindInput();
    // 对话 / 暂停时主循环不走，自己补画，免得空着
    this.last = 0;
    const idle = () => { requestAnimationFrame(idle); if (performance.now() - this.last > 150) this.update(); };
    requestAnimationFrame(idle);
    addEventListener('keydown', (e) => { if (e.code === 'KeyN' && !g.ui.blocking && !e.repeat) this.cycle(); });
  }
  bindInput() {
    const g = this.g, cv = this.cv;
    cv.style.touchAction = 'none';
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || !this.view) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved < 4) return;
      const v = this.view, [wx0, wz0] = unproject(v, 0, 0), [wx1, wz1] = unproject(v, dx, dy);
      this.pan.x -= wx1 - wx0; this.pan.z -= wz1 - wz0; this.panT = performance.now();
    });
    cv.addEventListener('pointerup', (e) => { if (drag && drag.moved < 4 && !g.ui.blocking) g.bigmap.open(); drag = null; });
    cv.addEventListener('pointercancel', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.setRange(this.range * Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    $('miniIn').addEventListener('click', (e) => { e.stopPropagation(); this.setRange(this.range / 1.6); });
    $('miniOut').addEventListener('click', (e) => { e.stopPropagation(); this.setRange(this.range * 1.6); });
    $('miniC').addEventListener('click', (e) => { e.stopPropagation(); this.pan.x = this.pan.z = 0; });
  }
  setRange(r) {
    this.range = Math.max(MIN_R, Math.min(MAX_R, r));
    try { localStorage.setItem('miniRange', Math.round(this.range)); } catch (e) { /* 同上 */ }
  }
  cycle() {
    const next = PRESETS.find((p) => p > this.range * 1.05) || PRESETS[0];
    this.setRange(next); this.g.toast?.(`小地图范围 ${next} 米`, 1);
  }
  // 当前主要的任务目的地：追踪中的任务优先，其次主线，其余取最近的
  primary(P) {
    const all = this.g.quests?.tgt || [], sel = this.g.quests?.selected?.(), story = all.filter((t) => t.story);
    const mine = sel ? all.filter((t) => t.qid === sel) : [];
    const pool = mine.length ? mine : story.length ? story : all;
    let best = null, bd = 1e9;
    for (const t of pool) { const d = Math.hypot(t.x - P.pos.x, t.z - P.pos.z); if (d < bd) { bd = d; best = t; } }
    return best && { ...best, d: bd };
  }

  update() {
    const g = this.g, P = g.player, cam = g.camera;
    this.last = performance.now();
    cam.getWorldDirection(_d);
    const l = Math.hypot(_d.x, _d.z);
    if (l > 0.05) { this.fx = _d.x / l; this.fz = _d.z / l; }
    const { fx, fz } = this;
    if ((this.pan.x || this.pan.z) && performance.now() - this.panT > 10000) this.pan.x = this.pan.z = 0;
    $('miniC').hidden = !(this.pan.x || this.pan.z);
    const dpr = Math.min(devicePixelRatio || 1, 2), S = this.cv.clientWidth;
    if (S) {
      if (S !== this.size) { this.size = S; this.cv.width = this.cv.height = Math.round(S * dpr); }
      this.draw(P, fx, fz, S, dpr);
    }
    this.pointer(P, fx, fz);
  }

  draw(P, fx, fz, S, dpr) {
    const g = this.g, c = this.ctx, R = S / 2, range = this.range, mpp = range / (R - 2);
    const v = this.view = { cx: P.pos.x + this.pan.x, cz: P.pos.z + this.pan.z, mpp, rot: -Math.PI / 2 - Math.atan2(fz, fx), W: S, H: S };
    const at = (x, z) => project(v, x, z), dist = (x, z) => { const [sx, sy] = at(x, z); return Math.hypot(sx - R, sy - R); };
    const inR = (x, z, m = 8) => dist(x, z) < R - m;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#141b1a'; c.fillRect(0, 0, S, S);

    // 地形层：世界坐标画，整体旋转到镜头朝向
    setWorld(c, v, dpr);
    this.tiles.draw(c, v.cx, v.cz, range * 1.08, mpp);
    c.lineWidth = 1.2 * mpp;
    if (range > 90) { // 境界圈（远一点才有意义）
      c.strokeStyle = 'rgba(255, 231, 168, .35)'; c.setLineDash([6 * mpp, 6 * mpp]);
      for (const r of RINGS.slice(0, 4)) { c.beginPath(); c.arc(0, 0, r.to, 0, Math.PI * 2); c.stroke(); }
      c.setLineDash([]);
    }
    c.strokeStyle = 'rgba(255, 244, 210, .85)'; c.lineWidth = Math.max(1.4 * mpp, 0.9); c.beginPath(); c.arc(0, 0, WALL_R, 0, Math.PI * 2); c.stroke(); // 村墙
    for (const gt of GATES) { c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(gt.x, gt.z, Math.max(2.4 * mpp, 1.6), 0, Math.PI * 2); c.fill(); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 图标层：屏幕坐标，字不转
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '12px sans-serif';
    for (const L of g.landmarks.list) {
      if (!L.found || !inR(L.x, L.z)) continue;
      const [x, y] = at(L.x, L.z); c.fillStyle = KIND[L.kind].color; c.strokeStyle = 'rgba(0,0,0,.75)'; c.lineWidth = 3; c.strokeText(KIND[L.kind].icon, x, y); c.fillText(KIND[L.kind].icon, x, y);
    }
    if (inR(0, 0, 18) && range > 120) { const [x, y] = at(0, 0); c.fillStyle = '#ffe7a8'; c.strokeStyle = '#000'; c.lineWidth = 3; c.font = '10px "STKaiti","KaiTi",serif'; c.strokeText('青竹村', x, y); c.fillText('青竹村', x, y); }
    for (const vl of g.village.list) {
      if (vl.away || !inR(vl.pos.x, vl.pos.z, 4)) continue;
      const [x, y] = at(vl.pos.x, vl.pos.z); c.fillStyle = '#ffd98a'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    for (const e of g.enemies.list) {
      if (e.alive === false || e.pos.distanceTo(P.pos) > 60 || !inR(e.pos.x, e.pos.z, 4)) continue;
      const [x, y] = at(e.pos.x, e.pos.z);
      c.fillStyle = e.boss ? '#d98aff' : '#ff5a5a'; c.beginPath(); c.arc(x, y, e.boss ? 4 : 2.2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = e.boss ? '#fff' : 'rgba(0,0,0,.7)'; c.lineWidth = 1; c.stroke();
    }
    // 村民头上的 ❗ ❓
    c.font = 'bold 13px sans-serif';
    const shown = [];
    for (const p of g.quests?.pins || []) {
      if (!inR(p.x, p.z, 4)) continue;
      const [x, y] = at(p.x, p.z);
      if (shown.some(([a, b]) => Math.hypot(a - x, b - y) < 7)) continue; // 挤在一起的只画一个
      shown.push([x, y]); c.fillStyle = p.ic === '❓' ? '#7dffb0' : '#ffe14a'; c.strokeStyle = '#000'; c.lineWidth = 3;
      const t = p.ic === '❓' ? '?' : '!'; c.strokeText(t, x, y); c.fillText(t, x, y);
    }
    // 任务目的地：范围内画图钉，范围外贴在圆边变成箭头；追踪中的任务高亮，其余变淡
    const main = this.primary(P), sel = g.quests?.selected?.(), pulse = 1 + Math.sin(g.time * 5) * 0.18;
    for (const t of g.quests?.tgt || []) {
      const [x, y] = at(t.x, t.z), sx = x - R, sy = y - R, d = Math.hypot(sx, sy), isMain = main && t.x === main.x && t.z === main.z;
      const col = t.ic === '❓' ? '#7dffb0' : '#ffd23a', dim = sel && t.qid !== sel;
      c.globalAlpha = dim ? 0.5 : 1;
      if (d < R - 10) {
        if (isMain) { c.strokeStyle = col; c.lineWidth = 2; c.globalAlpha = 0.8; c.beginPath(); c.arc(x, y, 8 * pulse, 0, Math.PI * 2); c.stroke(); c.globalAlpha = dim ? 0.5 : 1; }
        c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, 4.4, 0, Math.PI * 2); c.stroke(); c.fill();
      } else {
        const a = Math.atan2(sy, sx), m = R - 8;
        c.save(); c.translate(R + Math.cos(a) * m, R + Math.sin(a) * m); c.rotate(a);
        c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; if (isMain) c.scale(1.25 * pulse, 1.25 * pulse);
        c.beginPath(); c.moveTo(5, 0); c.lineTo(-4, 4.5); c.lineTo(-4, -4.5); c.closePath(); c.stroke(); c.fill(); c.restore();
      }
      c.globalAlpha = 1;
    }
    // 北
    { const [nx, ny] = at(v.cx, v.cz - 100000), a = Math.atan2(ny - R, nx - R); c.fillStyle = 'rgba(255,255,255,.9)'; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 3; c.font = 'bold 10px "STKaiti","KaiTi",serif'; c.strokeText('北', R + Math.cos(a) * (R - 9), R + Math.sin(a) * (R - 9)); c.fillText('北', R + Math.cos(a) * (R - 9), R + Math.sin(a) * (R - 9)); }
    // 自己：朝向跟着角色，镜头转了也对
    { const [px, py] = at(P.pos.x, P.pos.z);
      c.save(); c.translate(px, py); c.rotate(v.rot + Math.PI - P.yaw);
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.stroke(); c.fill(); c.restore(); }
    c.restore();
    c.strokeStyle = 'rgba(214, 182, 112, .75)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '9px sans-serif'; c.textAlign = 'left'; c.fillText(Math.round(range) + '米', R * 0.46, S - 9);
    this.tiles.pump(7);
  }

  // 屏幕边缘箭头：目的地不在屏幕里才出现（在屏幕里有头顶的 📍 / ❗ / ❓）
  pointer(P, fx, fz) {
    const g = this.g, ptr = this.ptr, t = g.ui.blocking ? null : this.primary(P);
    if (!t || t.d < 5) { ptr.hidden = true; return; }
    const cam = g.camera, mob = document.body.classList.contains('mobile');
    const W = innerWidth, H = innerHeight, ml = 50, mr = mob ? 50 : 250, mt = mob ? 70 : 190, mb = mob ? 100 : 150;
    const [sx, sy, front] = screenOf(cam, t.x, 1.5, t.z);
    if (front && sx > ml && sx < W - mr && sy > mt && sy < H - mb) { ptr.hidden = true; return; }
    const [ox, oy] = screenOf(cam, P.pos.x, 1, P.pos.z);
    let vx = sx - ox, vy = sy - oy;
    if (!front) { vx = -vx; vy = -vy; }
    if (Math.hypot(vx, vy) < 1) { vx = -(t.x - P.pos.x) * fz + (t.z - P.pos.z) * fx; vy = -((t.x - P.pos.x) * fx + (t.z - P.pos.z) * fz); }
    const tx = vx > 0 ? (W - mr - ox) / vx : vx < 0 ? (ml - ox) / vx : 1e9, ty = vy > 0 ? (H - mb - oy) / vy : vy < 0 ? (mt - oy) / vy : 1e9;
    const s = Math.min(tx, ty);
    ptr.hidden = false;
    ptr.style.transform = `translate(${Math.round(ox + vx * s)}px, ${Math.round(oy + vy * s)}px) translate(-50%, -50%)`;
    ptr.classList.toggle('ret', t.ic === '❓');
    this.ptrI.style.transform = `rotate(${Math.atan2(vy, vx)}rad)`;
    this.ptrB.textContent = Math.round(t.d) + ' 米';
    ptr.title = t.title;
  }
}
