import * as THREE from 'three';
import { clamp, lerp } from '../util.js';

// ======================================================================
// 下水：涉水 / 游泳 的特效、姿势和声音
// 参考常见的游戏做法（风之杖 / 旷野之息式卡通水）：
// - 水面波纹圈：角色在水里时一圈圈扩散，走动时更密；圈会按固定花纹"断开"消散（alpha 侵蚀）
// - 入水溅花：踩进水、从涉水变游泳时一簇水珠 + 大波纹
// - 涉水脚步：每一步在脚边溅几滴水、起一个小圈
// - 游泳尾迹：头前推起白沫，身后左右两道向外散开的泡沫（V 字尾迹）
// - 划水：每只手入水时溅水花，脚后打水的小水花
// - 出水：身上滴水一两秒，衣服变深色、慢慢晾干
// ======================================================================

export const WADE_SLOW = 0.55; // 水到腰时走路速度只剩一半多
export const SWIM_IN = 0.55, SWIM_OUT = 0.42; // 水深（米）超过这个就游起来（实验场的湖都不深，最深 0.6~1.3）；有回差，免得在边上来回切换

// ---------- 波纹圈 ----------
const ringVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ringFS = `uniform float uT, uOp, uSeed, uSoft; uniform vec3 uCol; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float d = length(p), ang = atan(p.y, p.x);
    // uSoft（踩水洼用）：圈的半径沿圆周轻轻起伏（不是正圆），剖面更宽更虚，像一圈模糊的水晕而不是一道线
    d *= 1.0 + uSoft * (0.07 * sin(ang * 3.0 + uSeed) + 0.04 * sin(ang * 5.0 - uSeed * 1.3));
    // 软边：高斯式的剖面（中间最实、两边慢慢淡出去），不是一条硬边的线；圈越扩越细
    float w = mix(0.17, 0.06, uT) * (1.0 + uSoft * 1.4), c = 1.0 - w * 1.7, e = (d - c) / (w * 0.8);
    float a = exp(-e * e * (1.6 - uSoft * 0.8)) * (1.0 - smoothstep(0.9, 1.0, d)) * (1.0 - uSoft * 0.55);
    // 沿圆周固定的断口花纹：越到后面断得越多
    float n = 0.5 + 0.25 * sin(ang * 5.0 + uSeed) + 0.25 * sin(ang * 3.0 - uSeed * 1.7);
    a *= smoothstep(uT * 1.05 - 0.32, uT * 1.05 + 0.1, n); // 断口也是慢慢淡掉的，不是一刀切
    a *= uOp * 0.8 * (1.0 - uT * uT);
    if (a < 0.008) discard;
    gl_FragColor = vec4(uCol, a);
  }`;

