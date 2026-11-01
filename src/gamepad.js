// 手柄（GDD 第 1 节：先做 PC，支持键鼠和手柄）。按标准布局（Xbox 位置）：
// 左摇杆移动 · 右摇杆瞄准（不推就自动吸附最近的妖兽）· A 普攻 · B 闪避 · X / Y / LB / RB 四个技能
// LT 换武 · RT 交互 · 十字键 ←→ 换快捷栏、↑ 用选中的、↓ 背包 · Start 菜单 · Back 地图 · 右摇杆按下 神识
// 对话 / 面板打开时：十字键上下选选项，A 确定，B 关闭。
const DEAD = 0.18;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class Gamepad {
  constructor() {
    this.on = false; this.stick = { x: 0, y: 0 }; this.aim = { x: 0, y: 0 }; this.prev = [];
    addEventListener('gamepadconnected', () => { this.on = true; });
  }
  // 每帧读一次；返回这一帧刚按下的键（下标）
  poll() {
    const pads = navigator.getGamepads?.() || [], p = [...pads].find((x) => x && x.connected);
    if (!p) { this.stick.x = this.stick.y = this.aim.x = this.aim.y = 0; return []; }
    this.stick.x = dz(p.axes[0] || 0); this.stick.y = -dz(p.axes[1] || 0);
    this.aim.x = dz(p.axes[2] || 0); this.aim.y = dz(p.axes[3] || 0);
    const now = p.buttons.map((b) => b.pressed || b.value > 0.5), pressed = [];
    now.forEach((v, i) => { if (v && !this.prev[i]) pressed.push(i); });
    this.prev = now;
    if (pressed.length || Math.hypot(this.stick.x, this.stick.y) > 0) this.on = true;
    this.held = now;
    return pressed;
  }
}
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
