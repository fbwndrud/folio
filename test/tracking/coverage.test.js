import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { trackingView } from '../../core/tracking/view.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { updateNode } from '../../core/store/tree.js';
import { coverageSetup } from '../support/tracking-coverage.js';
import { appendPlan, trackingCriterion } from '../support/tracking.js';
import { editYaml } from '../support/recheck.js';

const coverage = async (s) => trackingView(await s.work()).coverage;
test('explicit checked-empty completes while unchecked criteria remain pending', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { checked: [] });
  assert.equal((await coverage(s))[0]?.state, 'pending');
  await s.execute('rooftop-scene', { mode: 'tracking-backfill' });
  assert.equal((await coverage(s))[0]?.state, 'complete');
});
test('late unnamed managed discovery reopens earlier nodes, then checked-empty backfill completes', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene'); await s.execute('stairwell', { discover: true });
  assert.deepEqual((await coverage(s)).map((c) => [c.nodeId, c.state]), [['rooftop-scene', 'pending'], ['stairwell', 'complete']]);
  await s.execute('rooftop-scene', { mode: 'tracking-backfill' });
  assert.ok((await coverage(s)).every((c) => c.state === 'complete'));
});
test('late legacy file catalog discovery reopens old coverage even with tracking disabled', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene');
  await mkdir(`${s.root}/entities/object`); await writeFile(`${s.root}/entities/object/new.md`, '---\nid: new-object\nkind: object\nname: 이름없는대상\naliases: []\n---\n');
  await editYaml(s.root, (c) => { c.features = { tracking: false }; });
  assert.equal((await coverage(s))[0]?.state, 'pending');
});
test('new applicable criterion and changed semantic criterion never reuse old checks or observations', async () => {
  const s = await coverageSetup({ criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: '문' })] }); await s.execute('rooftop-scene', { discover: true, value: '문' });
  const { grantId: _grant, ...plan } = (await s.work()).tracking.plan;
  await appendPlan(s.root, normalizePlan({ ...plan, version: 2, criteria: [{ ...plan.criteria[0], expectedValue: '탁자' },
    trackingCriterion({ id: 'late', appliesTo: ['rooftop-scene'] })] }, { nodeIds: ['rooftop-scene'] }));
  const work = await s.work();
  assert.deepEqual(trackingView(work).coverage.map((c) => c.state), ['pending', 'pending']);
  assert.deepEqual(work.tracking.observations, []);
});
test('current text drift is reported and catalog-stampless historical batches are pending', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene');
  const work = await s.work(); const receipts = await openLedger(s.root, 'receipts').readAll();
  const legacy = { ...work, tracking: { ...work.tracking, receiptRecords: receipts.map((r) => ({ ...r, refs: (r.refs ?? []).filter((ref) => ref.kind !== 'tracking_catalog') })) } };
  assert.equal(trackingView(legacy).coverage[0]?.state, 'pending');
  await updateNode(s.root, work.tree.nodes.get('rooftop-scene'), { body: '합성 손수정 원문' });
  assert.equal((await coverage(s))[0]?.state, 'drifted');
});

test('hard backfill receipt stays blocked without completing or activating observations', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene');
  const { createRunner } = await import('../../core/run/runner.js');
  const { createFakeHost, driveToEnd } = await import('../support/fake-host.js');
  const { fakePacks } = await import('../support/fixtures.js');
  const packs = fakePacks(); const pack = packs.get('fake');
  packs.set('fake', { ...pack, checks: pack.checks.map((check) => check.id === 'fake.critic' ? { ...check, severity: 'hard' } : check) });
  const host = createFakeHost({ critic: () => [{ checkId: 'fake.critic', code: 'SYNTHETIC', message: '합성 hard' }] });
  await driveToEnd(() => createRunner({ root: s.root, packs }), host, { start: { node: 'rooftop-scene', mode: 'tracking-backfill' },
    until: (o) => o.status === 'needs_user' && o.question.kind === 'flagged' });
  assert.equal((await coverage(s))[0]?.state, 'blocked');
  assert.equal((await s.work()).tracking.batches.length, 1);
});

test('plan decision response uses recorded history for current criterion coverage', async () => {
  const s = await coverageSetup({ criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: '문' })] });
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  const { trackingChange } = await import('../../core/tracking/change.js');
  const { grantId: _grant, version: _version, rev: _rev, ...content } = (await s.work()).tracking.plan;
  const proposal = await trackingChange(s.root, { op: 'propose', expectedRev: _rev, plan: {
    ...content, criteria: content.criteria.map((entry) => ({ ...entry, expectedValue: '탁자' })) } });
  const result = await trackingChange(s.root, { op: 'decide', proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest, action: 'approve' });
  assert.equal(result.coverage[0]?.state, 'pending');
  assert.deepEqual(result.observations, []);
});

