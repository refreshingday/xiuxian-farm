// 浏览器测试共用：起一个静态服务器、开 Chromium（three.js 走本地 vendor/，不依赖 CDN）。
// 需要 playwright：require('playwright') 能用就行。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.obj': 'text/plain', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, () => ok({ server: s, url: `http://localhost:${s.address().port}/` }));
  });
}

async function browser() {
  const b = await chromium.launch();
  const newCtx = async () => {
    const ctx = await b.newContext();
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, (r) => {
      const rel = r.request().url().split('three@0.160.0/')[1].replace('build/three.module.js', 'build/three.module.min.js').replace('examples/jsm/', 'jsm/');
      const f = path.join(ROOT, 'vendor/three@0.160.0', rel);
      if (fs.existsSync(f)) r.fulfill({ path: f, contentType: 'application/javascript' }); else r.continue();
    });
    return ctx;
  };
  return { b, newCtx };
}

// 开一页，收集页面报错
async function open(ctx, url) {
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.errors = errors;
  await p.goto(url, { waitUntil: 'load' });
  return p;
}
// 点按钮（直接在页面里点：无头浏览器渲染 3D 很慢，Playwright 等「元素稳定」会等很久）
const tap = (p, sel, text = '') => p.waitForFunction(([sel, text]) => {
  const b = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && e.innerText.includes(text));
  if (b) b.click(); return !!b;
}, [sel, text], { timeout: 60000 });
const inGame = (p) => p.waitForFunction(() => window.game && !window.game.title, null, { timeout: 120000 });

module.exports = { ROOT, serve, browser, open, inGame, tap };
