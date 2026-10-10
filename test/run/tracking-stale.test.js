import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLedger } from '../../core/ledger/ledger.js';
import { findStale } from '../../core/scope/stale.js';
import { workStatus } from '../../core/status.js';
import { trackingPayload } from '../../core/tracking/payload.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { fakePacks } from '../support/fixtures.js';
import { coverageSetup, TEXT } from '../support/tracking-coverage.js';
import { editYaml } from '../support/recheck.js';
import { trackingCriterion } from '../support/tracking.js';
import { sha256 } from '../../core/util/hash.js';

const stale = async (s) => findStale({ work: await s.work(), receiptRecords: await openLedger(s.root, 'receipts').readAll(), events: [] });
test('provisional catalog and committed empty snapshot do not immediately stale their own receipt', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true });
  assert.deepEqual(await stale(s), []);
});
test('first scene backfill reaches third payload with provenance and pending node ranges', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene'); await s.execute('stairwell', { discover: true });
  let work = await s.work(); let node = work.tree.nodes.get('post-office');
  let payload = trackingPayload(work, { mode: 'recheck', nodeId: node.id, outputs: {} }, node, ['key']);
  assert.ok(payload.pendingRanges?.some((entry) => entry.nodeId === 'rooftop-scene'));
  await s.execute('rooftop-scene', { mode: 'tracking-backfill', value: '문' });
  work = await s.work(); node = work.tree.nodes.get('post-office');
  payload = trackingPayload(work, { mode: 'recheck', nodeId: node.id, outputs: {} }, node, ['key']);
  assert.equal(payload.observations[0].evidence.nodeId, 'rooftop-scene');
  assert.ok(payload.observations[0].receiptId);
  assert.equal(payload.pendingRanges.some((entry) => entry.nodeId === 'rooftop-scene'), false);
  assert.deepEqual(trackingPayload(work, { mode: 'recheck', nodeId: node.id, outputs: {} }, node).observations, []);
});
test('changed observation stales dependent later node; identical backfill and recheck resolve only tracking stale', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true, value: '문' });
  await s.execute('stairwell', { value: '문' });
  assert.deepEqual(await stale(s), []);
  await s.execute('rooftop-scene', { mode: 'tracking-backfill', value: '탁자' });
  const changed = (await stale(s)).find((entry) => entry.nodeId === 'stairwell');
  assert.ok(changed?.reasons.some((reason) => reason.kind === 'tracking_snapshot' && reason.id === 'rooftop-scene'));
  await driveToEnd(s.make, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal((await stale(s)).some((entry) => entry.nodeId === 'stairwell'), false);
  await s.execute('rooftop-scene', { mode: 'tracking-backfill', value: '탁자' });
  assert.deepEqual(await stale(s), []);
});
test('first observation in a checked-empty source stales its dependent until recheck, including deletion and unchanged retries', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true });
  await s.execute('stairwell', { value: '문' });
  assert.deepEqual(await stale(s), []);
  await s.execute('rooftop-scene', { mode: 'tracking-backfill' });
  assert.deepEqual(await stale(s), []);
  for (const value of ['탁자', null, '문']) {
    await s.execute('rooftop-scene', { mode: 'tracking-backfill', value });
    const dependent = (await stale(s)).find((entry) => entry.nodeId === 'stairwell');
    assert.ok(dependent?.reasons.some((reason) => reason.kind === 'tracking_snapshot' && reason.id === 'rooftop-scene'));
    await s.execute('rooftop-scene', { mode: 'tracking-backfill', value });
    assert.ok((await stale(s)).some((entry) => entry.nodeId === 'stairwell'));
    await driveToEnd(s.make, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' });
    assert.equal((await stale(s)).some((entry) => entry.nodeId === 'stairwell'), false);
    await s.execute('rooftop-scene', { mode: 'tracking-backfill', value });
    assert.equal((await stale(s)).some((entry) => entry.nodeId === 'stairwell'), false);
  }
});
for (const relation of ['value', 'perspective']) test(`first observation linked only by ${relation} stales a person-only dependent`, async () => {
  const s = await coverageSetup({ criteria: [trackingCriterion({ valueType: relation === 'value' ? 'entity' : 'text' })] });
  await s.execute('rooftop-scene', { discover: true });
  await driveToEnd(s.make, createFakeHost({ drafts: { '*': '합성 인물이 문 앞에 선다.' },
    events: { '*': (p) => ({ events: [], appearances: ['mara'], tracking: { planRev: p.tracking.plan.rev,
      discoveries: { subjects: [], criteria: [] }, observations: [], checked: ['owner'] } }) },
  }), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(s.root, 'receipts').readAll()).find((entry) => entry.type === 'receipt' && entry.nodeId === 'stairwell');
  assert.ok(receipt.refs.some((ref) => ref.kind === 'entity' && ref.id === 'mara'));
  assert.equal(receipt.refs.some((ref) => ref.kind === 'entity' && ref.id === 'key'), false);
  assert.deepEqual(await stale(s), []);
  const host = createFakeHost({ events: { '*': (p) => ({ events: [], tracking: { planRev: p.tracking.plan.rev,
    discoveries: { subjects: [], criteria: [] }, checked: ['owner'], observations: [{ subjectId: 'key', criterionId: 'owner',
      value: relation === 'value' ? 'mara' : '문', basis: relation === 'value' ? 'explicit' : 'attributed',
      ...(relation === 'perspective' ? { perspectiveId: 'mara' } : {}),
      evidence: { nodeId: 'rooftop-scene', textHash: sha256(TEXT), quote: '파란 열쇠' } }] } }) } });
  const backfill = async () => driveToEnd(s.make, host, { start: { node: 'rooftop-scene', mode: 'tracking-backfill' }, until: (o) => o.status === 'done' });
  await backfill();
  assert.ok((await stale(s)).find((entry) => entry.nodeId === 'stairwell')?.reasons.some((reason) => reason.kind === 'tracking_snapshot' && reason.id === 'rooftop-scene'));
  await driveToEnd(s.make, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal((await stale(s)).some((entry) => entry.nodeId === 'stairwell'), false);
  await backfill();
  assert.equal((await stale(s)).some((entry) => entry.nodeId === 'stairwell'), false);
});
test('recheck fresh tracking refs leaves pending coverage visible in status when feature false', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene'); await s.execute('stairwell', { discover: true });
  await driveToEnd(s.make, createFakeHost(), { start: { node: 'rooftop-scene', mode: 'recheck' }, until: (o) => o.status === 'done' });
  await editYaml(s.root, (c) => { c.features = { tracking: false }; });
  const status = await workStatus(s.root, { packs: fakePacks() });
  assert.ok(status.backfillPending?.some((entry) => entry.nodeId === 'rooftop-scene'));
  assert.equal(status.trackingStale?.some((entry) => entry.nodeId === 'rooftop-scene'), false);
});

test('tracking recheck preserves the original legacy entity stale comparison', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true, value: '문' });
  const work = await s.work(); const entity = work.entities.get('mara');
  const { writeEntity } = await import('../../core/store/entities.js');
  await writeEntity(s.root, { ...entity, body: `${entity.body}\n합성 변경` });
  await driveToEnd(s.make, createFakeHost(), { start: { node: 'rooftop-scene', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.ok((await stale(s)).find((entry) => entry.nodeId === 'rooftop-scene')?.reasons.some((reason) => reason.kind === 'entity' && reason.id === 'mara'));
});

test('feature-off recheck cannot erase recorded tracking review needs', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true, value: '문' }); await s.execute('stairwell', { value: '문' });
  await s.execute('rooftop-scene', { mode: 'tracking-backfill', value: '탁자' });
  await editYaml(s.root, (c) => { c.features = { tracking: false }; });
  await driveToEnd(s.make, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.ok((await stale(s)).find((entry) => entry.nodeId === 'stairwell')?.reasons.some((reason) => reason.kind === 'tracking_snapshot'));
});