export function createWaterFx(parent) {
  const group = new THREE.Group(); group.renderOrder = 3; parent.add(group);
  const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const foamCol = new THREE.Color('#ffffff');

  const rings = [];
  for (let i = 0; i < 48; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uT: { value: 0 }, uOp: { value: 1 }, uSeed: { value: 0 }, uSoft: { value: 0 }, uCol: { value: foamCol } },
      vertexShader: ringVS, fragmentShader: ringFS,
    });
    const m = new THREE.Mesh(plane, mat); m.visible = false; m.renderOrder = 3; m.frustumCulled = false;
    group.add(m);
    rings.push({ m, t: 0, life: 1, r0: 0.3, r1: 1, sx: 1, on: false });
  }
  let ri = 0;
  function ring(x, y, z, r0, r1, life = 1, op = 0.9, yaw = 0, stretch = 1, soft = 0) {
    const R = rings[ri]; ri = (ri + 1) % rings.length;
    Object.assign(R, { t: 0, life, r0, r1, sx: stretch, on: true });
    R.m.position.set(x, y + 0.012, z); R.m.rotation.y = yaw; R.m.visible = true;
    R.m.material.uniforms.uOp.value = op; R.m.material.uniforms.uSeed.value = Math.random() * 20; R.m.material.uniforms.uSoft.value = soft;
  }

  // ---------- 水珠（受重力，落回水面时可能再起一个小圈）----------
  const DROPS = 260;
  const dropMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), dropMat, DROPS);
  drops.frustumCulled = false; drops.renderOrder = 3; group.add(drops);
  // 半透明的水珠（踩水洼用）：同一个池子，soft 的画在这一层
  const softMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false });
  const dropsSoft = new THREE.InstancedMesh(drops.geometry, softMat, DROPS);
  dropsSoft.frustumCulled = false; dropsSoft.renderOrder = 4; group.add(dropsSoft);
  const D = Array.from({ length: DROPS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, life: 0, s: 0, floor: 0, ripple: false, soft: false }));
  let di = 0;
  function drop(x, y, z, vx, vy, vz, s, floor, ripple = false, life = 1.2, soft = false) {
    const d = D[di]; di = (di + 1) % DROPS;
    d.p.set(x, y, z); d.v.set(vx, vy, vz); d.t = 0; d.life = life; d.s = s; d.floor = floor; d.ripple = ripple; d.soft = soft;
  }
  // 一簇水花：向上 + 向外随机散开
  function splash(x, y, z, n, up, out, size, dir = null, soft = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, o = out * (0.4 + Math.random() * 0.6);
      let vx = Math.cos(a) * o, vz = Math.sin(a) * o;
      if (dir) { vx += dir.x * out * 0.8; vz += dir.z * out * 0.8; }
      drop(x + Math.cos(a) * 0.08, y + 0.02, z + Math.sin(a) * 0.08, vx, up * (0.55 + Math.random() * 0.6), vz, size * (0.6 + Math.random() * 0.6), y, !soft && i % 4 === 0, 1.2, soft);
    }
  }

  // ---------- 泡沫块（平贴水面，先胀后缩；用缩放代替透明度，卡通感更强）----------
  const FOAMS = 220;
  const foamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const foams = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), foamMat, FOAMS);
  foams.frustumCulled = false; foams.renderOrder = 4; group.add(foams);
  const F = Array.from({ length: FOAMS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, life: 0, s: 0 }));
  let fi = 0;
  function foam(x, y, z, vx, vz, s, life = 1.1) {
    const f = F[fi]; fi = (fi + 1) % FOAMS;
    f.p.set(x, y + 0.02, z); f.v.set(vx, 0, vz); f.t = 0; f.life = life * (0.7 + Math.random() * 0.6); f.s = s * (0.7 + Math.random() * 0.6);
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function update(dt) {
    for (const R of rings) {
      if (!R.on) continue;
      R.t += dt / R.life;
      if (R.t >= 1) { R.on = false; R.m.visible = false; continue; }
      const e = 1 - (1 - R.t) * (1 - R.t), r = lerp(R.r0, R.r1, e);
      R.m.scale.set(r, 1, r * R.sx); R.m.material.uniforms.uT.value = R.t;
    }
    for (let i = 0; i < DROPS; i++) {
      const d = D[i];
      if (d.t >= d.life) { drops.setMatrixAt(i, _zero); dropsSoft.setMatrixAt(i, _zero); continue; }
      d.t += dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor && d.v.y < 0) {
        if (d.ripple) ring(d.p.x, d.floor, d.p.z, 0.04, 0.35, 0.6, 0.6);
        d.t = d.life; drops.setMatrixAt(i, _zero); dropsSoft.setMatrixAt(i, _zero); continue;
      }
      const k = d.s * Math.sqrt(1 - d.t / d.life);
      _s.set(k, k * (1 + Math.min(1.5, Math.abs(d.v.y) * 0.15)), k); // 下落时拉长一点
      (d.soft ? dropsSoft : drops).setMatrixAt(i, _m.compose(d.p, _q, _s)); (d.soft ? drops : dropsSoft).setMatrixAt(i, _zero);
    }
    drops.instanceMatrix.needsUpdate = true; dropsSoft.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < FOAMS; i++) {
      const f = F[i];
      if (f.t >= f.life) { foams.setMatrixAt(i, _zero); continue; }
      f.t += dt; f.p.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.exp(-2.5 * dt));
      const u = f.t / f.life, k = f.s * Math.min(1, u * 5) * (1 - u) * (1 - u) * 1.4;
      _s.set(k, 1, k);
      foams.setMatrixAt(i, _m.compose(f.p, _q, _s));
    }
    foams.instanceMatrix.needsUpdate = true;
  }
  function setColor(c) { foamCol.set(c).lerp(new THREE.Color('#ffffff'), 0.45); dropMat.color.copy(foamCol).multiplyScalar(0.85); softMat.color.copy(dropMat.color); foamMat.color.copy(foamCol).multiplyScalar(0.92); } // 稍暗一点，免得被泛光当成发光体
  function clear() { for (const R of rings) { R.on = false; R.m.visible = false; } for (const d of D) d.t = d.life = 0; for (const f of F) f.t = f.life = 0; }
  return { group, ring, drop, splash, foam, update, setColor, clear };
}

