// 作弊面板：可最小化，按 ` 键开关；一键传送到村子 / 各门派山门，另有回满血蓝。
// 「开局带新手任务」：默认关——新开局跳过第一个小时的主线教学（s1–s5），直接接赤枫狼王；勾上则从野猪袭村开始。
import { polar } from './worldmap.js';
import { lockSave } from './save.js';
import { xpNeed } from './realm.js';
import { VILLAGE_R } from './world.js';

export function startWithQuest() { try { return localStorage.getItem('startQuest') === '1'; } catch (e) { return false; } }

export class Cheat {
  constructor(g) {
    this.g = g;
    const d = document.createElement('div'); d.id = 'cheat';
    d.style.cssText = 'position:fixed;left:8px;bottom:44px;z-index:60;font:12px sans-serif;color:#fff;background:rgba(20,20,30,.82);border:1px solid #8a7a4a;border-radius:6px;max-width:170px;user-select:none';
    d.innerHTML = '<div id="chHead" style="display:flex;justify-content:space-between;padding:4px 8px;cursor:pointer;background:#3a3020;border-radius:6px"><b>🛠 作弊</b><span id="chMin">—</span></div><div id="chBody" style="padding:6px;max-height:50vh;overflow:auto"></div>';
    document.body.appendChild(d);
    this.body = d.querySelector('#chBody'); this.min = d.querySelector('#chMin');
    let open = true;
    try { open = localStorage.getItem('cheatOpen') !== '0'; } catch (e) {}
    const set = (o) => { open = o; this.body.style.display = o ? '' : 'none'; this.min.textContent = o ? '—' : '＋'; try { localStorage.setItem('cheatOpen', o ? '1' : '0'); } catch (e) {} };
    d.querySelector('#chHead').addEventListener('click', () => set(!open));
    addEventListener('keydown', (e) => { if (e.code === 'Backquote') set(!open); });
    set(open);
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label; b.style.cssText = 'display:block;width:100%;margin:2px 0;padding:4px;font-size:12px;background:#4a4030;color:#fff;border:1px solid #8a7a4a;border-radius:4px;cursor:pointer';
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); b.blur(); }); this.body.appendChild(b);
    };
    const q = document.createElement('label'); q.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0 6px;cursor:pointer';
    q.innerHTML = '<input type="checkbox" id="chQuest"> 开局带新手任务';
    const cb = q.querySelector('input'); cb.checked = startWithQuest();
    cb.addEventListener('change', () => { try { localStorage.setItem('startQuest', cb.checked ? '1' : '0'); } catch (e) {} g.toast(cb.checked ? '下次「新的开始」从野猪袭村的新手任务开始' : '下次「新的开始」跳过新手任务', 2.5); });
    q.addEventListener('click', (e) => e.stopPropagation()); this.body.appendChild(q);
    add('🏠 回村', () => this.tp(0, 4));
    add('❤ 回满血蓝', () => { const P = g.player; P.hp = P.maxHp; P.qi = P.maxQi; });
    // 渡劫试炼：点哪道劫就直接把你设成「该劫之前的圆满」并开劫；一点就上锁存档（真存档不会被改）
    const th = document.createElement('div'); th.textContent = '渡劫试炼（点了就不存档）'; th.style.cssText = 'margin:6px 0 2px;opacity:.7'; this.body.appendChild(th);
    const opt = (label) => { const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0;cursor:pointer'; l.innerHTML = `<input type="checkbox"> ${label}`; l.addEventListener('click', (e) => e.stopPropagation()); this.body.appendChild(l); return l.querySelector('input'); };
    const homeCb = opt('在洞府渡'), avertCb = opt('服避劫丹');
    const trial = (target) => {
      const P = g.player, R = g.realm;
      if (R.trib) { g.toast('正在渡劫', 1.5); return; }
      lockSave(); g.save = () => false;
      P.layer = target === 1 ? 9 : 9 + (target - 1) * 4; // 筑基劫=炼气九层，之后每档 +4 层（13 / 17 / 21 / 25）
      P.xp = xpNeed(P.layer); R.cool = 0; R.recalc(true);
      P.hp = P.maxHp; P.qi = P.maxQi;
      if (homeCb.checked) { const d = g.life.home.door; this.tp(d.x, d.z + 3); } else this.tp(0, VILLAGE_R + 25);
      P.avert = avertCb.checked;
      R.startTrib(homeCb.checked, 1);
    };
    ['筑基劫（炼气→筑基）', '金丹劫', '元婴劫', '化神劫', '最终渡劫'].forEach((n, i) => add(`⚡ ${n}`, () => trial(i + 1)));
    const h = document.createElement('div'); h.textContent = '传送到门派'; h.style.cssText = 'margin:6px 0 2px;opacity:.7'; this.body.appendChild(h);
    for (const s of g.mapData.sects) { const p = polar(s.ang, s.dist); add(`${s.name}${s.hidden ? '*' : ''}`, () => { const f = g.sects?.list.find((q) => q.name === s.name)?.front; this.tp(f ? f.x : p.x, f ? f.z : p.z + 7); }); }
  }
  tp(x, z) { const P = this.g.player; P.pos.set(x, 0, z); P.vel?.set(0, 0, 0); this.g.minimap?.update?.(); }
}
