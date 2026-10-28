import * as THREE from 'three';
import { toon } from '../../util.js';

// Codex 作者的 3D 素材注册表（与 Claude 的 ../assets.js 分开）。
// 每个分组一个模块 <group>.js，导出 ASSETS（同 ../assets.js 的形状）和可选的 TEXTURES。
// 缺文件 / 写错的模块不会拖垮实验场：逐个动态导入，失败的记在 CODEX_ERRORS。
export const GROUPS = ['g1_village', 'g2_plants', 'g3_wild', 'g4_rocks', 'g5_places', 'g6_ruins'];
export const CODEX = {};           // id → { name, n, make, group }
export const CODEX_TEXTURES = {};  // 'codex/xxx' → loadTextures 选项
export const CODEX_ERRORS = [];    // { group, error }

export async function loadCodex() {
  const stamp = Date.now();
  for (const g of GROUPS) {
    try {
      const m = await import(`./${g}.js?v=${stamp}`);
      Object.assign(CODEX_TEXTURES, m.TEXTURES || {});
      for (const [id, a] of Object.entries(m.ASSETS || {})) CODEX[id] = { ...a, group: g };
    } catch (e) {
      const missing = /Failed to fetch|error loading dynamically|Importing a module script failed/i.test(String(e && e.message));
      if (!missing) { console.error('[codex]', g, e); CODEX_ERRORS.push({ group: g, error: String(e && e.message) }); }
    }
  }
}

const built = new Map();
let bad;
// 同一素材变体只建一次；Codex 的 make() 抛错时放一个红色占位方块，不影响其余素材
export function getCodexAsset(id, v) {
  const k = id + ':' + v;
  if (!built.has(k)) {
    let g;
    try { g = CODEX[id].make(v); }
    catch (e) {
      console.error('[codex]', id, v, e); CODEX_ERRORS.push({ group: CODEX[id].group, id, v, error: String(e && e.message) });
      bad ||= toon('#ff3030', { unique: true });
      g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0), bad); g.add(m);
    }
    // 实例化(instance)只认放在原点的 mesh；子物体带变换的模型改用克隆放置
    g.traverse((o) => { if (o !== g && (o.position.lengthSq() || o.rotation.x || o.rotation.y || o.rotation.z || o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1)) g.userData.noInstance = true; });
    built.set(k, g);
  }
  return built.get(k);
}
