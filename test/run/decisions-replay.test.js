import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { copyFixture, useFakePack, fakePacks, trackTempDir } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

async function setup() {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  return { root, makeRunner: (extra = {}) => createRunner({ root, packs: fakePacks(), ...extra }) };
}
const commitsOf = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit');
const bodyOf = async (root, id) => (await openWork(root)).tree.nodes.get(id).body;
const readRun = async (root, runId) => JSON.parse(await readFile(createRunStore(root).pathOf(runId), 'utf8'));
const editRun = async (root, runId, fn) => {
  const run = await readRun(root, runId);
  fn(run);
  await writeFile(createRunStore(root).pathOf(runId), JSON.stringify(run));
};
const writeScene = (makeRunner, text) => driveToEnd(makeRunner, createFakeHost({ drafts: { stairwell: text } }), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });

for (const mode of ['plain', 'refs']) {
  test(`[r1:${mode}] a finished run cannot be revived to commit its old text over a newer commit`, async () => {
    const { root, makeRunner } = await setup();
    const a = (await writeScene(makeRunner, 'OLD X')).at(-1);
    const b = (await writeScene(makeRunner, 'NEW Y')).at(-1);
    assert.notEqual(a.runId, b.runId);
    const bRun = await readRun(root, b.runId);
    await editRun(root, a.runId, (r) => {
      r.state = 'active'; r.pending = null; r.receipt = null; delete r.results.commit;
      // C0 전 모양의 실행 파일(fileHash 없음)로 되살린다 — 손수정 점검(NODE_TEXT_CHANGED) 없이도 커밋 잠금이 막는지 본다.
      delete r.fileHash;
      if (mode === 'refs') for (const k of Object.keys(r.results)) if (bRun.results[k]?.refs) r.results[k].refs = bRun.results[k].refs;
      r.createdAt = new Date().toISOString();
    });
    await assert.rejects(makeRunner().run({ node: 'stairwell' }), { code: 'LOCK_RUN_ALREADY_COMMITTED' });
    assert.equal(await bodyOf(root, 'stairwell'), 'NEW Y');
    assert.equal((await commitsOf(root)).length, 2);
  });
}

test('a skipped run cannot be revived with the approval it recorded before the skip', async () => {
  const { root, makeRunner } = await setup();
  const gate = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' })).at(-1);
  const crash = { afterDecision: (r) => { if (r.type === 'approval') throw new Error('crash'); } };
  await assert.rejects(makeRunner({ hooks: crash }).decide({ runId: gate.runId, action: 'approve' }), /crash/);
  assert.equal((await makeRunner().decide({ runId: gate.runId, action: 'skip', reason: '안 씀' })).status, 'skipped');
  await editRun(root, gate.runId, (r) => { r.state = 'active'; r.pending = null; r.approval = { stepId: 'approve', draftHash: r.draftHash }; });
  await assert.rejects(makeRunner().run({ node: 'stairwell' }), (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.kind === 'approval');
  assert.deepEqual(await commitsOf(root), []);
});

test('[r2] check results are bound to their scope: refs copied into the run file after a plan change are refused', async () => {
  const { root, makeRunner } = await setup();
  const host = createFakeHost();
  const gate = (await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' })).at(-1);
  const book = (await openWork(root)).tree.nodes.get('book-one');
  await updateNode(root, book, { body: `${book.body ?? ''}\n계획 변경: 준호는 죽었다.` });
  const honestRoot = trackTempDir(`${root}-honest`);
  await cp(root, honestRoot, { recursive: true });
  const honestRunner = () => createRunner({ root: honestRoot, packs: fakePacks() });
  const honest = await driveToEnd(honestRunner, host, { from: await honestRunner().decide({ runId: gate.runId, action: 'approve' }), until: (o) => o.status === 'done' });
  assert.deepEqual(honest.map(label), ['model:extract', 'model:critic', 'user:approve', 'done'], 'the honest path re-checks and commits');
  const newRefs = (await readRun(honestRoot, gate.runId)).results;
  await editRun(root, gate.runId, (r) => { for (const k of ['facts', 'critic']) r.results[k].refs = newRefs[k].refs; });
  await assert.rejects(makeRunner().decide({ runId: gate.runId, action: 'approve' }), (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.kind === 'refs');
  assert.deepEqual(await commitsOf(root), []);
});
