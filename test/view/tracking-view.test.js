import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { viewTracking } from '../../core/view/tracking-view.js';
import { viewEntity } from '../../core/view/entity-view.js';
import { viewNode } from '../../core/view/node-view.js';
import { buildSnapshot } from '../../core/view/snapshot.js';
import { trackingChange } from '../../core/tracking/change.js';
import { updateNode } from '../../core/store/tree.js';
import { coverageSetup, TEXT } from '../support/tracking-coverage.js';
import { fakePacks } from '../support/fixtures.js';
import { sourceSnapshot } from '../support/export-work.js';
import { sha256 } from '../../core/util/hash.js';

test('tracking viewer uses public current records, seals sources, preserves receipt and matches static and entity views without writes', async (t) => {
  const s = await coverageSetup(); t.after(() => rm(s.root, { recursive: true, force: true }));
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  const before = await sourceSnapshot(s.root), view = await viewTracking(s.root);
  const query = await trackingChange(s.root, { op: 'query', type: 'observations' });
  assert.equal(view.observations.length, query.entries.length);
  for (const [key, value] of Object.entries(query.entries[0])) assert.deepEqual(view.observations[0][key], value);
  const entry = view.observations[0];
  assert.match(entry.observationId, /^sha256:[a-f0-9]{64}$/); assert.equal(entry.sourceState, 'complete');
  assert.equal(view.sources['rooftop-scene'].contentHash, sha256(TEXT));
  assert.equal((await viewNode(s.root, 'rooftop-scene')).contentHash, entry.evidence.textHash);
  assert.deepEqual((await viewEntity(s.root, 'key')).tracking.observations, view.observations);
  assert.deepEqual((await buildSnapshot(s.root, { packs: fakePacks() })).tracking, view);
  assert.ok(view.unrecordedSections.includes('stairwell'));
  assert.deepEqual(await sourceSnapshot(s.root), before);
});

test('changed prose removes old active observations and exposes drifted coverage instead of an apparently current fact', async (t) => {
  const s = await coverageSetup(); t.after(() => rm(s.root, { recursive: true, force: true }));
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  const first = await viewTracking(s.root);
  await updateNode(s.root, (await s.work()).tree.nodes.get('rooftop-scene'), { body: '합성 수정 원고.' });
  const next = await viewTracking(s.root);
  assert.notEqual(next.checkpoint, first.checkpoint);
  assert.deepEqual(next.observations, []); assert.equal(next.coverage[0].state, 'drifted');
  assert.notEqual(next.sources['rooftop-scene'].contentHash, first.sources['rooftop-scene'].contentHash);
});

test('tracking corruption is not silently shown as an empty approved view', async (t) => {
  const s = await coverageSetup(); t.after(() => rm(s.root, { recursive: true, force: true }));
  const file = join(s.root, '.folio', 'ledger', 'tracking.jsonl');
  await writeFile(file, (await readFile(file, 'utf8')).replace('열쇠', '변조'));
  await assert.rejects(viewTracking(s.root));
});
