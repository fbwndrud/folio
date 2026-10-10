import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { detectDrift } from '../../core/store/drift.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');
const ARC = join('tree', '01-arc-awakening', '_node.md');
const runner = (root) => createRunner({ root, packs: fakePacks() });
async function commitEp1(root) {
  await useFakePack(root);
  await driveToEnd(() => runner(root), createFakeHost({ drafts: { 'ep-001': '하나는 문을 보았다.\n' } }), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
}
async function handEdit(root, from, to, file = EP1) {
  const text = await readFile(join(root, file), 'utf8');
  await writeFile(join(root, file), text.replace(from, to));
}
async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, features: { ...(config.features ?? {}), ...features } }));
}

test('recommit checks and commits the file text without asking for a plan or a draft, and clears the drift', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const status = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(status.drift.map((d) => [d.nodeId, d.code, d.recommit]), [['ep-001', 'HAND_EDITED', true]]);
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => o.status === 'done' });
  assert.deepEqual(trail.map(label), ['model:extract', 'model:critic', 'user:approve', 'done']);
  const receipts = await openLedger(root, 'receipts').readAll();
  const receipt = receipts.find((r) => r.type === 'receipt' && r.receiptId === trail.at(-1).receiptId);
  assert.deepEqual(receipt.steps.filter((s) => s.kind === 'generate' && s.id !== 'extract' && s.id !== 'revise').map((s) => [s.id, s.status, s.source]), [['plan', 'passed', 'file'], ['draft', 'passed', 'file']]);
  assert.deepEqual(detectDrift(await openWork(root), receipts), []);
  assert.match(await readFile(join(root, EP1), 'utf8'), /세라는 문을 보았다/);
});

test('recommit keeps every lock: a hard finding blocks and cannot be approved', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level'); // doyun dies in ep-002
  await driveToEnd(() => runner(root), createFakeHost({ drafts: { 'ep-003': '하나는 문양을 베꼈다.\n' } }), { start: { node: 'ep-003' }, until: (o) => o.status === 'done' });
  const path = join(root, 'tree', '01-arc-awakening', '03-ep-003.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('하나는', '도윤은'));
  const host = createFakeHost({ events: { 'ep-003': { events: [], appearances: ['doyun'] } } });
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-003', mode: 'recommit' }, until: (o) => o.status === 'needs_user' && o.question.kind === 'blocked' });
  const question = trail.at(-1).question;
  assert.equal(question.canApprove, false);
  await assert.rejects(runner(root).decide({ runId: trail.at(-1).runId, action: 'approve', reason: '괜찮다' }), (e) => /HARD|hard/.test(`${e.code} ${e.message}`));
});

test('recommit is refused for a node that needs none, an empty body, next, or when the feature is off', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'RECOMMIT_NOT_NEEDED' });
  await assert.rejects(runner(root).run({ node: 'ep-002', mode: 'recommit' }), { code: 'RECOMMIT_NOT_NEEDED' });
  await assert.rejects(runner(root).run({ node: 'next', mode: 'recommit' }), { code: 'RUN_MODE_INVALID' });
  await handEdit(root, '하나는 문을 보았다.\n', '');
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'RECOMMIT_EMPTY' });
  const text = await readFile(join(root, EP1), 'utf8');
  await writeFile(join(root, EP1), `${text}세라는 문을 보았다.\n`);
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { recommit: false } }));
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'FEATURE_DISABLED' });
});

test('if the file changes again during a recommit run, the run stops and asks; it cannot commit the older text', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => label(o) === 'user:approve' });
  await handEdit(root, '세라는', '미오는');
  const out = await runner(root).decide({ runId: trail.at(-1).runId, action: 'approve' });
  assert.equal(out.status, 'needs_user');
  assert.equal(out.question.code, 'RECOMMIT_TEXT_CHANGED');
  assert.equal(out.question.canApprove, false);
  assert.match(await readFile(join(root, EP1), 'utf8'), /미오는/);
  await assert.rejects(runner(root).decide({ runId: out.runId, action: 'request_revision', feedback: '고쳐 줘' }), { code: 'REVISION_UNAVAILABLE' });
  const skipped = await runner(root).decide({ runId: out.runId, action: 'skip', reason: '다시 돌린다' });
  assert.equal(skipped.status, 'skipped');
});

test('a normal run request does not continue an open recommit run, and the run file mode cannot turn a normal run into one', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const first = await runner(root).run({ node: 'ep-001', mode: 'recommit' });
  await assert.rejects(runner(root).run({ node: 'ep-001' }), { code: 'RUN_IN_PROGRESS' });
  const store = createRunStore(root);
  const saved = await store.load(first.runId);
  assert.equal(saved.mode, 'recommit');
});

// Fix round 1 (controller review): 기능을 끄면 열린 recommit 실행이 멈춰 붙어버리던 문제(C4-1),
// committing 인데 영수증이 아직 없는 실행의 예외 범위가 너무 넓던 문제(C4-2),
// 자식 없는 가지의 recommit(C4-3)을 공격 스크립트에서 테스트로 옮긴다.

