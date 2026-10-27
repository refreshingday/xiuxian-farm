import * as THREE from 'three';
import { toon, mesh, at, lerp, setFlash, outlineMat, addOutline } from './util.js';

// 统一 Q 版骨架：所有人（玩家、村民、小孩、老人）共用同一套关节与动画，
// 只换部件、颜色和比例。
const G = {};
function geos() {
  if (G.head) return G;
  const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  G.head = sph(0.44, 22, 16);
  G.eye = sph(0.075, 12, 10);
  G.shine = sph(0.026, 6, 5);
  G.cheek = sph(0.06, 10, 6);
  G.mouth = new THREE.BoxGeometry(0.07, 0.022, 0.02);
  G.torso = new THREE.CylinderGeometry(0.22, 0.3, 0.5, 14);
  G.collar = new THREE.CylinderGeometry(0.19, 0.23, 0.1, 14);
  G.lapel = new THREE.BoxGeometry(0.07, 0.36, 0.03);
  G.skirt = new THREE.CylinderGeometry(0.3, 0.47, 0.42, 14);
  G.belt = new THREE.CylinderGeometry(0.255, 0.265, 0.09, 14);
  // 手臂两节：上臂 + 前臂（汉服宽袖口在前臂），肘部一个小球盖住接缝
  G.upper = new THREE.CylinderGeometry(0.1, 0.13, 0.22, 10).translate(0, -0.11, 0);
  G.fore = new THREE.CylinderGeometry(0.11, 0.17, 0.22, 10).translate(0, -0.11, 0);
  G.elbow = sph(0.115, 10, 8);
  G.hand = sph(0.07, 8, 6);
  G.leg = new THREE.CylinderGeometry(0.075, 0.065, 0.44, 8).translate(0, -0.22, 0);
  G.foot = sph(0.09, 10, 6).scale(1, 0.7, 1.45);
  G.cap = new THREE.SphereGeometry(0.475, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
  G.bang = sph(0.17, 12, 8);
  G.lock = sph(0.12, 10, 8);
  G.bun = sph(0.16, 12, 10);
  G.pin = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5).rotateZ(Math.PI / 2);
  G.longBack = sph(0.36, 14, 10).scale(1, 1.25, 0.55);
  G.beard = new THREE.ConeGeometry(0.14, 0.4, 8).rotateX(Math.PI);
  G.blade = new THREE.BoxGeometry(0.07, 1.0, 0.02).translate(0, 0.62, 0);
  G.guard = new THREE.BoxGeometry(0.26, 0.05, 0.07).translate(0, 0.1, 0);
  G.grip = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6);
  return G;
}

/**
 * a: { skin, hair, hairStyle(0短 1长 2发髻 3双髻), robe, robe2, belt, pants, age('child'|'adult'|'elder'), beard, sword }
 */
