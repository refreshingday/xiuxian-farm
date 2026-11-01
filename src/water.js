// 水面：lab.html（Claude 版）的水面着色器——深浅渐变、卡通焦散线、波光、岸边泡沫和向岸推进的浪线、溪流里顺流滚动的白纹。
// 冬天 uMode = weatherU.ice 变成 1，换成冰面。池塘 / 小潭 / 溪流共用一张，井水单独一张。
import * as THREE from 'three';
import { weatherU, clamp } from './util.js';

export const WATER_COLORS = { shallow: '#6ad0d8', deep: '#2a7ab8', foam: '#f0fbff' };
// UniformsUtils.merge 会克隆每个 uniform，共享的（uTime、结冰、天空色）要重新挂回去，不然时间冻住、冬天不结冰
function fogU(o) { return Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog, o]), o); }

// area: { x0, z0, size, N, depthAt(x, z) → 米, flowAt(x, z) → [fx, fz]（长度 0..1） }
export function makeLabWater(area) {
  const { x0, z0, size, N = 96, depthAt, flowAt } = area, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) / N * size, z = z0 + (j + 0.5) / N * size, dep = depthAt(x, z), [fx, fz] = flowAt ? flowAt(x, z) : [0, 0];
    data.set([clamp(dep / 0.9, 0, 1) * 255, 255, (fx * 0.5 + 0.5) * 255, (fz * 0.5 + 0.5) * 255], (j * N + i) * 4);
  }
  const dt = new THREE.DataTexture(data, N, N); dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const C = WATER_COLORS;
  return new THREE.ShaderMaterial({
    transparent: true, fog: true, side: THREE.DoubleSide,
    uniforms: fogU({
      tDepth: { value: dt }, uTime: { value: 0 }, uLight: { value: 1 }, uOrigin: { value: new THREE.Vector2(x0, z0) }, uSize: { value: size }, uMode: weatherU.ice,
      cShallow: { value: new THREE.Color(C.shallow) }, cDeep: { value: new THREE.Color(C.deep) }, cFoam: { value: new THREE.Color(C.foam) },
      uSky: weatherU.sky, uCaus: { value: 1 }, uFlow: { value: new THREE.Vector2(0.3, 0.2) },
    }),
    vertexShader: `varying vec2 vXZ; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDepth; uniform float uTime, uSize, uMode, uCaus, uLight; uniform vec2 uOrigin; uniform vec3 cShallow, cDeep, cFoam, uSky; uniform vec2 uFlow;
      varying vec2 vXZ; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      vec2 cell(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y); vec2 r = o + vec2(h(i + o), h(i + o + 7.3)) - f; float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return vec2(sqrt(d1), sqrt(d2)); }
      void main() {
        vec2 uv = (vXZ - uOrigin) / uSize;
        vec4 dm = texture2D(tDepth, uv);
        float d = dm.r;
        vec2 p = vXZ;
        vec3 c; float a = 0.9;
        if (uMode < 0.5) {
          c = mix(cShallow, cDeep, smoothstep(0.0, 0.75, d));
          c = mix(c, uSky, 0.12);
          vec2 fl = (dm.ba - 0.5) * 2.0; float fs = length(fl);
          vec2 fd = fs > 0.01 ? fl / fs : vec2(0.0, 1.0);
          vec2 q = p + vec2(vn(p * 0.55 + uTime * vec2(0.21, 0.13)), vn(p * 0.55 + 5.3 - uTime * vec2(0.12, 0.19))) * 1.1;
          vec2 drift = uFlow * uTime * 0.35 + fd * fs * uTime * 1.6;
          vec2 v1 = cell(q * 0.75 * uCaus - drift), v2 = cell(q * 1.3 * uCaus + drift.yx * 0.7 + 3.1);
          float caus = max(smoothstep(0.09, 0.0, v1.y - v1.x), smoothstep(0.06, 0.0, v2.y - v2.x) * 0.6);
          c = mix(c, mix(cFoam, vec3(1.0), 0.3), caus * mix(0.42, 0.22, smoothstep(0.2, 0.9, d)));
          c += step(0.975, vn(q * 3.0 + vec2(uTime * 0.9, -uTime * 0.7))) * 0.4;
          if (fs > 0.05) {
            vec2 fp = vec2(-fd.y, fd.x);
            float along = dot(q, fd), across = dot(q, fp);
            float st = vn(vec2(across * 3.0, along * 0.8 - uTime * 3.2)) * 0.65 + vn(vec2(across * 6.5, along * 2.0 - uTime * 4.5)) * 0.35;
            c = mix(c, cFoam, smoothstep(0.58, 0.75, st) * 0.75 * fs);
            c *= 1.0 + 0.1 * fs * sin(along * 5.0 - uTime * 8.0);
          }
          float nb = vn(q * 1.8 + uTime * 0.4);
          float edge = d + (nb - 0.5) * 0.06 - 0.03 * sin(uTime * 1.6 + vXZ.x * 0.9 + vXZ.y * 0.7);
          float foam = smoothstep(0.09, 0.055, edge) * step(0.0, d - 0.005);
          float wave = fract(d * 5.0 + uTime * 0.45 + nb * 0.35);
          float rings = smoothstep(0.1, 0.0, abs(wave - 0.5)) * (1.0 - smoothstep(0.08, 0.38, d));
          c = mix(c, cFoam, max(foam, rings * 0.7));
          a = mix(0.7, 0.94, smoothstep(0.0, 0.5, d));
        } else {
          vec2 v = cell(p * 0.6);
          c = mix(cShallow, cDeep, smoothstep(0.1, 0.9, d) * 0.6);
          c = mix(c, vec3(1.0), smoothstep(0.06, 0.0, v.y - v.x) * 0.7);
          c += smoothstep(0.92, 1.0, vn(p * 3.0 + uTime * 0.05)) * 0.4;
          c = mix(c, cFoam, smoothstep(0.08, 0.0, d) * 0.8);
          a = 0.96;
        }
        gl_FragColor = vec4(c * uLight, a);
        #include <fog_fragment>
      }`,
  });
}

