import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crossRefs } from '../../packs/knowledge/checkers/cross-refs.js';
import { KNOWLEDGE_CHECKERS } from '../../packs/knowledge/checkers/index.js';
import { runDeterministicChecks } from '../../core/checks/run-checks.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { recommendCheckSets } from '../../core/checks/recommend.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fixturePath } from '../support/fixtures.js';

const book = () => openWork(fixturePath('blocks-book'));
const ctxFor = (work, nodeId, draft) => ({ work, node: work.tree.nodes.get(nodeId) ?? { id: nodeId }, draft });
const view = (findings) => findings.map((f) => [f.code, f.quote, f.severity ?? null]);

test('cross-refs: a clean draft gives nothing; the fixture membrane draft gives its three footnote problems quoted verbatim', async () => {
  const work = await book();
  assert.deepEqual(crossRefs(ctxFor(work, 'preface', work.tree.nodes.get('preface').body)), []);
  // 겹친 id 는 양쪽 어느 원고에서 봐도 알린다(M1 은 먼저 나온 cell-section 을 주인으로 삼지만, 원고를 쓰는 쪽은 어느 쪽이든 고칠 수 있다).
  assert.deepEqual(view(crossRefs(ctxFor(work, 'cell-section', work.tree.nodes.get('cell-section').body))), [['BLOCK_DUPLICATE', '{#fig-cell}', null]]);
  const draft = work.tree.nodes.get('membrane-section').body;
  const findings = crossRefs(ctxFor(work, 'membrane-section', draft));
  assert.deepEqual(view(findings), [
    ['FOOTNOTE_DUPLICATE', '[^size]:', null], ['FOOTNOTE_UNDEFINED', '[^missing]', null], ['FOOTNOTE_UNUSED', '[^spare]:', null],
  ]);
  for (const finding of findings) assert.ok(draft.includes(finding.quote), finding.quote);
});

test('cross-refs: broken references, anchors already used elsewhere or twice, unknown sources; repeats are counted once', async () => {
  const work = await book();
  const draft = [
    '새 그림 {#fig-new} 과 또 {#fig-new}. 다른 절의 {#fig-atp}.',
    '[[block:fig-cell]] 와 [[block:fig-new]] 는 있다. [[block:fig-nowhere]] 와 [[block:fig-nowhere]] 는 없다.',
    '[[source:energy-review]] 는 있고 [[source:nope]] 는 없다.',
    '```',
    '{#fig-cell} [[block:in-code]] [^in-code] [[source:in-code]]',
    '```',
  ].join('\n');
  const findings = crossRefs(ctxFor(work, 'new-section', draft));
  assert.deepEqual(view(findings), [
    ['BLOCK_DUPLICATE', '{#fig-new}', null], ['BLOCK_DUPLICATE', '{#fig-atp}', null],
    ['BLOCK_REF_BROKEN', '[[block:fig-nowhere]]', null], ['SOURCE_CITATION_BROKEN', '[[source:nope]]', null],
  ]);
  assert.match(findings.find((f) => f.code === 'BLOCK_REF_BROKEN').message, /\(2번\)$/);
  assert.deepEqual(findings.map((f) => f.target), ['fig-new', 'fig-atp', 'fig-nowhere', 'nope']);
  for (const finding of findings) assert.ok(draft.includes(finding.quote), finding.quote);
});

test('cross-refs: the draft replaces the node body — its own old anchors are neither duplicates nor still there', async () => {
  const work = await book();
  assert.deepEqual(crossRefs(ctxFor(work, 'membrane-section', '에너지 식 {#eq-energy}')), []);
  assert.deepEqual(view(crossRefs(ctxFor(work, 'membrane-section', '막은 [[block:fig-membrane]] 에 있다.'))), [['BLOCK_REF_BROKEN', '[[block:fig-membrane]]', null]]);
  assert.deepEqual(view(crossRefs(ctxFor(work, 'membrane-section', '그림은 [[block:intro]] 와 [[block:fig-cover]].'))), []);
  assert.throws(() => crossRefs({ draft: '[[block:x]]' }), TypeError);
});

test('knowledge.references: the pack registers cross-refs as an experimental advisory facts check, stamped by the core and recommended for books', async () => {
  const packs = await loadBuiltinPacks();
  assert.equal(KNOWLEDGE_CHECKERS['cross-refs'], crossRefs);
  assert.deepEqual(Object.keys(KNOWLEDGE_CHECKERS), ['defined-before-use', 'prerequisite-order', 'term-consistency', 'cross-refs', 'links']);
  const root = await copyFixture('blocks-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), checkSets: ['knowledge.references'] }));
  const ws = await openWorkspace(root, { packs });
  const check = ws.checks.find((c) => c.id === 'knowledge.cross-refs');
  assert.deepEqual([check.tier, check.stage, check.severity, check.experimental], ['deterministic', 'facts', 'advisory', true]);
  const [result] = runDeterministicChecks([check], ctxFor(ws.work, 'atp-section', ws.work.tree.nodes.get('atp-section').body));
  assert.deepEqual([result.status, view(result.findings)], ['passed', [
    ['BLOCK_REF_BROKEN', '[[block:fig-ghost]]', 'advisory'], ['SOURCE_CITATION_BROKEN', '[[source:no-such]]', 'advisory'],
  ]]);
  const recommended = recommendCheckSets({ registry: ws.registry, config: ws.work.config, workKind: 'textbook' }).find((r) => r.setId === 'knowledge.references');
  assert.deepEqual([recommended.selected, recommended.reasons], [true, [{ kind: 'workKind', value: 'textbook' }]]);
});
