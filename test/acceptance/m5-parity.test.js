import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { commitNode } from '../../core/run/commit.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { connectFolio } from '../support/mcp-client.js';
import { label } from '../support/fake-host.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { FOLIO_LOCK_CODES, parityCode } from '../support/parity-codes.js';
import {
  CLEAN_EP4, DEAD_EP4, answerer, commitsOf, drive, findingsOf, hardOf, ok, receiptOf, serialWork, untilUser,
} from '../support/parity-serial.js';

// M5 판정 비교(D10 A)의 완료 검증 1~3번. 기대 파일은 생성 스크립트가 만든 test/fixtures/parity-expected/*.json 이다.
const EXPECTED = join(import.meta.dirname, '..', 'fixtures', 'parity-expected');
const expected = async (id) => JSON.parse(await readFile(join(EXPECTED, `${id}.json`), 'utf8'));
const EP4_FILE = join('tree', '01-arc-1', '04-ep-004.md');

test('M5-1 a dead character on stage is the only hard finding; the destroyed sword and the wrong honorific are advisories', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await serialWork();
  const { out } = await drive(folio, root, { node: 'ep-004' }, answerer({ 'ep-004': DEAD_EP4 }), untilUser);
  assert.equal(label(out), 'user:blocked');
  assert.deepEqual(hardOf(out), [['novel.dead-on-stage', 'DEAD_ON_STAGE', 'hana']]);
  const advisories = out.question.advisories.map((f) => [f.checkId, f.code, f.entityId ?? null, f.severity]);
  for (const want of [
    ['novel.destroyed-object', 'DESTROYED_UPDATED', 'sword', 'advisory'],
    ['novel.destroyed-object', 'DESTROYED_ON_STAGE', 'sword', 'advisory'],
    ['novel.honorific-gender', 'HONORIFIC_GENDER_MISMATCH', 'hana', 'advisory'],
  ]) assert.ok(advisories.some((a) => JSON.stringify(a) === JSON.stringify(want)), JSON.stringify(want));
  for (const finding of findingsOf(out).filter((f) => f.quote)) assert.ok(DEAD_EP4.draft.includes(finding.quote), finding.quote);
  // 기대 hard(원래 엔진 코드)를 대응표로 옮기면 Folio hard 코드와 같다(advisory 로 시작한 것·코어 거절은 뺀다).
  const file = await expected('dead-on-stage');
  const skipped = new Set(file.intendedDiffs.filter((d) => d.kind === 'advisory-start' || d.kind === 'core-refusal').map((d) => d.code));
  const mapped = file.hard.filter((h) => !skipped.has(h.code)).map((h) => parityCode(h.code)?.code ?? `UNMAPPED:${h.code}`).sort();
  assert.deepEqual(mapped, hardOf(out).map(([, code]) => code).sort());
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('M5-2 a committed episode receipt records the steps in the order of the source protocol', async (t) => {
  const protocol = await expected('protocol');
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await serialWork();
  const { labels, out } = await drive(folio, root, { node: 'ep-004' }, answerer({ 'ep-004': CLEAN_EP4 }));
  assert.deepEqual(labels, ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve', 'done']);
  const receipt = await receiptOf(root, 'ep-004');
  assert.deepEqual((await commitsOf(root)).map((c) => [c.nodeId, c.receiptId]), [['ep-004', out.receiptId]]);
  // 커밋은 영수증 단계가 아니라 commit 기록으로 남는다. 영수증 단계 + commit 이 Folio 가 실제로 거친 순서다.
  const walked = [...receipt.steps.map((s) => s.id), 'commit'];
  assert.deepEqual(receipt.steps.map((s) => [s.id, s.status]), [
    ['plan', 'passed'], ['draft', 'passed'], ['extract', 'passed'], ['facts', 'passed'], ['critic', 'passed'], ['revise', 'not_needed'], ['approve', 'approved'],
  ]);
  const protocolIds = [...new Set(protocol.steps.map((s) => s.folio))];
  const wanted = protocolIds.filter((id) => walked.includes(id));
  assert.deepEqual(walked.filter((id) => protocolIds.includes(id)), wanted);
  for (const id of ['plan', 'draft', 'extract', 'facts', 'critic', 'approve', 'commit']) assert.ok(wanted.includes(id), `${id} must be in the protocol`);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('M5-3 over MCP: a changed checked draft, a file edited during a recommit and a hard conflict cannot be committed', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = answerer({ 'ep-004': CLEAN_EP4 });
  // (a) 검사 뒤 승인 전에 검사한 원고(실행 파일의 원고)가 바뀌면 커밋이 LOCK_HASH_MISMATCH 로 거절된다.
  const changed = await serialWork();
  const gate = (await drive(folio, changed, { node: 'ep-004' }, script, untilUser)).out;
  const runPath = join(changed, '.folio', 'runs', `${gate.runId}.json`);
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.outputs.draft += '몰래 덧붙인 문장.\n';
  await writeFile(runPath, JSON.stringify(run));
  const refused = await folio.call('folio_decide', { root: changed, runId: gate.runId, action: 'approve' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'LOCK_HASH_MISMATCH']);
  assert.deepEqual(await commitsOf(changed), []);

  // (a') 작가가 회차 파일을 고친 것은 다시 커밋(recommit)으로 검사한다. 그 검사 뒤 승인 전에 파일을 또 고치면 커밋하지 않고 막는다.
  const edited = await serialWork();
  await drive(folio, edited, { node: 'ep-004' }, script);
  const file = join(edited, EP4_FILE);
  await writeFile(file, (await readFile(file, 'utf8')).replace('하룻밤을', '이틀 밤을'));
  const recheck = (await drive(folio, edited, { node: 'ep-004', mode: 'recommit' }, script, untilUser)).out;
  assert.equal(label(recheck), 'user:approve');
  await writeFile(file, (await readFile(file, 'utf8')).replace('이틀 밤을', '사흘 밤을'));
  const stopped = await ok(folio.call('folio_decide', { root: edited, runId: recheck.runId, action: 'approve' }));
  assert.deepEqual([label(stopped), stopped.question.code, stopped.question.canApprove], ['user:blocked', 'RECOMMIT_TEXT_CHANGED', false]);
  assert.equal((await commitsOf(edited)).length, 1, 'only the first commit');

  // (c) hard 위반은 승인할 수 없다(이유를 적어도).
  const dead = await serialWork();
  const blocked = (await drive(folio, dead, { node: 'ep-004' }, answerer({ 'ep-004': DEAD_EP4 }), untilUser)).out;
  assert.deepEqual([label(blocked), blocked.question.canApprove], ['user:blocked', false]);
  const hard = await folio.call('folio_decide', { root: dead, runId: blocked.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([hard.ok, hard.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
  assert.equal((await ok(folio.call('folio_status', { root: dead }))).pending.question.kind, 'blocked');
  assert.deepEqual(await commitsOf(dead), []);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('M5-3 in process: every commit refusal of the source protocol has its Folio lock code', async () => {
  const protocol = await expected('protocol');
  // 영수증 없는 커밋·재사용 영수증은 MCP 로 만들 길이 없다(엔진이 늘 영수증을 만들고 한 번만 쓴다). 그래서 commitNode 를 직접 부른다(M2-2 와 같은 길).
  const root = await serialWork();
  const { work, pipelines } = await openWorkspace(root, { packs: await loadBuiltinPacks() });
  const pipeline = pipelines.byLevel.episode;
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const TEXT = '검사한 4화 원고.\n';
  const good = (receiptId) => makeReceipt({ nodeId: 'ep-004', text: TEXT, pipeline, level: 'episode', receiptId });
  const commit = async (receipt, text = TEXT) => {
    if (receipt) await recordDecisions(ledgers.decisions, receipt);
    return commitNode({ root, work, ledgers, pipeline, receipt, text });
  };
  const routes = {
    no_receipt: () => commit(null),
    hash_changed: () => commit(good('rcpt-hash'), '검사 뒤 바꾼 4화 원고.\n'),
    hard_violation: () => { const receipt = good('rcpt-hard'); receipt.hard = 1; return commit(receipt); },
    receipt_consumed: async () => { const once = good('rcpt-once'); await commit(once); return commit(once); },
  };
  assert.ok(protocol.refusals.length >= 3);
  for (const refusal of protocol.refusals) {
    assert.ok(FOLIO_LOCK_CODES.includes(refusal.folio), refusal.folio);
    assert.ok(Object.hasOwn(routes, refusal.case), `no route for ${refusal.case}`);
    await assert.rejects(routes[refusal.case](), { code: refusal.folio }, refusal.case);
  }
});