test('late criterion applies only to its selected node and leaves other criteria coverage complete', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene'); await s.execute('stairwell');
  const { grantId: _grant, ...plan } = (await s.work()).tracking.plan;
  await appendPlan(s.root, normalizePlan({ ...plan, version: 2, criteria: [...plan.criteria, trackingCriterion({ id: 'late', appliesTo: ['rooftop-scene'] })] },
    { nodeIds: ['rooftop-scene', 'stairwell'] }));
  assert.deepEqual((await coverage(s)).map(({ nodeId, criterionId, state }) => [nodeId, criterionId, state]),
    [['rooftop-scene', 'owner', 'complete'], ['rooftop-scene', 'late', 'pending'], ['stairwell', 'owner', 'complete']]);
});

async function failedDiscovery(s) {
  const { createRunner } = await import('../../core/run/runner.js');
  const { createFakeHost, driveToEnd } = await import('../support/fake-host.js');
  const { fakePacks } = await import('../support/fixtures.js');
  const { TEXT } = await import('../support/tracking-coverage.js');
  const { sha256 } = await import('../../core/util/hash.js');
  const packs = fakePacks(); const pack = packs.get('fake');
  packs.set('fake', { ...pack, checks: pack.checks.map((check) => check.id === 'fake.critic' ? { ...check, severity: 'hard' } : check) });
  const evidence = { nodeId: 'rooftop-scene', textHash: sha256(TEXT), quote: '파란 열쇠' };
  const host = createFakeHost({ events: { '*': (payload) => ({ events: [], tracking: { planRev: payload.tracking.plan.rev,
    discoveries: { subjects: [{ id: 'key', kind: 'object', name: '숨은 물건', aliases: [], body: '', data: {}, evidence }], criteria: [] },
    observations: [], checked: ['owner'] } }) }, critic: () => [{ checkId: 'fake.critic', code: 'SYNTHETIC', message: '합성 hard' }] });
  await driveToEnd(() => createRunner({ root: s.root, packs }), host, { start: { node: 'rooftop-scene', mode: 'tracking-backfill' },
    until: (outcome) => outcome.status === 'needs_user' && outcome.question.kind === 'flagged' });
}

test('hard discovery is blocked in get status and payload without activating its catalog or batch', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene'); const before = await s.work();
  await failedDiscovery(s);
  const { trackingChange } = await import('../../core/tracking/change.js');
  const { workStatus } = await import('../../core/status.js');
  const { trackingPayload } = await import('../../core/tracking/payload.js');
  const { fakePacks } = await import('../support/fixtures.js');
  const work = await s.work(); const node = work.tree.nodes.get('rooftop-scene');
  const current = (await trackingChange(s.root, { op: 'get' })).coverage;
  assert.equal(current[0]?.state, 'blocked');
  assert.deepEqual((await workStatus(s.root, { packs: fakePacks() })).backfillPending, current);
  assert.deepEqual(trackingPayload(work, { mode: 'recheck', nodeId: node.id, outputs: {} }, node).pendingRanges, current);
  const receipt = (await openLedger(s.root, 'receipts').readAll()).filter((record) => record.type === 'tracking-backfill').at(-1);
  assert.equal(receipt.hard, 1); assert.deepEqual(receipt.trackingBatch.subjects.map((subject) => subject.id), ['key']);
  assert.deepEqual(work.tracking.subjects, before.tracking.subjects);
  assert.deepEqual(work.tracking.batches, before.tracking.batches);
  assert.equal(work.entities.has('key'), false); assert.equal(node.body, before.tree.nodes.get(node.id).body);
});

test('old hard discovery does not block changed criterion or drifted current prose', async () => {
  const s = await coverageSetup({ criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: '문' })] });
  await s.execute('rooftop-scene'); await failedDiscovery(s);
  assert.equal((await coverage(s))[0]?.state, 'blocked');
  await mkdir(`${s.root}/entities/object`); await writeFile(`${s.root}/entities/object/late.md`, '---\nid: late-object\nkind: object\nname: 합성추가대상\naliases: []\n---\n');
  assert.equal((await coverage(s))[0]?.state, 'blocked');
  const { grantId: _grant, ...plan } = (await s.work()).tracking.plan;
  await appendPlan(s.root, normalizePlan({ ...plan, version: 2, criteria: [{ ...plan.criteria[0], expectedValue: '탁자' },
    trackingCriterion({ id: 'late', appliesTo: ['rooftop-scene'] })] }, { nodeIds: ['rooftop-scene'] }));
  assert.deepEqual((await coverage(s)).map((entry) => entry.state), ['pending', 'pending']);
  await updateNode(s.root, (await s.work()).tree.nodes.get('rooftop-scene'), { body: '바뀐 합성 원문' });
  assert.deepEqual((await coverage(s)).map((entry) => entry.state), ['drifted', 'drifted']);
});

test('same-hash new prose receipt excludes an old hard discovery failure', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene'); await failedDiscovery(s);
  assert.equal((await coverage(s))[0]?.state, 'blocked');
  const { createFakeHost, driveToEnd } = await import('../support/fake-host.js');
  const { TEXT } = await import('../support/tracking-coverage.js');
  await editYaml(s.root, (config) => { config.features = { tracking: false }; });
  await driveToEnd(s.make, createFakeHost({ drafts: { '*': TEXT } }), { start: { node: 'rooftop-scene' }, until: (outcome) => outcome.status === 'done' });
  assert.equal((await coverage(s))[0]?.state, 'pending');
  assert.deepEqual((await s.work()).tracking.subjects, []);
});
