// 小地图和舆图共用的画法：同一套地形 + 同一套图标，舆图只是把它放大（可以更大、能拖、能多显示名字）。
// v = { cx, cz, mpp, rot, W, H }；o = { dpr, R（圆形小地图的半径，舆图不传）, big（舆图：多画名字）}
import { KIND } from './landmarks.js';
import { WALL_R, GATES } from './world.js';
import { RINGS } from './worldmap.js';
import { project, setWorld } from './maptiles.js';

const KAI = '"STKaiti","KaiTi",serif';
export function paintMap(c, g, tiles, v, o) {
  const { W, H, mpp } = v, dpr = o.dpr || 1, P = g.player, R = o.R, big = o.big;
  const at = (x, z) => project(v, x, z);
  const vis = (x, y, m = 8) => R ? Math.hypot(x - R, y - R) < R - m : x > -20 && y > -20 && x < W + 20 && y < H + 20;
  const txt = (s, x, y, font, fill = '#fff', w = 3) => { c.font = font; c.lineWidth = w; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineJoin = 'round'; c.strokeText(s, x, y); c.fillStyle = fill; c.fillText(s, x, y); };
  // 地形
  setWorld(c, v, dpr);
  tiles.draw(c, v.cx, v.cz, Math.hypot(W, H) / 2 * mpp * 1.06, mpp);
  if (mpp * 120 > 90) { // 境界圈
    c.lineWidth = Math.max(1, 1.2 * mpp); c.strokeStyle = 'rgba(255, 231, 168, .35)'; c.setLineDash([6 * mpp, 6 * mpp]);
    for (const r of RINGS.slice(0, 4)) { c.beginPath(); c.arc(0, 0, r.to, 0, Math.PI * 2); c.stroke(); }
    c.setLineDash([]);
  }
  c.strokeStyle = 'rgba(255, 244, 210, .85)'; c.lineWidth = Math.max(1.4 * mpp, 0.9); c.beginPath(); c.arc(0, 0, WALL_R, 0, Math.PI * 2); c.stroke();
  for (const gt of GATES) { c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(gt.x, gt.z, Math.max(2.4 * mpp, 1.6), 0, Math.PI * 2); c.fill(); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  // 地标（发现了的）
  for (const L of g.landmarks.list) {
    if (!L.found) continue;
    const [x, y] = at(L.x, L.z); if (!vis(x, y)) continue;
    const K = KIND[L.kind]; txt(K.icon, x, y, '12px sans-serif', K.color);
    if (big && mpp < 4 && L.kind !== 'mine') txt(L.name, x, y + 13, '11px sans-serif', '#fff', 3);
  }
  { const [x, y] = at(0, 0); if (vis(x, y, 18) && mpp * 120 > 120) txt('青竹村', x, y, `10px ${KAI}`, '#ffe7a8'); }
  for (const vl of g.village.list) {
    if (vl.away) continue; const [x, y] = at(vl.pos.x, vl.pos.z); if (!vis(x, y, 4)) continue;
    c.fillStyle = '#ffd98a'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  for (const d of g.coop?.dots() || []) { // 联机道友
    const [x, y] = at(d.x, d.z); if (!vis(x, y, 4)) continue;
    c.fillStyle = d.color; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  for (const e of g.enemies.list) {
    if (e.alive === false || e.pos.distanceTo(P.pos) > 60) continue; const [x, y] = at(e.pos.x, e.pos.z); if (!vis(x, y, 4)) continue;
    c.fillStyle = e.boss ? '#d98aff' : '#ff5a5a'; c.beginPath(); c.arc(x, y, e.boss ? 4 : 2.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = e.boss ? '#fff' : 'rgba(0,0,0,.7)'; c.lineWidth = 1; c.stroke();
  }
  const shown = [];
  for (const p of g.quests?.pins || []) {
    const [x, y] = at(p.x, p.z); if (!vis(x, y, 4) || shown.some(([a, b]) => Math.hypot(a - x, b - y) < 7)) continue;
    shown.push([x, y]); txt(p.ic === '❓' ? '?' : '!', x, y, 'bold 13px sans-serif', p.ic === '❓' ? '#7dffb0' : '#ffe14a');
  }
  // 任务目的地：追踪中的高亮，其余变淡
  const sel = g.quests?.selected?.(), pulse = 1 + Math.sin(g.time * 5) * 0.18, main = o.main, out = [];
  for (const t of [...(g.quests?.tgt || []), ...(o.extra || [])]) {
    const [x, y] = at(t.x, t.z), col = t.pre ? '#8ad8ff' : t.ic === '❓' ? '#7dffb0' : '#ffd23a', mine = t.qid && t.qid === sel, dim = sel && t.qid && !mine;
    const isMain = main && t.x === main.x && t.z === main.z;
    if (!vis(x, y, 10)) { out.push({ t, x, y, col, isMain }); continue; }
    c.globalAlpha = dim ? 0.5 : 1;
    if (isMain || mine || t.pre) { c.strokeStyle = col; c.lineWidth = 2; c.globalAlpha *= 0.8; c.beginPath(); c.arc(x, y, (big ? 11 : 8) * pulse, 0, Math.PI * 2); c.stroke(); c.globalAlpha = dim ? 0.5 : 1; }
    c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 4.4, 0, Math.PI * 2); c.stroke(); c.fill();
    if (big) txt(t.title.length > 12 ? t.title.slice(0, 12) + '…' : t.title, x, y - 17, 'bold 12px sans-serif', mine ? '#ffe9a0' : '#fff', 3.5);
    c.globalAlpha = 1;
  }
  // 殒身之处（life.grave）：红 ✕；不在视野里就交给调用方贴边画箭头
  let grave = null;
  const gv = g.life?.grave;
  if (gv) {
    const [x, y] = at(gv.x, gv.z);
    if (vis(x, y, 10)) { txt('✕', x, y, 'bold 15px sans-serif', '#ff4a4a', 3.5); if (big) txt('殒身处', x, y + 14, '11px sans-serif', '#ffb0a8', 3); } else grave = { x, y };
  }
  // 自己
  const [px, py] = at(P.pos.x, P.pos.z);
  c.save(); c.translate(px, py); c.rotate(v.rot + Math.PI - P.yaw);
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.stroke(); c.fill(); c.restore();
  return { out, grave, px, py, txt };
}
