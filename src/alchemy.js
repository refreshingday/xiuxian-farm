// 炼丹（GDD 第 8 节「炼丹规则」）：自家屋里的丹炉。
// 控火小游戏约 10 秒：按住加火、松开降火，让火候停在金色区间里；在区间里的时间越久品质越高。
// 品质：下品 1 颗、中品 2 颗、上品 2 颗（药力 ×1.3）、极品 3 颗带丹纹（药力 ×1.6）。不会炸炉，最差也出下品。
// 同一丹方炼过 10 次后可以一键炼制，固定出中品；想要上品、极品还得亲手控火。火灵根让金色区间更宽。
import * as THREE from 'three';
import { item, itemName, RECIPES } from './items.js';
import { toon, glow, mesh, at, addOutline, outlineMat } from './util.js';
import { near } from './life.js';
import { btn, el } from './ui.js';

const DUR = 10, QUICK_AFTER = 10;
const GRADE = ['下品', '中品', '上品', '极品'];

export class Alchemy {
  constructor(g) {
    this.g = g;
    this.known = new Set(); this.count = {};
    const h = g.life.home;
    this.pos = { x: h.cx + 0.4, z: h.z0 + 1.0 };
    this.build();
    g.life.on((P) => near(P, this.pos, 1.7) && { label: '炼丹', act: () => this.open(), d: 0.9 });
  }
  build() {
    const g = new THREE.Group(), bronze = toon('#a8743f', { occ: true }), dark = toon('#5a3a26', { occ: true });
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.6, 12).translate(0, 0.65, 0), bronze));
    g.add(mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 16).rotateX(Math.PI / 2).translate(0, 0.95, 0), dark));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 6).translate(0, 0.2, 0), dark), Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35)); }
    for (const s of [-1, 1]) g.add(at(mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 10, Math.PI).translate(0, 0, 0), dark), s * 0.5, 1.05, 0));
    g.add(at(mesh(new THREE.ConeGeometry(0.5, 0.32, 12).translate(0, 1.12, 0), bronze), 0, 0, 0));
    this.fire = mesh(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.5, 1), glow('#ff6a2a', 2.5, true), { cast: false });
    this.fire.position.y = 0.3; g.add(this.fire);
    g.position.set(this.pos.x, 0.12, this.pos.z);
    addOutline(g, outlineMat('#2b1d14', 0.03));
    this.g.scene.add(g); this.g.world.addCircle(this.pos.x, this.pos.z, 0.6);
    this.mesh = g; this.heat = 0;
  }
  learn(id, quiet) {
    if (this.known.has(id)) return;
    this.known.add(id);
    if (!quiet) this.g.toast(`习得丹方：${itemName(id)}`, 2.5);
  }
  // 哪套主料够（多套任选）；不够返回 null
  pickSet(id) {
    const r = RECIPES[id], sets = Array.isArray(r.in) ? r.in : [r.in], inv = this.g.inv;
    return sets.find((s) => Object.entries(s).every(([k, n]) => inv.count(k) >= n)) || null;
  }
  needText(id) {
    const r = RECIPES[id], sets = Array.isArray(r.in) ? r.in : [r.in], inv = this.g.inv;
    return sets.map((s) => Object.entries(s).map(([k, n]) => `${itemName(k)} ${Math.min(inv.count(k), n)}/${n}`).join('、')).join(' 或 ');
  }

  open() {
    const g = this.g;
    g.ui.panel('丹炉', (body) => {
      if (!this.known.size) body.append(el('div', 'pempty', '你还不会任何丹方。丹方可以从妖王、秘境、村民好感、门派贡献商店得到。'));
      for (const id of Object.keys(RECIPES)) {
        if (!this.known.has(id)) continue;
        const it = item(id), set = this.pickSet(id), n = this.count[id] || 0;
        const bs = [btn('炼制', () => this.start(id), set ? '' : 'off')];
        if (n >= QUICK_AFTER) bs.push(btn('一键（中品）', () => this.start(id, true), set ? '' : 'off'));
        body.append(g.ui.row(it.icon, `${it.name} <i>已炼 ${n} 次</i>`, this.needText(id), bs));
      }
      body.append(el('div', 'pempty', '控火：按住（鼠标 / 空格 / 手指）加火，松开降火，火候停在金色区间里越久，丹药品质越高。'));
    });
  }
  take(id) {
    const set = this.pickSet(id); if (!set) return false;
    for (const [k, n] of Object.entries(set)) this.g.inv.take(k, n);
    return true;
  }
  start(id, quick) {
    const g = this.g;
    if (!this.take(id)) { g.toast('主料不够', 1.5); return; }
    if (quick) { this.finish(id, 0, true); return; }
    // 控火小游戏：自己跑一个循环（面板开着时游戏是暂停的）
    const fireBonus = g.rootPassive?.('火') ?? 0, w = 0.11 * (1 + fireBonus * 1.5), speed = RECIPES[id].speed || 1;
    const st = { t: 0, h: 0.2, hold: false, inZone: 0, ph: Math.random() * 6 };
    let gauge, zone, mark, timeBar, scoreTxt;
    const down = (e) => { if (e.type === 'keydown' && e.code !== 'Space') return; e.preventDefault?.(); st.hold = true; };
    const up = (e) => { if (e.type === 'keyup' && e.code !== 'Space') return; st.hold = false; };
    g.ui.panel(`炼丹 · ${itemName(id)}`, (body) => {
      const box = el('div', 'alc');
      gauge = el('div', 'alc-gauge'); zone = el('i', 'alc-zone'); mark = el('b', 'alc-mark', '🔥'); gauge.append(zone, mark);
      const side = el('div', 'alc-side');
      timeBar = el('div', 'alc-time', '<i></i>'); scoreTxt = el('div', 'alc-score', '');
      const hold = el('div', 'alc-hold', '按住 加火');
      side.append(el('div', 'pempty', '按住加火、松开降火，让 🔥 停在金色区间里。'), timeBar, scoreTxt, hold);
      box.append(gauge, side); body.append(box);
      for (const t of [box]) { t.addEventListener('pointerdown', down); t.addEventListener('pointerup', up); t.addEventListener('pointerleave', up); t.addEventListener('pointercancel', up); }
    }, () => { cancelAnimationFrame(st.raf); removeEventListener('keydown', down); removeEventListener('keyup', up); if (!st.done) this.finish(id, 0); });
    addEventListener('keydown', down); addEventListener('keyup', up);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      st.t += dt;
      st.h = Math.max(0, Math.min(1, st.h + (st.hold ? 0.62 : -0.45) * dt * speed));
      const c = 0.5 + 0.26 * Math.sin(st.t * 0.8 * speed + st.ph) + 0.1 * Math.sin(st.t * 2.1 * speed);
      const inZ = Math.abs(st.h - c) < w;
      if (inZ) st.inZone += dt;
      zone.style.bottom = (c - w) * 100 + '%'; zone.style.height = w * 200 + '%';
      mark.style.bottom = `calc(${st.h * 100}% - 12px)`; mark.classList.toggle('in', inZ);
      timeBar.firstChild.style.width = (1 - st.t / DUR) * 100 + '%';
      scoreTxt.textContent = `火候 ${Math.round(st.inZone / DUR * 100)}%`;
      this.heat = st.h;
      if (st.t >= DUR) { st.done = true; this.g.ui.closePanel(); this.finish(id, st.inZone / DUR); return; }
      st.raf = requestAnimationFrame(loop);
    };
    st.raf = requestAnimationFrame(loop);
    g.sfx?.unlock?.();
  }
  // score 0..1 → 品质；quick（一键）固定中品
  finish(id, score, quick = false) {
    const g = this.g;
    const q = quick ? 1 : score >= 0.85 ? 3 : score >= 0.62 ? 2 : score >= 0.38 ? 1 : 0;
    const out = q === 3 ? id + '+2' : q === 2 ? id + '+1' : id, n = [1, 2, 2, 3][q];
    g.inv.add(out, n);
    this.count[id] = (this.count[id] || 0) + 1;
    this.heat = 0;
    g.fx.burst({ x: this.pos.x, z: this.pos.z }, q >= 2 ? '#ffe28a' : '#ff9a5a', 24 + q * 10, { speed: 3, up: 5, life: 0.9, y: 1.2, grav: -1 });
    g.emit?.('craft', id, q);
    g.ui.dialog({ narrate: true, line: `${GRADE[q]}！炼成 ${itemName(out)} ×${n}${quick ? '' : `（火候 ${Math.round(score * 100)}%）`}`, info: q === 3 ? '丹纹浮现——极品丹药！' : '' });
  }
  update(dt) {
    const k = this.heat;
    this.fire.material.color.copy(this.fire.material.userData.base ?? (this.fire.material.userData.base = this.fire.material.color.clone())).multiplyScalar(0.3 + k * 1.4);
    this.fire.scale.setScalar(0.6 + k * 0.8);
  }
  save() { return { known: [...this.known], count: this.count }; }
  load(s) { this.known = new Set(s.known); this.count = s.count || {}; }
}
