import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const MEMBRANE_DEF = { entityId: 'membrane', kind: 'term.defined', quote: '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다' };

/** MCP 너머의 가짜 호스트 모델. script: 노드 id → { draft, events }. 검사는 지적 없이 모두 답한다. 수정 요청에는 같은 원고를 돌려준다. */
function answerer(script = {}) {
  return (request) => {
    const p = request.payload;
    const own = script[p.node.id] ?? {};
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획: 학습 목표와 다룰 개념`;
    if (p.produces === 'children') return JSON.stringify({ children: p.node.level === 'part' ? [{ id: 'ch-1', title: '1장 세포' }] : [{ id: 'sec-1', title: '1절 세포란' }] });
    if (p.produces === 'draft') return own.draft ?? `${p.node.title || p.node.id} 본문.`;
    if (p.produces === 'events') return JSON.stringify({ events: own.events ?? [], appearances: [], mentions: [] });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 지나온 결과 이름을 모은다. */
async function drive(folio, root, start, answer, until = (o) => o.status === 'done') {
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

/** knowledge-book 복사본: work.yaml 고치기 + 엔티티 파일 쓰기(작가가 하는 일). 원본 fixture 는 그대로. */
async function book({ config = {}, entities = {} } = {}) {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  for (const [file, text] of Object.entries(entities)) await writeFile(join(root, 'entities', file), text);
  return root;
}

const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const findingsOf = (out) => [...out.question.blocking, ...out.question.advisories].map((f) => [f.checkId, f.code, f.entityId ?? null, f.severity]);

test('N1-1 over MCP stdio a textbook work (knowledge pack) gets its first section committed', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-n1-'), '처음 만나는 세포');
  assert.equal((await ok(folio.call('folio_init', { root, title: '처음 만나는 세포', preset: 'textbook', packs: ['knowledge'] }))).created, true);
  await ok(folio.call('folio_structure', { root, op: 'add', level: 'part', id: 'part-1', title: '1부 기초' }));
  const { labels, out } = await drive(folio, root, { node: 'next' }, answerer({ 'sec-1': { draft: '세포는 생명의 가장 작은 단위다.\n' } }));
  assert.deepEqual(labels, [
    'model:plan', 'user:approve', 'model:children',
    'model:plan', 'model:fit', 'user:approve', 'model:children',
    'model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve', 'done',
  ]);
  assert.equal(out.nodeId, 'sec-1');
  const sec = (await openWork(root)).tree.nodes.get('sec-1');
  assert.deepEqual([sec.status, sec.body.trim()], ['committed', '세포는 생명의 가장 작은 단위다.']);
  const applied = (await receiptOf(root, 'sec-1')).appliedChecks.map((a) => a.checkId);
  assert.deepEqual(applied, ['core.promise-order', 'knowledge.critic', 'knowledge.defined-before-use', 'knowledge.prerequisite-order']);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N1-2 the planted use-before-definition (membranes uses ATP) is an advisory; raised to block it stops the run', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = { membranes: { draft: MEMBRANES, events: [MEMBRANE_DEF] } };
  const root = await book({ config: { checkSets: ['knowledge.basic'] } });
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer(script), (o) => o.status === 'needs_user');
  assert.equal(label(out), 'user:approve');
  assert.deepEqual(findingsOf(out), [['knowledge.defined-before-use', 'USED_BEFORE_DEFINED', 'atp', 'advisory']]);
  const done = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
  assert.equal(done.status, 'done');

  const strict = await book({ config: { checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { severity: 'block' } } } });
  const blocked = await drive(folio, strict, { node: 'membranes' }, answerer(script), (o) => o.status === 'needs_user');
  assert.equal(label(blocked.out), 'user:blocked');
  assert.equal(blocked.labels.filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(blocked.out.question.blocking.map((f) => [f.code, f.entityId, f.severity]), [['USED_BEFORE_DEFINED', 'atp', 'block']]);
  const refused = await folio.call('folio_decide', { root: strict, runId: blocked.out.runId, action: 'approve' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'OVERRIDE_REASON_REQUIRED']);
  assert.equal((await ok(folio.call('folio_status', { root: strict }))).pending.question.kind, 'blocked');
});

test('N1-3 defining a concept before its prerequisite is caught; defining the prerequisite first clears it', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const entities = {
    'term/cell.md': '---\nid: cell\nkind: term\nname: 세포\n---\n',
    'term/membrane.md': '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell]\n---\n',
  };
  const root = await book({ config: { checkSets: ['knowledge.basic'] }, entities });
  const first = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft: MEMBRANES, events: [MEMBRANE_DEF] } }), (o) => o.status === 'needs_user');
  assert.deepEqual(findingsOf(first.out), [
    ['knowledge.defined-before-use', 'USED_BEFORE_DEFINED', 'atp', 'advisory'],
    ['knowledge.prerequisite-order', 'PREREQUISITE_NOT_DEFINED', 'membrane', 'advisory'],
  ]);
  await ok(folio.call('folio_decide', { root, runId: first.out.runId, action: 'skip', reason: '세포를 먼저 정의한다' }));
  const draft = '세포는 생명의 가장 작은 단위다. 세포막은 세포의 바깥 경계다.\n';
  const events = [{ entityId: 'cell', kind: 'term.defined', quote: '세포는 생명의 가장 작은 단위다' }, { entityId: 'membrane', kind: 'term.defined', quote: '세포막은 세포의 바깥 경계다' }];
  const second = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft, events } }), (o) => o.status === 'needs_user');
  assert.deepEqual(findingsOf(second.out), []);
});

test('N1-4 an avoided spelling is caught in the prose and ignored inside a code block', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const entities = { 'term/membrane.md': '---\nid: membrane\nkind: term\nname: 세포막\navoid: [세포 막]\n---\n' };
  const root = await book({ config: { checkSets: ['knowledge.basic', 'knowledge.terms'] }, entities });
  const draft = '세포막은 바깥 경계다. 세포 막을 지나는 물질이 있다.\n\n```text\n세포 막\n```\n';
  const events = [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }];
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft, events } }), (o) => o.status === 'needs_user');
  const avoided = out.question.advisories.filter((f) => f.code === 'TERM_AVOIDED');
  assert.deepEqual(avoided.map((f) => [f.checkId, f.entityId, f.quote, f.severity]), [['knowledge.term-consistency', 'membrane', '세포 막', 'advisory']]);
  assert.match(avoided[0].message, /1번/);
});

test('N1-5 the core promise-order lock blocks a knowledge book too, with no check sets chosen', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book();
  assert.deepEqual((await openWork(root)).config.checkSets, []);
  const events = [{ entityId: 'energy-detail', kind: 'promise.resolved', quote: 'ATP는 세포가 쓰는 에너지 화폐다' }];
  const script = { 'atp-section': { draft: 'ATP는 세포가 쓰는 에너지 화폐다.\n', events } };
  const { out } = await drive(folio, root, { node: 'atp-section' }, answerer(script), (o) => o.status === 'needs_user');
  assert.equal(label(out), 'user:blocked');
  assert.equal(out.question.canApprove, false);
  assert.deepEqual(out.question.blocking.map((f) => [f.checkId, f.code, f.severity]), [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]);
  const refused = await folio.call('folio_decide', { root, runId: out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
});

test('N1-6 a check set turned off does not run (the receipt says so); the locks stay', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = answerer({ membranes: { draft: MEMBRANES, events: [MEMBRANE_DEF] } });
  const none = await book({ config: { checkSets: [] } });
  const { out } = await drive(folio, none, { node: 'membranes' }, script, (o) => o.status === 'needs_user');
  assert.deepEqual(findingsOf(out), []);
  await ok(folio.call('folio_decide', { root: none, runId: out.runId, action: 'approve' }));
  const receipt = await receiptOf(none, 'membranes');
  assert.deepEqual(receipt.appliedChecks.map((a) => a.checkId), ['core.promise-order']);
  assert.deepEqual(receipt.steps.find((s) => s.id === 'facts').checks.map((c) => c.checkId), ['core.promise-order']);

  const one = await book({ config: { checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { mode: 'off' } } } });
  const second = await drive(folio, one, { node: 'membranes' }, script);
  assert.equal(second.out.status, 'done');
  assert.deepEqual((await receiptOf(one, 'membranes')).appliedChecks.map((a) => a.checkId), ['core.promise-order', 'knowledge.critic', 'knowledge.prerequisite-order']);

  const locked = await book({ config: { checkSets: [], checks: { 'core.promise-order': { mode: 'off' } } } });
  const refused = await folio.call('folio_run', { root: locked, node: 'membranes' });
  assert.equal(refused.error.code, 'CONFIG_INVALID');
  assert.ok(refused.error.details.errors.some((e) => e.code === 'LOCKED_CHECK_OVERRIDE'));
});
