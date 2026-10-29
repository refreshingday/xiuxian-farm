import * as THREE from 'three';
import { weatherU, approach, clamp } from './util.js';

// 下雨：随机开始/结束；雨丝是围着玩家循环的线段（全在着色器里动，CPU 不用更新）
const N = 1600, BOX = 34, HGT = 16;

export class Weather {
  constructor(scene) {
    const pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * BOX, y = Math.random() * HGT, z = Math.random() * BOX;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uRain: { value: 0 }, uSnowF: { value: 0 } },
      vertexShader: `
        attribute float aEnd;
        uniform float uTime, uRain, uSnowF;
        uniform vec3 uFocus;
        varying float vA;
        void main() {
          float y = mod(position.y - uTime * mix(22.0, 2.4, uSnowF), ${HGT.toFixed(1)});
          vec3 o = uFocus - vec3(${(BOX / 2).toFixed(1)}, 0.0, ${(BOX / 2).toFixed(1)});
          vec3 w = vec3(o.x + mod(position.x - o.x, ${BOX.toFixed(1)}), y, o.z + mod(position.z - o.z, ${BOX.toFixed(1)}));
          w += mix(vec3(0.1, 0.75, 0.0), vec3(0.06, 0.07, 0.05), uSnowF) * aEnd;
          w.x += sin(uTime * 1.3 + position.z * 3.0) * 0.5 * uSnowF; // 雪花左右飘
          vA = uRain * mix(0.25 + 0.3 * aEnd, 0.85, uSnowF) * smoothstep(0.0, 1.5, y);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `
        varying float vA;
        uniform float uSnowF;
        void main() { gl_FragColor = vec4(mix(vec3(0.78, 0.85, 0.96), vec3(1.0), uSnowF), vA); }`,
    });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false; this.lines.visible = false;
    scene.add(this.lines);
    this.raining = false; this.dayRain = false;
    this.timer = 99; // 游戏内小时
    this.rain = 0; this.wet = 0;
  }

  toggle() {
    this.raining = this.dayRain = !this.raining;
    this.timer = this.raining ? 3 : 8;
    return this.raining;
  }
  // 当天天气（calendar.rollWeather）：雨天大部分时间在下，中间偶尔停一会儿；晴天不下
  setDay(rain) { this.dayRain = this.raining = rain; this.timer = rain ? 3 + Math.random() * 5 : 99; }

  // dh：本帧经过的游戏内小时；m：矿洞程度（矿洞里没雨）
  update(dt, dh, focus, time, m) {
    this.timer -= dh;
    if (this.timer <= 0 && this.dayRain) {
      this.raining = !this.raining;
      this.timer = this.raining ? 3 + Math.random() * 5 : 0.5 + Math.random();
    }
    this.rain = approach(this.rain, this.raining ? 1 : 0, dt * 0.3);
    // 下雨约 40 分钟（游戏内）湿透，停雨后约 3 小时晾干
    this.wet = clamp(this.wet + (this.rain > 0.3 ? dh * 1.5 : -dh * 0.35), 0, 1);
    const r = this.rain * (1 - m);
    this.mat.uniforms.uRain.value = r;
    this.mat.uniforms.uSnowF.value = weatherU.snow.value > 0.3 ? 1 : 0; // 冬天下的是雪
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uFocus.value.set(focus.x, 0, focus.z);
    this.lines.visible = r > 0.01;
    weatherU.rain.value = r;
    weatherU.wet.value = this.wet;
  }
}
