import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TYPES, BOSSES, build } from './enemies.js';

// 妖兽图鉴：把 enemies.js 里所有妖兽（普通 + 妖王）摆成一排排，头顶标名字。只看妖兽，没有别的。
const ELEM_COL = { 金: '#ffd870', 木: '#8aff8a', 水: '#7ad8ff', 火: '#ff9a6a', 土: '#d8b078', 阴: '#c8a0ff', 雷: '#e8e0ff' };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4d8);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.5, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.05;
scene.add(new THREE.HemisphereLight(0xd8ecff, 0x9a8a50, 1.6));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); sun.position.set(20, 40, 25); scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const normal = Object.entries(TYPES).filter(([k]) => !BOSSES[k]);
const bosses = Object.entries(BOSSES);
const labelsEl = document.getElementById('labels');
const items = [], groups = {};

function layout(title, list, cols, gap, z0) {
  const rows = Math.ceil(list.length / cols);
  list.forEach(([id, T], i) => {
    const { root, parts } = build(T);
    const x = (i % cols - (cols - 1) / 2) * gap, z = z0 + Math.floor(i / cols) * gap;
    const wrap = new THREE.Group(); wrap.position.set(x, 0, z); wrap.rotation.y = 0.5; wrap.add(root); scene.add(wrap);
    const el = document.createElement('div'); el.className = 'lb' + (T.boss ? ' boss' : '');
    el.innerHTML = `<b>${T.name}</b><small style="color:${ELEM_COL[T.elem] || '#fff'}">${T.elem || ''} · ${id}${T.boss ? ' · 妖王' : ''}</small>`;
    labelsEl.appendChild(el);
    items.push({ id, T, wrap, parts, el, top: (T.h || 1.7) * (T.boss ? 1 : 1) + 0.3, phase: Math.random() * 6 });
  });
  groups[title] = { x: 0, z: z0 + (rows - 1) * gap / 2, w: cols * gap + gap, d: rows * gap + gap };
}
layout('普通妖兽', normal, 7, 4.5, 0);
const nRows = Math.ceil(normal.length / 7);
layout('妖王', bosses, 7, 11, nRows * 4.5 + 10);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7fae5a }));
ground.position.y = -0.01; scene.add(ground);
document.getElementById('cnt').textContent = `普通 ${normal.length} 种 · 妖王 ${bosses.length} 种`;

const btns = document.getElementById('btns');
function focus(g) {
  controls.target.set(g.x, 1, g.z);
  const th = Math.tan(camera.fov * Math.PI / 360), tilt = 1.0;
  const dist = Math.max(g.w / 2 / (th * camera.aspect), g.d / 2 / th / Math.sin(tilt)) * 1.1;
  camera.position.set(g.x, 1 + dist * Math.sin(tilt), g.z + dist * Math.cos(tilt));
}
for (const [name, g] of Object.entries(groups)) {
  const b = document.createElement('button'); b.textContent = name; b.onclick = () => focus(g); btns.append(b, ' ');
}
const all = document.createElement('button'); all.textContent = '全景';
all.onclick = () => focus({ x: 0, z: 28, w: 90, d: 70 }); btns.append(all);
focus(groups['普通妖兽']);

const v = new THREE.Vector3(), clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  controls.update();
  for (const it of items) {
    const { parts } = it, s = Math.sin(t * 2 + it.phase);
    parts.body.position.y = (parts.wings.length ? 0.15 + s * 0.15 : Math.abs(s) * 0.05);
    parts.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.sin(t * 8 + it.phase) * 0.5));
    parts.segs.forEach((g, i) => (g.position.x = Math.sin(t * 2 - i * 0.9 + it.phase) * 0.18 * (i / 5)));
    parts.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 3 + it.phase + (i % 2) * Math.PI) * 0.15));
    it.wrap.rotation.y += 0.004;
    v.set(it.wrap.position.x, it.top, it.wrap.position.z).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    it.el.style.display = vis ? '' : 'none';
    if (vis) it.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
  }
  renderer.render(scene, camera);
});
