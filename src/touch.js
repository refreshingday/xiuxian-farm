// 触屏操作：左下虚拟摇杆移动，右下按钮出招，拖动画面转镜头
// 自动识别：初始按 (pointer: coarse) 判断；之后谁在用就切到谁——手指触屏切手机模式，鼠标移动切回电脑模式
// 地址栏 ?mobile=1 / ?mobile=0 可强制指定（不再自动切换）
const STICK_R = 52, DEAD = 0.15;

export class TouchControls {
  constructor() {
    this.stick = { x: 0, y: 0 };
    this.held = new Set();
    this.onChange = null;
    const q = new URLSearchParams(location.search).get('mobile');
    this.forced = q !== null;
    this.on = false;
    this.set(this.forced ? q !== '0' : matchMedia('(pointer: coarse)').matches);
    if (!this.forced) {
      addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.set(true); }, true);
      addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) this.set(false); }, true);
    }
    addEventListener('blur', () => this.reset());
    this.initStick();
  }
  set(on) {
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('mobile', on);
    this.reset();
    this.onChange?.(on);
  }
  reset() { this.stick.x = this.stick.y = 0; this.held.clear(); this.stickEnd?.(); }

  initStick() {
    const zone = document.createElement('div'); zone.id = 'stickZone';
    const base = document.createElement('div'); base.id = 'stick';
    const knob = document.createElement('i'); base.appendChild(knob);
    document.body.append(zone, base);
    let id = null, ox = 0, oy = 0;
    const home = () => { base.style.left = base.style.top = ''; base.classList.remove('live'); knob.style.transform = ''; };
    this.stickEnd = () => { id = null; this.stick.x = this.stick.y = 0; home(); };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault(); zone.setPointerCapture(e.pointerId);
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('live');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // 推过一半即满速，留一点死区防误触
      const r = Math.min(d, STICK_R) / STICK_R, mag = r < DEAD ? 0 : Math.min(1, (r - DEAD) / 0.45) / d;
      this.stick.x = (e.clientX - ox) * mag;
      this.stick.y = -(e.clientY - oy) * mag;
    });
    for (const t of ['pointerup', 'pointercancel']) zone.addEventListener(t, (e) => { if (e.pointerId === id) this.stickEnd(); });
  }

  // 按钮：down 按下时触发，up(cancelled) 松开时触发
  bind(el, { down, up, hold }) {
    let id = null;
    el.addEventListener('pointerdown', (e) => {
      if (!this.on || id !== null) return;
      e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      id = e.pointerId; el.classList.add('press');
      if (hold) this.held.add(hold);
      down?.();
    });
    const end = (cancelled) => (e) => {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove('press');
      if (hold) this.held.delete(hold);
      up?.(cancelled);
    };
    el.addEventListener('pointerup', end(false));
    el.addEventListener('pointercancel', end(true));
  }

  // 在画面上拖动：横向位移转镜头
  drag(el, fn) {
    let id = null, lx = 0;
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch' || id !== null) return; id = e.pointerId; lx = e.clientX; });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; fn(e.clientX - lx); lx = e.clientX; });
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (e) => { if (e.pointerId === id) id = null; });
  }
}
