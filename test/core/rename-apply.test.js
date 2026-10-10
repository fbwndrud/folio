import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { occurrenceStates } from '../../core/occurrences/state.js';
import { planRename } from '../../core/rename/plan.js';
import { applyRename } from '../../core/rename/apply.js';
import { detectDrift } from '../../core/store/drift.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { copyFixture, emptyTreeCopy, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');
const ARC = join('tree', '01-arc-awakening', '_node.md');
const records = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();
async function planFor(root, args) { return planRename(await openWork(root), await records(root), args); }
async function tree(root) {
  const work = await openWork(root);
  return Object.fromEntries([...work.tree.nodes.values()].map((n) => [n.id, n.fileText]).concat([...work.entities.values()].map((e) => [e.id, e.fileText])));
}
async function ledgerBytes(root, name) {
  try { return await readFile(join(root, '.folio', 'ledger', `${name}.jsonl`), 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

async function committedEp1(root) {
  await useFakePack(root);
  const host = createFakeHost({ drafts: { 'ep-001': '하나는 지하실 끝에서 잠긴 문을 발견했다.\n' } });
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
}

test('apply writes every file, re-records occurrences, and reports committed nodes that now need a recommit', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  const out = await applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest });
  assert.deepEqual(out.recommit, ['ep-001']);
  assert.match(await readFile(join(root, EP1), 'utf8'), /세라는 지하실/);
  const work = await openWork(root);
  assert.equal(work.entities.get('hana').name, '세라');
  assert.deepEqual(work.entities.get('hana').aliases, ['하나']);
  const states = occurrenceStates(work, await records(root));
  assert.deepEqual(states.map((s) => [s.quote, s.status, s.origin]), [['세라는', 'located', 'rename']]);
  const drift = detectDrift(work, await openLedger(root, 'receipts').readAll());
  assert.deepEqual(drift.map((d) => [d.nodeId, d.code]), [['ep-001', 'HAND_EDITED']]);
});

test('a stale digest, an open run, or the feature off refuses and writes nothing', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  const before = await tree(root);
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', include: ['node:ep-003:@0'], planDigest: plan.planDigest }), { code: 'RENAME_PLAN_STALE' });
  const path = join(root, 'tree', '01-arc-awakening', '02-ep-002.md');
  const text = await readFile(path, 'utf8');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-002' }, items: [] });
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: 'sha256:00' }), { code: 'RENAME_PLAN_STALE' });
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), { start: { node: 'ep-002' }, until: (o) => label(o) === 'model:critic' });
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest }), (e) => e.code === 'RENAME_RUN_OPEN' && e.details.runId === trail.at(-1).runId);
  await createRunner({ root, packs: fakePacks() }).decide({ runId: trail.at(-1).runId, action: 'skip', reason: 't' }).catch(() => {});
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { rename: false } }));
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest }), { code: 'FEATURE_DISABLED' });
  assert.equal(await readFile(path, 'utf8'), text);
  const after = await tree(root);
  assert.deepEqual(after, before);
});

test('a failure injected in the middle of writing leaves every file and the occurrences ledger unchanged', async () => {
  const root = await copyFixture('knowledge-book');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'membranes' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP를' }] });
  const plan = await planFor(root, { entityId: 'atp', newName: '아데노신삼인산' });
  assert.equal(plan.files.length, 3);
  const before = await tree(root);
  const ledgerBefore = (await records(root)).length;
  await assert.rejects(applyRename(root, { entityId: 'atp', newName: '아데노신삼인산', planDigest: plan.planDigest }, { hooks: { beforeWrite: (i) => { if (i === 2) throw new Error('boom'); } } }), { code: 'TX_FAILED' });
  assert.deepEqual(await tree(root), before);
  assert.equal((await records(root)).length, ledgerBefore);
});

test('a failure injected at the very first write leaves every file and the occurrences ledger unchanged', async () => {
  const root = await copyFixture('knowledge-book');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'membranes' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP를' }] });
  const plan = await planFor(root, { entityId: 'atp', newName: '아데노신삼인산' });
  const before = await tree(root);
  const ledgerBefore = (await records(root)).length;
  await assert.rejects(applyRename(root, { entityId: 'atp', newName: '아데노신삼인산', planDigest: plan.planDigest }, { hooks: { beforeWrite: (i) => { if (i === 0) throw new Error('boom'); } } }), { code: 'TX_FAILED' });
  assert.deepEqual(await tree(root), before);
  assert.equal((await records(root)).length, ledgerBefore);
});

test('a failure injected at the last write leaves every file and the occurrences ledger unchanged', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  assert.equal(plan.files.length, 2);
  const before = await tree(root);
  const ledgerBefore = (await records(root)).length;
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest }, { hooks: { beforeWrite: (i) => { if (i === 1) throw new Error('boom'); } } }), { code: 'TX_FAILED' });
  assert.deepEqual(await tree(root), before);
  assert.equal((await records(root)).length, ledgerBefore);
});

