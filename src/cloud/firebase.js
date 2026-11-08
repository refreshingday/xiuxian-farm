// 真的 Firebase：匿名登录（游客）+ Google 登录 + Firestore，接口和 mock.js 一样。
// SDK 从 Google 官方 CDN 按需加载，没配 FIREBASE_CONFIG 时完全不加载。
// 云端一个玩家一份文档：saves/{uid} = { v, sid, rev, at, text, game, data: 存档 JSON 字符串, prev?: 上一条存档线 }
// （存成字符串：Firestore 不收「数组里套数组」，灵田等模块的存档里有）
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
const sameStamp = (a, b) => (!a && !b) || (!!a && !!b && a.sid === b.sid && a.rev === b.rev);
// 连不上就报「离线」的时限。标题画面最多只等 4 秒，这里放宽些：手机上游戏加载时主线程很忙，SDK 加载会慢
const timeout = (p, ms = 20000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(fail('unavailable', '连不上云端')), ms))]);
const CANCEL = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

// ?cloud=emulator：连本机的 Firebase 模拟器（firebase emulators:start，见 docs/CLOUD_SAVE.md），不需要真的项目
export const EMULATOR_CONFIG = { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-lingtian', appId: '1:1:web:1' };

export class FirebaseBackend {
  constructor(config, emulator = false) { this.name = emulator ? 'emulator' : 'firebase'; this.config = config; this.emulator = emulator; }
  user() {
    const u = this.auth.currentUser;
    return u ? { uid: u.uid, anon: u.isAnonymous, email: u.email, name: u.displayName || u.email } : null;
  }
  // 只初始化一次（重试时上次那次可能还在进行，不能 initializeApp 两遍）；失败了下次再来
  init() {
    this.boot ??= this.boot1().catch((e) => { this.boot = null; throw e; });
    return timeout(this.boot, 40000);
  }
  async boot1() {
    const [{ initializeApp }, A, F] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => import(SDK + f)));
    const app = this.app ??= initializeApp(this.config);
    this.A = A; this.F = F; this.db = F.getFirestore(app); this.auth = A.getAuth(app);
    if (this.emulator && !this.auth.emulatorConfig) {
      A.connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      F.connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
    }
    await this.auth.authStateReady();   // 登录状态 Firebase 自己存在浏览器里
    return this.user();
  }
  async signInAnon() { await timeout(this.A.signInAnonymously(this.auth)); return this.user(); }
  // 游客 → Google：linkWithPopup 让同一个 uid 变成正式账号，云端存档不用搬。
  // 这个 Google 账号以前已经有自己的 uid（别的设备玩过）→ 改登那个账号，switched = true，由 sync.js 决定用哪份存档。
  // 要在点击里直接调用（中间不能先 await 别的），不然浏览器会拦弹窗。
  // 模拟器里不弹 Google 窗口（那要连 apis.google.com），输个邮箱做一张假的 Google 凭证，后面的流程完全一样。
  async linkGoogle() {
    if (!this.A) throw fail('unavailable', '连不上云端');
    const A = this.A, cur = this.auth.currentUser;
    let cred = null;
    if (this.emulator) {
      const email = prompt('（Firebase 模拟器）Google 邮箱：', 'player@example.com');
      if (!email) return null;
      cred = A.GoogleAuthProvider.credential(JSON.stringify({ sub: 'g-' + email, email, email_verified: true }));
    }
    try {
      if (cur?.isAnonymous) {
        await (cred ? A.linkWithCredential(cur, cred) : A.linkWithPopup(cur, new A.GoogleAuthProvider()));
        return { user: this.user(), switched: false };
      }
      await (cred ? A.signInWithCredential(this.auth, cred) : A.signInWithPopup(this.auth, new A.GoogleAuthProvider()));
      return { user: this.user(), switched: true };
    } catch (e) {
      if (CANCEL.has(e.code)) return null;
      if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
        const c = A.GoogleAuthProvider.credentialFromError(e) || cred;
        if (!c) throw e;
        await A.signInWithCredential(this.auth, c);
        return { user: this.user(), switched: true };
      }
      throw e;
    }
  }
  async signOut() { await this.A.signOut(this.auth); }

  ref(uid) { return this.F.doc(this.db, 'saves', uid); }
  async get(uid) {
    const s = await timeout(this.F.getDoc(this.ref(uid)));
    return s.exists() ? s.data() : null;
  }
  // 事务：云端还是 expect 那份（或都没有）才写，否则 code 'conflict'
  async put(uid, make, expect) {
    const F = this.F, ref = this.ref(uid);
    let out;
    await timeout(F.runTransaction(this.db, async (tx) => {
      const s = await tx.get(ref), cur = s.exists() ? s.data() : null;
      const seen = cur ? { sid: cur.sid, rev: cur.rev } : null;
      if (!sameStamp(seen, expect)) throw fail('conflict', '云端存档刚被别处改过');
      out = make(cur);
      tx.set(ref, { ...out, updated: F.serverTimestamp() });
    }));
    return out;
  }
}
