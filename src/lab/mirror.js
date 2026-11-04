// 水面倒影（实验）：把“只有角色”的画面从镜像相机再渲一遍到小贴图里，水面着色器按屏幕投影采样 + 用涟漪法线扰动。
// 云倒影不走这里——那是水面着色器里直接用反射方向算出来的假云。
import * as THREE from 'three';

export function createMirror(renderer, camera) {
  const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
  const cam = new THREE.PerspectiveCamera();
  cam.layers.set(1); // 只渲第 1 层：角色 + 灯光（灯光也要开第 1 层才会照亮）
  const texM = new THREE.Matrix4(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const n = new THREE.Vector3(0, 1, 0), rp = new THREE.Vector3(), cp = new THREE.Vector3(), v = new THREE.Vector3(), la = new THREE.Vector3(), tg = new THREE.Vector3(), rot = new THREE.Matrix4();
  const cc = new THREE.Color();
  function resize(w, h, pr) { rt.setSize(Math.max(64, Math.round(w * pr * 0.5)), Math.max(64, Math.round(h * pr * 0.5))); }
  // level：水面高度。scene：整个场景。
  function render(scene, level) {
    rp.set(0, level, 0); cp.setFromMatrixPosition(camera.matrixWorld);
    v.subVectors(rp, cp).reflect(n).negate().add(rp);
    rot.extractRotation(camera.matrixWorld);
    la.set(0, 0, -1).applyMatrix4(rot).add(cp);
    tg.subVectors(rp, la).reflect(n).negate().add(rp);
    cam.position.copy(v);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
    cam.lookAt(tg);
    cam.near = camera.near; cam.far = camera.far; cam.fov = camera.fov; cam.aspect = camera.aspect;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    texM.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texM.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // 水面以下的部分（游泳时身体在水里）不进倒影
    plane.constant = -level;
    const prevRT = renderer.getRenderTarget(), prevA = renderer.getClearAlpha(), prevAuto = renderer.shadowMap.autoUpdate, prevClip = renderer.clippingPlanes;
    renderer.getClearColor(cc);
    renderer.shadowMap.autoUpdate = false; renderer.clippingPlanes = [plane];
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, prevA);
    renderer.shadowMap.autoUpdate = prevAuto; renderer.clippingPlanes = prevClip;
  }
  return { rt, texM, render, resize };
}
