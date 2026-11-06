// 云同步：本机存档为主，云端做同步和备份。玩家不用登录——第一次打开自动用游客（匿名）账号；
// 觉得好玩再用 Google 登录，游客账号直接升级成正式账号，云端进度原封不动跟过去；
// 换设备 / 清了缓存，登录同一个 Google 账号就能接着玩。
//
// 每次对一下：拿云端 → saveFormat.decide() → 上传 / 拉下来 / 两边都改过就让玩家选（不会悄悄覆盖）。
// 什么时候对：开游戏、写存档（最多 20 秒一次）、切到后台、登录 / 退出、菜单里「立即同步」。
// 上传是事务：云端在这期间被别的设备改了就不写，重新对一次。
import { localSave, localEnvelope, putLocalEnvelope, onWrite, clearedSid, wipeLocalSave } from '../save.js';
import { decide, stamp, migrate } from '../saveFormat.js';
import { FIREBASE_CONFIG } from './config.js';
import { MockBackend } from './mock.js';

const BASE = 'lingtian-cloud-base';   // 这台设备上次和云端对上的 { uid, sid, rev }
const GAP = 20000;                    // 两次上传至少隔 20 秒

async function pickBackend() {
  const q = new URLSearchParams(location.search).get('cloud') || '';
  if (q === 'off') return null;
  if (q === 'emulator') { const m = await import('./firebase.js'); return new m.FirebaseBackend(m.EMULATOR_CONFIG, true); }
  if (FIREBASE_CONFIG && !q.startsWith('mock')) return new (await import('./firebase.js')).FirebaseBackend(FIREBASE_CONFIG);
  return new MockBackend();
}
const hhmm = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export class CloudSync {
  constructor() {
    this.be = null; this.user = null;
    this.state = 'connecting';   // off | connecting | ok | offline | conflict | future
    this.msg = ''; this.lastSync = 0; this.lastPush = 0; this.timer = 0;
    this.conflict = null;        // { local, doc } 两边都改过、等玩家选
    this.subs = [];
    this.canPull = () => true;   // 游戏设：现在能不能把本机存档换成云端的（联机在道友房间里时不能）
    onWrite(() => this.schedulePush());
    addEventListener('visibilitychange', () => { if (document.hidden && this.timer) this.pushNow(); });
    this.ready = this.start();
  }
  get mode() { return this.be?.name || 'off'; }
  // 订阅：fn(事件, cloud)。事件：'state' 状态变了 | 'pulled' 本机存档被换成云端的 | 'conflict' 要玩家选 | 'user' 账号变了
  sub(fn) { this.subs.push(fn); }
  emit(ev) { for (const f of this.subs) try { f(ev, this); } catch (e) { console.error(e); } }
  set(state, msg = '') { this.state = state; this.msg = msg; this.emit('state'); }
  // 连不上：过一会儿自己再试（15 秒、30 秒、1 分钟… 最多 4 分钟一次），不用等下次存档
  fail(e) {
    console.warn('[cloud]', e); this.set('offline', e?.message || String(e));
    if (this.halted || !this.be) return;
    clearTimeout(this.retryT);
    this.retryDelay = Math.min(240000, (this.retryDelay || 7500) * 2);
    this.retryT = setTimeout(() => this.sync(), this.retryDelay);
  }
  // 标题画面最多等 ms 毫秒
  whenReady(ms) { return Promise.race([this.ready, new Promise((r) => setTimeout(r, ms))]); }

  // 连上云端（游客自动登录）再对一次。同一时间只跑一个，不然会建出两个游客账号
  start() { return (this.starting ??= this.start1().finally(() => { this.starting = null; })); }
  async start1() {
    try { this.be ??= await pickBackend(); } catch (e) { return this.fail(e); }
    if (!this.be) return this.set('off');
    this.set('connecting');
    try {
      this.user = (await this.be.init()) || (await this.be.signInAnon());
      this.emit('user');
      await this.sync();
    } catch (e) { this.fail(e); }
  }

  base() { try { const b = JSON.parse(localStorage.getItem(BASE)); return b && b.uid === this.user?.uid ? b : null; } catch { return null; } }
  setBase(st) { try { if (st) localStorage.setItem(BASE, JSON.stringify({ uid: this.user.uid, sid: st.sid, rev: st.rev })); } catch { /* 存不了就算了 */ } }

  // 对一次
  async sync() {
    if (this.halted) return;
    if (!this.user) return this.start();   // 刚才没连上：重来
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      for (let tries = 0; tries < 3; tries++) {
        if (localSave()?.status === 'future') return this.set('future', '这台设备上的存档来自更新的游戏版本，请刷新页面');
        const doc = await this.be.get(this.user.uid), L = localEnvelope();
        const act = decide(L, doc, this.base(), clearedSid());
        if (act === 'future') return this.set('future', `云端存档来自更新的游戏版本 ${doc.game}，请刷新页面`);
        if (act === 'ask') { this.conflict = { local: L, doc }; this.set('conflict'); this.emit('conflict'); return; }
        if (act === 'pull' && !this.canPull()) return;   // 先不换，回到自己的世界后下次同步再说
        if (act === 'pull') this.pull(doc);
        else if (act === 'push') { try { await this.push(L, doc); } catch (e) { if (e.code === 'conflict') continue; throw e; } }
        else if (act === 'same') this.setBase(stamp(L));
        this.conflict = null; this.lastSync = Date.now(); this.retryDelay = 0; clearTimeout(this.retryT);
        return this.set('ok');
      }
      throw new Error('云端一直在变，稍后再试');
    } catch (e) { this.fail(e); } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.sync(); }
    }
  }

  pull(doc) {
    const m = migrate(doc.data);
    if (m.status !== 'ok') throw new Error('云端存档读不出来（' + m.status + '）');
    putLocalEnvelope(m.data);
    this.setBase(stamp(doc));
    this.emit('pulled');
  }
  // keepPrev：被换掉的云端存档总是留在 prev 里（玩家在冲突里选了本机时）；
  // 平时只有换了一条存档线（新的开始）才把旧的那条留进 prev
  async push(L, doc, keepPrev = false) {
    const st = stamp(L), data = JSON.stringify(L);
    await this.be.put(this.user.uid, (cur) => {
      const n = { v: L.v, sid: st.sid, rev: st.rev, at: st.at, text: st.text, game: st.game, data };
      if (cur) n.prev = keepPrev || cur.sid !== st.sid ? { sid: cur.sid, rev: cur.rev, at: cur.at, text: cur.text, game: cur.game || '', data: cur.data } : (cur.prev || null);
      return n;
    }, doc ? { sid: doc.sid, rev: doc.rev } : null);
    this.setBase(st); this.lastPush = Date.now();
  }

  schedulePush() {
    if (!this.be || this.state === 'conflict' || this.state === 'future') return;
    clearTimeout(this.timer);
    const wait = this.lastPush + GAP - Date.now();
    if (wait <= 0) this.pushNow(); else this.timer = setTimeout(() => this.pushNow(), wait);
  }
  pushNow() { clearTimeout(this.timer); this.timer = 0; this.lastPush = Date.now(); this.sync(); }
  // 等手上的同步做完，再对一次（测试「换设备」前把最新进度传上去）
  async flush() {
    clearTimeout(this.timer); this.timer = 0;
    while (this.busy) await new Promise((r) => setTimeout(r, 50));
    await this.sync();
  }
  halt() { clearTimeout(this.timer); clearTimeout(this.retryT); this.timer = 0; this.halted = true; }   // 要刷新页面了，别再同步

  // 冲突里玩家选了：'local' 用这台设备的（云端那份留在 prev），'cloud' 用云端的（本机那份留在 .bak）
  async resolve(which) {
    const c = this.conflict; if (!c) return;
    try {
      if (which === 'cloud') this.pull(c.doc);
      else await this.push(localEnvelope(), c.doc, true);
      this.conflict = null; this.lastSync = Date.now(); this.set('ok');
    } catch (e) {
      if (e.code === 'conflict') { this.conflict = null; return this.sync(); }   // 这期间云端又变了：重新对
      this.fail(e);
    }
  }

  // 用 Google 登录。要在点击里直接调用（Firebase 弹窗不能隔着别的 await）。
  // 返回 null 取消 | 'linked' 游客账号升级（同一份云端存档）| 'switched' 登进了以前就有的账号 | 'error'
  async login() {
    if (!this.be) return 'error';
    let r;
    try { r = await this.be.linkGoogle(); } catch (e) { this.fail(e); return 'error'; }
    if (!r) return null;
    this.user = r.user; this.emit('user');
    await this.sync();
    return r.switched ? 'switched' : 'linked';
  }
  // 退出：本机存档留着，换回一个新的游客账号（相当于这台设备从头开始同步）
  async logout() {
    try {
      await this.be.signOut();
      this.user = await this.be.signInAnon(); this.emit('user');
      await this.sync();
    } catch (e) { this.fail(e); }
  }

  statusText() {
    const who = !this.user ? '' : this.user.anon ? '游客' : (this.user.email || this.user.name || '已登录');
    const sim = this.mode === 'mock' ? '（模拟）' : '';
    switch (this.state) {
      case 'off': return '☁ 云存档已关闭';
      case 'connecting': return '☁ 正在连接云存档…';
      case 'ok': return `☁ ${who} · 已同步 ${hhmm(this.lastSync)}${sim}`;
      case 'conflict': return `☁ 这台设备和云端的存档不一样，等你选${sim}`;
      case 'future': return `☁ ${this.msg}`;
      default: return `☁ 连不上云端，先存在本机，连上后自动上传${sim}`;
    }
  }

  // —— 只有模拟云端才有：作弊面板测试用 ——
  // 模拟换一台设备：清掉本机存档、同步记录和登录状态，「服务器」留着
  static forgetDevice() { wipeLocalSave(); localStorage.removeItem(BASE); MockBackend.forgetDevice(); }
  static wipeMock() { MockBackend.wipe(); localStorage.removeItem(BASE); }
  static mockStats() { return MockBackend.stats(); }
}
