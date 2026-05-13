const test = require('node:test');
const assert = require('node:assert/strict');

const { EXP_PER_LEVEL, getLevelFromExp, applyExpGain, refreshPlayerFullHP } = require('../server.js');

test('getLevelFromExp 基础等级计算', () => {
    assert.equal(EXP_PER_LEVEL, 5000);
    assert.equal(getLevelFromExp(0), 1);
    assert.equal(getLevelFromExp(4999), 1);
    assert.equal(getLevelFromExp(5000), 2);
    assert.equal(getLevelFromExp(5001), 2);
    assert.equal(getLevelFromExp(10000), 3);
    assert.equal(getLevelFromExp(15000), 4);
});

test('applyExpGain 支持一次增加超过 5000 连升多级', () => {
    const p = { exp: 0, level: 1, hp: 3, maxHp: 3 };
    const r = applyExpGain(p, 15000);
    assert.equal(r.leveled, true);
    assert.equal(r.oldLevel, 1);
    assert.equal(r.newLevel, 4);
    assert.equal(p.level, 4);
    assert.equal(p.exp, 15000);
    assert.equal(p.maxHp, 6);
});

test('applyExpGain 输入校验：负数/非数字不应改变状态', () => {
    const p = { exp: 10, level: 1 };
    const r1 = applyExpGain(p, -1);
    assert.equal(r1.leveled, false);
    assert.equal(p.exp, 10);
    assert.equal(p.level, 1);

    const r2 = applyExpGain(p, Number.NaN);
    assert.equal(r2.leveled, false);
    assert.equal(p.exp, 10);
    assert.equal(p.level, 1);
});

test('refreshPlayerFullHP 将 hp 刷到 maxHp 并清除持续伤害状态', () => {
    const p = { hp: 1, maxHp: 5, burning: true, poisoned: true, dotStacks: 3 };
    refreshPlayerFullHP(p);
    assert.equal(p.hp, 5);
    assert.equal(p.maxHp, 5);
    assert.equal(p.burning, false);
    assert.equal(p.poisoned, false);
    assert.equal(p.dotStacks, 0);
});

test('性能：单次增加 100 万经验（约 200 次升级）应快速完成', () => {
    const p = { exp: 0, level: 1 };
    const start = process.hrtime.bigint();
    const r = applyExpGain(p, 1_000_000);
    const end = process.hrtime.bigint();

    assert.equal(r.leveled, true);
    assert.equal(p.level, 201);
    const ms = Number(end - start) / 1e6;
    assert.ok(ms < 50);
});
