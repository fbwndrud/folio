import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { viewImpact } from '../../core/view/impact-view.js';
import { buildSnapshot } from '../../core/view/snapshot.js';
import { viewNode } from '../../core/view/node-view.js';
import { viewNodeReceipts } from '../../core/view/receipt-view.js';
import { viewNodeEvidence } from '../../core/view/evidence-view.js';
import { writingReadContext } from '../../core/view/read-context.js';
import { assertWritingCheckpoint } from '../../core/view/writing-checkpoint.js';
import { updateNode } from '../../core/store/tree.js';
import { writeEntity } from '../../core/store/entities.js';
import { coverageSetup } from '../support/tracking-coverage.js';
import { fakePacks, copyFixture, useFakePack } from '../support/fixtures.js';
import { sourceSnapshot } from '../support/export-work.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { editYaml } from '../support/recheck.js';

const options = { packs: fakePacks() };
test('recorded tracking changes connect exact versions to dependent sections and disappear after valid recheck without view writes', async () => {
  const s = await coverageSetup();
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  await s.execute('stairwell', { value: '문' });
  assert.deepEqual((await viewImpact(s.root, options)).sections, []);
  await s.execute('rooftop-scene', { mode: 'tracking-backfill', value: '탁자' });
  const before = await sourceSnapshot(s.root), view = await viewImpact(s.root, options);
  assert.equal(view.available, true);
  const changed = view.changes.find((c) => c.kind === 'tracking_snapshot' && c.id === 'rooftop-scene');
  assert.ok(changed.affected.some((a) => a.nodeId === 'stairwell' && a.was !== a.now));
  assert.ok(view.sections.find((n) => n.nodeId === 'stairwell').newChecksPending);
  assert.ok(view.unreviewed.some((n) => n.nodeId === 'post-office'));
  assert.deepEqual(await sourceSnapshot(s.root), before);
  assert.deepEqual((await buildSnapshot(s.root, options)).impact, view);
  await driveToEnd(s.make, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal((await viewImpact(s.root, options)).sections.some((n) => n.nodeId === 'stairwell'), false);
});

test('setting edits and direct manuscript edits retain dependency revisions and body fingerprints', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true, value: '문' });
  let work = await s.work(); const entity = work.entities.get('mara');
  await writeEntity(s.root, { ...entity, body: entity.body + '\n합성 변경' });
  let view = await viewImpact(s.root, options);
  assert.ok(view.sections.find((n) => n.nodeId === 'rooftop-scene').reasons.some((r) => r.kind === 'entity' && r.id === 'mara' && r.was !== r.now));
  work = await s.work(); await updateNode(s.root, work.tree.nodes.get('rooftop-scene'), { body: '합성 변경 원고' });
  view = await viewImpact(s.root, options);
  const reason = view.sections.find((n) => n.nodeId === 'rooftop-scene').reasons.find((r) => r.kind === 'manuscript');
  assert.match(reason.was, /^sha256:/); assert.match(reason.now, /^sha256:/); assert.notEqual(reason.was, reason.now);
  assert.ok(view.pendingTracking.some((c) => c.state === 'drifted'));
  assert.ok(!JSON.stringify(view).includes(s.root));
});

test('unavailable settings and tampered activity records cannot appear as a verified empty queue', async () => {
  const root = await copyFixture('serial-2level'); await useFakePack(root);
  await editYaml(root, (c) => { c.packs = ['missing']; });
  assert.equal((await viewImpact(root, options)).available, false);
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true });
  const file = join(s.root, '.folio', 'ledger', 'receipts.jsonl');
  await writeFile(file, (await readFile(file, 'utf8')).replace('draftHash', 'changedHash'));
  try { assert.equal((await viewImpact(s.root, options)).available, false); }
  catch (error) { assert.ok(['LOCK_TRACKING_INTEGRITY', 'LEDGER_TAMPERED'].includes(error.code), error.code); }
});

test('shared snapshot reads preserve public node, receipt and evidence contracts', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true });
  const snap = await buildSnapshot(s.root, options);
  for (const id of Object.keys(snap.nodes)) {
    assert.deepEqual(snap.nodes[id], await viewNode(s.root, id));
    assert.deepEqual(snap.receiptNodes[id], await viewNodeReceipts(s.root, options, id));
    assert.deepEqual(snap.evidence[id], await viewNodeEvidence(s.root, id));
  }
});

