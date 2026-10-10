import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationsThrough, latestRecorded, trackingCoverage, sectionInGroup, evidenceHref } from '../src/lib/tracking.js';
import { parseRoute } from '../src/lib/route.js';
import { createStaticApi } from '../src/lib/static-api.js';
const observation = (id, ordinal, extra = {}) => ({ observationId: id, subjectId: 'key', criterionId: 'owner', basis: 'explicit', ordinal, ordered: true, evidence: { nodeId: 'scene', textHash: 'hash', quote: 'synthetic source' }, ...extra });

test('ordered view excludes later records and refuses a made-up order for branching sections', () => {
  const view = { sources: { scene: { ordinal: 2, ordered: true }, branch: { ordinal: 3, ordered: false } }, observations: [observation('a', 1), observation('b', 2), observation('c', 3), observation('d', 1, { ordered: false })] };
  assert.deepEqual(observationsThrough(view, 'key', 'scene').map((o) => o.observationId), ['a', 'b']);
  assert.equal(observationsThrough(view, 'key', 'branch'), null);
});
test('latest position never collapses same-position conflict, beliefs, paths or explicit work times', () => {
  const entries = [observation('old', 1), observation('new', 2), observation('conflict', 2),
    observation('belief', 1, { basis: 'attributed', perspectiveId: 'mara' }), observation('other-belief', 1, { basis: 'attributed', perspectiveId: 'junho' }),
    observation('path', 1, { pathLabel: 'left' }), observation('time', 1, { timeLabel: 'yesterday' }), observation('same-time', 2, { timeLabel: 'yesterday' })];
  assert.deepEqual(latestRecorded(entries, [{ id: 'owner', behavior: 'state' }]).map((o) => o.observationId), ['new', 'conflict', 'belief', 'other-belief', 'path', 'time', 'same-time']);
  assert.equal(latestRecorded(entries, [{ id: 'owner', behavior: 'note' }]).length, entries.length);
});
test('coverage keeps missing and pending ranges visible rather than treating absence as a complete scan', () => {
  const view = { coverage: [{ nodeId: 'a', state: 'complete' }, { nodeId: 'b', state: 'drifted' }], unrecordedSections: ['c'] };
  assert.deepEqual(trackingCoverage(view), { complete: 1, total: 2, missing: 1 });
  assert.deepEqual(trackingCoverage(view, ['b', 'c']), { complete: 0, total: 1, missing: 1 });
});
test('evidence links carry a bounded record identity and group filter includes all descendants', () => {
  const o = observation('sha256:' + 'a'.repeat(64), 1); assert.equal(parseRoute(evidenceHref(o)).observation, o.observationId);
  assert.deepEqual(parseRoute('#/read/scene?observation=bad'), { screen: 'read', id: 'scene' });
  const nodes = [{ id: 'book', parentId: null }, { id: 'chapter', parentId: 'book' }, { id: 'scene', parentId: 'chapter' }];
  assert.equal(sectionInGroup(nodes, 'scene', 'book'), true); assert.equal(sectionInGroup(nodes, 'scene', 'other'), false);
});
test('new static tracking and publication shapes work; old exports remain safely unavailable and cannot download', async () => {
  const data = { tracking: { observations: [] }, publication: { contents: [] } }, api = createStaticApi(data);
  assert.deepEqual(await api.get('/api/tracking'), data.tracking); assert.deepEqual(await api.get('/api/publication'), data.publication);
  await assert.rejects(createStaticApi({}).get('/api/tracking'), { code: 'STATIC_UNAVAILABLE' });
  await assert.rejects(api.blob('/api/publication/epub'), { code: 'STATIC_EXPORT' });
});
