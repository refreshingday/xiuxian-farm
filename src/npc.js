import * as THREE from 'three';
import { createChibi, animChibi } from './chibi.js';
import { pick, clamp, lerpAngle } from './util.js';

// ---------- 低成本批量生成：名字池 + 4 套模板 + 数值随机 ----------
const SURN = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '林', '萧', '叶', '苏', '韩', '沈', '顾', '陆', '白', '云'];
const GIV = ['青', '云', '明', '月', '风', '雪', '清', '玄', '灵', '安', '若', '雨', '书', '言', '知', '远', '山', '竹', '兰', '婉', '逸', '尘', '宁', '辰'];
export const ELEM = ['金', '木', '水', '火', '土'];
export const GRADES = ['废', '下等', '中等', '上等', '天资', '绝世'];
export const REALMS = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神'];
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const PERS = {
  豪爽: ['哈哈，今天天气不错，陪我喝两杯？', '有什么难处尽管说，能帮的我一定帮！', '听说北边林子里野猪妖又多了，小心些。'],
  高冷: ['……有事？', '修行之路，独行而已。', '别挡路。'],
  胆小: ['啊！吓、吓我一跳……', '晚上千万别出村，外面好可怕……', '你、你能打妖怪？好厉害……'],
  狡诈: ['嘿嘿，道友，要不要做笔买卖？', '我知道一处宝地，不过嘛……消息可不便宜。', '矿洞里的灵石，听说值不少钱哦。'],
};
const STORY = {
  复仇: '眼中藏着一股恨意，似乎在追查某个魔修的下落。',
  寻亲: '常常望着远方发呆，说是在等失散多年的亲人。',
  求道: '一心向道，总在打听各大门派收徒的消息。',
  守护: '最在意的是家人平安，对村子的安危格外上心。',
};
const SKIN = ['#f6d5b8', '#eac3a0', '#f2cba8', '#d9ad88'];
const HAIR = ['#2e1e18', '#4a2e22', '#5e3c26', '#3a2a24'];
const ROBE = ['#c94f4f', '#4f7fc9', '#6aa86a', '#c9a24f', '#8a5fb0', '#e0e0d8', '#d07a3a', '#3f8a8a'];

function shade(hex, k) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }

function gradeOf(roots) {
  const n = roots.length, avg = roots.reduce((s, r) => s + r.p, 0) / n;
  return clamp(Math.floor(avg / 100 * 5.2 - (n - 1) * 0.75 + 0.5), 0, 5);
}

export function rollRoots(rng) {
  const w = rng();
  const n = w < 0.08 ? 1 : w < 0.35 ? 2 : w < 0.7 ? 3 : w < 0.9 ? 4 : 5;
  const els = [...ELEM].sort(() => rng() - 0.5).slice(0, n);
  return els.map((e) => ({ e, p: Math.round(20 + rng() * 70) }));
}

// 遗传：父母都有的元素大概率继承，纯度取平均再浮动
export function inheritRoots(a, b, rng) {
  const out = [];
  for (const e of ELEM) {
    const ra = a.find((r) => r.e === e), rb = b.find((r) => r.e === e);
    if (!ra && !rb) continue;
    const chance = ra && rb ? 0.9 : 0.55;
    if (rng() > chance) continue;
    const base = ra && rb ? (ra.p + rb.p) / 2 : (ra || rb).p * 0.8;
    out.push({ e, p: clamp(Math.round(base + (rng() - 0.4) * 30), 5, 100) });
  }
  if (!out.length) out.push({ e: pick(rng, ELEM), p: Math.round(15 + rng() * 30) });
  return out;
}

export function rootsText(roots) {
  const names = ['', '单', '双', '三', '四', '五'];
  const els = roots.map((r) => r.e).join('');
  if (roots.length === 1 && roots[0].p >= 85) return `天灵根·${els}`;
  if (roots.length === 5) return '五行杂灵根';
  return `${els} ${names[roots.length]}灵根`;
}

export function realmText(idx, layer) {
  if (idx === 0) return '凡人';
  if (idx === 1) return `炼气${NUM[clamp(layer, 1, 9) - 1]}层`;
  return REALMS[idx];
}

export function genPerson(rng, o = {}) {
  const surname = o.surname || pick(rng, SURN);
  const name = surname + pick(rng, GIV) + (rng() < 0.6 ? pick(rng, GIV) : '');
  const age = o.age || 'adult';
  const roots = o.roots || rollRoots(rng);
  const grade = gradeOf(roots);
  const cap = clamp(grade, 1, 5);
  let realm = 0, layer = 0;
  if (age === 'child') { realm = rng() < 0.4 ? 1 : 0; layer = 1; }
  else { realm = Math.min(cap, rng() < 0.3 ? 0 : 1 + (rng() < 0.25 ? 1 : 0)); layer = 1 + Math.floor(rng() * 8); }
  return {
    name, surname, age, roots, grade, realm, layer,
    pers: o.pers || pick(rng, Object.keys(PERS)),
    story: o.story || pick(rng, Object.keys(STORY)),
    hidden: !!o.hidden, parents: o.parents || null,
  };
}

