// 攻击动画：直接跑主游戏自己的 animCombo（comboAnim.js），在一个替身 chibi 上摆出姿势，
// 再把替身的肩 / 肘 / 腰 / 腿换算成 Mixamo 骨骼的世界对齐旋转。这样姿势和出手时间都和游戏一致。
import * as THREE from 'three';
import { animCombo, daoKeyVal } from './comboAnim.js';
import { KITS } from './comboKit.js';

const g = () => new THREE.Group();
function makeProxy() {
  const arms = [-1, 1].map(s => { const sh = g(); sh.rotation.order = 'YXZ'; return { sh, el: g(), hand: g(), s }; }); // arms[0] = 右手（x<0），arms[1] = 左手
  const hips = g(); hips.position.y = 0.55;
  return { arms, legs: [g(), g()], hips, body: g(), rig: g(), sword: null, phase: 0, flash: 0, mats: [] };
}
const proxy = makeProxy();
const DOWN = new THREE.Vector3(0, -1, 0), v = new THREE.Vector3(), w = new THREE.Vector3();

// 武器 → 招式列表。技能槽的招式和 combat.js 里一样，由 pose + 出手时刻拼成
export function attackList() {
  const out = [];
  for (const kit of KITS) {
    const seen = new Set();
    for (const id of Object.values(kit.tree)) {
      if (seen.has(id)) continue; seen.add(id);
      const m = kit.moves[id];
      out.push({ id: `atk:${kit.id}:${id}`, kit: kit.name, label: m.name, m });
    }
    for (const s of kit.skills) out.push({ id: `atk:${kit.id}:${s.id}`, kit: kit.name, label: s.name, skill: true, m: { id: s.id, name: s.name, pose: s.pose, hits: [{ t: s.ht }], cancel: 0.32, dur: 0.4 } });
  }
  return out;
}

// 在招式 m 的第 t 秒摆姿势。返回 null = 游戏里此刻不在出招（调用方走待机）
export function attackPose(m, t, dt) {
  const c = proxy;
  if (!animCombo(c, dt, m, t)) return null;
  const p = { y: (c.hips.position.y - 0.55) * 0.76, rot: {}, q: {} };
  const by = c.body.rotation.y;
  p.rot.root = [c.rig.rotation.x, c.rig.rotation.y, c.rig.rotation.z];
  p.rot.spine = [0, by * 0.4, 0]; p.rot.chest = [0, by * 0.6, 0];
  for (const A of c.arms) {
    const side = A.s < 0 ? 'N' : 'P', rest = v.set(A.s, 0, 0).clone();
    const dirU = DOWN.clone().applyQuaternion(A.sh.quaternion);
    const dirF = w.copy(DOWN).applyQuaternion(A.el.quaternion).applyQuaternion(A.sh.quaternion).clone();
    const qU = new THREE.Quaternion().setFromUnitVectors(rest, dirU), qF = new THREE.Quaternion().setFromUnitVectors(rest, dirF);
    p.q['a' + side + '1'] = qU;
    p.q['a' + side + '2'] = qU.clone().invert().multiply(qF);
  }
  p.legs = { upN: -c.legs[0].rotation.x, upP: -c.legs[1].rotation.x };
  return p;
}

