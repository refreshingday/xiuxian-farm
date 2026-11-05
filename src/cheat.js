// 作弊面板：可最小化，按 ` 键开关；一键传送到村子 / 上次死亡点 / 各门派山门，另有回满血蓝。
// 「开局带新手任务」：默认关——新开局跳过第一个小时的主线教学（s1–s5），直接接赤枫狼王；勾上则从野猪袭村开始。
import { polar } from './worldmap.js';

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
    // 手机屏幕小：每次进游戏都先收起，只留标题条，要用再点开
    const phone = /[?&]mobile=1\b/.test(location.search) || (!/[?&]mobile=0\b/.test(location.search) && matchMedia('(pointer: coarse)').matches);
    if (phone) { open = false; d.style.bottom = '6px'; d.style.left = '6px'; this.body.style.maxHeight = '40vh'; }
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
    add('💀 回到上次死亡点', () => {
      const d = g.player.lastDeath;
      if (!d) { g.toast('还没死过', 1.5); return; }
      if (g.player.dead) { g.toast('等醒来再传', 1.5); return; }
      g.realm && (g.realm.fly = false); this.tp(d.x, d.z); g.toast('回到上次倒下的地方', 1.5);
    });
    add('❤ 回满血蓝', () => { const P = g.player; P.hp = P.maxHp; P.qi = P.maxQi; });
    const h = document.createElement('div'); h.textContent = '传送到门派'; h.style.cssText = 'margin:6px 0 2px;opacity:.7'; this.body.appendChild(h);
    for (const s of g.mapData.sects) { const p = polar(s.ang, s.dist); add(`${s.name}${s.hidden ? '*' : ''}`, () => { const f = g.sects?.list.find((q) => q.name === s.name)?.front; this.tp(f ? f.x : p.x, f ? f.z : p.z + 7); }); }
  }
  tp(x, z) { const P = this.g.player; P.pos.set(x, 0, z); P.vel?.set(0, 0, 0); this.g.minimap?.update?.(); }
}
