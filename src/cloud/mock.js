// 模拟云端：和 firebase.js 同一套接口、同样的行为，数据存在这台浏览器的 localStorage 里。
// 用来在没有 Firebase 账号时把整个流程跑通；接上真的 Firebase 后这个文件只在 ?cloud=mock 时用。
//
//   「服务器」  lingtian-mockcloud          { docs: { uid: 文档 }, accounts: { 邮箱: uid } }
//   「登录状态」lingtian-mockcloud-session  当前 uid（相当于 Firebase 存在浏览器里的登录）
// 作弊面板「模拟换一台设备」= 清掉本机存档和登录状态、留着「服务器」，用来试登录接续进度。
// ?cloud=mock-offline 模拟断网。

const SERVER = 'lingtian-mockcloud', SESSION = 'lingtian-mockcloud-session';
const wait = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 230));   // 假装有网络延迟
const offline = () => /[?&]cloud=mock-offline\b/.test(location.search);
const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
const sameStamp = (a, b) => (!a && !b) || (!!a && !!b && a.sid === b.sid && a.rev === b.rev);

function db() { try { return JSON.parse(localStorage.getItem(SERVER)) || { docs: {}, accounts: {} }; } catch { return { docs: {}, accounts: {} }; } }
const saveDb = (d) => localStorage.setItem(SERVER, JSON.stringify(d));
const userOf = (uid, d = db()) => {
  const email = Object.keys(d.accounts).find((e) => d.accounts[e] === uid) || null;
  return { uid, anon: !email, email, name: email ? email.split('@')[0] : null };
};

export class MockBackend {
  constructor() { this.name = 'mock'; this.uid = null; }
  async net() { await wait(); if (offline()) throw fail('unavailable', '（模拟）连不上云端'); }

  async init() {
    await this.net();
    let uid = null; try { uid = localStorage.getItem(SESSION); } catch { /* 无痕 */ }
    this.uid = uid;
    return uid ? userOf(uid) : null;
  }
  async signInAnon() {
    await this.net();
    this.uid = 'mock-' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(SESSION, this.uid);
    return userOf(this.uid);
  }
  // 游客账号绑上 Google：uid 不变，云端存档自然跟过去。
  // 这个 Google 账号已经绑过别的 uid（在别的设备玩过）→ 改登那个账号，switched = true（同 Firebase 的 credential-already-in-use）
  async linkGoogle() {
    const email = prompt('（模拟 Google 登录）输入邮箱：\n用同一个邮箱在「换一台设备」后登录，就能接着玩', 'player@example.com');
    if (!email || !email.includes('@')) return null;   // 取消
    await this.net();
    const d = db(), key = email.trim().toLowerCase(), owner = d.accounts[key];
    if (!this.uid && !owner) this.uid = 'mock-' + Math.random().toString(36).slice(2, 12);   // 刚才连不上、还没有游客账号
    if (owner && owner !== this.uid) {
      this.uid = owner; localStorage.setItem(SESSION, owner);
      return { user: userOf(owner, d), switched: true };
    }
    d.accounts[key] = this.uid; saveDb(d); localStorage.setItem(SESSION, this.uid);
    return { user: userOf(this.uid, d), switched: false };
  }
  async signOut() { await wait(); this.uid = null; localStorage.removeItem(SESSION); }

  async get(uid) {
    await this.net();
    if (uid !== this.uid) throw fail('permission-denied');   // 同 firestore.rules：只能读自己的
    const doc = db().docs[uid];
    return doc ? structuredClone(doc) : null;
  }
  // make(当前云端文档) → 新文档；expect = 上传前看到的云端 { sid, rev }（或 null = 那时云端没有）。
  // 云端这期间被别处改过就拒绝（code 'conflict'），同 firebase.js 的事务
  async put(uid, make, expect) {
    await this.net();
    if (uid !== this.uid) throw fail('permission-denied');
    const d = db(), cur = d.docs[uid] || null;
    const seen = cur ? { sid: cur.sid, rev: cur.rev } : null;
    if (!sameStamp(seen, expect)) throw fail('conflict', '云端存档刚被别处改过');
    const doc = make(cur ? structuredClone(cur) : null);
    if (doc.data.length > 400000) throw fail('invalid-argument', '存档太大');   // 同 firestore.rules
    d.docs[uid] = { ...doc, updated: Date.now() }; saveDb(d);
    return structuredClone(d.docs[uid]);
  }

  // —— 只有模拟才有：测试用 ——
  static forgetDevice() { localStorage.removeItem(SESSION); }
  static wipe() { localStorage.removeItem(SERVER); localStorage.removeItem(SESSION); }
  static stats() { const d = db(); return { docs: Object.keys(d.docs).length, accounts: Object.keys(d.accounts).length, bytes: (localStorage.getItem(SERVER) || '').length }; }
}
