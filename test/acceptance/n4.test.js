import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

/** MCP 너머의 가짜 호스트 모델. drafts·events: 노드 id → 원고·추출 사건. 검사는 지적 없이 답하고, 수정 요청에는 같은 원고를 돌려준다. */
function answerer(drafts = {}, events = {}) {
  return (request) => {
    const p = request.payload;
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
    if (p.produces === 'draft') return drafts[p.node.id] ?? `${p.node.title || p.node.id} 본문.`;
    if (p.produces === 'events') return JSON.stringify({ events: events[p.node.id] ?? [], appearances: [], mentions: [] });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 요청은 모두 모아 돌려준다. */
async function drive(folio, root, start, answer, until) {
  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, requests, out };
    if (out.status === 'needs_model') {
      requests.push(...out.requests);
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

/** fixture 복사본의 work.yaml 에 설정을 더하고 합성 사건을 넣는다(작가·앞 실행이 한 일). 원본 fixture 는 그대로. */
async function work(fixture, config = {}, seeds = []) {
  const root = await copyFixture(fixture);
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  for (const [index, seed] of seeds.entries()) await ledger.append({ type: 'event', eventId: `seed-${index + 1}`, ...seed });
  return root;
}

const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const factsOf = async (root, nodeId) => (await receiptOf(root, nodeId)).steps.find((s) => s.id === 'facts').checks.map((c) => [c.checkId, c.status]);
const until = (status) => (o) => o.status === status;
const UNORDERED = { checkSets: ['knowledge.basic', 'knowledge.unordered'] };

test('N4-1 over MCP stdio the reference preset makes an unordered work and folio_config recommends the unordered set for it', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-n4-'), 'dictionary');
  assert.equal((await ok(folio.call('folio_init', { root, title: '작은 사전', preset: 'reference', packs: ['knowledge'] }))).created, true);
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.deepEqual([yaml.order, yaml.levels.map((l) => l.name), yaml.checkSets], ['none', ['part', 'entry'], ['knowledge.basic', 'knowledge.unordered']]);
  const config = await ok(folio.call('folio_config', { root, workKind: 'reference' }));
  const unordered = config.recommended.find((r) => r.setId === 'knowledge.unordered');
  assert.deepEqual([unordered.selected, unordered.reasons], [true, [{ kind: 'workKind', value: 'reference' }]]);
  assert.deepEqual((await ok(folio.call('folio_status', { root }))).links, { problems: [], total: 0 });
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-2 folio_find links and folio_status.links show every link, backlinks and broken or self links; turning links off refuses', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work('reference-book');
  const all = await ok(folio.call('folio_find', { root, query: 'links', id: '*' }));
  assert.deepEqual(all.links.map((l) => `${l.from}>${l.to}:${l.valid}`), [
    'cell>membrane:true', 'membrane>cell:true', 'membrane>ghost-entry:false', 'nucleus>nucleus:true', 'atp-entry>mitochondria:true', 'atp-entry>membrane:true',
  ]);
  const membrane = await ok(folio.call('folio_find', { root, query: 'links', id: 'membrane' }));
  assert.deepEqual(membrane.backlinks.map((l) => l.from), ['cell', 'atp-entry']);
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual([status.links.total, status.links.problems.map((p) => [p.code, p.nodeId, p.to])], [6, [['LINK_BROKEN', 'membrane', 'ghost-entry'], ['LINK_SELF', 'nucleus', 'nucleus']]]);
  const game = await work('gamebook');
  const choices = await ok(folio.call('folio_find', { root: game, query: 'links', id: '*' }));
  assert.deepEqual([choices.links.map((l) => `${l.from}>${l.to}:${l.kind}`), choices.problems], [['gate>left-path:choice', 'gate>right-path:choice', 'left-path>ending-key:choice', 'right-path>ending-trap:choice'], []]);
  const off = await work('reference-book', { features: { links: false } });
  const refused = await folio.call('folio_find', { root: off, query: 'links', id: '*' });
  assert.deepEqual([refused.error.code, refused.error.details.feature], ['FEATURE_DISABLED', 'links']);
  assert.equal((await ok(folio.call('folio_status', { root: off }))).links, null);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-3 an entry run keeps order checks not applicable, asks linked-consistency with linkedEvents, shows the broken link as advice and commits', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work('reference-book', UNORDERED, [{ nodeId: 'cell', entityId: 'cell-membrane', kind: 'term.defined' }]);
  const { out, labels, requests } = await drive(folio, root, { node: 'membrane' }, answerer({ membrane: '세포막은 세포의 바깥 경계다.' }), until('needs_user'));
  assert.deepEqual(labels, ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve']);
  const critic = requests.find((r) => r.stepId === 'critic').payload;
  assert.deepEqual(critic.checks.map((c) => c.checkId), ['knowledge.critic', 'knowledge.linked-consistency']);
  assert.deepEqual([critic.priorEvents, critic.linkedEvents.map((e) => `${e.nodeId}:${e.entityId}`)], [[], ['cell:cell-membrane']]);
  assert.deepEqual(out.question.advisories.map((f) => [f.checkId, f.code, f.severity]), [['knowledge.links', 'LINK_BROKEN', 'advisory']]);
  assert.equal((await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }))).status, 'done');
  assert.deepEqual(await factsOf(root, 'membrane'), [
    ['core.promise-order', 'not_applicable'], ['knowledge.defined-before-use', 'not_applicable'], ['knowledge.prerequisite-order', 'not_applicable'],
    ['knowledge.links', 'passed'], ['knowledge.cross-refs', 'passed'], ['knowledge.term-consistency', 'passed'],
  ]);
  assert.deepEqual((await receiptOf(root, 'membrane')).order, { mode: 'none', ordered: false });
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-4 a new event on a linked entry marks the committed entry stale; an unlinked entry stays clean', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work('reference-book', { checkSets: ['knowledge.unordered'] });
  const drafts = { 'atp-entry': 'ATP는 세포의 에너지 화폐다.', nucleus: '핵은 ATP를 쓰지 않는다고 적는다.', mitochondria: '미토콘드리아는 ATP를 만든다.' };
  const events = { mitochondria: [{ entityId: 'atp', kind: 'term.redefined', quote: '미토콘드리아는 ATP를 만든다' }] };
  const answer = answerer(drafts, events);
  for (const node of ['atp-entry', 'nucleus', 'mitochondria']) await drive(folio, root, { node }, answer, until('done'));
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(status.stale.map((s) => [s.nodeId, s.reasons.map((r) => `${r.kind}:${r.id}`)]), [['atp-entry', ['entity:atp']]]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-5 core.promise-order is not applicable on a none entry but still blocks a linear node that links to the later plant', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const resolve = (entityId) => [{ entityId, kind: 'promise.resolved' }];
  const none = await work('reference-book', { checkSets: [] }, [{ nodeId: 'mitochondria', entityId: 'later', kind: 'promise.planted' }]);
  await mkdir(join(none, 'entities', 'promise'), { recursive: true });
  await writeFile(join(none, 'entities', 'promise', 'later.md'), '---\nid: later\nkind: promise\nname: 뒤에서\n---\n');
  await drive(folio, none, { node: 'atp-entry' }, answerer({}, { 'atp-entry': resolve('later') }), until('done'));
  assert.deepEqual(await factsOf(none, 'atp-entry'), [['core.promise-order', 'not_applicable']]);
  const linear = await work('knowledge-book', { checkSets: [] }, [{ nodeId: 'membranes', entityId: 'energy-detail', kind: 'promise.planted' }]);
  const cell = join(linear, 'tree', '01-part-basics', '01-chapter-cells', '01-what-is-a-cell.md');
  await writeFile(cell, (await readFile(cell, 'utf8')).replace(/^---\n/, '---\nlinks:\n  - to: membranes\n'));
  const { out } = await drive(folio, linear, { node: 'what-is-a-cell' }, answerer({}, { 'what-is-a-cell': resolve('energy-detail') }), until('needs_user'));
  assert.deepEqual([label(out), out.question.canApprove, out.question.blocking.map((f) => [f.checkId, f.code, f.severity])],
    ['user:blocked', false, [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]]);
  assert.equal((await folio.call('folio_decide', { root: linear, runId: out.runId, action: 'approve' })).error.code, 'APPROVE_BLOCKED_BY_HARD');
  assert.doesNotMatch(folio.stderr(), /Error/);
});
