// 战斗音效：全部用 Web Audio 现场合成，不用音频文件。
//
// 基本思路：所有声音都由三种"原料"拼出来
//   noise  白噪声 → 滤波器（频率可滑动）→ 音量包络   挥剑风声、木头碎裂、雷声、爆炸
//   tone   振荡器（音高可滑动）→ 音量包络            低频重击、跳起的上扬感
//   ring   几个不成倍数的正弦叠在一起                 金属"铮"的余音
// 每个音都可以分一部分进混响（send），大招多给，普攻少给。
// 总线：各声音 → 干声 + 混响 → 总音量 → 压缩器（防止叠太多爆音）→ 扬声器

const rnd = (a, b) => a + Math.random() * (b - a);

export class SFX {
  constructor() { this.ctx = null; this.vol = 0.7; this.enabled = true; this.impactN = 0; this.impactT = 0; }

  // 浏览器规定必须由用户操作后才能出声：第一次按键/点鼠标时调用
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.12;
      this.master = c.createGain(); this.master.gain.value = this.vol;
      this.master.connect(comp).connect(c.destination);
      this.dry = c.createGain(); this.dry.connect(this.master);
      this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.6, 2.5);
      const wet = c.createGain(); wet.gain.value = 0.35; this.verb.connect(wet).connect(this.master);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  get ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  // 合成的混响：一段指数衰减的噪声当作房间回声
  impulse(sec, decay) {
    const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  // 音量包络：attack 秒内升到 gain，然后在 dur 结束时衰减到无声
  env(t, dur, gain, attack = 0.005, send = 0.1) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    g.connect(this.dry);
    if (send > 0) { const s = c.createGain(); s.gain.value = send; g.connect(s).connect(this.verb); }
    return g;
  }

  // fm：先滑到 fm（在 attack 时刻），再滑到 f1 —— 用来做"由远到近再远去"的风声
  noise({ t = 0, dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, fm = 0, q = 1, gain = 0.5, attack = 0.005, send = 0.1 }) {
    const c = this.ctx, at = c.currentTime + t;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    if (fm) f.frequency.exponentialRampToValueAtTime(fm, at + attack);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    src.connect(f).connect(this.env(at, dur, gain, attack, send));
    src.start(at, Math.random() * 1.5); src.stop(at + dur + 0.05);
  }

  tone({ t = 0, dur = 0.2, type = 'sine', f0 = 200, f1 = f0, gain = 0.5, attack = 0.003, send = 0.1 }) {
    const c = this.ctx, at = c.currentTime + t, o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    o.connect(this.env(at, dur, gain, attack, send));
    o.start(at); o.stop(at + dur + 0.05);
  }

  ring({ t = 0, f = 2200, dur = 0.4, gain = 0.12, send = 0.3 }) {
    [1, 2.76, 5.4, 8.93].forEach((k, i) => this.tone({ t, f0: f * k, dur: dur / (1 + i * 0.6), gain: gain / (1 + i), send }));
  }

  // ---------- 通用动作 ----------
  // 挥剑风声：带通滤波的噪声由低滑到高，在剑命中的那一刻最响
  swing({ lead = 0.11, size = 1, pitch = 1, send = 0.08 } = {}) {
    if (!this.ok) return;
    const p = pitch * rnd(0.92, 1.08);
    this.noise({ dur: lead + 0.14 * size, f0: 350 * p, f1: 2600 * p, q: 1.6, gain: 0.32 * size, attack: lead, send });
    this.noise({ dur: lead + 0.08, type: 'highpass', f0: 3000 * p, f1: 5000 * p, gain: 0.07 * size, attack: lead, send: 0 });
  }

  // 打到木桩：低频"咚" + 宽频"啪" + 木头闷响；同一瞬间打中多个时只响前三个
  impact({ crit = false, heavy = 0 } = {}) {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    if (now - this.impactT > 0.03) { this.impactT = now; this.impactN = 0; }
    if (++this.impactN > 3) return;
    const v = 1 / this.impactN, p = rnd(0.9, 1.1);
    this.tone({ f0: (150 - heavy * 40) * p, f1: 45, dur: 0.12 + heavy * 0.12, gain: (0.6 + heavy * 0.35) * v, send: 0.05 });
    this.noise({ type: 'lowpass', f0: 3500 * p, f1: 300, dur: 0.07, gain: 0.55 * v, send: 0.05 });
    this.noise({ f0: 520 * p, f1: 300, q: 0.8, dur: 0.1 + heavy * 0.08, gain: (0.35 + heavy * 0.2) * v, send: 0.05 });
    if (crit) {
      this.noise({ type: 'lowpass', f0: 6000, f1: 800, dur: 0.05, gain: 0.5, send: 0.1 });
      this.tone({ t: 0.01, f0: 95, f1: 32, dur: 0.3, gain: 0.55, send: 0.25 });
      this.noise({ t: 0.01, type: 'lowpass', f0: 1200, f1: 150, dur: 0.3, gain: 0.3, send: 0.3 });
    }
  }

  // 木桩击破：重击 + 一串碎裂声 + 低沉的散落
  kill() {
    if (!this.ok) return;
    this.tone({ f0: 140, f1: 38, dur: 0.4, gain: 0.7, send: 0.3 });
    this.noise({ type: 'lowpass', f0: 2200, f1: 180, dur: 0.6, gain: 0.45, send: 0.4 });
    for (let i = 0; i < 5; i++) this.noise({ t: 0.04 + i * rnd(0.04, 0.08), f0: rnd(900, 2000), q: 3, dur: 0.05, gain: 0.3 });
  }

  respawn() {
    if (!this.ok) return;
    this.tone({ f0: 660, dur: 0.6, gain: 0.06, attack: 0.05, send: 0.7 });
    this.tone({ t: 0.08, f0: 990, dur: 0.6, gain: 0.05, attack: 0.05, send: 0.7 });
  }

  dash() {
    if (!this.ok) return;
    this.noise({ type: 'lowpass', f0: 1800, f1: 300, dur: 0.06, gain: 0.35, send: 0 });
    this.noise({ f0: 350, fm: 1300, f1: 450, q: 0.7, dur: 0.3, gain: 0.4, attack: 0.07, send: 0.04 });
    this.noise({ type: 'lowpass', f0: 500, fm: 900, f1: 250, dur: 0.26, gain: 0.25, attack: 0.06, send: 0 });
  }

  // 节奏提示：快 = 高音"嗒"，慢 = 低音"咚"，帮助练手感
  tick(type) {
    if (!this.ok || type === '起') return;
    this.tone({ f0: type === 'F' ? 1500 : 820, dur: 0.05, gain: 0.05, send: 0 });
  }

  // ---------- 招式专属 ----------
  stab() { // 连刺：短促的"嗖" + 刺入的湿润"噗嗤"
    const p = rnd(0.9, 1.1);
    this.noise({ type: 'highpass', f0: 2600 * p, f1: 1400, dur: 0.06, gain: 0.2, send: 0.03 });
    this.noise({ t: 0.03, f0: 1600 * p, f1: 260, q: 5, dur: 0.11, gain: 0.45, send: 0.02 });
    this.noise({ t: 0.03, type: 'lowpass', f0: 900, f1: 200, dur: 0.14, gain: 0.35, send: 0.02 });
    this.tone({ t: 0.03, f0: 260 * p, f1: 90, dur: 0.08, gain: 0.25, send: 0 });
  }
  galeRelease() { // 剑气出手：低沉一推 + 撕开空气 + 远去的风
    this.tone({ f0: 110, f1: 45, dur: 0.3, gain: 0.55, send: 0.15 });
    this.noise({ type: 'lowpass', f0: 600, f1: 150, dur: 0.3, gain: 0.4, send: 0.1 });
    this.noise({ f0: 500, fm: 3200, f1: 1600, q: 1, dur: 0.25, gain: 0.5, attack: 0.04, send: 0.15 });
    this.noise({ t: 0.08, f0: 1400, f1: 350, q: 0.8, dur: 0.75, gain: 0.3, attack: 0.05, send: 0.3 });
  }
  thunderCharge(lead) { // 落雷起跳：越来越密的电火花 + 上升音
    for (let i = 0; i < 10; i++) { const k = i / 10; this.noise({ t: lead * Math.sqrt(k), type: 'highpass', f0: rnd(3000, 6000), dur: 0.025, gain: 0.08 + k * 0.12, send: 0.1 }); }
    this.tone({ type: 'sawtooth', f0: 120, f1: 520, dur: lead, gain: 0.03, attack: lead * 0.9, send: 0.2 });
    this.noise({ f0: 300, f1: 1500, dur: lead, gain: 0.2, attack: lead * 0.8 });
  }
  thunderClap() { // 落雷：炸裂 + 长长的雷鸣
    this.noise({ type: 'lowpass', f0: 8000, f1: 1500, dur: 0.09, gain: 0.85, send: 0.1 });
    this.noise({ t: 0.02, type: 'lowpass', f0: 700, f1: 70, dur: 1.6, gain: 0.85, attack: 0.03, send: 0.4 });
    this.tone({ f0: 70, f1: 28, dur: 0.9, gain: 0.7, send: 0.2 });
    for (let i = 0; i < 4; i++) this.noise({ t: 0.15 + i * rnd(0.15, 0.25), type: 'lowpass', f0: rnd(250, 400), f1: 60, dur: 0.5, gain: 0.35, attack: 0.08, send: 0.3 });
  }
  spin(lead) { // 回旋：一段连续风声，滤波频率被低频振荡器来回扫，听起来"呜—呜—呜"越转越快
    const c = this.ctx, at = c.currentTime + lead * 0.3, dur = 0.6;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.3; f.frequency.value = 900;
    const lfo = c.createOscillator(), depth = c.createGain(), trem = c.createGain(), tremD = c.createGain();
    lfo.frequency.setValueAtTime(5, at); lfo.frequency.linearRampToValueAtTime(8, at + dur);
    depth.gain.value = 600; lfo.connect(depth).connect(f.frequency);
    trem.gain.value = 0.6; tremD.gain.value = 0.4; lfo.connect(tremD).connect(trem.gain);
    src.connect(f).connect(trem).connect(this.env(at, dur, 0.5, 0.06, 0.12));
    src.start(at, Math.random()); src.stop(at + dur + 0.05); lfo.start(at); lfo.stop(at + dur + 0.05);
    this.noise({ t: lead * 0.3, type: 'lowpass', f0: 400, f1: 200, dur, gain: 0.15, attack: 0.1, send: 0 });
  }
  pierce() { // 惊鸿：蹬地 + 低沉推进 + 撕裂空气的"咻"远去
    this.noise({ type: 'lowpass', f0: 2000, f1: 250, dur: 0.07, gain: 0.4, send: 0 });
    this.tone({ t: 0.03, f0: 160, f1: 60, dur: 0.22, gain: 0.4, send: 0.05 });
    this.noise({ t: 0.03, f0: 600, fm: 3500, f1: 900, q: 1.2, dur: 0.38, gain: 0.5, attack: 0.12, send: 0.15 });
  }
  slam(big = 0) { // 重劈落地：沉闷撞击 + 碎石
    this.tone({ f0: 110, f1: 35, dur: 0.35 + big * 0.3, gain: 0.6 + big * 0.3, send: 0.3 });
    this.noise({ type: 'lowpass', f0: 1100, f1: 140, dur: 0.35 + big * 0.4, gain: 0.45 + big * 0.2, send: 0.4 });
    for (let i = 0; i < 3 + big * 3; i++) this.noise({ t: rnd(0.02, 0.2), f0: rnd(500, 1300), q: 3, dur: 0.06, gain: 0.18 });
  }
  leap(lead, fire) { // 起跳上扬；流星坠下落时加火焰呼啸
    this.noise({ f0: 300, f1: 1400, q: 1.2, dur: 0.3, gain: 0.25, attack: 0.08, send: 0.1 });
    if (fire) this.noise({ t: lead * 0.35, type: 'lowpass', f0: 250, f1: 2400, dur: lead * 0.65, gain: 0.5, attack: lead * 0.6, send: 0.25 });
  }
  explode() { // 流星坠落地：爆炸 + 碎石雨
    this.noise({ type: 'lowpass', f0: 5000, f1: 400, dur: 0.12, gain: 0.8, send: 0.1 });
    this.tone({ f0: 75, f1: 24, dur: 1.1, gain: 1, send: 0.3 });
    this.noise({ t: 0.01, type: 'lowpass', f0: 1200, f1: 60, dur: 1.6, gain: 0.9, send: 0.45 });
    for (let i = 0; i < 8; i++) this.noise({ t: rnd(0.2, 0.9), type: 'lowpass', f0: rnd(500, 1000), f1: 150, dur: 0.08, gain: rnd(0.08, 0.18), send: 0.1 });
  }

  // ---------- 拳 ----------
  fistWhoosh({ lead = 0.08, size = 1, pitch = 1 } = {}) { // 拳风：比剑风低、短、闷
    const p = pitch * rnd(0.92, 1.08);
    this.noise({ dur: lead + 0.07 * size, f0: 180 * p, f1: 900 * p, q: 1.1, gain: 0.32 * size, attack: lead, send: 0.04 });
    this.noise({ dur: lead + 0.05, type: 'lowpass', f0: 300, f1: 700 * p, gain: 0.18 * size, attack: lead, send: 0 });
  }
  airPop(big = 0) { // 拳劲炸开：空气"啪"一声 + 低频一震
    this.noise({ type: 'highpass', f0: 2500, f1: 1200, dur: 0.035, gain: 0.25 + big * 0.2, send: 0.03 });
    this.noise({ f0: 1200, f1: 220, q: 0.9, dur: 0.08 + big * 0.1, gain: 0.35 + big * 0.25, send: 0.06 + big * 0.15 });
    this.tone({ f0: 140 - big * 50, f1: 38, dur: 0.12 + big * 0.25, gain: 0.45 + big * 0.4, send: 0.05 + big * 0.2 });
  }
  stomp() { // 跺脚 / 蹬地
    this.tone({ f0: 120, f1: 40, dur: 0.15, gain: 0.5, send: 0.05 });
    this.noise({ type: 'lowpass', f0: 1500, f1: 200, dur: 0.1, gain: 0.35, send: 0.05 });
  }
  groundBoom(big = 0) { // 拳砸地：闷雷般的低频 + 地面隆隆 + 碎石
    this.tone({ f0: 80, f1: 26, dur: 0.5 + big * 0.4, gain: 0.8, send: 0.25 });
    this.noise({ type: 'lowpass', f0: 600, f1: 60, dur: 0.6 + big * 0.5, gain: 0.6, attack: 0.01, send: 0.35 });
    this.noise({ type: 'highpass', f0: 1800, f1: 900, dur: 0.05, gain: 0.25 });
    for (let i = 0; i < 4 + big * 4; i++) this.noise({ t: rnd(0.05, 0.35), type: 'lowpass', f0: rnd(400, 900), f1: 120, dur: 0.07, gain: rnd(0.08, 0.16) });
  }
  bell() { // 金钟罩：铜钟"嗡——"
    this.noise({ type: 'lowpass', f0: 1500, f1: 300, dur: 0.08, gain: 0.3 });
    this.ring({ f: 196, dur: 2.2, gain: 0.3, send: 0.5 });
    this.tone({ f0: 98, dur: 1.8, gain: 0.3, send: 0.4, attack: 0.01 });
  }

  // ---------- 符 ----------
  paper(lead = 0.1) { // 甩符：纸片"唰"一声，再抖几下
    this.noise({ type: 'highpass', f0: 2500, f1: 5000, dur: lead + 0.06, gain: 0.16, attack: lead, send: 0.03 });
    this.noise({ f0: 900, f1: 2400, q: 1.5, dur: lead + 0.05, gain: 0.2, attack: lead, send: 0.03 });
    for (let i = 0; i < 3; i++) this.noise({ t: lead + 0.02 + i * 0.035, f0: rnd(2500, 4000), q: 4, dur: 0.02, gain: 0.08 });
  }
  // 禁令：符的音效（掐诀 / 符炸）永远不要用 ring()、高频纯音——那种"叮"的金属声已被否决，别再做类似的
  chant(lead = 0.15) { // 掐诀：低沉的气息上扬 + 一声闷闷的"嗡"，没有高频尖音
    this.noise({ f0: 300, f1: 1100, q: 1.2, dur: lead + 0.14, gain: 0.14, attack: lead, send: 0.15 });
    this.tone({ t: lead * 0.5, type: 'triangle', f0: 130, f1: 190, dur: 0.3, gain: 0.12, attack: 0.06, send: 0.2 });
  }
  talisBoom(big = 0) { // 符炸开：火光"嘭" + 纸张烧起来的噼啪，余韵是低频隆隆
    this.noise({ type: 'lowpass', f0: 3000, f1: 250, dur: 0.18 + big * 0.2, gain: 0.55 + big * 0.2, send: 0.2 });
    this.tone({ f0: 150, f1: 42, dur: 0.25 + big * 0.4, gain: 0.5 + big * 0.35, send: 0.2 });
    this.noise({ type: 'lowpass', f0: 500, f1: 90, dur: 0.4 + big * 0.5, gain: 0.25 + big * 0.1, attack: 0.02, send: 0.35 });
    for (let k = 0; k < 4 + big * 4; k++) this.noise({ t: rnd(0.04, 0.3 + big * 0.2), type: 'bandpass', f0: rnd(1200, 2600), q: 1, dur: 0.03, gain: rnd(0.05, 0.1) });
  }
  zap() { // 雷符：电流噼啪
    for (let i = 0; i < 6; i++) this.noise({ t: i * rnd(0.012, 0.03), type: 'highpass', f0: rnd(3000, 7000), dur: 0.02, gain: rnd(0.1, 0.2), send: 0.1 });
    this.tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.15, gain: 0.06, send: 0.1 });
  }
}

