import * as THREE from 'three';

// 阴影合批（画面不变）：一组静止物体里会投影的小零件（房子的墙板、柱子、家具、摊子的木架……），
// 画阴影时一件一次绘制，村里光房子就要四百来次。这里把「同一个父节点下、阴影朝向相同」的零件的形状合成一个网格，
// 挂在同一个父节点下（父节点移动 / 缩放 / 隐藏，它跟着一起），只在画阴影图那一下出现；原来的零件不再投影，正常画面照旧。
// 安全检查：每帧画阴影前，对要画阴影的组逐个核对零件——零件自己被移动、隐藏、拿走、换了形状 / 材质，或者有代码又把它的投影打开，
// 这一组马上拆回原样（零件恢复投影、合成的网格删掉），以后也不再合。所以会动的东西最多只合一次就退回，不会画错。
const FLIP = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const pmats = new Map();
function proxyMat(shadowSide) {
  let m = pmats.get(shadowSide);
  if (!m) { m = new THREE.MeshLambertMaterial({ colorWrite: false, depthWrite: false }); m.shadowSide = shadowSide; pmats.set(shadowSide, m); }
  return m;
}
function eligible(m) {
  if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.castShadow || !m.visible || m.userData.isLine || m.userData.shProxy || m.userData.noBatch || m.customDepthMaterial) return false;
  const mat = m.material, geo = m.geometry;
  if (!mat || Array.isArray(mat) || !mat.visible || mat.alphaTest > 0 || (mat.displacementMap && mat.displacementScale !== 0) || mat.clipShadows) return false;
  if (!geo.attributes.position || (geo.morphAttributes && geo.morphAttributes.position)) return false;
  return m.layers.test(DEFAULT_LAYERS);
}
const DEFAULT_LAYERS = new THREE.Layers();

export function batchShadows(root) {
  if (root.userData._batches || root.userData._noBatch) return 0;
  if (root.userData.anim || root.isLight || root.isCamera) { root.userData._noBatch = true; return 0; }
  const buckets = new Map();
  const walk = (o) => {
    if (o.userData.anim || o.isSkinnedMesh) return;
    if (eligible(o)) {
      const side = o.material.shadowSide ?? FLIP[o.material.side], k = o.parent.uuid + '|' + side;
      let b = buckets.get(k); if (!b) buckets.set(k, b = { parent: o.parent, side, items: [] });
      b.items.push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  const out = [];
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    let n = 0;
    for (const m of b.items) { const g = m.geometry, cnt = g.index ? g.index.count : g.attributes.position.count; n += Math.min(cnt, g.drawRange.count) - 0; }
    const pos = new Float32Array(n * 3), v = new THREE.Vector3(), recs = [];
    let o = 0;
    for (const m of b.items) {
      m.updateMatrix();
      const g = m.geometry, P = g.attributes.position, I = g.index, total = I ? I.count : P.count;
      const s = Math.min(g.drawRange.start, total), e = Math.min(total, s + g.drawRange.count);
      for (let i = s; i < e; i++) { v.fromBufferAttribute(P, I ? I.getX(i) : i).applyMatrix4(m.matrix); pos[o++] = v.x; pos[o++] = v.y; pos[o++] = v.z; }
      recs.push({ m, geo: g, mat: m.material, e: m.matrix.elements.slice() });
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(o === pos.length ? pos : pos.slice(0, o), 3)); geo.computeBoundingSphere();
    const px = new THREE.Mesh(geo, proxyMat(b.side));
    px.castShadow = true; px.receiveShadow = false; px.visible = false; px.matrixAutoUpdate = false; px.userData.shProxy = true;
    b.parent.add(px);
    for (const r of recs) { r.m.castShadow = false; r.m.userData.shProxied = true; }
    out.push({ parent: b.parent, proxy: px, recs });
  }
  root.userData._batches = out.length ? out : null;
  if (!out.length) root.userData._noBatch = true;
  return out.reduce((a, b) => a + b.recs.length, 0);
}

function same(a, b) { for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false; return true; }
function undo(b) {
  b.proxy.parent?.remove(b.proxy); b.proxy.geometry.dispose();
  for (const r of b.recs) { r.m.castShadow = true; r.m.userData.shProxied = false; }
}
export function unbatch(root) {
  for (const b of root.userData._batches || []) undo(b);
  root.userData._batches = null; root.userData._noBatch = true;
}
// 画阴影前：核对一组（零件有没有被动过），没问题就让合成的网格出现，返回它们（画完再藏起来）
// 只拆出问题的那一份（同一个父节点下的那批零件），同组其它的照旧合着
export function showBatches(root, shown) {
  const B = root.userData._batches; if (!B) return;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    let ok = true;
    for (const r of b.recs) {
      const m = r.m;
      if (m.parent !== b.parent || !m.visible || m.castShadow || m.geometry !== r.geo || m.material !== r.mat || !r.mat.visible || !same(m.matrix.elements, r.e)) { ok = false; break; }
    }
    if (!ok) { undo(b); B.splice(i, 1); root.userData._noBatch = true; continue; }
    b.proxy.visible = true; shown.push(b.proxy);
  }
  if (!B.length) root.userData._batches = null;
}
