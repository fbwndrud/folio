import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { validateBlocks } from '../../core/store/blocks.js';
import { blockCatalog } from '../../core/blocks/catalog.js';
import { numberFootnotes } from '../../core/blocks/footnotes.js';
import { numberingLevel } from '../../core/blocks/numbering.js';
import { parseNodeMarks } from '../../core/blocks/syntax.js';
import { fixturePath } from '../support/fixtures.js';

const book = () => openWork(fixturePath('blocks-book'));

test('blocks are numbered per chapter in reading order, chapters counted across parts; front and back matter count on their own', async () => {
  const { blocks } = blockCatalog(await book());
  assert.deepEqual(blocks.map((b) => [b.id, b.nodeId, b.label]), [
    ['intro', 'preface', null], ['fig-cover', 'preface', '그림 1'],
    ['fig-cell', 'cell-section', '그림 1.1'], ['tbl-size', 'cell-section', '표 1.1'],
    ['fig-membrane', 'membrane-section', '그림 1.2'], ['eq-energy', 'membrane-section', '식 1.1'],
    ['fig-atp', 'atp-section', '그림 2.1'], ['fig-tissue', 'tissue', '그림 3.1'], ['tbl-appendix', 'appendix', '표 1'],
  ]);
  assert.deepEqual(blocks.find((b) => b.id === 'fig-cell'), {
    id: 'fig-cell', kind: 'fig', number: '1.1', label: '그림 1.1', nodeId: 'cell-section', line: 3, caption: '세포 모형',
    refs: [{ nodeId: 'membrane-section', line: 3 }],
  });
  assert.deepEqual(blocks.find((b) => b.id === 'intro'), { id: 'intro', kind: null, number: null, label: null, nodeId: 'preface', line: 1, caption: '들어가며', refs: [{ nodeId: 'tissue', line: 5 }] });
});

test('references carry their target label, footnotes are numbered per node, citations are checked against sources/', async () => {
  const catalog = blockCatalog(await book());
  assert.deepEqual(catalog.refs.map((r) => [r.nodeId, r.target, r.valid, r.label]), [
    ['membrane-section', 'fig-cell', true, '그림 1.1'], ['membrane-section', 'tbl-size', true, '표 1.1'],
    ['atp-section', 'fig-atp', true, '그림 2.1'], ['atp-section', 'fig-membrane', true, '그림 1.2'], ['atp-section', 'fig-ghost', false, null],
    ['tissue', 'intro', true, null],
  ]);
  assert.deepEqual(catalog.footnotes, [
    { nodeId: 'cell-section', id: 'def', number: 1, line: 7, text: '정의는 [[source:cell-notes]]를 따랐다.', refs: [1] },
    { nodeId: 'membrane-section', id: 'size', number: 1, line: 7, text: '크기는 대략의 값이다.', refs: [3] },
  ]);
  assert.deepEqual(catalog.citations, [
    { nodeId: 'cell-section', line: 7, sourceId: 'cell-notes', valid: true },
    { nodeId: 'atp-section', line: 4, sourceId: 'energy-review', valid: true },
    { nodeId: 'atp-section', line: 4, sourceId: 'no-such', valid: false },
  ]);
});

test('problems join M1 duplicates and broken references with footnote and citation problems, in reading order', async () => {
  const work = await book();
  const { problems } = blockCatalog(work);
  assert.deepEqual(problems, [
    { code: 'FOOTNOTE_UNDEFINED', nodeId: 'membrane-section', id: 'missing', line: 3 },
    { code: 'FOOTNOTE_DUPLICATE', nodeId: 'membrane-section', id: 'size', line: 8 },
    { code: 'FOOTNOTE_UNUSED', nodeId: 'membrane-section', id: 'spare', line: 9 },
    { code: 'BLOCK_REF_BROKEN', nodeId: 'atp-section', target: 'fig-ghost', line: 3 },
    { code: 'SOURCE_CITATION_BROKEN', nodeId: 'atp-section', sourceId: 'no-such', line: 4 },
    { code: 'BLOCK_DUPLICATE', nodeId: 'tissue', id: 'fig-cell', line: 3 },
  ]);
  for (const problem of validateBlocks(work.tree).problems) assert.ok(problems.some((p) => JSON.stringify(p) === JSON.stringify(problem)), problem.code);
});

test('a node id narrows every list to that branch, numbers stay work-wide, and an unknown node is NODE_NOT_FOUND', async () => {
  const work = await book();
  const energy = blockCatalog(work, { nodeId: 'chapter-energy' });
  assert.deepEqual(energy.blocks.map((b) => b.label), ['그림 2.1']);
  assert.deepEqual(energy.refs.map((r) => r.target), ['fig-atp', 'fig-membrane', 'fig-ghost']);
  assert.deepEqual([energy.footnotes, energy.citations.map((c) => c.sourceId)], [[], ['energy-review', 'no-such']]);
  assert.deepEqual(energy.problems.map((p) => p.code), ['BLOCK_REF_BROKEN', 'SOURCE_CITATION_BROKEN']);
  const leaf = blockCatalog(work, { nodeId: 'tissue' });
  assert.deepEqual([leaf.blocks.map((b) => b.id), leaf.problems.map((p) => p.code)], [['fig-tissue'], ['BLOCK_DUPLICATE']]);
  assert.deepEqual(blockCatalog(work, {}), blockCatalog(work));
  for (const bad of ['nowhere', '__proto__', 'constructor']) assert.throws(() => blockCatalog(work, { nodeId: bad }), { code: 'NODE_NOT_FOUND' });
});

test('a one-level work numbers the whole work in one run; the same anchor twice on a line is one block', async () => {
  const work = await book();
  const flat = { ...work, config: { ...work.config, levels: [work.config.levels.at(-1)] } };
  assert.equal(numberingLevel(flat.config), null);
  assert.equal(numberingLevel(work.config), 'chapter');
  assert.deepEqual(blockCatalog(flat).blocks.filter((b) => b.kind === 'fig').map((b) => b.label), ['그림 1', '그림 2', '그림 3', '그림 4', '그림 5']);
  const nodes = new Map([['a', { id: 'a', body: '{#fig-x} {#fig-x}\n', children: [], parentId: null, level: 'section', role: 'body' }]]);
  const tree = { nodes, rootIds: ['a'], errors: [] };
  const twice = { config: flat.config, tree, blocks: validateBlocks(tree), sources: new Map() };
  assert.deepEqual(blockCatalog(twice).blocks.map((b) => b.label), ['그림 1']);
  assert.deepEqual(blockCatalog(twice).problems.map((p) => p.code), ['BLOCK_DUPLICATE']);
});

test('footnotes: first reference order, repeated references share a number, unknown ones never get one', () => {
  const marks = parseNodeMarks(['첫[^b] 둘[^a] 셋[^b] 넷[^zz]', '[^a]: 에이', '[^b]: 비', '[^c]: 씨'].join('\n'));
  assert.deepEqual(numberFootnotes('n', marks), {
    footnotes: [
      { nodeId: 'n', id: 'b', number: 1, line: 3, text: '비', refs: [1, 1] },
      { nodeId: 'n', id: 'a', number: 2, line: 2, text: '에이', refs: [1] },
    ],
    problems: [{ code: 'FOOTNOTE_UNDEFINED', nodeId: 'n', id: 'zz', line: 1 }, { code: 'FOOTNOTE_UNUSED', nodeId: 'n', id: 'c', line: 4 }],
  });
});
