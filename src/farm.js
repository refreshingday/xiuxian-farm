// 灵田（GDD 第 6 节）。地块一开始就全部开放，但地里没有灵气：
// - 普通作物不耗灵气，按天长熟（3–10 天），卖给村里；有的收完还会再结。
// - 灵草每天耗土壤灵气，灵气不够就不长；用妖丹、灵石碎片、灵泉水、灵土补。熟了可以留在地里长药龄（1 天 = 1 年）。
// - 每天要浇水（下雨天不用）：没浇水只是停止生长，连续 10 天没人管才枯死。
// - 过了季的庄稼会死在地里（有冰灵根不怕冬天），灵草只是不长。
import * as THREE from 'three';
import { FARM, pondDist } from './world.js';
import { CROPS, item, itemName } from './items.js';
import { toon, glow, mesh, flat } from './util.js';
import { near } from './life.js';

const CAN_MAX = 20, NEGLECT = 10, QI_MAX = 30;
// 熟了以后果实的颜色和大小
const LOOK = {
  radish: ['#ff8a3a', 0.16], cabbage: ['#bfe88a', 0.26], potato: ['#c8a070', 0.15], strawberry: ['#ff3a4a', 0.1], corn: ['#ffd84a', 0.16],
  pepper: ['#e8302a', 0.1], eggplant: ['#7a3aa8', 0.15], melon: ['#3a8a3a', 0.32], rice: ['#e8d27a', 0.12], pumpkin: ['#ff9a2a', 0.32],
  yam: ['#c85a6a', 0.15], grape: ['#7a4ab8', 0.12],
  lingcao: ['#7dffe0'], ninglu: ['#8ad8ff'], chiyang: ['#ff6a4a'], yuehua: ['#fff2a0'], renshen: ['#ffd27a'], xuanbing: ['#bfefff'],
};

export class Farm {
  constructor(g) {
    this.g = g;
    const w = g.world, F = FARM;
    this.can = CAN_MAX;
    this.ageRate = 1; // 药龄：1 天 = 1 年（聚灵阵可以加到 10）
    const G = this.G = {
      soil: new THREE.BoxGeometry(F.size * 0.92, 0.08, F.size * 0.92),
      qi: new THREE.PlaneGeometry(F.size * 0.8, F.size * 0.8).rotateX(-Math.PI / 2),
      leaf: w.G.leaf, stem: w.G.stem, bulb: w.G.bulb, fruit: flat(new THREE.IcosahedronGeometry(1, 1)),
    };
    const M = this.M = {
      soil: toon('#9a6a44', { map: w.T.soil }), wet: toon('#6a4630', { map: w.T.soil }),
      qi: glow('#7dffe0', 1.2), l1: toon('#6fcf6a'), l2: toon('#4fbf6a'), l3: toon('#3faa6a'), stem: toon('#3f9a5a'), dead: toon('#8a6a3a'),
      fruit: {},
    };
    M.qi.transparent = true; M.qi.opacity = 0.2; M.qi.depthWrite = false;
    this.tiles = [];
    for (let c = 0; c < F.cols; c++) for (let r = 0; r < F.rows; r++) {
      const x = F.x0 + (c + 0.5) * F.size, z = F.z0 + (r + 0.5) * F.size;
      const soil = mesh(G.soil, M.soil, { cast: false, recv: true }); soil.position.set(x, 0.04, z);
      const qi = mesh(G.qi, M.qi, { cast: false }); qi.position.set(x, 0.1, z);
      const plant = this.makePlant(); plant.g.position.set(x, 0.08, z);
      g.scene.add(soil, qi, plant.g);
      this.tiles.push({ x, z, c, r, state: 0, crop: null, g: 0, w: false, n: 0, age: 0, qi: 0, soil, qiMesh: qi, plant });
    }
    w.farm = this.tiles; // world.farmTileAt 按同样的顺序取
    for (const t of this.tiles) this.paint(t);

    // F：开垦 / 播种 / 浇水 / 补灵气 / 收获 / 清除枯苗
    g.life.on((P) => {
      const t = w.farmTileAt(P.pos.x + Math.sin(P.yaw) * 0.9, P.pos.z + Math.cos(P.yaw) * 0.9) || w.farmTileAt(P.pos.x, P.pos.z);
      return t && { ...this.action(t), d: 1 };
    });
    // 井边 / 池塘边打水
    g.life.on((P) => this.can < CAN_MAX && (near(P, { x: 0, z: 0 }, 2.6) || pondDist(P.pos.x, P.pos.z) < 1.4) &&
      { label: `打水（水壶 ${this.can}/${CAN_MAX}）`, act: () => { this.can = CAN_MAX; g.inv.onChange?.(); g.sfx?.dash?.(); g.fx.burst(P.pos, '#8ad8ff', 12, { speed: 2, up: 2, life: 0.5 }); }, d: 1.5 });
    g.life.dayHooks.push((d) => this.newDay(d));
  }

