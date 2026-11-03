// 主角换成 Q 版武侠模型（角色查看器里那只：Mixamo 骨架、握拳、尖发梢、出招沉胯）。
// 做法：游戏里所有代码照旧摆旧的方块 chibi（P.c，当成看不见的「替身骨架」），
// 每帧最后把替身的姿势换算到 Mixamo 骨骼上；出招时腿改走 attackStance + 两节腿 IK。
// 替身的手臂长度改成和新模型一样，剑 / 手里的符 / 拳光都挂在替身手上，所以会落在新模型的手里。
//
// 不满意想退回方块小人：网址加 ?hero=old，或者把下面 ENABLED 改成 false（main.js 只多了两行调用）。
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { makeFists } from './hero_fist.js';
import { sharpenHair } from './hero_hair.js';
import { attackStance } from './hero_attack.js';
import { toon } from './util.js';

const ENABLED = true;
const HEIGHT = 1.75; // 旧 chibi 头顶约 1.84
const BASE = 'assets/models/chibi_wuxia/';
const MXMAP = { root: 'Hips', spine: 'Spine', chest: 'Spine2', head: 'Head', aP1: 'LeftArm', aP2: 'LeftForeArm', aN1: 'RightArm', aN2: 'RightForeArm', lP1: 'LeftUpLeg', lP2: 'LeftLeg', lP3: 'LeftFoot', lN1: 'RightUpLeg', lN2: 'RightLeg', lN3: 'RightFoot' };

const on = () => ENABLED && !/[?&]hero=old\b/.test(location.search);
const sm = k => k * k * (3 - 2 * k), cl = (x, a, b) => Math.min(b, Math.max(a, x));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), DOWN = new THREE.Vector3(0, -1, 0), _v = new THREE.Vector3(), _dU = new THREE.Vector3(), _dF = new THREE.Vector3();

// 在 createChibi 之后立刻调用（同步记下替身自己的网格，后面挂上去的拳光 / 符纸 / 飞剑不会被藏）；模型异步加载，好了才换
export function attachHeroModel(c) {
  const H = { ready: false, sync() {} };
  if (!on()) return H;
  const swordMeshes = new Set(); c.sword?.traverse(o => swordMeshes.add(o));
  const proxyMeshes = []; c.root.traverse(o => { if (o.isMesh && !swordMeshes.has(o)) proxyMeshes.push(o); });
  load(c, proxyMeshes).then(s => { if (s) { H.sync = s; H.ready = true; } }).catch(e => console.warn('主角模型加载失败，继续用方块小人', e));
  return H;
}

