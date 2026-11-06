// 存档格式与版本迁移（纯函数，不碰 DOM / localStorage，node 里也能跑：tests/save-compat.test.mjs）。
//
// 游戏会一直更新，所以旧存档要永远读得进来。规则：
//   1. 任何模块的 save() 形状变了（改名、换结构、删字段），SAVE_V 加 1，并在 MIGRATIONS 里写
//      「上一版 → 这一版」的迁移函数，把旧数据改成新形状。
//   2. 迁移只能加、不能删、不能改已发布的旧迁移——老玩家可能从任何一个旧版本跳过来，
//      v1 存档会依次经过 1→2→3→… 每一步。
//   3. 只是新加字段：不用升版本，但 load() 要给缺的字段默认值（旧存档里没有）。
//   4. 每升一次版本，在 tests/fixtures/ 存一份那个版本的真实存档（save-v<N>.json），永远不删；
//      测试会把所有 fixture 迁到最新版并检查。
//   5. 存档比游戏新（玩家开着旧的缓存页面）时，不读也不覆盖，提示刷新。
//
// 存档外壳：{ v, meta: { text, at, sid, rev, game }, <模块名>: <模块数据>, ... }
//   sid  这条存档线的随机 id（「新的开始」换新的）——云同步用它判断两份存档是不是同一局
//   rev  这条线写了第几次，单调递增——云同步用它判断谁新
//   game 写这份存档的游戏版本（src/version.js 的 VERSION），只用来显示和排查

export const SAVE_V = 2;
export const RESERVED = new Set(['v', 'meta']); // 外壳占用的键，模块不能用

export const newSid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// MIGRATIONS[n]：把 v=n 的存档改成 v=n+1。拿到的是深拷贝，可以直接改，返回改好的。
export const MIGRATIONS = {
  // v1（2026-10-30 起，只有 meta.text / meta.at）→ v2：加存档线 id、写入次数、游戏版本
  1: (d) => {
    d.meta = { ...(d.meta || {}) };
    d.meta.sid ??= newSid();
    d.meta.rev ??= 1;
    d.meta.game ??= 'v1';
    d.meta.at ??= 0;
    d.meta.text ??= '旧存档';
    return d;
  },
};

// 解析 + 迁移。返回 { status, data, from }：
//   status 'ok'      data 已是最新版本（from = 原来的版本号，from < SAVE_V 表示迁移过）
//          'future'  存档比这个游戏新，data 原样返回，不要读也不要覆盖
//          'bad'     读不出来（不是 JSON、没有版本号、迁移报错）
export function migrate(raw) {
  let d = raw;
  if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch { return { status: 'bad', data: null, from: 0 }; } }
  if (!d || typeof d !== 'object' || !Number.isInteger(d.v) || d.v < 1) return { status: 'bad', data: null, from: 0 };
  const from = d.v;
  if (from > SAVE_V) return { status: 'future', data: d, from };
  d = structuredClone(d);
  try {
    while (d.v < SAVE_V) {
      const step = MIGRATIONS[d.v];
      if (!step) throw new Error(`缺少迁移 v${d.v} → v${d.v + 1}`);
      d = step(d); d.v++;
    }
  } catch (e) { return { status: 'bad', data: null, from, error: e }; }
  return { status: 'ok', data: d, from };
}

// 只取比较用的信息（本机存档外壳或云端文档都行）
export const stamp = (d) => (d ? { v: d.v, sid: d.meta?.sid ?? d.sid, rev: d.meta?.rev ?? d.rev ?? 0, at: d.meta?.at ?? d.at ?? 0, text: d.meta?.text ?? d.text ?? '', game: d.meta?.game ?? d.game ?? '' } : null);
const same = (a, b) => !!a && !!b && a.sid === b.sid && a.rev === b.rev;

// 云同步怎么做。L = 本机存档，C = 云端存档，base = 上次两边对上时的 { sid, rev }（这台设备、这个账号），
// cleared = 本机「重新开始」时丢掉的存档线 sid（云端那份不要再拉回来）。
// 返回 'same' 一样 | 'push' 传上去 | 'pull' 拉下来 | 'ask' 两边都改过，让玩家选 | 'future' 云端比游戏新 | 'none' 什么都不做
export function decide(L, C, base = null, cleared = null) {
  L = L && stamp(L); C = C && stamp(C);
  if (C && C.v > SAVE_V) return 'future';
  if (!L && !C) return 'same';
  if (!C) return 'push';
  if (!L) return C.sid === cleared ? 'none' : 'pull';
  if (same(L, C)) return 'same';
  const cloudMoved = !same(base, C), localMoved = !same(base, L);
  if (!cloudMoved) return 'push';   // 云端还是上次同步的样子 → 本机的更新
  if (!localMoved) return 'pull';   // 本机没动过 → 云端在别的设备上更新了
  // 两边都变了。同一条存档线、这台设备又没有同步记录（比如清过同步记录）：取写得多的那份
  if (!base && L.sid === C.sid) return L.rev >= C.rev ? 'push' : 'pull';
  return 'ask';
}
