import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const TISSUE = '조직 사진 {#fig-tissue}\n\n조직은 [[block:fig-cell]]의 세포가 모여 만든다[^n]. 잃어버린 그림은 [[block:fig-lost]].\n';

/** MCP 너머의 가짜 호스트 모델. drafts: 노드 id → 원고. 검사는 지적 없이 답하고, 수정 요청에는 같은 원고를 돌려준다. */
function answerer(drafts = {}) {
  return (request) => {
    const p = request.payload;
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
    if (p.produces === 'draft') return drafts[p.node.id] ?? `${p.node.title || p.node.id} 본문.`;
    if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. */
async function drive(folio, root, start, answer, until) {
  const labels = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, out };
    if (out.status === 'needs_model') {
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

/** blocks-book 복사본의 work.yaml 에 설정을 더한다(작가가 하는 일). 원본 fixture 는 그대로. */
async function book(config = {}) {
  const root = await copyFixture('blocks-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  return root;
}

const find = (folio, root, query, id = '*') => ok(folio.call('folio_find', { root, query, id }));
const untilUser = (o) => o.status === 'needs_user';

test('N3-1 over MCP stdio blocks are numbered per chapter, footnotes per node, and every broken mark is listed in status', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book();
  const all = await find(folio, root, 'blocks');
  assert.deepEqual(all.blocks.map((b) => [b.id, b.label, b.caption]), [
    ['intro', null, '들어가며'], ['fig-cover', '그림 1', '표지 그림: 세포 모형'], ['fig-cell', '그림 1.1', '세포 모형'], ['tbl-size', '표 1.1', '세포 크기 표'],
    ['fig-membrane', '그림 1.2', '막 구조'], ['eq-energy', '식 1.1', '에너지 식'], ['fig-atp', '그림 2.1', 'ATP 순환'], ['fig-tissue', '그림 3.1', '조직 사진'],
    ['tbl-appendix', '표 1', '부록 표'],
  ]);
  assert.deepEqual(all.footnotes.map((f) => [f.nodeId, f.id, f.number]), [['cell-section', 'def', 1], ['membrane-section', 'size', 1]]);
  assert.deepEqual(all.refs.filter((r) => r.nodeId === 'atp-section').map((r) => [r.target, r.label]), [['fig-atp', '그림 2.1'], ['fig-membrane', '그림 1.2'], ['fig-ghost', null]]);
  const chapter = await find(folio, root, 'blocks', 'chapter-energy');
  assert.deepEqual([chapter.scope, chapter.blocks.map((b) => b.label)], ['chapter-energy', ['그림 2.1']]);
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual([status.blocks.total, status.blocks.problems.map((p) => [p.code, p.nodeId, p.line])], [9, [
    ['FOOTNOTE_UNDEFINED', 'membrane-section', 3], ['FOOTNOTE_DUPLICATE', 'membrane-section', 8], ['FOOTNOTE_UNUSED', 'membrane-section', 9],
    ['BLOCK_REF_BROKEN', 'atp-section', 3], ['SOURCE_CITATION_BROKEN', 'atp-section', 4], ['BLOCK_DUPLICATE', 'tissue', 3],
  ]]);
  assert.equal((await folio.call('folio_find', { root, query: 'blocks', id: 'nowhere' })).error.code, 'NODE_NOT_FOUND');
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N3-2 the bibliography lists cited sources from body citations and evidence links; the index lists body places', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book();
  assert.deepEqual((await find(folio, root, 'bibliography')).entries.map((e) => [e.number, e.sourceId, e.title]), [[1, 'cell-notes', '세포 강의 메모'], [2, 'energy-review', '에너지 대사 개관']]);
  const claim = { quote: '세포막은 [[block:fig-cell]]의 바깥 경계다', sources: [{ sourceId: 'membrane-notes', quote: '세포막은 물질의 출입을 고른다.' }] };
  await ok(folio.call('folio_sources', { root, op: 'link', nodeId: 'membrane-section', claims: [claim] }));
  const linked = await find(folio, root, 'bibliography');
  assert.deepEqual(linked.entries.map((e) => [e.number, e.sourceId, e.citedIn.map((c) => `${c.nodeId}:${c.via}`)]), [
    [1, 'cell-notes', ['cell-section:citation']], [2, 'membrane-notes', ['membrane-section:evidence']], [3, 'energy-review', ['atp-section:citation']],
  ]);
  assert.deepEqual([linked.evidence, linked.ledger], [true, { ok: true }]);
  assert.deepEqual((await find(folio, root, 'bibliography', 'chapter-cell')).entries.map((e) => [e.number, e.sourceId]), [[1, 'cell-notes'], [2, 'membrane-notes']]);
  const terms = await find(folio, root, 'terms');
  assert.deepEqual(terms.entries.map((e) => [e.name, e.locations.map((l) => l.title)]), [
    ['ATP', ['ATP']], ['세포', ['세포란', '조직']], ['세포막', ['세포란', '세포막', 'ATP', '조직']], ['핵', ['조직']],
  ]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N3-3 a run with knowledge.references shows cross-reference advisories at approve, commits, and the new body is numbered', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book({ checkSets: ['knowledge.references'] });
  const { out, labels } = await drive(folio, root, { node: 'tissue' }, answerer({ tissue: TISSUE }), untilUser);
  assert.equal(label(out), 'user:approve');
  assert.deepEqual(labels, ['model:plan', 'model:draft', 'model:extract', 'user:approve']);
  assert.ok(!labels.includes('model:revise'), '참고 의견(advisory)은 자동 수정 사유가 아니다');
  assert.deepEqual(out.question.advisories.map((f) => [f.checkId, f.code, f.quote, f.severity]), [
    ['knowledge.cross-refs', 'BLOCK_REF_BROKEN', '[[block:fig-lost]]', 'advisory'], ['knowledge.cross-refs', 'FOOTNOTE_UNDEFINED', '[^n]', 'advisory'],
  ]);
  assert.equal((await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }))).status, 'done');
  const receipt = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === 'tissue').at(-1);
  assert.deepEqual(receipt.appliedChecks.map((a) => a.checkId), ['core.promise-order', 'knowledge.cross-refs']);
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(status.blocks.problems.filter((p) => p.nodeId === 'tissue').map((p) => p.code), ['BLOCK_REF_BROKEN', 'FOOTNOTE_UNDEFINED']);
  assert.deepEqual((await find(folio, root, 'blocks', 'tissue')).blocks.map((b) => [b.id, b.label]), [['fig-tissue', '그림 3.1']]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N3-4 raised to block the check stops the run and approving needs a reason; hard is refused; each toggle turns its query off', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const strict = await book({ checkSets: ['knowledge.references'], checks: { 'knowledge.cross-refs': { severity: 'block' } } });
  const { out, labels } = await drive(folio, strict, { node: 'tissue' }, answerer({ tissue: TISSUE }), untilUser);
  assert.equal(label(out), 'user:blocked');
  assert.equal(labels.filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(out.question.blocking.map((f) => [f.code, f.severity]), [['BLOCK_REF_BROKEN', 'block'], ['FOOTNOTE_UNDEFINED', 'block']]);
  assert.equal((await folio.call('folio_decide', { root: strict, runId: out.runId, action: 'approve' })).error.code, 'OVERRIDE_REASON_REQUIRED');
  const hard = await book({ checkSets: ['knowledge.references'], checks: { 'knowledge.cross-refs': { severity: 'hard' } } });
  const hardError = (await folio.call('folio_status', { root: hard })).error;
  assert.deepEqual([hardError.code, hardError.details.errors[0].code], ['CONFIG_INVALID', 'USER_CHECK_SEVERITY_INVALID']);
  const off = await book({ features: { blocks: false, bibliography: false, termIndex: false } });
  for (const [query, feature] of [['blocks', 'blocks'], ['bibliography', 'bibliography'], ['terms', 'termIndex']]) {
    const refused = await folio.call('folio_find', { root: off, query, id: '*' });
    assert.deepEqual([refused.error.code, refused.error.details.feature], ['FEATURE_DISABLED', feature]);
  }
  assert.equal((await ok(folio.call('folio_status', { root: off }))).blocks, null);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N3-5 numbers are a projection: moving a chapter renumbers its blocks without touching any anchor', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book();
  const cell = join(root, 'tree', '01-part-one', '01-chapter-cell', '01-cell.md');
  const before = await readFile(cell, 'utf8');
  await ok(folio.call('folio_structure', { root, op: 'move', nodeId: 'chapter-energy', parentId: 'part-one', index: 0 }));
  const moved = await find(folio, root, 'blocks');
  assert.deepEqual(moved.blocks.filter((b) => b.kind === 'fig').map((b) => [b.id, b.label]), [
    ['fig-cover', '그림 1'], ['fig-atp', '그림 1.1'], ['fig-cell', '그림 2.1'], ['fig-membrane', '그림 2.2'], ['fig-tissue', '그림 3.1'],
  ]);
  assert.equal(await readFile(join(root, 'tree', '01-part-one', '02-chapter-cell', '01-cell.md'), 'utf8'), before);
  assert.doesNotMatch(folio.stderr(), /Error/);
});