export function createChibi(a) {
  const g = geos();
  const mats = [];
  const M = (c, o = {}) => { const m = toon(c, { ...o, unique: true }); mats.push(m); return m; };
  const skin = M(a.skin), robe = M(a.robe), robe2 = M(a.robe2), belt = M(a.belt);
  const hair = M(a.hair), pants = M(a.pants || '#3a3f4a'), dark = M('#2a1a18');
  const white = toon('#ffffff'), blush = toon('#ff9e94'), inner = M(a.inner || '#f4f1ea');

  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  const hips = new THREE.Group(); hips.position.y = 0.55; rig.add(hips);
  const body = new THREE.Group(); hips.add(body);
  body.add(at(mesh(g.torso, robe), 0, 0.25, 0));
  body.add(at(mesh(g.collar, robe2), 0, 0.5, 0));
  // 交领（汉服右衽）：两条斜襟
  for (const sd of [-1, 1]) {
    const l = mesh(g.lapel, sd < 0 ? inner : robe2, { cast: false });
    l.position.set(sd * 0.06, 0.32, 0.245); l.rotation.set(-0.25, 0, sd * 0.5); body.add(l);
  }
  body.add(at(mesh(g.belt, belt), 0, 0.06, 0));
  hips.add(at(mesh(g.skirt, robe2), 0, -0.1, 0));

  const neck = new THREE.Group(); neck.position.y = 0.52; body.add(neck);
  const head = new THREE.Group(); head.position.y = 0.36; neck.add(head);
  const hm = mesh(g.head, skin); hm.scale.set(1, 0.93, 0.95); head.add(hm);
  const face = [];
  for (const s of [-1, 1]) {
    const e = mesh(g.eye, dark, { cast: false }); e.scale.set(0.85, 1.3, 0.45); e.position.set(s * 0.15, -0.04, 0.39); head.add(e); face.push(e);
    const sh = mesh(g.shine, white, { cast: false }); sh.position.set(s * 0.15 + 0.025, 0.0, 0.42); head.add(sh); face.push(sh);
    const ck = mesh(g.cheek, blush, { cast: false }); ck.scale.set(1.1, 0.6, 0.3); ck.position.set(s * 0.25, -0.15, 0.345); head.add(ck); face.push(ck);
  }
  const mo = mesh(g.mouth, dark, { cast: false }); mo.position.set(0, -0.19, 0.405); head.add(mo); face.push(mo);
  const cap = mesh(g.cap, hair); cap.position.set(0, 0.04, -0.03); cap.rotation.x = -0.42; head.add(cap);
  // 刘海 + 鬓发
  for (const [x, y, z, rz] of [[-0.2, 0.2, 0.3, 0.4], [0.02, 0.25, 0.34, -0.1], [0.22, 0.19, 0.3, -0.5]]) {
    const b = mesh(g.bang, hair); b.scale.set(1, 0.72, 0.5); b.position.set(x, y, z); b.rotation.z = rz; head.add(b);
  }
  for (const sd of [-1, 1]) { const l = mesh(g.lock, hair); l.scale.set(0.5, 1.35, 0.6); l.position.set(sd * 0.39, -0.1, 0.12); head.add(l); }
  const hs = a.hairStyle ?? 0;
  if (hs === 1) head.add(at(mesh(g.longBack, hair), 0, -0.3, -0.3));
  if (hs === 2) {
    head.add(at(mesh(g.bun, hair), 0, 0.46, -0.1));
    head.add(at(mesh(g.pin, M('#e8d9a0')), 0, 0.48, -0.1));
  }
  if (hs === 3) for (const s of [-1, 1]) head.add(at(mesh(g.bun, hair), s * 0.33, 0.3, -0.05));
  if (a.beard) head.add(at(mesh(g.beard, hair), 0, -0.42, 0.3));

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.3, 0.42, 0); sh.rotation.order = 'YXZ'; body.add(sh);
    sh.add(mesh(g.upper, robe));
    const el = new THREE.Group(); el.position.y = -0.2; sh.add(el);
    el.add(mesh(g.elbow, robe), mesh(g.fore, robe));
    const hand = new THREE.Group(); hand.position.y = -0.22; el.add(hand);
    hand.add(mesh(g.hand, skin));
    arms.push({ sh, el, hand, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.13, -0.02, 0); hips.add(hp);
    hp.add(mesh(g.leg, pants));
    hp.add(at(mesh(g.foot, dark), 0, -0.48, 0.04));
    legs.push(hp);
  }

  let sword = null;
  if (a.sword) {
    sword = new THREE.Group();
    sword.add(mesh(g.blade, M('#e4edf5', { emissive: '#7fd8ff', ei: 0.25 })));
    sword.add(mesh(g.guard, M('#c9a24a')));
    sword.add(mesh(g.grip, M('#5a3a2a')));
    sword.rotation.x = 1.7;
    arms[0].hand.add(sword);
  }

  addOutline(root, outlineMat('#2b1d14', 0.022), (m) => face.includes(m) || m.geometry === g.blade);

  if (a.age === 'child') { rig.scale.setScalar(0.7); head.scale.setScalar(1.12); }
  if (a.age === 'elder') { body.rotation.x = 0.2; neck.rotation.x = -0.15; rig.scale.setScalar(0.95); }

  return { root, rig, hips, body, head, arms, legs, sword, mats, phase: Math.random() * 10, flash: 0, lean: a.age === 'elder' ? 0.2 : 0 };
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

/** s: { move 0..1, attack -1|0..1, combo, cast 0..1, dash, spin 0..1 } */
export function animChibi(c, dt, s) {
  c.phase += dt * (2 + s.move * 9);
  const ph = c.phase;
  const sw = Math.sin(ph) * s.move;
  c.hips.position.y = 0.55 + Math.abs(Math.cos(ph)) * 0.06 * s.move + Math.sin(ph * 0.4) * 0.008;
  c.legs[0].rotation.x = sw * 0.8;
  c.legs[1].rotation.x = -sw * 0.8;
  const [R, L] = c.arms;
  let rx = -sw * 0.7, ry = 0, lx = sw * 0.7, bodyY = 0, swordX = 1.7;
  if (s.attack >= 0) {
    const p = easeOut(s.attack);
    swordX = Math.PI;
    if (s.combo === 2) { rx = lerp(-3.0, -0.35, p); }
    else {
      const dir = s.combo === 0 ? 1 : -1;
      rx = -1.45; ry = lerp(-1.4, 1.5, p) * dir; bodyY = lerp(-0.5, 0.5, p) * dir;
    }
  } else if (s.cast > 0) { rx = -1.55; ry = 0.15; swordX = Math.PI; lx = -0.6; }
  if (s.work > 0) { const k = Math.sin(s.work * Math.PI); rx = -2.2 * k; lx = -2.0 * k; }
  if (s.talk) { lx = -0.4 + Math.sin(ph * 2) * 0.15; }
  R.sh.rotation.set(rx, ry, R.s * 0.15);
  L.sh.rotation.set(lx, 0, L.s * 0.15);
  // 手肘：平时自然微弯，挥剑时伸直
  R.el.rotation.x = s.attack >= 0 || s.cast > 0 ? -0.1 : -0.3 - Math.max(0, -sw) * 0.4;
  L.el.rotation.x = s.work > 0 ? -0.6 : -0.3 - Math.max(0, sw) * 0.4;
  c.body.rotation.y = bodyY;
  if (c.sword) c.sword.rotation.x = swordX;
  c.rig.rotation.x = s.dash ? 0.35 : 0;
  c.rig.rotation.y = s.spin > 0 ? s.spin * Math.PI * 4 : 0;
  if (c.flash > 0) { c.flash -= dt; setFlash(c.mats, c.flash > 0 ? 0.9 : 0); }
}
