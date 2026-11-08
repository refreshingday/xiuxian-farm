// 真的 Firebase SDK + 本机 Firebase 模拟器，测 src/cloud/firebase.js 和 firestore.rules：
//   1 游客（匿名登录）存档 → Firestore 里有 saves/{uid}
//   2 安全规则：不能写别人的、不能写超大的、不能乱加字段
//   3 登录 Google（模拟器里用假凭证）→ uid 不变
//   4 第二台设备（另一个浏览器）登录同一账号 → 拉下进度接着玩
//   5 第三台设备先当游客玩、再登录 → credential-already-in-use → 冲突弹窗 → 选这台的 → 云端换掉、旧的进 prev
//   6 第二台设备再同步 → 拿到第三台的进度
// 先开模拟器（仓库根目录）：npx firebase-tools emulators:start --only auth,firestore --project demo-lingtian
// 再跑：FIREBASE_SDK=<node_modules/firebase 目录> node tests/firebase-emulator.browser.cjs
//   FIREBASE_SDK：npm i firebase@12.19.0 后的 node_modules/firebase（gstatic CDN 连得上就不用设）
const path = require('path');
const { serve, browser, open, inGame, tap } = require('./browser-helpers.cjs');
const SDK = process.env.FIREBASE_SDK, FS = 'http://127.0.0.1:8080/v1/projects/demo-lingtian/databases/(default)/documents/saves/';
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const cloudDoc = async (uid) => { const r = await fetch(FS + uid, { headers: { Authorization: 'Bearer owner' } }); if (!r.ok) return null; const f = (await r.json()).fields; return { sid: f.sid.stringValue, rev: +f.rev.integerValue, data: f.data.stringValue, prev: f.prev?.mapValue?.fields || null }; };

