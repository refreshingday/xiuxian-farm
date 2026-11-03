// 极简 OBJ 解析（v / vt / vn / f，三角面）。返回按面角展开的 BufferGeometry，并把模型脚底对齐 y=0、水平居中、缩放到指定身高。
import * as THREE from 'three';

export function parseOBJ(text, height = 1.6) {
  const V = [], T = [], N = [];
  const pos = [], uv = [], nor = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    switch (p[0]) {
      case 'v': V.push(+p[1], +p[2], +p[3]); break;
      case 'vt': T.push(+p[1], +p[2]); break;
      case 'vn': N.push(+p[1], +p[2], +p[3]); break;
      case 'f': {
        const c = p.slice(1).map(s => s.split('/').map(n => (n === '' ? -1 : (+n) - 1)));
        for (let i = 1; i < c.length - 1; i++) {
          for (const k of [c[0], c[i], c[i + 1]]) {
            pos.push(V[k[0] * 3], V[k[0] * 3 + 1], V[k[0] * 3 + 2]);
            if (k[1] >= 0) uv.push(T[k[1] * 2], T[k[1] * 2 + 1]);
            if (k[2] >= 0) nor.push(N[k[2] * 3], N[k[2] * 3 + 1], N[k[2] * 3 + 2]);
          }
        }
        break;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (nor.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
  g.computeBoundingBox();
  const b = g.boundingBox, s = height / (b.max.y - b.min.y);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(s, s, s);
  g.computeBoundingBox();
  return g;
}