// ---------- 声音：低通噪声做水声（闷、软，不要尖的"叮"声）----------
let AC = null, noiseBuf = null, master = null;
function ac() {
  if (AC) return AC;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1.2, AC.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  } catch { AC = null; }
  return AC;
}
// 浏览器要求用户先操作过才能出声
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { const a = ac(); if (a && a.state === 'suspended') a.resume(); }, { passive: true });

/** kind: 'step' 涉水脚步 | 'puddle' 踩雨后水洼 | 'stroke' 划水 | 'enter' 入水 | 'plunge' 下深水 | 'exit' 出水 */
export function waterSound(kind, vol = 1) {
  const a = AC; if (!a || a.state !== 'running') return;
  waterVoice(a, master, noiseBuf, kind, vol, a.currentTime);
}
// 真正出声的部分（也给离线渲染试听用）。全部是低通噪声（Q 0.25，不共振、没有音高）。
// 入水 / 出水（v2026.11.04.20 重做）：原来是快起音 + 320→110Hz 的低频"噗"，听起来像撞到硬东西；
// 现在是：慢一点起音的"哗"（截止频率高、往下扫，响度带随机起伏 = 水的翻涌）+ 截止频率乱跳的"咕噜"晃水声 + 几滴回落的水珠
export function waterVoice(a, out, nb, kind, vol, t) {
  const R = Math.random, r = 0.9 + R() * 0.2;
  // fa→fb：截止频率扫动；jit：响度随机起伏（0 = 平滑）；wob：截止频率乱跳（0 = 不跳）
  const layer = (len, fa, fb, gain, attack, off = 0, jit = 0, wob = 0) => {
    const src = a.createBufferSource(); src.buffer = nb; src.playbackRate.value = r;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.25;
    const t0 = t + off, f = lp.frequency, gn = a.createGain(), g = gn.gain;
    f.setValueAtTime(fa * r, t0);
    if (wob) for (let i = 1, n = Math.ceil(len / 0.045); i <= n; i++) f.linearRampToValueAtTime(Math.max(150, (fa + (fb - fa) * i / n) * (1 - wob + R() * wob * 2)), t0 + len * i / n);
    else f.exponentialRampToValueAtTime(fb, t0 + len);
    g.setValueAtTime(0, t0); g.linearRampToValueAtTime(gain * vol, t0 + attack);
    if (jit) for (let i = 1, n = Math.ceil((len - attack) / 0.035); i < n; i++) {
      const u = i / n; g.linearRampToValueAtTime(gain * vol * Math.pow(1 - u, 2.2) * (1 - jit + R() * jit), t0 + attack + (len - attack) * u);
    }
    g.exponentialRampToValueAtTime(0.0005, t0 + len);
    src.connect(lp).connect(gn).connect(out);
    src.start(t0, R() * 0.5, len + 0.05);
  };
  const drips = (n, from, span, gain) => { for (let k = 0; k < n; k++) layer(0.05 + R() * 0.05, 2200 + R() * 1200, 900, gain * (0.5 + R() * 0.5), 0.004, from + R() * span); };
  if (kind === 'enter') { // 走进水里：轻的"唰"，带一点水珠
    layer(0.42, 2600, 700, 0.3, 0.05, 0, 0.5);
    layer(0.5, 1000, 500, 0.12, 0.08, 0.05, 0.4, 0.45);
    drips(3, 0.15, 0.4, 0.05);
  } else if (kind === 'plunge') { // 下到深水：大一点的"哗啦"，接晃水声和回落的水花
    layer(0.65, 3400, 650, 0.32, 0.06, 0, 0.55);
    layer(0.9, 1300, 450, 0.16, 0.12, 0.08, 0.5, 0.5);
    drips(7, 0.25, 0.75, 0.06);
  } else if (kind === 'exit') { // 从水里出来：身上的水往下淌，"哗——"慢起慢收，后面滴答
    layer(0.6, 2000, 600, 0.22, 0.14, 0, 0.5, 0.25);
    layer(0.5, 1100, 500, 0.1, 0.1, 0.1, 0.45, 0.5);
    drips(6, 0.3, 0.9, 0.05);
  } else {
    const [len, f0, f1, gn] = { step: [0.16, 800, 330, 0.2], stroke: [0.22, 600, 280, 0.18], land: [0.2, 260, 90, 0.7], puddle: [0.12, 1000, 360, 0.24] }[kind];
    layer(len, f0, f1, gn, 0.02);
    if (kind === 'puddle') layer(0.09, 520, 220, gn * 0.45, 0.008, 0.05 + R() * 0.03); // 踩雨后水洼：啪嗒——第二下更低更轻的"嗒"（水落回地面）
  }
}

