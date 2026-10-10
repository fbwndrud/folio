import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { nodeFilePath } from '../../core/store/tree.js';
import { changeStructure } from '../../core/structure/locked.js';
import { workStatus } from '../../core/status.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

const packs = fakePacks();
const runner = (root) => createRunner({ root, packs });
async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}
async function fileOf(root, id) {
  const node = (await openWork(root)).tree.nodes.get(id);
  return nodeFilePath(root, node);
}
async function handEdit(root, id, append) {
  const path = await fileOf(root, id);
  await writeFile(path, `${await readFile(path, 'utf8')}${append}`);
}
const commits = async (root, id) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === id);
const toApproval = (root, node, host = createFakeHost({ drafts: { [node]: '엔진 원고.\n' } })) => driveToEnd(() => runner(root), host, {
  start: { node }, until: (o) => o.status === 'needs_user' && o.question.kind === 'approve',
});

test('C0 (M5 finding): a hand edit to a first-commit node while approval is pending is never overwritten — the commit stops and asks for skip', async () => {
  const root = await serial();
  const gate = (await toApproval(root, 'ep-001')).at(-1);
  await handEdit(root, 'ep-001', '작가가 직접 쓴 문장.\n');
  const status = await workStatus(root, { packs });
  assert.deepEqual(status.drift, [{ nodeId: 'ep-001', code: 'CHANGED_DURING_RUN', runId: gate.runId }]);
  const out = await runner(root).decide({ runId: gate.runId, action: 'approve' });
  assert.deepEqual([out.status, out.question.code, out.question.canApprove], ['needs_user', 'NODE_TEXT_CHANGED', false]);
  assert.match(await readFile(await fileOf(root, 'ep-001'), 'utf8'), /작가가 직접 쓴 문장/);
  assert.deepEqual(await commits(root, 'ep-001'), []);
  await assert.rejects(runner(root).decide({ runId: out.runId, action: 'approve', reason: '덮어도 된다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  await assert.rejects(runner(root).decide({ runId: out.runId, action: 'request_revision', feedback: '고쳐 줘' }), { code: 'REVISION_UNAVAILABLE' });
  assert.equal((await runner(root).decide({ runId: out.runId, action: 'skip', reason: '작가 글을 살린다' })).status, 'skipped');
  assert.match(await readFile(await fileOf(root, 'ep-001'), 'utf8'), /작가가 직접 쓴 문장/);
  assert.deepEqual((await workStatus(root, { packs })).drift, []);
});

test('C0: without a hand edit, or when the file already holds the run draft, the commit goes through as before', async () => {
  const root = await serial();
  const gate = (await toApproval(root, 'ep-001')).at(-1);
  const done = await runner(root).decide({ runId: gate.runId, action: 'approve' });
  assert.equal(done.status, 'done');
  const second = await serial();
  const waiting = (await toApproval(second, 'ep-001')).at(-1);
  const path = await fileOf(second, 'ep-001');
  const text = await readFile(path, 'utf8');
  await writeFile(path, `${text.slice(0, text.indexOf('---\n', 4) + 4)}엔진 원고.\n`);
  assert.equal((await runner(second).decide({ runId: waiting.runId, action: 'approve' })).status, 'done', 'the file already equals the draft: nothing is lost');
  assert.equal((await commits(second, 'ep-001')).length, 1);
});

test('C0: a hand edit to a branch plan while its approval is pending is not overwritten by the children step', async () => {
  const root = await serial();
  await changeStructure(root, { op: 'add', level: 'arc', id: 'arc-three', title: '셋째 아크' });
  const host = createFakeHost({ plans: { 'arc-three': '셋째 아크 계획.' }, children: { 'arc-three': [{ id: 'ep-007', title: '7화', brief: '시작' }] } });
  const gate = (await toApproval(root, 'arc-three', host)).at(-1);
  await handEdit(root, 'arc-three', '작가 메모: 이 아크는 짧게.\n');
  const out = await runner(root).decide({ runId: gate.runId, action: 'approve' });
  assert.deepEqual([out.status, out.question.code, out.question.stepId], ['needs_user', 'NODE_TEXT_CHANGED', 'children']);
  assert.match(await readFile(await fileOf(root, 'arc-three'), 'utf8'), /작가 메모/);
  assert.equal((await openWork(root)).tree.nodes.has('ep-007'), false, 'no children were made');
});

test('C0: after the children step writes the plan, the run guards against edits from that point, not from its start', async () => {
  const root = await serial();
  await changeStructure(root, { op: 'add', level: 'arc', id: 'arc-three', title: '셋째 아크' });
  const host = createFakeHost({ plans: { 'arc-three': '셋째 아크 계획.' }, children: { 'arc-three': [{ id: 'ep-007', title: '7화', brief: '시작' }] } });
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'arc-three' }, until: (o) => o.status === 'waiting_children' || (o.status === 'needs_model' && o.nodeId === 'ep-007') });
  const parent = (await createRunStore(root).list()).find((r) => r.nodeId === 'arc-three');
  assert.equal(parent.fileHash, sha256((await openWork(root)).tree.nodes.get('arc-three').body));
  assert.ok(trail.length > 0);
});

