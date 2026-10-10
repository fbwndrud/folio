import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { variantScope } from '../../core/variants/payload.js';
import { fakePacks } from '../support/fixtures.js';
import { createFakeHost, label } from '../support/fake-host.js';
import { commitMain, patchWork, putVariantFile, variantWork } from '../support/variant-work.js';

const ORIGINAL = '하나는 지하실 끝에서 잠긴 문을 발견했다.\n';
const ENGLISH = 'Hana found the locked door at the end of the cellar.\n';
const runner = (root) => createRunner({ root, packs: fakePacks() });
const host = () => createFakeHost({ drafts: { '*': (p) => (p.variant ? ENGLISH : ORIGINAL) } });

async function committed() {
  const root = await variantWork();
  await commitMain(root, 'ep-001', ORIGINAL);
  return root;
}

/** 판본 실행을 승인 질문까지 몬다. */
async function toApproval(root, start = { node: 'ep-001', variant: 'en' }) {
  const h = host();
  const trail = [];
  let outcome = await runner(root).run(start);
  while (outcome.status === 'needs_model') {
    trail.push(label(outcome));
    outcome = await runner(root).resume({ runId: outcome.runId, answers: h.answer(outcome) });
  }
  trail.push(label(outcome));
  return { outcome, trail, calls: h.calls };
}

test('a variant starts from the committed original: the draft request carries the original, the variant, the term map and the core instructions', async () => {
  const root = await variantWork();
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'en' }), { code: 'VARIANT_ORIGINAL_NOT_COMMITTED' });
  await commitMain(root, 'ep-001', ORIGINAL);
  await putVariantFile(root, 'en', 'terms.yaml', 'terms:\n  - { from: 하나, to: Hana }\n');
  const { outcome, trail, calls } = await toApproval(root);
  assert.deepEqual(trail, ['model:draft', 'user:approve']);
  assert.equal(outcome.question.draft, ENGLISH);
  const draft = calls.find((c) => c.stepId === 'draft').payload;
  assert.deepEqual([draft.variant, draft.original, draft.terms, draft.current, draft.node.id], [
    { id: 'en', kind: 'translation', lang: 'en' }, ORIGINAL, [{ from: '하나', to: 'Hana' }], null, 'ep-001',
  ]);
  assert.match(draft.instructions, /lang 언어로 옮긴다/);
  const run = await createRunStore(root).load(outcome.runId);
  assert.deepEqual([run.variant, run.original.committedHash.startsWith('sha256:'), run.results['variant-checks'].refs.map((r) => r.kind)], ['en', true, ['original', 'terms']]);
});

test('variant requests are refused unless declared, turned on, normal-mode and on a leaf; a drifted original refuses too', async () => {
  const root = await committed();
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'fr' }), { code: 'VARIANT_UNKNOWN' });
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'en', mode: 'recheck' }), { code: 'VARIANT_MODE_UNSUPPORTED' });
  await assert.rejects(runner(root).run({ node: 'arc-awakening', variant: 'en' }), { code: 'VARIANT_LEAF_ONLY' });
  const path = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('발견했다', '찾았다'));
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'en' }), { code: 'VARIANT_ORIGINAL_DRIFTED' });
  await patchWork(root, { features: { variants: false } });
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'en' }), { code: 'FEATURE_DISABLED' });
});

test('an open variant run is its own request: a main request for the node does not adopt it, the same variant request resumes it', async () => {
  const root = await committed();
  const { outcome } = await toApproval(root);
  await assert.rejects(runner(root).run({ node: 'ep-001' }), { code: 'RUN_IN_PROGRESS' });
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'RUN_IN_PROGRESS' });
  assert.equal((await runner(root).run({ node: 'ep-001', variant: 'en' })).runId, outcome.runId);
});