// 招式 id → 音效。start(s, m, lead) 出招时；hit(s, h, i, m) 每个判定帧。
// lead = 从出招到第一次判定的真实秒数，风声在这一刻最响。
export const MOVE_SFX = {
  slash1: { start: (s, m, lead) => s.swing({ lead }) },
  slash2: { start: (s, m, lead) => s.swing({ lead, pitch: 1.1 }) },
  slash3: { start: (s, m, lead) => s.swing({ lead, pitch: 0.95, size: 1.2 }) },
  flurry: { hit: (s) => s.stab() },
  gale: { start: (s, m, lead) => s.swing({ lead, pitch: 0.8, size: 1.2 }), hit: (s) => s.galeRelease() },
  thunder: { start: (s, m, lead) => { s.leap(lead); s.thunderCharge(lead); }, hit: (s) => s.thunderClap() },
  whirl: { start: (s, m, lead) => s.spin(lead) },
  pierce: { start: (s) => s.pierce() },
  heavy: { start: (s, m, lead) => s.swing({ lead, pitch: 0.7, size: 1.3, send: 0.15 }), hit: (s) => s.slam(0) },
  quake: { start: (s, m, lead) => s.swing({ lead, pitch: 0.6, size: 1.4, send: 0.2 }), hit: (s, h, i, m) => s.slam(i === m.hits.length - 1 ? 1 : 0.3) },
  meteor: { start: (s, m, lead) => s.leap(lead, true), hit: (s) => s.explode() },
};
