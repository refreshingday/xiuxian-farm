// 联机妖兽同步：谁刷出来的妖兽归谁算（AI、血量、死活都在主人那边），别人那边只是一个「镜像」
// （跟着同步过来的位置 / 血量 / 动作走）。打镜像时只出打击感，伤害发给主人去结算；
// 打死后所有打过它的人都拿修为和掉落。普通野怪会交给离它最近的道友来算（这样它才会去追那个人）。
// 妖王：谁先叫醒算谁的，同一个妖王两边都叫醒了就留房主（或 id 小的）那只。
// 妖王也会交接：主人走远 / 倒下、道友正贴着它打，就交给道友算（妖王只追算它的那个人）。
// 消息：en 快照（10Hz）· ehit 伤害 → 主人 · efx 定身 / 减速 → 主人 · ekill 死了 · erm 消失了 · eown 交接 · eshot 妖兽放的弹 · etele 妖王的预警圈 / 线（落下时打得到那边的人）· ezone 地上留的一片
const SNAP_DT = 0.1, OWN_DT = 0.5, SEND_R = 70, STALE = 2.5;
const r2 = (v) => Math.round(v * 100) / 100;

export class CoopMobs {
  constructor(g) {
    this.g = g; g.mobs = this;
    this.map = new Map(); // nid → enemy（自己的和镜像都在里面）
    this.seq = 0; this.snapT = 0; this.ownT = 0; this.stale = STALE; this.fresh = 3; // 秒：镜像多久没消息就收掉 / 道友多久没消息就当不在
  }
  get coop() { return this.g.coop; }
  get on() { return !!this.coop?.connected; }
  get me() { return this.coop.net.id; }
  send(o) { this.coop.net.send(o); }
  now() { return performance.now() / 1000; }

  // 还活着、离得不远的道友（{ id, x, z }）
  peers(alive = true) {
    const out = [], now = this.now();
    for (const p of this.coop.peers.values()) {
      const s = p.st; if (!s || now - p.seen > this.fresh || (alive && s.dead)) continue;
      out.push({ id: p.id, x: s.x, z: s.z });
    }
    return out;
  }
  nidOf(e) { if (!e.nid) { e.nid = this.me + '#' + (++this.seq); this.map.set(e.nid, e); } return e.nid; }

