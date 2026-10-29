import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CHUNK, mulberry32, hashInt, hash01, fbm, vnoise, clamp, smooth, approach, angDiff,
  flat, toon, glow, mesh, at, outlineMat, addOutline, canvasTex, boxUV, wind, PNG, weatherU,
} from './util.js';
import { sectorAt, biomeK, dangerFor, ringAt, RINGS } from './worldmap.js';

// ---------- 世界骨架（手工） ----------
export const VILLAGE_R = 32;
export const MINE = new THREE.Vector2(64, -56);
export const MINE_R = 24;
const MINE_ANG = Math.atan2(-MINE.y, -MINE.x); // 矿洞入口朝向村子
export const MINE_GATE = new THREE.Vector2(MINE.x + Math.cos(MINE_ANG) * MINE_R, MINE.y + Math.sin(MINE_ANG) * MINE_R);
export const ARENA = new THREE.Vector2(MINE.x - Math.cos(MINE_ANG) * (MINE_R - 10), MINE.y - Math.sin(MINE_ANG) * (MINE_R - 10));
export const FARM = { x0: -19, z0: -1, cols: 8, rows: 6, size: 1.5 }; // 灵田：地块和作物在 farm.js
export const POND = { x: -7, z: -19, r: 4.6 };
// 仙山：村北的石峰群；瀑布从中间那座落进小潭，再流进荷花池
const PEAKS = [[-13, -31, 7, 2.6], [-9.5, -33, 9.5, 2.9], [-6, -31.2, 8, 2.4], [-2.4, -32.6, 10.5, 2.7], [1.2, -30.6, 6, 2], [-16.4, -28.6, 4.5, 1.8], [4, -28.4, 3.6, 1.5], [-19, -31, 6.5, 2.2]];
const BASIN = { x: -6, z: -26.6, r: 1.7 };
const STREAM = [BASIN.x, BASIN.z + 1.2, -6.6, -22.6];
let HOUSES = [
  { cx: -15, cz: -8, w: 7, d: 6, roof: '#6e7688', wall: '#c08048', player: true },
  { cx: 17, cz: 0, w: 7, d: 6, roof: '#65708a', wall: '#b87a46' },
  { cx: -14, cz: 16, w: 6, d: 5, roof: '#727a8a', wall: '#c88a52' },
  { cx: 14, cz: 14, w: 7, d: 6, roof: '#687084', wall: '#b47648' },
];
// 池塘轮廓：带噪声的圆
export const pondR = (a) => POND.r * (1 + 0.13 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 5 + 2));
export const pondDist = (x, z) => Math.hypot(x - POND.x, z - POND.z) - pondR(Math.atan2(z - POND.z, x - POND.x));

const key = (x, z) => `${x},${z}`;

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
export const roadDist = (x, z) => segDist(x, z, 0, 0, MINE_GATE.x, MINE_GATE.y);
// 赤枫林只长在竹海扇区（其他扇区走远了就换成自己的地貌）
export const mapleAmount = (x, z) => smooth(0.55, 0.66, fbm(x * 0.008, z * 0.008, 11, 2)) * smooth(60, 110, Math.hypot(x, z)) * (sectorAt(x, z).id === 'bamboo' ? 1 : 1 - biomeK(x, z));
export const dangerAt = dangerFor;

// 野生灵草：多数是灵草，离村越远越可能长出凝露草、人参（按位置固定，不吃区块的随机序列）
const HERB_GLOW = { lingcao: '#7dffe0', ninglu: '#8ad8ff', renshen: '#ffd27a', chiyang: '#ff8a5a', yuehua: '#fff2a0' };
export function wildHerb(x, z) {
  const r = hash01(Math.floor(x * 10), Math.floor(z * 10), 7), far = clamp((Math.hypot(x, z) - 60) / 200, 0, 1);
  if (r < 0.04 + far * 0.08) return 'renshen';
  if (r < 0.2 + far * 0.1) return mapleAmount(x, z) > 0.5 ? 'chiyang' : 'ninglu';
  if (r < 0.26 + far * 0.1) return 'yuehua';
  return 'lingcao';
}

export function regionName(x, z) {
  if (Math.hypot(x - MINE.x, z - MINE.y) < MINE_R + 1) return '玄晶矿洞';
  if (Math.hypot(x, z) < VILLAGE_R) return '青竹村';
  const stars = '★'.repeat(Math.min(5, 1 + Math.floor(dangerAt(x, z) / 5)));
  const sec = sectorAt(x, z), near = Math.hypot(x, z) < 110;
  const name = near ? (mapleAmount(x, z) > 0.5 ? '赤枫林' : '翠竹野') : sec.id === 'bamboo' && mapleAmount(x, z) > 0.5 ? '赤枫林' : sec.name;
  return `${name} · ${RINGS[Math.max(0, ringAt(x, z))].realm}圈 ${stars}`;
}

// ---------- 地面配色（sRGB 0..255，直接画进 canvas） ----------
const GP = {
  grass: [118, 186, 64], grass2: [88, 158, 50], meadow: [168, 204, 78], maple: [196, 150, 78], village: [128, 194, 70],
  dirt: [218, 170, 104], dirt2: [192, 142, 84], till: [118, 80, 52], sand: [226, 202, 142],
  plaza: [204, 198, 186], stone: [64, 60, 74], stone2: [44, 42, 52], crystal: [74, 60, 104],
};
const mix3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
const makePaths = () => HOUSES.map((h) => [h.cx, h.cz + h.d / 2 + 0.6, 0, 0]).concat([[POND.x + 3, POND.z + 3.5, 0, 0], [FARM.x0 + 4.5, FARM.z0 - 0.6, -15, -4.4]]);
let PATHS = makePaths();
// 村子布局（data/villagers.json）：房屋、茶摊、委托板。要在 new World 之前调用
let STALL = null;
// 野外空地：坊市、宗门所在的地方不长树，中间铺石板（main 在 new World 之前登记）
let CLEARINGS = [];
export function configureClearings(list) { CLEARINGS = list; }
export const BOARD = { x: -4.5, z: -7 };
export function configureVillage(data) {
  HOUSES = Object.entries(data.houses).map(([id, h]) => {
    const old = HOUSES.find((o) => o.cx === h.x && o.cz === h.z) || { w: 7, d: 6, roof: '#6e7688', wall: '#c08048' };
    return { ...old, w: h.w ?? old.w, d: h.d ?? old.d, roof: h.roof ?? old.roof, wall: h.wall ?? old.wall, id, name: h.name, cx: h.x, cz: h.z, player: id === 'home' };
  });
  STALL = data.stall;
  PATHS = makePaths();
}

// 返回基础色到 out，并给出路面程度 path(0..1)、地面类型 kind
const GS = { path: 0, kind: 0 };
function groundSample(x, z, out) {
  const dv = Math.hypot(x, z), dm = Math.hypot(x - MINE.x, z - MINE.y);
  const n = fbm(x * 0.08, z * 0.08, 3, 2);
  mix3(out, GP.grass, GP.grass2, smooth(0.42, 0.7, n));
  mix3(out, out, GP.meadow, smooth(0.6, 0.8, fbm(x * 0.03, z * 0.03, 5, 2)) * 0.55);
  mix3(out, out, GP.maple, mapleAmount(x, z) * 0.6);
  mix3(out, out, GP.village, (1 - smooth(VILLAGE_R - 6, VILLAGE_R + 4, dv + (n - 0.5) * 8)) * 0.5);
  // 扇区地貌：雪峰发白、沼泽深绿、火山赤褐、沙漠沙黄、古战场灰褐
  const sec = sectorAt(x, z), bk = biomeK(x, z);
  if (sec.tint && bk > 0) mix3(out, out, sec.tint, bk * (0.75 + n * 0.25));
  // 路：大路 + 各家门口通向广场的小路
  let rd = roadDist(x, z) - 0.5;
  for (const [ax, az, bx, bz] of PATHS) rd = Math.min(rd, segDist(x, z, ax, az, bx, bz) + 0.25);
  GS.path = 1 - smooth(0.9, 1.6, rd + (n - 0.5) * 0.9);
  GS.kind = 0;
  if (dv < 7.5 + (n - 0.5) * 1.5) { GS.kind = 1; GS.path = 1; }
  const pd = pondDist(x, z);
  if (pd < 1.1 + (n - 0.5) * 0.6) { GS.kind = 2; GS.path = Math.max(GS.path, 1); }
  const bd = Math.min(Math.hypot(x - BASIN.x, z - BASIN.z) - BASIN.r, segDist(x, z, ...STREAM) - 0.55);
  if (bd < 0.8 + (n - 0.5) * 0.5) { GS.kind = 2; GS.path = 1; }
  for (const [px, pz, , pr] of PEAKS) if (Math.hypot(x - px, z - pz) < pr + 0.9 + (n - 0.5) * 0.8) { GS.kind = 4; GS.path = 1; mix3(out, out, [96, 112, 84], 0.7); }
  for (const c of CLEARINGS) if (c.plaza && Math.abs(x - c.x) < c.plaza + (n - 0.5) && Math.abs(z - c.z) < c.plaza * 0.75 + (n - 0.5)) { GS.kind = 1; GS.path = 1; }
  const F = FARM;
  if (x > F.x0 - 0.5 && x < F.x0 + F.cols * F.size + 0.5 && z > F.z0 - 0.5 && z < F.z0 + F.rows * F.size + 0.5) { GS.kind = 3; GS.path = 1; }
  const mine = 1 - smooth(MINE_R - 1, MINE_R + 5, dm + (n - 0.5) * 4);
  if (mine > 0.02) {
    const st = mix3([0, 0, 0], GP.stone, GP.stone2, n);
    mix3(st, st, GP.crystal, smooth(0.62, 0.8, fbm(x * 0.1, z * 0.1, 7, 2)));
    mix3(out, out, st, mine);
    if (mine > 0.5) GS.kind = 4;
  }
  return out;
}