// ---------- 游泳姿势 ----------
// 在 animChibi 的走路姿势之上叠：k = 游泳程度 0..1，sp = 游动 0..1（0 = 踩水，1 = 自由泳）
// 手臂整圈转用四元数插值，转过 2π 不会跳
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _qw = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export function swimPose(c, k, sp, ph, t) {
  if (c.sword) c.sword.visible = k < 0.5; // 游泳时把剑收起来
  if (k <= 0.001) { c.hips.rotation.x = 0; c.head.parent.rotation.x = 0; return; }
  const lean = lerp(0.2, 1.2, sp);
  c.hips.rotation.x = lean * k;
  c.hips.position.y = lerp(c.hips.position.y, 0.55, k);
  c.head.parent.rotation.x = -lean * 0.78 * k; // 抬头看前面
  c.body.rotation.y = lerp(c.body.rotation.y, Math.sin(ph) * 0.35 * sp, k); // 自由泳的侧身转动
  c.arms.forEach((A, i) => {
    const th = ph + i * Math.PI;
    _qw.copy(A.sh.quaternion);
    // 踩水：手臂往两边、前后划
    _qa.setFromEuler(_e.set(-0.5 + Math.sin(t * 4 + i) * 0.25, 0, A.s * (0.85 + Math.sin(t * 4 + i * 2) * 0.3)));
    // 自由泳：肩膀整圈转（后 → 水上 → 前 → 水下划 → 后）
    _qb.setFromEuler(_e.set(th, 0, A.s * 0.12));
    _qa.slerp(_qb, sp);
    A.sh.quaternion.copy(_qw.slerp(_qa, k));
    const rec = Math.max(0, Math.sin(th)); // 水上移臂时弯肘
    A.el.rotation.x = lerp(A.el.rotation.x, lerp(-0.6, -(0.15 + rec * 1.0), sp), k);
  });
  c.legs.forEach((L, i) => {
    const kick = Math.sin(ph * 2.2 + i * Math.PI) * 0.4 * sp + Math.sin(t * 3 + i * Math.PI) * 0.45 * (1 - sp);
    L.rotation.x = lerp(L.rotation.x, kick - 0.1 * sp, k);
  });
}

// ---------- 坠落姿势 ----------
// k = 在空中的程度 0..1。双臂向上张开乱挥、腿蹬踏（"慌张下坠"），身体被拉长；
// 落地时 squash（0..1）压扁再弹回，压扁和拉伸体积守恒（横向反向缩放）。
export function fallPose(c, k, squash, t) {
  const sy = 1 + 0.1 * k - 0.3 * squash, sxz = 1 / Math.sqrt(Math.max(sy, 0.5));
  c.root.scale.set(sxz, sy, sxz);
  if (k <= 0.001) return;
  c.arms.forEach((A, i) => {
    _qw.copy(A.sh.quaternion);
    _qa.setFromEuler(_e.set(-0.4 + Math.sin(t * 17 + i * 2) * 0.35, 0, A.s * (2.35 + Math.sin(t * 15 + i) * 0.25)));
    A.sh.quaternion.copy(_qw.slerp(_qa, k));
    A.el.rotation.x = lerp(A.el.rotation.x, -0.5, k);
  });
  c.legs.forEach((L, i) => { L.rotation.x = lerp(L.rotation.x, -0.5 + Math.sin(t * 14 + i * Math.PI) * 0.4, k); });
}
