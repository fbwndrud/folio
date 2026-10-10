import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { detectDrift } from '../../core/store/drift.js';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { commitNode } from '../../core/run/commit.js';
import { buildReceipt } from '../../core/run/receipt-builder.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { fakePack } from '../support/fake-pack.js';

const pipeline = resolvePipeline(fakePack.pipelines.leaf, {});
const SCENE = 'tree/01-book-one/01-the-fall/02-stairwell.md';

async function setup() {
  const root = await copyFixture('novel-3level');
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  // 엔진이 하듯 판정을 decisions 기록장에 먼저 남긴다 — 각 우회 테스트는 원래 이유로 실패해야 한다(decisions 대조는 test/run/decisions.test.js).
  const commit = async (receipt, text, extra = {}) => {
    if (receipt) await recordDecisions(ledgers.decisions, receipt);
    return commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt, text, ...extra });
  };
  return { root, ledgers, commit };
}

test('a valid receipt commits the text, records events and leaves no drift', async () => {
  const { root, ledgers, commit } = await setup();
  const text = '준호는 계단참에서 오래 기다렸다.\n';
  const receipt = makeReceipt({ nodeId: 'stairwell', text, pipeline, events: [{ eventId: 'ev-1', entityId: 'junho', kind: 'state', data: { waiting: true } }] });
  const result = await commit(receipt, text);
  assert.equal(result.committedHash, receipt.draftHash);
  const work = await openWork(root);
  assert.equal(work.tree.nodes.get('stairwell').body, text);
  assert.equal(work.tree.nodes.get('stairwell').status, 'committed');
  const records = await ledgers.receipts.readAll();
  assert.deepEqual(records.map((r) => r.type), ['receipt', 'commit']);
  assert.deepEqual(activeEvents(await ledgers.events.readAll()).map((e) => e.eventId), ['ev-1']);
  assert.deepEqual(detectDrift(work, records), []);
});

const attempts = {
  LOCK_NO_RECEIPT: () => [null, 'x'],
  LOCK_RECEIPT_INVALID: () => { const r = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }); r.steps[4] = { id: 'critic', kind: 'check', status: 'skipped' }; return [r, 'x']; },
  LOCK_PIPELINE_MISMATCH: () => { const r = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }); r.pipelineDigest = 'sha256:' + '0'.repeat(64); return [r, 'x']; },
  LOCK_STEP_MISSING: () => { const r = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }); r.steps = r.steps.filter((s) => s.id !== 'facts'); return [r, 'x']; },
  LOCK_HASH_MISMATCH: () => [makeReceipt({ nodeId: 'stairwell', text: '검사한 본문', pipeline }), '바꿔치기한 본문'],
  LOCK_HARD_VIOLATION: () => { const r = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }); r.hard = 1; return [r, 'x']; },
};
for (const [code, make] of Object.entries(attempts)) {
  test(`commit is refused with ${code} and nothing changes`, async () => {
    const { root, ledgers, commit } = await setup();
    const before = await readFile(join(root, SCENE), 'utf8');
    const [receipt, text] = make();
    await assert.rejects(commit(receipt, text), { code });
    assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
    assert.deepEqual(await ledgers.receipts.readAll(), []);
  });
}

test('a self-review labelled independent is refused', async () => {
  const { commit } = await setup();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  receipt.steps[4].checks = [{ checkId: 'fake.critic', status: 'passed', findings: [], reviewer: { sameHost: true, independent: true } }];
  await assert.rejects(commit(receipt, 'x'), (error) => error.code === 'LOCK_RECEIPT_INVALID' && error.details.problems.some((p) => p.code === 'SELF_REVIEW_MISLABELED'));
});

test('a receipt is consumed once', async () => {
  const { commit } = await setup();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  await commit(receipt, 'x');
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_RECEIPT_CONSUMED' });
});

test('a receipt id reused with different content is refused', async () => {
  const { ledgers, commit } = await setup();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  await ledgers.receipts.append({ type: 'receipt', ...receipt, attempts: 2 });
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_RECEIPT_MISMATCH' });
});

