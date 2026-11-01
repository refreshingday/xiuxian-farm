// 小地图 + 任务指针。
// 小地图：右上角圆形雷达，跟着镜头转（屏幕上方 = 镜头朝向）；底色是扇区，再叠境界圈、地标、村民、近处妖兽、任务目的地。
//   点它开舆图；右下角 ⊕ 或按 N 切换范围（30 / 60 / 120 / 240 米）。
// 任务指针：目的地在小地图范围外就贴在圆边；不在屏幕里就在屏幕边缘出一个箭头 + 距离。主线优先，否则指最近的。
import * as THREE from 'three';
import { SECTORS, RINGS } from './worldmap.js';
import { KIND, SECTOR_COLOR } from './landmarks.js';
import { screenOf } from './hpbar.js';
import { WALL_R, GATES } from './world.js';

const RANGES = [30, 60, 120, 240];
const $ = (id) => document.getElementById(id);
const _d = new THREE.Vector3();

export class Minimap {
  constructor(g) {
    this.g = g;
    this.wrap = $('miniWrap'); this.cv = $('mini'); this.ctx = this.cv.getContext('2d');
    this.ptr = $('qptr'); this.ptrI = this.ptr.querySelector('i'); this.ptrB = this.ptr.querySelector('b');
    this.size = 0; this.fx = 0; this.fz = -1;
    this.zoom = 1;
    try { this.zoom = Math.max(0, Math.min(RANGES.length - 1, +localStorage.getItem('miniZoom2') || 1)); } catch (e) { /* 存不了就算了 */ }
    this.cv.addEventListener('click', () => g.landmarks.open());
    $('miniZ').addEventListener('click', (e) => { e.stopPropagation(); this.cycle(); });
    // 对话 / 暂停时主循环不走，自己补画，免得空着
    this.last = 0;
    const idle = () => { requestAnimationFrame(idle); if (performance.now() - this.last > 150) this.update(); };
    requestAnimationFrame(idle);
    addEventListener('keydown', (e) => { if (e.code === 'KeyN' && !g.ui.blocking && !e.repeat) this.cycle(); });
  }
  cycle() {
    this.zoom = (this.zoom + 1) % RANGES.length;
    try { localStorage.setItem('miniZoom2', this.zoom); } catch (e) { /* 同上 */ }
    this.g.toast?.(`小地图范围 ${RANGES[this.zoom]} 米`, 1);
  }
  // 当前主要的任务目的地：主线优先，其余取最近的
  primary(P) {
    const all = this.g.quests?.tgt || [], story = all.filter((t) => t.story), pool = story.length ? story : all;
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
    const dpr = Math.min(devicePixelRatio || 1, 2), S = this.cv.clientWidth;
    if (S) {
      if (S !== this.size) { this.size = S; this.cv.width = this.cv.height = Math.round(S * dpr); }
      this.draw(P, fx, fz, S, dpr);
    }
    this.pointer(P, fx, fz);
  }

  draw(P, fx, fz, S, dpr) {
    const g = this.g, c = this.ctx, R = S / 2, range = RANGES[this.zoom], k = (R - 2) / range;
    // 屏幕坐标（右、下，米）：镜头朝向在上
    const to = (x, z) => { const dx = x - P.pos.x, dz = z - P.pos.z; return [-dx * fz + dz * fx, -(dx * fx + dz * fz)]; };
    const inR = (x, z, m = 8) => { const [sx, sy] = to(x, z); return Math.hypot(sx, sy) * k < R - m; };
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#141b1a'; c.fillRect(0, 0, S, S);

    // 地形层：世界坐标画，整体旋转到镜头朝向
    c.save(); c.translate(R, R); c.rotate(-Math.PI / 2 - Math.atan2(fz, fx)); c.scale(k, k); c.translate(-P.pos.x, -P.pos.z);
    for (const s of SECTORS) {
      const a0 = (s.ang - 30 - 90) * Math.PI / 180, a1 = (s.ang + 30 - 90) * Math.PI / 180;
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 1010, a0, a1); c.closePath();
      c.fillStyle = SECTOR_COLOR[s.id]; c.globalAlpha = 0.5; c.fill();
    }
    c.globalAlpha = 1; c.lineWidth = 1 / k;
    c.strokeStyle = 'rgba(255, 231, 168, .28)'; c.setLineDash([6 / k, 6 / k]);
    for (const r of RINGS.slice(0, 4)) { c.beginPath(); c.arc(0, 0, r.to, 0, Math.PI * 2); c.stroke(); }
    c.setLineDash([]);
    c.fillStyle = 'rgba(255, 231, 168, .18)'; c.beginPath(); c.arc(0, 0, WALL_R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255, 244, 210, .9)'; c.lineWidth = 2.5 / k; c.beginPath(); c.arc(0, 0, WALL_R, 0, Math.PI * 2); c.stroke(); // 村墙
    for (const gt of GATES) { c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(gt.x, gt.z, 3.5 / k, 0, Math.PI * 2); c.fill(); }
    c.restore();

