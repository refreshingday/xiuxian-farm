// 属性点（src/stats.js）：node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalPts, autoPts, freePts, capPts, cleanAlloc, autoSpread, statMul, curve, foeHpMul, layerForFoe, fmtNum, spentPts } from '../src/stats.js';

const foeLevel = (L) => (L <= 9 ? (L - 1) * 0.5 : 4.3 + (L - 10) * 1.45); // 和 realm.js 一样

test('每个小境界 30 点（固定 9 + 自由 21），大境界 81 点（固定 27 + 自由 54）', () => {
  assert.equal(totalPts(1), 0);
  assert.equal(totalPts(2), 30); assert.equal(freePts(2), 21); assert.equal(autoPts(2), 3);
  assert.equal(totalPts(10) - totalPts(9), 81); assert.equal(freePts(10) - freePts(9), 54);
  assert.equal(totalPts(26), 20 * 30 + 5 * 81);
});

test('平均分配：小境界每项约 +31%，大境界一倍多', () => {
  for (let L = 2; L <= 26; L++) {
    const up = curve(L) / curve(L - 1), big = [10, 14, 18, 22, 26].includes(L);
    if (big) assert.ok(up > 2 && up < 2.2, `L${L} ×${up}`); else assert.ok(up > 1.29 && up < 1.33, `L${L} ×${up}`);
  }
  // 平均分配出来的倍率和 curve 一致
  for (const L of [2, 9, 13, 26]) { const a = autoSpread({ atk: 0, hp: 0, def: 0 }, L); assert.ok(Math.abs(statMul(L, a.atk) / curve(L) - 1) < 0.03); }
});

test('旧存档没有 alloc：全部自由点都是未分配；分配不会超出、不会超单项上限', () => {
  for (const L of [1, 5, 18, 26]) {
    const a = cleanAlloc(undefined, L);
    assert.equal(spentPts(a), 0);
    const full = autoSpread(a, L);
    assert.equal(spentPts(full), freePts(L));
    for (const k of ['atk', 'hp', 'def']) assert.ok(full[k] <= capPts(L));
  }
  const bad = cleanAlloc({ atk: 1e9, hp: -5, def: 'x' }, 10);
  assert.ok(spentPts(bad) <= freePts(10) && bad.atk <= capPts(10) && bad.hp === 0 && bad.def === 0);
});

test('同级妖兽：气血跟着玩家攻击倍率涨', () => {
  for (const L of [1, 5, 10, 17, 22, 26]) assert.ok(Math.abs(foeHpMul(foeLevel(L)) / curve(L) - 1) < 1e-9, `L${L}`);
  assert.ok(Math.abs(layerForFoe(foeLevel(13)) - 13) < 1e-9);
  assert.equal(foeHpMul(0), 1);
});

test('大数字显示', () => {
  assert.equal(fmtNum(9999), '9999'); assert.equal(fmtNum(12345), '1.2万'); assert.equal(fmtNum(430000), '43万'); assert.equal(fmtNum(3.4e8), '3.4亿');
});
