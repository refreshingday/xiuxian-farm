// 存档（GDD：随时存档，允许读档；只存差异）。各模块用 register 登记自己的 save / load，
// 世界本身由种子生成，不进存档。
const KEY = 'lingtian-save-v1';
const parts = [];

export function register(key, save, load) { parts.push({ key, save, load }); }

export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function saveInfo() { try { return JSON.parse(localStorage.getItem(KEY))?.meta ?? null; } catch { return null; } }

export function writeSave(meta) {
  const data = { v: 1, meta: { ...meta, at: Date.now() } };
  for (const p of parts) data[p.key] = p.save();
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function readSave() {
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { return false; }
  if (!data || data.v !== 1) return false;
  for (const p of parts) if (data[p.key] !== undefined) p.load(data[p.key]);
  return true;
}

export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* 无痕模式等 */ } }
