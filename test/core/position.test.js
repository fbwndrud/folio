import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readTree } from '../../core/store/tree.js';
import { loadWorkConfig, validateWorkConfig } from '../../core/work/config.js';
import { computePositions, compareNodes } from '../../core/store/position.js';
import { fixturePath, copyFixture } from '../support/fixtures.js';

async function positionsOf(root, configPatch) {
  let { config } = await loadWorkConfig(root);
  if (configPatch) config = validateWorkConfig({ ...config, ...configPatch }).config;
  return computePositions(await readTree(root), config);
}

test('different branches and levels compare in reading order', async () => {
  const p = await positionsOf(fixturePath('novel-3level'));
  assert.equal(compareNodes(p, 'rooftop-scene', 'funeral'), 'before');   // 1권 장면 vs 2권 장면
  assert.equal(compareNodes(p, 'funeral', 'stairwell'), 'after');
  assert.equal(compareNodes(p, 'the-letter', 'stairwell'), 'after');     // 장 vs 앞 장의 장면
  assert.equal(compareNodes(p, 'book-two', 'last-night'), 'after');      // 책 vs 앞 책의 장면
  assert.equal(compareNodes(p, 'book-one', 'rooftop-scene'), 'before');  // 계획이 자식보다 앞
  assert.equal(compareNodes(p, 'post-office', 'post-office'), 'same');
  assert.equal(p.get('rooftop-scene').key, '0001.0001.0001');
  assert.equal(p.get('funeral').key, '0002.0001.0001');
});

test('front and back matter stay outside the reading order', async () => {
  const p = await positionsOf(fixturePath('knowledge-book'));
  assert.equal(compareNodes(p, 'preface', 'membranes'), 'not_applicable');
  assert.equal(compareNodes(p, 'tissues', 'glossary'), 'not_applicable');
  assert.equal(compareNodes(p, 'membranes', 'atp-section'), 'before');
  assert.equal(compareNodes(p, 'tissues', 'what-is-a-cell'), 'after');
});

test('branching and unordered works are not_applicable', async () => {
  const p = await positionsOf(fixturePath('gamebook'));
  assert.equal(compareNodes(p, 'gate', 'ending-key'), 'not_applicable');
  assert.equal(p.get('gate').orderMode, 'branching');
});

test('a level with order none drops itself and its descendants out', async () => {
  const p = await positionsOf(fixturePath('novel-3level'), { order: { default: 'linear', levels: { chapter: 'none' } } });
  assert.equal(compareNodes(p, 'rooftop-scene', 'funeral'), 'not_applicable');
  assert.equal(compareNodes(p, 'book-one', 'book-two'), 'before');
});

test('positions are recomputed after nodes move', async () => {
  const root = await copyFixture('novel-3level');
  await rename(join(root, 'tree/01-book-one'), join(root, 'tree/03-book-one'));
  const p = await positionsOf(root);
  assert.equal(compareNodes(p, 'funeral', 'rooftop-scene'), 'before');
});

test('unknown ids throw', async () => {
  const p = await positionsOf(fixturePath('novel-3level'));
  assert.throws(() => compareNodes(p, 'ghost', 'funeral'), { code: 'NODE_NOT_FOUND' });
});

test('a none level under a linear parent is unordered by none; a front node\'s children are unordered by role', async () => {
  const p = await positionsOf(fixturePath('novel-3level'), { order: { default: 'linear', levels: { chapter: 'none' } } });
  assert.deepEqual(['book-one', 'the-fall', 'rooftop-scene'].map((id) => p.get(id).unorderedBy), [null, 'none', 'none']);
  const mixed = await positionsOf(fixturePath('novel-3level'), { order: { default: 'branching', levels: { chapter: 'none' } } });
  assert.deepEqual(['book-one', 'the-fall', 'rooftop-scene'].map((id) => mixed.get(id).unorderedBy), ['branching', 'branching', 'branching']);
  const book = await positionsOf(fixturePath('knowledge-book'));
  assert.deepEqual(['preface', 'glossary'].map((id) => book.get(id).unorderedBy), ['role', 'role']);
});
