// 云存档的界面：冲突时让玩家选存档的弹窗、菜单里的「云存档」面板、标题画面的一行状态 + 登录按钮。
import { btn, el } from '../ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const when = (t) => (t ? new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '不知道什么时候');

// 冲突：这台设备和云端的存档都改过（或是两局不同的游戏），让玩家选一份。没选的那份会留备份。
// 自己的弹层（比标题画面还高），标题画面和游戏里都能用。
export function askConflict(cloud, onDone) {
  const c = cloud.conflict; if (!c) return;
  document.getElementById('cloudAsk')?.remove();
  const L = c.local.meta, C = c.doc, acct = cloud.user?.anon ? '云端' : `云端（${esc(cloud.user?.email || '你的账号')}）`;
  const back = el('div'); back.id = 'cloudAsk';
  back.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:inherit';
  const box = el('div', 'panel');
  box.style.cssText = 'width:min(520px,92vw);max-height:90vh;overflow:auto;background:rgba(24,20,16,.95);border:1px solid rgba(255,220,160,.35);border-radius:12px;padding:16px 18px;color:#f3e6c8';
  box.append(el('div', '', '<b style="font-size:18px;color:#ffe7a8">选一份存档接着玩</b>'));
  box.append(el('div', '', `<div style="opacity:.75;font-size:13px;margin:6px 0 10px;line-height:1.6">这台设备上的存档和${acct}的不一样（可能在别的设备上也玩过）。选一份继续——没选的那份会留一份备份，不会直接丢掉。</div>`));
  const card = (title, m, which) => {
    const b = btn(`<div style="font-size:12px;opacity:.7">${title}</div><div style="font-size:16px;margin:4px 0">${esc(m.text || '存档')}</div><div style="font-size:12px;opacity:.7">存于 ${when(m.at)} · 第 ${m.rev || 1} 次存档 · 版本 ${esc(m.game || '?')}</div>`, async () => {
      back.remove(); await cloud.resolve(which); onDone?.(which);
    }, 'wide');
    b.style.textAlign = 'left'; return b;
  };
  box.append(card('📱 这台设备上的', L, 'local'), card(`☁ ${acct}`, C, 'cloud'));
  const later = btn('稍后再说（先不同步）', () => back.remove(), 'wide');
  later.style.opacity = '.7'; box.append(later);
  back.append(box); document.body.append(back);
}

// 菜单 → 云存档
export function openCloudPanel(gui, cloud, g) {
  const login = async () => {
    const r = await cloud.login();
    if (r === 'linked') g.toast('已登录：游客进度已经接到你的账号上\n换设备登录同一个账号就能接着玩', 4);
    else if (r === 'switched') g.toast(cloud.state === 'conflict' ? '已登录：这个账号以前就有存档，选一份接着玩' : '已登录，已读取账号里的存档', 4);
    else if (r === 'error') g.toast('登录失败：' + (cloud.msg || '连不上云端'), 3);
    gui.refresh();
  };
  gui.panel('云存档', (body) => {
    const u = cloud.user;
    body.append(gui.row('☁', esc(cloud.statusText()), cloud.state === 'offline' && cloud.msg ? esc(cloud.msg) : '每次存档后自动上传（最多 20 秒一次）'));
    if (cloud.state === 'conflict') body.append(gui.row('⚠', '这台设备和云端的存档不一样', '选一份接着玩，另一份会留备份', [btn('选择', () => askConflict(cloud, () => gui.refresh()))]));
    if (cloud.mode !== 'off') {
      if (!u || u.anon) body.append(gui.row('🔗', '用 Google 登录', '现在是游客：进度已经自动存到云端，但只认这台设备的这个浏览器。登录后换设备、清缓存都能接着玩，游客进度会直接接到账号上。', [btn('登录', login)]));
      else body.append(gui.row('👤', esc(u.email || u.name || '已登录'), '换设备时登录同一个账号就能接着玩', [btn('退出登录', async () => {
        if (!confirm('退出登录？这台设备上的存档会留着，之后改用游客身份同步。')) return;
        await cloud.logout(); g.toast('已退出登录'); gui.refresh();
      })]));
      body.append(gui.row('🔄', '立即同步', '', [btn('同步', async () => { await cloud.sync(); gui.refresh(); })]));
    }
    if (cloud.mode === 'mock') body.append(el('div', 'pempty', '现在是<b>模拟云端</b>：流程和真的一样，但数据其实还存在这台浏览器里。作弊面板「☁ 云存档（模拟）」可以模拟换一台设备。接上真的 Firebase 见 docs/CLOUD_SAVE.md。'));
  });
}

// 标题画面底下：一行云存档状态 + 游客时的「登录接着玩」按钮。onLogin：登录完（可能拉下了存档）重画标题
export function titleCloudLine(cloud, g, onLogin) {
  const wrap = el('div');
  wrap.style.cssText = 'margin-top:12px;text-align:center;font-size:13px;opacity:.85;line-height:1.8';
  wrap.append(el('div', '', esc(cloud.statusText())));
  if (cloud.mode !== 'off' && cloud.state !== 'connecting' && (!cloud.user || cloud.user.anon)) {
    const b = btn('☁ 在别的设备玩过？登录接着玩', async () => {
      const r = await cloud.login();
      if (r === 'error') g.toast('登录失败：' + (cloud.msg || '连不上云端'), 3);
      onLogin?.();
    });
    b.style.marginTop = '4px'; wrap.append(b);
  }
  if (cloud.state === 'conflict') {
    const b = btn('⚠ 选择用哪份存档', () => askConflict(cloud, onLogin));
    b.style.margin = '4px 0 0 6px'; wrap.append(b);
  }
  return wrap;
}
