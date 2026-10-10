import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateWorkConfig, loadWorkConfig, orderModeFor, levelIndex } from '../../core/work/config.js';
import { FIXTURES, fixturePath, tempDir } from '../support/fixtures.js';

const levels = [{ name: 'book', children: [1, 5] }, { name: 'chapter' }, { name: 'scene', leaf: true }];

test('fills defaults and marks only the last level as leaf', () => {
  const { config, errors } = validateWorkConfig({ levels });
  assert.deepEqual(errors, []);
  assert.deepEqual(config.levels.map((l) => [l.name, l.leaf, l.children]), [
    ['book', false, [1, 5]], ['chapter', false, null], ['scene', true, null],
  ]);
  assert.deepEqual(config.order, { default: 'linear', levels: {} });
  assert.deepEqual(config.variants, ['main']);
  // checkSets 키가 없으면 null(팩 기본 세트를 쓴다는 뜻). 빈 목록과 구분한다.
  assert.deepEqual([config.packs, config.checkSets, config.checks, config.overrides], [[], null, {}, {}]);
  assert.deepEqual([config.userCheckSets, config.options], [{}, { includeAllHardChecks: false }]);
  assert.deepEqual(validateWorkConfig({ levels, checkSets: [] }).config.checkSets, []);
});

test('accepts an order per level', () => {
  const { config, errors } = validateWorkConfig({ levels, order: { default: 'linear', levels: { chapter: 'none' } } });
  assert.deepEqual(errors, []);
  assert.equal(orderModeFor(config, 'chapter'), 'none');
  assert.equal(orderModeFor(config, 'scene'), 'linear');
  assert.equal(levelIndex(config, 'scene'), 2);
  assert.equal(levelIndex(config, 'nope'), -1);
});

const bad = [
  [{}, 'LEVELS_REQUIRED'],
  [{ levels: [{ name: 'a' }, { name: 'a', leaf: true }] }, 'LEVEL_NAME_DUPLICATE'],
  [{ levels: [{ name: 'Bad Name' }] }, 'LEVEL_NAME_INVALID'],
  [{ levels: [{ name: 'a', leaf: true }, { name: 'b' }] }, 'LEAF_NOT_LAST'],
  [{ levels: [{ name: 'a', children: [5, 1] }, { name: 'b' }] }, 'LEVEL_CHILDREN_INVALID'],
  [{ levels: [{ name: 'a' }, { name: 'b', children: [1, 2] }] }, 'LEVEL_CHILDREN_INVALID'],
  [{ levels, order: 'random' }, 'ORDER_MODE_INVALID'],
  [{ levels, order: { default: 'linear', levels: { ghost: 'none' } } }, 'ORDER_LEVEL_UNKNOWN'],
  [{ levels, variants: ['main', 'en'] }, 'VARIANT_UNSUPPORTED'],
  [{ levels, packs: 'novel' }, 'PACKS_INVALID'],
  [{ levels, checkSets: 'x' }, 'CHECK_SETS_INVALID'],
  [{ levels, checks: [] }, 'CHECKS_INVALID'],
  [{ levels, overrides: [] }, 'OVERRIDES_INVALID'],
];
for (const [raw, code] of bad) {
  test(`rejects config with ${code}`, () => {
    assert.ok(validateWorkConfig(raw).errors.some((e) => e.code === code), JSON.stringify(validateWorkConfig(raw).errors));
  });
}

for (const name of FIXTURES) {
  test(`loads the ${name} fixture config`, async () => {
    const { config } = await loadWorkConfig(fixturePath(name));
    assert.ok(config.levels.length >= 2);
  });
}

test('fixture orders: knowledge-book is linear, gamebook is branching', async () => {
  assert.equal((await loadWorkConfig(fixturePath('knowledge-book'))).config.order.default, 'linear');
  assert.equal((await loadWorkConfig(fixturePath('gamebook'))).config.order.default, 'branching');
});

test('loadWorkConfig reports missing and invalid files', async () => {
  const dir = await tempDir('folio-config-');
  await assert.rejects(loadWorkConfig(dir), { code: 'WORK_NOT_FOUND' });
  await writeFile(join(dir, 'work.yaml'), 'levels: []\n');
  await assert.rejects(loadWorkConfig(dir), (error) => error.code === 'CONFIG_INVALID' && error.details.errors[0].code === 'LEVELS_REQUIRED');
});