test('receipts, decisions and events ledgers stay byte-identical after an apply', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const before = { receipts: await ledgerBytes(root, 'receipts'), decisions: await ledgerBytes(root, 'decisions'), events: await ledgerBytes(root, 'events') };
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  await applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest });
  assert.deepEqual({ receipts: await ledgerBytes(root, 'receipts'), decisions: await ledgerBytes(root, 'decisions'), events: await ledgerBytes(root, 'events') }, before);
});

test('keepOldName:false drops the old name from aliases entirely', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라', keepOldName: false });
  const out = await applyRename(root, { entityId: 'hana', newName: '세라', keepOldName: false, planDigest: plan.planDigest });
  assert.equal(out.applied, true);
  const work = await openWork(root);
  assert.equal(work.entities.get('hana').name, '세라');
  assert.deepEqual(work.entities.get('hana').aliases ?? [], []);
});

test('a digest built with a different exclude or keepOldName is stale', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const planDefault = await planFor(root, { entityId: 'hana', newName: '세라' });
  const changeId = planDefault.changes[0].id;
  const planExcluded = await planFor(root, { entityId: 'hana', newName: '세라', exclude: [changeId] });
  assert.notEqual(planExcluded.planDigest, planDefault.planDigest);
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', exclude: [changeId], planDigest: planDefault.planDigest }), { code: 'RENAME_PLAN_STALE' });
  const planNoKeep = await planFor(root, { entityId: 'hana', newName: '세라', keepOldName: false });
  assert.notEqual(planNoKeep.planDigest, planDefault.planDigest);
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', keepOldName: false, planDigest: planDefault.planDigest }), { code: 'RENAME_PLAN_STALE' });
});

test('a waiting_children run whose node the plan changes refuses, but one on an unrelated node does not', async () => {
  const root = await emptyTreeCopy('serial-2level');
  await mkdir(join(root, 'tree', '01-arc-awakening'));
  await writeFile(join(root, ARC), '---\nid: arc-awakening\nlevel: arc\ntitle: 각성\n---\n');
  await useFakePack(root);
  const host = createFakeHost({
    plans: { 'arc-awakening': '하나가 잠긴 문의 존재를 알게 된다.\n' },
    children: { 'arc-awakening': [{ id: 'ep-101', title: '1화' }] },
    drafts: { 'ep-101': '도윤이 뒤를 쫓는다.\n' },
  });
  const runner = () => createRunner({ root, packs: fakePacks() });
  // 자식(ep-101)이 생기고 생성 중일 때까지만 몰고, 부모(arc-awakening)를 waiting_children 에 세운다.
  await driveToEnd(runner, host, { start: { node: 'arc-awakening' }, until: (o) => o.nodeId && o.nodeId !== 'arc-awakening' });
  await driveToEnd(runner, host, { start: { node: 'next' }, until: (o) => o.status === 'done' });
  const waiting = (await createRunStore(root).list()).find((r) => r.state === 'waiting_children');
  assert.equal(waiting.nodeId, 'arc-awakening');

  // arc-awakening 자신의 글(계획 본문)에 든 이름을 바꾸면 그 기다리는 실행이 걸린다.
  await submitOccurrences(root, { surface: { kind: 'node', id: 'arc-awakening' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나가' }] });
  const planOnWaiting = await planFor(root, { entityId: 'hana', newName: '세라' });
  const arcBefore = await readFile(join(root, ARC), 'utf8');
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: planOnWaiting.planDigest }),
    (e) => e.code === 'RENAME_RUN_OPEN' && e.details.runId === waiting.runId && e.details.nodeId === 'arc-awakening');
  assert.equal(await readFile(join(root, ARC), 'utf8'), arcBefore);

  // ep-101(이미 끝난 자식)에만 있는 이름을 바꾸는 것은 arc-awakening 이 기다리는 것과 상관없어 막히지 않는다.
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-101' }, items: [{ entityId: 'doyun', kind: 'appearance', quote: '도윤이' }] });
  const planOnDone = await planFor(root, { entityId: 'doyun', newName: '재하' });
  assert.ok(!planOnDone.changes.some((c) => c.surface.id === 'arc-awakening'));
  const out = await applyRename(root, { entityId: 'doyun', newName: '재하', planDigest: planOnDone.planDigest });
  assert.equal(out.applied, true);
  const work = await openWork(root);
  assert.equal(work.entities.get('doyun').name, '재하');
  assert.equal((await createRunStore(root).list()).find((r) => r.state === 'waiting_children')?.nodeId, 'arc-awakening');
});

test('a failed occurrence-ledger append after the files are written surfaces RENAME_OCCURRENCES_NOT_RECORDED', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  const error = await applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest }, { now: () => { throw new Error('disk full'); } }).catch((e) => e);
  assert.equal(error.code, 'RENAME_OCCURRENCES_NOT_RECORDED');
  assert.equal(error.details.applied, true);
  assert.deepEqual(error.details.files.sort(), plan.files.map((f) => f.path).sort());
  assert.deepEqual(error.details.recommit, plan.committed);
  assert.equal(error.details.recorded, 0);
  assert.equal(error.details.cause, 'ERROR');
  assert.match(await readFile(join(root, EP1), 'utf8'), /세라는 지하실/);
  const work = await openWork(root);
  assert.equal(work.entities.get('hana').name, '세라');
});