  // ---------- enemies.js 调过来的 ----------
  // 打到镜像：把伤害发给主人
  hit(e, a, x, z, k, c, h, tg) {
    if (!this.on || !e.owner) return;
    const hh = {};
    if (h) for (const key of ['launch', 'spike', 'lift', 'skill']) if (typeof h[key] === 'number' || typeof h[key] === 'boolean') hh[key] = h[key];
    e.hitT = this.now();
    this.send({ t: 'ehit', to: e.owner, nid: e.nid, a: r2(a), x: r2(x), z: r2(z), k: r2(k), c: crit(c), h: hh, tg: tg || '' });
  }
  // 镜像上被定身 / 减速了（符、寒冰掌、冰符……不管哪来的）：交给主人那边生效
  status(e) {
    const root = e.rootT > 0 ? r2(e.rootT) : 0, slow = e.slowT > 0 ? r2(e.slowT) : 0;
    if (!root && !slow) return;
    e.rootT = 0; e.slowT = 0;
    if (this.on && e.owner) this.send({ t: 'efx', to: e.owner, nid: e.nid, root, slow });
  }
  // 自己的妖兽死了：告诉大家，返回自己有没有份（没联机 / 自己打过 = 有份）
  killed(e) {
    const hs = e.hitters;
    if (this.on && e.nid && e.sent) { e.killedNet = true; this.send({ t: 'ekill', nid: e.nid, hit: hs ? [...hs].map((x) => x || this.me) : [this.me] }); }
    return !hs || !hs.size || hs.has('') || !this.on;
  }
  // 从列表里拿掉
  gone(e) {
    if (!e.nid) return;
    this.map.delete(e.nid);
    if (!e.mirror && !e.killedNet && e.sent && this.on) this.send({ t: 'erm', nid: e.nid });
  }
  // 自己的妖兽放了弹：道友那边也放一颗（只打得到那边的人）
  shot(x, z, yaw, s, c, sz, y, d) {
    if (!this.on || !this.peers().some((p) => Math.hypot(p.x - x, p.z - z) < SEND_R)) return;
    this.send({ t: 'eshot', x: r2(x), z: r2(z), yaw: r2(yaw), s, c, sz, y: r2(y), d: r2(d || 0) });
  }
  // 自己的妖王出招 / 地上留一片：附近的道友那边也有
  near(x, z) { return this.on && this.peers().some((p) => Math.hypot(p.x - x, p.z - z) < SEND_R); }
  tele(o) {
    if (!this.near(o.x, o.z)) return;
    const d = { t: 'etele' };
    for (const k in o) d[k] = typeof o[k] === 'number' ? r2(o[k]) : o[k];
    this.send(d);
  }
  zone(o) {
    if (!this.near(o.x, o.z)) return;
    this.send({ t: 'ezone', z: { x: r2(o.x), z: r2(o.z), r: r2(o.r), life: r2(o.life), dmg: r2(o.dmg || 0), slow: !!o.slow, pull: o.pull || 0, color: o.color } });
  }
  // 自己离太远、本来要删掉的野怪：附近有道友就交给他
  handoffFar(e) {
    if (!this.on || !canHand(e)) return false;
    let best = null, bd = 60;
    for (const p of this.peers()) { const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z); if (d < bd) { bd = d; best = p; } }
    if (!best) return false;
    this.handTo(e, best.id); return true;
  }

  // ---------- 交接 ----------
  handTo(e, id) {
    e.handT = this.now() + 8; // 刚交接过：8 秒内别再交（免得来回踢）
    if (e.boss) e.gen = (e.gen || 0) + 1; // 还没落下的招都作废
    const hit = e.hitters ? [...e.hitters].map((x) => x || this.me) : [];
    const s = { hit, boss: e.boss ? 1 : 0, phase: e.phase || 1, type: e.type, lvl: e.lvl, x: r2(e.pos.x), z: r2(e.pos.z), hp: r2(e.hp), maxHp: r2(e.maxHp), dmg: r2(e.dmg), night: e.night ? 1 : 0, blood: e.blood ? 1 : 0, hx: r2(e.home.x), hz: r2(e.home.y), state: e.state === 'chase' ? 'chase' : 'idle', title: e.title || '' };
    this.send({ t: 'eown', to: id, nid: this.nidOf(e), s });
    e.sent = true; this.mirrorize(e, id);
  }
  mirrorize(e, owner) {
    e.mirror = true; e.owner = owner; e.seen = this.now();
    e.net = { x: e.pos.x, z: e.pos.z, y: e.pos.y, yaw: e.yaw };
    e.kx = e.kz = 0; e.vy = 0; e.hitters = null;
  }

  // ---------- 每帧 ----------
  update(dt) {
    const g = this.g, en = g.enemies, now = this.now();
    if (!this.on) { if (this.map.size) this.clearMirrors(); return; }
    // 镜像太久没收到消息：主人走远了 / 掉线了
    for (const e of [...en.list]) if (e.mirror && now - e.seen > this.stale) this.drop(e);

    const far = this.peers(false);
    this.snapT -= dt;
    if (this.snapT <= 0 && far.length) {
      this.snapT = SNAP_DT;
      const l = [];
      for (const e of en.list) {
        if (e.mirror || !e.alive) continue;
        if (!far.some((p) => Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < SEND_R)) continue;
        e.sent = true;
        l.push([this.nidOf(e), e.type, e.lvl, r2(e.pos.x), r2(e.pos.z), r2(e.pos.y), r2(e.yaw), Math.round(e.hp * 10) / 10, Math.round(e.maxHp), e.state,
          (e.boss ? 1 : 0) | (e.fake ? 2 : 0) | (e.hidden ? 4 : 0) | (e.night ? 8 : 0) | (e.blood ? 16 : 0) | (e.boss && e.phase === 2 ? 32 : 0) | (e.touchT > g.time ? 64 : 0), e.title || '']);
      }
      if (l.length) this.send({ t: 'en', l });
    }
    // 交接：普通野怪交给离它明显更近的道友
    this.ownT -= dt;
    if (this.ownT <= 0) {
      this.ownT = OWN_DT;
      const P = g.player, ps = this.peers();
      if (ps.length) for (const e of [...en.list]) {
        if (e.mirror || !canHand(e) || (e.state !== 'idle' && e.state !== 'chase')) continue;
        const dm = P.dead ? 1e9 : Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
        let best = null, bd = 30;
        for (const p of ps) { const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z); if (d < bd && d + 5 < dm) { bd = d; best = p; } }
        if (best) this.handTo(e, best.id);
      }
      // 妖王：自己走远了 / 倒下了，道友正贴着它 → 交给道友算
      const b = en.boss;
      if (b && b.alive && !b.mirror && !b.fake && ps.length && !(b.handT > now) && b.state !== 'roar') {
        const dm = P.dead ? 1e9 : Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z);
        let best = null, bd = 22;
        for (const p of ps) { const d = Math.hypot(p.x - b.pos.x, p.z - b.pos.z); if (d < bd && d + 8 < dm && (P.dead || dm > 20)) { bd = d; best = p; } }
        if (best) { g.fx.clearTele?.(); en.clearZones(); this.handTo(b, best.id); }
      }
    }
  }
  drop(e) { e.mirror = true; if (e.alive) this.g.enemies.remove(e); }
  clearMirrors() {
    for (const e of [...this.g.enemies.list]) if (e.mirror) this.drop(e);
    for (const e of this.g.enemies.list) { e.sent = false; e.nid = null; e.hitters = null; } // 下次联机重新编号
    this.map.clear();
  }
  // 道友走了：他那边算的妖兽都没了
  peerLeft(id) { for (const e of [...this.g.enemies.list]) if (e.mirror && e.owner === id) this.drop(e); }

  // ---------- 收消息 ----------
  onMsg(d) {
    const g = this.g, en = g.enemies;
    switch (d.t) {
      case 'en': for (const s of d.l || []) this.snap(d.from, s); return true;
      case 'ehit': {
        const e = this.map.get(d.nid); if (!e || !e.alive) return true;
        const by = d.by || d.from;
        if (e.mirror) { if (e.owner && e.owner !== by) this.send({ ...d, to: e.owner, by, from: undefined }); return true; } // 刚交接出去：转给新主人
        en.by = by;
        try { en.damage(e, d.a, d.x, d.z, d.k, !!d.c, d.h || null, d.tg || ''); } finally { en.by = ''; }
        return true;
      }
      case 'ekill': {
        const e = this.map.get(d.nid); if (!e || !e.mirror || !e.alive) return true;
        e.hp = 0; en.killFx(e);
        if ((d.hit || []).includes(this.me)) { en.reward(e); g.onKill?.(e); }
        if (e.boss) {
          const L = e.lair || en.lairs.find((L) => L.type === e.type);
          if (L) L.deadDay = g.day;
          g.shake(1.2); g.fx.clearTele?.(); en.clearZones();
        }
        en.remove(e);
        return true;
      }
      case 'efx': {
        const e = this.map.get(d.nid); if (!e || !e.alive) return true;
        if (e.mirror) { if (e.owner && e.owner !== d.from) this.send({ ...d, to: e.owner, from: undefined }); return true; }
        if (d.root > 0) { e.rootT = Math.max(e.rootT || 0, d.root); e.kx = e.kz = 0; }
        if (d.slow > 0) e.slowT = Math.max(e.slowT || 0, d.slow);
        return true;
      }
      case 'erm': { const e = this.map.get(d.nid); if (e?.mirror) this.drop(e); return true; }
      case 'eown': {
        const s = d.s; if (!s) return true;
        let e = this.map.get(d.nid);
        if (s.boss && en.boss && en.boss !== e && en.boss.alive) { // 自己这边已经有别的妖王了：退回去
          if (d.from) this.send({ t: 'eown', to: d.from, nid: d.nid, s });
          if (e?.alive && e.mirror) this.drop(e);
          return true;
        }
        if (!e || !e.alive) { e = en.spawn(s.type, s.x, s.z, s.lvl); e.nid = d.nid; this.map.set(d.nid, e); }
        e.mirror = false; e.owner = null; e.net = null;
        Object.assign(e, { hp: s.hp, maxHp: s.maxHp, dmg: s.dmg, night: !!s.night, blood: !!s.blood, amb: true, sent: true, state: s.state, st: 0 });
        if (s.title) e.title = s.title;
        e.pos.x = s.x; e.pos.z = s.z; e.home.set(s.hx, s.hz);
        e.handT = this.now() + 8;
        e.hitters = new Set((s.hit || []).map((x) => (x === this.me ? '' : x))); // 之前谁打过它，打死后照样有份
        if (s.boss) {
          en.boss = e; e.lair ||= en.lairs.find((L) => L.type === s.type); e.amb = false;
          e.phase = s.phase || 1; e.state = 'walk'; e.st = 0.6; e.queue = []; e.tick = null; e.hop = 0; e.gen++;
          if (e.hidden) { e.hidden = false; e.root.visible = true; }
          if (e.phase === 2) en.rage(e);
        }
        return true;
      }
      case 'etele': en.ghostTele(d); return true;
      case 'ezone': if (d.z) { en.ghostShot = true; try { en.zone(d.z); } finally { en.ghostShot = false; } } return true;
      case 'eshot':
        en.ghostShot = true;
        try { en.shoot(d.x, d.z, d.yaw, d.s, d.d, d.c, d.sz, d.y); } finally { en.ghostShot = false; }
        return true;
    }
    return false;
  }
  // 一只妖兽的快照
  snap(from, [nid, type, lvl, x, z, y, yaw, hp, maxHp, state, fl, title]) {
    const g = this.g, en = g.enemies, now = this.now();
    let e = this.map.get(nid);
    if (e && e.alive && !e.mirror) return; // 已经是自己的了（交接过来，对方还没收到）
    if (!e || !e.alive) {
      if (nid.startsWith(this.me + '#')) return; // 自己以前的，已经没了
      if (fl & 1) { // 妖王：自己也叫醒了同一只？留房主（或 id 小的）那只
        const mine = en.boss;
        if (mine && !mine.mirror) {
          if (mine.type !== type) return; // 两边各打各的妖王：这边不显示对面那只
          if (!this.wins(from)) return;
          en.remove(mine);
        } else if (mine) return;
      }
      try { e = en.spawn(type, x, z, lvl); } catch (err) { return; }
      e.nid = nid; this.map.set(nid, e);
      this.mirrorize(e, from);
      e.pos.set(x, y, z); e.yaw = yaw;
      if (fl & 2) e.fake = true;
      if (fl & 1) { en.boss = e; e.lair = en.lairs.find((L) => L.type === type); }
    }
    e.owner = from; e.seen = now;
    e.net.x = x; e.net.z = z; e.net.y = y; e.net.yaw = yaw;
    // 刚打过它：等主人那边扣完血再信快照（免得血条先弹回去）
    e.hp = e.hitT && now - e.hitT < 0.4 ? Math.min(e.hp, hp) : Math.max(0.01, hp);
    e.maxHp = maxHp; e.state = state;
    e.night = !!(fl & 8); e.blood = !!(fl & 16); if (title) e.title = title;
    e.hidden = !!(fl & 4); e.root.visible = !e.hidden;
    e.touch = !!(fl & 64); // 妖王正在冲 / 转：撞到这边的人也算
    if (fl & 32 && e.phase !== 2) { e.phase = 2; en.rage(e); }
  }
  // 妖王冲突时谁留下：房主优先，否则 id 小的
  wins(other) {
    const net = this.coop.net, host = net.hostId;
    if (other === host) return true;
    if (this.me === host) return false;
    return other < this.me;
  }
}
const crit = (c) => (c ? 1 : 0);
// 能交给道友的：普通野怪（不是妖王、幻影、事件 / 委托刷的）
const canHand = (e) => e.amb && e.alive && !e.boss && !e.fake && !e.raid && !e.hidden && !e.lair;
