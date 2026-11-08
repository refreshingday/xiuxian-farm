// 把 tests/fixtures/ 里每个版本的旧存档读进真的游戏：不报错、读档成功、再存一次是最新版本。
//   node tests/saves.browser.cjs            检查
//   node tests/saves.browser.cjs --capture  顺便把当前版本的存档存成 fixture（升 SAVE_V 后跑一次；已有的不覆盖）
const fs = require('fs'), path = require('path');
const { ROOT, serve, browser, open, inGame } = require('./browser-helpers.cjs');

(async () => {
  const { server, url } = await serve();
  const { b, newCtx } = await browser();
  const dir = path.join(ROOT, 'tests/fixtures');
  let bad = 0, cur = 0;
  for (const f of fs.readdirSync(dir).filter((f) => /^save-v\d+(-[\w-]+)?\.json$/.test(f)).sort()) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8'), orig = JSON.parse(raw);
    const ctx = await newCtx();
    await ctx.addInitScript((s) => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.setItem('lingtian-save-v1', s); } }, raw);
    const p = await open(ctx, url + 'index.html?skipTitle&cloud=off');
    await inGame(p);
    await p.evaluate(() => window.game.step(1));
    const r = await p.evaluate(() => { window.game.save(); return JSON.parse(localStorage.getItem('lingtian-save-v1')); });
    const keys = Object.keys(orig).filter((k) => k !== 'v' && k !== 'meta' && !(k in r));
    const ok = !p.errors.length && !keys.length && r.player?.layer === orig.player?.layer && r.inv?.money === orig.inv?.money;
    console.log(`${ok ? '✓' : '✗'} ${f} (v${orig.v}) → v${r.v}  层 ${r.player?.layer} 钱 ${r.inv?.money}${keys.length ? '  少了 ' + keys : ''}${p.errors.length ? '\n   ' + p.errors.join('\n   ') : ''}`);
    if (!ok) bad++;
    cur = r.v;
    if (process.argv.includes('--capture') && !fs.existsSync(path.join(dir, `save-v${r.v}.json`))) {
      fs.writeFileSync(path.join(dir, `save-v${r.v}.json`), JSON.stringify(r)); console.log(`  已存 fixture save-v${r.v}.json`);
    }
    await ctx.close();
  }
  await b.close(); server.close();
  console.log(bad ? `${bad} 个存档有问题` : `全部读得进来（当前存档版本 v${cur}）`);
  process.exit(bad ? 1 : 0);
})();
