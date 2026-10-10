import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filteredImpacts, changeLink } from '../src/lib/impact.js';
import { createStaticApi } from '../src/lib/static-api.js';
import { parseRoute } from '../src/lib/route.js';
import { navGroup } from '../src/lib/workspace.js';

test('change filtering retains all reasons and original evidence routes for matching sections', () => {
  const view = { sections: [{ nodeId: 'one', title: 'Opening', reasons: [{ kind: 'entity', id: 'hana', title: 'Hana' }, { kind: 'asset', id: 'cover' }] }, { nodeId: 'two', title: 'Ending', reasons: [{ kind: 'check', id: 'continuity' }] }] };
  assert.deepEqual(filteredImpacts(view, 'hana', 'entity'), [view.sections[0]]);
  assert.equal(filteredImpacts(view, '', 'check')[0].nodeId, 'two');
  assert.deepEqual(filteredImpacts(view, 'absent', ''), []);
  assert.equal(changeLink({ kind: 'entity', id: 'a b' }), '#/entity/a%20b');
  assert.equal(changeLink({ kind: 'tracking_snapshot', id: 'one' }), '#/read/one');
  assert.equal(changeLink({ kind: 'source', id: 'ref' }), '#/source/ref');
});

test('Changes is a Review screen, uses offline data and explicitly rejects unavailable old snapshots', async () => {
  assert.deepEqual(parseRoute('#/changes'), { screen: 'changes', id: null });
  assert.equal(navGroup('changes').name, 'Review');
  const impact = { available: true, sections: [] };
  assert.deepEqual(await createStaticApi({ impact }).get('/api/impact'), impact);
  await assert.rejects(createStaticApi({}).get('/api/impact'), { code: 'STATIC_UNAVAILABLE' });
  await assert.rejects(createStaticApi({ impact }).post('/api/impact'), { code: 'STATIC_EXPORT' });
});

test('overview routes a failed nested ledger verification to review records', async () => {
  const { nextAction, unverifiedRecords } = await import('../src/lib/workspace.js');
  const status = { ok: true, ledger: { receipts: { ok: true }, events: { ok: false } } };
  assert.equal(unverifiedRecords(status), true);
  assert.equal(nextAction([{ id: 'one', kind: 'leaf', hasBody: true }], status).screen, 'receipts');
  assert.equal(unverifiedRecords({ ok: true, ledger: { receipts: { ok: true } } }), false);
});
