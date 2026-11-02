// 角色查看器：导入 Tripo 生成的 Q 版武侠静态模型（T-pose OBJ，无骨骼），
// 在浏览器里按身体分区自动绑骨 + 权重，再用程序化动画驱动。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { parseOBJ } from './hero_obj.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2433);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
cam.position.set(1.6, 1.3, 3.6);
const ctl = new OrbitControls(cam, renderer.domElement);
ctl.target.set(0, 0.8, 0);
ctl.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(2, 4, 3); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b5a3a }));
scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8c25a }));
ring.position.y = 0.005; scene.add(ring);

// ---------- 模型 ----------
const tex = await new THREE.TextureLoader().loadAsync('assets/models/chibi_wuxia/hero_basecolor.jpg');
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 4;
const geo = parseOBJ(await (await fetch('assets/models/chibi_wuxia/hero.obj')).text(), 1.6);

// ---------- 骨骼（世界坐标，T-pose，角色面朝 +z；P = +x 侧，N = -x 侧）----------
const BONES = [
  ['root', null, [0, 0.42, 0]],
  ['spine', 'root', [0, 0.55, 0]],
  ['chest', 'spine', [0, 0.72, 0]],
  ['head', 'chest', [0, 0.93, 0]],
  ['pony', 'head', [0, 1.44, -0.1]],
  ['aP1', 'chest', [0.17, 0.8, 0]], ['aP2', 'aP1', [0.36, 0.8, 0]],
  ['aN1', 'chest', [-0.17, 0.8, 0]], ['aN2', 'aN1', [-0.36, 0.8, 0]],
  ['lP1', 'root', [0.09, 0.42, 0]], ['lP2', 'lP1', [0.09, 0.22, 0]],
  ['lN1', 'root', [-0.09, 0.42, 0]], ['lN2', 'lN1', [-0.09, 0.22, 0]],
];
const bones = {}, boneList = [];
for (const [name, parent, wp] of BONES) {
  const b = new THREE.Bone(); b.name = name;
  const pw = parent ? BONES.find(x => x[0] === parent)[2] : [0, 0, 0];
  b.position.set(wp[0] - pw[0], wp[1] - pw[1], wp[2] - pw[2]);
  bones[name] = b; boneList.push(b);
  if (parent) bones[parent].add(b);
}
const idx = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pos = geo.attributes.position, n = pos.count;
const sIdx = new Uint16Array(n * 4), sWt = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ax = Math.abs(x), side = x >= 0 ? 'P' : 'N';
  const w = {};
  const add = (k, v) => { if (v > 1e-4) w[k] = (w[k] || 0) + v; };
  // 手臂：|x| 大且在肩线附近
  const armW = ss(0.15, 0.25, ax) * ss(0.97, 0.9, y) * ss(0.5, 0.62, y);
  const fore = ss(0.3, 0.4, ax);
  add('a' + side + '1', armW * (1 - fore)); add('a' + side + '2', armW * fore);
  const rest = 1 - armW;
  // 腿
  const legW = ss(0.46, 0.36, y), low = ss(0.27, 0.17, y), sp = ss(-0.05, 0.05, x);
  for (const [s, k] of [['P', sp], ['N', 1 - sp]]) {
    add('l' + s + '1', rest * legW * k * (1 - low)); add('l' + s + '2', rest * legW * k * low);
  }
  // 躯干 / 头 / 马尾
  const t = rest * (1 - legW);
  const h = ss(0.9, 1.0, y), c = ss(0.62, 0.74, y), a = ss(0.46, 0.56, y);
  const pony = ss(1.38, 1.46, y) * ss(0.0, -0.12, z);
  add('root', t * (1 - a)); add('spine', t * a * (1 - c) * (1 - h)); add('chest', t * c * (1 - h));
  add('pony', t * h * pony); add('head', t * h * (1 - pony));
  let tot = 0; for (const k in w) tot += w[k];
  const e = Object.entries(w).sort((p, q) => q[1] - p[1]).slice(0, 4);
  let st = 0; for (const [, v] of e) st += v;
  e.forEach(([k, v], j) => { sIdx[i * 4 + j] = idx[k]; sWt[i * 4 + j] = v / st; });
}
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWt, 4));

const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
mesh.frustumCulled = false;
const hero = new THREE.Group();
hero.add(bones.root, mesh);
scene.add(hero);
hero.updateMatrixWorld(true);
mesh.bind(new THREE.Skeleton(boneList));
const skelHelper = new THREE.SkeletonHelper(hero); skelHelper.visible = false; scene.add(skelHelper);

