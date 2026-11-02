// 角色查看器：导入 Tripo 生成的 Q 版武侠静态模型（T-pose OBJ，无骨骼），
// 在浏览器里按身体分区自动绑骨 + 权重，再用程序化动画驱动。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { makeFists } from './hero_fist.js';
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
    p.rot['l' + s + '3'] = [(up - knee) * (o.flat ?? 0.8) + (o['toe' + s] ?? 0), 0, 0];
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
      p.y = -0.03 * Math.abs(s); // 双脚张开最低，腿并拢最高
      p.rot.spine = [0.05, 0.1 * s, 0.03 * c]; p.rot.chest = [0, -0.1 * s, 0]; p.rot.head = [-0.05, 0.06 * s, 0];
      p.rot.pony = [0.15 + 0.25 * C(w * 2), 0, 0.15 * s];
      // 髋前摆 s>0；膝盖在向前摆腿（c>0）时弯，落地前伸直；脚尖蹬地时稍抬脚跟
      const knee = k => Math.max(0, k) * 0.9 + 0.08;
      legs(p, { upP: 0.5 * s, upN: -0.5 * s, kneeP: knee(C(w - 0.3)), kneeN: knee(-C(w - 0.3)), toeP: Math.max(0, -s) * 0.3, toeN: Math.max(0, s) * 0.3 });
      arms(p, { hangP: 1.15, hangN: 1.15, fwdP: -0.4 * s, fwdN: 0.4 * s, bendP: 0.35 + 0.35 * Math.max(0, -s), bendN: 0.35 + 0.35 * Math.max(0, s) });
      return p;
    },
  },
  run: {
    name: '奔跑', fn(t) {
      const p = rest(), w = t * 10.5, s = S(w), c = C(w);
      p.y = Math.abs(S(w)) * 0.05;
      p.rot.spine = [0.22, 0.2 * s, 0]; p.rot.chest = [0.1, -0.2 * s, 0]; p.rot.head = [-0.2, 0.1 * s, 0];
      p.rot.pony = [0.7 + 0.2 * C(w * 2), 0, 0.2 * s];
      legs(p, { upP: 0.95 * s, upN: -0.95 * s, kneeP: Math.max(0, C(w - 0.5)) * 1.6 + 0.15, kneeN: Math.max(0, -C(w - 0.5)) * 1.6 + 0.15, toeP: Math.max(0, -s) * 0.4, toeN: Math.max(0, s) * 0.4 });
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
  // ===== 游戏里缺的动作（程序化）=====
  hit: {
    name: '受击', fn(t) {
      const p = rest(), u = t % 1.1 / 1.1, k = kf(u, [[0, 0], [0.1, 1], [0.45, 0.45], [1, 0]]);
      p.y = -0.05 * k;
      p.rot.root = [-0.28 * k, 0, 0.12 * k]; p.rot.spine = [-0.25 * k, 0, 0]; p.rot.chest = [-0.15 * k, 0.2 * k, 0]; p.rot.head = [-0.45 * k, 0.3 * k, 0];
      p.rot.pony = [0.9 * k, 0, 0.3 * k];
      legs(p, { upP: 0.35 * k, upN: -0.25 * k, kneeP: 0.35 * k, kneeN: 0.2 * k });
      arms(p, { hangP: 1.1 - 0.7 * k, hangN: 1.1 - 0.7 * k, fwdP: -0.4 * k, fwdN: -0.4 * k, bendP: 0.3 + 0.5 * k, bendN: 0.3 + 0.5 * k });
      return p;
    },
  },
  death: {
    name: '死亡', fn(t) {
      const p = rest(), u = (t * 0.3) % 1, k = kf(u, [[0, 0], [0.12, 0.2], [0.4, 1], [1, 1]]), st = kf(u, [[0, 0], [0.12, 1], [0.4, 0], [1, 0]]);
      p.y = -0.28 * k;
      p.rot.root = [-1.55 * k - 0.15 * st, 0, 0.12 * k]; p.rot.spine = [-0.2 * st, 0, 0]; p.rot.head = [0.15 * k - 0.4 * st, 0.4 * k, 0.3 * k];
      p.rot.pony = [0.5 * st, 0, 0];
      legs(p, { upP: 0.2 * st, upN: -0.1 * st, kneeP: 0.1 + 0.3 * st, kneeN: 0.1, outP: 0.22 * k, outN: 0.15 * k });
      arms(p, { hangP: 1.1 - 0.75 * k, hangN: 1.1 - 0.6 * k, fwdP: 0.3 * st, fwdN: 0.3 * st, bendP: 0.2, bendN: 0.3 });
      return p;
    },
  },
  sleep: {
    name: '睡觉', fn(t) {
      const p = rest(), b = S(t * 1.2);
      p.y = -0.28 + 0.004 * b;
      p.rot.root = [-1.55, 0, 0]; p.rot.chest = [0.03 * b, 0, 0]; p.rot.head = [0.1, 0.35, 0.15];
      legs(p, { outP: 0.1, outN: 0.1, kneeP: 0.05, kneeN: 0.05 });
      arms(p, { hangP: 0.95, hangN: 0.95, yawP: 0.75, yawN: 0.75, bendP: 1.9, bendN: 1.9 });
      return p;
    },
  },
  meditate: {
    name: '入定', fn(t) {
      const p = ANIMS.sit.fn(t), b = S(t * 1.3);
      p.y = -0.27 + 0.005 * b;
      p.rot.chest = [0.015 * b, 0, 0]; p.rot.head = [0.08, 0.05 * S(t * 0.4), 0];
      // 双手合十于胸前
      arms(p, { hangP: 0.15, hangN: 0.15, yawP: 1.15, yawN: 1.15, bendP: 2.3, bendN: 2.3, fwdP: 0.1 * b, fwdN: 0.1 * b });
      return p;
    },
  },
  dodge: {
    name: '闪避', fn(t) {
      const p = rest(), u = (t * 1.1) % 1, k = kf(u, [[0, 0], [0.15, 1], [0.55, 1], [0.8, 0], [1, 0]]);
      p.y = -0.2 * k;
      p.rot.root = [0.3 * k, 0.5 * k, 0]; p.rot.spine = [0.5 * k, 0, 0]; p.rot.head = [-0.4 * k, 0, 0];
      p.rot.pony = [0.8 * k, 0, 0];
      legs(p, { upP: 0.9 * k, upN: 0.5 * k, kneeP: 1.4 * k, kneeN: 1.0 * k, outP: 0.2 * k, outN: 0.2 * k });
      arms(p, { hangP: 0.7, hangN: 0.7, yawP: 0.9 * k, yawN: 0.9 * k, bendP: 2.0 * k, bendN: 2.0 * k, fwdP: 0.3 * k, fwdN: 0.3 * k });
      return p;
    },
  },
  fall: {
    name: '下坠', fn(t) {
      const p = rest();
      p.rot.spine = [-0.1, 0, 0]; p.rot.head = [-0.2, 0, 0]; p.rot.pony = [-1.1, 0, 0.2 * S(t * 12)];
      legs(p, { upP: 0.25 + 0.35 * S(t * 14), upN: 0.25 - 0.35 * S(t * 14), kneeP: 0.5, kneeN: 0.5, outP: 0.1, outN: 0.1 });
      arms(p, { hangP: -1.15 + 0.25 * S(t * 15), hangN: -1.15 + 0.25 * S(t * 15 + 1.5), bendP: 0.5, bendN: 0.5 });
      return p;
    },
  },
  slash: {
    name: '挥砍', fn(t) {
      const p = rest(), u = (t * 1.1) % 1, w = kf(u, [[0, 0], [0.35, 1], [0.45, 1], [0.6, 0], [1, 0]]);
      p.y = -0.08;
      p.rot.root = [0, 0.3, 0]; p.rot.spine = [0.12 * (1 - w) + 0.05, -0.45 * w + 0.35 * (1 - w), 0]; p.rot.chest = [0, -0.2 * w + 0.2 * (1 - w), 0]; p.rot.head = [-0.08, -0.2 * (1 - w), 0];
      p.rot.pony = [0.6 * (1 - w) - 0.2, 0, 0.3 * (1 - w)];
      legs(p, { upP: 0.55, upN: -0.35, kneeP: 0.4, kneeN: 0.3, outP: 0.2, outN: 0.2 });
      arms(p, { hangP: 1.5, fwdP: lerp(0.55, 3.0, w), bendP: lerp(0.15, 0.7, w), hangN: 0.6, yawN: 0.6, bendN: 1.8 });
      return p;
    },
  },
  drink: {
    name: '喝水', fn(t) {
      const p = ANIMS.idle.fn(t), u = (t * 0.5) % 1, k = kf(u, [[0, 0], [0.2, 1], [0.7, 1], [0.85, 0], [1, 0]]);
      p.rot.head = [-0.3 * k, 0, 0]; p.rot.spine = [-0.04 * k, 0, 0];
      arms(p, { hangP: 1.3, hangN: 1.15, fwdP: 1.0 * k, bendP: lerp(0.3, 2.6, k), bendN: 0.3 });
      return p;
    },
  },
  pickup: {
    name: '捡东西', fn(t) {
      const p = rest(), u = (t * 0.6) % 1, k = kf(u, [[0, 0], [0.3, 1], [0.55, 1], [0.85, 0], [1, 0]]);
      p.y = -0.1 * k;
      p.rot.spine = [0.8 * k, 0, 0]; p.rot.chest = [0.2 * k, 0, 0]; p.rot.head = [-0.35 * k, 0, 0];
      p.rot.pony = [0.9 * k, 0, 0];
      legs(p, { upP: 0.75 * k, upN: 0.5 * k, kneeP: 0.9 * k, kneeN: 0.7 * k, outP: 0.1 * k, outN: 0.1 * k });
      arms(p, { hangP: 1.4, hangN: 1.4, fwdP: 0.9 * k, fwdN: 0.5 * k, bendP: 0.4, bendN: 0.4 });
      return p;
    },
  },
  bow: {
    name: '行礼', fn(t) {
      const p = rest(), u = (t * 0.45) % 1, k = kf(u, [[0, 0], [0.25, 1], [0.6, 1], [0.85, 0], [1, 0]]);
      p.rot.spine = [0.6 * k, 0, 0]; p.rot.chest = [0.2 * k, 0, 0]; p.rot.head = [0.15 * k, 0, 0];
      p.rot.pony = [0.8 * k, 0, 0];
      legs(p, {});
      // 抱拳：双手在胸前相合
      arms(p, { hangP: 0.2, hangN: 0.2, yawP: 1.1, yawN: 1.1, bendP: 2.3, bendN: 2.3, fwdP: 0.1, fwdN: 0.1 });
      return p;
    },
  },
  hammer: {
    name: '锤打', fn(t) {
      const p = rest(), u = (t * 1.0) % 1, w = kf(u, [[0, 0], [0.45, 1], [0.55, 1], [0.7, 0], [1, 0]]);
      p.y = -0.04 - 0.06 * (1 - w);
      p.rot.spine = [0.1 + 0.35 * (1 - w) - 0.1 * w, 0, 0]; p.rot.head = [-0.2 * (1 - w), 0, 0];
      p.rot.pony = [0.4 * (1 - w) - 0.2, 0, 0];
      legs(p, { upP: 0.3, upN: -0.2, kneeP: 0.35 * (1 - w) + 0.1, kneeN: 0.3 * (1 - w) + 0.1, outP: 0.15, outN: 0.15 });
      arms(p, { hangP: 1.5, hangN: 1.5, fwdP: lerp(0.7, 2.9, w), fwdN: lerp(0.7, 2.9, w), yawP: 0.25, yawN: 0.25, bendP: lerp(0.3, 0.8, w), bendN: lerp(0.3, 0.8, w) });
      return p;
    },
  },
  fly: {
    name: '御剑', fn(t) {
      const p = rest(), b = S(t * 2.4);
      p.y = -0.06 + 0.012 * b;
      p.rot.root = [0, 0.7, 0]; p.rot.spine = [0.1, -0.5, 0]; p.rot.head = [-0.08, -0.3, 0.03 * b];
      p.rot.pony = [0.9 + 0.1 * b, 0, 0.1 * S(t * 3)];
      legs(p, { upP: 0.15, upN: -0.1, kneeP: 0.3, kneeN: 0.3, outP: 0.3, outN: 0.2 });
      arms(p, { hangP: 0.6 + 0.04 * b, hangN: 0.9, fwdP: 0.2, bendP: 0.4, bendN: 0.4, yawP: 0.3 });
      return p;
    },
  },
  cheer: {
    name: '欢呼', fn(t) {
      const p = rest(), w = t * 7, h = Math.abs(S(w)) * 0.1;
      p.y = h;
      p.rot.spine = [-0.1, 0, 0]; p.rot.head = [-0.2, 0.15 * S(w / 2), 0]; p.rot.pony = [0.3 - h * 3, 0, 0];
      legs(p, { kneeP: 0.3 * (1 - h * 8), kneeN: 0.3 * (1 - h * 8), outP: 0.1, outN: 0.1 });
      arms(p, { hangP: -1.35 + 0.15 * S(w), hangN: -1.35 - 0.15 * S(w), bendP: 0.4, bendN: 0.4 });
      return p;
    },
  },
  swim: {
    name: '踩水', fn(t) {
      const p = rest(), w = t * 4;
      p.y = -0.12 + 0.02 * S(w);
      p.rot.spine = [0.15, 0, 0]; p.rot.head = [-0.15, 0, 0]; p.rot.pony = [0.4, 0, 0.1 * S(w)];
      legs(p, { upP: 0.35 + 0.35 * S(w), upN: 0.35 - 0.35 * S(w), kneeP: 0.7 + 0.4 * S(w), kneeN: 0.7 - 0.4 * S(w), outP: 0.15, outN: 0.15 });
      arms(p, { hangP: 0.85 + 0.3 * S(w + 1), hangN: 0.85 + 0.3 * S(w + 3), fwdP: 0.4 + 0.3 * S(w), fwdN: 0.4 - 0.3 * S(w), bendP: 0.9, bendN: 0.9 });
      return p;
    },
  },
};

// ---------- Mixamo 版：同一个模型上传 Mixamo 自动绑骨后下载的 FBX（骨骼 + 动画），贴图用 hero_basecolor.jpg ----------
// 新下载的 Mixamo 动画 FBX 放进 assets/models/chibi_wuxia/anim/，在这里加一行 [显示名, 文件名]。
// 文件不存在就跳过，所以可以先列全，下载一个放一个。
const MX_CLIPS = [['待机', 'idle.fbx'], ['行走', 'walk.fbx'], ['奔跑', 'run.fbx'], ['受击', 'hit.fbx'], ['死亡', 'death.fbx'], ['跳跃', 'jump.fbx'],
  ['睡觉', 'sleep.fbx'], ['打坐', 'sit.fbx'], ['翻滚', 'roll.fbx'], ['下坠', 'fall.fbx'], ['挥砍', 'slash.fbx'], ['出拳', 'punch.fbx'],
  ['喝水', 'drink.fbx'], ['捡东西', 'pickup.fbx'], ['行礼', 'bow.fbx'], ['锤打', 'hammer.fbx']];
const mxRoot = new THREE.Group(); mxRoot.visible = false; scene.add(mxRoot);
const mxClips = {};
let mxMixer = null, mxAction = null, mxModel = null;
try {
  const loader = new FBXLoader(), base = 'assets/models/chibi_wuxia/anim/';
  const first = await loader.loadAsync(base + MX_CLIPS[0][1]);
  first.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }); o.frustumCulled = false; } });
  first.traverse(o => { if (o.isSkinnedMesh) makeFists(o); });
  first.scale.setScalar(1.6 / 0.9995); // FBX 里身高约 1.0，统一成 1.6
  mxModel = first; mxRoot.add(first); mxMixer = new THREE.AnimationMixer(first);
  mxClips[MX_CLIPS[0][1]] = first.animations[0];
  await Promise.all(MX_CLIPS.slice(1).map(async ([, f]) => {
    try { const r = await fetch(base + f, { method: 'HEAD' }); if (!r.ok) return; mxClips[f] = (await loader.loadAsync(base + f)).animations[0]; } catch (e) { console.warn(f, e); }
  }));
} catch (e) { console.warn('Mixamo FBX 加载失败', e); }

