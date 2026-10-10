import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { fakePack } from '../support/fake-pack.js';

// 영수증은 기록장에 들어갔지만 커밋 기록은 없는(committing 에서 죽은) 실행을 만든다.
async function crashedCommit({ packs = fakePacks } = {}) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const mk = (extra = {}) => createRunner({ root, packs: packs(), ...extra });
  const crashing = () => mk({ hooks: { afterBodyWrite: () => { throw new Error('crash'); } } });
  const trail = await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'critic' });
  const last = trail.at(-1);
  await assert.rejects(crashing().resume({ runId: last.runId, answers: createFakeHost().answer(last) }), /crash/);
  assert.equal((await createRunStore(root).load(last.runId)).state, 'committing');
  return { root, runId: last.runId };
}
const records = async (root) => openLedger(root, 'receipts').readAll();
const editYaml = async (root, fn) => {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  fn(config);
  await writeFile(path, stringifyYaml(config));
};
const HINT = /restore work\.yaml.*folio decide skip/;
const reprompted = () => new Map([['fake', { ...fakePack, prompt: (step, payload) => ({ ...payload, instructions: 'v2' }) }]]);

test('a committing run whose recorded receipt no longer matches the pipeline can be abandoned with skip', async () => {
  const { root, runId } = await crashedCommit();
  const mk = () => createRunner({ root, packs: fakePacks() });
  await editYaml(root, (config) => { config.overrides.critic = { prompt: 'harsher' }; });
  await assert.rejects(mk().run({ node: 'next' }), (e) => e.code === 'LOCK_PIPELINE_MISMATCH' && HINT.test(e.details.hint));
  await assert.rejects(mk().run({ node: 'market' }), { code: 'RUN_IN_PROGRESS' });
  await assert.rejects(mk().decide({ runId, action: 'approve' }), { code: 'RUN_NOT_AWAITING_USER' });
  const before = await records(root);
  const skipped = await mk().decide({ runId, action: 'skip', reason: '설정이 바뀜' });
  assert.deepEqual([skipped.status, skipped.runId, skipped.reason], ['skipped', runId, '설정이 바뀜']);
  const run = await createRunStore(root).load(runId);
  assert.deepEqual([run.state, run.history.at(-1).event], ['abandoned', 'skipped']);
  // 고아 영수증은 추가만 되는 기록장에 그대로 남고, 커밋 기록은 생기지 않는다.
  assert.deepEqual(await records(root), before);
  assert.deepEqual(before.map((r) => r.type), ['receipt']);
  const decisions = await openLedger(root, 'decisions').readAll();
  assert.equal(decisions.at(-1).action, 'skip');
  assert.equal(label(await mk().run({ node: 'market' })), 'model:plan');
});

test('a pack content change also leaves the stuck commit abandonable', async () => {
  const { root, runId } = await crashedCommit();
  const mk = () => createRunner({ root, packs: reprompted() });
  await assert.rejects(mk().run({ node: 'next' }), (e) => e.code === 'LOCK_PIPELINE_MISMATCH' && HINT.test(e.details.hint));
  assert.equal((await mk().decide({ runId, action: 'skip', reason: '팩이 바뀜' })).status, 'skipped');
  assert.equal(label(await mk().run({ node: 'market' })), 'model:plan');
});

test('a committing run whose receipt still matches cannot be skipped and finishes its commit', async () => {
  const { root, runId } = await crashedCommit();
  const mk = () => createRunner({ root, packs: fakePacks() });
  await assert.rejects(mk().decide({ runId, action: 'skip', reason: '그만' }), { code: 'RUN_NOT_AWAITING_USER' });
  assert.equal((await createRunStore(root).load(runId)).state, 'committing');
  assert.equal((await mk().run({ node: 'next' })).status, 'done');
  assert.deepEqual((await records(root)).map((r) => r.type), ['receipt', 'commit']);
});

test('a committing run whose level no longer matches its node can be abandoned with skip', async () => {
  const { root, runId } = await crashedCommit();
  const mk = () => createRunner({ root, packs: fakePacks() });
  const file = createRunStore(root).pathOf(runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, level: 'book' }, null, 2)}\n`);
  await assert.rejects(mk().run({ node: 'next' }), (e) => e.code === 'RUN_LEVEL_MISMATCH' && /decide skip/.test(e.details.hint));
  await assert.rejects(mk().decide({ runId, action: 'approve' }), { code: 'RUN_NOT_AWAITING_USER' });
  assert.equal((await mk().decide({ runId, action: 'skip', reason: '실행 파일이 어긋남' })).status, 'skipped');
  assert.equal(label(await mk().run({ node: 'market' })), 'model:plan');
});

test('a forged pipelineDigest in the run file does not make a matching committing run skippable', async () => {
  const { root, runId } = await crashedCommit();
  const mk = () => createRunner({ root, packs: fakePacks() });
  const file = createRunStore(root).pathOf(runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, receipt: { ...saved.receipt, pipelineDigest: 'forged' } }, null, 2)}\n`);
  // 판단은 실행 파일(믿지 않음)이 아니라 기록장에 든 영수증 본문으로 한다.
  await assert.rejects(mk().decide({ runId, action: 'skip', reason: '그만' }), { code: 'RUN_NOT_AWAITING_USER' });
  assert.equal((await createRunStore(root).load(runId)).state, 'committing');
});
