// 存档向后兼容测试：node --test tests/*.test.mjs
// 规则见 src/saveFormat.js 开头。tests/fixtures/save-v<N>[-说明].json 是各版本的真实存档，永远不删：
//   save-v1-pre-cloud.json  云存档上线前（2026-11-06 之前）老玩家本机的存档，用改动前的代码玩出来的
//   save-v1.json            现在的格式（带 sid / rev / game）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SAVE_V, MIGRATIONS, migrate, decide } from '../src/saveFormat.js';

const dir = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(dir).filter((f) => /^save-v\d+(-[\w-]+)?\.json$/.test(f)).map((f) => ({ f, raw: readFileSync(new URL(f, dir), 'utf8') }));

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
    // 升级过一次的再读一次不变（sid 不能每次读都换），而且不用再写回
    const again = migrate(JSON.stringify(m.data));
    assert.deepEqual(again.data, m.data); assert.equal(again.changed, false);
    for (const k of ['text', 'at']) if (orig.meta?.[k] !== undefined) assert.equal(meta[k], orig.meta[k], `meta.${k} 不能被改`);
  });
}

test('云存档上线前的老存档：补上 sid / rev / game，版本号不变（旧页面也照样读得进）', () => {
  const raw = readFileSync(new URL('save-v1-pre-cloud.json', dir), 'utf8'), orig = JSON.parse(raw);
  assert.equal(orig.meta.sid, undefined, 'fixture 应该是没有 sid 的老存档');
  const m = migrate(raw);
  assert.equal(m.status, 'ok'); assert.equal(m.changed, true);
  assert.equal(m.data.v, orig.v, '只加字段不升版本：还开着旧页面的玩家要能读');
  assert.equal(m.data.meta.rev, 1);
  for (const k of Object.keys(orig)) if (k !== 'meta') assert.deepEqual(m.data[k], orig[k], `模块 ${k} 的数据不能变`);
});

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