test('C0: a finished run revived by editing its run file still cannot overwrite the newer committed text', async () => {
  const root = await serial();
  const write = (text) => driveToEnd(() => runner(root), createFakeHost({ drafts: { 'ep-001': text } }), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const a = (await write('OLD X\n')).at(-1);
  await write('NEW Y\n');
  const path = createRunStore(root).pathOf(a.runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  Object.assign(run, { state: 'active', pending: null, receipt: null });
  delete run.results.commit;
  await writeFile(path, JSON.stringify(run));
  await assert.rejects(runner(root).run({ node: 'ep-001' }), { code: 'LOCK_RUN_ALREADY_COMMITTED' });
  assert.match(await readFile(await fileOf(root, 'ep-001'), 'utf8'), /NEW Y/);
  assert.equal((await commits(root, 'ep-001')).length, 2);
});

// Durable commit intents preserve a later human edit even when the receipt is already recorded.
test('a recorded commit refuses to overwrite a later hand edit and can be explicitly abandoned', async () => {
  const root = await serial();
  const gate = (await toApproval(root, 'ep-001')).at(-1);
  const crashing = createRunner({ root, packs, hooks: { afterBodyWrite: () => { throw new Error('crash'); } } });
  // 영수증은 본문을 쓰기 전에 덧붙이고, afterBodyWrite 는 본문을 쓴 뒤 'commit' 기록장 기록 전에 돈다
  // — 그래서 이 충돌은 실행을 'committing' 상태로 남긴다: 영수증은 이미 기록됐고,
  // 노드 본문은 이미 검사를 마친(엔진) 원고를 담고 있다.
  await assert.rejects(crashing.decide({ runId: gate.runId, action: 'approve' }), /crash/);
  const stuck = await createRunStore(root).load(gate.runId);
  assert.equal(stuck.state, 'committing');
  await handEdit(root, 'ep-001', '작가가 그 사이 덧붙인 문장.\n');
  // The receipt is recorded, but no final commit is published. Recovery verifies exact target bytes.
  const drift = (await workStatus(root, { packs })).drift;
  assert.equal(drift.some((d) => d.code === 'CHANGED_DURING_RUN'), false);
  await assert.rejects(runner(root).run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
  const text = await readFile(await fileOf(root, 'ep-001'), 'utf8');
  assert.match(text, /작가가 그 사이 덧붙인 문장/);
  assert.equal((await commits(root, 'ep-001')).length, 0);
  assert.equal((await runner(root).decide({ runId: gate.runId, action: 'skip', reason: 'preserve synthetic author edit' })).status, 'skipped');
});
