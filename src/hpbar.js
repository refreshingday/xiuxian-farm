import * as THREE from 'three';

// 血条：DOM 绘制，不依赖场景，可直接搬进主游戏
// 层次（从下到上）：底槽 → 残影（受击后停顿再追落，连招期间累积成一整块）→ 实血 → 白闪 → 刻度
// 手感：受击白闪 + 横向抖动 + 轻微放大；残影上方显示本段累计伤害；低血量变红呼吸；满血闲置自动淡出；回血时亮绿先行、实血追上
const C = {
  fillK: 28,       // 实血追目标的速度（越大越跟手）
  hold: 0.55,      // 残影停顿时间，连招中每次命中都会重置
  trailK: 5,       // 残影追落速度（指数部分）
  trailMin: 0.25,  // 残影最小追落速度（每秒占满血比例），避免尾巴拖太久
  healK: 3.5,      // 回血时实血追上的速度
  idleHide: 2.2,   // 满血闲置多久后淡出
};
const col = (r) => (r > 0.5 ? '#5fe08e' : r > 0.25 ? '#ffd25a' : '#ff4d4d');

export class HealthBar {
  // opt: { parent, max, big, name, tick, alwaysShow }
  constructor(opt) {
    this.max = opt.max; this.hp = opt.max;
    this.fill = 1; this.trail = 1; this.holdT = 0; this.healing = false;
    this.flashT = 0; this.shakeA = 0; this.shakeT = 0; this.pop = 0;
    this.chip = 0; this.idle = 99; this.alpha = opt.alwaysShow ? 1 : 0; this.always = !!opt.alwaysShow;
    this.big = !!opt.big; this.dead = false;
    const el = this.el = document.createElement('div');
    el.className = 'hb' + (this.big ? ' big' : '');
    el.innerHTML = `${this.big ? '<div class="hb-hd"><span class="hb-nm"></span><span class="hb-num"></span></div>' : ''}
      <div class="hb-frame"><div class="hb-trail"></div><div class="hb-fill"></div><div class="hb-flash"></div><div class="hb-ticks"></div></div>
      <div class="hb-chip"></div>`;
    const q = (s) => el.querySelector(s);
    this.$ = { frame: q('.hb-frame'), trail: q('.hb-trail'), fill: q('.hb-fill'), flash: q('.hb-flash'), ticks: q('.hb-ticks'), chip: q('.hb-chip'), nm: q('.hb-nm'), num: q('.hb-num') };
    if (this.$.nm) this.$.nm.textContent = opt.name || '';
    this.setTick(opt.tick);
    opt.parent.appendChild(el);
  }
  setTick(tick) { this.tick = tick; this.$.ticks.style.backgroundSize = tick ? `${tick / this.max * 100}% 100%` : '0 0'; }

  damage(amt, crit = false) {
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amt);
    const real = before - this.hp;
    if (this.healing) { this.healing = false; this.trail = this.fill; }   // 回血途中挨打：残影从当前实血开始算
    this.holdT = C.hold;
    this.chip = (this.trail * this.max - this.hp > 0.5 ? this.chip : 0) + real;
    this.flashT = crit ? 0.2 : 0.13;
    const k = Math.min(1, real / this.max * 6);
    this.shakeA = Math.max(this.shakeA, (this.big ? 3 : 2) + k * (this.big ? 6 : 5) + (crit ? 2 : 0));
    this.shakeT = 0;
    this.pop = Math.max(this.pop, 0.08 + k * 0.12);
    this.idle = 0;
    this.el.classList.remove('dead');
  }
  heal(amt) {
    this.hp = Math.min(this.max, this.hp + amt);
    this.healing = true; this.trail = this.hp / this.max; this.holdT = 0; this.chip = 0; this.idle = 0;
  }
  // 换绑目标（大血条）：直接跳到新值，不播动画
  snap(hp, max, name) {
    this.max = max; this.hp = hp; this.fill = this.trail = hp / max; this.holdT = 0; this.chip = 0; this.healing = false;
    if (name != null && this.$.nm) this.$.nm.textContent = name;
    this.setTick(this.tick);
    this.el.classList.toggle('dead', hp <= 0);
  }
  die() { this.dead = true; this.el.classList.add('dead'); }
  revive(full = true) { this.dead = false; this.el.classList.remove('dead'); this.hp = 0; this.fill = this.trail = 0; this.heal(full ? this.max : 0); }

  update(dt) {
    const target = this.hp / this.max;
    if (this.healing) {
      this.fill += (target - this.fill) * (1 - Math.exp(-C.healK * dt)) + 0.05 * dt;
      if (this.fill >= target) { this.fill = target; this.healing = false; this.trail = target; }
    } else {
      this.fill += (target - this.fill) * (1 - Math.exp(-C.fillK * dt));
      if (this.holdT > 0) this.holdT -= dt;
      else if (this.trail > this.fill) {
        this.trail -= Math.max((this.trail - this.fill) * (1 - Math.exp(-C.trailK * dt)), C.trailMin * dt);
        if (this.trail <= this.fill + 0.002) { this.trail = this.fill; this.chip = 0; }
      } else this.trail = this.fill;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.shakeT += dt; this.shakeA *= Math.exp(-14 * dt);
    this.pop *= Math.exp(-12 * dt);
    this.idle += dt;

    const want = this.always || this.dead || this.hp < this.max || this.idle < C.idleHide || this.healing ? 1 : 0;
    this.alpha += (want - this.alpha) * (1 - Math.exp(-(want ? 18 : 4) * dt));

    const $ = this.$, low = target <= 0.25 && target > 0;
    $.fill.style.transform = `scaleX(${this.fill})`;
    $.trail.style.transform = `scaleX(${Math.max(this.trail, this.fill)})`;
    $.fill.style.setProperty('--c', col(this.fill));
    $.trail.classList.toggle('heal', this.healing);
    $.flash.style.transform = `scaleX(${Math.max(this.trail, this.fill)})`;
    $.flash.style.opacity = this.flashT > 0 ? Math.min(1, this.flashT / 0.08) : 0;
    this.el.classList.toggle('low', low);
    const show = this.chip >= 1 && this.trail - this.fill > 0.003;
    $.chip.style.opacity = show ? 1 : 0;
    if (show) { $.chip.textContent = '-' + Math.round(this.chip); $.chip.style.left = (this.fill * 100) + '%'; }
    if ($.num) $.num.textContent = `${Math.ceil(this.hp)} / ${Math.round(this.max)}`;
    this.sx = Math.sin(this.shakeT * 70) * this.shakeA;
    this.sy = Math.cos(this.shakeT * 53) * this.shakeA * 0.35;
  }
  // 小血条：跟随世界坐标；大血条：只加抖动
  place(x, y) {
    const s = 1 + this.pop;
    this.el.style.opacity = this.alpha.toFixed(3);
    this.el.style.visibility = this.alpha < 0.01 ? 'hidden' : '';
    this.el.style.transform = x == null
      ? `translate(calc(-50% + ${this.sx}px), ${this.sy}px) scale(${s})`
      : `translate3d(${x + this.sx}px, ${y + this.sy}px, 0) translate(-50%, -100%) scale(${s})`;
  }
  remove() { this.el.remove(); }
}

const _v = new THREE.Vector3();
export function screenOf(camera, x, y, z) {
  _v.set(x, y, z).project(camera);
  return [(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, _v.z < 1];
}
