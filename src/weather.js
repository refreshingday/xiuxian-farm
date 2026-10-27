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
      uniforms: { uTime: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uRain: { value: 0 } },
      vertexShader: `
        attribute float aEnd;
        uniform float uTime, uRain;
        uniform vec3 uFocus;
        varying float vA;
        void main() {
          float y = mod(position.y - uTime * 22.0, ${HGT.toFixed(1)});
          vec3 o = uFocus - vec3(${(BOX / 2).toFixed(1)}, 0.0, ${(BOX / 2).toFixed(1)});
          vec3 w = vec3(o.x + mod(position.x - o.x, ${BOX.toFixed(1)}), y, o.z + mod(position.z - o.z, ${BOX.toFixed(1)}));
          w += vec3(0.1, 0.75, 0.0) * aEnd;
          vA = uRain * (0.25 + 0.3 * aEnd) * smoothstep(0.0, 1.5, y);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `
        varying float vA;
        void main() { gl_FragColor = vec4(0.78, 0.85, 0.96, vA); }`,
    });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false; this.lines.visible = false;
    scene.add(this.lines);
    this.raining = false;
    this.timer = 4 + Math.random() * 8; // 游戏内小时
    this.rain = 0; this.wet = 0;
  }

  toggle() {
    this.raining = !this.raining;
    this.timer = this.raining ? 3 : 8;
    return this.raining;
  }

  // dh：本帧经过的游戏内小时；m：矿洞程度（矿洞里没雨）
  update(dt, dh, focus, time, m) {
    this.timer -= dh;
    if (this.timer <= 0) {
      if (this.raining) { this.raining = false; this.timer = 6 + Math.random() * 14; }
      else if (Math.random() < 0.45) { this.raining = true; this.timer = 1.5 + Math.random() * 3.5; }
      else this.timer = 3 + Math.random() * 8;
    }
    this.rain = approach(this.rain, this.raining ? 1 : 0, dt * 0.3);
    // 下雨约 40 分钟（游戏内）湿透，停雨后约 3 小时晾干
    this.wet = clamp(this.wet + (this.rain > 0.3 ? dh * 1.5 : -dh * 0.35), 0, 1);
    const r = this.rain * (1 - m);
    this.mat.uniforms.uRain.value = r;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uFocus.value.set(focus.x, 0, focus.z);
    this.lines.visible = r > 0.01;
    weatherU.rain.value = r;
    weatherU.wet.value = this.wet;
  }
}
