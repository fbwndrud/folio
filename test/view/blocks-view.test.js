import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewBlocks } from '../../core/view/blocks-view.js';
import { bodySegments } from '../../core/view/segments.js';
import { viewNode } from '../../core/view/node-view.js';
import { copyFixture } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

test('blocks: anchors in reading order with how often they are cited, references with their target node, broken ones', async () => {
  const view = await viewBlocks(await copyFixture('knowledge-book'));
  assert.deepEqual(view.anchors.map((a) => [a.id, a.nodeId, a.refs]), [['fig-1-1', 'what-is-a-cell', 1], ['tbl-2-1', 'atp-section', 1]]);
  assert.deepEqual(view.refs.map((r) => [r.nodeId, r.target, r.valid, r.targetNodeId]), [
    ['membranes', 'fig-1-1', true, 'what-is-a-cell'], ['glycolysis', 'fig-9-9', false, null], ['tissues', 'tbl-2-1', true, 'atp-section'],
  ]);
  assert.deepEqual(view.problems.map((p) => [p.code, p.nodeId]), [['BLOCK_REF_BROKEN', 'glycolysis']]);
});

test('reading segments keep anchors and block references in place, and a reference knows its node', async () => {
  const body = '세포 {#fig-1} 는 [[block:fig-1]] 참고.\n```\n{#not-a-block}\n```\n';
  const segments = bodySegments(body, []);
  assert.deepEqual(segments, [
    { text: '세포 ' }, { text: '{#fig-1}', anchor: 'fig-1' }, { text: ' 는 ' }, { text: '[[block:fig-1]]', blockRef: 'fig-1' },
    { text: ' 참고.\n```\n{#not-a-block}\n```\n' },
  ]);
  assert.equal(segments.map((s) => s.text).join(''), body);
  const root = await copyFixture('knowledge-book');
  const refs = (await viewNode(root, 'membranes')).segments.filter((s) => 'blockRef' in s);
  assert.deepEqual(refs, [{ text: '[[block:fig-1-1]]', blockRef: 'fig-1-1', nodeId: 'what-is-a-cell', label: '그림 1.1' }]);
  assert.equal((await viewNode(root, 'glycolysis')).segments.find((s) => 'blockRef' in s).nodeId, null);
});

test('blocks-book: numbered anchors, footnotes, citations, bibliography and term index come with the plan fields', async () => {
  const view = await viewBlocks(await copyFixture('blocks-book'));
  assert.deepEqual(view.anchors.map((a) => [a.id, a.kind, a.number, a.label, a.caption, a.refs]), [
    ['intro', null, null, null, '들어가며', 1], ['fig-cover', 'fig', '1', '그림 1', '표지 그림: 세포 모형', 0],
    ['fig-cell', 'fig', '1.1', '그림 1.1', '세포 모형', 1], ['tbl-size', 'tbl', '1.1', '표 1.1', '세포 크기 표', 1],
    ['fig-membrane', 'fig', '1.2', '그림 1.2', '막 구조', 1], ['eq-energy', 'eq', '1.1', '식 1.1', '에너지 식', 0],
    ['fig-atp', 'fig', '2.1', '그림 2.1', 'ATP 순환', 1], ['fig-tissue', 'fig', '3.1', '그림 3.1', '조직 사진', 0], ['tbl-appendix', 'tbl', '1', '표 1', '부록 표', 0],
  ]);
  assert.deepEqual(view.refs.map((r) => [r.nodeId, r.target, r.valid, r.label, r.targetNodeId]), [
    ['membrane-section', 'fig-cell', true, '그림 1.1', 'cell-section'], ['membrane-section', 'tbl-size', true, '표 1.1', 'cell-section'],
    ['atp-section', 'fig-atp', true, '그림 2.1', 'atp-section'], ['atp-section', 'fig-membrane', true, '그림 1.2', 'membrane-section'],
    ['atp-section', 'fig-ghost', false, null, null], ['tissue', 'intro', true, null, 'preface'],
  ]);
  assert.deepEqual(view.problems.map((p) => p.code), [
    'FOOTNOTE_UNDEFINED', 'FOOTNOTE_DUPLICATE', 'FOOTNOTE_UNUSED', 'BLOCK_REF_BROKEN', 'SOURCE_CITATION_BROKEN', 'BLOCK_DUPLICATE',
  ]);
  assert.deepEqual(view.footnotes.map((f) => [f.nodeId, f.nodeTitle, f.id, f.number, f.text]), [
    ['cell-section', '세포란', 'def', 1, '정의는 [[source:cell-notes]]를 따랐다.'], ['membrane-section', '세포막', 'size', 1, '크기는 대략의 값이다.'],
  ]);
  assert.deepEqual(view.citations.map((c) => [c.nodeId, c.nodeTitle, c.sourceId, c.valid]), [
    ['cell-section', '세포란', 'cell-notes', true], ['atp-section', 'ATP', 'energy-review', true], ['atp-section', 'ATP', 'no-such', false],
  ]);
  assert.deepEqual(view.bibliography.entries.map((e) => [e.number, e.sourceId, e.title, e.citedIn]), [
    [1, 'cell-notes', '세포 강의 메모', [{ nodeId: 'cell-section', via: 'citation', nodeTitle: '세포란' }]],
    [2, 'energy-review', '에너지 대사 개관', [{ nodeId: 'atp-section', via: 'citation', nodeTitle: 'ATP' }]],
  ]);
  assert.deepEqual(view.bibliography.ledger, { ok: true });
  assert.equal(view.bibliography.evidence, true);
  assert.deepEqual(view.terms.entries.map((e) => [e.entityId, e.locations.map((l) => `${l.nodeId}:${l.count}`)]), [
    ['atp', ['atp-section:1']], ['cell', ['cell-section:4', 'tissue:1']],
    ['membrane', ['cell-section:1', 'membrane-section:2', 'atp-section:1', 'tissue:1']], ['nucleus', ['tissue:0']],
  ]);
});

