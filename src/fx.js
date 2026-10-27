import * as THREE from 'three';
import { flat } from './util.js';

// 粒子、刀光、预警圈、伤害数字
export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.N = 600;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.pim = new THREE.InstancedMesh(flat(new THREE.IcosahedronGeometry(0.1, 0)), mat, this.N);
    this.pim.frustumCulled = false;
    this.pim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.N; i++) this.pim.setColorAt(i, new THREE.Color(0, 0, 0));
    this.pim.count = 0;
    scene.add(this.pim);
    this.parts = [];
    this.tele = [];
    this.slashes = [];
    this.rings = [];
    this.nums = [];
    this.numPool = [];
    this.numBox = document.getElementById('dmg');

    const sg = new THREE.RingGeometry(0.7, 2.7, 18, 1, -0.95, 1.9);
    sg.rotateX(-Math.PI / 2); sg.rotateY(-Math.PI / 2);
    this.slashGeo = sg;
    const cg = new THREE.RingGeometry(0.55, 1.0, 14, 1, -1.1, 2.2);
    cg.rotateX(-Math.PI / 2); cg.rotateY(-Math.PI / 2);
    this.crescentGeo = cg;
    this.circleGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2);
    this.lineGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  }

  burst(p, color, n, o = {}) {
    const c = new THREE.Color(color).multiplyScalar(o.bright ?? 2);
    for (let i = 0; i < n && this.parts.length < this.N; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x: p.x, y: (p.y ?? 0) + (o.y ?? 0.8), z: p.z,
        vx: Math.cos(a) * sp, vy: (o.up ?? 2) * (0.5 + Math.random()), vz: Math.sin(a) * sp,
        life: 0, max: (o.life ?? 0.5) * (0.6 + Math.random() * 0.8), size: (o.size ?? 1) * (0.6 + Math.random() * 0.8),
        c, grav: o.grav ?? -9, drag: o.drag ?? 2,
      });
    }
  }
  mote(x, y, z, color, o = {}) {
    if (this.parts.length >= this.N) return;
    this.parts.push({ x, y, z, vx: o.vx ?? 0, vy: o.vy ?? 0.3, vz: o.vz ?? 0, life: 0, max: o.life ?? 2, size: o.size ?? 0.6, c: new THREE.Color(color).multiplyScalar(o.bright ?? 2), grav: o.grav ?? 0, drag: 0.5 });
  }

  // tilt：绕前方轴翻滚，斜劈用（0 = 水平横扫）
  slash(pos, yaw, color = '#9ef0ff', flip = false, scale = 1, tilt = 0) {
    const m = new THREE.Mesh(this.slashGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.set(pos.x, 1.0, pos.z); m.rotation.order = 'YXZ'; m.rotation.set(0, yaw, tilt); m.scale.set(flip ? -scale : scale, 1, scale);
    this.scene.add(m);
    this.slashes.push({ m, t: 0, dur: 0.18 });
  }
  shockRing(x, z, r, color, dur = 0.35) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(x, 0.15, z); this.scene.add(m);
    this.rings.push({ m, t: 0, dur, r });
  }

  // 预警：红圈（填充随时间变满）
  circle(x, z, r, dur, onDone) {
    const mk = (geo, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
    const ring = mk(this.ringGeo, 0.9), fill = mk(this.circleGeo, 0.35);
    ring.position.set(x, 0.05, z); fill.position.set(x, 0.04, z);
    ring.scale.setScalar(r); fill.scale.setScalar(0.01);
    this.scene.add(ring, fill);
    this.tele.push({ kind: 'circle', ring, fill, r, t: 0, dur, onDone });
  }
  line(x, z, yaw, len, w, dur, onDone) {
    const m = new THREE.Mesh(this.lineGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
    const f = new THREE.Mesh(this.lineGeo, new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
    for (const o of [m, f]) { o.position.set(x, 0.05, z); o.rotation.y = yaw; o.scale.set(w, 1, len); }
    f.scale.z = 0.01;
    this.scene.add(m, f);
    this.tele.push({ kind: 'line', ring: m, fill: f, len, t: 0, dur, onDone });
  }

  num(p, text, cls = '') {
    const el = this.numPool.pop() || document.createElement('div');
    el.className = 'dn ' + cls; el.textContent = text;
    this.numBox.appendChild(el);
    this.nums.push({ el, p: new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.6, 2.0, p.z), t: 0 });
  }

  update(dt) {
    // 粒子
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life += dt;
      if (q.life >= q.max) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      q.vy += q.grav * dt;
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; q.vy *= -0.3; }
    }
    for (const q of this.parts) {
      const k = 1 - q.life / q.max, s = q.size * (0.3 + 0.7 * k);
      m4.makeScale(s, s, s).setPosition(q.x, q.y, q.z);
      this.pim.setMatrixAt(n, m4);
      this.pim.setColorAt(n, col.copy(q.c).multiplyScalar(k));
      n++;
    }
    this.pim.count = n;
    this.pim.instanceMatrix.needsUpdate = true;
    if (this.pim.instanceColor) this.pim.instanceColor.needsUpdate = true;

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]; s.t += dt;
      s.m.material.opacity = 0.85 * (1 - s.t / s.dur);
      if (s.t >= s.dur) { this.scene.remove(s.m); s.m.material.dispose(); this.slashes.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const s = this.rings[i]; s.t += dt; const k = s.t / s.dur;
      s.m.scale.setScalar(s.r * (0.3 + 0.7 * Math.sqrt(k)));
      s.m.material.opacity = 1 - k;
      if (k >= 1) { this.scene.remove(s.m); s.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const t = this.tele[i]; t.t += dt; const k = Math.min(1, t.t / t.dur);
      if (t.kind === 'circle') t.fill.scale.setScalar(Math.max(0.01, t.r * k));
      else t.fill.scale.z = Math.max(0.01, t.len * k);
      if (k >= 1) {
        this.scene.remove(t.ring, t.fill); t.ring.material.dispose(); t.fill.material.dispose();
        this.tele.splice(i, 1);
        t.onDone?.();
      }
    }

    const w = innerWidth, h = innerHeight, v = new THREE.Vector3();
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const d = this.nums[i]; d.t += dt; d.p.y += dt * 1.6;
      v.copy(d.p).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const sc = d.t < 0.1 ? 0.6 + d.t * 6 : 1.2 - Math.min(0.2, (d.t - 0.1));
      d.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${sc})`;
      d.el.style.opacity = String(1 - Math.max(0, d.t - 0.5) / 0.4);
      if (d.t > 0.9) { d.el.remove(); this.numPool.push(d.el); this.nums.splice(i, 1); }
    }
  }

  clearTele() {
    for (const t of this.tele) { this.scene.remove(t.ring, t.fill); t.ring.material.dispose(); t.fill.material.dispose(); }
    this.tele.length = 0;
  }
}