function appearance(rng, p) {
  const robe = pick(rng, ROBE);
  return {
    skin: pick(rng, SKIN),
    hair: p.age === 'elder' ? '#e8e8ec' : pick(rng, HAIR),
    hairStyle: p.age === 'child' ? (rng() < 0.5 ? 3 : 2) : Math.floor(rng() * 3),
    robe, robe2: shade(robe, 0.65), belt: shade(robe, 0.4),
    age: p.age, beard: p.age === 'elder' && rng() < 0.7,
  };
}

// ---------- NPC ----------
export class NPC {
  constructor(game, data, home, rng) {
    this.game = game; this.d = data; this.home = home;
    this.c = createChibi(appearance(rng, data));
    this.pos = this.c.root.position;
    this.pos.set(home.door.x + (rng() - 0.5) * 4, 0, home.door.z + 2 + rng() * 3);
    this.yaw = 0; this.r = 0.35;
    this.path = []; this.wait = rng() * 3; this.talking = 0;
    this.speed = data.age === 'child' ? 2.4 : data.age === 'elder' ? 1.1 : 1.6;
    this.stuck = 0; this.last = new THREE.Vector2();
    this.mode = 'day';
    game.scene.add(this.c.root);
  }

  update(dt, hour) {
    const night = hour >= 20 || hour < 6;
    const w = this.game.world;
    if (night && this.mode !== 'home') { this.mode = 'home'; this.path = [{ ...this.home.door }, { ...this.home.inside }]; }
    if (!night && this.mode === 'home') { this.mode = 'day'; this.path = [{ ...this.home.door }]; }

    let moving = 0;
    if (this.talking > 0) {
      this.talking -= dt;
      const P = this.game.player.pos;
      this.yaw = lerpAngle(this.yaw, Math.atan2(P.x - this.pos.x, P.z - this.pos.z), 1 - Math.exp(-8 * dt));
    } else if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35) { this.path.shift(); this.wait = 1 + Math.random() * 4; }
      else {
        this.pos.x += dx / d * this.speed * dt; this.pos.z += dz / d * this.speed * dt;
        this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        moving = this.speed / 2.4;
        this.stuck += dt;
        if (this.stuck > 1.2) {
          if (Math.hypot(this.pos.x - this.last.x, this.pos.z - this.last.y) < 0.3) this.path.shift();
          this.stuck = 0; this.last.set(this.pos.x, this.pos.z);
        }
      }
    } else if (this.mode === 'day') {
      this.wait -= dt;
      if (this.wait <= 0) {
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 16;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (!w.insideHouse(x, z, 1.2) && !w.farmTileAt(x, z)) { this.path = [{ x, z }]; break; }
        }
      }
    }
    w.resolve(this.pos, this.r);
    this.c.root.rotation.y = this.yaw;
    animChibi(this.c, dt, { move: moving, attack: -1, cast: 0, talk: this.talking > 0 });
  }

  // 对话：直接显示灵根、资质、修为（隐世高人例外）
  talk(playerGrade) {
    this.talking = 6;
    const d = this.d;
    const line = pick(Math.random, PERS[d.pers]);
    let info, hint;
    if (d.hidden) {
      info = `灵根：??? ｜ 资质：??? ｜ 修为：炼气二层`;
      hint = '你隐约觉得此人深不可测，看不透其真实修为……';
    } else {
      info = `灵根：${rootsText(d.roots)}（${d.roots.map((r) => r.e + r.p).join(' ')}） ｜ 资质：${GRADES[d.grade]} ｜ 修为：${realmText(d.realm, d.layer)}`;
      if (d.age === 'child') hint = d.parents ? `${d.parents} 之子，灵根多半继承自父母。` : '还是个孩子。';
      else if (Math.abs(d.grade - playerGrade) <= 1) hint = '资质与你相近——或许有缘结为道侣。';
      else if (d.grade > playerGrade) hint = '对方资质远在你之上，似乎不屑一顾。';
      else hint = '对方资质与你相差甚远。';
    }
    const ageTxt = { child: '孩童', adult: '青壮', elder: '老者' }[d.age];
    return { name: d.name, sub: `${ageTxt} · ${d.pers} · ${STORY[d.story]}`, line, info, hint };
  }
}

// 村子：三户人家 + 一位隐世高人，孩子的灵根由父母遗传而来
export function populateVillage(game, rng) {
  const houses = game.world.houses.filter((h) => !h.player);
  const out = [];
  const add = (data, h) => { const n = new NPC(game, data, h, rng); out.push(n); return n; };
  houses.forEach((h, i) => {
    if (i === 1) {
      add(genPerson(rng, { age: 'elder', hidden: true, pers: '高冷', story: '求道', roots: [{ e: '水', p: 96 }] }), h);
      add(genPerson(rng, { age: 'child' }), h);
      return;
    }
    const fa = genPerson(rng, { age: 'adult' });
    const mo = genPerson(rng, { age: 'adult' });
    add(fa, h); add(mo, h);
    const kids = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < kids; k++) {
      const roots = inheritRoots(fa.roots, mo.roots, rng);
      add(genPerson(rng, { age: 'child', surname: fa.surname, roots, parents: `${fa.name}与${mo.name}` }), h);
    }
  });
  return out;
}
