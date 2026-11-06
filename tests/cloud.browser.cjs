// 云存档（模拟云端）的完整流程：node tests/cloud.browser.cjs
//   1 新设备游客：自动登录、开局、存档 → 云端有一份
//   2 用「Google」(模拟邮箱) 登录 → 同一个 uid 升级，云端存档不变
//   3 换一台设备 → 标题画面登录 → 拉下进度，「继续」接着玩
//   4 又换一台设备，先当游客玩了一局，再登录 → 冲突弹窗 → 选云端 → 读进游戏
//   5 断网：本机照样存档，状态显示连不上
//   6 本机存档比游戏新：不读、不被云端覆盖
//   7 老玩家（云存档上线前就有本机存档）：存档原样备份、补上的 sid 固定、传上云端、接着玩进度一点不少
const { serve, browser, open, inGame, tap } = require('./browser-helpers.cjs');
const EMAIL = 'tester@example.com';
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

(async () => {
  const { server, url } = await serve();
  const { b, newCtx } = await browser();
  const ctx = await newCtx();   // 同一个 context = 同一个浏览器（模拟云端就存在这里的 localStorage）
  const errsAll = [];
  const page = async (q = '') => { const p = await open(ctx, url + 'index.html' + q); p.on('close', () => errsAll.push(...p.errors)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? EMAIL : undefined)); return p; };
  const titleReady = (p) => p.waitForFunction(() => document.querySelector('#titleBtns button') && window.game?.cloud?.state !== 'connecting', null, { timeout: 120000 });
  const server_ = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('lingtian-mockcloud') || '{"docs":{},"accounts":{}}'));
  const local = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('lingtian-save-v1')));
  const forget = (p) => p.evaluate(async () => { const { CloudSync } = await import('./src/cloud/sync.js'); window.game.cloud.halt(); CloudSync.forgetDevice(); });

  // 1
  let p = await page();
  await titleReady(p);
  let st = await p.evaluate(() => ({ s: game.cloud.state, u: game.cloud.user, t: document.getElementById('titleBtns').innerText }));
  check(st.s === 'ok' && st.u.anon, `1 游客自动登录（${st.t.replace(/\n/g, ' | ')}）`);
  await tap(p, '#titleBtns button.wide');   // 开始问道
  await inGame(p);
  await p.evaluate(async () => { game.cheat.levelUp(); game.cheat.levelUp(); game.addMoney(777); game.save(); await game.cloud.flush(); });
  let L = await local(p), S = await server_(p), uid = await p.evaluate(() => game.cloud.user.uid);
  check(S.docs[uid]?.sid === L.meta.sid && S.docs[uid]?.rev === L.meta.rev, `1 存档传上云端（sid ${L.meta.sid} rev ${L.meta.rev}）`);

  // 2
  let r = await p.evaluate(() => game.cloud.login());
  st = await p.evaluate(() => game.cloud.user);
  check(r === 'linked' && !st.anon && st.uid === uid && st.email === EMAIL, `2 登录：游客 uid 升级成 ${st.email}（${r}）`);
  const progress = { layer: L.player.layer, money: L.inv.money, sid: L.meta.sid };
  await p.evaluate(async () => { game.addMoney(1); game.save(); await game.cloud.flush(); });
  progress.money += 1; progress.rev = (await local(p)).meta.rev;

  // 3
  await forget(p); await p.close();
  p = await page();
  await titleReady(p);
  st = await p.evaluate(() => ({ t: document.getElementById('titleBtns').innerText, anon: game.cloud.user.anon }));
  check(!st.t.includes('继续') && st.anon, '3 新设备：没有本机存档、是新游客');
  await tap(p, '#titleBtns button', '登录接着玩');
  await p.waitForFunction(() => document.getElementById('titleBtns').innerText.includes('继续'), null, { timeout: 10000 });
  await tap(p, '#titleBtns button.wide');   // 继续
  await inGame(p);
  st = await p.evaluate(() => ({ layer: game.player.layer, money: game.inv.money }));
  L = await local(p);
  check(st.layer === progress.layer && st.money === progress.money && L.meta.sid === progress.sid, `3 登录后接着玩：层 ${st.layer} 钱 ${st.money}`);

  // 4
  await forget(p); await p.close();
  p = await page();
  await titleReady(p);
  await tap(p, '#titleBtns button.wide');   // 开始问道（新游客的一局）
  await inGame(p);
  await p.evaluate(async () => { game.addMoney(5); game.save(); await game.cloud.flush(); });
  const guestSid = (await local(p)).meta.sid;
  await p.evaluate(() => { document.getElementById('menuBtn').click(); });
  await tap(p, '#pbody button', '云存档');
  await tap(p, '#pbody button', '登录');
  await p.waitForSelector('#cloudAsk', { timeout: 10000 });
  const ask = await p.evaluate(() => document.getElementById('cloudAsk').innerText);
  check(ask.includes('这台设备上的') && ask.includes(EMAIL), '4 登录有存档的账号 → 弹窗让选');
  await tap(p, '#cloudAsk button', EMAIL);
  await p.waitForFunction(() => game.cloud.state === 'ok', null, { timeout: 10000 });
  L = await local(p);
  st = await p.evaluate(() => ({ layer: game.player.layer, money: game.inv.money, bak: !!localStorage.getItem('lingtian-save-v1.bak') }));
  check(L.meta.sid === progress.sid && st.layer === progress.layer && st.money === progress.money && st.bak, `4 选了云端：读进游戏（层 ${st.layer} 钱 ${st.money}），游客那局留了备份`);
  check(L.meta.sid !== guestSid, '4 本机换成账号那一局');
  await p.close();

  // 5
  p = await page('?cloud=mock-offline');
  await titleReady(p);
  await tap(p, '#titleBtns button.wide');
  await inGame(p);
  const before = (await local(p)).meta.rev;
  await p.evaluate(() => game.save());   // 写存档会顺便重试连云端
  await p.waitForFunction(() => game.cloud.state !== 'connecting', null, { timeout: 10000 });
  st = await p.evaluate(() => ({ s: game.cloud.state, t: game.cloud.statusText() }));
  check(st.s === 'offline' && (await local(p)).meta.rev === before + 1, `5 断网：本机照存（${st.t}）`);
  await p.close();

  // 6
  p = await page('?cloud=off');
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lingtian-save-v1')); d.v = 99; localStorage.setItem('lingtian-save-v1', JSON.stringify(d)); });
  await p.close();
  p = await page();
  await titleReady(p);
  st = await p.evaluate(() => ({ t: document.getElementById('titleBtns').innerText, s: game.cloud.state, v: JSON.parse(localStorage.getItem('lingtian-save-v1')).v }));
  check(st.t.includes('更新的版本') && st.s === 'future' && st.v === 99, `6 未来版本存档：不读不覆盖（${st.t.split('\n')[0]}）`);
  await p.close();

  // 7
  const fs = require('fs'), path = require('path');
  const legacy = fs.readFileSync(path.join(__dirname, 'fixtures/save-v1-pre-cloud.json'), 'utf8'), old = JSON.parse(legacy);
  const ctx7 = await newCtx();
  await ctx7.addInitScript((s) => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.setItem('lingtian-save-v1', s); } }, legacy);
  p = await open(ctx7, url + 'index.html');
  await titleReady(p);
  st = await p.evaluate(() => ({ t: document.getElementById('titleBtns').innerText, orig: localStorage.getItem('lingtian-save-v1.orig'), L: JSON.parse(localStorage.getItem('lingtian-save-v1')), S: JSON.parse(localStorage.getItem('lingtian-mockcloud')), uid: game.cloud.user.uid }));
  check(st.t.includes('继续 · ' + old.meta.text), `7 老玩家：标题画面「继续 · ${old.meta.text}」`);
  check(st.orig === legacy, '7 原来的存档一字不差备份在 lingtian-save-v1.orig');
  check(st.L.v === old.v && !!st.L.meta.sid && st.S.docs[st.uid]?.sid === st.L.meta.sid, `7 补上 sid ${st.L.meta.sid}、版本号还是 v${st.L.v}、已传上云端`);
  await tap(p, '#titleBtns button.wide'); await inGame(p);
  const g7 = await p.evaluate(() => ({ layer: game.player.layer, money: game.inv.money, day: game.day }));
  check(g7.layer === old.player.layer && g7.money === old.inv.money && g7.day === old.time.day, `7 进度一点不少：第 ${g7.day} 天 · 层 ${g7.layer} · 钱 ${g7.money}`);
  await p.evaluate(async () => { game.addMoney(1); game.save(); await game.cloud.flush(); });
  const L7 = await local(p), S7 = await p.evaluate(() => JSON.parse(localStorage.getItem('lingtian-mockcloud')));
  check(L7.meta.sid === st.L.meta.sid && L7.meta.rev === 2 && S7.docs[st.uid].rev === 2, '7 再存档还是同一局（sid 没变，rev 1 → 2，云端跟上）');
  errsAll.push(...p.errors);
  await ctx7.close();

  const errs = errsAll.slice(); for (const pg of ctx.pages()) errs.push(...pg.errors);
  await b.close(); server.close();
  check(!errs.length, '没有页面报错' + (errs.length ? '：\n  ' + [...new Set(errs)].join('\n  ') : ''));
  console.log(fails ? `${fails} 项失败` : '全部通过');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