// Mixamo 骨架的可视化（穿透网格显示，方便看骨头）
const mxHelper = mxModel ? (() => {
  const bs = []; mxModel.traverse(o => { if (o.isBone) bs.push(o); });
  const lines = bs.filter(b => b.parent?.isBone), g = new THREE.BufferGeometry(), pg = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines.length * 6), 3));
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bs.length * 3), 3));
  const top = { depthTest: false, transparent: true };
  const L = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x40ffd0, ...top }));
  const P = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe060, size: 7, sizeAttenuation: false, ...top }));
  const grp = new THREE.Group(); grp.add(L, P); grp.visible = false; grp.renderOrder = 999; L.renderOrder = P.renderOrder = 999;
  L.frustumCulled = P.frustumCulled = false;
  const v = new THREE.Vector3();
  grp.userData.update = () => {
    const lp = g.attributes.position, pp = pg.attributes.position;
    lines.forEach((b, i) => { b.parent.getWorldPosition(v); lp.setXYZ(i * 2, v.x, v.y, v.z); b.getWorldPosition(v); lp.setXYZ(i * 2 + 1, v.x, v.y, v.z); });
    bs.forEach((b, i) => { b.getWorldPosition(v); pp.setXYZ(i, v.x, v.y, v.z); });
    lp.needsUpdate = pp.needsUpdate = true;
  };
  scene.add(grp); return grp;
})() : null;