// ---------- 动画（程序化，每帧算目标姿态再平滑过渡）----------
const S = Math.sin, C = Math.cos, PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
// 分段平滑插值：keys=[[0,v],[0.3,v],...]，t 为 0..1 循环
function kf(t, keys) {
  t = ((t % 1) + 1) % 1;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) { const u = (t - t0) / (t1 - t0); return lerp(v0, v1, u * u * (3 - 2 * u)); }
  }
  return keys[keys.length - 1][1];
}
// 姿态 = { 骨名: [rx, ry, rz], root: 位置偏移 [x,y,z] 存在 pos 里 }
const rest = () => ({ y: 0, rot: {}, hang: 1.1 });
function arms(p, o) {
  // o: {hangP, hangN, fwdP, fwdN, bendP, bendN}  hang=下垂角(正=下垂,负=上举), fwd=向前摆, bend=肘向前弯
  for (const [s, sg] of [['P', 1], ['N', -1]]) {
    const hang = o['hang' + s] ?? 1.1, fwd = o['fwd' + s] ?? 0, bend = o['bend' + s] ?? 0.2, yaw = o['yaw' + s] ?? 0;
    p.rot['a' + s + '1'] = [-fwd, -sg * yaw, -sg * hang];
    p.rot['a' + s + '2'] = [0, -sg * bend, o['wag' + s] ?? 0];
  }
}
function legs(p, o) {
  for (const s of ['P', 'N']) {
    const up = o['up' + s] ?? 0, knee = o['knee' + s] ?? 0, out = o['out' + s] ?? 0;
    p.rot['l' + s + '1'] = [-up, 0, (s === 'P' ? -1 : 1) * out];
    p.rot['l' + s + '2'] = [knee, 0, 0];
  }
}
const ANIMS = {
  idle: {
    name: '待机', fn(t) {
      const p = rest(), b = S(t * 2.2);
      p.y = b * 0.006;
      p.rot.spine = [0.02 * b, 0, 0]; p.rot.chest = [0.02 * b, 0.04 * S(t * 0.9), 0];
      p.rot.head = [-0.02 * b, 0.12 * S(t * 0.7), 0.03 * S(t * 0.5)];
      p.rot.pony = [0.18 * S(t * 2.2 - 0.8), 0, 0.08 * S(t * 1.7)];
      arms(p, { hangP: 1.15 + 0.02 * b, hangN: 1.15 + 0.02 * b, bendP: 0.25, bendN: 0.25, fwdP: 0.03 * S(t * 1.1), fwdN: -0.03 * S(t * 1.1) });
      legs(p, {});
      return p;
    },
  },
  walk: {
    name: '行走', fn(t) {
      const p = rest(), w = t * 6.5, s = S(w), c = C(w);
      p.y = -Math.abs(c) * 0.022;
      p.rot.spine = [0.04, 0.12 * s, 0]; p.rot.chest = [0, -0.1 * s, 0]; p.rot.head = [-0.03, 0.08 * s, 0];
      p.rot.pony = [0.25 + 0.3 * Math.abs(c) * 0, 0, 0.2 * s];
      p.rot.pony = [0.15 + 0.25 * C(w * 2), 0, 0.15 * s];
      legs(p, { upP: 0.55 * s, upN: -0.55 * s, kneeP: Math.max(0, -C(w + 0.9)) * 0.7 + 0.05, kneeN: Math.max(0, C(w + 0.9)) * 0.7 + 0.05 });
      arms(p, { hangP: 1.15, hangN: 1.15, fwdP: -0.5 * s, fwdN: 0.5 * s, bendP: 0.3 + 0.3 * Math.max(0, -s), bendN: 0.3 + 0.3 * Math.max(0, s) });
      return p;
    },
  },
  run: {
    name: '奔跑', fn(t) {
      const p = rest(), w = t * 10.5, s = S(w), c = C(w);
      p.y = Math.abs(S(w)) * 0.05;
      p.rot.spine = [0.22, 0.2 * s, 0]; p.rot.chest = [0.1, -0.2 * s, 0]; p.rot.head = [-0.2, 0.1 * s, 0];
      p.rot.pony = [0.7 + 0.2 * C(w * 2), 0, 0.2 * s];
      legs(p, { upP: 0.95 * s, upN: -0.95 * s, kneeP: Math.max(0, -C(w + 0.7)) * 1.5 + 0.1, kneeN: Math.max(0, C(w + 0.7)) * 1.5 + 0.1 });
      arms(p, { hangP: 1.2, hangN: 1.2, fwdP: -0.9 * s, fwdN: 0.9 * s, bendP: 1.2, bendN: 1.2 });
      return p;
    },
  },
  wave: {
    name: '挥手', fn(t) {
      const p = ANIMS.idle.fn(t);
      arms(p, { hangP: -1.35, hangN: 1.15, bendP: 0.3, bendN: 0.25, wagP: 0.55 * S(t * 9), fwdP: 0, yawP: 0.2 });
      p.rot.head = [-0.02, 0.1, -0.1];
      return p;
    },
  },
  punch: {
    name: '出拳', fn(t) {
      const p = rest(), u = t * 0.9;
      const hit = kf(u, [[0, 0], [0.25, -0.4], [0.38, 1], [0.55, 1], [0.8, 0], [1, 0]]); // 出拳进度
      const turn = kf(u, [[0, 0], [0.25, -0.3], [0.38, 0.35], [0.55, 0.35], [0.8, 0], [1, 0]]);
      p.y = -0.03;
      p.rot.spine = [0.06, turn, 0]; p.rot.chest = [0.04, turn * 0.8, 0]; p.rot.head = [-0.05, -turn * 0.5, 0];
      p.rot.pony = [0.2 - 0.3 * hit, 0, 0.2 * turn];
      legs(p, { upP: 0.35, upN: -0.45, kneeP: 0.45, kneeN: 0.35, outP: 0.25, outN: 0.25 });
      arms(p, { hangP: lerp(0.9, -0.05, hit), yawP: lerp(0.9, 1.55, hit), bendP: lerp(2.2, 0.05, hit), hangN: 0.5, yawN: 0.6, bendN: 1.9, fwdN: 0 });
      return p;
    },
  },
  cast: {
    name: '掐诀', fn(t) {
      const p = rest(), b = S(t * 2);
      p.y = 0.01 * b;
      p.rot.spine = [0.03, 0, 0]; p.rot.head = [-0.08, 0, 0];
      p.rot.pony = [0.2 * S(t * 2 - 1), 0, 0.1];
      legs(p, { outP: 0.12, outN: 0.12 });
      // 双臂抬到胸前，手指并拢向上
      arms(p, { hangP: 0.1 + 0.05 * b, hangN: 0.1 + 0.05 * b, yawP: 1.1, yawN: 1.1, bendP: 2.4, bendN: 2.4, wagP: 0.5, wagN: -0.5 });
      return p;
    },
  },
  jump: {
    name: '跳跃', fn(t) {
      const p = rest(), u = (t * 0.7) % 1;
      const h = Math.max(0, S(u * PI)) * 0.55, tuck = kf(u, [[0, 0.5], [0.15, 0.7], [0.3, 0], [0.7, 0], [0.9, 0.6], [1, 0.5]]);
      p.y = h - 0.1 * (1 - Math.min(1, h * 6));
      p.rot.spine = [kf(u, [[0, 0.3], [0.2, -0.1], [0.8, 0.05], [1, 0.3]]), 0, 0];
      p.rot.pony = [0.4 - h * 1.4, 0, 0];
      legs(p, { upP: tuck * 0.9, upN: tuck * 0.9, kneeP: tuck * 1.6, kneeN: tuck * 1.6 });
      const air = Math.min(1, h * 5);
      arms(p, { hangP: lerp(1.0, -1.1, air), hangN: lerp(1.0, -1.1, air), bendP: 0.2, bendN: 0.2, fwdP: lerp(0.5, 0, air), fwdN: lerp(0.5, 0, air) });
      return p;
    },
  },
  sit: {
    name: '打坐', fn(t) {
      const p = rest(), b = S(t * 1.6);
      p.y = -0.2 + 0.006 * b;
      p.rot.spine = [0.02 * b, 0, 0]; p.rot.head = [0.05, 0, 0];
      p.rot.pony = [0.1 * S(t * 1.6 - 1), 0, 0];
      p.rot.lP1 = [-1.45, 0, -0.85]; p.rot.lN1 = [-1.45, 0, 0.85];
      p.rot.lP2 = [2.3, 0, 0]; p.rot.lN2 = [2.3, 0, 0];
      arms(p, { hangP: 0.95, hangN: 0.95, fwdP: -0.3, fwdN: -0.3, bendP: 1.0, bendN: 1.0 });
      return p;
    },
  },
};