test('recommitting a node retracts its earlier events', async () => {
  const { ledgers, commit } = await setup();
  await commit(makeReceipt({ nodeId: 'stairwell', text: 'a', pipeline, receiptId: 'r1', events: [{ eventId: 'ev-a', entityId: 'mara', kind: 'state', data: { vital: 'alive' } }] }), 'a');
  await commit(makeReceipt({ nodeId: 'stairwell', text: 'b', pipeline, receiptId: 'r2', events: [{ eventId: 'ev-b', entityId: 'mara', kind: 'state', data: { vital: 'dead' } }] }), 'b');
  assert.deepEqual(activeEvents(await ledgers.events.readAll()).map((e) => e.eventId), ['ev-b']);
});

test('a commit interrupted after the body write finishes on resume, exactly once', async () => {
  const { root, ledgers, commit } = await setup();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'z', pipeline, events: [{ eventId: 'ev-z', entityId: 'junho', kind: 'state' }] });
  await assert.rejects(commit(receipt, 'z', { hooks: { afterBodyWrite: () => { throw new Error('crash'); } } }), /crash/);
  assert.deepEqual((await ledgers.receipts.readAll()).map((r) => r.type), ['receipt']);
  await commit(receipt, 'z', { resume: true });
  await commit(receipt, 'z', { resume: true });
  assert.deepEqual((await ledgers.receipts.readAll()).map((r) => r.type), ['receipt', 'commit']);
  assert.deepEqual((await ledgers.events.readAll()).map((r) => r.eventId), ['ev-z']);
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'z');
});

// --- Fix round 1: adversarial-review regressions (one per ruling) ---

test('[round1-1] a locked check step relabelled as a generate step is refused, not silently trusted', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  // facts is a locked check step; only its kind is spoofed, draftHash is left correct.
  receipt.steps.find((s) => s.id === 'facts').kind = 'generate';
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_STEP_MISSING' });
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('[round1-2] an event claiming another node or superseding foreign events is refused', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  await ledgers.events.append({ type: 'event', eventId: 'seed-dead', receiptId: 'seed', nodeId: 'other', entityId: 'mara', kind: 'state', data: { vital: 'dead' } });
  const receipt = makeReceipt({
    nodeId: 'stairwell', text: 'x', pipeline,
    events: [{ eventId: 'ev-1', entityId: 'x', kind: 'state', supersedes: ['seed-dead'] }, { eventId: 'ev-2', nodeId: 'far-away', entityId: 'y', kind: 'state' }],
  });
  await assert.rejects(commit(receipt, 'x'), (error) => error.code === 'LOCK_RECEIPT_INVALID' && error.details.problems.some((p) => p.code === 'EVENT_FIELD_RESERVED'));
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
  assert.deepEqual(activeEvents(await ledgers.events.readAll()).map((e) => e.eventId), ['seed-dead']);
});

