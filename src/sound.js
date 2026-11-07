// 声音总管（战斗音效以外的全部声音）：脚步、环境声、说话、按钮 / 界面、背景音乐。
// 全部用 Web Audio 现场合成，不用音频文件；和战斗音效（comboSfx.js）共用一个 AudioContext 和总音量 / 压缩器。
//
// 总线：  脚步 / 界面 / 说话 → fx ┐
//        环境声 → amb ────────────┼→ sfx.master（总音量）→ 压缩器 → 扬声器
//        背景音乐 → music ────────┘      （音乐、说话另外少量送进 sfx.verb 混响）
//
// 用户否决过的声音（见 CLAUDE.md「音效禁令」），这里一律遵守：
//   · 脚步 / 落地 / 水声：只用低通 / 高通噪声（Q ≤ 0.3，不共振），不用带音高的振荡器，也不要快起音的低频"噗"
//   · 不要"叮 / tin"的金属声：界面音、钱、拾取都用木头 / 纸 / 布的闷声，奖励用古筝拨弦（琴弦，不是金属铃）
import { waterVoice } from './lab/swim.js';
import { MUSIC } from './musicList.js';

const R = Math.random, rnd = (a, b) => a + R() * (b - a), pick = (a) => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

// ---------- 地面 → 脚步声的种类 ----------
// world.surfaceAt 给出 kind（0 草 / 土路 · 1 石板 · 2 岸沙 · 3 田土 · 4 岩石 / 矿）、path（路面程度）、frost（覆霜）、sector（扇区 id）、biome（扇区程度）
export function surfaceName(s, o) {
  if (o.inside) return 'wood';
  if (o.mine) return 'gravel';
  const snowy = o.snow > 0.5 || s.frost > 0.5 || (s.sector === 'snow' && s.biome > 0.5);
  if (s.kind === 1) return snowy ? 'snow' : o.wet > 0.3 ? 'wetstone' : 'stone';
  if (s.kind === 4) return snowy ? 'snow' : 'gravel';
  if (snowy) return 'snow';
  if (s.kind === 2) return o.wet > 0.3 ? 'mud' : 'sand';
  if (s.kind === 3) return o.wet > 0.3 ? 'mud' : 'soil';
  if (s.biome > 0.5) {
    if (s.sector === 'desert') return 'sand';
    if (s.sector === 'volcano') return 'gravel';
    if (s.sector === 'swamp') return 'mud';
    if (s.sector === 'battle') return 'dirt';
  }
  if (s.path > 0.5) return o.wet > 0.3 ? 'mud' : 'dirt';
  if (o.autumn > 0.5) return 'leaves';
  return o.wet > 0.3 ? 'wetgrass' : 'grass';
}
export const SURFACE_NAME = { grass: '草地', wetgrass: '湿草', leaves: '落叶', dirt: '土路', mud: '泥地', stone: '石板', wetstone: '湿石板', sand: '沙地', soil: '田土', gravel: '碎石', snow: '雪地', wood: '木地板', water: '浅水' };

// ---------- 背景音乐的调式（五声音阶，半音数） ----------
const GONG = [0, 2, 4, 7, 9], YU = [0, 3, 5, 7, 10], SHANG = [0, 2, 5, 7, 10], JUE = [0, 3, 5, 8, 10];
// root = MIDI 主音；bpm；dens = 每拍出音概率；reg = 旋律音区（音阶级数范围）；drum = 鼓；flute = 箫
const MOODS = {
  title:   { root: 50, scale: GONG, bpm: 58, dens: 0.42, reg: [5, 13], drum: 0, flute: 0.5 },
  village: { root: 50, scale: GONG, bpm: 74, dens: 0.55, reg: [5, 14], drum: 0, flute: 0.25 },
  wild:    { root: 52, scale: SHANG, bpm: 66, dens: 0.38, reg: [4, 12], drum: 0, flute: 0.35 },
  night:   { root: 47, scale: YU, bpm: 52, dens: 0.28, reg: [4, 11], drum: 0, flute: 0.6 },
  snow:    { root: 49, scale: YU, bpm: 54, dens: 0.3, reg: [6, 14], drum: 0, flute: 0.55 },
  desert:  { root: 50, scale: JUE, bpm: 60, dens: 0.34, reg: [4, 12], drum: 0.25, flute: 0.5 },
  dark:    { root: 45, scale: JUE, bpm: 50, dens: 0.24, reg: [3, 10], drum: 0.15, flute: 0.3 }, // 沼泽 / 古战场 / 火山
  mine:    { root: 43, scale: YU, bpm: 46, dens: 0.18, reg: [3, 9], drum: 0, flute: 0 },
  fight:   { root: 52, scale: YU, bpm: 128, dens: 0.6, reg: [5, 13], drum: 1, flute: 0 },
  boss:    { root: 45, scale: JUE, bpm: 140, dens: 0.66, reg: [4, 12], drum: 1.3, flute: 0 },
};
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const degMidi = (M, d) => M.root + M.scale[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);

