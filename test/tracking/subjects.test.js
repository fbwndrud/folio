import { makeReceipt } from '../support/receipts.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeManagedSubjects } from '../../core/tracking/subjects.js';
import { normalizeSubject } from '../../core/tracking/subject-schema.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { trackingChange } from '../../core/tracking/change.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { rebuildIndex, indexPath } from '../../core/index/rebuild.js';
import { openIndex, dumpIndex, entitiesInIndex } from '../../core/index/query.js';
import { planRename } from '../../core/rename/plan.js';
import { applyRename } from '../../core/rename/apply.js';
import { findInWork } from '../../server/tools/find.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';
import { appendPlan, trackingPlan } from '../support/tracking.js';

const declaration = (overrides = {}) => ({ id: 'key', kind: 'object', name: '합성 열쇠', aliases: ['합성 키'], body: '', data: { color: 'blue' },
  evidence: { nodeId: 'ep-001', textHash: sha256('합성 열쇠를 놓았다.'), quote: '열쇠' }, ...overrides });
const normalized = (overrides = {}) => normalizeSubject(declaration(overrides), { subjectKinds: ['object'] });

test('canonical managed merge rejects every ID/name/alias collision and retains history after rewrite', () => {
  const legacy = new Map([['person', { id: 'person', name: '합성 인물', aliases: ['합성 별칭'], path: 'entities/person.md' }]]);
  const merged = mergeManagedSubjects(legacy, [normalized()], ['object']);
  assert.equal(merged.get('key').rev, normalized().rev);
  assert.equal(merged.get('key').storage, 'tracking');
  assert.equal(merged.get('person').storage, 'file');
  assert.equal(legacy.size, 1);
  for (const subjects of [[normalized({ id: 'person' })], [normalized({ name: '합성 인물' })], [normalized({ aliases: ['합성 별칭'] })], [normalized(), normalized()], [normalized(), normalized({ id: 'second' })]]) {
    assert.throws(() => mergeManagedSubjects(legacy, subjects, ['object']), { code: 'TRACKING_ENTITY_COLLISION' });
  }
});

test('managed definitions load, query and index with null path; rename refuses before file transaction', async () => {
  const root = await copyFixture('serial-2level');
  await appendPlan(root, normalizePlan(trackingPlan(), { nodeIds: [...(await openWork(root)).tree.nodes.keys()] }));
  const node = (await openWork(root)).tree.nodes.get('ep-001');
  await updateNode(root, node, { data: { status: 'committed' }, body: '합성 열쇠를 놓았다.' });
  await openLedger(root, 'receipts').append({ type: 'receipt', ...makeReceipt({ receiptId: 'synthetic-commit', nodeId: node.id, level: node.level, text: '합성 열쇠를 놓았다.',
    pipeline: { steps: [{ id: 'synthetic', kind: 'check' }], digest: sha256('synthetic-pipeline') } }) });
  await openLedger(root, 'receipts').append({ type: 'commit', receiptId: 'synthetic-commit', nodeId: node.id, committedHash: sha256('합성 열쇠를 놓았다.') });
  const plan = (await openWork(root)).tracking.plan;
  const p = await trackingChange(root, { op: 'propose', expectedRev: plan.rev, changes: { subjects: [declaration()] } });
  await trackingChange(root, { op: 'decide', proposalId: p.proposalId, proposalDigest: p.proposalDigest, action: 'approve' });
  const work = await openWork(root);
  const managed = work.entities.get('key');
  assert.equal(managed.managed, true); assert.equal(managed.path, null);
  const publicEntity = (await findInWork(root, { query: 'entity', id: 'key' })).entity;
  assert.equal(publicEntity.managed, true); assert.equal(publicEntity.storage, 'tracking'); assert.equal(publicEntity.path, null);
  assert.deepEqual(managed.data, { color: 'blue' });
  assert.throws(() => planRename(work, [], { entityId: 'key', newName: '새 열쇠' }), { code: 'RENAME_MANAGED_ENTITY' });
  const path = join(root, 'tree', node.path);
  const before = await readFile(path, 'utf8');
  let writes = 0;
  await assert.rejects(applyRename(root, { entityId: 'key', newName: '새 열쇠', planDigest: sha256('fake') }, { hooks: { beforeWrite() { writes += 1; } } }), { code: 'RENAME_MANAGED_ENTITY' });
  assert.equal(writes, 0); assert.equal(await readFile(path, 'utf8'), before);
  await rebuildIndex(root);
  const db = openIndex(root);
  try {
    const row = entitiesInIndex(db).find((s) => s.id === 'key');
    assert.deepEqual(row, { id: 'key', kind: 'object', name: '합성 열쇠', path: null, rev: managed.rev, storage: 'tracking', managed: true });
    assert.equal(dumpIndex(db).entities.find((s) => s.id === 'doyun').storage, 'file');
  } finally { db.close(); }
  const firstIndex = await readFile(indexPath(root));
  await rebuildIndex(root);
  assert.deepEqual(await readFile(indexPath(root)), firstIndex);
  await updateNode(root, (await openWork(root)).tree.nodes.get(node.id), { body: '합성 새 본문' });
  assert.equal((await openWork(root)).entities.get('key').rev, managed.rev);
});