// ---- 下盘：出招时屈膝沉胯，不再直挺挺地站着 ----
// 参考武术五步拳的弓步 / 马步，以及动作游戏「蓄力 → 落重心 → 收势」的节奏：
// 起手先沉到架势（ready），出手瞬间迈前脚、胯沉到最低、上身前压（hit），出手后回一半到架势。
// drop = 胯下沉（腿长的比例），f / b = 前脚 / 后脚前后位置（腿长比例），w = 两腿外开角，lean = 上身前压，lead = 哪只脚在前（N 右 / P 左）
const ST = {
  swing:  { lead: 'N', R: { drop: 0.10, f: 0.16, b: -0.14, w: 0.10, lean: 0.06 }, H: { drop: 0.17, f: 0.30, b: -0.20, w: 0.12, lean: 0.22 } },
  over:   { lead: 'N', R: { drop: 0.10, f: 0.16, b: -0.14, w: 0.10, lean: 0.00 }, H: { drop: 0.24, f: 0.32, b: -0.22, w: 0.14, lean: 0.35 } },
  U:      { lead: 'N', R: { drop: 0.16, f: 0.18, b: -0.16, w: 0.12, lean: 0.15 }, H: { drop: 0.07, f: 0.24, b: -0.16, w: 0.10, lean: -0.10 } },
  thrust: { lead: 'N', R: { drop: 0.12, f: 0.20, b: -0.16, w: 0.10, lean: 0.08 }, H: { drop: 0.22, f: 0.42, b: -0.26, w: 0.08, lean: 0.30 } },
  spin:   { lead: 'N', R: { drop: 0.14, f: 0.04, b: -0.04, w: 0.32, lean: 0.05 }, H: { drop: 0.18, f: 0.04, b: -0.04, w: 0.36, lean: 0.08 } },
  jab:    { lead: 'P', R: { drop: 0.09, f: 0.16, b: -0.16, w: 0.12, lean: 0.06 }, H: { drop: 0.12, f: 0.22, b: -0.18, w: 0.12, lean: 0.16 } },
  crush:  { lead: 'P', R: { drop: 0.12, f: 0.18, b: -0.16, w: 0.12, lean: 0.06 }, H: { drop: 0.22, f: 0.40, b: -0.26, w: 0.10, lean: 0.28 } },
  hook:   { lead: 'P', R: { drop: 0.18, f: 0.16, b: -0.16, w: 0.14, lean: 0.18 }, H: { drop: 0.04, f: 0.18, b: -0.14, w: 0.10, lean: -0.12 } },
  slam:   { lead: 'P', R: { drop: 0.04, f: 0.06, b: -0.06, w: 0.18, lean: -0.08 }, H: { drop: 0.21, f: 0.08, b: -0.08, w: 0.32, lean: 0.30 } },
  bash:   { lead: 'P', R: { drop: 0.12, f: 0.18, b: -0.16, w: 0.16, lean: 0.06 }, H: { drop: 0.22, f: 0.36, b: -0.24, w: 0.18, lean: 0.12 } },
  brace:  { lead: 'P', R: { drop: 0.08, f: 0.04, b: -0.04, w: 0.24, lean: 0.00 }, H: { drop: 0.24, f: 0.04, b: -0.04, w: 0.38, lean: 0.06 } },
  throw:  { lead: 'P', R: { drop: 0.10, f: 0.16, b: -0.14, w: 0.10, lean: -0.05 }, H: { drop: 0.15, f: 0.30, b: -0.18, w: 0.10, lean: 0.20 } },
  cast:   { lead: 'P', R: { drop: 0.10, f: 0.06, b: -0.06, w: 0.22, lean: 0.00 }, H: { drop: 0.18, f: 0.06, b: -0.06, w: 0.30, lean: 0.12 } },
  raise:  { lead: 'P', R: { drop: 0.10, f: 0.10, b: -0.10, w: 0.18, lean: 0.00 }, H: { drop: 0.05, f: 0.10, b: -0.10, w: 0.16, lean: -0.10 } },
  snap:   { lead: 'P', R: { drop: 0.10, f: 0.14, b: -0.12, w: 0.14, lean: 0.00 }, H: { drop: 0.14, f: 0.20, b: -0.14, w: 0.14, lean: 0.08 } },
};
const FAM = { R: 'swing', L: 'swing', U: 'U', over: 'over', thrust: 'thrust', dash: 'thrust', spin: 'spin', jabL: 'jab', jabR: 'jab', rush: 'jab', crush: 'crush', hook: 'hook', slam: 'slam', bash: 'bash', brace: 'brace', throw: 'throw', cast: 'cast', raise: 'raise', snap: 'snap' };
const sm = k => k * k * (3 - 2 * k), cl = k => Math.min(1, Math.max(0, k));
// 返回 null = 空中招 / 跳劈（腿交给原来的收腿姿势）
export function attackStance(m, t) {
  if (m.air || m.pose === 'leap') return null;
  if (m.keys) { // 刀的关键帧招式：弓步深浅直接跟关键帧的 st 走
    const S = ST[m.stance] || ST.over, k = daoKeyVal(m, t, 'st'), o = { lead: S.lead, lift: 0 };
    for (const key in S.R) o[key] = S.R[key] + (S.H[key] - S.R[key]) * k;
    o.shift = 0.09 * k;
    return o;
  }
  const S = ST[FAM[m.pose]]; if (!S) return null;
  const h = m.hits[0]?.t ?? m.lunge?.[1] ?? 0.2;
  // 起手 0.07 秒沉进架势；到出手点压到最低，略过冲一点再回一半；收招段（cancel → dur）再回到架势
  const into = sm(cl(t / 0.07));
  let k;
  if (t < h) k = sm(cl(t / h)) ** 1.6;
  else k = 1 + 0.12 * sm(cl((t - h) / 0.04)) * (1 - sm(cl((t - h - 0.04) / 0.1))) - 0.5 * sm(cl((t - h - 0.06) / 0.2));
  if (t > m.cancel) k *= 1 - 0.6 * sm(cl((t - m.cancel) / Math.max(0.05, m.dur - m.cancel)));
  // 蓄力：出手前重心先压到后脚、上身微微后仰（0.6h 时最强，出手时归零）
  let pre = t < h ? sm(cl(t / (0.6 * h))) * (1 - sm(cl((t - 0.6 * h) / (0.4 * h)))) : 0;
  if (m.pose === 'rush') { k = 0.5 + 0.5 * Math.max(...m.hits.map(x => cl(1 - Math.abs(t - x.t) / 0.07))); pre = 0; }
  const o = { lead: S.lead };
  for (const key in S.R) o[key] = (S.R[key] + (S.H[key] - S.R[key]) * k) * into;
  // 上步：前脚要往前迈得多时，出手前把前脚抬起来迈过去（不是在地上滑）
  const step = S.H.f - S.R.f, u = cl((t - 0.1 * h) / (0.9 * h));
  o.lift = step > 0.08 && t < h ? Math.sin(Math.PI * u) * Math.min(0.1, step * 0.45) * into : 0;
  // 重心转移：出手时胯推到前脚上方，蓄力时退到后脚
  o.shift = (S.H.f > 0.2 ? 0.09 * Math.min(1, k) : 0.02 * Math.min(1, k)) * into - 0.05 * pre * into;
  o.lean -= 0.12 * pre * into;
  return o;
}