export class GameAudio {
  constructor(sfx) {
    this.sfx = sfx; this.ready = false;
    this.vol = { music: 0.6, amb: 0.8, fx: 0.9, voice: 0.8 };
    this.stepDist = 0; this.lastSurf = 'grass'; this.surfT = 0;
    this.mood = 'title'; this.M = MOODS.title; this.beat = 0; this.nextT = 0; this.phrase = []; this.melDeg = 9; this.fightT = 0;
    this.evT = { bird: 2, cricket: 1, frog: 3, chat: 4, drip: 2, crackle: 1, crow: 8, gust: 5, owl: 10 };
    this.ks = new Map(); // 古筝拨弦音色缓存（Karplus-Strong）
    this.voiceUntil = 0; this.voices = []; this.cueT = {};
  }

  // 第一次有用户操作时（sfx.unlock 之后）接上总线
  init() {
    const c = this.sfx.ctx; if (this.ready || !c) return;
    this.c = c; this.ready = true;
    const bus = (v) => { const g = c.createGain(); g.gain.value = v; g.connect(this.sfx.master); return g; };
    this.fxBus = bus(this.vol.fx); this.voiceBus = bus(this.vol.voice); this.ambBus = bus(this.vol.amb); this.musicBus = bus(0);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.96, c.currentTime, 1.5); // 音乐淡入
    this.musicVerb = c.createGain(); this.musicVerb.gain.value = 0.55; this.musicBus.connect(this.musicVerb).connect(this.sfx.verb);
    this.voiceVerb = c.createGain(); this.voiceVerb.gain.value = 0.12; this.voiceBus.connect(this.voiceVerb).connect(this.sfx.verb);
    this.nb = this.sfx.noiseBuf;
    // 持续的环境声：每条都是"循环噪声 → 滤波 → 音量"，每帧只调滤波和音量
    const loop = (type, f, q = 0.3, type2, f2) => {
      const s = c.createBufferSource(); s.buffer = this.nb; s.loop = true; s.playbackRate.value = rnd(0.9, 1.1);
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      let tail = fl;
      if (type2) { const f2n = c.createBiquadFilter(); f2n.type = type2; f2n.frequency.value = f2; f2n.Q.value = 0.3; fl.connect(f2n); tail = f2n; }
      const g = c.createGain(); g.gain.value = 0; tail.connect(g).connect(this.ambBus);
      s.connect(fl); s.start(0, R() * 1.5);
      return { f: fl, g };
    };
    this.L = {
      wind: loop('lowpass', 400),                     // 风：低通噪声，截止频率慢慢起伏
      rain: loop('highpass', 500, 0.3, 'lowpass', 5200), // 雨：宽带的"沙——"
      roof: loop('lowpass', 900),                     // 雨打屋顶 / 雨打树叶（屋里或树多时）
      water: loop('lowpass', 1200),                   // 溪水、池塘、瀑布：截止频率乱跳 = 潺潺
      fall: loop('lowpass', 2400),                    // 瀑布的"哗"
      rumble: loop('lowpass', 110),                   // 火山 / 矿洞的低沉轰鸣
      cave: loop('bandpass', 380, 0.3),               // 矿洞里的空腔回响
      fire: loop('highpass', 1800, 0.3, 'lowpass', 4500), // 火山地带的噼啪底噪
      crowd: loop('bandpass', 700, 0.3),              // 村里远处的人声嘈杂（底噪，人声颗粒另外随机出）
    };
    this.nextT = c.currentTime + 0.3;
    this.loadTracks();
  }
  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ready) return;
    const t = this.c.currentTime;
    this.fxBus.gain.setTargetAtTime(this.vol.fx, t, 0.05); this.voiceBus.gain.setTargetAtTime(this.vol.voice, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.amb, t, 0.05); this.musicBus.gain.setTargetAtTime(this.musicOff ? 0 : this.vol.music * 0.96, t, 0.1);
  }
  get ok() { return this.ready && this.sfx.ok; }

  // ================= 基础原料 =================
  // 一段噪声：先低通（Q 0.3，不共振）再可选高通；截止从 lp 扫到 lp1；jit = 响度随机起伏
  burst(out, t, { dur = 0.1, lp = 1200, lp1 = lp, hp = 0, gain = 0.3, attack = 0.005, jit = 0, rate = 1, curve = 1.6 }) {
    const c = this.c, s = c.createBufferSource(); s.buffer = this.nb; s.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.3;
    f.frequency.setValueAtTime(lp, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, lp1), t + dur);
    let tail = f;
    if (hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.Q.value = 0.3; h.frequency.value = hp; f.connect(h); tail = h; }
    const g = c.createGain(), gg = g.gain;
    gg.setValueAtTime(0.0001, t); gg.linearRampToValueAtTime(gain, t + attack);
    if (jit) for (let i = 1, n = Math.max(2, Math.ceil(dur / 0.025)); i < n; i++) { const u = i / n; gg.linearRampToValueAtTime(gain * Math.pow(1 - u, curve) * (1 - jit + R() * jit), t + attack + (dur - attack) * u); }
    gg.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); tail.connect(g).connect(out);
    s.start(t, R() * 1.5, dur + 0.05);
  }

  // ================= 脚步 =================
  // 每走一步调一次；surf 见 surfaceName；k = 跑动程度（0 走 · 1 跑），v = 音量
  step(surf, k = 0.5, v = 1, t = this.c.currentTime) {
    const o = this.fxBus, B = (p) => this.burst(o, t + (p.off || 0), p), a = (0.55 + k * 0.45) * v * 0.9, rt = rnd(0.9, 1.1);
    switch (surf) {
      case 'grass': // 草叶擦过："唰"，中频，起音慢一点
        B({ dur: 0.11, lp: 2600, lp1: 900, hp: 350, gain: 0.16 * a, attack: 0.012, jit: 0.5, rate: rt });
        B({ dur: 0.07, lp: 420, lp1: 200, gain: 0.12 * a, attack: 0.006 });
        break;
      case 'wetgrass':
        B({ dur: 0.13, lp: 2000, lp1: 700, hp: 300, gain: 0.15 * a, attack: 0.012, jit: 0.6, rate: rt });
        B({ dur: 0.12, lp: 900, lp1: 300, gain: 0.08 * a, attack: 0.02, jit: 0.7, off: 0.03 });
        break;
      case 'leaves': // 落叶：碎碎的"沙沙"，几片叶子先后响
        for (let i = 0; i < 4; i++) B({ dur: rnd(0.03, 0.06), lp: rnd(3000, 4200), lp1: 1500, hp: 700, gain: rnd(0.06, 0.11) * a, attack: 0.002, off: i * rnd(0.012, 0.028) });
        B({ dur: 0.08, lp: 380, lp1: 180, gain: 0.1 * a, attack: 0.006 });
        break;
      case 'dirt': // 土路：闷闷的"噗"加一点细沙
        B({ dur: 0.08, lp: 700, lp1: 220, gain: 0.36 * a, attack: 0.008 });
        B({ dur: 0.05, lp: 2600, lp1: 1200, hp: 900, gain: 0.05 * a, attack: 0.002, off: 0.01 });
        break;
      case 'mud': // 泥地：吧唧——截止频率乱跳的湿声，抬脚时再"啵"一下（不是低频硬"噗"）
        B({ dur: 0.12, lp: 900, lp1: 350, gain: 0.2 * a, attack: 0.015, jit: 0.7 });
        B({ dur: 0.09, lp: 1700, lp1: 600, hp: 250, gain: 0.08 * a, attack: 0.02, jit: 0.6, off: 0.1 });
        break;
      case 'stone': // 石板：短促的"嗒"——比土路干、高一点，但不带音高
        B({ dur: 0.045, lp: 3000, lp1: 1200, hp: 500, gain: 0.16 * a, attack: 0.002 });
        B({ dur: 0.06, lp: 600, lp1: 250, gain: 0.2 * a, attack: 0.004 });
        break;
      case 'wetstone':
        B({ dur: 0.045, lp: 2600, lp1: 1100, hp: 500, gain: 0.13 * a, attack: 0.002 });
        B({ dur: 0.1, lp: 1800, lp1: 600, hp: 300, gain: 0.07 * a, attack: 0.01, jit: 0.6, off: 0.02 });
        B({ dur: 0.06, lp: 550, lp1: 240, gain: 0.16 * a, attack: 0.004 });
        break;
      case 'wood': // 木地板：空一点的"咚"——低通噪声，衰减长一点
        B({ dur: 0.14, lp: 480, lp1: 160, gain: 0.5 * a, attack: 0.005 });
        B({ dur: 0.035, lp: 2200, lp1: 900, hp: 600, gain: 0.07 * a, attack: 0.002 });
        break;
      case 'sand': // 沙地：软的"沙——"，起音慢、没有冲击
        B({ dur: 0.16, lp: 3200, lp1: 1100, hp: 600, gain: 0.13 * a, attack: 0.03, jit: 0.4, rate: rt });
        B({ dur: 0.1, lp: 380, lp1: 180, gain: 0.07 * a, attack: 0.02 });
        break;
      case 'soil': // 松软的田土
        B({ dur: 0.1, lp: 800, lp1: 260, gain: 0.22 * a, attack: 0.012, jit: 0.4 });
        B({ dur: 0.07, lp: 2000, lp1: 900, hp: 500, gain: 0.05 * a, attack: 0.008, off: 0.02 });
        break;
      case 'gravel': // 碎石：一串小石子"咔啦"
        for (let i = 0; i < 6; i++) B({ dur: rnd(0.015, 0.035), lp: rnd(2400, 3600), lp1: 1400, hp: 800, gain: rnd(0.05, 0.1) * a, attack: 0.001, off: i * rnd(0.008, 0.02) });
        B({ dur: 0.07, lp: 520, lp1: 220, gain: 0.18 * a, attack: 0.004 });
        break;
      case 'snow': // 雪地：压雪的"嘎吱"——很多细小颗粒连成一片
        for (let i = 0; i < 9; i++) B({ dur: 0.02, lp: rnd(2200, 3200), lp1: 1500, hp: 700, gain: rnd(0.04, 0.08) * a, attack: 0.002, off: 0.01 + i * 0.013 });
        B({ dur: 0.14, lp: 1100, lp1: 400, gain: 0.16 * a, attack: 0.02 });
        break;
      case 'water': // 浅水：和 swim.js 同一套水声
        waterVoice(this.c, o, this.nb, 'step', 0.9 * a, t);
        break;
    }
  }
  // 落地（跳 / 御剑落下）：只用低通噪声，起音不要太快
  land(surf, h = 1) {
    if (!this.ok) return;
    const t = this.c.currentTime;
    if (surf === 'water') { waterVoice(this.c, this.fxBus, this.nb, 'enter', 0.7, t); return; }
    this.burst(this.fxBus, t, { dur: 0.22, lp: 600, lp1: 160, gain: 0.3 * h, attack: 0.035, jit: 0.3 });
    this.step(surf, 1, 0.8 * h, t + 0.01);
  }

  // ================= 说话：叽里咕噜的"拟声"（每人一种嗓音） =================
  // 原料：锯齿波（声带）→ 两个共振峰带通（元音）→ 低通 → 音量。音节数跟着字数走，句末语调下降、问句上扬。
  voiceOf(name) {
    const h = hash(name), h2 = hash(name + '·');
    return { f0: 105 + h * 170, rate: 0.85 + h2 * 0.4, bright: 0.8 + hash(name + '音') * 0.5, jump: 0.08 + h2 * 0.12 };
  }
  talk(name, text, o = {}) {
    if (!this.ok || !name) return;
    const c = this.c, V = this.voiceOf(name);
    const chars = String(text || '').replace(/[\s「」『』“”"'、，。！？…—·（）()：:；;,.!?~～0-9a-zA-Z]/g, '');
    const n = clamp(Math.round(chars.length * 0.55), 2, o.max || 14);
    const ask = /[？?]\s*[」』”"]?$/.test(text), shout = /[！!]/.test(text);
    let t = Math.max(c.currentTime + 0.02, this.voiceUntil);
    const out = o.out || this.voiceBus, vol = (o.vol ?? 1) * (shout ? 1.2 : 1);
    const VOW = [[730, 1090], [530, 1840], [300, 2200], [570, 840], [440, 1020], [400, 1600]]; // a e i o u ü 的共振峰
    for (let i = 0; i < n; i++) {
      const len = rnd(0.06, 0.1) / V.rate, last = i === n - 1;
      const contour = last ? (ask ? 1.25 : 0.82) : 1 + (R() - 0.5) * V.jump * 2;
      const f0 = V.f0 * contour * (1 + (shout ? 0.12 : 0)), [F1, F2] = pick(VOW);
      const osc = c.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f0 * (last ? (ask ? 1.15 : 0.88) : rnd(0.96, 1.04)), t + len);
      const g = c.createGain(), mix = c.createGain(); mix.gain.value = 1;
      for (const [F, q, k] of [[F1 * V.bright, 6, 1], [F2 * V.bright, 9, 0.55]]) {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F; bp.Q.value = q;
        const kg = c.createGain(); kg.gain.value = k; osc.connect(bp).connect(kg).connect(mix);
      }
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.3;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * vol, t + 0.012);
      g.gain.setValueAtTime(0.17 * vol, t + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      mix.connect(lp).connect(g).connect(out);
      osc.start(t); osc.stop(t + len + 0.02);
      if (!o.overlap) this.voices.push({ osc, end: t + len });
      t += len + (R() < 0.15 ? rnd(0.06, 0.12) : rnd(0.012, 0.03));
    }
    this.voiceUntil = o.overlap ? this.voiceUntil : t;
  }
  // 换下一句 / 关掉对话：没念完的音节马上停
  hush() {
    this.voiceUntil = 0;
    if (!this.ready) return;
    const now = this.c.currentTime;
    for (const v of this.voices) if (v.end > now) try { v.osc.stop(now + 0.01); } catch { /* 已经停了 */ }
    this.voices = [];
  }

  // ================= 界面 / 拾取 / 奖励 =================
  cue(kind) {
    if (!this.ok) return;
    const t = this.c.currentTime, o = this.fxBus, B = (p) => this.burst(o, t + (p.off || 0), p);
    if (t - (this.cueT[kind] ?? -1) < 0.07) return; // 一下子来好几个（一次拿好几样奖励）只响一声
    this.cueT[kind] = t;
    switch (kind) {
      case 'click': // 按钮："嗒"——木头的闷声
        B({ dur: 0.035, lp: 1800, lp1: 700, hp: 250, gain: 0.34, attack: 0.002 });
        B({ dur: 0.05, lp: 420, lp1: 200, gain: 0.24, attack: 0.003 });
        break;
      case 'deny': // 点了不能用的按钮：低一点、钝一点
        B({ dur: 0.08, lp: 500, lp1: 160, gain: 0.25, attack: 0.004 });
        B({ dur: 0.08, lp: 500, lp1: 160, gain: 0.18, attack: 0.004, off: 0.09 });
        break;
      case 'open': // 打开面板：纸页展开的"唰"
        B({ dur: 0.2, lp: 1200, lp1: 3600, hp: 500, gain: 0.12, attack: 0.06, jit: 0.5 });
        break;
      case 'close':
        B({ dur: 0.14, lp: 3200, lp1: 900, hp: 400, gain: 0.1, attack: 0.02, jit: 0.5 });
        break;
      case 'page': // 对话翻页 / 旁白：轻轻的翻纸声
        B({ dur: 0.1, lp: 2800, lp1: 1200, hp: 700, gain: 0.07, attack: 0.02, jit: 0.6 });
        break;
      case 'toast':
        B({ dur: 0.08, lp: 1400, lp1: 600, hp: 200, gain: 0.3, attack: 0.008 });
        break;
      case 'pickup': // 捡到东西：轻"嘟"（布袋）+ 一声高一点的古筝
        B({ dur: 0.07, lp: 900, lp1: 1800, hp: 200, gain: 0.12, attack: 0.01 });
        this.pluck(74 + pick([0, 2, 4]), t + 0.02, 0.18, this.fxBus);
        break;
      case 'money': // 收钱：布钱袋里铜钱沙沙响（几粒很短的低通噪声），不要金属"叮"
        for (let i = 0; i < 5; i++) B({ dur: 0.025, lp: rnd(1800, 2600), lp1: 900, hp: 500, gain: rnd(0.07, 0.12), attack: 0.002, off: i * rnd(0.02, 0.04) });
        B({ dur: 0.09, lp: 600, lp1: 250, gain: 0.12, attack: 0.008, off: 0.03 });
        break;
      case 'use': // 吃药 / 用东西："咕嘟"——低通噪声晃两下
        B({ dur: 0.1, lp: 700, lp1: 300, gain: 0.18, attack: 0.02, jit: 0.5 });
        B({ dur: 0.1, lp: 800, lp1: 320, gain: 0.15, attack: 0.02, jit: 0.5, off: 0.13 });
        break;
      case 'quest': // 任务完成：古筝五声音阶往上一串
        [62, 64, 66, 69, 71, 74].forEach((m, i) => this.pluck(m, t + i * 0.075, 0.12 - i * 0.008, this.fxBus));
        this.pluck(50, t, 0.12, this.fxBus);
        break;
      case 'levelup': // 突破：低音一拨 + 两串往上的琶音
        this.pluck(38, t, 0.16, this.fxBus); this.pluck(45, t + 0.02, 0.12, this.fxBus);
        [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => this.pluck(m, t + 0.12 + i * 0.06, 0.1, this.fxBus));
        B({ dur: 1.2, lp: 600, lp1: 2400, hp: 200, gain: 0.1, attack: 0.5 }); // 灵气上涌的风声
        break;
      case 'discover': // 发现地标
        [57, 62, 66, 69].forEach((m, i) => this.pluck(m, t + i * 0.14, 0.2, this.fxBus));
        break;
      case 'sleep':
        [69, 66, 62, 57, 50].forEach((m, i) => this.pluck(m, t + i * 0.3, 0.16, this.fxBus));
        break;
      case 'hurt': // 玩家挨打的一声"嗯"（人声，很短）
        this.talk('玩家·痛', '呃', { max: 1, vol: 0.6 });
        break;
    }
  }

  // ================= 古筝拨弦（Karplus-Strong，离线算好缓存成 AudioBuffer） =================
  ksBuf(m) {
    if (this.ks.has(m)) return this.ks.get(m);
    const c = this.c, sr = c.sampleRate, f = midiHz(m), N = Math.round(sr / f), len = Math.floor(sr * (m < 50 ? 3.2 : 2.4));
    const b = c.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = (R() * 2 - 1) * (0.5 + 0.5 * Math.sin(Math.PI * i / N)); // 拨在弦中间偏一点：少一点刺耳的高次
    let p = 0, prev = 0;
    const damp = 0.4985 + Math.min(0.0012, (60 - Math.min(60, m - 30)) * 0.00002); // 低音弦余音长
    for (let i = 0; i < len; i++) {
      const cur = ring[p], next = ring[(p + 1) % N];
      const v = damp * (cur + next); ring[p] = v; p = (p + 1) % N;
      prev = prev * 0.25 + v * 0.75; d[i] = prev;
    }
    // 起音：古筝"嘣"的一下有一点指甲声，用渐弱的噪声代替
    for (let i = 0; i < Math.min(len, sr * 0.006); i++) d[i] += (R() * 2 - 1) * 0.15 * (1 - i / (sr * 0.006));
    this.ks.set(m, b); return b;
  }
  pluck(m, t, gain, out = this.musicBus, bend = 0) {
    const c = this.c, s = c.createBufferSource(); s.buffer = this.ksBuf(Math.round(m));
    if (bend) { s.playbackRate.setValueAtTime(1, t + 0.12); s.playbackRate.linearRampToValueAtTime(Math.pow(2, bend / 12), t + 0.32); } // 古筝按弦的滑音
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.3;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(lp).connect(g).connect(out); s.start(t);
  }
  // 箫：正弦 + 气声，慢起音、带颤音
  xiao(m, t, dur, gain) {
    const c = this.c, f = midiHz(m), o = c.createOscillator(), vib = c.createOscillator(), vg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f; vib.frequency.value = 5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.6);
    vib.connect(vg).connect(o.frequency);
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = 0.12; o2.connect(g2).connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.25, dur * 0.3)); g.gain.setValueAtTime(gain * 0.85, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.3;
    o.connect(g); g.connect(lp).connect(this.musicBus);
    this.burst(this.musicBus, t, { dur: dur * 0.9, lp: 1800, lp1: 1200, hp: 600, gain: gain * 0.18, attack: 0.15 }); // 气声
    for (const x of [o, vib, o2]) { x.start(t); x.stop(t + dur + 0.05); }
  }
  // 鼓：低通噪声的"咚"（不带音高、起音不尖），小鼓边用高通一点的噪声
  drum(t, k, big) {
    if (big) { this.burst(this.musicBus, t, { dur: 0.32, lp: 260, lp1: 70, gain: 2.2 * k, attack: 0.008 }); this.burst(this.musicBus, t, { dur: 0.06, lp: 1200, lp1: 500, hp: 200, gain: 0.35 * k, attack: 0.003 }); }
    else this.burst(this.musicBus, t, { dur: 0.08, lp: 2400, lp1: 1000, hp: 700, gain: 0.35 * k, attack: 0.003 });
  }
  // 每帧：排下一小段音乐（提前 0.35 秒）
  music(dt) {
    const c = this.c, now = c.currentTime, M = this.M;
    if (this.nextT < now) this.nextT = now + 0.05;
    while (this.nextT < now + 0.35) {
      const t = this.nextT, spb = 60 / M.bpm / 2; // 八分音符
      const b = this.beat++, bar = b % 16;
      if (bar === 0 || !this.phrase.length) this.newPhrase();
      const note = this.phrase[bar];
      if (note != null) {
        const m = degMidi(M, note);
        this.pluck(m, t + rnd(0, 0.012), 0.17 + R() * 0.05, this.musicBus, R() < 0.08 ? (R() < 0.5 ? 1 : 2) : 0);
        if (R() < 0.12 && M.bpm < 90) this.pluck(m + 12, t + 0.06, 0.06); // 偶尔泛音
      }
      if (bar % 8 === 0) { this.pluck(degMidi(M, bar === 0 ? 0 : pick([0, 3, 4])) - 12, t, 0.2); if (R() < 0.5) this.pluck(degMidi(M, 3) - 12, t + spb * 2, 0.12); }
      if (M.flute && bar === 0 && R() < M.flute * 0.5) { const d = degMidi(M, M.reg[1] - 2 - Math.floor(R() * 3)); this.xiao(d, t + spb * 2, spb * rnd(5, 9), 0.06); }
      if (M.drum) {
        const k = M.drum, pat = [1, 0, 0, 2, 1, 0, 2, 0, 1, 0, 1, 2, 1, 0, 2, 2];
        if (pat[bar] === 1) this.drum(t, k, true); else if (pat[bar] === 2) this.drum(t, k * 0.8, false);
      }
      this.nextT += spb * (b % 2 ? 0.96 : 1.04); // 一点点摇摆
    }
  }
  newPhrase() {
    const M = this.M, ph = new Array(16).fill(null);
    let d = clamp(this.melDeg, M.reg[0], M.reg[1]);
    // 古筝开头常有的一串"刮奏"
    if (R() < 0.18) { for (let i = 0; i < 4; i++) ph[i] = d - 3 + i; d += 1; }
    for (let i = 0; i < 16; i++) {
      if (ph[i] != null) continue;
      const strong = i % 4 === 0;
      if (R() < (strong ? M.dens + 0.2 : M.dens * 0.7)) {
        d += pick([-2, -1, -1, 1, 1, 2, 0, R() < 0.2 ? 3 : -3]);
        if (d < M.reg[0]) d = M.reg[0] + 1; if (d > M.reg[1]) d = M.reg[1] - 1;
        ph[i] = d;
      }
    }
    ph[14] = null; ph[15] = null; if (R() < 0.7) ph[12] = Math.round(d / 5) * 5; // 句尾落在主音上、留白
    this.melDeg = d; this.phrase = ph;
  }
  // ================= 音乐文件 =================
  // 读进来后按响度归一化：取最响的那 50% 片段的 RMS 对齐到同一个目标，再保证峰值不超过 0.9
  async loadTracks() {
    this.tracks = [];
    let have = [];
    try { have = await (await fetch('assets/music/index.json')).json(); } catch { /* 没有清单就全用合成古筝 */ }
    for (const T of MUSIC) {
      if (!have.includes(T.file.split('/').pop())) continue; // 只读清单里真有的文件，免得 404
      try {
        const r = await fetch(T.file); if (!r.ok) continue;
        const buf = await this.c.decodeAudioData(await r.arrayBuffer());
        const d = buf.getChannelData(0), win = Math.floor(buf.sampleRate * 0.4), rms = [];
        let peak = 0;
        for (let i = 0; i + win <= d.length; i += win) { let s = 0; for (let j = i; j < i + win; j += 4) { const v = d[j]; s += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); } rms.push(Math.sqrt(s / (win / 4))); }
        rms.sort((a, b) => b - a);
        const loud = rms.slice(0, Math.max(1, rms.length >> 1)), level = loud.reduce((a, b) => a + b, 0) / loud.length || 1e-3;
        T.norm = Math.min(0.12 / level, 0.9 / (peak || 1)); T.buf = buf;
        this.tracks.push(T);
      } catch { /* 文件坏了 / 没有：跳过，用合成古筝 */ }
    }
  }
  pickTrack(mood) {
    const list = (this.tracks || []).filter((T) => T.moods.includes(mood));
    if (!list.length) return null;
    if (this.cur && list.includes(this.cur.T) && !this.cur.ended) return this.cur.T; // 正在放的还能用就接着放
    return list[Math.floor(R() * list.length)];
  }
  playTrack(T) {
    const c = this.c, t = c.currentTime, FADE = 2.5;
    if (this.cur) { const o = this.cur; o.g.gain.setTargetAtTime(0, t, FADE / 3); try { o.s.stop(t + FADE * 2); } catch { /* 已停 */ } this.cur = null; }
    if (!T) return;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = T.buf;
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(T.norm * 0.45, t, FADE / 3); // 0.45：和合成古筝差不多响
    s.connect(g).connect(this.musicBus); s.start(t);
    const cur = this.cur = { T, s, g, ended: false };
    s.onended = () => { cur.ended = true; if (this.cur === cur) this.cur = null; }; // 放完一首换下一首（同情况里随机）
  }
  credits() { return MUSIC.filter((T) => T.credit && this.tracks?.includes(T)).map((T) => T.credit); }

  setMood(id) {
    if (id === this.mood || !MOODS[id]) return;
    const fast = (id === 'fight' || id === 'boss') !== (this.mood === 'fight' || this.mood === 'boss');
    this.mood = id; this.M = MOODS[id];
    if (fast) { this.beat = 0; this.phrase = []; } // 进出战斗马上换，其余等这一句结束
  }

  // ================= 每帧更新 =================
  // s = { x, z, speed, run, surf, fly, swim, wade, dead, title, inside, mine, sector, biome, village, night, hours, season, rain, snow, wetRoof,
  //       waterNear, waterfallNear, fight, boss, npcs:[{name, d}] , paused }
  update(dt, s) {
    if (!this.ok) return;
    const c = this.c, t = c.currentTime;
    // ---- 脚步：按走过的距离出声，跑起来步子大、步频快 ----
    if (!s.title && !s.dead && !s.fly && !s.swim && s.speed > 0.6 && !s.paused) {
      this.stepDist += s.speed * dt;
      const stride = 0.75 + s.speed * 0.13;
      if (this.stepDist > stride) { this.stepDist -= stride; this.step(s.wade > 0.03 ? 'water' : s.surf, s.run, 1); }
    } else this.stepDist = 0.5;
    // ---- 背景音乐的情绪 ----
    let mood = s.title ? 'title' : s.mine ? 'mine' : s.village ? (s.night ? 'night' : 'village')
      : s.biome > 0.5 && s.sector === 'snow' ? 'snow' : s.biome > 0.5 && s.sector === 'desert' ? 'desert'
      : s.biome > 0.5 && (s.sector === 'swamp' || s.sector === 'battle' || s.sector === 'volcano') ? 'dark' : s.night ? 'night' : 'wild';
    if (s.fight) this.fightT = 4; else this.fightT -= dt; // 脱战 4 秒后才收
    if (s.boss) mood = 'boss'; else if (this.fightT > 0) mood = 'fight';
    this.setMood(mood);
    // 标题画面、开着菜单 / 面板、联机时不放背景音乐（环境声、脚步照常）
    const off = !!(s.title || s.menu || s.coop);
    if (off !== this.musicOff) { this.musicOff = off; this.musicBus.gain.setTargetAtTime(off ? 0 : this.vol.music * 0.96, t, 0.35); }
    // 这种情况有音乐文件就放文件（交叉淡入淡出），没有就放合成古筝
    const want = off ? null : this.pickTrack(mood);
    if (want !== (this.cur?.T || null)) this.playTrack(want);
    this.nextT = 0; // 只放音乐文件，不再用合成古筝（用户要求）
    // ---- 持续环境声 ----
    const L = this.L, set = (o, v, tc = 0.6) => o.g.gain.setTargetAtTime(v, t, tc);
    const outside = !s.inside && !s.mine, B = s.biome > 0.5 ? s.sector : '';
    const windK = s.title ? 0.4 : (s.fly ? 1 : 0.35) + (B === 'snow' ? 0.5 : B === 'desert' ? 0.45 : B === 'battle' ? 0.35 : 0) + s.snow * 0.2;
    const gust = 0.6 + 0.4 * Math.sin(t * 0.23) * Math.sin(t * 0.61 + 1);
    set(L.wind, outside ? 0.05 * windK * gust : 0.008); L.wind.f.frequency.setTargetAtTime(250 + 500 * gust * windK + (s.fly ? 600 : 0), t, 0.5);
    set(L.rain, outside ? 0.065 * s.rain * (1 - s.snow * 0.85) : 0.014 * s.rain); // 雨声压低一些（用户：雨太吵）
    set(L.roof, (s.inside ? 0.08 : 0.018) * s.rain * (1 - s.snow)); L.roof.f.frequency.setTargetAtTime(s.inside ? 700 : 1500, t, 0.3);
    const wn = s.mine ? 0 : s.waterNear, wf = s.mine ? 0 : s.waterfallNear;
    set(L.water, 0.07 * wn * (s.winter ? 0.25 : 1), 0.3); L.water.f.frequency.setValueAtTime(700 + R() * 1300, t); // 每帧乱跳的截止 = 潺潺
    set(L.fall, 0.1 * wf * (s.winter ? 0.15 : 1), 0.3);
    set(L.rumble, s.mine ? 0.1 : B === 'volcano' ? 0.14 : 0);
    set(L.cave, s.mine ? 0.025 : 0);
    set(L.fire, B === 'volcano' && outside ? 0.015 : 0);
    set(L.crowd, s.village && !s.night && outside && s.rain < 0.5 ? 0.012 : 0, 1);
    // ---- 随机出现的环境声 ----
    const E = this.evT; for (const k in E) E[k] -= dt;
    const day = !s.night && s.hours > 5.5, quiet = s.rain > 0.4 || s.title;
    const lively = outside && !quiet && B !== 'desert' && B !== 'volcano' && B !== 'battle';
    if (E.bird < 0 && day && lively && s.season !== 3) { E.bird = rnd(1.5, s.village ? 6 : 3.5); this.bird(); }
    if (E.owl < 0 && s.night && outside && !quiet && B !== 'desert' && B !== 'volcano') { E.owl = rnd(14, 30); this.owl(); }
    if (E.cricket < 0 && s.night && outside && !quiet && (s.season === 1 || s.season === 2 || (s.season === 0 && R() < 0.4)) && B !== 'snow') { E.cricket = rnd(0.4, 1.2); this.cricket(); }
    if (E.frog < 0 && outside && !quiet && s.season !== 3 && (B === 'swamp' || (s.night && wn > 0.2))) { E.frog = rnd(0.8, 3); this.frog(); }
    if (E.drip < 0 && (s.mine || (s.rain > 0.3 && s.inside))) { E.drip = rnd(0.6, 2.5); waterVoice(c, this.ambBus, this.nb, 'step', 0.12, t); this.burst(this.ambBus, t, { dur: 0.05, lp: 2200, lp1: 900, gain: 0.05, attack: 0.004 }); }
    if (E.crackle < 0 && B === 'volcano' && outside) { E.crackle = rnd(0.1, 0.6); this.burst(this.ambBus, t, { dur: rnd(0.01, 0.03), lp: 3200, lp1: 1500, hp: 900, gain: rnd(0.03, 0.08), attack: 0.001 }); }
    if (E.crow < 0 && B === 'battle' && outside && !quiet) { E.crow = rnd(6, 16); this.crow(); }
    if (E.gust < 0 && outside && (B === 'snow' || B === 'desert' || s.fly)) { E.gust = rnd(4, 10); this.burst(this.ambBus, t, { dur: rnd(1.5, 3), lp: 300, lp1: 1400, hp: 120, gain: 0.06, attack: 0.8, jit: 0.3, curve: 0.8 }); }
    // 村民闲聊：附近的人偶尔自言自语 / 互相聊两句（越远越小声、越闷）
    if (E.chat < 0 && !s.paused && s.npcs?.length) {
      E.chat = rnd(2.5, 6);
      const v = pick(s.npcs);
      if (v && v.d < 10) {
        const k = 1 - v.d / 10, lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3; lp.frequency.value = 900 + 2400 * k; lp.connect(this.voiceBus);
        this.talk(v.name, '嗯嗯好的今天天气'.slice(0, 3 + Math.floor(R() * 6)), { out: lp, vol: 0.25 + 0.5 * k, max: 7, overlap: true });
      }
    }
  }
  bird() {
    const c = this.c, t = c.currentTime + 0.02, base = rnd(2400, 3600), n = 2 + Math.floor(R() * 5), kind = Math.floor(R() * 3), vol = rnd(0.015, 0.04);
    for (let i = 0; i < n; i++) {
      const st = t + i * (kind === 1 ? 0.09 : rnd(0.1, 0.18)), len = kind === 2 ? 0.16 : rnd(0.04, 0.08);
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      const f0 = base * (kind === 2 ? 0.7 : rnd(0.85, 1.15));
      o.frequency.setValueAtTime(f0, st); o.frequency.exponentialRampToValueAtTime(f0 * (kind === 0 ? 1.5 : kind === 1 ? 0.75 : 1.25), st + len);
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(vol, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + len);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.3;
      o.connect(g).connect(lp).connect(this.ambBus); o.start(st); o.stop(st + len + 0.02);
    }
  }
  owl() { // 猫头鹰"咕——咕咕"：低沉、柔
    const c = this.c, t = c.currentTime;
    [[0, 0.35], [0.55, 0.16], [0.78, 0.4]].forEach(([d, len]) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(400, t + d); o.frequency.linearRampToValueAtTime(370, t + d + len);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(0.03, t + d + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      o.connect(g).connect(this.ambBus); o.start(t + d); o.stop(t + d + len + 0.05);
    });
  }
  cricket() { // 蟋蟀：带通噪声快速一开一合（不是正弦"叮"）
    const c = this.c, t = c.currentTime, f = rnd(3800, 4800), n = 3 + Math.floor(R() * 4), v = rnd(0.04, 0.08);
    const s = c.createBufferSource(); s.buffer = this.nb; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4;
    const g = c.createGain(); g.gain.value = 0;
    for (let i = 0; i < n; i++) { const st = t + i * 0.055; g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(v, st + 0.008); g.gain.linearRampToValueAtTime(0, st + 0.04); }
    s.connect(bp).connect(g).connect(this.ambBus); s.start(t, R()); s.stop(t + n * 0.055 + 0.05);
  }
  frog() { // 蛙："呱呱"——低频脉冲过低通
    const c = this.c, t = c.currentTime, n = 1 + Math.floor(R() * 3), f = rnd(140, 220);
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.22, o = c.createOscillator(), am = c.createOscillator(), ag = c.createGain(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; am.frequency.value = rnd(22, 34); ag.gain.value = 0.5;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(0.03, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.14);
      const amg = c.createGain(); amg.gain.value = 0.5; am.connect(ag).connect(amg.gain);
      o.connect(amg).connect(lp).connect(g).connect(this.ambBus);
      o.start(st); am.start(st); o.stop(st + 0.16); am.stop(st + 0.16);
    }
  }
  crow() { // 乌鸦"呀——"：沙哑的人声式合成，远远的
    const lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 0.3; lp.connect(this.ambBus);
    this.voiceUntil = 0; this.talk('乌鸦', '呀呀呀'.slice(0, 1 + Math.floor(R() * 3)), { out: lp, vol: 0.35, max: 3, overlap: true });
  }
}
