import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packDigest, registryDigest } from '../../core/pack/digest.js';
import { resolvePipeline, pipelineDigest } from '../../core/pipeline/define.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { commitNode } from '../../core/run/commit.js';
import { createRunner } from '../../core/run/runner.js';
import { sha256 } from '../../core/util/hash.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const reprompted = () => new Map([['fake', { ...fakePack, prompt: (step, payload) => ({ ...payload, instructions: 'v2' }) }]]);

test('the pack digest changes with any pack content, including checker source', () => {
  const base = packDigest(fakePack);
  assert.match(base, /^sha256:[0-9a-f]{64}$/);
  assert.equal(packDigest({ ...fakePack }), base);
  const reworded = { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.critic' ? { ...c, instruction: 'Review harder.' } : c)) };
  assert.notEqual(packDigest(reworded), base);
  const recoded = { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.dead-on-stage' ? { ...c, run: () => [] } : c)) };
  assert.notEqual(packDigest(recoded), base);
  const declared = { ...fakePack, digest: `sha256:${'a'.repeat(64)}` };
  const declaredDigest = packDigest(declared);
  // 선언한 digest 는 내용을 대신하지 않는다 — 값 자체가 그대로 나오면 안 되고, 내용이 바뀌면 같이 바뀌어야 한다.
  assert.notEqual(declaredDigest, declared.digest);
  assert.notEqual(declaredDigest, packDigest(fakePack));
  const declaredReworded = { ...declared, checks: declared.checks.map((c) => (c.id === 'fake.critic' ? { ...c, instruction: 'Review harder.' } : c)) };
  assert.notEqual(packDigest(declaredReworded), declaredDigest);
  const declaredNewSet = { ...declared, checkSets: { ...declared.checkSets, 'fake.extra': { title: 'x', description: 'x', checks: [] } } };
  assert.notEqual(packDigest(declaredNewSet), declaredDigest);
  const declaredNewStep = { ...declared, pipelines: { ...declared.pipelines, leaf: [...declared.pipelines.leaf, { id: 'extra-step', kind: 'gate' }] } };
  assert.notEqual(packDigest(declaredNewStep), declaredDigest);
  assert.notEqual(registryDigest([fakePack]), registryDigest([reworded]));
});

test('project handles RegExp, Date, Map and Set, and refuses source-less functions', () => {
  const base = packDigest({ ...fakePack, tag: /abc/gi });
  assert.notEqual(packDigest({ ...fakePack, tag: /abcd/gi }), base);
  assert.throws(() => packDigest({ ...fakePack, prompt: (() => {}).bind(null) }), { code: 'PACK_DIGEST_UNSUPPORTED' });
  assert.throws(() => packDigest({ ...fakePack, prompt: Math.max }), { code: 'PACK_DIGEST_UNSUPPORTED' });
});

test('the pipeline digest carries the pack digest', () => {
  const plain = resolvePipeline(fakePack.pipelines.leaf, {});
  const withPack = resolvePipeline(fakePack.pipelines.leaf, {}, { packDigest: packDigest(fakePack) });
  assert.equal(plain.digest, pipelineDigest(plain.steps));
  assert.notEqual(withPack.digest, plain.digest);
  assert.equal(withPack.digest, pipelineDigest(withPack.steps, withPack.packDigest));
  assert.notEqual(resolvePipeline(fakePack.pipelines.leaf, {}, { packDigest: sha256('other') }).digest, withPack.digest);
});

test('a receipt made under another pack content does not commit', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const before = await openWorkspace(root, { packs: fakePacks() });
  const after = await openWorkspace(root, { packs: reprompted() });
  assert.equal(before.registry.digest, registryDigest([fakePack]));
  assert.equal(before.pipelines.leaf.packDigest, before.registry.digest);
  assert.notEqual(after.pipelines.leaf.digest, before.pipelines.leaf.digest);
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const text = '검사한 원고';
  const receipt = makeReceipt({ nodeId: 'stairwell', text, pipeline: before.pipelines.leaf });
  await recordDecisions(ledgers.decisions, receipt);
  await assert.rejects(commitNode({ root, work: after.work, ledgers, pipeline: after.pipelines.leaf, receipt, text }), { code: 'LOCK_PIPELINE_MISMATCH' });
  await commitNode({ root, work: before.work, ledgers, pipeline: before.pipelines.leaf, receipt, text });
});

test('an open run re-checks when the pack content changes under it', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const gate = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), {
    start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user',
  })).at(-1);
  const next = await createRunner({ root, packs: reprompted() }).decide({ runId: gate.runId, action: 'approve' });
  assert.equal(label(next), 'model:extract');
  assert.equal(next.requests[0].payload.instructions, 'v2');
});