// 一个区块 → 一张像素地面贴图（每单位 8 像素）
const RES = 8;
const _b = [0, 0, 0], _d = [0, 0, 0];
function paintGround(ox, oz) {
  const N = CHUNK * RES;
  return canvasTex(N, N, (ctx) => {
    const img = ctx.createImageData(N, N), D = img.data;
    const base = new Float32Array((N / 2) * (N / 2) * 5);
    for (let j = 0; j < N / 2; j++) for (let i = 0; i < N / 2; i++) {
      const x = ox + (i * 2 + 1) / RES, z = oz + (j * 2 + 1) / RES;
      groundSample(x, z, _b);
      const k = (j * (N / 2) + i) * 5;
      base[k] = _b[0]; base[k + 1] = _b[1]; base[k + 2] = _b[2]; base[k + 3] = GS.path; base[k + 4] = GS.kind;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = ((j >> 1) * (N / 2) + (i >> 1)) * 5;
      const px = ox * RES + i, pz = oz * RES + j, x = px / RES, z = pz / RES;
      const h = hash01(px, pz, 9), kind = base[k + 4], path = base[k + 3];
      let r = base[k], g = base[k + 1], b = base[k + 2], m = 1;
      if (kind === 4) { m = h < 0.06 ? 0.82 : h > 0.95 ? 1.12 : 1; }
      else if (path > 0.5 + (hash01(px >> 1, pz >> 1, 4) - 0.5) * 0.35) {
        if (kind === 1) { // 广场：错缝石板
          const rz = Math.floor(z * 1.6), rx = x * 1.6 + (rz & 1) * 0.5, cx = Math.floor(rx);
          const fx = rx - cx, fz = z * 1.6 - rz, v = 0.9 + hash01(cx, rz, 3) * 0.18;
          r = GP.plaza[0] * v; g = GP.plaza[1] * v; b = GP.plaza[2] * v;
          if (fx < 0.08 || fz < 0.11) m = 0.8; else if (fx < 0.3 && fz < 0.35) m = 1.05; else if (fx > 0.9 || fz > 0.88) m = 0.92;
        } else if (kind === 3) { // 农田周边：深色耕土，带垄沟
          mix3(_d, GP.dirt2, GP.till, 0.75); r = _d[0]; g = _d[1]; b = _d[2];
          m = ((pz >> 2) & 1) ? 0.95 : 1.0; if (h > 0.96) m = 1.1; else if (h < 0.04) m = 0.88;
        } else { // 土路 / 池边沙
          mix3(_d, kind === 2 ? GP.sand : GP.dirt, GP.dirt2, kind === 2 ? 0.15 : vnoise(x * 0.9, z * 0.9, 8) * 0.6);
          r = _d[0]; g = _d[1]; b = _d[2];
          m = h > 0.965 ? 1.1 : h < 0.04 ? 0.84 : 1;
          if (h > 0.992) m = 0.75;
        }
      } else { // 草地：竖向 1×2 草叶笔触 + 路边阴影
        const hs = hash01(px, pz >> 1, 17);
        m = hs < 0.1 ? 0.8 : hs > 0.94 ? 1.14 : 1;
        if (hs > 0.94) { r *= 1.06; }
        if (path > 0.28) m *= 0.86;
      }
      const o = (j * N + i) * 4;
      D[o] = Math.min(255, r * m); D[o + 1] = Math.min(255, g * m); D[o + 2] = Math.min(255, b * m); D[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: false });
}

// 有贴图时：每区块只做两张低分辨率数据图（底色 + 混合权重），细节由着色器从贴图采样
const lin = (c) => new THREE.Vector3(...c.map((v) => (v / 255) ** 2.2));
function groundMaps(ox, oz) {
  const N = CHUNK * RES / 2, tint = new Uint8Array(N * N * 4), mask = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ox + (i + 0.5) * CHUNK / N, z = oz + (j + 0.5) * CHUNK / N;
    groundSample(x, z, _b);
    const o = (j * N + i) * 4, k = GS.kind;
    tint[o] = _b[0]; tint[o + 1] = _b[1]; tint[o + 2] = _b[2]; tint[o + 3] = 255;
    mask[o] = (k === 0 || k === 2 || k === 3) ? GS.path * 255 : 0;            // 土路 / 沙 / 田边
    mask[o + 1] = k === 1 || k === 4 ? 255 : 0;                                // 石板 / 岩地
    mask[o + 2] = k === 2 ? 255 : k === 3 ? 0 : 128;                            // 土色：田边深 ← 128 → 沙浅
    mask[o + 3] = k === 4 ? 255 : 0;                                            // 石面是否按底色染色
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, N, N);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
  };
  const tT = mk(tint, true), tM = mk(mask, false);
  return { tint: tT, mask: tM, dispose() { tT.dispose(); tM.dispose(); } };
}
const GROUND_FRAG = `
  float gPud = 0.0, gWetS = 0.0;
  {
    vec2 wp = vGW, uv = (wp - uOrigin) / ${CHUNK.toFixed(1)};
    vec3 tint = texture2D(tTint, uv).rgb;
    vec4 mk = texture2D(tMask, uv);
    vec3 gT = texture2D(tGrass, wp / 6.0).rgb, dT = texture2D(tDirt, wp / 5.0).rgb, sT = texture2D(tStone, wp / 4.5).rgb;
    float gl = dot(gT, vec3(0.3, 0.59, 0.11)), sl = dot(sT, vec3(0.3, 0.59, 0.11));
    vec3 c = gT * tint / uGrassRef;
    vec3 dTint = mk.b < 0.5 ? mix(uFarm, vec3(1.0), mk.b * 2.0) : mix(vec3(1.0), uSand, mk.b * 2.0 - 1.0);
    dT = mix(vec3(dot(dT, vec3(0.3, 0.59, 0.11))), dT, mk.b < 0.5 ? 0.55 : 0.8); // 田边土色不要太橙
    float wd = smoothstep(0.4, 0.6, mk.r + (gl - 0.2) * 0.9), ws = smoothstep(0.4, 0.6, mk.g + (gl - 0.2) * 0.5);
    c = mix(c, dT * dTint, wd);
    sT = mix(vec3(sl) * vec3(0.94, 0.98, 1.04), sT, 0.45); // 青石板偏冷灰
    c = mix(c, mix(sT, sT * tint / uPlaza, mk.a), ws);
    // 雨后：整体变暗；土路 / 石板的低洼处积水，越湿水洼越大
    float hard = max(wd, ws);
    float n = gNoise(wp * 0.32) * 0.65 + gNoise(wp * 0.95 + 7.3) * 0.35, th = 0.86 - 0.15 * uWet;
    gPud = smoothstep(th, th + 0.035, n) * max(wd, ws * 0.8) * step(0.05, uWet);
    c *= mix(1.0, mix(0.84, 0.62, hard), uWet);
    c *= 1.0 - gPud * 0.5;
    gWetS = uWet * (0.3 + 0.7 * hard);
    diffuseColor.rgb *= c;
  }`;
// 草地 / 土路的法线图：只扰动这两种地面，石板保持平
const GROUND_NRM = `
  #ifdef GROUND_NORMALS
  {
    vec2 wp = vGW;
    vec4 mk = texture2D(tMask, (wp - uOrigin) / ${CHUNK.toFixed(1)});
    vec3 gN = texture2D(tGrassN, wp / 6.0).xyz * 2.0 - 1.0, dN = texture2D(tDirtN, wp / 5.0).xyz * 2.0 - 1.0;
    vec3 tn = normalize(mix(mix(gN, dN, smoothstep(0.4, 0.6, mk.r)), vec3(0.0, 0.0, 1.0), smoothstep(0.4, 0.6, mk.g)));
    normal = normalize((viewMatrix * vec4(tn.x, tn.z, tn.y, 0.0)).xyz); // 切线 +x，副切线 +z，法线 +y
  }
  #endif
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), gPud)); // 水面是平的`;
// 湿地反光：水洼映天色 + 太阳高光（卡通化成硬边亮点）+ 下雨时的涟漪
const GROUND_WET = `
  if (uWet > 0.01) {
    vec3 V = normalize(vViewPosition);
    float fr = 0.3 + 0.7 * pow(1.0 - max(dot(normal, V), 0.0), 3.0);
    totalEmissiveRadiance += uSky * gPud * fr * 0.32;
    #if NUM_DIR_LIGHTS > 0
      float nh = max(dot(normal, normalize(directionalLights[0].direction + V)), 0.0);
      float sp = mix(smoothstep(0.94, 0.965, nh), smoothstep(0.985, 0.99, nh) * 2.0, gPud);
      totalEmissiveRadiance += directionalLights[0].color * sp * gWetS * 0.5;
    #endif
    vec2 rc = floor(vGW * 2.4), rf = fract(vGW * 2.4) - 0.5;
    float ph = fract(uRainT * 1.3 + gHash(rc));
    float rr = length(rf - (vec2(gHash(rc + 3.1), gHash(rc + 7.7)) - 0.5) * 0.5);
    totalEmissiveRadiance += uSky * smoothstep(0.035, 0.0, abs(rr - ph * 0.32)) * (1.0 - ph) * gPud * uRain * 0.6;
  }`;
