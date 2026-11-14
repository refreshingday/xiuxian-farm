// 主角站姿预览：左边正面，右边游戏镜头（fov 30、俯角 0.9 弧度、看向 y=1），
// 用的是游戏里同一套：createChibi 替身 + attachHeroModel + shoulderFix(SHOULDER)。
// 只是预览页，不改游戏本身。滑块直接改 SHOULDER 参数，方便对比垮肩。
import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { attachHeroModel } from './hero_model.js';
import { SHOULDER, SHOULDER_W, fixShoulderWeights } from './hero_shoulder.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; // 和游戏一致
renderer.shadowMap.enabled = true;
renderer.setScissorTest(true);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe6f0);
scene.add(new THREE.HemisphereLight(0xd8ecff, 0x9a8a50, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(6, 12, 8); sun.castShadow = true; scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7aa05a }));
ground.receiveShadow = true; scene.add(ground);

const c = createChibi({ skin: '#f8d8bc', hair: '#4a2e22', hairStyle: 2, robe: '#f2f4f6', robe2: '#4f7fb0', belt: '#3a5a78', pants: '#3a4250', sword: true });
scene.add(c.root);
const hero = attachHeroModel(c);

// 正面：远一点、几乎平视（真正的正面，看左右肩是不是平、是不是垮）
const camF = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
// 游戏镜头：和 main.js updateCamera 同一公式
const camG = new THREE.PerspectiveCamera(30, 1, 0.5, 140);

const $ = id => document.getElementById(id);
let dist = 9, yaw = 0, fix = true, guide = false;
const orig = { ...SHOULDER };
function place() {
  camF.position.set(0, 0.95, 7.6); camF.lookAt(0, 0.9, 0);
  const pitch = 0.9;
  camG.position.set(Math.sin(0) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(pitch) * dist); camG.lookAt(0, 1, 0);
}
function applyParams() {
  if (fix) Object.assign(SHOULDER, orig, { down: +$('sd').value, back: +$('sb').value, minOut: +$('sm').value });
  else Object.assign(SHOULDER, { down: 0, back: 0, up: 0, minOut: 0 });
  for (const [id, k] of [['sd', 'down'], ['sb', 'back'], ['sm', 'minOut']]) $(id).nextElementSibling.textContent = (+$(id).value).toFixed(2);
}
$('sd').value = orig.down; $('sb').value = orig.back; $('sm').value = orig.minOut;
['sd', 'sb', 'sm'].forEach(id => $(id).oninput = applyParams);
$('bFix').onclick = () => { fix = !fix; $('bFix').textContent = '方肩修正：' + (fix ? '开' : '关'); $('bFix').classList.toggle('on', fix); applyParams(); };
$('bGuide').onclick = () => { guide = !guide; $('bGuide').classList.toggle('on', guide); updGuide(); };
$('rDist').oninput = e => { dist = +e.target.value; $('vDist').textContent = dist; place(); };
$('rYaw').oninput = e => { yaw = +e.target.value; };
function updGuide() { // 正面视图里肩膀高度的水平参考线
  const g = $('g1'); g.style.display = guide ? 'block' : 'none';
  const y = new THREE.Vector3(0, 1.38, 0).project(camF); g.style.top = ((1 - y.y) / 2 * innerHeight) + 'px';
}
function resize() { renderer.setSize(innerWidth, innerHeight); camF.aspect = camG.aspect = (innerWidth / 2) / innerHeight; camF.updateProjectionMatrix(); camG.updateProjectionMatrix(); updGuide(); }
addEventListener('resize', resize); place(); applyParams(); resize();

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  c.rig.rotation.y = 0; c.root.rotation.y = yaw;
  animChibi(c, dt, { move: 0, attack: -1, combo: 0, cast: 0 }); // 站姿：不走、不出招
  if (hero.ready) hero.sync(c, dt, null, 0);
  const W = innerWidth, H = innerHeight, h = W / 2;
  renderer.setViewport(0, 0, h, H); renderer.setScissor(0, 0, h, H); renderer.render(scene, camF);
  renderer.setViewport(h, 0, W - h, H); renderer.setScissor(h, 0, W - h, H); renderer.render(scene, camG);
});
window.__prev = { SHOULDER, c, hero, camF, camG };

// 肩头权重（hero_shoulder.js fixShoulderWeights）：开关 + 范围 / 高度滑块，改了就重算
const wOrig = { ...SHOULDER_W }; let wOn = true;
$('wr').value = wOrig.reach; $('wt').value = wOrig.top0;
function rebuildW() {
  if (!c.shW || !c.heroModel) return;
  c.shW.set(false); c.heroModel.traverse(o => { if (o.isSkinnedMesh) { if (wOn) { Object.assign(SHOULDER_W, wOrig, { reach: +$('wr').value, top0: +$('wt').value }); c.shW = fixShoulderWeights(o); } else c.shW = { moved: 0, set() {} }; } });
  for (const id of ['wr', 'wt']) $(id).nextElementSibling.textContent = (+$(id).value).toFixed(3);
}
$('wr').oninput = $('wt').oninput = rebuildW;
$('bW').onclick = () => { wOn = !wOn; $('bW').textContent = '肩头权重：' + (wOn ? '开' : '关'); $('bW').classList.toggle('on', wOn); rebuildW(); };
hero.ready || setTimeout(function w() { hero.ready ? rebuildW() : setTimeout(w, 200); }, 200);