// 瀑布：lab 里的水幕——两层向下滚的噪声条纹，顶上和落水处泛白；冬天（uIce）冻成一道道冰棱
export function makeLabFall(uIce) {
  const C = WATER_COLORS;
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLight: { value: 1 }, uIce, cA: { value: new THREE.Color(C.shallow) }, cB: { value: new THREE.Color(C.foam) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uLight, uIce; uniform vec3 cA, cB; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 q = vUv;
        float s = vn(vec2(q.x * 9.0, q.y * 4.0 + uTime * 3.2)) * 0.6 + vn(vec2(q.x * 21.0, q.y * 9.0 + uTime * 5.0)) * 0.4;
        vec3 c = mix(cA * 1.1, cB, smoothstep(0.45, 0.75, s));
        c = mix(c, cB, smoothstep(0.85, 1.0, vUv.y) * 0.7 + smoothstep(0.2, 0.0, vUv.y) * 0.8);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float a = (0.78 + 0.2 * s) * edge;
        c *= 1.15;
        if (uIce > 0.0) {
          vec2 px = floor(vUv * vec2(10.0, 40.0));
          float col = h(vec2(px.x, 11.0)), tip = 0.1 + col * 0.25;
          vec3 ice = pow(mix(vec3(0.6, 0.8, 0.92), vec3(0.88, 0.96, 1.0), step(0.5, col)), vec3(2.2));
          ice = mix(ice, vec3(1.0), step(0.93, h(vec2(px.x, floor(px.y / 6.0)))) * 0.5);
          c = mix(c, ice, uIce);
          a = mix(a, vUv.y < tip ? 0.0 : 0.97, uIce);
        }
        gl_FragColor = vec4(c * uLight, a);
      }`,
  });
}
