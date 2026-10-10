import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackingChange } from '../../core/tracking/change.js';
import { coverageSetup } from '../support/tracking-coverage.js';

test('typed bounded queries expose file and managed entities, current observations, evidence and history with filters', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true, value: '문' });
  const query = (input) => trackingChange(s.root, { op: 'query', ...input });
  const entities = await query({ type: 'entities', subjectId: 'key', limit: 1 });
  assert.equal(entities.type, 'entities'); assert.equal(entities.entries[0].id, 'key'); assert.equal(entities.nextCursor, null);
  assert.equal((await query({ type: 'entities', subjectId: 'mara' })).entries[0].storage, 'file');
  for (const type of ['observations', 'evidence']) {
    const found = await query({ type, subjectId: 'key', criterionId: 'owner', nodeId: 'rooftop-scene' });
    assert.equal(found.entries.length, type === 'evidence' ? 2 : 1); assert.equal(found.entries[0].subjectId, 'key');
    if (type === 'evidence') assert.deepEqual(found.entries.map((entry) => entry.origin), ['subject', 'observation']);
    assert.equal(found.entries[0].evidence.quote, '파란 열쇠');
    assert.equal((await query({ type, nodeId: 'stairwell' })).entries.length, 0);
  }
  const history = await query({ limit: 1 });
  assert.equal(history.type, 'history'); assert.equal(history.nextCursor, '1');
  assert.equal((await query({ cursor: history.nextCursor })).entries[0].type, 'tracking_batch');
  assert.equal((await query({ type: 'history', criterionId: 'owner', nodeId: 'rooftop-scene' })).entries.length, 1);
});
test('query rejects unknown type/fields, invalid signed cursor and unsafe or unbounded limits', async () => {
  const s = await coverageSetup();
  for (const input of [{ type: 'unknown' }, { other: 'unknown' }, { cursor: '+1' }, { cursor: '-1' }, { cursor: '01' },
    { cursor: '9007199254740992' }, { cursor: '2' }, { limit: 0 }, { limit: 201 }, { limit: 1.5 }]) {
    await assert.rejects(trackingChange(s.root, { op: 'query', ...input }), { code: 'TRACKING_INPUT_INVALID' });
  }
});

test('subject registration evidence survives rewriting while current observation evidence is excluded', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true, value: '문' });
  const { updateNode } = await import('../../core/store/tree.js');
  await updateNode(s.root, (await s.work()).tree.nodes.get('rooftop-scene'), { body: '합성 손수정' });
  const found = await trackingChange(s.root, { op: 'query', type: 'evidence', subjectId: 'key' });
  assert.equal(found.entries.length, 1); assert.equal(found.entries[0].origin, 'subject');
  assert.equal(found.entries[0].evidence.quote, '파란 열쇠');
  assert.deepEqual((await trackingChange(s.root, { op: 'query', type: 'evidence', subjectId: 'mara' })).entries, []);
});

test('typed pages default to fifty rows and cap valid requests at two hundred without losing cursor position', async () => {
  const s = await coverageSetup(); const work = await s.work();
  const { trackingQuery } = await import('../../core/tracking/view.js');
  work.entities = new Map(Array.from({ length: 210 }, (_, index) => [`item-${index}`, { id: `item-${index}`, kind: 'object', name: `합성${index}` }]));
  const first = trackingQuery(work, { type: 'entities' });
  assert.equal(first.entries.length, 50); assert.equal(first.nextCursor, '50');
  const last = trackingQuery(work, { type: 'entities', cursor: first.nextCursor, limit: 200 });
  assert.equal(last.entries.length, 160); assert.equal(last.entries[0].id, 'item-50'); assert.equal(last.nextCursor, null);
  assert.equal(trackingQuery(work, { type: 'entities', limit: 200 }).entries.length, 200);
});
