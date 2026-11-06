// 联机同游（v1）：照《一箭双修》——PeerJS 按 4 位房间号牵线，之后浏览器直连；房主说了算（时辰、天气）。
// 每人用自己的存档和世界，联机后能：看到道友（模型、名字、境界、血条、动作）、小地图上的蓝点、
// 传音（Enter 打字）、传送到道友身边、互相赠送物品 / 文 / 灵石；时辰和天气跟房主走；
// 有人睡觉，大家一起睡到天亮（在原地醒来，在自家洞府才有打坐修为）。
// 邀请链接：…/index.html#ABCD 打开就直接加入。妖兽也同步（coopmobs.js）：大家看到同一批、一起打、打过的都有份。
// 进别人的房间（当道友）时用的还是自己的角色：修为、物品照拿，但自己存档里的日子不往前走——
// 睡觉只回满状态、不过天，农田 / 委托 / 村子都停着；离开房间就回到自己的时辰，接着玩。
import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { attachHeroModel } from './hero_model.js';
import { Net, normalizeCode, MAX_PLAYERS } from './net.js';
import { btn, el } from './ui.js';
import { item, itemName } from './items.js';
import { CoopMobs } from './coopmobs.js';
import { rollWeather } from './calendar.js';

const SEND_DT = 0.1, CLOCK_DT = 1, STALE = 6;
// 道友的衣服配色（按 peer id 挑一套，和主角的白衣蓝边区分开）
const LOOKS = [
  { robe: '#2f6f5a', robe2: '#e8d9a8', belt: '#1f4a3c', hair: '#2a1a14', hairStyle: 1 },
  { robe: '#8a3a3a', robe2: '#f0d8a0', belt: '#5a2020', hair: '#1a1210', hairStyle: 3 },
  { robe: '#5a4a8a', robe2: '#d8d0f0', belt: '#3a2f60', hair: '#3a2418', hairStyle: 0 },
  { robe: '#c8a040', robe2: '#5a3a1a', belt: '#7a5a20', hair: '#201410', hairStyle: 2 },
];
const DOT = ['#5ad8ff', '#ff8a5a', '#c08aff', '#ffd25a'];
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export class Coop {
  constructor(g, scene) {
    this.g = g; this.scene = scene;
    this.net = null; this.peers = new Map(); // id → { name, c, hero, tag, st, ... }
    this.sendT = 0; this.clockT = 0; this.remoteSleep = false;
    try { this.name = localStorage.getItem('mpName') || ''; } catch (e) { this.name = ''; }
    if (!this.name) this.name = '道友' + Math.floor(100 + Math.random() * 900);
    this.status = '';
    this.visiting = null; // 在别人的房间里：{ hours } = 进房前自己的时辰（存档时用它，日子也不往前走）
    g.coop = this;
    this.mobs = new CoopMobs(g);
    addEventListener('pagehide', () => { if (this.visiting) g.save?.(); }); // 在道友那边直接关页面：修为、物品先存下

    // 道友头顶的名字 / 境界 / 血条 / 传音气泡（DOM，跟着相机投影）
    const tags = this.tags = document.createElement('div');
    tags.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;overflow:hidden';
    document.body.appendChild(tags);
    // 传音输入框：联机时按 Enter 打开
    const chat = this.chatBox = document.createElement('input');
    chat.placeholder = '传音（Enter 发送，Esc 取消）'; chat.maxLength = 60;
    chat.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);width:min(420px,80vw);z-index:70;font:15px sans-serif;padding:8px 10px;border-radius:6px;border:1px solid #d6b670;background:rgba(20,24,22,.92);color:#fff;display:none';
    document.body.appendChild(chat);
    const stop = (e) => e.stopPropagation();
    chat.addEventListener('keyup', stop);
    chat.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' || e.key === 'Enter') { this.say(chat.value); this.closeChat(); }
      else if (e.code === 'Escape') this.closeChat();
    });
    addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' || !this.connected || g.title || g.ui.dialogOpen || g.ui.panelOpen || document.activeElement === chat) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      this.openChat();
    });

    // 有人睡觉（新的一天开始）→ 告诉大家一起睡；被别人叫睡的那次不再往外发，免得来回踢皮球
    const slept = () => {
      if (!this.remoteSleep && this.connected) this.net.send({ t: 'slept', nm: this.name });
      this.remoteSleep = false; return '';
    };
    slept.visit = true; // 在别人的房间里过夜也要喊大家一起睡
    g.life.dayHooks.push(slept);

    // 邀请链接 #ABCD：直接加入
    const code = normalizeCode(location.hash.slice(1));
    if (code.length === 4) setTimeout(() => this.join(code), 300);
  }

  get connected() { return !!this.net?.connected; }

  // ---------- 房间 ----------
  open() {
    const net = this.net = new Net();
    net.on('error', (msg) => { this.setStatus(msg); this.g.toast(msg, 3); if (!net.connected) this.leave(true); });
    net.on('hosting', (code) => { this.setStatus('房间已开，把房间号或邀请链接发给道友'); this.g.toast(`房间号 ${code}`, 3); history.replaceState(null, '', '#' + code); });
    net.on('open', (id) => {
      if (net.isHost) { this.g.toast('有道友加入了房间', 2.5); this.sendClock(); }
      else { this.visit(); this.g.toast(`进入了房间 ${net.code}\n用的是你自己的角色：修为、物品照拿，自己的日子不往前走`, 4); this.setStatus('已连上房主'); history.replaceState(null, '', '#' + net.code); }
      this.sendT = 0; this.refresh();
    });
    net.on('left', (id) => {
      if (net.isHost) { this.drop(id, true); net.send({ t: 'bye', id }); }
      else { for (const k of [...this.peers.keys()]) this.drop(k); this.g.toast('房主离开了，联机结束', 3); this.leave(true); }
      this.refresh();
    });
    net.on('msg', (d) => this.onMsg(d));
    return net;
  }
  host() { this.leave(true); this.open().host(); this.setStatus('正在开房间……'); }
  join(code) {
    code = normalizeCode(code);
    if (code.length !== 4) { this.g.toast('房间号是 4 位', 1.5); return; }
    this.leave(true); this.open().join(code); this.setStatus(`正在加入 ${code}……`);
  }
  leave(quiet) {
    if (this.net) { this.net.close(); this.net = null; }
    for (const k of [...this.peers.keys()]) this.drop(k);
    this.mobs.clearMirrors();
    this.unvisit();
    if (!quiet) { this.g.toast('离开了房间', 1.5); this.setStatus(''); history.replaceState(null, '', location.pathname + location.search); }
    this.refresh();
  }
  // 当道友：先把自己的存档存好，记下自己的时辰
  visit() {
    if (this.visiting) return;
    this.g.save?.();
    this.visiting = { hours: this.g.hours };
  }
  // 回到自己的世界：时辰、天气还原，存一次（修为、物品都在）
  unvisit() {
    const g = this.g, v = this.visiting; if (!v) return;
    this.visiting = null;
    g.hours = v.hours;
    g.weatherToday = rollWeather(g.day); g.weather.setDay(g.weatherToday === 'rain');
    g.save?.();
    setTimeout(() => g.toast('回到了自己的世界（修为、物品都带回来了）', 3), 1600);
  }
  setStatus(s) { this.status = s; this.refresh(); }
  refresh() { if (this.g.ui.panelOpen?.title === '联机') this.g.ui.refresh(); }

  // ---------- 收消息 ----------
  onMsg(d) {
    const g = this.g, P = g.player;
    if (this.mobs.onMsg(d)) return;
    switch (d.t) {
      case 'full': g.toast(`房间满了（最多 ${MAX_PLAYERS} 人）`, 2.5); this.leave(true); break;
      case 'st': this.onState(d); break;
      case 'bye': this.drop(d.id, true); break;
      case 'clock': // 房主的时辰和天气
        if (this.net.isHost || g.life.ending || g.title) break;
        if (Math.abs(g.hours - d.h) > 0.05) g.hours = d.h;
        if (d.w && g.weatherToday !== d.w) { g.weatherToday = d.w; g.weather.setDay(d.w === 'rain'); }
        break;
      case 'slept':
        if (g.life.ending || g.title || P.dead) break;
        this.remoteSleep = true;
        g.toast(`${d.nm || '道友'}睡下了，大家一起歇到天亮`, 2.5);
        g.life.endDay('sleep', g.life.atHome ? {} : { at: { x: P.pos.x, z: P.pos.z }, meditate: false });
        break;
      case 'chat': { const p = this.peers.get(d.from); this.bubble(p, d.s); g.toast(`${p?.name || d.nm || '道友'}：${d.s}`, 3.5); break; }
      case 'gift': {
        const who = this.peers.get(d.from)?.name || d.nm || '道友';
        if (d.kind === 'money') g.addMoney(d.n, P.pos);
        else if (d.kind === 'stones') g.addStones(d.n, P.pos);
        else if (item(d.id)) g.addItem(d.id, d.n, P.pos);
        else break;
        g.toast(`${who}送你 ${d.kind === 'money' ? d.n + ' 文' : d.kind === 'stones' ? d.n + ' 灵石' : itemName(d.id) + ' ×' + d.n}`, 3);
        g.sfx?.pickup?.();
        break;
      }
    }
  }

  onState(d) {
    let p = this.peers.get(d.from);
    if (!p) {
      p = this.spawn(d.from, d.nm);
      this.g.toast(`${d.nm} 来了`, 2);
      this.refresh();
    }
    if (d.nm !== p.name) { p.name = d.nm; this.refresh(); }
    p.st = d; p.seen = performance.now() / 1000;
  }

  spawn(id, name) {
    const h = hash(id), look = LOOKS[h % LOOKS.length];
    const c = createChibi({ skin: '#f8d8bc', pants: '#3a4250', sword: true, ...look });
    const hero = attachHeroModel(c);
    this.scene.add(c.root);
    const tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;font:12px sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000;white-space:nowrap';
    tag.innerHTML = '<div class="bub" style="display:none;margin-bottom:3px;padding:3px 7px;border-radius:8px;background:rgba(255,250,235,.92);color:#2a2418;text-shadow:none;max-width:220px;white-space:normal"></div><div class="nm"></div><div style="width:46px;height:4px;margin:2px auto 0;background:rgba(0,0,0,.6);border-radius:2px"><div class="hp" style="height:100%;background:#e0504a;border-radius:2px"></div></div>';
    this.tags.appendChild(tag);
    const p = { id, name, c, hero, tag, nm: tag.querySelector('.nm'), hp: tag.querySelector('.hp'), bub: tag.querySelector('.bub'), bubT: 0, st: null, seen: 0, atkT: 0, color: DOT[h % DOT.length], yaw: 0, init: false };
    this.peers.set(id, p);
    return p;
  }
  drop(id, say) {
    const p = this.peers.get(id); if (!p) return;
    this.scene.remove(p.c.root); p.tag.remove(); this.peers.delete(id);
    this.mobs.peerLeft(id);
    if (say) this.g.toast(`${p.name} 离开了`, 2);
  }

  // ---------- 发消息 ----------
  sendClock() { if (this.net?.isHost) this.net.send({ t: 'clock', h: this.g.hours, w: this.g.weatherToday }); }
  say(s) {
    s = (s || '').trim().slice(0, 60); if (!s || !this.connected) return;
    this.net.send({ t: 'chat', s, nm: this.name });
    this.bubble(this.selfBubble(), s);
  }
  // 自己说的话也在自己头上冒个泡（复用一个只有标签的假道友）
  selfBubble() {
    if (!this.me) {
      const tag = document.createElement('div'); tag.style.cssText = 'position:absolute;transform:translate(-50%,-100%);pointer-events:none';
      tag.innerHTML = '<div class="bub" style="display:none;padding:3px 7px;border-radius:8px;background:rgba(255,250,235,.92);color:#2a2418;font:12px sans-serif;max-width:220px"></div>';
      this.tags.appendChild(tag); this.me = { tag, bub: tag.querySelector('.bub'), bubT: 0 };
    }
    return this.me;
  }
  bubble(p, s) { if (!p) return; p.bub.textContent = s; p.bub.style.display = ''; p.bubT = 5; }
  gift(to, kind, id, n) {
    const g = this.g, inv = g.inv, p = this.peers.get(to);
    if (!p || !this.connected) return;
    if (kind === 'money') { if (inv.money < n) { g.toast('钱不够', 1.2); return; } inv.money -= n; }
    else if (kind === 'stones') { if (inv.stones < n) { g.toast('灵石不够', 1.2); return; } inv.stones -= n; }
    else { if (inv.count(id) < n) { g.toast('数量不够', 1.2); return; } inv.take(id, n); }
    inv.onChange?.();
    this.net.send({ t: 'gift', to, kind, id, n, nm: this.name });
    g.toast(`送给 ${p.name}：${kind === 'money' ? n + ' 文' : kind === 'stones' ? n + ' 灵石' : itemName(id) + ' ×' + n}`, 2);
  }
  tpTo(id) {
    const g = this.g, p = this.peers.get(id); if (!p?.st) return;
    if (g.player.dead) { g.toast('等醒来再传', 1.5); return; }
    if (g.realm) g.realm.fly = false;
    g.player.pos.set(p.st.x + 1.2, 0, p.st.z + 1.2); g.player.vel?.set(0, 0, 0);
    g.toast(`到了${p.name}身边`, 1.5);
  }
  openChat() { this.chatBox.style.display = ''; this.chatBox.value = ''; this.chatBox.focus(); }
  closeChat() { this.chatBox.style.display = 'none'; this.chatBox.blur(); }

  // ---------- 每帧（暂停时也跑：对话、面板开着时道友照样在动）----------
  update(dt, camera) {
    const g = this.g, P = g.player, now = performance.now() / 1000;
    if (this.connected && !g.title) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = SEND_DT;
        const o = g.poseOut || {}, r = (v) => Math.round(v * 100) / 100;
        this.net.send({ t: 'st', nm: this.name, x: r(P.pos.x), y: r(o.y || 0), z: r(P.pos.z), yaw: r(P.yaw), mv: r(o.move || 0), run: r(o.run || 0), a: o.atk ? 1 : 0,
          hp: Math.round(P.hp), mh: Math.round(P.maxHp), lv: g.realm?.info?.name || '', dead: P.dead ? 1 : 0, fly: g.realm?.fly ? 1 : 0, vis: P.c.root.visible ? 1 : 0 });
      }
      this.clockT -= dt;
      if (this.clockT <= 0) { this.clockT = CLOCK_DT; this.sendClock(); }
    }
    if (!g.title) this.mobs.update(dt); // 暂停时也照发快照，免得自己开个背包、道友那边的妖兽就没了
    const W = innerWidth, H = innerHeight, v = new THREE.Vector3();
    for (const p of this.peers.values()) {
      const s = p.st, R = p.c.root;
      if (!s || g.title || now - p.seen > STALE) { R.visible = false; p.tag.style.display = 'none'; continue; }
      // 平滑追到最新位置（10Hz 包，插值成每帧）
      const k = 1 - Math.exp(-12 * dt);
      if (!p.init || Math.hypot(s.x - R.position.x, s.z - R.position.z) > 12) { R.position.set(s.x, s.y, s.z); p.yaw = s.yaw; p.init = true; }
      else { R.position.x += (s.x - R.position.x) * k; R.position.y += (s.y - R.position.y) * k; R.position.z += (s.z - R.position.z) * k; }
      let dy = s.yaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * k; R.rotation.y = p.yaw;
      R.visible = !s.dead && s.vis !== 0;
      p.atkT = s.a ? (p.atkT + dt * 3) % 1 : -1;
      animChibi(p.c, dt, { move: s.mv, run: s.run, rate: 16, attack: s.a ? p.atkT : -1, combo: 0, cast: 0 });
      if (p.hero.ready) p.hero.sync(p.c, dt);
      // 头顶标签
      v.set(R.position.x, R.position.y + 2.3, R.position.z).project(camera);
      if (v.z > 1 || !R.visible) { p.tag.style.display = 'none'; continue; }
      p.tag.style.display = ''; p.tag.style.left = ((v.x + 1) / 2 * W) + 'px'; p.tag.style.top = ((1 - v.y) / 2 * H) + 'px';
      const t = `${p.name} · ${s.lv}`; if (p.nm.textContent !== t) p.nm.textContent = t;
      p.hp.style.width = Math.max(0, Math.min(100, s.hp / (s.mh || 1) * 100)) + '%';
      if (p.bubT > 0 && (p.bubT -= dt) <= 0) p.bub.style.display = 'none';
    }
    const me = this.me;
    if (me) {
      if (me.bubT > 0 && (me.bubT -= dt) <= 0) me.bub.style.display = 'none';
      v.set(P.pos.x, (g.poseOut?.y || 0) + 2.4, P.pos.z).project(camera);
      me.tag.style.left = ((v.x + 1) / 2 * W) + 'px'; me.tag.style.top = ((1 - v.y) / 2 * H) + 'px';
    }
  }

  // 小地图：道友画成彩色圆点（minimap.js 调用）
  dots() { const out = []; for (const p of this.peers.values()) if (p.st && p.c.root.visible) out.push({ x: p.st.x, z: p.st.z, color: p.color, name: p.name }); return out; }

  // ---------- 面板 ----------
  openPanel() {
    const g = this.g, ui = g.ui;
    ui.panel('联机', (body) => {
      const net = this.net, on = this.connected;
      const nameRow = el('div', 'prow', '<span class="pic">🧑</span>');
      const nameIn = el('input'); nameIn.value = this.name; nameIn.maxLength = 8;
      nameIn.style.cssText = 'flex:1;min-width:0;font-size:14px;padding:5px;background:#1a1e1c;color:#fff;border:1px solid #6a5a3a;border-radius:4px';
      const saveName = () => { const v = nameIn.value.trim().slice(0, 8); if (v) { this.name = v; try { localStorage.setItem('mpName', v); } catch (e) {} } };
      nameIn.addEventListener('change', saveName); nameIn.addEventListener('keydown', (e) => e.stopPropagation()); nameIn.addEventListener('keyup', (e) => e.stopPropagation());
      nameRow.append(el('span', '', '名字'), nameIn); body.append(nameRow);
      if (!net) {
        body.append(btn('🏯 开房间（我当房主）', () => { saveName(); this.host(); }, 'wide'));
        const r = el('div', 'prow');
        const codeIn = el('input'); codeIn.placeholder = '房间号（4 位）'; codeIn.maxLength = 4;
        codeIn.style.cssText = 'flex:1;min-width:0;font-size:16px;letter-spacing:4px;text-transform:uppercase;padding:5px;background:#1a1e1c;color:#fff;border:1px solid #6a5a3a;border-radius:4px';
        codeIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') { saveName(); this.join(codeIn.value); } }); codeIn.addEventListener('keyup', (e) => e.stopPropagation());
        r.append(codeIn, btn('加入', () => { saveName(); this.join(codeIn.value); }));
        body.append(r);
        body.append(el('div', 'pempty', `最多 ${MAX_PLAYERS} 人同游。每人用自己的存档；时辰、天气跟房主走，一人睡觉大家一起睡。妖兽大家一起打，打过的都有修为和掉落。<br>进别人的房间时用自己的角色，修为、物品照拿，但自己的日子不往前走，离开房间就回到自己的世界。<br>也可以把邀请链接（网址后面带 #房间号）直接发给道友。<br>手机用 4G/5G 连不上时换 Wi-Fi 试试。`));
      } else {
        const code = net.code || '····';
        body.append(el('div', 'pcat', `房间号　<b style="font-size:26px;letter-spacing:6px;color:#ffe7a8">${code}</b>　${net.isHost ? '（你是房主）' : ''}`));
        const link = location.origin + location.pathname + location.search + '#' + code;
        body.append(btn('🔗 复制邀请链接', () => { navigator.clipboard?.writeText(link).then(() => g.toast('邀请链接已复制', 1.5), () => prompt('复制这个链接发给道友', link)); }, 'wide'));
        if (this.status) body.append(el('div', 'pempty', this.status));
        body.append(el('div', 'pcat', `同游的道友（${this.peers.size}）`));
        if (!this.peers.size) body.append(el('div', 'pempty', on ? '等道友进来……' : '连接中……'));
        for (const p of this.peers.values()) {
          const s = p.st, d = s ? Math.round(Math.hypot(s.x - g.player.pos.x, s.z - g.player.pos.z)) : '?';
          body.append(ui.row('🧑', `<span style="color:${p.color}">●</span> ${p.name} <i>${s?.lv || ''}</i>`, `相距 ${d} 步${s ? `　气血 ${s.hp}/${s.mh}` : ''}`,
            [btn('传送', () => { ui.closePanel(); this.tpTo(p.id); }), btn('赠送', () => this.openGift(p.id))]));
        }
        const r = el('div', 'prow');
        const say = el('input'); say.placeholder = '传音……（游戏里按 Enter 也能说）'; say.maxLength = 60;
        say.style.cssText = 'flex:1;min-width:0;font-size:14px;padding:5px;background:#1a1e1c;color:#fff;border:1px solid #6a5a3a;border-radius:4px';
        say.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') { this.say(say.value); say.value = ''; } }); say.addEventListener('keyup', (e) => e.stopPropagation());
        r.append(say, btn('说', () => { this.say(say.value); say.value = ''; })); body.append(r);
        body.append(btn('🚪 离开房间', () => this.leave(), 'wide'));
      }
    });
  }
  openGift(to) {
    const g = this.g, ui = g.ui, inv = g.inv;
    ui.panel(() => `赠送给 ${this.peers.get(to)?.name || '道友'}`, (body) => {
      if (!this.peers.has(to)) { body.append(el('div', 'pempty', '道友已经离开了')); return; }
      body.append(el('div', 'pmoney', `💰 ${inv.money} 文　💎 ${inv.stones} 灵石`));
      body.append(ui.row('💰', '文', '', [btn('送 100', () => { this.gift(to, 'money', null, 100); ui.refresh(); }, inv.money >= 100 ? '' : 'off'), btn('送 1000', () => { this.gift(to, 'money', null, 1000); ui.refresh(); }, inv.money >= 1000 ? '' : 'off')]));
      body.append(ui.row('💎', '灵石', '', [btn('送 10', () => { this.gift(to, 'stones', null, 10); ui.refresh(); }, inv.stones >= 10 ? '' : 'off'), btn('送 100', () => { this.gift(to, 'stones', null, 100); ui.refresh(); }, inv.stones >= 100 ? '' : 'off')]));
      const ids = Object.keys(inv.n).filter((id) => inv.n[id] > 0 && item(id) && item(id).cat !== 'tool');
      if (!ids.length) body.append(el('div', 'pempty', '包里没有能送的东西'));
      for (const id of ids) {
        const it = item(id), n = inv.n[id];
        body.append(ui.row(it.icon || '📦', `${itemName(id)} <i>×${n}</i>`, '', [btn('送 1', () => { this.gift(to, 'item', id, 1); ui.refresh(); }), btn('全送', () => { this.gift(to, 'item', id, inv.count(id)); ui.refresh(); })]));
      }
      body.append(btn('← 返回', () => this.openPanel(), 'wide'));
    });
  }
}