test('turning the feature off while an open recommit run awaits a model answer refuses run/resume without touching it; skip still frees the work', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const first = await runner(root).run({ node: 'ep-001', mode: 'recommit' });
  assert.equal(first.status, 'needs_model');
  await setFeatures(root, { recommit: false });
  // run(같은 노드)·run(next)·resume 모두 옛 질문을 돌려주지 않고 거부한다 — 무엇도 저장하지 않는다.
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'FEATURE_DISABLED' });
  await assert.rejects(runner(root).run({ node: 'next' }), { code: 'FEATURE_DISABLED' });
  await assert.rejects(runner(root).resume({ runId: first.runId, answers: createFakeHost().answer(first) }), { code: 'FEATURE_DISABLED' });
  const stillPending = await createRunStore(root).load(first.runId);
  assert.equal(stillPending.state, 'awaiting_model');
  assert.ok(stillPending.pending);
  // skip 은 어떤 열린 상태에서도 받는다 — 그래야 작품이 멈추지 않는다.
  const skipped = await runner(root).decide({ runId: first.runId, action: 'skip', reason: '기능이 꺼졌다' });
  assert.equal(skipped.status, 'skipped');
  // 다른 노드는 이제 돌 수 있다.
  const other = await runner(root).run({ node: 'ep-002' });
  assert.equal(other.status, 'needs_model');
});

test('turning the feature off while an open recommit run awaits approval refuses the approve without recording it; skip still frees the run', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => label(o) === 'user:approve' });
  const runId = trail.at(-1).runId;
  await setFeatures(root, { recommit: false });
  await assert.rejects(runner(root).decide({ runId, action: 'approve' }), { code: 'FEATURE_DISABLED' });
  const stillWaiting = await createRunStore(root).load(runId);
  assert.equal(stillWaiting.state, 'awaiting_user');
  assert.equal(stillWaiting.approval, null);
  // run() 으로 이어가는 것도 옛 질문을 돌려주지 않고 거부한다.
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'FEATURE_DISABLED' });
  const skipped = await runner(root).decide({ runId, action: 'skip', reason: '기능이 꺼졌다' });
  assert.equal(skipped.status, 'skipped');
});

test('a committing recommit run without a recorded receipt still stops on a later file change; it is skippable and never commits the older text', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => label(o) === 'user:approve' });
  const runId = trail.at(-1).runId;
  const receiptsPath = join(root, '.folio', 'ledger', 'receipts.jsonl');
  await chmod(receiptsPath, 0o444);
  try {
    await assert.rejects(runner(root).decide({ runId, action: 'approve' }));
  } finally {
    await chmod(receiptsPath, 0o644);
  }
  const stuck = await createRunStore(root).load(runId);
  assert.equal(stuck.state, 'committing');
  const afterFailure = await openLedger(root, 'receipts').readAll();
  assert.equal(afterFailure.some((r) => r.type === 'receipt' && r.runId === runId), false);
  await handEdit(root, '세라는', '미오는');
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'COMMIT_TARGET_CONFLICT' });
  const skipped = await runner(root).decide({ runId, action: 'skip', reason: '다시 돌린다' });
  assert.equal(skipped.status, 'skipped');
  assert.match(await readFile(join(root, EP1), 'utf8'), /미오는/);
  const commits = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === 'ep-001');
  assert.equal(commits.length, 1); // commitEp1 의 첫 커밋뿐, recommit 은 옛 글("세라는")을 커밋하지 않았다
});

test('a committing recommit run whose receipt is already recorded preserves new human edits even when the feature is turned off', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => label(o) === 'user:approve' });
  const runId = trail.at(-1).runId;
  const crashing = createRunner({ root, packs: fakePacks(), hooks: { afterBodyWrite: () => { throw new Error('crash'); } } });
  await assert.rejects(crashing.decide({ runId, action: 'approve' }), /crash/);
  const stuck = await createRunStore(root).load(runId);
  assert.equal(stuck.state, 'committing');
  const recorded = (await openLedger(root, 'receipts').readAll()).some((r) => r.type === 'receipt' && r.runId === runId);
  assert.equal(recorded, true);
  await handEdit(root, '세라는', '미오는'); // 더 손을 대도
  await setFeatures(root, { recommit: false }); // 기능을 꺼도
  await assert.rejects(runner(root).run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
  assert.match(await readFile(join(root, EP1), 'utf8'), /미오는 문을 보았다/);
  assert.equal((await runner(root).decide({ runId, action: 'skip', reason: '새 편집 보존' })).status, 'skipped');
  assert.match(await readFile(join(root, EP1), 'utf8'), /미오는 문을 보았다/);
});

test('recommit on a branch with children keeps them (not_needed) instead of asking for new ones', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost({ children: { 'arc-hunt': [] } });
  await driveToEnd(() => runner(root), host, { start: { node: 'next' }, until: (o) => o.status === 'done' && o.nodeId === 'arc-awakening' });
  await handEdit(root, '계획', '계획(수정)', ARC);
  const trail = await driveToEnd(() => runner(root), createFakeHost(), { start: { node: 'arc-awakening', mode: 'recommit' }, until: (o) => o.status === 'done' });
  const receipts = await openLedger(root, 'receipts').readAll();
  const receipt = receipts.find((r) => r.type === 'receipt' && r.receiptId === trail.at(-1).receiptId);
  const childrenResult = receipt.steps.find((s) => s.id === 'children');
  assert.deepEqual([childrenResult.status, childrenResult.source], ['not_needed', 'recommit']);
  assert.deepEqual(detectDrift(await openWork(root), receipts), []);
  assert.match(await readFile(join(root, ARC), 'utf8'), /계획\(수정\)/);
});

test('recommit refuses a branch with no children', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  for (const file of ['01-ep-004.md', '02-ep-005.md', '03-ep-006.md']) await rm(join(root, 'tree', '02-arc-hunt', file));
  const nodePath = join(root, 'tree', '02-arc-hunt', '_node.md');
  const text = await readFile(nodePath, 'utf8');
  await writeFile(nodePath, text.replace('level: arc', 'level: arc\nstatus: committed'));
  await assert.rejects(runner(root).run({ node: 'arc-hunt', mode: 'recommit' }), (e) => e.code === 'RECOMMIT_NO_CHILDREN' && e.details.nodeId === 'arc-hunt');
});
