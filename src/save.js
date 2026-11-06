// 存档（GDD：随时存档，允许读档；只存差异）。各模块用 register 登记自己的 save / load，
// 世界本身由种子生成，不进存档。本机存在 localStorage；云同步（src/cloud/）在这之上，见 onWrite / localEnvelope。
// 格式和版本迁移在 saveFormat.js——改任何模块的存档形状前先看那里的规则。
import { SAVE_V, RESERVED, migrate, newSid } from './saveFormat.js';
import { VERSION } from './version.js';

const KEY = 'lingtian-save-v1';          // 本机存档槽的名字，不是格式版本，永远不改
const BAK = KEY + '.bak';                // 被云端覆盖之前的那一份
const ORIG = KEY + '.orig';              // 第一次被新代码升级之前的原样（云存档上线前的老玩家存档），只存一次、永远不覆盖
const UPG = KEY + '.bak-upgrade';        // 最近一次升级格式之前的原样
const CLEARED = KEY + '.cleared';        // 「重新开始」丢掉的存档线 sid（云同步别把它拉回来）
const parts = [];
const writeHooks = [];
let cur = { sid: null, rev: 0 };         // 当前这局的存档线

export function register(key, save, load) {
  if (RESERVED.has(key)) throw new Error(`存档键 ${key} 被外壳占用`);
  parts.push({ key, save, load });
}
export const onWrite = (fn) => writeHooks.push(fn);

const getRaw = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const setRaw = (s) => { try { localStorage.setItem(KEY, s); return true; } catch { return false; } };

// 本机存档，迁移成最新格式（不读进游戏）。返回 { status, data, from } 或 null（没有存档）。
// 旧格式的存档第一次被读到时就升级并写回（原样先备份），这样补上的 sid 固定下来，云同步才认得是同一局。
export function localSave() {
  const r = getRaw(); if (!r) return null;
  const s = migrate(r);
  if (s.status === 'ok' && s.changed) {
    try {
      if (!localStorage.getItem(ORIG)) localStorage.setItem(ORIG, r);
      localStorage.setItem(UPG, r);
    } catch { /* 满了就算了：不备份也照样能读 */ }
    setRaw(JSON.stringify(s.data));
  }
  return s;
}
// 给云同步用：最新格式的存档外壳；没有、读不出、比游戏新都返回 null
export function localEnvelope() { const s = localSave(); return s?.status === 'ok' ? s.data : null; }
// 云端拉下来的存档放进本机（先备份本机原来那份）。不读进游戏，要读再调 readSave()
export function putLocalEnvelope(d) {
  const old = getRaw(); if (old) try { localStorage.setItem(BAK, old); } catch { /* 满了就算了 */ }
  try { localStorage.removeItem(CLEARED); } catch { /* 无痕模式 */ }
  return setRaw(JSON.stringify(d));
}
export function clearedSid() { try { return localStorage.getItem(CLEARED); } catch { return null; } }

export function hasSave() { return !!getRaw(); }
// 标题 / 菜单显示用：{ text, at, sid, rev, game, future? }
export function saveInfo() {
  const s = localSave(); if (!s) return null;
  if (s.status === 'future') return { ...(s.data.meta || {}), future: true };
  return s.status === 'ok' ? s.data.meta : null;
}

export function writeSave(meta) {
  const prev = localEnvelope();
  if (!prev && localSave()?.status === 'future') return false;   // 本机存档比游戏新：不覆盖
  if (!cur.sid) cur = prev ? { sid: prev.meta.sid, rev: prev.meta.rev } : { sid: newSid(), rev: 0 };
  const rev = Math.max(cur.rev, prev?.meta.sid === cur.sid ? prev.meta.rev : 0) + 1;
  const data = { v: SAVE_V, meta: { ...meta, at: Date.now(), sid: cur.sid, rev, game: VERSION } };
  for (const p of parts) data[p.key] = p.save();
  if (!setRaw(JSON.stringify(data))) return false;
  cur.rev = rev;
  for (const f of writeHooks) try { f(data); } catch (e) { console.error(e); }
  return true;
}

// 读档：迁移到最新格式再交给各模块。某个模块读坏了不连累别的（记下来、继续读）。
export function readSave() {
  const s = localSave();
  if (!s || s.status !== 'ok') return false;
  const d = s.data;
  cur = { sid: d.meta.sid, rev: d.meta.rev };
  const failed = [];
  for (const p of parts) {
    if (d[p.key] === undefined) continue;   // 旧存档里没有这个模块：保持新开局的默认值
    try { p.load(d[p.key]); } catch (e) { failed.push(p.key); console.error(`读档：${p.key} 读不进来`, e); }
  }
  if (failed.length) console.warn('读档时这些部分用了默认值：', failed);
  return true;
}

// 「新的开始 / 重新开始」：丢掉本机存档，记下丢掉的是哪条线
export function clearSave() {
  const sid = localEnvelope()?.meta.sid;
  try { localStorage.removeItem(KEY); if (sid) localStorage.setItem(CLEARED, sid); } catch { /* 无痕模式等 */ }
  cur = { sid: null, rev: 0 };
}
// 测试用（作弊面板「模拟换一台设备」）：本机存档全清，像一台新设备
export function wipeLocalSave() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k); } catch { /* 无痕模式 */ }
  cur = { sid: null, rev: 0 };
}