test('blocks toggles: each section follows its own feature, and all three off is FEATURE_DISABLED', async () => {
  const withFeatures = async (features) => {
    const root = await copyFixture('blocks-book');
    await editYaml(root, (config) => { config.features = features; });
    return viewBlocks(root);
  };
  const off = await withFeatures({ blocks: false });
  for (const key of ['anchors', 'refs', 'problems', 'footnotes', 'citations']) assert.equal(off[key], null, key);
  assert.ok(off.bibliography.entries.length > 0 && off.terms.entries.length > 0);
  assert.equal((await withFeatures({ bibliography: false })).bibliography, null);
  assert.equal((await withFeatures({ termIndex: false })).terms, null);
  const noEvidence = await withFeatures({ evidence: false, occurrences: false });
  assert.deepEqual([noEvidence.bibliography.evidence, noEvidence.bibliography.ledger, noEvidence.terms.ledger], [false, null, null]);
  await assert.rejects(withFeatures({ blocks: false, bibliography: false, termIndex: false }), { code: 'FEATURE_DISABLED' });
});

test('reading segments also carry footnote references and source citations, and still add up to the body', async () => {
  const body = '세포[^n1]는 [[source:x]] 참고.\n```\n[^n2] [[source:y]]\n```\n';
  const segments = bodySegments(body, []);
  assert.deepEqual(segments, [
    { text: '세포' }, { text: '[^n1]', footnoteRef: 'n1' }, { text: '는 ' }, { text: '[[source:x]]', citation: 'x' },
    { text: ' 참고.\n```\n[^n2] [[source:y]]\n```\n' },
  ]);
  assert.equal(segments.map((s) => s.text).join(''), body);
  const root = await copyFixture('blocks-book');
  const cell = (await viewNode(root, 'cell-section')).segments;
  assert.deepEqual(cell.filter((s) => 'footnoteRef' in s), [{ text: '[^def]', footnoteRef: 'def', number: 1 }]);
  assert.deepEqual((await viewNode(root, 'membrane-section')).segments.filter((s) => 'footnoteRef' in s).map((s) => [s.footnoteRef, s.number]), [['size', 1], ['missing', null]]);
  assert.deepEqual((await viewNode(root, 'atp-section')).segments.filter((s) => 'citation' in s).map((s) => [s.citation, s.valid]), [['energy-review', true], ['no-such', false]]);
  assert.deepEqual((await viewNode(root, 'atp-section')).segments.filter((s) => 'citation' in s).map((s) => s.label), ['에너지 대사 개관', 'no-such']);
  assert.equal((await viewNode(root, 'atp-section')).segments.map((s) => s.text ?? `![[asset:${s.asset}]]`).join(''), (await openWork(root)).tree.nodes.get('atp-section').body);
  await editYaml(root, (config) => { config.features = { blocks: false }; });
  const plain = (await viewNode(root, 'membrane-section')).segments;
  assert.deepEqual(plain.filter((s) => 'footnoteRef' in s).map((s) => s.number), [null, null]);
  assert.ok(plain.filter((s) => 'blockRef' in s).every((s) => s.label === null && typeof s.nodeId === 'string'));
});


test('display fields resolve note citations and reference issue locations without changing reference identifiers', async () => {
  const view = await viewBlocks(await copyFixture('blocks-book'));
  assert.equal(view.refs.find((r) => r.target === 'intro').label, null);
  assert.equal(view.refs.find((r) => r.target === 'intro').targetTitle, '들어가며');
  assert.equal(view.problems[0].nodeTitle, '세포막');
  assert.equal(view.bibliography.entries[0].citedIn[0].nodeTitle, '세포란');
  const citation = view.footnotes[0].segments.find((s) => 'citation' in s);
  assert.equal(citation.label, '세포 강의 메모'); assert.equal(citation.valid, true);
  assert.equal(view.footnotes[0].segments.map((s) => s.text).join(''), view.footnotes[0].text);
});
import { openWork } from '../../core/store/work.js';