async function load(c, proxyMeshes) {
  const [tex, model] = await Promise.all([new THREE.TextureLoader().loadAsync(BASE + 'hero_basecolor_2048.jpg'), new FBXLoader().loadAsync(BASE + 'anim/idle.fbx')]);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = toon('#ffffff', { map: tex, unique: true });
  model.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; } });
  model.traverse(o => { if (o.isSkinnedMesh) { makeFists(o); sharpenHair(o, tex.image); } });
  model.scale.setScalar(HEIGHT / 0.9995); // FBX 里身高约 1.0
  model.updateMatrixWorld(true);
  const find = k => model.getObjectByName('mixamorig' + k) || model.getObjectByName('mixamorig:' + k);

  // 驱动表：q（相对「模型空间对齐」的静止姿态）→ 骨骼局部旋转
  const drive = [];
  for (const [mine, k] of Object.entries(MXMAP)) {
    const b = find(k); if (!b) continue;
    const wp = new THREE.Quaternion(); b.parent.getWorldQuaternion(wp);
    drive.push({ mine, b, rest: b.quaternion.clone(), wp, wpInv: wp.clone().invert() });
  }
  const hips = find('Hips'), P = o => o.getWorldPosition(new THREE.Vector3()), w0 = P(hips);
  const hipR = { pos: hips.position.clone(), perY: hips.parent.worldToLocal(w0.clone().setY(w0.y + 1)).sub(hips.position), perZ: hips.parent.worldToLocal(w0.clone().setZ(w0.z + 1)).sub(hips.position) };
  const la = P(find('LeftUpLeg')), lk = P(find('LeftLeg')), lf = P(find('LeftFoot'));
  const leg = { L1: la.distanceTo(lk), L2: lk.distanceTo(lf), H: la.y - lf.y };
  const ratio = HEIGHT / 1.84; // 替身单位 → 模型单位

  // 替身手臂改成新模型的长度 / 肩位，剑和手上特效才会落在新模型的手里
  for (const A of c.arms) {
    const side = A.s < 0 ? 'Right' : 'Left', a = P(find(side + 'Arm')), e = P(find(side + 'ForeArm')), h = P(find(side + 'Hand'));
    A.sh.position.set(a.x, a.y - 0.55, a.z); // 替身的 body 原点在胯（0.55）
    A.el.position.y = -a.distanceTo(e);
    A.hand.position.y = -(e.distanceTo(h) + 0.05);
  }
  for (const m of proxyMeshes) m.visible = false;
  c.root.add(model);
  c.mats.push(mat); // 受击闪白

  const q = {}, rot = (n, x, y, z) => (q[n] ||= new THREE.Quaternion()).setFromEuler(_e.set(x, y, z, 'XYZ'));
  const solve = (Dy, fz) => {
    const D = Math.min(leg.L1 + leg.L2 - 1e-4, Math.hypot(Dy, fz));
    return [Math.atan2(fz, Dy) + Math.acos(Math.min(1, (leg.L1 ** 2 + D * D - leg.L2 ** 2) / (2 * leg.L1 * D))),
      Math.PI - Math.acos(Math.min(1, (leg.L1 ** 2 + leg.L2 ** 2 - D * D) / (2 * leg.L1 * leg.L2)))];
  };
  const [t0, k0] = solve(leg.H, 0);
  const prevUp = [0, 0], knee = [0, 0];
  const last = {}, lastP = { y: 0, z: 0 }; let wasSt = false, trans = 0; // 进出出招架势时 0.15 秒过渡，不要一帧跳过去

  return function sync(c, dt, m, t) {
    // ---- 上身：直接照替身 ----
    const pitch = c.rig.rotation.x + c.hips.rotation.x, by = c.body.rotation.y, bx = c.body.rotation.x;
    let y = (c.hips.position.y - 0.55) * ratio, z = 0;
    for (const A of c.arms) {
      const s = A.s < 0 ? 'N' : 'P', rest = _v.set(A.s, 0, 0);
      _dU.copy(DOWN).applyQuaternion(A.sh.quaternion); _dF.copy(DOWN).applyQuaternion(A.el.quaternion).applyQuaternion(A.sh.quaternion);
      const qU = (q['a' + s + '1'] ||= new THREE.Quaternion()).setFromUnitVectors(rest, _dU);
      (q['a' + s + '2'] ||= new THREE.Quaternion()).copy(qU).invert().multiply(_q.setFromUnitVectors(rest, _dF));
    }
    const neck = c.head.parent;
    const st = m && t <= m.dur ? attackStance(m, t) : null;
    if (!st) {
      rot('root', pitch, c.rig.rotation.y, c.rig.rotation.z);
      const rk = c.runK || 0; // 跑步：胸口再前倾一点，头抬回来看前面
      rot('spine', bx * 0.5 + rk * 0.1, by * 0.4, 0); rot('chest', bx * 0.5 + rk * 0.06, by * 0.6, 0);
      rot('head', neck.rotation.x + c.head.rotation.x - rk * 0.28, c.head.rotation.y, 0);
      // 腿：替身只有胯关节。往前摆的那条腿弯膝（看摆动速度），收腿 / 抬腿时也弯，脚掌放平
      c.legs.forEach((L, i) => {
        const up = -L.rotation.x, vel = dt > 0 ? (up - prevUp[i]) / dt : 0; prevUp[i] = up;
        const want = Math.max(cl(vel * 0.12, 0, 1.1 + 0.5 * rk), Math.max(0, up) * (0.7 + 0.5 * rk)) + 0.06 + 0.1 * rk; // 跑步膝盖抬更高
        knee[i] += (want - knee[i]) * (1 - Math.exp(-26 * dt));
        const s = i === 0 ? 'N' : 'P', out = L.rotation.z * (i === 0 ? 1 : -1);
        rot('l' + s + '1', -up, 0, (s === 'P' ? -1 : 1) * out); rot('l' + s + '2', knee[i], 0, 0); rot('l' + s + '3', (up - knee[i]) * 0.8, 0, 0);
      });
    } else {
      // ---- 出招：沉胯、脚钉地（和角色查看器同一套）----
      const L = leg.L1 + leg.L2, drop = st.drop * L, shift = st.shift * L;
      for (const s of ['P', 'N']) {
        const front = s === st.lead, fz = (front ? st.f : st.b) * L - shift, out = st.w * (front ? 0.8 : 1), lift = front ? st.lift * L : 0;
        const [th, kn] = solve((leg.H - drop - lift) / Math.cos(out), fz), up = th - t0 + pitch, kk = kn - k0;
        rot('l' + s + '1', -up, 0, (s === 'P' ? -1 : 1) * out); rot('l' + s + '2', kk, 0, 0); rot('l' + s + '3', up - kk - pitch - (lift > 0 ? lift / L * 2 : 0), 0, 0);
      }
      y = -drop; z = shift;
      const lean = Math.min(st.lean * 0.5, 0.3 - pitch);
      rot('root', pitch, c.rig.rotation.y + by * 0.3, c.rig.rotation.z);
      rot('spine', lean * 0.45, by * 0.3, 0); rot('chest', lean * 0.55, by * 0.4, 0);
      rot('head', -(pitch + lean) * 0.6, -by * 0.15, 0);
      prevUp[0] = -c.legs[0].rotation.x; prevUp[1] = -c.legs[1].rotation.x;
    }
    if (!!st !== wasSt) { wasSt = !!st; trans = 0.15; }
    if (trans > 0) {
      trans -= dt; const k = 1 - Math.exp(-22 * dt);
      for (const n in q) if (last[n]) q[n].copy(last[n].slerp(q[n], k));
      y = lastP.y + (y - lastP.y) * k; z = lastP.z + (z - lastP.z) * k;
    }
    for (const n in q) (last[n] ||= new THREE.Quaternion()).copy(q[n]);
    lastP.y = y; lastP.z = z;
    for (const d of drive) { const r = q[d.mine]; if (r) d.b.quaternion.copy(d.wpInv).multiply(r).multiply(d.wp).multiply(d.rest); }
    hips.position.copy(hipR.pos).addScaledVector(hipR.perY, y).addScaledVector(hipR.perZ, z);
  };
}