(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-lingtian/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-lingtian/accounts', { method: 'DELETE' });
  const { server, url } = await serve();
  const { b, newCtx } = await browser();
  const EMAIL = 'emu-tester@example.com';
  const device = async () => {
    const ctx = await newCtx();
    if (SDK) await ctx.route(/www\.gstatic\.com\/firebasejs\/12\.19\.0\/(.*)/, (r) => r.fulfill({ path: path.join(SDK, r.request().url().split('12.19.0/')[1]), contentType: 'application/javascript' }));
    const p = await open(ctx, url + 'index.html?cloud=emulator');
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? EMAIL : undefined));
    await p.waitForFunction(() => document.querySelector('#titleBtns button') && window.game?.cloud && window.game.cloud.state !== 'connecting', null, { timeout: 120000 });
    return p;
  };
  const local = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('lingtian-save-v1')));

  // 1
  const A = await device();
  let st = await A.evaluate(() => ({ s: game.cloud.state, m: game.cloud.mode, u: game.cloud.user }));
  check(st.s === 'ok' && st.m === 'emulator' && st.u.anon, `1 游客自动登录（${st.u.uid}）`);
  const uid = st.u.uid;
  await tap(A, '#titleBtns button.wide');
  await inGame(A);
  await A.evaluate(async () => { game.cheat.levelUp(); game.cheat.levelUp(); game.cheat.levelUp(); game.addMoney(4321); game.save(); await game.cloud.flush(); });
  let L = await local(A), D = await cloudDoc(uid);
  check(D && D.sid === L.meta.sid && D.rev === L.meta.rev && JSON.parse(D.data).meta.sid === L.meta.sid, `1 Firestore saves/${uid.slice(0, 6)}… 有存档（rev ${D?.rev}）`);

  // 2
  const rules = await A.evaluate(async (uid) => {
    const be = game.cloud.be, out = {};
    const tryPut = async (id, make, expect = null) => { try { await be.put(id, make, expect); return 'ok'; } catch (e) { return e.code || e.message; } };
    out.other = await tryPut('someone-else', () => ({ v: 2, sid: 'x', rev: 1, at: 1, text: '', game: '', data: '{}' }));
    const cur = await be.get(uid);
    out.big = await tryPut(uid, () => ({ ...cur, rev: cur.rev + 1, data: 'x'.repeat(400001) }), { sid: cur.sid, rev: cur.rev });
    out.extra = await tryPut(uid, () => ({ ...cur, rev: cur.rev + 1, hack: 1 }), { sid: cur.sid, rev: cur.rev });
    out.stale = await tryPut(uid, () => ({ ...cur, rev: cur.rev + 1 }), { sid: cur.sid, rev: cur.rev - 1 });
    try { await be.get('someone-else'); out.read = 'ok'; } catch (e) { out.read = e.code; }
    return out;
  }, uid);
  check(rules.other === 'permission-denied' && rules.read === 'permission-denied', `2 规则：别人的存档读写都不行（${rules.other} / ${rules.read}）`);
  check(rules.big === 'permission-denied' && rules.extra === 'permission-denied', `2 规则：超大 / 乱加字段不行（${rules.big} / ${rules.extra}）`);
  check(rules.stale === 'conflict', `2 事务：云端被别处改过就不写（${rules.stale}）`);

  // 3
  let r = await A.evaluate(() => game.cloud.login());
  st = await A.evaluate(() => game.cloud.user);
  check(r === 'linked' && st.uid === uid && !st.anon && st.email === EMAIL, `3 登录：同一个 uid 升级成 ${st.email}（${r}）`);
  const prog = await A.evaluate(() => ({ layer: game.player.layer, money: game.inv.money }));
  const errsA = A.errors.slice(); await A.close();   // 少开一个 3D 页面，无头浏览器快一点

  // 4
  const B = await device();
  check(!(await B.evaluate(() => document.getElementById('titleBtns').innerText)).includes('继续'), '4 第二台设备：没有存档');
  await tap(B, '#titleBtns button', '登录接着玩');
  // 换账号后第一次读 Firestore 在这种很忙的无头浏览器里可能超时，云同步会自己 15 秒后重试
  await B.waitForFunction(() => document.getElementById('titleBtns').innerText.includes('继续'), null, { timeout: 90000 });
  await tap(B, '#titleBtns button.wide');
  await inGame(B);
  st = await B.evaluate(() => ({ layer: game.player.layer, money: game.inv.money, uid: game.cloud.user.uid }));
  check(st.uid === uid && st.layer === prog.layer && st.money === prog.money, `4 登录后接着玩：层 ${st.layer} 钱 ${st.money}`);

  // 5
  const C = await device();
  await tap(C, '#titleBtns button.wide');
  await inGame(C);
  await C.evaluate(async () => { game.addMoney(99999); game.save(); await game.cloud.flush(); });
  const guest = await local(C);
  await C.evaluate(() => document.getElementById('menuBtn').click());
  await tap(C, '#pbody button', '云存档');
  await tap(C, '#pbody button', '登录');
  await C.waitForSelector('#cloudAsk', { timeout: 90000 });   // 换账号后第一次读在很忙的无头浏览器里可能超时，会自己重试
  await tap(C, '#cloudAsk button', '这台设备上的');
  await C.waitForFunction(() => game.cloud.state === 'ok', null, { timeout: 90000 });
  D = await cloudDoc(uid);
  st = await C.evaluate(() => game.cloud.user.uid);
  check(st === uid && D.sid === guest.meta.sid && !!D.prev?.sid?.stringValue && D.prev.sid.stringValue !== guest.meta.sid, `5 已有账号 → 选这台的：云端换成这局，旧的留在 prev（${D.prev?.sid?.stringValue}）`);

  // 6
  await B.evaluate(() => game.cloud.sync());
  await B.waitForFunction(() => game.cloud.state === 'ok', null, { timeout: 90000 });
  st = await B.evaluate(() => ({ money: game.inv.money, sid: JSON.parse(localStorage.getItem('lingtian-save-v1')).meta.sid }));
  check(st.sid === guest.meta.sid && st.money === guest.inv.money, `6 第二台设备同步：拿到第三台的进度（钱 ${st.money}）`);

  // 预期内的：A 上第 2 步故意被规则拒绝（403）；登录时 Google 账号已被别的 uid 用了（400 credential-already-in-use）
  const errs = [...errsA.filter((e) => !e.includes('status of 403')), ...B.errors, ...C.errors].filter((e) => !e.includes('jsdelivr') && !e.includes('status of 400'));
  check(!errs.length, '没有页面报错' + (errs.length ? '：\n  ' + errs.join('\n  ') : ''));
  await b.close(); server.close();
  console.log(fails ? `${fails} 项失败` : '全部通过');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
