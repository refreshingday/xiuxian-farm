import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../util.js';

// Blender 做的阔叶树（assets/models/tree_broad.glb）：660 个小网格按「树皮 / 树叶」合并成 2 个，
// 颜色烘进顶点色，用实验场同一套 toon 材质渲染，光照/阴影/泛光和其它素材一致。
export const BLENDER_TREE = { stats: null, error: null };
let proto = null;

export async function loadBlenderTree() {
  try {
    const gltf = await new GLTFLoader().loadAsync('assets/models/tree_broad.glb');
    gltf.scene.updateMatrixWorld(true);
    const bark = [], leaf = [];
    let src = 0;
    gltf.scene.traverse((m) => {
      if (!m.isMesh) return;
      src++;
      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(m.matrixWorld);
      const c = m.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      (/^(leafblob)/.test(m.name) ? leaf : bark).push(g);
    });
    const group = new THREE.Group();
    for (const list of [bark, leaf]) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), toon('#ffffff', { vc: true }));
      mesh.material.flatShading = true; mesh.material.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.leafMesh = group.children[group.children.length - 1];
    proto = group;
    const tris = group.children.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
    BLENDER_TREE.stats = { src, tris, meshes: group.children.length };
  } catch (e) { BLENDER_TREE.error = e.message; console.error('blender tree', e); }
}

export const hasBlenderTree = () => !!proto;
export function getBlenderTree() {
  const g = new THREE.Group();
  if (!proto) return g;
  for (const m of proto.children) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = c.receiveShadow = true; g.add(c); }
  return g;
}