const GROUND_NOISE = `
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
function groundMat(ox, oz, maps) {
  const m = toon('#ffffff', { unique: true });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      tTint: { value: maps.tint }, tMask: { value: maps.mask }, uOrigin: { value: new THREE.Vector2(ox, oz) },
      tGrass: { value: PNG.grass_ground }, tDirt: { value: PNG.dirt_path }, tStone: { value: PNG.stone_plaza },
      tGrassN: { value: PNG.grass_ground_n }, tDirtN: { value: PNG.dirt_path_n },
      uWet: weatherU.wet, uRain: weatherU.rain, uSky: weatherU.sky, uRainT: wind,
      uGrassRef: { value: lin(GP.grass) }, uPlaza: { value: lin(GP.plaza) },
      uFarm: { value: lin(mix3([0, 0, 0], GP.dirt2, GP.till, 0.75)).divide(lin(GP.dirt)) }, uSand: { value: lin(GP.sand).divide(lin(GP.dirt)) },
    });
    s.vertexShader = 'varying vec2 vGW;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGW = position.xz;');
    s.fragmentShader = (PNG.grass_ground_n && PNG.dirt_path_n ? '#define GROUND_NORMALS\n' : '') + 'uniform sampler2D tTint, tMask, tGrass, tDirt, tStone, tGrassN, tDirtN;\nuniform float uWet, uRain, uRainT;\nuniform vec3 uSky;\n' + GROUND_NOISE + 'uniform vec2 uOrigin;\nuniform vec3 uGrassRef, uPlaza, uFarm, uSand;\nvarying vec2 vGW;\n'
      + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>' + GROUND_FRAG).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + GROUND_NRM)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + GROUND_WET);
  };
  m.customProgramCacheKey = () => 'ground';
  return m;
}

const _c = new THREE.Color();
const FOREST = ['#5fae3e', '#4f9e36', '#72bc46', '#469432', '#66b040'];
const MAPLE = ['#e8783a', '#d8582e', '#f2a640', '#cc4a2f'];
const PINE = ['#2f7a4a', '#3a8752', '#2a6c44'];
const FLOWERS = ['#ffe36b', '#ff9ec7', '#ffffff', '#b7a4ff', '#ff7a6a'];
const GRASS = ['#6cb342', '#5aa238', '#82c24a', '#4f9632'];

// 蓬松树冠：几个凹凸球体拼成一团，顶部亮、底部暗（顶点色）
function blobs(parts, detail, lo, hi, y0, y1, seed) {
  const gs = parts.map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      const d = 1 + (vnoise(vx * 3 + i * 7, vz * 3 + vy * 2, seed) - 0.5) * 0.22;
      p.setXYZ(k, vx * d + x, vy * d + y, vz * d + z);
    }
    return g;
  });
  const g = mergeGeometries(gs);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const t = smooth(y0, y1, p.getY(k)), v = lo + (hi - lo) * t;
    const L = v ** 1.6; col[k * 3] = L; col[k * 3 + 1] = L; col[k * 3 + 2] = L * (0.92 + t * 0.08);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function cones(parts, lo, hi, y0, y1) {
  const g = mergeGeometries(parts.map(([y, r, h]) => new THREE.ConeGeometry(r, h, 9).translate(0, y, 0)));
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) { const v = lo + (hi - lo) * smooth(y0, y1, p.getY(k)); col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 叶片卡树冠：在几团球体内随机撒四边形，法线取自整体球心（整团像一个圆球受光），
// 贴图是 2×2 的透明叶簇图集；顶点色做内部暗、顶部亮
function leafCards(parts, n, size, seed) {
  const r = mulberry32(seed), pos = [], nor = [], uv = [], card = [], col = [], idx = [];
  let cx = 0, cy = 0, cz = 0, w = 0, y0 = 1e9, y1 = -1e9;
  for (const [x, y, z, rr] of parts) { cx += x * rr; cy += y * rr; cz += z * rr; w += rr; y0 = Math.min(y0, y - rr); y1 = Math.max(y1, y + rr); }
  cx /= w; cy /= w; cz /= w;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const [px, py, pz, pr] = parts[Math.floor(r() * parts.length)];
    v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (v.lengthSq() > 1 || v.lengthSq() < 0.01) { i--; continue; }
    v.normalize();
    const d = pr * (0.45 + 0.5 * Math.sqrt(r()));
    const x = px + v.x * d, y = py + v.y * d, z = pz + v.z * d;
    const nx = x - cx, ny = y - cy + 0.25, nz = z - cz, nl = Math.hypot(nx, ny, nz) || 1;
    const t = smooth(y0, y1, y), depth = d / pr;
    const L = ((0.55 + 0.55 * t) * (0.7 + 0.35 * depth)) ** 1.6;
    const cell = Math.floor(r() * 4), u0 = (cell & 1) * 0.5, v0 = (cell >> 1) * 0.5;
    const sz = size * (0.75 + r() * 0.5), rot = r() * 6.283, b = pos.length / 3;
    for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(x, y, z); nor.push(nx / nl, ny / nl, nz / nl);
      uv.push(u0 + (qx * 0.5 + 0.5) * 0.5, v0 + (qy * 0.5 + 0.5) * 0.5);
      card.push(qx, qy, sz, rot); col.push(L, L, L * 0.96);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(card, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.boundingSphere.radius += size * 1.5;
  return g;
}
// 没有生成贴图时的临时叶簇图集（程序画的椭圆叶片）
function fallbackCards() {
  return canvasTex(256, 256, (ctx) => {
    const r = mulberry32(5);
    for (let c = 0; c < 4; c++) {
      const ox = (c & 1) * 128 + 64, oy = (c >> 1) * 128 + 64;
      for (let i = 0; i < 13; i++) {
        const a = r() * 6.283, d = 8 + r() * 30, x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2 + (r() - 0.5) * 0.6);
        const v = 150 + Math.floor(r() * 90);
        ctx.fillStyle = `rgb(${v - 40},${v - 40},${v - 50})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 22, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgb(${v},${v},${v - 10})`;
        ctx.beginPath(); ctx.ellipse(-1, -2, 8, 18, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
  }, { pixel: false, repeat: false });
}
function cardMat(color, tex) {
  const m = toon(color, { occ: true, vc: true, card: true, map: tex, unique: true });
  m.alphaTest = 0.5; m.side = THREE.DoubleSide;
  return m;
}

// 树冠的几团球（树干加高后整体上移）
const CROWN = [[0, 3.45, 0, 1.15], [0.75, 3.1, 0.3, 0.85], [-0.7, 3.15, -0.2, 0.9], [0.1, 3.1, -0.78, 0.85], [-0.25, 3.15, 0.75, 0.85], [0.15, 4.15, 0.05, 0.8]];

// 草卡：3 张散开的透明四边形（12 顶点），根部随机错开、宽高各异；
// 顶点只记根部位置，着色器里正对镜头展开，所以不会出现米字形，俯视也看得到草叶
function grassCards() {
  const pos = [], col = [], nor = [], uv = [], gr = [], idx = [], r = mulberry32(23);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.4 + r() * 1.2, d = i === 0 ? r() * 0.08 : 0.16 + r() * 0.2;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, W = 0.26 + r() * 0.16, H = 0.4 + r() * 0.18, u = 0.5 + r() * 0.35, b = pos.length / 3;
    for (let k = 0; k < 4; k++) { pos.push(x, 0, z); nor.push(0, 1, 0); }
    gr.push(-W, 0, u, i, W, 0, u, i, W, H, u, i, -W, H, u, i);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    col.push(0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 1.15, 1.15, 1.05, 1.15, 1.15, 1.05);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aGrass', new THREE.Float32BufferAttribute(gr, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.9); // 展开在着色器里，包围球手动放大
  return g;
}
// 没有生成贴图时的临时草叶图：一排从底边长出的尖叶
function fallbackBlades() {
  return canvasTex(256, 128, (ctx) => {
    const r = mulberry32(12);
    for (let i = 0; i < 26; i++) {
      const x = 8 + r() * 240, h = 50 + r() * 74, w = 4 + r() * 4, lean = (r() - 0.5) * 40, v = 160 + Math.floor(r() * 95);
      ctx.fillStyle = `rgb(${v},${v},${v - 12})`;
      ctx.beginPath(); ctx.moveTo(x - w, 128); ctx.quadraticCurveTo(x - w * 0.3 + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
      ctx.quadraticCurveTo(x + w * 0.3 + lean * 0.3, 128 - h * 0.6, x + w, 128); ctx.fill();
    }
  }, { pixel: false, repeat: false });
}

function grassTuft() {
  const pos = [], col = [], nor = [], r = mulberry32(17);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + r() * 0.8, d = 0.04 + r() * 0.08;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, w = 0.045 + r() * 0.02, h = 0.32 + r() * 0.22;
    const lean = 0.08 + r() * 0.1, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    col.push(0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 1.18, 1.18, 1.05);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------- 共享贴图 ----------
let TEX;
function textures() {
  if (TEX) return TEX;
  const px = (ctx, x, y, v, b = v) => { ctx.fillStyle = `rgb(${v},${v},${b})`; ctx.fillRect(x, y, 1, 1); };
  TEX = {
    // 木板墙：横向木板，深色缝，木纹
    plank: canvasTex(16, 16, (ctx) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 2, seam = (y & 3) === 3, joint = ((x + row * 5) % 16) === 0;
        const v = seam || joint ? 150 : 222 + Math.floor(hash01(x >> 2, y, row) * 26) - (hash01(x, y, 3) > 0.9 ? 22 : 0);
        px(ctx, x, y, v);
      }
    }),
    // 瓦片：一排排鱼鳞瓦
    tile: canvasTex(16, 16, (ctx) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 2, fy = y & 3, fx = (x + (row & 1) * 2) & 3;
        let v = 240 - fy * 10;
        if (fy === 3) v = 175; else if (fx === 0 && fy > 0) v = 200;
        if (fy === 0 && fx === 2) v = 255;
        px(ctx, x, y, v);
      }
    }),
    // 石块：墙基 / 井
    stone: canvasTex(16, 16, (ctx) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 3, bx = (x + row * 4) >> 3, fy = y & 7, fx = (x + row * 4) & 7;
        let v = 200 + Math.floor(hash01(bx, row, 2) * 40);
        if (fy === 7 || fx === 7) v = 120; else if (fy === 0 || fx === 0) v += 15;
        px(ctx, x, y, v, v + 6);
      }
    }),
    // 耕地：垄沟
    soil: canvasTex(16, 16, (ctx) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = (y & 3) === 0 ? 150 : (y & 3) === 1 ? 250 : 215 + Math.floor(hash01(x, y, 5) * 25);
        px(ctx, x, y, v);
      }
    }),
  };
  if (PNG.wood_planks) TEX.plank = PNG.wood_planks;
  if (PNG.roof_tiles) TEX.tile = PNG.roof_tiles;
  if (PNG.tilled_soil) TEX.soil = PNG.tilled_soil;
  return TEX;
}

// ---------- 世界 ----------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.prefabCols = new Map();
    this.emitters = [];
    this.houses = [];
    this.ores = [];
    this.farm = [];
    this.picked = new Map(); // 只存改动：被采过的野生灵草 id → 采摘那天（3 天后重新长出来）
    this.day = 1;
    this.mineFactor = 0;
    this.herbGlows = {};
    this.onSpawn = null;
    this.time = 0;
    this.initAssets();
    this.buildVillage();
    this.buildMine();
  }

  initAssets() {
    const petal = (x, z, y) => new THREE.IcosahedronGeometry(0.085, 1).translate(x, y, z);
    this.T = textures();
    this.G = {
      trunk: new THREE.CylinderGeometry(0.2, 0.32, 2.8, 7).translate(0, 1.4, 0),
      crown: blobs(CROWN, 2, 0.62, 1.18, 2.5, 4.7, 3),
      pine: cones([[1.9, 1.35, 1.6], [2.8, 1.05, 1.4], [3.6, 0.7, 1.2]], 0.62, 1.15, 1.2, 4.2),
      bush: blobs([[0, 0.35, 0, 0.48], [0.4, 0.28, 0.15, 0.36], [-0.38, 0.3, -0.1, 0.38]], 1, 0.65, 1.15, 0, 0.8, 4),
      crownCards: leafCards(CROWN, 110, 0.5, 7),
      bambooCards: leafCards([[0.25, 6.7, 0, 0.6], [-0.3, 6.1, 0.2, 0.55], [0.1, 5.4, -0.3, 0.5], [-0.2, 4.7, 0.25, 0.45], [0.2, 4.0, 0, 0.4]], 80, 0.32, 9),
      bushCards: leafCards([[0, 0.35, 0, 0.48], [0.4, 0.28, 0.15, 0.36], [-0.38, 0.3, -0.1, 0.38]], 40, 0.18, 8),
      rock: new THREE.DodecahedronGeometry(0.7, 1).translate(0, 0.3, 0),
      grass: grassCards(),
      flower: mergeGeometries([petal(0, 0, 0.22), petal(0.14, 0.06, 0.18), petal(-0.08, 0.12, 0.2)]),
      stem: new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4).translate(0, 0.25, 0),
      bulb: flat(new THREE.OctahedronGeometry(0.16, 0)),
      leaf: flat(new THREE.ConeGeometry(0.12, 0.45, 4)),
      spike: flat(new THREE.ConeGeometry(0.6, 2.4, 5)).translate(0, 1.2, 0),
      shard: flat(new THREE.OctahedronGeometry(0.4, 0)),
      tomb: mergeGeometries([new THREE.BoxGeometry(0.6, 0.85, 0.22).translate(0, 0.42, 0), new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.85, 0)]),
    };
    this.M = {
      ground: toon('#ffffff', { vc: true }),
      trunk: toon('#8a5a34', { occ: true }),
      leafy: toon('#ffffff', { occ: true, vc: true, leaf: true }),
      grass: (() => {
        const map = PNG.grass_blades || fallbackBlades();
        map.wrapS = THREE.RepeatWrapping; map.needsUpdate = true; // 每丛随机截取一段
        const m = toon('#ffffff', { vc: true, grass: true, map, unique: true });
        m.side = THREE.DoubleSide; m.alphaTest = 0.5; return m;
      })(),
      rock: toon('#ffffff', { occ: true }),
      plain: toon('#ffffff'),
      herbGlow: glow('#7dffe0', 3),
      line: outlineMat('#2b1d14', 0.035, { occ: true }),
      leafLine: outlineMat('#24401c', 0.05, { occ: true }),
    };
    const cards = PNG.leaf_cards || fallbackCards();
    this.M.cards = cardMat('#ffffff', cards);
    this.M.blossom = cardMat('#ffc4dc', PNG.blossom_cards || cards);
    // 叶卡下面的实心内核：缩小、压暗，负责投影和填补空隙
    const shrink = (g, cy, k) => g.clone().translate(0, -cy, 0).scale(k, k, k).translate(0, cy, 0);
    this.G.crownCore = shrink(this.G.crown, 3.4, 0.8);
    this.G.bushCore = shrink(this.G.bush, 0.3, 0.8);
  }

  // ---------- 碰撞 ----------
  _cells(x0, z0, x1, z1, fn) {
    for (let gx = Math.floor(x0 / 8); gx <= Math.floor(x1 / 8); gx++)
      for (let gz = Math.floor(z0 / 8); gz <= Math.floor(z1 / 8); gz++) {
        const k = key(gx, gz);
        let b = this.prefabCols.get(k);
        if (!b) { b = { c: [], b: [] }; this.prefabCols.set(k, b); }
        fn(b);
      }
  }
  addCircle(x, z, r) { const c = { x, z, r, off: false }; this._cells(x - r, z - r, x + r, z + r, (b) => b.c.push(c)); return c; }
  addBox(x0, z0, x1, z1) { const bx = { x0, z0, x1, z1 }; this._cells(x0, z0, x1, z1, (b) => b.b.push(bx)); return bx; }

  resolve(p, r) {
    const cx = Math.floor(p.x / CHUNK), cz = Math.floor(p.z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chunks.get(key(cx + dx, cz + dz));
      if (ch) for (const c of ch.cols) pushCircle(p, r, c);
    }
    const gx = Math.floor(p.x / 8), gz = Math.floor(p.z / 8);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const b = this.prefabCols.get(key(gx + dx, gz + dz));
      if (!b) continue;
      for (const c of b.c) pushCircle(p, r, c);
      for (const bx of b.b) pushBox(p, r, bx);
    }
  }

  insideHouse(x, z, pad = 0) {
    return this.houses.find((h) => x > h.x0 - pad && x < h.x1 + pad && z > h.z0 - pad && z < h.z1 + pad);
  }

  // ---------- 发光源（灯笼/火把/晶石），由光源池挑最近的点亮 ----------
  addEmitter(x, y, z, color, power, kind, glowMesh) {
    const e = { x, y, z, color: new THREE.Color(color), power, kind, glowMesh, seed: Math.random() * 10 };
    this.emitters.push(e);
    return e;
  }

  // ---------- 区块流式加载 ----------
  update(p, dt, nightK, hours, forceAll = false) {
    this.time += dt;
    const pcx = Math.floor(p.x / CHUNK), pcz = Math.floor(p.z / CHUNK), R = 2;
    const need = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (!this.chunks.has(key(pcx + dx, pcz + dz))) need.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
    }
    need.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < (forceAll ? need.length : Math.min(1, need.length)); i++) this.genChunk(need[i][0], need[i][1]);
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - pcx) > R + 1 || Math.abs(ch.cz - pcz) > R + 1) this.unloadChunk(k, ch);
    }

    // 房屋：进门屋顶淡出、墙体剖开（同一个世界，不切场景）
    for (const h of this.houses) {
      const inside = p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1;
      h.t = approach(h.t, inside ? 1 : 0, dt * 3.5);
      for (const m of h.roofMats) {
        m.opacity = 1 - h.t;
        m.transparent = h.t > 0.001;
        m.colorWrite = h.t < 0.98;
        m.depthWrite = h.t < 0.02;
      }
      h.wallsG.scale.y = 1 - h.t * 0.68;
      h.roof.traverse((o) => { if (o.isMesh && !o.userData.isLine) o.castShadow = h.t < 0.5; });
      for (const o of h.hideWhenCut) o.visible = h.t < 0.5;
    }

    // 矿洞：平地，只靠光影营造"地下"的感觉
    const dm = Math.hypot(p.x - MINE.x, p.z - MINE.y);
    this.mineFactor = 1 - smooth(MINE_R - 4, MINE_R + 2, dm);

    // 发光体随昼夜亮灭
    for (const e of this.emitters) {
      const k = this.emitterLevel(e, nightK);
      if (e.glowMesh) e.glowMesh.material.color.copy(e.glowMesh.material.userData.base).multiplyScalar(0.25 + k * 0.75);
    }
    for (const w of this.windowMats) w.color.copy(w.userData.day).lerp(w.userData.base, nightK);
    if (this.water) { this.water.uniforms.uTime.value = this.time; this.water.uniforms.uLight.value = 1 - nightK * 0.72; }
    if (this.fall) { this.fall.uniforms.uTime.value = this.time; this.fall.uniforms.uLight.value = 1 - nightK * 0.72; }
    if (this.wheel) this.wheel.rotation.z -= dt * 0.9;
    this.updateSky(dt, p, nightK);
    wind.value = this.time;

    // 矿石重生
    for (const o of this.ores) {
      if (!o.alive) { o.respawn -= dt; if (o.respawn <= 0) { o.alive = true; o.hp = 3; o.group.visible = true; o.col.off = false; } }
    }
    // 野生灵草摆动
    for (const ch of this.chunks.values()) for (const h of ch.herbs) {
      h.mesh.children[1].rotation.y += dt;
      h.mesh.children[1].position.y = 0.62 + Math.sin(this.time * 2 + h.x) * 0.05;
    }
  }

  emitterLevel(e, nightK) {
    const flick = e.kind === 'torch' ? 0.85 + 0.15 * Math.sin(this.time * 13 + e.seed) * Math.sin(this.time * 7.3 + e.seed * 3) : 1;
    if (e.kind === 'lantern' || e.kind === 'window') return nightK * flick;
    if (e.kind === 'torch') return Math.max(nightK, this.mineFactor, 0.35) * flick;
    return 0.6 + 0.4 * Math.sin(this.time * 1.5 + e.seed); // crystal
  }

  genChunk(cx, cz) {
    const k = key(cx, cz);
    const rng = mulberry32(hashInt(cx, cz, 99));
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const group = new THREE.Group();

    // 地面：一块平面 + 像素贴图
    const gg = new THREE.PlaneGeometry(CHUNK, CHUNK);
    gg.rotateX(-Math.PI / 2); gg.translate(ox + CHUNK / 2, 0, oz + CHUNK / 2);
    const usePNG = PNG.grass_ground && PNG.dirt_path && PNG.stone_plaza;
    const gtex = usePNG ? groundMaps(ox, oz) : paintGround(ox, oz);
    const gmat = usePNG ? groundMat(ox, oz, gtex) : toon('#ffffff', { map: gtex, unique: true });
    group.add(mesh(gg, gmat, { cast: false, recv: true }));

    // 程序填充：树、石、草、花、野生灵草
    const trees = [], pines = [], trunks = [], rocks = [], grass = [], flowers = [], bushes = [], cols = [], herbs = [], tombs = [];
    const step = 2.6;
    let hi = 0;
    for (let gx = 0; gx < CHUNK; gx += step) for (let gz = 0; gz < CHUNK; gz += step) {
      const x = ox + gx + rng() * step, z = oz + gz + rng() * step;
      const dv = Math.hypot(x, z), dm = Math.hypot(x - MINE.x, z - MINE.y), rd = roadDist(x, z);
      const clear = dv < VILLAGE_R - 3 || rd < 3 || dm < MINE_R + 7 || pondDist(x, z) < 2 || CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
      const dens = fbm(x * 0.035, z * 0.035, 21, 2);
      const r = rng();
      const maple = mapleAmount(x, z);
      // 扇区：树、石头、草的多少和样子都按本扇区来（离村越远越明显）
      const sec = sectorAt(x, z), bk = biomeK(x, z), bio = bk > 0.5 ? sec : null;
      const treeK = 1 + (sec.trees - 1) * bk, rockK = 1 + (sec.rocks - 1) * bk;
      if (!clear && r < smooth(0.35, 0.75, dens) * 0.34 * treeK) {
        const s = 0.62 + rng() * 0.4;
        if (bio?.tree === 'dead') { trunks.push({ x, z, s: s * 0.9, rot: rng() * 6.28 }); cols.push({ x, z, r: 0.35 * s, off: false }); continue; }
        const isPine = bio?.tree === 'pine' || (fbm(x * 0.02, z * 0.02, 31, 2) > 0.58 && maple < 0.3);
        const c = bio?.crown ? (rng() < 0.7 ? bio.crown : PINE[0]) : isPine ? PINE[Math.floor(rng() * PINE.length)] : (rng() < maple ? MAPLE : FOREST)[Math.floor(rng() * 4)];
        (isPine ? pines : trees).push({ x, z, s, rot: rng() * 6.28, c });
        trunks.push({ x, z, s, rot: rng() * 6.28 });
        cols.push({ x, z, r: 0.42 * s, off: false });
      } else if (!clear && r > 1 - 0.035 * rockK) {
        const s = 0.6 + rng() * 1.1, rc = bio?.rockC || ['#aaa59e', '#948f8a'];
        if (bio?.tomb && rng() < 0.6) tombs.push({ x, z, s: 0.8 + rng() * 0.4, rot: rng() * 0.6 - 0.3, c: rc[Math.floor(rng() * 2)] });
        else rocks.push({ x, z, s, sy: s * (0.6 + rng() * 0.5), rot: rng() * 6.28, c: rc[Math.floor(rng() * 2)] });
        cols.push({ x, z, r: 0.6 * s, off: false });
      } else if (!clear && r > 0.9 && r < 0.94) {
        bushes.push({ x, z, s: 0.8 + rng() * 0.6, rot: rng() * 6.28, c: rng() < maple ? '#d8803a' : FOREST[Math.floor(rng() * 5)] });
      } else if (r > 0.94 && !clear && dangerAt(x, z) > 0.2) {
        const id = `${k}:${hi++}`;
        if (!this.herbGone(id)) herbs.push(this.makeHerb(x, z, id, group, wildHerb(x, z)));
      }
      const inPlaza = dv < 8.5, inMine = dm < MINE_R + 1, onRoad = rd < 1.8;
      if (!inPlaza && !inMine && !onRoad) {
        // 密草：每格 ~30 丛，颜色取自地面，草丛疏密随噪声成片
        const lush = (0.45 + fbm(x * 0.12, z * 0.12, 41, 2) * 0.9) * (1 + (sec.grass - 1) * bk);
        const gn = Math.floor(30 * lush);
        for (let i = 0; i < gn; i++) {
          const gx2 = x + (rng() - 0.5) * step, gz2 = z + (rng() - 0.5) * step;
          groundSample(gx2, gz2, _b);
          if (GS.path > 0.25 || GS.kind === 4 || this.insideHouse(gx2, gz2, 0.8)) continue;
          const v = 0.9 + rng() * 0.25;
          _c.setRGB(_b[0] / 255 * v * 1.08, _b[1] / 255 * v * 1.1, _b[2] / 255 * v, THREE.SRGBColorSpace);
          grass.push({ x: gx2, z: gz2, s: 0.75 + rng() * 0.6, sy: (0.7 + rng() * 0.7) * (0.7 + lush * 0.5), rot: rng() * 6.28, c: '#' + _c.getHexString() });
        }
        if (rng() < 0.16 * (1 + (sec.grass - 1) * bk)) {
          const c = FLOWERS[Math.floor(rng() * 5)];
          for (let i = 0; i < 3; i++) {
            const fx = x + rng() * 1.2, fz = z + rng() * 1.2;
            groundSample(fx, fz, _b);
            if (GS.path < 0.3) flowers.push({ x: fx, z: fz, s: 0.9 + rng() * 0.4, rot: rng() * 6, c });
          }
        }
      }
    }
    const ims = [];
    const add = (im) => { if (im) { group.add(im); ims.push(im); } };
    add(inst(this.G.trunk, this.M.trunk, trunks, true, this.M.line));
    for (const im of this.leafClump('crown', trees)) add(im);
    add(inst(this.G.pine, this.M.leafy, pines, true, this.M.leafLine));
    for (const im of this.leafClump('bush', bushes)) add(im);
    add(inst(this.G.rock, this.M.rock, rocks, true, this.M.line));
    add(inst(this.G.tomb, this.M.rock, tombs, true, this.M.line));
    add(inst(this.G.grass, this.M.grass, grass, false));
    add(inst(this.G.flower, this.M.plain, flowers, false));

    this.scene.add(group);
    const ch = { cx, cz, group, ground: gg, gtex, gmat, ims, cols, herbs };
    this.chunks.set(k, ch);
    if (this.onSpawn) this.onSpawn(cx, cz, rng);
  }

  makeHerb(x, z, id, parent, kind = 'lingcao') {
    const g = new THREE.Group();
    g.add(mesh(this.G.stem, toon('#3f9a5a'), { cast: false }));
    const b = mesh(this.G.bulb, this.herbGlows[kind] ??= glow(HERB_GLOW[kind] || '#7dffe0', 3), { cast: false }); b.position.y = 0.62; g.add(b);
    for (let i = 0; i < 3; i++) {
      const l = mesh(this.G.leaf, toon('#4fbf7a'), { cast: false });
      l.position.set(Math.cos(i * 2.1) * 0.15, 0.15, Math.sin(i * 2.1) * 0.15);
      l.rotation.set(Math.sin(i * 2.1) * 0.8, 0, -Math.cos(i * 2.1) * 0.8);
      g.add(l);
    }
    g.position.set(x, 0, z);
    parent.add(g);
    return { id, x, z, mesh: g, kind };
  }
  herbGone(id) { return this.picked.has(id) && this.day - this.picked.get(id) < 3; }

  pickHerb(ch, h) {
    this.picked.set(h.id, this.day);
    ch.group.remove(h.mesh);
    ch.herbs.splice(ch.herbs.indexOf(h), 1);
  }

  unloadChunk(k, ch) {
    this.scene.remove(ch.group);
    ch.ground.dispose(); ch.gtex.dispose(); ch.gmat.dispose();
    for (const im of ch.ims) im.dispose();
    this.chunks.delete(k);
  }

  // ---------- 预制件：青竹村 ----------
  buildVillage() {
    this.windowMats = [];
    for (const h of HOUSES) this.buildHouse(h.cx, h.cz, h.w, h.d, h);
    this.buildVillageProps();
    this.buildPond();
    this.buildPeaks();
    this.initSky();

    // 井：石砌井身 + 瓦顶
    const T = this.T;
    const well = new THREE.Group();
    const wellG = new THREE.CylinderGeometry(1.1, 1.2, 0.85, 14, 1, true).translate(0, 0.42, 0);
    const wuv = wellG.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * 7, wuv.getY(i) * 0.85);
    well.add(mesh(wellG, toon('#b4aea8', { occ: true, map: T.stone }), { recv: true }));
    well.add(mesh(new THREE.TorusGeometry(1.12, 0.1, 6, 18).rotateX(Math.PI / 2).translate(0, 0.86, 0), toon('#9a948e', { occ: true })));
    well.add(mesh(new THREE.CircleGeometry(1.05, 16).rotateX(-Math.PI / 2).translate(0, 0.55, 0), glow('#2a5a90', 0.8)));
    for (const s of [-1, 1]) well.add(at(mesh(new THREE.BoxGeometry(0.15, 2.0, 0.15).translate(0, 1, 0), toon('#7a5236', { occ: true })), s * 0.95, 0, 0));
    well.add(at(mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), toon('#7a5236', { occ: true })), 0, 1.8, 0));
    const wr = this.gableRoof(2.6, 1.8, 0.7, toon('#5a6070', { occ: true, map: T.tile }), toon('#3a3e48', { occ: true }));
    wr.position.y = 1.95; well.add(wr);
    addOutline(well, this.M.line);
    this.scene.add(well);
    this.addCircle(0, 0, 1.3);

    // 灯笼柱
    for (const [x, z] of [[5, 4], [-5, -4], [6, -1], [-5, 5], [-11, -3.5], [11, -6], [-9, 12], [9, 10], [20, -12], [26, -18]]) if (!this.insideHouse(x, z, 1)) this.lanternPost(x, z);

    // 村中树木（手放）
    const trees = [[-24, -2], [-15, -23], [4, 22], [24, 2], [22, 24], [-24, 24], [-26, -16], [0, -24], [7, -15], [-2, -14]];
    trees.forEach(([x, z], i) => {
      if (this.insideHouse(x, z, 2.5)) return;
      const t = new THREE.Group();
      t.add(mesh(this.G.trunk, this.M.trunk));
      const peach = i % 2 === 0, c = peach ? '#ffc4dc' : FOREST[i % 4];
      addOutline(t, this.M.leafLine);
      t.add(mesh(this.G.crownCore, toon('#' + _c.set(c).multiplyScalar(0.6).getHexString(), { occ: true, vc: true, leaf: true, leafTex: peach ? PNG.peach_foliage : null })));
      t.add(mesh(this.G.crownCards, peach ? this.M.blossom : cardMat(c, PNG.leaf_cards || this.M.cards.map), { cast: false }));
      t.position.set(x, 0, z); t.scale.setScalar(1.1);
      this.scene.add(t);
      this.addCircle(x, z, 0.5);
    });
    // 竹丛（村子外圈）
    const bamboo = [], bleaf = [], crng = mulberry32(88);
    for (const [bx, bz] of [[-27, 6], [-28, -8], [-22, -26], [27, -6], [28, 8], [-6, 27], [10, 26], [-29, 14]]) {
      if (this.insideHouse(bx, bz, 2.5)) continue;
      for (let k = 0; k < 7; k++) {
        const x = bx + (crng() - 0.5) * 2.4, z = bz + (crng() - 0.5) * 2.4, s = 0.8 + crng() * 0.5;
        const sy = s * (1 + crng() * 0.4);
        bamboo.push({ x, z, s, sy, rot: crng() * 6, c: crng() < 0.5 ? '#7cae3a' : '#5e9a34' });
        bleaf.push({ x, z, s: s * 0.9, sy, rot: crng() * 6, c: '#5fa83a' });
      }
      this.addCircle(bx, bz, 1.4);
    }
    const seg = [0, 1, 2, 3, 4, 5];
    const stalk = mergeGeometries(seg.map((i) => new THREE.CylinderGeometry(0.065 - i * 0.004, 0.08 - i * 0.004, 1.15, 6).translate(0, 0.6 + i * 1.18, 0)).concat(seg.map((i) => new THREE.CylinderGeometry(0.095 - i * 0.004, 0.095 - i * 0.004, 0.06, 6).translate(0, 1.18 * (i + 1), 0))));
    this.scene.add(inst(stalk, toon('#ffffff'), bamboo, true, this.M.line));
    this.scene.add(inst(this.G.bambooCards, this.M.cards, bleaf, false));

    // 灌木与花丛点缀
    const brng = mulberry32(5);
    const bush = [], flw = [];
    for (let i = 0; i < 60; i++) {
      const a = brng() * 6.28, r = 9 + brng() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r;
      groundSample(x, z, _b);
      if (GS.path > 0.1 || this.insideHouse(x, z, 2) || pondDist(x, z) < 1.5 || roadDist(x, z) < 2.5) continue;
      if (i % 3 === 0) { bush.push({ x, z, s: 0.7 + brng() * 0.5, rot: brng() * 6, c: FOREST[i % 5] }); this.addCircle(x, z, 0.4); }
      else for (let k = 0; k < 4; k++) flw.push({ x: x + brng() * 1.4, z: z + brng() * 1.4, s: 1, rot: brng() * 6, c: FLOWERS[i % 5] });
    }
    this.scene.add(...this.leafClump('bush', bush).filter(Boolean));
    this.scene.add(inst(this.G.flower, this.M.plain, flw, false));

    // 农田篱笆（地块本身由 farm.js 建）
    const F = FARM;
    const postG = mergeGeometries([new THREE.BoxGeometry(0.16, 0.8, 0.16).translate(0, 0.4, 0), new THREE.ConeGeometry(0.12, 0.14, 4).rotateY(Math.PI / 4).translate(0, 0.87, 0)]);
    const railG = new THREE.BoxGeometry(1, 0.1, 0.07);
    const wood = toon('#a8743f');
    const fx0 = F.x0 - 0.4, fz1 = F.z0 + F.rows * F.size + 0.4, fx1 = F.x0 + F.cols * F.size + 0.4;
    const fence = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 1.2);
      const fg = new THREE.Group();
      for (let i = 0; i <= n; i++) fg.add(at(mesh(postG, wood), ax + (bx - ax) * i / n, 0, az + (bz - az) * i / n));
      for (const y of [0.32, 0.62]) {
        const r = mesh(railG, wood); r.scale.x = L; r.position.set((ax + bx) / 2, y, (az + bz) / 2);
        r.rotation.y = -Math.atan2(bz - az, bx - ax); fg.add(r);
      }
      addOutline(fg, this.M.line);
      this.scene.add(fg);
      this.addBox(Math.min(ax, bx) - 0.1, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, Math.max(az, bz) + 0.1);
    };
    fence(fx0, F.z0 - 0.4, fx0, fz1);
    fence(fx0, fz1, fx1, fz1);
  }

  farmTileAt(x, z) {
    const F = FARM;
    const c = Math.floor((x - F.x0) / F.size), r = Math.floor((z - F.z0) / F.size);
    if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) return null;
    return this.farm[c * F.rows + r];
  }

  lanternPost(x, z) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5).translate(0, 1.1, 0), toon('#5a3a28', { occ: true })));
    g.add(at(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), toon('#5a3a28')), 0.2, 2.1, 0));
    const lan = mesh(flat(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 6)), glow('#ff7a3a', 3, true), { cast: false });
    lan.position.set(0.4, 1.8, 0); g.add(lan);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.addCircle(x, z, 0.2);
    this.addEmitter(x + 0.4, 1.8, z, '#ffaa66', 1, 'lantern', lan);
  }

  // 叶卡树冠 = 压暗的实心内核（投影）+ 叶片卡（不投影）
  leafClump(kind, list) {
    const dark = list.map((o) => ({ ...o, c: o.c && '#' + _c.set(o.c).multiplyScalar(0.6).getHexString() }));
    return [inst(this.G[kind + 'Core'], this.M.leafy, dark, true), inst(this.G[kind + 'Cards'], this.M.cards, list, false)];
  }

  // 人字形瓦顶 + 微翘的屋脊（修仙味），返回 Group
  gableRoof(len, width, rise, tileM, ridgeM, mats) {
    const g = new THREE.Group();
    const half = width / 2, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const geo = boxUV(new THREE.BoxGeometry(len, 0.14, slope), len, 0.14, slope, 0.8);
      const m = mesh(geo, tileM); m.position.set(0, rise / 2, s * half / 2); m.rotation.x = s * ang; g.add(m);
    }
    // 山墙三角
    const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
    for (const s of [-1, 1]) {
      const m = mesh(new THREE.ShapeGeometry(tri).rotateY(Math.PI / 2 * s), mats ? mats.gable : ridgeM);
      m.position.x = s * (len / 2 - 0.25); g.add(m);
    }
    // 屋脊 + 两端翘角
    g.add(at(mesh(new THREE.BoxGeometry(len + 0.3, 0.16, 0.22), ridgeM), 0, rise + 0.02, 0));
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.14, 0.75, 5).rotateZ(-s * 0.75), ridgeM);
      h.position.set(s * (len / 2 + 0.28), rise + 0.3, 0); g.add(h);
      for (const t of [-1, 1]) { // 檐角起翘
        const e = mesh(new THREE.ConeGeometry(0.1, 0.55, 5).rotateZ(-s * 1.0).rotateX(t * 0.5), ridgeM);
        e.position.set(s * (len / 2 + 0.1), 0.05, t * (half + 0.05)); g.add(e);
      }
    }
    return g;
  }

  buildHouse(cx, cz, w, d, opt) {
    const H = 2.4, T = 0.25, door = 1.5, TX = this.T;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const root = new THREE.Group(); this.scene.add(root);
    const wallM = toon(opt.wall, { occ: true, map: TX.plank }), trim = toon('#5a3a26', { occ: true });
    const baseM = toon('#a8a29c', { occ: true, map: TX.stone });
    const roofM = toon(opt.roof, { unique: true, occ: true, map: TX.tile });
    const ridgeM = toon('#3a3e48', { unique: true, occ: true });
    const gableM = toon(opt.wall, { unique: true, occ: true, map: TX.plank });
    const floorM = toon('#b08458', { map: TX.plank });
    root.add(at(mesh(boxUV(new THREE.BoxGeometry(w, 0.12, d), w, 0.12, d, 1.5), floorM, { cast: false, recv: true }), cx, 0.06, cz));
    const wallsG = new THREE.Group(); root.add(wallsG);
    const hideWhenCut = [];
    const wall = (x, z, len, alongX) => {
      const gw = alongX ? len : T, gd = alongX ? T : len;
      const m = mesh(boxUV(new THREE.BoxGeometry(gw, H, gd), gw, H, gd, 1.6).translate(0, H / 2, 0), wallM, { recv: true });
      m.position.set(x, 0, z); wallsG.add(m);
      const b = mesh(boxUV(new THREE.BoxGeometry(gw + 0.08, 0.45, gd + 0.08), gw, 0.45, gd, 1.2).translate(0, 0.22, 0), baseM, { recv: true });
      b.position.set(x, 0, z); wallsG.add(b);
      if (alongX) this.addBox(x - len / 2, z - T / 2, x + len / 2, z + T / 2);
      else this.addBox(x - T / 2, z - len / 2, x + T / 2, z + len / 2);
    };
    wall(cx, z0, w, true);
    wall(x0, cz, d, false);
    wall(x1, cz, d, false);
    const seg = (w - door) / 2;
    wall(x0 + seg / 2, z1, seg, true);
    wall(x1 - seg / 2, z1, seg, true);
    const lintel = mesh(boxUV(new THREE.BoxGeometry(door, 0.5, T), door, 0.5, T, 1.6), wallM); lintel.position.set(cx, H - 0.25, z1);
    root.add(lintel); hideWhenCut.push(lintel);
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx - door / 2, z1], [cx + door / 2, z1]]) {
      wallsG.add(at(mesh(new THREE.BoxGeometry(0.28, H, 0.28).translate(0, H / 2, 0), trim), px, 0, pz));
    }
    // 门前台阶
    root.add(at(mesh(boxUV(new THREE.BoxGeometry(door + 0.6, 0.18, 0.7), door + 0.6, 0.18, 0.7, 1.5), toon('#8a6040', { map: TX.plank }), { recv: true }), cx, 0.09, z1 + 0.45));
    // 窗：木框 + 玻璃（白天蓝，夜里暖光）
    const winM = glow('#ffc070', 2.2, true); winM.userData.day = new THREE.Color('#8ec8e8'); this.windowMats.push(winM);
    for (const sx of [x0 + seg / 2, x1 - seg / 2]) {
      const fr = mesh(new THREE.BoxGeometry(1.0, 0.8, 0.08), trim, { cast: false });
      fr.position.set(sx, 1.45, z1 + T / 2 + 0.03); wallsG.add(fr); hideWhenCut.push(fr);
      const wn = mesh(new THREE.PlaneGeometry(0.78, 0.58), winM, { cast: false });
      wn.position.set(sx, 1.45, z1 + T / 2 + 0.08); wallsG.add(wn); hideWhenCut.push(wn);
      const bar = mesh(new THREE.BoxGeometry(0.06, 0.6, 0.04), trim, { cast: false });
      bar.position.set(sx, 1.45, z1 + T / 2 + 0.1); wallsG.add(bar); hideWhenCut.push(bar);
      const box = mesh(new THREE.BoxGeometry(0.95, 0.18, 0.25), toon('#7a4a2a'), { cast: false });
      box.position.set(sx, 0.98, z1 + T / 2 + 0.15); wallsG.add(box); hideWhenCut.push(box);
      for (let k = 0; k < 3; k++) {
        const f = mesh(this.G.flower, toon(FLOWERS[(k + Math.abs(Math.round(sx))) % 5]), { cast: false });
        f.position.set(sx - 0.3 + k * 0.3, 0.92, z1 + T / 2 + 0.15); wallsG.add(f); hideWhenCut.push(f);
      }
    }
    // 屋顶（人字形，屋脊沿 x 方向）
    const roof = this.gableRoof(w + 1.0, d + 1.2, 1.7, roofM, ridgeM, { gable: gableM });
    roof.position.set(cx, H, cz);
    // 烟囱
    const ch = mesh(boxUV(new THREE.BoxGeometry(0.6, 1.6, 0.6), 0.6, 1.6, 0.6, 1.4), toon('#b4aea8', { unique: true, occ: true, map: TX.stone }));
    ch.position.set(w * 0.28, 1.4, -d * 0.18); roof.add(ch);
    root.add(roof);
    const roofMats = [roofM, ridgeM, gableM, ch.material];
    for (const lx of [cx - door / 2 - 0.5, cx + door / 2 + 0.5]) {
      const lz = z1 + 0.55;
      const lan = mesh(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1.15, 1), glow('#ff4a2a', 1.6, true), { cast: false });
      lan.position.set(lx, 1.95, lz); root.add(lan);
      for (const dy of [0.25, -0.25]) root.add(at(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), toon('#3a2a20')), lx, 1.95 + dy, lz));
      root.add(at(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 3), toon('#3a2a20')), lx, 2.4, lz));
      this.addEmitter(lx, 1.9, lz, '#ff7a4a', 0.7, 'lantern', lan);
    }
    // 室内家具
    const furn = (gw, gh, gd, x, z, color) => {
      root.add(at(mesh(new THREE.BoxGeometry(gw, gh, gd).translate(0, gh / 2, 0), toon(color), { recv: true }), x, 0.12, z));
      this.addBox(x - gw / 2, z - gd / 2, x + gw / 2, z + gd / 2);
    };
    furn(1.3, 0.4, 2.0, x0 + 1.0, z0 + 1.3, '#b0784a');
    root.add(at(mesh(new THREE.BoxGeometry(1.0, 0.15, 0.5), toon('#f0f0f0')), x0 + 1.0, 0.6, z0 + 0.6));
    root.add(at(mesh(new THREE.BoxGeometry(1.1, 0.1, 1.6), toon(opt.player ? '#5a8ab0' : '#b05a5a')), x0 + 1.0, 0.57, z0 + 1.6));
    furn(1.1, 0.7, 1.1, x1 - 1.3, z0 + 1.3, '#8a5a3a');
    furn(0.9, 0.6, 0.6, x1 - 0.8, z1 - 1.0, '#7a4a2a');
    const lamp = mesh(flat(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 6)), glow('#ffb060', 3, true), { cast: false });
    lamp.position.set(x1 - 1.3, 1.0, z0 + 1.3); root.add(lamp);
    this.addEmitter(x1 - 1.3, 1.3, z0 + 1.3, '#ffb070', 0.8, 'window', lamp);
    // 屋外木桶 / 箱子
    const prop = (geo, mat, x, z) => { const m = mesh(geo, mat); m.position.set(x, 0, z); root.add(m); addOutline(m, this.M.line); this.addCircle(x, z, 0.4); };
    prop(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 10).translate(0, 0.4, 0), toon('#9a6438', { map: TX.plank }), x1 + 0.6, z1 - 0.6);
    prop(boxUV(new THREE.BoxGeometry(0.7, 0.6, 0.6), 0.7, 0.6, 0.6, 1.5).translate(0, 0.3, 0), toon('#a8743f', { map: TX.plank }), x0 - 0.6, z1 - 0.5);

    // 门匾：店铺和人家的名字
    if (opt.name && !opt.player) {
      const tex = canvasTex(256, 72, (c, w, h) => {
        c.fillStyle = '#3a2416'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d6b670'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10);
        c.fillStyle = '#ffe7a8'; c.font = 'bold 40px "STKaiti","KaiTi","Noto Serif SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(opt.name, w / 2, h / 2 + 2);
      }, { pixel: false, repeat: false });
      const sign = mesh(new THREE.PlaneGeometry(1.6, 0.45), toon('#ffffff', { map: tex }), { cast: false });
      sign.position.set(cx, H + 0.05, z1 + T / 2 + 0.06); root.add(sign); hideWhenCut.push(sign);
    }
    this.houses.push({ id: opt.id, name: opt.name, x0, x1, z0, z1, cx, cz, wallsG, roof, roofMats, hideWhenCut, t: 0, door: { x: cx, z: z1 + 1.2 }, inside: { x: cx, z: cz + 0.6 }, player: !!opt.player });
  }

  // 铁匠铺门口的铁砧和炉子、村口茶摊、委托板
  buildVillageProps() {
    const line = this.M.line, stoneM = toon('#9a948e', { occ: true, map: this.T.stone }), woodM = toon('#8a5a34', { occ: true, map: this.T.plank });
    const smithy = this.houses.find((h) => h.id === 'smithy');
    if (smithy) {
      const x = smithy.x0 - 1.4, z = smithy.z1 - 1.2, g = new THREE.Group();
      g.add(at(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4).translate(0, 0.25, 0), toon('#5a3a26')), 0, 0, 0));
      g.add(at(mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4).translate(0, 0.61, 0), toon('#4a4e58')), 0, 0, 0));
      g.add(at(mesh(new THREE.ConeGeometry(0.11, 0.4, 6).rotateZ(Math.PI / 2).translate(0.62, 0.61, 0), toon('#4a4e58')), 0, 0, 0));
      g.position.set(x, 0, z); addOutline(g, line); this.scene.add(g); this.addCircle(x, z, 0.5);
      const f = new THREE.Group(), fx = smithy.x0 - 1.4, fz = smithy.z0 + 1.6;
      f.add(mesh(boxUV(new THREE.BoxGeometry(1.4, 1.0, 1.2), 1.4, 1, 1.2, 1.4).translate(0, 0.5, 0), stoneM));
      const coal = mesh(new THREE.BoxGeometry(1.0, 0.1, 0.8), glow('#ff6a2a', 3, true), { cast: false }); coal.position.y = 1.02; f.add(coal);
      f.add(at(mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8).translate(0, 1.8, 0), stoneM), 0.3, 0, -0.3));
      f.position.set(fx, 0, fz); addOutline(f, line); this.scene.add(f); this.addBox(fx - 0.75, fz - 0.65, fx + 0.75, fz + 0.65);
      this.addEmitter(fx, 1.4, fz, '#ff8a3a', 1.2, 'torch', coal);
      this.anvil = { x: x + 0.9, z };
    }
    if (STALL) {
      const { x, z } = STALL, g = new THREE.Group();
      g.add(mesh(boxUV(new THREE.BoxGeometry(1.8, 0.1, 1.0), 1.8, 0.1, 1, 1.5).translate(0, 0.8, 0), woodM));
      for (const [a, b] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) g.add(at(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1).translate(0, 0.4, 0), woodM), a, 0, b));
      for (const s of [-1, 1]) g.add(at(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.45, 8).translate(0, 0.22, 0), woodM), s * 1.4, 0, 0.6));
      g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), woodM), 0, 0, 0));
      g.add(at(mesh(new THREE.ConeGeometry(1.8, 0.7, 10).translate(0, 2.7, 0), toon('#c94f4f', { occ: true })), 0, 0, 0));
      g.add(at(mesh(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.8, 1), toon('#e8e0d0')), 0.4, 0.95, 0));
      for (let i = 0; i < 3; i++) g.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 8), toon('#f0ece0')), -0.5 + i * 0.25, 0.9, 0.15));
      const lan = mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.2, 1), glow('#ff4a2a', 1.8, true), { cast: false }); lan.position.set(1.1, 2.1, 0); g.add(lan);
      g.position.set(x, 0, z); addOutline(g, line); this.scene.add(g);
      this.addBox(x - 0.95, z - 0.55, x + 0.95, z + 0.55);
      this.addEmitter(x + 1.1, 2.1, z, '#ff7a4a', 0.8, 'lantern', lan);
      this.stall = { x, z: z + 1.4 };
    }
    // 委托板：两根柱子 + 木板 + 小瓦顶，上面钉着几张纸
    {
      const { x, z } = BOARD, g = new THREE.Group();
      for (const s of [-1, 1]) g.add(at(mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14).translate(0, 1.1, 0), woodM), s * 0.85, 0, 0));
      g.add(at(mesh(boxUV(new THREE.BoxGeometry(1.7, 1.0, 0.08), 1.7, 1, 0.08, 1.5), woodM), 0, 1.4, 0));
      const notes = [[-0.5, 1.6, 0.04], [0.1, 1.5, -0.08], [0.55, 1.65, 0.1], [-0.2, 1.15, 0.06], [0.45, 1.15, -0.05]];
      for (const [a, b, r] of notes) { const n = mesh(new THREE.PlaneGeometry(0.34, 0.42), toon('#f2ead2'), { cast: false }); n.position.set(a, b, 0.05); n.rotation.z = r; g.add(n); }
      const roof = this.gableRoof(2.1, 0.7, 0.3, toon('#5a6070', { occ: true, map: this.T.tile }), toon('#3a3e48', { occ: true }));
      roof.position.y = 2.15; g.add(roof);
      g.position.set(x, 0, z); addOutline(g, line); this.scene.add(g);
      this.addBox(x - 1, z - 0.2, x + 1, z + 0.2);
      this.board = { x, z: z + 1.2 };
    }
  }

  // ---------- 池塘：带噪声轮廓的水面 + 石岸 + 小码头 ----------
  waterGeo(cx, cz, rFn, y = 0.03) {
    const N = 48, pos = [], edge = [], idx = [];
    pos.push(cx, y, cz); edge.push(0);
    for (const k of [0.55, 1]) for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, r = rFn(a) * k;
      pos.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); edge.push(k);
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      idx.push(0, 1 + j, 1 + i);
      idx.push(1 + i, 1 + j, 1 + N + i, 1 + j, 1 + N + j, 1 + N + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    return g;
  }

  buildPond() {
    const P = POND;
    const g = this.waterGeo(P.x, P.z, pondR);
    this.water = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uLight: { value: 1 } },
      vertexShader: `attribute float edge; varying float vEdge; varying vec2 vW;
        void main() { vEdge = edge; vW = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uLight; varying float vEdge; varying vec2 vW;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 px = floor(vW * 8.0);
          vec3 deep = vec3(0.10, 0.36, 0.72), mid = vec3(0.20, 0.58, 0.88), rim = vec3(0.50, 0.84, 0.95);
          float e = vEdge + (h(px) - 0.5) * 0.06;
          vec3 c = mix(deep, mid, smoothstep(0.2, 0.75, e));
          c = mix(c, rim, smoothstep(0.86, 0.97, e));
          float w = sin(vW.x * 1.7 + uTime * 1.3) + sin(vW.y * 2.3 - uTime * 1.1) + sin((vW.x + vW.y) * 1.1 + uTime * 0.7);
          float band = step(2.55, w) * step(0.55, h(floor(vW * vec2(3.0, 8.0))));
          c = mix(c, vec3(0.80, 0.94, 1.0), band * 0.55);
          float sp = step(0.985, h(px + floor(uTime * 2.0)));
          c += sp * 0.5;
          if (e > 0.985) c = vec3(0.92, 0.98, 1.0);
          gl_FragColor = vec4(pow(c, vec3(2.2)) * uLight, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const w = new THREE.Mesh(g, this.water); w.receiveShadow = false; this.scene.add(w);
    // 碰撞：池子内部不可走
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, r = pondR(a) * 0.62;
      this.addCircle(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, pondR(a) * 0.42);
    }
    this.addCircle(P.x, P.z, P.r * 0.6);
    // 石岸
    const rng = mulberry32(42), rocks = [];
    for (let a = 0; a < Math.PI * 2; a += 0.32 + rng() * 0.2) {
      if (Math.abs(angDiff(a, Math.PI * 0.25)) < 0.35) continue; // 码头处留空
      const r = pondR(a) + 0.15, s = 0.42 + rng() * 0.3;
      rocks.push({ x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r, s, sy: s * 0.7, rot: rng() * 6, c: rng() < 0.5 ? '#b0aba4' : '#9a958f' });
    }
    this.scene.add(inst(this.G.rock, this.M.rock, rocks, true, this.M.line));
    // 荷叶
    const pads = [];
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, r = pondR(a) * (0.35 + rng() * 0.45);
      pads.push({ x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r, s: 0.7 + rng() * 0.5, rot: rng() * 6, c: i % 3 ? '#4f9e3e' : '#6cb84a' });
    }
    const padG = new THREE.CircleGeometry(0.32, 10, 0.4, Math.PI * 1.8).rotateX(-Math.PI / 2).translate(0, 0.06, 0);
    this.scene.add(inst(padG, toon('#ffffff'), pads, false));
    const lotus = pads.filter((_, i) => i % 2 === 0).map((p) => ({ ...p, s: 1, c: '#ff9ec4' }));
    const lotusG = mergeGeometries([0, 1, 2, 3, 4].map((i) => new THREE.ConeGeometry(0.09, 0.3, 4).translate(0, 0.15, 0).rotateZ(0.45).rotateY(i * 1.256).toNonIndexed()).concat([new THREE.IcosahedronGeometry(0.07, 1)]));
    lotusG.translate(0, 0.1, 0);
    this.scene.add(inst(lotusG, toon('#ffffff'), lotus, false, this.M.line));
    // 木码头（朝向村子一侧）
    const a = Math.PI * 0.25, ex = P.x + Math.cos(a) * pondR(a), ez = P.z + Math.sin(a) * pondR(a);
    const dock = new THREE.Group();
    const plankM = toon('#a8743f', { map: this.T.plank });
    for (let i = 0; i < 6; i++) {
      const pl = mesh(boxUV(new THREE.BoxGeometry(1.6, 0.1, 0.38), 1.6, 0.1, 0.38, 1.5), plankM, { recv: true });
      pl.position.set(0, 0.32, -i * 0.42 + 0.6); dock.add(pl);
    }
    for (const [px2, pz2] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -1.5], [0.7, -1.5]]) dock.add(at(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6).translate(0, 0.25, 0), toon('#6b4a2e')), px2, 0, pz2));
    addOutline(dock, this.M.line);
    dock.position.set(ex, 0, ez); dock.rotation.y = -a - Math.PI / 2 + Math.PI;
    this.scene.add(dock);
  }

  // ---------- 仙山石峰 + 瀑布 + 小潭 + 水车 ----------
  peakGeo(h, r, seed) {
    const pts = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = t * h;
      let rr = r * (1 - 0.32 * t) * (1 + (vnoise(i * 0.8, 0, seed) - 0.5) * 0.35);
      if (t > 0.85) rr *= Math.sqrt(Math.max(0, (1 - t) / 0.15)) * 0.8 + 0.2;
      pts.push(new THREE.Vector2(Math.max(0.05, rr), y));
    }
    const g = new THREE.LatheGeometry(pts, 14);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), a = Math.atan2(z, x);
      const d = 1 + (vnoise(a * 2.2 + seed, y * 0.6, seed) - 0.5) * 0.4;
      p.setXYZ(k, x * d, y, z * d);
    }
    g.computeVertexNormals();
    const nr = g.attributes.normal;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), a = Math.atan2(p.getZ(k), p.getX(k));
      // 横向岩层：每层明暗不同，层缝更暗；朝上的台面长青苔
      const yy = y / 0.75 + Math.sin(a * 3 + seed) * 0.25, band = hash01(Math.floor(yy), 0, seed);
      let v = 0.62 + band * 0.22 + smooth(0, h, y) * 0.1;
      if (yy - Math.floor(yy) < 0.18) v *= 0.72;
      let c = [v * 0.95, v * 0.95, v];
      const moss = smooth(0.25, 0.55, nr.getY(k)) * (0.6 + 0.4 * vnoise(a * 4, y, seed + 5));
      c = [c[0] + (0.42 - c[0]) * moss, c[1] + (0.62 - c[1]) * moss, c[2] + (0.3 - c[2]) * moss];
      col[k * 3] = c[0] ** 2.2; col[k * 3 + 1] = c[1] ** 2.2; col[k * 3 + 2] = c[2] ** 2.2; // sRGB → 线性
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // 岩壁贴图：绕一圈整数次平铺，避免接缝
    const uv = g.attributes.uv, ru = Math.max(2, Math.round(2 * Math.PI * r / 3.2));
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * ru, uv.getY(k) * h / 3.2);
    return g;
  }

  buildPeaks() {
    const rockM = toon('#ffffff', { occ: true, vc: true, map: PNG.cliff_rock || null });
    const caps = [], pines = [], foot = [];
    PEAKS.forEach(([x, z, h, r], i) => {
      const m = mesh(this.peakGeo(h, r, i * 13 + 1), rockM, { recv: true });
      m.position.set(x, 0, z); m.rotation.y = i * 1.7;
      addOutline(m, this.M.line);
      this.scene.add(m);
      this.addCircle(x, z, r * 0.95);
      // 峰顶青苔 + 小松
      caps.push({ x, y: h * 0.93, z, s: r * 0.55, sy: r * 0.4, rot: i, c: '#5f9e3e' });
      const rng = mulberry32(i + 70);
      for (let k = 0; k < 2 + (i % 2); k++) pines.push({ x: x + (rng() - 0.5) * r * 0.6, z: z + (rng() - 0.5) * r * 0.6, s: 0.4 + rng() * 0.2, rot: rng() * 6, c: PINE[k % 3], y: h * 0.95 });
      // 山脚碎石
      for (let k = 0; k < 3; k++) {
        const a = rng() * 6.28;
        foot.push({ x: x + Math.cos(a) * (r + 0.3), z: z + Math.sin(a) * (r + 0.3), s: 0.5 + rng() * 0.5, sy: 0.4 + rng() * 0.3, rot: rng() * 6, c: '#a8a296' });
      }
    });
    this.scene.add(...this.leafClump('bush', caps).filter(Boolean), inst(this.G.pine, this.M.leafy, pines, true, this.M.leafLine), inst(this.G.rock, this.M.rock, foot, true, this.M.line));

    // 瀑布：竖直水帘，像素条纹向下流
    const B = BASIN, top = 6.2;
    const fg = new THREE.PlaneGeometry(1.5, top, 1, 10);
    const fp = fg.attributes.position;
    for (let k = 0; k < fp.count; k++) { const t = (fp.getY(k) + top / 2) / top; fp.setZ(k, 0.5 * t * t); }
    fg.translate(0, top / 2, 0);
    this.fall = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uLight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uLight; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 px = floor(vUv * vec2(10.0, 40.0));
          float sp = 0.9 + h(vec2(px.x, 3.0)) * 0.8;
          float v = fract((px.y / 40.0) * 3.0 + uTime * sp + h(vec2(px.x, 7.0)));
          vec3 c = mix(vec3(0.42, 0.74, 0.92), vec3(0.75, 0.92, 1.0), step(0.55, v));
          c = mix(c, vec3(1.0), step(0.86, v));
          float ex = min(vUv.x, 1.0 - vUv.x);
          if (ex < 0.1) c = mix(c, vec3(1.0), 0.6);
          if (vUv.y < 0.08 || vUv.y > 0.96) c = vec3(1.0);
          float a = ex < 0.05 && h(px + floor(uTime * 6.0)) > 0.5 ? 0.0 : 0.95;
          gl_FragColor = vec4(pow(c, vec3(2.2)) * uLight, a);
        }`,
    });
    const fall = new THREE.Mesh(fg, this.fall);
    fall.position.set(B.x, 0, B.z - B.r + 0.05 - 0.3); fall.rotation.y = 0;
    this.scene.add(fall);
    // 小潭 + 溪流（复用池塘水面材质）
    const br = (a) => B.r * (1 + 0.1 * Math.sin(a * 3 + 0.5));
    this.scene.add(new THREE.Mesh(this.waterGeo(B.x, B.z, br, 0.032), this.water));
    const [sx, sz, ex2, ez] = STREAM, L = Math.hypot(ex2 - sx, ez - sz), nx = -(ez - sz) / L, nz = (ex2 - sx) / L;
    const sp = [], se = [], si = [], SEG = 8;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, cx = sx + (ex2 - sx) * t + Math.sin(t * 3.1) * 0.25 * nx, cz = sz + (ez - sz) * t + Math.sin(t * 3.1) * 0.25 * nz, w = 0.7 + 0.15 * Math.sin(t * 5);
      for (const k of [-1, 0, 1]) { sp.push(cx + nx * w * k, 0.031, cz + nz * w * k); se.push(k === 0 ? 0.5 : 1); }
      if (i < SEG) { const a = i * 3; si.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('edge', new THREE.Float32BufferAttribute(se, 1));
    sg.setIndex(si);
    const stream = new THREE.Mesh(sg, this.water); this.scene.add(stream);
    this.addCircle(B.x, B.z, B.r * 0.75);
    // 潭边石头 + 落水处白沫
    const rng = mulberry32(9), rocks = [];
    for (let a = 0; a < Math.PI * 2; a += 0.55 + rng() * 0.3) {
      if (Math.abs(angDiff(a, Math.PI / 2)) < 0.5 || Math.abs(angDiff(a, 0)) < 0.45) continue; // 溪口、水车处留空
      rocks.push({ x: B.x + Math.cos(a) * (br(a) + 0.15), z: B.z + Math.sin(a) * (br(a) + 0.15), s: 0.38 + rng() * 0.25, sy: 0.3, rot: rng() * 6, c: '#b0aba4' });
    }
    this.scene.add(inst(this.G.rock, this.M.rock, rocks, true, this.M.line));
    this.foam = [];
    for (let i = 0; i < 4; i++) {
      const f = mesh(new THREE.SphereGeometry(0.3, 10, 6).scale(1, 0.35, 1), toon('#ffffff'), { cast: false });
      f.position.set(B.x + (i - 1.5) * 0.35, 0.08, B.z - B.r + 0.6); this.scene.add(f); this.foam.push(f);
    }

    // 水车：轮子一半浸在小潭东侧
    const wood = toon('#9a6a3c'), dark = toon('#6b4a2e');
    const wheel = new THREE.Group();
    for (const zz of [-0.28, 0.28]) wheel.add(at(mesh(new THREE.TorusGeometry(1.25, 0.07, 6, 20), wood), 0, 0, zz));
    for (let i = 0; i < 6; i++) { const sk = mesh(new THREE.BoxGeometry(2.5, 0.09, 0.09), wood); sk.rotation.z = i / 6 * Math.PI; for (const zz of [-0.28, 0.28]) wheel.add(at(sk.clone(), 0, 0, zz)); }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, pd = mesh(new THREE.BoxGeometry(0.4, 0.07, 0.7), dark);
      pd.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0); pd.rotation.z = a; wheel.add(pd);
    }
    wheel.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8).rotateX(Math.PI / 2), dark));
    addOutline(wheel, this.M.line);
    const wx = B.x + B.r + 0.4, wz = B.z;
    wheel.position.set(wx, 1.05, wz);
    this.scene.add(wheel); this.wheel = wheel;
    const sup = new THREE.Group();
    for (const dz of [-0.6, 0.6]) sup.add(at(mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16).translate(0, 0.65, 0), dark), wx, 0, wz + dz));
    addOutline(sup, this.M.line); this.scene.add(sup);
    this.addCircle(wx, wz, 0.9);
    // 磨坊小屋：茅草顶
    const hx = wx + 2.0, hz = wz - 0.2;
    const hut = new THREE.Group();
    hut.add(mesh(boxUV(new THREE.BoxGeometry(2.0, 1.5, 1.8), 2.0, 1.5, 1.8, 1.6).translate(0, 0.75, 0), toon('#b88450', { occ: true, map: this.T.plank }), { recv: true }));
    hut.add(mesh(new THREE.ConeGeometry(1.75, 1.2, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.95).translate(0, 2.05, 0), toon('#d8b060', { occ: true })));
    hut.add(at(mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), dark), 0, 0.5, 0.92));
    addOutline(hut, this.M.line);
    hut.position.set(hx, 0, hz); this.scene.add(hut);
    this.addBox(hx - 1, hz - 0.9, hx + 1, hz + 0.9);
  }

  // ---------- 云雾：高空飘云 + 山脚薄雾 ----------
  initSky() {
    const puff = canvasTex(96, 64, (ctx) => {
      const r = mulberry32(3);
      for (let i = 0; i < 9; i++) {
        const x = 20 + r() * 56, y = 24 + r() * 18, rr = 12 + r() * 14;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.6, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 64);
      }
    }, { pixel: false, repeat: false });
    const rng = mulberry32(11);
    this.clouds = [];
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0 }));
      const k = 9 + rng() * 9; sp.scale.set(k, k * 0.62, 1);
      sp.position.set((rng() - 0.5) * 80, 7.5 + rng() * 4, (rng() - 0.5) * 80);
      sp.userData.v = 0.35 + rng() * 0.5; sp.renderOrder = 5;
      this.scene.add(sp); this.clouds.push(sp);
    }
    this.mist = [];
    const spots = PEAKS.map(([x, z, , r]) => [x, z + r * 0.6]).concat([[BASIN.x, BASIN.z - 0.6], [BASIN.x + 0.6, BASIN.z - 0.8]]);
    spots.forEach(([x, z], i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.4 }));
      const k = i >= PEAKS.length ? 2.4 : 4 + rng() * 3; sp.scale.set(k, k * 0.55, 1);
      sp.position.set(x, i >= PEAKS.length ? 0.7 : 0.9 + rng() * 1.5, z);
      sp.userData = { x, y: sp.position.y, ph: rng() * 6, spray: i >= PEAKS.length };
      this.scene.add(sp); this.mist.push(sp);
    });
  }

  updateSky(dt, p, nightK) {
    const t = this.time, dim = 1 - nightK * 0.65, under = 1 - this.mineFactor;
    for (const c of this.clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x - p.x > 40) c.position.x -= 80; else if (c.position.x - p.x < -40) c.position.x += 80;
      if (c.position.z - p.z > 40) c.position.z -= 80; else if (c.position.z - p.z < -40) c.position.z += 80;
      // 玩家附近淡出，不挡视线；远处才看得到云
      const d = Math.hypot(c.position.x - p.x, c.position.z - 6 - p.z);
      c.material.opacity = 0.6 * smooth(8, 17, d) * under;
      c.material.color.setScalar(dim);
    }
    for (const m of this.mist) {
      const u = m.userData;
      m.position.x = u.x + Math.sin(t * 0.3 + u.ph) * 0.6;
      m.position.y = u.y + (u.spray ? Math.abs(Math.sin(t * 3 + u.ph)) * 0.3 : 0);
      m.material.opacity = (u.spray ? 0.5 + Math.sin(t * 5 + u.ph) * 0.2 : 0.32 + Math.sin(t * 0.5 + u.ph) * 0.1) * under;
      m.material.color.setScalar(dim);
    }
    if (this.foam) this.foam.forEach((f, i) => { const k = 0.8 + 0.3 * Math.sin(t * 6 + i * 1.7); f.scale.set(k, 1, k); });
  }

  // ---------- 预制件：玄晶矿洞（平地 + 石墙 + 灯光） ----------
  buildMine() {
    const rng = mulberry32(777);
    const walls = [];
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      if (Math.abs(angDiff(a, MINE_ANG)) < 0.17) continue;
      for (let layer = 0; layer < 3; layer++) {
        const r = MINE_R + 1 + layer * 2.6 + rng() * 1.2;
        const x = MINE.x + Math.cos(a) * r, z = MINE.y + Math.sin(a) * r;
        const s = 2 + rng() * 1.4;
        const c = ['#4a4656', '#3e3a4a', '#55506a'][Math.floor(rng() * 3)];
        walls.push({ x, z, s, sy: s * (1.0 + layer * 0.6 + rng() * 0.6), rot: rng() * 6.28, c });
        if (layer === 0) this.addCircle(x, z, 0.62 * s);
      }
    }
    this.scene.add(inst(this.G.rock, this.M.rock, walls, true, this.M.line));

    // 入口木门框 + 火把
    const perp = new THREE.Vector2(-Math.sin(MINE_ANG), Math.cos(MINE_ANG));
    const G0 = MINE_GATE;
    const wood = toon('#6b4a32', { occ: true });
    for (const s of [-1, 1]) {
      const px = G0.x + perp.x * 3.2 * s, pz = G0.y + perp.y * 3.2 * s;
      this.scene.add(at(mesh(new THREE.BoxGeometry(0.4, 3.4, 0.4).translate(0, 1.7, 0), wood), px, 0, pz));
      this.addCircle(px, pz, 0.35);
      this.torch(G0.x + perp.x * 2.4 * s + Math.cos(MINE_ANG) * 0.6, G0.y + perp.y * 2.4 * s + Math.sin(MINE_ANG) * 0.6);
    }
    const beam = mesh(new THREE.BoxGeometry(7.2, 0.45, 0.45), wood);
    beam.position.set(G0.x, 3.3, G0.y); beam.rotation.y = -MINE_ANG - Math.PI / 2;
    this.scene.add(beam);

    const inMine = () => {
      for (let tries = 0; tries < 50; tries++) {
        const a = rng() * Math.PI * 2, r = 4 + rng() * (MINE_R - 7);
        const x = MINE.x + Math.cos(a) * r, z = MINE.y + Math.sin(a) * r;
        if (Math.abs(angDiff(a, MINE_ANG)) < 0.5 && r > MINE_R - 10) continue;
        if (Math.hypot(x - ARENA.x, z - ARENA.y) < 9.5) continue;
        return [x, z];
      }
      return [MINE.x, MINE.y];
    };
    // 石笋
    const spikes = [];
    for (let i = 0; i < 14; i++) {
      const [x, z] = inMine(); const s = 0.6 + rng() * 0.8;
      spikes.push({ x, z, s, sy: s * (0.8 + rng()), rot: rng() * 6, c: '#5a5468' });
      this.addCircle(x, z, 0.5 * s);
    }
    this.scene.add(inst(this.G.spike, this.M.rock, spikes));
    // 晶簇（自带光）
    const crystalCols = ['#9b6bff', '#5ad8ff', '#c06bff'];
    for (let i = 0; i < 9; i++) {
      const [x, z] = inMine();
      const c = crystalCols[i % 3];
      const g = new THREE.Group(); const gm = glow(c, 2.6, true);
      for (let j = 0; j < 3; j++) {
        const m = mesh(this.G.shard, gm, { cast: false });
        m.scale.set(0.6, 1.4 + rng() * 1.2, 0.6);
        m.position.set((rng() - 0.5) * 0.8, 0.5, (rng() - 0.5) * 0.8);
        m.rotation.set((rng() - 0.5) * 0.6, rng() * 3, (rng() - 0.5) * 0.6);
        g.add(m);
      }
      g.position.set(x, 0, z); this.scene.add(g);
      this.addCircle(x, z, 0.7);
      this.addEmitter(x, 1.2, z, c, 0.9, 'crystal', g.children[0]);
    }
    // 矿脉（可开采）
    const oreRock = toon('#6a6474', { occ: true });
    for (let i = 0; i < 9; i++) {
      const [x, z] = inMine();
      const g = new THREE.Group();
      const b = mesh(this.G.rock, oreRock); b.scale.set(1.3, 1.1, 1.3); g.add(b);
      const gm = glow(i % 2 ? '#7fe3ff' : '#ffd36b', 2.2);
      for (let j = 0; j < 4; j++) {
        const m = mesh(this.G.shard, gm, { cast: false }); m.scale.setScalar(0.35);
        m.position.set(Math.cos(j * 1.6) * 0.6, 0.5 + (j % 2) * 0.3, Math.sin(j * 1.6) * 0.6); g.add(m);
      }
      g.position.set(x, 0, z); this.scene.add(g);
      const colr = this.addCircle(x, z, 0.85);
      this.ores.push({ x, z, r: 0.85, hp: 3, alive: true, group: g, col: colr, respawn: 0 });
    }
    // 矿洞内火把
    for (let i = 0; i < 5; i++) {
      const a = MINE_ANG + Math.PI + (i - 2) * 0.9; const r = MINE_R - 2.2;
      this.torch(MINE.x + Math.cos(a) * r, MINE.y + Math.sin(a) * r);
    }
    // 妖王祭坛
    const ring = mesh(new THREE.RingGeometry(7.2, 7.6, 40).rotateX(-Math.PI / 2), glow('#ff3a1a', 1.6), { cast: false });
    ring.position.set(ARENA.x, 0.03, ARENA.y); this.scene.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3;
      const x = ARENA.x + Math.cos(a) * 8.6, z = ARENA.y + Math.sin(a) * 8.6;
      this.scene.add(at(mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7).translate(0, 1.1, 0), toon('#3a3240', { occ: true })), x, 0, z));
      const top = mesh(this.G.shard, glow('#ff4a2a', 2.6), { cast: false }); top.position.set(x, 2.6, z); top.scale.setScalar(0.6); this.scene.add(top);
      this.addCircle(x, z, 0.5);
    }
    this.addEmitter(ARENA.x, 1.5, ARENA.y, '#ff5a2a', 1.2, 'crystal', null);
  }

  torch(x, z) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 5).translate(0, 0.8, 0), toon('#4a3020')));
    const f = mesh(flat(new THREE.OctahedronGeometry(0.18, 0)), glow('#ffb347', 3.2, true), { cast: false });
    f.position.y = 1.75; f.scale.y = 1.6; g.add(f);
    g.position.set(x, 0, z); this.scene.add(g);
    this.addCircle(x, z, 0.15);
    this.addEmitter(x, 1.9, z, '#ff9a40', 1.1, 'torch', f);
  }
}

// ---------- 工具 ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function inst(geo, mat, list, cast = true, line = null) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((o, i) => {
    _e.set(0, o.rot || 0, 0); _q.setFromEuler(_e);
    _s.set(o.s, o.sy ?? o.s, o.s); _p.set(o.x, o.y || 0, o.z);
    _m4.compose(_p, _q, _s); im.setMatrixAt(i, _m4);
    if (o.c) im.setColorAt(i, _c.set(o.c));
  });
  im.castShadow = cast; im.receiveShadow = true;
  im.computeBoundingSphere();
  if (line) addOutline(im, line);
  return im;
}

function pushCircle(p, r, c) {
  if (c.off) return;
  const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r;
  if (Math.abs(dx) > rr || Math.abs(dz) > rr) return;
  const d2 = dx * dx + dz * dz;
  if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; }
}
function pushBox(p, r, b) {
  const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 > 1e-9) {
    if (d2 < r * r) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
  } else {
    const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rr, t, bt);
    if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
  }
}