for (const target of ['manuscript', 'setting', 'config', 'ledger']) test(`shared read checkpoint rejects a concurrent ${target} change`, async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true });
  const context = await writingReadContext(s.root, options.packs);
  if (target === 'manuscript') await updateNode(s.root, context.work.tree.nodes.get('rooftop-scene'), { body: '동시 합성 수정' });
  if (target === 'setting') await writeEntity(s.root, { ...context.work.entities.get('mara'), body: '동시 합성 설정' });
  if (target === 'config') await editYaml(s.root, (c) => { c.title = '동시 합성 제목'; });
  if (target === 'ledger') {
    const file = join(s.root, '.folio', 'ledger', 'decisions.jsonl');
    await writeFile(file, '\n', { flag: 'a' });
  }
  await assert.rejects(assertWritingCheckpoint(s.root, context.checkpoint));
});

test('image replacement invalidates approval and shows the affected manuscript until a new review', async () => {
  const { setupAssets, syntheticSvg } = await import('../support/assets.js');
  const { createRunner } = await import('../../core/run/runner.js');
  const s = await setupAssets();
  let a = await s.approve(await s.review(await s.put(await s.add())));
  a = s.ok(await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] })).asset;
  const make = () => createRunner({ root: s.root, packs: s.packs });
  const host = createFakeHost({ drafts: { 'toy-scene': '합성 입력 장면. ![[asset:toy-image]]\n' } });
  await driveToEnd(make, host, { start: { node: 'toy-scene' }, until: (o) => o.status === 'done' });
  await writeFile(s.source, syntheticSvg('red')); a = await s.put(a);
  assert.equal(a.approved, false);
  let view = await viewImpact(s.root, { packs: s.packs });
  assert.ok(view.sections.find((n) => n.nodeId === 'toy-scene').reasons.some((r) => r.kind === 'asset' && r.id === a.id && r.was !== r.now));
  a = await s.approve(await s.review(a));
  await driveToEnd(make, host, { start: { node: 'toy-scene', mode: 'recheck' }, until: (o) => o.status === 'done' });
  view = await viewImpact(s.root, { packs: s.packs });
  assert.equal(view.sections.some((n) => n.nodeId === 'toy-scene'), false);
});

test('a source quote that disappears is shown even if its manuscript claim still exists', async () => {
  const { submitEvidence } = await import('../../core/evidence/submit.js');
  const root = await copyFixture('knowledge-book'); await useFakePack(root);
  const quote = 'ATP는 세포의 에너지 화폐로 불린다.';
  await submitEvidence(root, { nodeId: 'atp-section', claims: [{ quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote }] }] });
  const work = (await writingReadContext(root, options.packs)).work;
  await writeFile(join(root, 'sources', work.sources.get('cell-notes').file), '합성 대체 자료.');
  const view = await viewImpact(root, options);
  assert.equal(view.evidenceAvailable, true);
  assert.ok(view.sections.find((n) => n.nodeId === 'atp-section').reasons.some((r) => r.kind === 'source_link' && r.id === 'cell-notes' && r.quote === quote));
});

test('hard findings remain visible without permitting approval or rewriting the manuscript', async () => {
  const { committedWith } = await import('../support/recheck.js');
  const { root, makeRunner } = await committedWith({ fixture: 'serial-2level', seed: true, node: 'ep-004', checks: { 'fake.dead-on-stage': { mode: 'off' } } });
  await editYaml(root, (c) => { c.checks = {}; });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-004', mode: 'recheck' }, until: (o) => o.status === 'needs_user' });
  const before = await sourceSnapshot(root), view = await viewImpact(root, options);
  assert.equal(view.sections.find((n) => n.nodeId === 'ep-004').mustFix[0].code, 'DEAD_ON_STAGE');
  assert.deepEqual(await sourceSnapshot(root), before);
  await assert.rejects(makeRunner().decide({ runId: trail.at(-1).runId, action: 'approve', reason: '합성 시도' }), { code: 'RUN_NOT_AWAITING_USER' });
});
