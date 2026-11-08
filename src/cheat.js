// 作弊面板：可最小化，按 ` 键开关。分几组：
//   开关（无敌 / 无限灵力 / 必掉落 / 一击必杀 / 跑得快，记在 localStorage）
//   传送（回村 / 上次死亡点 / 地点下拉 / 村民下拉 / 各门派山门）
//   资源（钱、灵石、物品、修为、突破）、时间天气、灵田、妖兽、云存档（模拟换设备）
// 「开局带新手任务」：默认关——新开局跳过第一个小时的主线教学（s1–s5），直接接赤枫狼王；勾上则从野猪袭村开始。
import { polar } from './worldmap.js';
import { ITEMS, CROPS } from './items.js';
import { TYPES } from './enemies.js';
import { CloudSync } from './cloud/sync.js';
import { lockSave } from './save.js';
import { VILLAGE_R } from './world.js';

export function startWithQuest() { try { return localStorage.getItem('startQuest') === '1'; } catch (e) { return false; } }

const FLAGS = [
  ['god', '🛡 无敌（不掉血）'],
  ['infQi', '♾ 无限灵力'],
  ['drop', '🎯 必掉落（獠牙等全掉）'],
  ['ohk', '⚔ 一击必杀'],
  ['fast', '🏃 跑速 ×2'],
];
const KIND_NAME = { hub: '坊市', unique: '奇地', secret: '秘境', boss: '妖王', mine: '矿' };

