import * as THREE from 'three';
import { toon, addOutline, PNG } from '../../util.js';
import { mats } from '../kit.js';

// Helpers shared by the Codex-authored prop modules (src/lab/codex/*.js).

// 贴图：assets/textures/codex/<name>.png，由实验场按各模块的 TEXTURES 预载；缺失时为 null
export const tex = (name) => PNG['codex/' + name] || null;

// 按 (u, v) 倍数平铺几何体的 UV（会修改并返回 geo）
export function uvScale(geo, u = 1, v = u) {
  const a = geo.attributes.uv;
  if (!a) return geo;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * u, a.getY(i) * v);
  a.needsUpdate = true;
  return geo;
}

// 带贴图的卡通描边网格。geo 需要 uv；有 color 属性时 o.vc 打开顶点色（与贴图相乘）。
// 贴图缺失时退化成纯色 tint，所以 tint 要选一个合理的颜色。
export function texMesh(geo, texName, tint = '#ffffff', o = {}) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const map = texName ? tex(texName) : null;
  const mat = toon(tint, { map, vc: !!o.vc && !!geo.attributes.color });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
  m.userData.kind = 'solid';
  if (o.outline !== false) addOutline(m, mats().line[o.line || 'solid']);
  return m;
}

// 收尾：设置灯光信息
export function finish(group, o = {}) {
  if (o.light) group.userData.light = o.light;
  return group;
}
