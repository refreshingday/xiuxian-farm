// 存档向后兼容测试：node --test tests/*.test.mjs
// 规则见 src/saveFormat.js 开头。每升一次 SAVE_V 就从游戏里存一份 tests/fixtures/save-v<N>.json，永远不删。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SAVE_V, MIGRATIONS, migrate, decide } from '../src/saveFormat.js';

const dir = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(dir).filter((f) => /^save-v\d+\.json$/.test(f)).map((f) => ({ f, raw: readFileSync(new URL(f, dir), 'utf8') }));

test('每个存档版本都有 fixture，每一步都有迁移', () => {
  const have = new Set(fixtures.map(({ raw }) => JSON.parse(raw).v));
  for (let v = 1; v <= SAVE_V; v++) assert.ok(have.has(v), `缺 tests/fixtures/save-v${v}.json（升版本时要从游戏里存一份）`);
  for (let v = 1; v < SAVE_V; v++) assert.equal(typeof MIGRATIONS[v], 'function', `缺迁移 MIGRATIONS[${v}]`);
});

for (const { f, raw } of fixtures) {
  test(`${f} 能迁到最新版本 v${SAVE_V}，模块数据都在`, () => {
    const orig = JSON.parse(raw), m = migrate(raw);
    assert.equal(m.status, 'ok');
    assert.equal(m.from, orig.v);
    assert.equal(m.data.v, SAVE_V);
    const meta = m.data.meta;
    assert.equal(typeof meta.sid, 'string'); assert.ok(meta.sid.length >= 6);
    assert.ok(Number.isInteger(meta.rev) && meta.rev >= 1);
    assert.equal(typeof meta.text, 'string'); assert.equal(typeof meta.at, 'number'); assert.equal(typeof meta.game, 'string');
    for (const k of Object.keys(orig)) if (k !== 'v' && k !== 'meta') assert.ok(k in m.data, `模块 ${k} 迁移后不见了`);
    assert.deepEqual(JSON.parse(raw), orig, '迁移不能改动传进来的原数据');
    // 迁移过一次的再迁一次不变（sid 不能每次读都换）
    assert.deepEqual(migrate(m.data).data, m.data);
  });
}

test('读不出来 / 比游戏新的存档', () => {
  assert.equal(migrate('{坏了').status, 'bad');
  assert.equal(migrate('null').status, 'bad');
  assert.equal(migrate({ meta: {} }).status, 'bad');
  const fut = migrate({ v: SAVE_V + 1, meta: { text: '未来' } });
  assert.equal(fut.status, 'future');
  assert.equal(fut.data.meta.text, '未来');
});

test('云同步怎么选（decide）', () => {
  const S = (sid, rev, v = SAVE_V) => ({ v, meta: { sid, rev, at: rev } });
  const D = (sid, rev, v = SAVE_V) => ({ v, sid, rev, at: rev });   // 云端文档的样子
  const B = (sid, rev) => ({ sid, rev });
  assert.equal(decide(null, null), 'same');
  assert.equal(decide(S('a', 1), null), 'push');                         // 第一次上传
  assert.equal(decide(null, D('a', 3)), 'pull');                         // 新设备
  assert.equal(decide(null, D('a', 3), null, 'a'), 'none');              // 本机「重新开始」丢掉的那条，别拉回来
  assert.equal(decide(S('a', 3), D('a', 3)), 'same');
  assert.equal(decide(S('a', 4), D('a', 3), B('a', 3)), 'push');         // 本机玩了
  assert.equal(decide(S('a', 3), D('a', 5), B('a', 3)), 'pull');         // 别的设备玩了
  assert.equal(decide(S('a', 4), D('a', 5), B('a', 3)), 'ask');          // 两边都玩了
  assert.equal(decide(S('b', 1), D('a', 5), B('a', 5)), 'push');         // 本机新的开始（旧的进 prev）
  assert.equal(decide(S('a', 2), D('b', 9)), 'ask');                     // 登录后：游客的一局 vs 账号里的一局
  assert.equal(decide(S('a', 7), D('a', 5)), 'push');                    // 同一局、没同步记录：取写得多的
  assert.equal(decide(S('a', 2), D('a', 5)), 'pull');
  assert.equal(decide(S('a', 2), D('a', 5, SAVE_V + 1)), 'future');      // 云端比游戏新：不碰
});
