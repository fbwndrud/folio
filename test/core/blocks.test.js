import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, validateBlocks } from '../../core/store/blocks.js';
import { readTree } from '../../core/store/tree.js';
import { fixturePath } from '../support/fixtures.js';

test('parseBlocks finds anchors and references with line numbers', () => {
  assert.deepEqual(parseBlocks('세포 {#fig-1}\n[[block:fig-1]] 와 [[block:tbl-2]]\n'), {
    anchors: [{ id: 'fig-1', line: 1 }],
    refs: [{ target: 'fig-1', line: 2 }, { target: 'tbl-2', line: 2 }],
  });
});

test('the knowledge fixture has exactly the planted broken reference', async () => {
  const result = validateBlocks(await readTree(fixturePath('knowledge-book')));
  assert.deepEqual([...result.anchors.keys()].sort(), ['fig-1-1', 'tbl-2-1']);
  assert.deepEqual(result.problems, [{ code: 'BLOCK_REF_BROKEN', nodeId: 'glycolysis', target: 'fig-9-9', line: 1 }]);
  assert.equal(result.refs.filter((r) => r.valid).length, 2);
});

test('duplicate anchors are reported once per extra definition', () => {
  const nodes = new Map([
    ['a', { id: 'a', body: 'x {#fig-1}\n' }],
    ['b', { id: 'b', body: 'y {#fig-1}\n' }],
  ]);
  const result = validateBlocks({ nodes, rootIds: ['a', 'b'], errors: [] });
  assert.deepEqual(result.problems, [{ code: 'BLOCK_DUPLICATE', nodeId: 'b', id: 'fig-1', line: 1 }]);
});