// 用 Mixamo 骨架跑上面的程序动画：把我的 13 根骨的旋转（世界对齐坐标系）换算成 Mixamo 骨骼的局部旋转，
// 蒙皮用 Mixamo 自带权重，袖子 / 衣摆比自动绑的好。没有马尾骨，马尾不摆。
const MXMAP = { root: 'Hips', spine: 'Spine', chest: 'Spine2', head: 'Head', aP1: 'LeftArm', aP2: 'LeftForeArm', aN1: 'RightArm', aN2: 'RightForeArm', lP1: 'LeftUpLeg', lP2: 'LeftLeg', lP3: 'LeftFoot', lN3: 'RightFoot', lN1: 'RightUpLeg', lN2: 'RightLeg' };
const mxDrive = [];
let hipsRest = null;
if (mxModel) {
  mxModel.updateMatrixWorld(true);
  const find = k => mxModel.getObjectByName('mixamorig' + k) || mxModel.getObjectByName('mixamorig:' + k);
  for (const [mine, k] of Object.entries(MXMAP)) {
    const b = find(k); if (!b) continue;
    const wp = new THREE.Quaternion(); b.parent.getWorldQuaternion(wp);
    mxDrive.push({ mine, b, rest: b.quaternion.clone(), wp, wpInv: wp.clone().invert() });
  }
  const hips = find('Hips'), w0 = hips.getWorldPosition(new THREE.Vector3());
  hipsRest = { b: hips, pos: hips.position.clone(), perM: hips.parent.worldToLocal(w0.clone().setY(w0.y + 1)).sub(hips.position) };
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function driveMixamo() {
  for (const d of mxDrive) {
    const c = state.rot[d.mine] || [0, 0, 0];
    _q.setFromEuler(_e.set(c[0], c[1], c[2], 'XYZ'));
    d.b.quaternion.copy(d.wpInv).multiply(_q).multiply(d.wp).multiply(d.rest);
  }
  hipsRest.b.position.copy(hipsRest.pos).addScaledVector(hipsRest.perM, state.y);
}

// ---------- 播放 ----------
let cur = 'idle', speed = 1, clock = 0;
const state = { y: 0, rot: {} };
const names = Object.keys(ANIMS);
const loadedMx = () => MX_CLIPS.filter(c => mxClips[c[1]]);
const allNames = () => [...names, ...(mxMixer ? loadedMx().map(c => 'mx:' + c[1]) : [])];
const eul = new THREE.Euler();
function apply(target, k) {
  state.y = lerp(state.y, target.y, k);
  for (const n of new Set([...Object.keys(bones), ...Object.keys(target.rot), ...Object.keys(state.rot)])) {
    const tg = target.rot[n] || [0, 0, 0];
    const cu = state.rot[n] || (state.rot[n] = [0, 0, 0]);
    for (let i = 0; i < 3; i++) cu[i] = lerp(cu[i], tg[i], k);
    bones[n]?.rotation.set(cu[0], cu[1], cu[2], 'XYZ');
  }
  bones.root.position.y = 0.42 + state.y;
  if (mxDrive.length) driveMixamo();
}
let frozen = false; // 只给截图调试用（__hero.seek），点任何按钮都会解冻
function setAnim(n) {
  frozen = false;
  cur = n;
  const isMx = n.startsWith('mx:'), useMx = isMx || mxDrive.length > 0;
  hero.visible = !useMx; mxRoot.visible = useMx; skelHelper.visible = !useMx && opts.skel; if (mxHelper) mxHelper.visible = useMx && opts.skel;
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
if (mxMixer) for (const [label, f] of loadedMx()) {
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
toggle('显示骨骼', 'skel', v => { skelHelper.visible = v && !mxRoot.visible; if (mxHelper) mxHelper.visible = v && mxRoot.visible; });
toggle('线框', 'wire', v => { mesh.material.wireframe = v; });
const sp = document.createElement('button'); sp.textContent = '速度 ×1';
sp.onclick = () => { speed = speed >= 2 ? 0.25 : speed * 2; sp.textContent = '速度 ×' + speed; };
optsEl.append(sp);
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); setAnim(allNames()[(allNames().indexOf(cur) + 1) % allNames().length]); } });
setAnim('idle');
const q = new URLSearchParams(location.search).get('anim'); if (q && (ANIMS[q] || q.startsWith('mx:'))) setAnim(q);

window.__hero = { bones, mesh, setAnim, ANIMS, cam, ctl, seek: (a, t) => { setAnim(a); clock = t; frozen = true; } };
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!frozen) clock += dt * speed;
  if (cur.startsWith('mx:')) { if (!frozen) mxMixer.update(dt * speed); } else apply(ANIMS[cur].fn(clock), 1 - Math.exp(-14 * dt));
  if (opts.spin) { hero.rotation.y += dt * 0.6; mxRoot.rotation.y = hero.rotation.y; }
  mesh.material.wireframe = opts.wire; mxModel?.traverse(o => { if (o.isMesh) o.material.wireframe = opts.wire; });
  mxHelper?.visible && (mxModel.updateMatrixWorld(true), mxHelper.userData.update());
  ctl.update();
  renderer.render(scene, cam);
});