// ---------- Mixamo 版：同一个模型上传 Mixamo 自动绑骨后下载的 FBX（骨骼 + 动画），贴图用 hero_basecolor.jpg ----------
// 新下载的 Mixamo 动画 FBX 放进 assets/models/chibi_wuxia/anim/，在这里加一行 [显示名, 文件名]。
const MX_CLIPS = [['待机', 'idle.fbx']];
const mxRoot = new THREE.Group(); mxRoot.visible = false; scene.add(mxRoot);
const mxClips = {};
let mxMixer = null, mxAction = null;
try {
  const loader = new FBXLoader(), base = 'assets/models/chibi_wuxia/anim/';
  const first = await loader.loadAsync(base + MX_CLIPS[0][1]);
  first.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }); o.frustumCulled = false; } });
  first.scale.setScalar(1.6 / 0.9995); // FBX 里身高约 1.0，统一成 1.6
  mxRoot.add(first); mxMixer = new THREE.AnimationMixer(first);
  mxClips[MX_CLIPS[0][1]] = first.animations[0];
  for (const [, f] of MX_CLIPS.slice(1)) mxClips[f] = (await loader.loadAsync(base + f)).animations[0];
} catch (e) { console.warn('Mixamo FBX 加载失败', e); }

// ---------- 播放 ----------
let cur = 'idle', speed = 1, clock = 0;
const state = { y: 0, rot: {} };
const names = Object.keys(ANIMS);
const allNames = () => [...names, ...(mxMixer ? MX_CLIPS.map(c => 'mx:' + c[1]) : [])];
const eul = new THREE.Euler();
function apply(target, k) {
  state.y = lerp(state.y, target.y, k);
  for (const n in bones) {
    const tg = target.rot[n] || [0, 0, 0];
    const cu = state.rot[n] || (state.rot[n] = [0, 0, 0]);
    for (let i = 0; i < 3; i++) cu[i] = lerp(cu[i], tg[i], k);
    bones[n].rotation.set(cu[0], cu[1], cu[2], 'XYZ');
  }
  bones.root.position.y = 0.42 + state.y;
}
function setAnim(n) {
  cur = n;
  const isMx = n.startsWith('mx:');
  hero.visible = !isMx; mxRoot.visible = isMx; skelHelper.visible = !isMx && opts.skel;
  if (isMx && mxMixer) {
    const clip = mxClips[n.slice(3)];
    const next = mxMixer.clipAction(clip);
    if (mxAction !== next) { next.reset().play(); if (mxAction) mxAction.crossFadeTo(next, 0.25, false); mxAction = next; }
  }
  document.querySelectorAll('#anims button').forEach(b => b.classList.toggle('on', b.dataset.n === n));
}
const animsEl = document.getElementById('anims');
for (const n of names) {
  const b = document.createElement('button'); b.textContent = ANIMS[n].name; b.dataset.n = n;
  b.onclick = () => setAnim(n); animsEl.append(b);
}
if (mxMixer) for (const [label, f] of MX_CLIPS) {
  const b = document.createElement('button'); b.textContent = 'Mixamo·' + label; b.dataset.n = 'mx:' + f;
  b.onclick = () => setAnim('mx:' + f); animsEl.append(b);
}
const optsEl = document.getElementById('opts');
const opts = { spin: false, skel: false, wire: false };
function toggle(label, key, fn) {
  const b = document.createElement('button'); b.textContent = label;
  b.onclick = () => { opts[key] = !opts[key]; b.classList.toggle('on', opts[key]); fn?.(opts[key]); };
  optsEl.append(b);
}
toggle('自动旋转', 'spin');
toggle('显示骨骼', 'skel', v => { skelHelper.visible = v && !cur.startsWith('mx:'); });
toggle('线框', 'wire', v => { mesh.material.wireframe = v; });
const sp = document.createElement('button'); sp.textContent = '速度 ×1';
sp.onclick = () => { speed = speed >= 2 ? 0.25 : speed * 2; sp.textContent = '速度 ×' + speed; };
optsEl.append(sp);
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); setAnim(allNames()[(allNames().indexOf(cur) + 1) % allNames().length]); } });
setAnim('idle');
const q = new URLSearchParams(location.search).get('anim'); if (q && (ANIMS[q] || q.startsWith('mx:'))) setAnim(q);

window.__hero = { bones, mesh, setAnim, ANIMS, cam, ctl };
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  clock += dt * speed;
  if (cur.startsWith('mx:')) mxMixer.update(dt * speed); else apply(ANIMS[cur].fn(clock), 1 - Math.exp(-14 * dt));
  if (opts.spin) { hero.rotation.y += dt * 0.6; mxRoot.rotation.y = hero.rotation.y; }
  ctl.update();
  renderer.render(scene, cam);
});