test('next only resumes an open run of the requested variant without mutating it on refusal', async () => {
  const root = await variantWork({ variants: [
    { id: 'en', kind: 'translation', lang: 'en' },
    { id: 'fr', kind: 'translation', lang: 'fr' },
  ] });
  await commitMain(root, 'ep-001', ORIGINAL);
  const first = await runner(root).run({ node: 'ep-001', variant: 'en' });
  const store = createRunStore(root);
  const before = await store.load(first.runId);
  for (const request of [
    {}, { node: 'next' }, { node: 'next', variant: 'main' },
    { node: 'next', variant: 'fr' }, { node: 'next', mode: 'recheck' },
  ]) {
    await assert.rejects(runner(root).run(request), { code: 'RUN_IN_PROGRESS' });
    assert.deepEqual(await store.load(first.runId), before);
    assert.equal((await store.list()).length, 2);
  }
  const resumed = await runner(root).run({ node: 'next', variant: 'en' });
  assert.equal(resumed.runId, first.runId);
  assert.deepEqual(await store.load(first.runId), before);
  const answered = await runner(root).resume({ runId: resumed.runId, answers: host().answer(resumed) });
  assert.equal(answered.status, 'needs_user');
  assert.equal(answered.question.draft, ENGLISH);
});

test('main next retains its existing open-run continuation', async () => {
  const root = await variantWork();
  const first = await runner(root).run({ node: 'ep-001' });
  assert.equal((await runner(root).run({})).runId, first.runId);
  assert.equal((await runner(root).run({ node: 'next', mode: 'recheck' })).runId, first.runId);
});

test('malformed variant labels raise structured errors without creating runs', async () => {
  const root = await committed();
  const invalid = { toString: null, valueOf: null };
  const store = createRunStore(root);
  const before = await store.list();
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: invalid }), {
    code: 'VARIANT_UNKNOWN', details: { variant: '<object>' },
  });
  assert.deepEqual(await store.list(), before);
  assert.throws(() => variantScope({ work: { config: { variantSpecs: {} } } }, { nodeId: 'ep-001', variant: invalid }), {
    code: 'VARIANT_UNKNOWN', details: { variant: '<object>' },
  });
});

test('if the original changes while the variant run is open, the run stops: no approval, no revision, skip only', async () => {
  const root = await committed();
  const { outcome } = await toApproval(root);
  const path = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('발견했다', '찾았다'));
  const stopped = await runner(root).decide({ runId: outcome.runId, action: 'approve' });
  assert.deepEqual([stopped.status, stopped.question.code, stopped.question.canApprove], ['needs_user', 'VARIANT_ORIGINAL_CHANGED', false]);
  await assert.rejects(runner(root).decide({ runId: outcome.runId, action: 'approve', reason: '괜찮다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  await assert.rejects(runner(root).decide({ runId: outcome.runId, action: 'request_revision', feedback: '고쳐' }), { code: 'REVISION_UNAVAILABLE' });
  assert.equal((await runner(root).decide({ runId: outcome.runId, action: 'skip', reason: '원본이 바뀜' })).status, 'skipped');
});

test('turning variants off mid-run refuses run and resume but still takes skip', async () => {
  const root = await committed();
  const first = await runner(root).run({ node: 'ep-001', variant: 'en' });
  await patchWork(root, { features: { variants: false } });
  await assert.rejects(runner(root).run({ node: 'next' }), { code: 'RUN_IN_PROGRESS' });
  await assert.rejects(runner(root).run({ node: 'next', variant: 'en' }), { code: 'FEATURE_DISABLED' });
  await assert.rejects(runner(root).resume({ runId: first.runId, answers: host().answer(first) }), { code: 'FEATURE_DISABLED' });
  assert.equal((await runner(root).decide({ runId: first.runId, action: 'skip', reason: '판본은 나중에' })).status, 'skipped');
});

test('next with a variant picks the first leaf whose original is committed and that has no commit of that variant', async () => {
  const root = await variantWork();
  assert.deepEqual(await runner(root).run({ node: 'next', variant: 'en' }), { status: 'idle' });
  await commitMain(root, 'ep-002', '도윤은 문을 두드렸다.\n');
  const started = await runner(root).run({ node: 'next', variant: 'en' });
  assert.deepEqual([started.status, started.nodeId], ['needs_model', 'ep-002']);
});

test('a hand edit of the variant file during the run is never overwritten by the commit (NODE_TEXT_CHANGED, skip only)', async () => {
  const root = await committed();
  const { outcome } = await toApproval(root);
  await putVariantFile(root, 'en', 'ep-001.md', 'The translator wrote this by hand.\n');
  const stopped = await runner(root).decide({ runId: outcome.runId, action: 'approve' });
  assert.deepEqual([stopped.status, stopped.question.code], ['needs_user', 'NODE_TEXT_CHANGED']);
  assert.equal(await readFile(join(root, 'variants', 'en', 'ep-001.md'), 'utf8'), 'The translator wrote this by hand.\n');
});