    // 图标层：屏幕坐标，字不转
    const at = (x, z) => { const [sx, sy] = to(x, z); return [R + sx * k, R + sy * k]; };
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '12px sans-serif';
    for (const L of g.landmarks.list) {
      if (!L.found || !inR(L.x, L.z)) continue;
      const [x, y] = at(L.x, L.z); c.fillStyle = KIND[L.kind].color; c.fillText(KIND[L.kind].icon, x, y);
    }
    if (inR(0, 0, 18) && range > 120) { const [x, y] = at(0, 0); c.fillStyle = '#ffe7a8'; c.font = '10px "STKaiti","KaiTi",serif'; c.fillText('青竹村', x, y); }
    for (const v of g.village.list) {
      if (v.away || !inR(v.pos.x, v.pos.z, 4)) continue;
      const [x, y] = at(v.pos.x, v.pos.z); c.fillStyle = '#ffd98a'; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
    }
    for (const e of g.enemies.list) {
      if (e.alive === false || e.pos.distanceTo(P.pos) > 60 || !inR(e.pos.x, e.pos.z, 4)) continue;
      const [x, y] = at(e.pos.x, e.pos.z);
      c.fillStyle = e.boss ? '#d98aff' : '#ff5a5a'; c.beginPath(); c.arc(x, y, e.boss ? 4 : 2.2, 0, Math.PI * 2); c.fill();
      if (e.boss) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); }
    }
    // 村民头上的 ❗ ❓
    c.font = 'bold 13px sans-serif';
    const shown = [];
    for (const p of g.quests?.pins || []) {
      if (!inR(p.x, p.z, 4)) continue;
      const [x, y] = at(p.x, p.z);
      if (shown.some(([a, b]) => Math.hypot(a - x, b - y) < 7)) continue; // 村里挤在一起的只画一个
      shown.push([x, y]); c.fillStyle = p.ic === '❓' ? '#7dffb0' : '#ffe14a'; c.strokeStyle = '#000'; c.lineWidth = 3;
      const t = p.ic === '❓' ? '?' : '!'; c.strokeText(t, x, y); c.fillText(t, x, y);
    }
    // 任务目的地：范围内画图钉，范围外贴在圆边变成箭头
    const main = this.primary(P), pulse = 1 + Math.sin(g.time * 5) * 0.18;
    for (const t of g.quests?.tgt || []) {
      const [sx, sy] = to(t.x, t.z), d = Math.hypot(sx, sy) * k, isMain = main && t.x === main.x && t.z === main.z;
      const col = t.ic === '❓' ? '#7dffb0' : '#ffd23a';
      if (d < R - 10) {
        const [x, y] = at(t.x, t.z);
        if (isMain) { c.strokeStyle = col; c.lineWidth = 2; c.globalAlpha = 0.8; c.beginPath(); c.arc(x, y, 7 * pulse, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
        c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, 4.2, 0, Math.PI * 2); c.stroke(); c.fill();
      } else {
        const a = Math.atan2(sy, sx), m = R - 8;
        c.save(); c.translate(R + Math.cos(a) * m, R + Math.sin(a) * m); c.rotate(a);
        c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; if (isMain) c.scale(1.25 * pulse, 1.25 * pulse);
        c.beginPath(); c.moveTo(5, 0); c.lineTo(-4, 4.5); c.lineTo(-4, -4.5); c.closePath(); c.stroke(); c.fill(); c.restore();
      }
    }
    // 北
    { const [nx, ny] = to(P.pos.x, P.pos.z - 1000), a = Math.atan2(ny, nx); c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 10px "STKaiti","KaiTi",serif'; c.fillText('北', R + Math.cos(a) * (R - 9), R + Math.sin(a) * (R - 9)); }
    // 自己：朝向跟着角色，镜头转了也对
    c.save(); c.translate(R, R); c.rotate(Math.PI - P.yaw - Math.atan2(fz, fx) - Math.PI / 2);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.stroke(); c.fill(); c.restore();
    c.restore();
    c.strokeStyle = 'rgba(214, 182, 112, .75)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '9px sans-serif'; c.textAlign = 'left'; c.fillText(range + '米', R * 0.46, S - 9);
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
