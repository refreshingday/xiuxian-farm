// 秘境（GDD 第 4 / 7 节）：每周五开启，5 处轮流；就地升起结界围住一块地，里面每次重新随机生成（像 roguelite 的一局）。
// 走进结界就开始：三波妖兽（比外面强，带精英）→ 宝箱。出了结界这一局就结束。
// 流沙地宫：一层层往下，沙漏一直在流，时间到就塌——这一局拿到的东西全丢；每层开完宝箱都要选：带宝撤，还是继续往下赌。
// 万竹迷阵：竹墙乱阵，真路靠神识（V）看；最后一波是复制你装备和技能的镜像。
import * as THREE from 'three';
import { TYPES, SECTOR_MOBS } from './enemies.js';
import { sectorAt, ringAt, dangerFor } from './worldmap.js';
import { item, itemName } from './items.js';
import { near } from './life.js';
import { dateOf } from './calendar.js';
import { toon, glow, mesh, flat } from './util.js';

const R = 22, SAND_T = 300;
const ELEM = ['金', '木', '水', '火', '土'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class SecretRealms {
  constructor(g, landmarks) {
    this.g = g;
    this.list = landmarks.list.filter((L) => L.kind === 'secret');
    this.dome = null; this.domeAt = null; this.run = null; this.cleared = -1;
    TYPES.mirror = { ...TYPES.bandit, name: '镜像', c: ['#f2f4f6', '#4f7fc9', '#9ef0ff'], hp: 260, dmg: 20, drops: [], stones: [5, 9] };
    g.life.on((P) => this.run?.chest && near(P, this.run.chest.position, 2.4) && { label: '开启宝箱', act: () => this.openChest(), d: 0.5 });
    g.life.dayHooks.push((d) => (d.weekday === 4 ? `今日秘境开启：${this.list[this.weekIdx(d.day)].name}（舆图上有光柱）` : ''));
  }
  weekIdx(day) { return Math.floor((day - 1) / 7) % this.list.length; }
  // 今天开的是哪一处（周五 6:00 到次日 2:00）
  open() { const d = dateOf(this.g.day); return d.weekday === 4 && this.cleared !== this.g.day ? this.list[this.weekIdx(this.g.day)] : null; }

  setDome(L) {
    if (this.domeAt === L) return;
    if (this.dome) { this.g.scene.remove(this.dome); this.dome = null; }
    this.domeAt = L;
    if (!L) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({
      color: new THREE.Color('#b08aff').multiplyScalar(1.4), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    m.position.set(L.x, 0, L.z); this.g.scene.add(m); this.dome = m;
  }

  update(dt) {
    const g = this.g, P = g.player, L = this.run?.L || this.open();
    this.setDome(L);
    if (this.dome) { this.dome.rotation.y += dt * 0.1; this.dome.material.opacity = 0.12 + 0.05 * Math.sin(g.time * 2); }
    if (!this.run) { if (L && !P.dead && Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < R - 1) this.start(L); return; }
    const run = this.run, d = Math.hypot(P.pos.x - L.x, P.pos.z - L.z);
    // 出了结界：这一局结束（流沙地宫没塌就带着东西走）
    if (d > R + 1 || P.dead) { this.end(P.dead ? 'dead' : 'left'); return; }
    if (run.sand) {
      run.t -= dt;
      const bar = document.getElementById('tribBar'); document.body.classList.add('trib');
      bar.textContent = `流沙地宫 · 第 ${run.floor} 层　⌛ ${Math.max(0, Math.ceil(run.t))}`;
      if (run.t <= 0) { this.end('collapse'); return; }
    }
    if (run.state === 'fight' && !g.enemies.list.some((e) => e.secret)) {
      run.wave++;
      if (run.wave < 3) this.spawnWave();
      else this.spawnChest();
    }
  }
  start(L) {
    const g = this.g;
    const sand = L.name === '流沙地宫', maze = L.name === '万竹迷阵';
    this.run = { L, sand, maze, floor: 1, wave: 0, state: 'fight', loot: {}, t: SAND_T, obs: [], chest: null, lvl: Math.floor(dangerFor(L.x, L.z)) + 1, ring: Math.max(0, ringAt(L.x, L.z)) };
    for (const e of [...g.enemies.list]) if (!e.boss && Math.hypot(e.pos.x - L.x, e.pos.z - L.z) < R + 4) g.enemies.remove(e);
    this.layout();
    if (L.name === '古战场秘境' && !this.history) { this.chooseSide(); return; }
    this.spawnWave();
    g.toast(`进入秘境：${L.name}${sand ? '\n沙漏开始流了——别贪' : maze ? '\n竹阵重排……用神识（V）看清真路' : ''}`, 3.5);
  }
  // 古战场秘境（GDD 独特地点 11）：历史重演，选一边参战；表现改变「历史」，解锁不同奖励（只能改一次）
  chooseSide() {
    const g = this.g, go = (side) => { this.run.side = side; this.spawnWave(); g.toast(side === 'zheng' ? '你站到了正道联军一边' : '你站到了魔道一边', 2); };
    g.ui.dialog({ narrate: true, lines: ['四周的景象忽然变了——千年前的那场大战，在你眼前重演。', '正道联军与魔道大军杀成一团。你要站在哪一边？'],
      choices: [{ label: '⚔ 正道联军（镇魂之力：对鬼物行尸伤害大增）', fn: () => go('zheng') }, { label: '🩸 魔道大军（血煞之力：吸血，但业力 +10）', fn: () => go('xie') }] });
  }
  // 每次进来布局都不一样：石柱 / 竹墙
  layout() {
    const g = this.g, run = this.run, L = run.L;
    this.clearLayout();
    const n = run.maze ? 26 : 12, geo = run.maze ? new THREE.CylinderGeometry(0.18, 0.2, 5, 6).translate(0, 2.5, 0) : flat(new THREE.DodecahedronGeometry(1, 0)).scale(1, 2.2, 1).translate(0, 1.6, 0);
    const mat = toon(run.maze ? '#5e9a34' : run.sand ? '#c8a878' : '#8a8a94', { occ: true });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * (R - 8), x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 3) continue;
      const grp = new THREE.Group();
      const k = run.maze ? 5 : 1;
      for (let j = 0; j < k; j++) { const m = mesh(geo, mat); m.position.set((j - (k - 1) / 2) * 0.45 * Math.cos(a + 1.57), 0, (j - (k - 1) / 2) * 0.45 * Math.sin(a + 1.57)); grp.add(m); }
      grp.position.set(x, 0, z); g.scene.add(grp);
      run.obs.push({ grp, col: g.world.addCircle(x, z, run.maze ? 1.1 : 1.1) });
    }
  }
  clearLayout() { const run = this.run; if (!run) return; for (const o of run.obs) { this.g.scene.remove(o.grp); o.col.off = true; } run.obs = []; }
  spawnWave() {
    const g = this.g, run = this.run, L = run.L, sec = sectorAt(L.x, L.z), mobs = SECTOR_MOBS[sec.id];
    if (run.maze && run.wave === 2) { // 镜像
      const e = g.enemies.spawn('mirror', L.x, L.z, run.lvl + 2); e.secret = true; e.state = 'chase';
      g.toast('竹影里走出一个和你一模一样的人……', 2.5);
      return;
    }
    const n = 4 + run.wave * 2 + run.floor;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (R - 9);
      const e = g.enemies.spawn(pick(mobs), L.x + Math.cos(a) * r, L.z + Math.sin(a) * r, run.lvl + run.floor - 1 + (i === 0 ? 2 : 0));
      e.secret = true; e.state = 'chase';
      if (i === 0) { e.hp = e.maxHp *= 1.5; e.dmg *= 1.2; } // 精英
    }
    g.toast(`第 ${run.wave + 1} 波`, 1.2);
  }
  spawnChest() {
    const g = this.g, run = this.run, L = run.L;
    run.state = 'chest';
    const c = new THREE.Group();
    c.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8).translate(0, 0.35, 0), toon('#8a4a2a', { occ: true })));
    c.add(mesh(new THREE.BoxGeometry(1.26, 0.25, 0.86).translate(0, 0.82, 0), toon('#c8a050', { occ: true })));
    c.add(mesh(new THREE.SphereGeometry(0.5, 10, 8).translate(0, 0.9, 0), glow('#ffe7a8', 1.5)));
    c.position.set(L.x, 0, L.z); g.scene.add(c); run.chest = c;
    g.toast('宝箱出现了！', 2);
  }
  // 宝箱：境界圈越高、地宫越深，东西越好
  roll() {
    const run = this.run, ring = run.ring, depth = run.floor, out = {};
    const add = (id, n = 1) => { out[id] = (out[id] || 0) + n; };
    add('yaodan', 2 + depth + ring); add('shard', 2 + ring);
    add(pick(['lingtu', 'spring', 'pill_heal+1', 'pill_qi+1']), 2);
    if (Math.random() < 0.6) add(pick(['seed_renshen', 'seed_xuanbing', 'seed_chiyang', 'seed_yuehua']), 2);
    if (Math.random() < 0.35 + depth * 0.1) add(pick(['renshen@10', 'xuanbing@10', 'chiyang@10', 'renshen@100']));
    if (ring >= 1 && Math.random() < 0.3 + depth * 0.1) add(`tc_${pick(ELEM)}_${Math.min(3, ring)}`);
    if (Math.random() < 0.06 + depth * 0.04) add(`root_${pick(Math.random() < 0.8 ? ELEM : ['雷', '冰', '风', '暗'])}`);
    if (Math.random() < 0.25) add(pick(['pill_root', 'pill_xp+1', 'pill_avert+1']));
    return out;
  }
  openChest() {
    const g = this.g, run = this.run;
    if (!run?.chest) return;
    g.scene.remove(run.chest); run.chest = null;
    const got = this.roll();
    for (const [id, n] of Object.entries(got)) run.loot[id] = (run.loot[id] || 0) + n;
    const text = Object.entries(got).map(([id, n]) => `${itemName(id)}×${n}`).join('、');
    g.fx.burst({ x: run.L.x, z: run.L.z }, '#ffe7a8', 40, { speed: 4, up: 6, life: 1, y: 1 });
    if (run.sand) {
      g.ui.dialog({ narrate: true, line: `第 ${run.floor} 层宝箱：${text}`, info: `这一局已经拿到：${Object.entries(run.loot).map(([id, n]) => `${itemName(id)}×${n}`).join('、')}`, hint: `沙漏还剩 ${Math.ceil(run.t)} 秒。塌了就全没了。`,
        choices: [{ label: `继续下潜（第 ${run.floor + 1} 层，更凶、更值钱）`, fn: () => this.deeper() }, { label: '带宝离开', fn: () => this.end('left') }] });
    } else {
      this.give(); g.toast(`秘境宝箱：${text}`, 4);
      this.cleared = g.day; run.state = 'done';
      if (run.side && !this.history) {
        this.history = run.side;
        const P = g.player;
        if (run.side === 'zheng') { P.atkBonus += 0.05; g.quests?.flags.add('historyZheng'); }
        else { P.atkBonus += 0.1; g.realm?.addKarma(10); g.quests?.flags.add('historyXie'); }
        g.ui.dialog({ narrate: true, line: run.side === 'zheng' ? '战场的结局改写了：正道守住了阵线。一缕镇魂之力留在了你身上。' : '战场的结局改写了：魔道破阵而入。一股血煞之气钻进了你的经脉。', info: run.side === 'zheng' ? '攻击 +5%（历史已改写，不能再改）' : '攻击 +10%，业力 +10（历史已改写，不能再改）' });
      }
    }
  }
  deeper() {
    const run = this.run;
    run.floor++; run.wave = 0; run.state = 'fight'; run.t = Math.min(SAND_T, run.t + 60);
    this.layout(); this.spawnWave();
    this.g.toast(`下到第 ${run.floor} 层`, 1.6);
  }
  give() { for (const [id, n] of Object.entries(this.run.loot)) this.g.inv.add(id, n); this.run.loot = {}; }
  end(why) {
    const g = this.g, run = this.run;
    if (!run) return;
    for (const e of [...g.enemies.list]) if (e.secret) g.enemies.remove(e);
    if (run.chest) g.scene.remove(run.chest);
    this.clearLayout();
    document.body.classList.remove('trib');
    if (run.sand) {
      if (why === 'collapse') {
        const P = g.player; P.hp = Math.max(1, P.hp - P.maxHp * 0.4); P.pos.set(run.L.x + R + 3, 0, run.L.z);
        g.toast('地宫塌了！\n这一局拿到的东西全被埋在沙里……', 4); g.shake(1);
      } else if (why === 'left') {
        const n = Object.values(run.loot).reduce((a, b) => a + b, 0); this.give();
        if (n) g.toast(`带着 ${n} 件宝物离开了流沙地宫`, 3);
      }
      if (why !== 'dead') this.cleared = g.day;
    }
    this.run = null;
  }
  save() { return { cleared: this.cleared, history: this.history || null }; }
  load(s) { this.cleared = s.cleared ?? -1; this.history = s.history || null; if (this.run) this.end('dead'); }
}