export class Cheat {
  constructor(g) {
    this.g = g;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('cheatFlags') || '{}') || {}; } catch (e) {}
    const on = g.cheatOn = {};
    for (const [k] of FLAGS) on[k] = !!saved[k];
    const saveFlags = () => { try { localStorage.setItem('cheatFlags', JSON.stringify(on)); } catch (e) {} };

    const d = document.createElement('div'); d.id = 'cheat';
    d.style.cssText = 'position:fixed;left:8px;bottom:44px;z-index:60;font:12px sans-serif;color:#fff;background:rgba(20,20,30,.82);border:1px solid #8a7a4a;border-radius:6px;width:180px;user-select:none';
    d.innerHTML = '<div id="chHead" style="display:flex;justify-content:space-between;padding:4px 8px;cursor:pointer;background:#3a3020;border-radius:6px"><b>🛠 作弊</b><span id="chMin">—</span></div><div id="chBody" style="padding:6px;max-height:60vh;overflow:auto"></div>';
    document.body.appendChild(d);
    this.body = d.querySelector('#chBody'); this.min = d.querySelector('#chMin');
    let open = true;
    try { open = localStorage.getItem('cheatOpen') !== '0'; } catch (e) {}
    const set = (o) => { open = o; this.body.style.display = o ? '' : 'none'; this.min.textContent = o ? '—' : '＋'; try { localStorage.setItem('cheatOpen', o ? '1' : '0'); } catch (e) {} };
    d.querySelector('#chHead').addEventListener('click', () => set(!open));
    addEventListener('keydown', (e) => { if (e.code === 'Backquote') set(!open); });
    // 面板里的点击、按键不要漏给游戏（否则选下拉框时角色会跟着动）
    for (const ev of ['click', 'keydown', 'keyup', 'pointerdown', 'mousedown', 'touchstart', 'wheel']) this.body.addEventListener(ev, (e) => { if (e.code !== 'Backquote') e.stopPropagation(); });
    // 手机屏幕小：每次进游戏都先收起，只留标题条，要用再点开
    const phone = /[?&]mobile=1\b/.test(location.search) || (!/[?&]mobile=0\b/.test(location.search) && matchMedia('(pointer: coarse)').matches);
    if (phone) { open = false; d.style.bottom = '6px'; d.style.left = '6px'; this.body.style.maxHeight = '45vh'; }
    set(open);

    const B = this.body, P = () => g.player;
    const head = (t) => { const h = document.createElement('div'); h.textContent = t; h.style.cssText = 'margin:8px 0 2px;opacity:.7;border-top:1px solid #5a4a30;padding-top:4px'; B.appendChild(h); };
    const btnCss = 'padding:4px;font-size:12px;background:#4a4030;color:#fff;border:1px solid #8a7a4a;border-radius:4px;cursor:pointer';
    const add = (label, fn, parent = B) => {
      const b = document.createElement('button');
      b.textContent = label; b.style.cssText = btnCss + ';display:block;width:100%;margin:2px 0';
      b.addEventListener('click', () => { fn(); b.blur(); }); parent.appendChild(b); return b;
    };
    // 两个并排的小按钮
    const pair = (a, fa, b, fb) => { const r = document.createElement('div'); r.style.cssText = 'display:flex;gap:3px'; B.appendChild(r); for (const x of [add(a, fa, r), add(b, fb, r)]) x.style.flex = '1'; };
    const check = (label, val, fn) => {
      const q = document.createElement('label'); q.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0;cursor:pointer';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = val;
      cb.addEventListener('change', () => { fn(cb.checked); cb.blur(); });
      q.append(cb, label); B.appendChild(q); return cb;
    };
    // 下拉 + 「去」：选项在打开时现算（村民位置、已发现的地点会变）
    const pick = (ph, list, go) => {
      const r = document.createElement('div'); r.style.cssText = 'display:flex;gap:3px;margin:2px 0'; B.appendChild(r);
      const s = document.createElement('select'); s.style.cssText = 'flex:1;min-width:0;font-size:12px;background:#2a2418;color:#fff;border:1px solid #8a7a4a;border-radius:4px';
      const fill = () => { const v = s.value; s.innerHTML = `<option value="">${ph}</option>` + list().map((o, i) => `<option value="${i}">${o.label}</option>`).join(''); s.value = v; };
      s.addEventListener('focus', fill); s.addEventListener('pointerdown', fill); fill();
      r.appendChild(s);
      const b = add('去', () => { const o = list()[+s.value]; if (s.value !== '' && o) go(o); else g.toast('先选一个', 1.2); }, r);
      b.style.cssText = btnCss + ';margin:0';
    };

    // ---- 开关 ----
    check('开局带新手任务', startWithQuest(), (v) => { try { localStorage.setItem('startQuest', v ? '1' : '0'); } catch (e) {} g.toast(v ? '下次「新的开始」从野猪袭村的新手任务开始' : '下次「新的开始」跳过新手任务', 2.5); });
    for (const [k, label] of FLAGS) check(label, on[k], (v) => { on[k] = v; saveFlags(); g.toast(`${label.replace(/^\S+\s/, '').replace(/（.*/, '')}：${v ? '开' : '关'}`, 1.2); });

    // ---- 传送 ----
    head('传送');
    pair('🏠 回村', () => this.tp(0, 4), '💀 死亡点', () => {
      const p = P().lastDeath;
      if (!p) { g.toast('还没死过', 1.5); return; }
      if (P().dead) { g.toast('等醒来再传', 1.5); return; }
      this.tp(p.x, p.z); g.toast('回到上次倒下的地方', 1.5);
    });
    pick('— 地点 —', () => (g.landmarks?.list || []).filter((L) => L.kind !== 'sect').map((L) => ({ label: `${KIND_NAME[L.kind] || ''}·${L.name}${L.hidden ? '*' : ''}`, L })), ({ L }) => {
      L.found = true; this.tp(L.x, L.z + 6); g.toast('传送到 ' + L.name, 1.5);
    });
    pick('— 村民 —', () => (g.village?.list || []).filter((v) => !v.away).map((v) => ({ label: v.d.name, v })), ({ v }) => {
      this.tp(v.pos.x + 1.2, v.pos.z + 1.2); g.toast(`到了${v.d.name}身边`, 1.5);
    });
    pick('— 门派山门 —', () => g.mapData.sects.map((s) => ({ label: s.name + (s.hidden ? '*' : ''), s })), ({ s }) => {
      const p = polar(s.ang, s.dist), f = g.sects?.list.find((q) => q.name === s.name)?.front;
      this.tp(f ? f.x : p.x, f ? f.z : p.z + 7);
    });

    // ---- 资源 / 修为 ----
    head('资源 / 修为');
    add('❤ 回满血蓝', () => { const p = P(); p.hp = p.maxHp; p.qi = p.maxQi; });
    pair('💰 +1000文', () => g.addMoney(1000, P().pos), '💎 +100灵石', () => g.addStones(100, P().pos));
    add('🎒 每样东西 +5（工具除外）', () => {
      let n = 0;
      for (const [id, it] of Object.entries(ITEMS)) if (it.cat !== 'tool' && !it.quest) { g.inv.add(id, 5); n++; }
      g.toast(`${n} 种物品各 +5`, 2);
    });
    pair('✨ 升一层', () => this.levelUp(), '⚡ 破大境界', () => this.breakRealm());

    // ---- 渡劫试炼：点哪道劫就直接设成「该劫之前的圆满」并开劫；一点就给存档上锁（真存档不会被改）----
    head('渡劫试炼（点了就不存档）');
    const trialOpt = { home: false, avert: false };
    check('在洞府渡', false, (v) => { trialOpt.home = v; });
    check('服避劫丹', false, (v) => { trialOpt.avert = v; });
    const trial = (target) => {
      const P0 = P(), R = g.realm;
      if (R.trib) { g.toast('正在渡劫', 1.5); return; }
      lockSave(); g.save = () => false;
      P0.layer = 9 + (target - 1) * 4; // 筑基劫=炼气九层，之后每档 +4 层（13 / 17 / 21 / 25）
      P0.xp = g.xpNeed(P0.layer); R.cool = 0; R.recalc(true);
      P0.hp = P0.maxHp; P0.qi = P0.maxQi;
      if (trialOpt.home) { const d = g.life.home.door; this.tp(d.x, d.z + 3); } else this.tp(0, VILLAGE_R + 25);
      P0.avert = trialOpt.avert;
      R.startTrib(trialOpt.home, 1);
    };
    ['筑基劫（炼气→筑基）', '金丹劫', '元婴劫', '化神劫', '最终渡劫'].forEach((n, i) => add(`⚡ ${n}`, () => trial(i + 1)));

    // ---- 时间 / 天气 / 灵田 ----
    head('时间 / 天气 / 灵田');
    pair('⏩ +3 小时', () => { g.hours = Math.min(25.9, g.hours + 3); }, '🛏 睡到明早', () => g.life?.endDay('sleep'));
    add('🌧 下雨 / ☀ 放晴', () => {
      const rain = g.weatherToday !== 'rain'; g.weatherToday = rain ? 'rain' : 'clear'; g.weather?.setDay(rain);
      g.toast(rain ? '下雨了' : '放晴了', 1.2);
    });
    add('🌱 灵田全部成熟', () => {
      const F = g.farm; let n = 0;
      for (const t of F?.tiles || []) if (t.state === 2 && CROPS[t.crop]) { t.g = Math.max(t.g, CROPS[t.crop].days); t.w = true; F.paint(t); n++; }
      g.toast(n ? `${n} 块地成熟了` : '地里没种东西', 1.5);
    });

    // ---- 妖兽 ----
    head('妖兽');
    add('💥 清掉附近妖兽', () => {
      const E = g.enemies, p = P().pos; let n = 0;
      for (const e of [...E.list]) if (e.alive && !e.hidden && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 40) { E.damage(e, (e.hp || 1) + 1e6, p.x, p.z, 0); n++; }
      g.toast(n ? `清掉了 ${n} 只妖兽` : '附近没有妖兽', 1.5);
    });
    pick('— 召唤妖兽 —', () => Object.entries(TYPES).filter(([, T]) => !T.boss).map(([id, T]) => ({ label: T.name, id })), ({ id }) => {
      const p = P(), a = p.yaw ?? 0;
      g.enemies.spawn(id, p.pos.x + Math.sin(a) * 6, p.pos.z + Math.cos(a) * 6, 0); g.toast('召唤了 ' + TYPES[id].name, 1.2);
    });

    // ---- 云存档（模拟）：没接 Firebase 时用来试「游客 → 登录 → 换设备接着玩」----
    head('☁ 云存档（模拟）');
    const mockOnly = (fn) => () => { if (g.cloud?.mode !== 'mock') return g.toast('只有模拟云端能用（现在是 ' + (g.cloud?.mode || '关') + '）', 2); fn(); };
    add('📱 模拟换一台设备', mockOnly(async () => {
      if (!confirm('模拟换一台设备：先存档并传到云端，再清掉这台设备上的存档和登录状态，「云端」留着。\n之后在标题画面用同一个邮箱登录，就能把进度接回来（游客没登录的话进度就找不回来了）。')) return;
      if (!g.title) g.save();
      await g.cloud.flush(); g.cloud.halt();
      CloudSync.forgetDevice(); location.reload();
    }));
    pair('🔍 云端状况', mockOnly(() => { const s = CloudSync.mockStats(); g.toast(`模拟云端：${s.docs} 份存档 · ${s.accounts} 个登录账号 · ${(s.bytes / 1024).toFixed(1)} KB\n${g.cloud.statusText()}`, 3); }),
      '🧹 清空云端', mockOnly(() => { if (confirm('清空模拟云端（所有账号和云端存档）？本机存档不动。')) { g.cloud.halt(); CloudSync.wipeMock(); location.reload(); } }));
  }

  // 每帧（main.js tick 调用）：无限灵力 / 无敌兜底（溺水、天劫这类不走 hurt 的伤害）
  update() {
    const g = this.g, P = g.player, on = g.cheatOn;
    if (on.infQi) { P.qi = P.maxQi; }
    if (on.god && !P.dead && P.hp < P.maxHp) P.hp = P.maxHp;
  }

  levelUp() {
    const g = this.g, P = g.player, R = g.realm, I = R?.info;
    if (!R || I.end) { g.toast('已经到顶了', 1.5); return; }
    if (R.trib) { g.toast('正在渡劫，点「⚡ 破大境界」直接过', 2); return; }
    if (I.top && P.xp >= g.xpNeed(P.layer)) { g.toast('大境界圆满了，点「⚡ 破大境界」', 2); return; }
    P.xp = g.xpNeed(P.layer); R.addXP(0, P.pos, true); // addXP 里的 while 会升层（或卡在圆满并提示）
    if (R.info.top && P.xp >= g.xpNeed(P.layer)) g.toast(`${R.info.name}，修为圆满——点「⚡ 破大境界」免天劫突破`, 2.5);
  }

  breakRealm() {
    const g = this.g, P = g.player, R = g.realm, I = R?.info;
    if (!R || I.end) { g.toast('已经到顶了', 1.5); return; }
    if (R.trib) { R.passTrib(); return; } // 正在渡劫：直接过
    if (!I.top) { g.toast('还没到大境界圆满，先多点几下「✨ 升一层」', 2); return; }
    P.xp = g.xpNeed(P.layer);
    R.trib = { target: I.realm + 1, home: true }; R.passTrib();
  }

  tp(x, z) { const g = this.g, P = g.player; if (g.realm) g.realm.fly = false; P.pos.set(x, 0, z); P.vel?.set(0, 0, 0); g.minimap?.update?.(); }
}
