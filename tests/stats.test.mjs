// 属性点（src/stats.js）：node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAT_KEYS, totalPts, autoPts, freePts, capPts, cleanAlloc, spreadLike, evenSpread, derive, curve, foeHpMul, layerForFoe, fmtNum, spentPts, emptyAlloc } from '../src/stats.js';

const foeLevel = (L) => (L <= 9 ? (L - 1) * 0.5 : 4.3 + (L - 10) * 1.45); // 和 realm.js 一样

test('四项：力量 体质 敏捷 精神', () => assert.deepEqual(STAT_KEYS, ['str', 'con', 'agi', 'spi']));

test('每个小境界 40 点（各固定 3、自由 28），大境界 108 点（各固定 9、自由 72）', () => {
  assert.equal(totalPts(1), 0);
  assert.equal(totalPts(2), 40); assert.equal(freePts(2), 28); assert.equal(autoPts(2), 3);
  assert.equal(totalPts(10) - totalPts(9), 108); assert.equal(freePts(10) - freePts(9), 72);
  assert.equal(totalPts(26), 20 * 40 + 5 * 108);
});

test('四项平均：小境界 +31%，大境界一倍多', () => {
  for (let L = 2; L <= 26; L++) {
    const up = curve(L) / curve(L - 1), big = [10, 14, 18, 22, 26].includes(L);
    if (big) assert.ok(up > 2 && up < 2.2, `L${L} ×${up}`); else assert.ok(up > 1.29 && up < 1.33, `L${L} ×${up}`);
  }
  // 四项平均分配的人，力量倍率就是 curve
  for (const L of [5, 13, 26]) { const a = evenSpread(emptyAlloc(), L); assert.ok(Math.abs(derive(L, a).str / curve(L) - 1) < 0.03, `L${L}`); }
});

test('偏科有好处但不失控：占到上限约 ×1.5，只有固定点明显变弱', () => {
  for (const L of [5, 10, 18, 26]) {
    const top = derive(L, { str: capPts(L) }).str / curve(L), none = derive(L, {}).str / curve(L);
    assert.ok(top > 1.4 && top < 1.6, `L${L} 主修 ×${top}`); assert.ok(none < 0.35, `L${L} 不加 ×${none}`);
  }
});

test('敏捷、灵力越加越少，有上限', () => {
  const a = derive(26, { agi: capPts(26), spi: capPts(26) });
  assert.ok(a.speed <= 0.4 && a.crit <= 0.2 && a.qi <= 1 && a.regen <= 1);
  assert.ok(derive(5, { agi: 20 }).speed > derive(5, {}).speed);
});

test('旧存档没有 alloc（或旧的 atk/hp/def）：全部自由点都是未分配；分配不会超出、不会超单项上限', () => {
  for (const L of [1, 5, 18, 26]) {
    for (const old of [undefined, { atk: 30, hp: 20, def: 10 }]) {
      const a = cleanAlloc(old, L);
      assert.equal(spentPts(a), 0);
      for (const f of [spreadLike, evenSpread]) {
        const full = f(a, L);
        assert.equal(spentPts(full), freePts(L));
        for (const k of STAT_KEYS) assert.ok(full[k] <= capPts(L));
      }
    }
  }
  const bad = cleanAlloc({ str: 1e9, con: -5, agi: 'x' }, 10);
  assert.ok(spentPts(bad) <= freePts(10) && bad.str <= capPts(10) && bad.con === 0 && bad.agi === 0);
});

test('按现在的比例分配剩下的点', () => {
  const a = spreadLike({ ...emptyAlloc(), str: 20, con: 20 }, 9); // 炼气九层 224 自由点，比例 1:1:0:0
  assert.equal(spentPts(a), freePts(9));
  assert.equal(a.str, capPts(9)); assert.equal(a.con, capPts(9)); // 主修的两项先加满上限，挡不住的才溢到另外两项
  const b = spreadLike({ str: 2, con: 1, agi: 1, spi: 1 }, 9); // 上限够的时候按 2:1:1:1 分
  assert.equal(spentPts(b), freePts(9)); assert.ok(Math.abs(b.str / b.con - 2) < 0.1 && Math.max(b.con, b.agi, b.spi) - Math.min(b.con, b.agi, b.spi) <= 1, JSON.stringify(b));
});

test('同级妖兽：炼气圈跟平均分配的玩家一样，出了炼气圈再强一层', () => {
  for (const L of [1, 5, 7]) assert.ok(Math.abs(foeHpMul(foeLevel(L)) / curve(L) - 1) < 1e-9, `L${L}`);
  for (const L of [10, 17, 22, 26]) assert.ok(Math.abs(foeHpMul(foeLevel(L)) / curve(L + 1) - 1) < 1e-9, `L${L}`);
  assert.ok(Math.abs(layerForFoe(foeLevel(13)) - 13) < 1e-9);
  assert.equal(foeHpMul(0), 1);
});

test('大数字显示', () => {
  assert.equal(fmtNum(9999), '9999'); assert.equal(fmtNum(12345), '1.2万'); assert.equal(fmtNum(430000), '43万'); assert.equal(fmtNum(3.4e8), '3.4亿');
});