  makePlant() {
    const { G, M } = this, g = new THREE.Group();
    const leaf = (m, n, rad, y, tilt, s = 1) => {
      const grp = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, l = mesh(G.leaf, m, { cast: false });
        l.scale.setScalar(s); l.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); l.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
        grp.add(l);
      }
      return grp;
    };
    const sprout = leaf(M.l1, 2, 0.06, 0.12, 0.6, 0.6);
    const mid = leaf(M.l2, 4, 0.12, 0.2, 0.6);
    const ripe = leaf(M.l3, 5, 0.16, 0.22, 0.8);
    ripe.add(mesh(G.stem, M.stem, { cast: false }));
    const fruit = mesh(G.fruit, M.l3, { cast: false }); fruit.position.y = 0.55; ripe.add(fruit);
    const dead = leaf(M.dead, 3, 0.15, 0.06, 1.4, 0.8);
    g.add(sprout, mid, ripe, dead);
    return { g, sprout, mid, ripe, dead, fruit };
  }
  fruitMat(id) {
    const [c] = LOOK[id] || ['#ffffff'];
    return (this.M.fruit[id] ??= CROPS[id]?.kind === 'herb' ? glow(c, 3) : toon(c));
  }

  ripe(t) { return t.state === 2 && t.g >= CROPS[t.crop].days; }
  // 地块外观随状态更新（只在改动时调用）
  paint(t) {
    const p = t.plant, c = t.crop && CROPS[t.crop], ripe = this.ripe(t);
    t.soil.visible = t.state > 0;
    t.soil.material = t.state === 2 && t.w ? this.M.wet : this.M.soil;
    t.qiMesh.visible = t.state > 0 && t.qi > 0;
    t.qiMesh.scale.setScalar(0.35 + 0.65 * Math.min(1, t.qi / 10));
    const k = t.state === 2 ? (ripe ? 2 : t.g / c.days < 0.34 ? 0 : 1) : -1;
    p.sprout.visible = k === 0; p.mid.visible = k === 1; p.ripe.visible = k === 2; p.dead.visible = t.state === 3;
    if (ripe) {
      const herb = c.kind === 'herb';
      p.fruit.geometry = herb ? this.G.bulb : this.G.fruit;
      p.fruit.material = this.fruitMat(t.crop);
      p.fruit.scale.setScalar(herb ? 1.1 + Math.min(1, t.age / 100) * 0.8 : LOOK[t.crop]?.[1] ?? 0.15);
      p.fruit.position.y = herb ? 0.62 : 0.3 + (LOOK[t.crop]?.[1] ?? 0.15);
    }
  }

  // 当前选中的快捷栏物品决定 F 做什么
  action(t) {
    const g = this.g, inv = g.inv, sel = inv.selId, it = sel && item(sel);
    const work = (fn) => () => { g.player.work = 0.001; fn(); this.paint(t); g.fx.burst({ x: t.x, z: t.z }, '#c8a070', 8, { speed: 2, y: 0.1, bright: 0.8 }); };
    if (t.state === 0) return { label: '开垦', act: work(() => { t.state = 1; }) };
    if (t.state === 3) return { label: '清除枯苗', act: work(() => this.clear(t)) };
    if (it?.soilQi && t.qi < QI_MAX) return { label: `补灵气 · ${it.name}（+${it.soilQi}，现有 ${t.qi}）`, act: work(() => { inv.take(sel); t.qi = Math.min(QI_MAX, t.qi + it.soilQi); g.emit?.('soilQi'); g.fx.burst({ x: t.x, z: t.z }, '#7dffe0', 14, { speed: 1.5, up: 3, life: 0.7 }); }) };
    if (t.state === 1) {
      if (it?.cat === 'seed') {
        const c = CROPS[it.crop], ok = c.seasons.includes(this.season);
        return { label: `播种 · ${it.name}${ok ? '' : '（不合时令，种了不长）'}${c.qi && !t.qi ? '（地里没灵气）' : ''}`, act: work(() => { inv.take(sel); Object.assign(t, { state: 2, crop: it.crop, g: 0, n: 0, age: 0, w: g.weatherToday === 'rain' }); g.emit?.('plant', it.crop); }) };
      }
      return { label: `空地${t.qi ? ` · 灵气 ${t.qi}` : ''} · 快捷栏选中种子后按 F 播种` };
    }
    const c = CROPS[t.crop], ripe = this.ripe(t), can = sel === 'can';
    if (!t.w && (can || !ripe)) {
      if (this.can <= 0) return { label: `${c.name}要浇水 · 水壶空了，去井边或池塘打水` };
      return { label: `浇水 · ${c.name}${ripe ? `（留着长药龄，现 ${t.age} 年）` : ''} · 水壶 ${this.can}/${CAN_MAX}`, act: work(() => this.water(t)) };
    }
    if (ripe) {
      const id = this.yieldId(t);
      return { label: `收获 · ${itemName(id)}${c.kind === 'herb' ? `（药龄 ${t.age} 年）` : ''}`, act: work(() => this.harvest(t)) };
    }
    const why = c.qi && t.qi < c.qi ? ' · 灵气不足，不长' : !c.seasons.includes(this.season) ? ' · 不合时令' : '';
    return { label: `${c.name} · 第 ${t.g}/${c.days} 天${c.qi ? ` · 灵气 ${t.qi}` : ''} · 已浇水${why}` };
  }
  get season() { return Math.floor((this.g.day - 1) / 14) % 4; }
  water(t) {
    this.can--; t.w = true; this.g.emit?.('water');
    this.g.fx.burst({ x: t.x, z: t.z }, '#8ad8ff', 10, { speed: 1.5, up: 2, life: 0.5, y: 0.6 });
    this.g.inv.onChange?.();
  }
  yieldId(t) { const c = CROPS[t.crop]; return c.kind === 'herb' ? t.crop + (t.age >= 100 ? '@100' : t.age >= 10 ? '@10' : '') : t.crop; }
  harvest(t) {
    const c = CROPS[t.crop], id = this.yieldId(t), n = c.kind === 'crop' && Math.random() < 0.2 ? 2 : 1;
    this.g.addItem(id, n, t);
    this.g.emit?.('harvest', id, n);
    if (c.regrow) { t.g = c.days - c.regrow; t.w = false; }
    else this.clear(t);
  }
  clear(t) { Object.assign(t, { state: 1, crop: null, g: 0, n: 0, age: 0, w: false }); }

  // 新的一天：按昨天浇没浇水结算
  newDay(date) {
    const g = this.g, M = g.player.mods || {}, rain = g.weatherToday === 'rain' || !!M.autoWater, wood = g.rootPassive?.('木') ?? 0, ice = g.rootPassive?.('冰') ?? 0;
    const ageRate = this.ageRate * (1 + (M.herbAge || 0)), earth = g.rootPassive?.('土') ?? 0;
    if (M.soilQi) for (const t of this.tiles) if (t.state > 0) t.qi = Math.min(QI_MAX, t.qi + M.soilQi); // 聚灵阵
    let withered = 0, hungry = 0, ripened = 0;
    for (const t of this.tiles) {
      if (t.state !== 2) continue;
      const c = CROPS[t.crop], inSeason = c.seasons.includes(date.season);
      if (!inSeason && c.kind === 'crop' && !ice) { t.state = 3; withered++; this.paint(t); continue; }
      if (t.w) {
        t.n = 0;
        if (inSeason || ice) {
          if (c.qi && t.qi < c.qi) hungry++;
          else {
            if (c.qi && Math.random() >= earth * 2) t.qi -= c.qi; // 土灵根：灵草少耗灵气
            if (t.g < c.days) { t.g += 1 + (Math.random() < wood ? 1 : 0); if (t.g >= c.days) ripened++; }
            else if (c.kind === 'herb') t.age += ageRate;
          }
        }
      } else if (++t.n >= NEGLECT) { t.state = 3; withered++; }
      t.w = rain && t.state === 2;
      this.paint(t);
    }
    const notes = [];
    if (ripened) notes.push(`${ripened} 块地成熟了`);
    if (hungry) notes.push(`${hungry} 块灵草灵气不足`);
    if (withered) notes.push(`${withered} 块地的作物枯死了`);
    if (rain) notes.push(M.autoWater && g.weatherToday !== 'rain' ? '灵雨阵浇过水了' : '下雨了，不用浇水');
    return notes.length ? '灵田：' + notes.join('，') : '';
  }
  update() {
    // 熟了的灵草微微浮动
    const tm = this.g.time;
    for (const t of this.tiles) if (t.plant.ripe.visible && CROPS[t.crop].kind === 'herb') t.plant.fruit.position.y = 0.62 + Math.sin(tm * 2 + t.x) * 0.05;
  }
  save() { return { can: this.can, t: this.tiles.map((t) => [t.state, t.crop, t.g, t.w ? 1 : 0, t.n, t.age, t.qi]) }; }
  load(s) {
    this.can = s.can ?? CAN_MAX;
    s.t.forEach((v, i) => { const t = this.tiles[i]; if (!t) return; [t.state, t.crop, t.g, t.w, t.n, t.age, t.qi] = v; t.w = !!t.w; this.paint(t); });
  }
}