test('[round1-3] a forged pipeline object cannot be paired with a matching digest', async () => {
  const { root, ledgers } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  Object.assign(receipt.steps.find((s) => s.id === 'facts'), { status: 'skipped', reason: 'r', source: 's' });
  const forgedPipeline = { steps: [], digest: receipt.pipelineDigest };
  await assert.rejects(commitNode({ root, work: await openWork(root), ledgers, pipeline: forgedPipeline, receipt, text: 'x' }), { code: 'LOCK_PIPELINE_MISMATCH' });
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('[round1-4] a hard finding hidden in overridden/advisories still blocks the commit', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  for (const field of ['overridden', 'advisories']) {
    const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
    receipt[field] = [{ severity: 'hard', code: 'DEAD' }];
    await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_HARD_VIOLATION' });
  }
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

// 컨트롤러 판정(최종 리뷰): 인용이 초안에 없는 requireQuote 지적은 unsupported 로 가고 판정에 쓰지 않는다.
// 러너가 무시하는 지적으로 커밋만 막으면 고칠 길 없는 교착이 된다. 대신 영수증에는 그대로 남는다.
test('[final-2] a hard finding in unsupported is recorded in the receipt but does not block the commit', async () => {
  const { ledgers, commit } = await setup();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  const unsupported = { checkId: 'fake.critic', severity: 'hard', code: 'X', message: 'm', quote: 'not in the draft' };
  receipt.steps.find((s) => s.id === 'critic').checks = [{ checkId: 'fake.critic', status: 'passed', findings: [], unsupported: [unsupported] }];
  await commit(receipt, 'x');
  const recorded = (await ledgers.receipts.readAll()).find((r) => r.type === 'receipt');
  assert.deepEqual(recorded.steps.find((s) => s.id === 'critic').checks[0].unsupported, [unsupported]);
  assert.equal(recorded.hard, 0);
});

test('[round1-5] a non-string draft is refused before any write, even if its coerced hash happens to match', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  const receipt = makeReceipt({ nodeId: 'stairwell', text: '5', pipeline });
  await assert.rejects(commit(receipt, 5), { code: 'LOCK_HASH_MISMATCH' });
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('[round1-6] an eventId already used by another receipt cannot be reused', async () => {
  const { ledgers, commit } = await setup();
  await commit(makeReceipt({ nodeId: 'stairwell', text: 'a', pipeline, receiptId: 'r1', events: [{ eventId: 'ev-a', entityId: 'm', kind: 'state', data: { v: 1 } }] }), 'a');
  const receiptCountBefore = (await ledgers.receipts.readAll()).length;
  const r2 = makeReceipt({ nodeId: 'stairwell', text: 'b', pipeline, receiptId: 'r2', events: [{ eventId: 'ev-a', entityId: 'm', kind: 'state', data: { v: 2 } }] });
  await assert.rejects(commit(r2, 'b'), (error) => error.code === 'LOCK_RECEIPT_INVALID' && error.details.problems.some((p) => p.code === 'EVENT_ID_REUSED'));
  assert.equal((await ledgers.receipts.readAll()).length, receiptCountBefore);
  assert.deepEqual(activeEvents(await ledgers.events.readAll()).map((e) => e.eventId), ['ev-a']);
});

test('[round1-7] a receipt cannot forge its own ledger metadata (type/seq/at/prev/hash)', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  receipt.type = 'commit';
  await assert.rejects(commit(receipt, 'x'), (error) => error.code === 'LOCK_RECEIPT_INVALID' && error.details.problems.some((p) => p.code === 'RECEIPT_FIELD_RESERVED'));
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('[round1-8] resuming a stale receipt after a newer one already committed the node is refused', async () => {
  const { root, commit } = await setup();
  const r1 = makeReceipt({ nodeId: 'stairwell', text: 'old', pipeline, receiptId: 'r1' });
  await assert.rejects(commit(r1, 'old', { hooks: { afterBodyWrite: () => { throw new Error('crash'); } } }), /crash/);
  await commit(makeReceipt({ nodeId: 'stairwell', text: 'new', pipeline, receiptId: 'r2' }), 'new');
  await assert.rejects(commit(r1, 'old', { resume: true }), { code: 'LOCK_RECEIPT_SUPERSEDED' });
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'new');
});

// --- Fix round 2: re-review regressions/gaps ---

/** buildReceipt이 실제로 만들 법한 결과 상태로 run을 채운다. critic만 골라 끄거나 손댈 수 있다. */
function buildRunReceipt({ work, text, receiptId = 'rcpt-built', critic }) {
  const draftHash = sha256(text);
  let n = 0;
  const results = {
    plan: { status: 'passed' },
    draft: { status: 'passed' },
    extract: { status: 'passed' },
    facts: { status: 'passed', draftHash, checks: [] },
    critic,
    revise: { status: 'not_needed' },
    approve: { status: 'approved', source: 'user' },
  };
  return buildReceipt({
    run: { runId: 'run-built', nodeId: 'stairwell', variant: 'main', draftHash, pipelineDigest: pipeline.digest, results, attempts: 0, outputs: {} },
    steps: pipeline.steps,
    work,
    refs: [],
    newId: (prefix) => `${receiptId}-${prefix}-${++n}`,
  });
}

test('[round2-N1a] buildReceipt output with the unlocked critic step turned off commits successfully', async () => {
  const { root, ledgers, commit } = await setup();
  const text = 'x';
  const work = await openWork(root);
  const receipt = buildRunReceipt({ work, text, critic: { status: 'skipped', reason: 'mode off', source: 'work.yaml#overrides.critic' } });
  const result = await commit(receipt, text);
  assert.equal(result.committedHash, sha256(text));
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').status, 'committed');
  assert.deepEqual((await ledgers.receipts.readAll()).map((r) => r.type), ['receipt', 'commit']);
});

test('[round2-N1b] a skipped unlocked check carrying a wrong non-null draftHash is refused', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  const text = 'x';
  const work = await openWork(root);
  const receipt = buildRunReceipt({ work, text, critic: { status: 'skipped', reason: 'mode off', source: 'work.yaml#overrides.critic', draftHash: sha256('other text') } });
  await assert.rejects(commit(receipt, text), (error) => error.code === 'LOCK_RECEIPT_INVALID' || error.code === 'LOCK_HASH_MISMATCH');
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('[round2-N2] a stale receipt committed without resume after a newer one already landed is refused, leaving the newer commit untouched', async () => {
  const { root, ledgers, commit } = await setup();
  const r1 = makeReceipt({ nodeId: 'stairwell', text: 'old', pipeline, receiptId: 'r1' });
  await assert.rejects(commit(r1, 'old', { hooks: { afterBodyWrite: () => { throw new Error('crash'); } } }), /crash/);
  await commit(makeReceipt({ nodeId: 'stairwell', text: 'new', pipeline, receiptId: 'r2', events: [{ eventId: 'ev-new', entityId: 'mara', kind: 'state', data: { vital: 'alive' } }] }), 'new');
  const eventsBefore = await ledgers.events.readAll();
  await assert.rejects(commit(r1, 'old'), { code: 'LOCK_RECEIPT_SUPERSEDED' });
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'new');
  assert.deepEqual(await ledgers.events.readAll(), eventsBefore);
});

test('[task17-fix1] a block finding needs a user override with a reason before commit', async () => {
  const { root, ledgers, commit } = await setup();
  const before = await readFile(join(root, SCENE), 'utf8');
  const finding = { checkId: 'no-x', severity: 'block', code: 'X', message: 'X used' };
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  const critic = receipt.steps.find((s) => s.id === 'critic');
  critic.status = 'failed';
  critic.checks = [{ checkId: 'no-x', status: 'failed', findings: [finding] }];
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_BLOCK_UNRESOLVED' });
  receipt.overridden = [{ ...finding, overrideReason: '의도' }];
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_BLOCK_UNRESOLVED' }, 'an override needs source user');
  receipt.overridden = [{ ...finding, code: 'OTHER', overrideReason: '의도', source: 'user' }];
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_BLOCK_UNRESOLVED' }, 'an override must match checkId and code');
  receipt.overridden = [{ ...finding, source: 'user' }];
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_BLOCK_UNRESOLVED' }, 'an override needs a reason');
  assert.equal(await readFile(join(root, SCENE), 'utf8'), before);
  assert.deepEqual(await ledgers.receipts.readAll(), []);
  receipt.overridden = [{ ...finding, overrideReason: '의도', source: 'user' }];
  await commit(receipt, 'x');
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'x');
});

test('[task17-fix2] an override covers only the finding with the same checkId, code and quote', async () => {
  const { ledgers, commit } = await setup();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  const critic = receipt.steps.find((s) => s.id === 'critic');
  critic.status = 'failed';
  critic.checks = [{ checkId: 'r', status: 'failed', findings: [{ checkId: 'r', severity: 'block', code: 'BAD', message: 'B', quote: 'B문장' }] }];
  receipt.overridden = [{ checkId: 'r', severity: 'block', code: 'BAD', message: 'A', quote: 'A문장', overrideReason: 'A는 의도', source: 'user' }];
  await assert.rejects(commit(receipt, 'x'), { code: 'LOCK_BLOCK_UNRESOLVED' });
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});
