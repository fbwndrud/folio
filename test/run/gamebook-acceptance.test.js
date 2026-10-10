import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { scopeFor } from '../../core/run/payload.js';
import { editYaml } from '../support/recheck.js';
import { workStatus } from '../../core/status.js';

test('main 경로 사건 분리·참고 지적·자기검토·토글·재검사를 실제 실행기로 검증한다', async () => {
  const root = await copyFixture('gamebook-n7'), packs = await loadBuiltinPacks(), makeRunner = () => createRunner({ root, packs });
  const host = createFakeHost({ drafts: { '*': '주인공이 합성 문을 연다.' }, events: {
    a: { events: [] }, b: { events: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' }, quote: '주인공' }] }, c: { events: [] }, z: { events: [], appearances: ['hero'] },
  } });
  for (const node of ['a', 'b', 'c', 'z']) {
    const trail = await driveToEnd(makeRunner, host, { start: { node }, until: (o) => o.status === 'done' });
    assert.equal(trail.at(-1).status, 'done');
  }
  const records = await openLedger(root, 'receipts').readAll(), receipt = records.findLast((r) => r.type === 'receipt' && r.nodeId === 'z');
  assert.equal(receipt.hard, 0); assert.ok(receipt.advisories.some((f) => f.code === 'DEAD_ON_STAGE' && f.nodeIds.includes('b') && !f.nodeIds.includes('c')));
  assert.ok(receipt.refs.some((r) => r.kind === 'branching'));
  assert.deepEqual(receipt.steps.find((s) => s.id === 'critic').checks[0].reviewer, { sameHost: true, independent: false });
  assert.ok(receipt.steps.find((s) => s.id === 'facts').checks.some((c) => c.checkId === 'core.promise-order' && c.status === 'not_applicable'));
  assert.ok(!host.calls.some((c) => c.purpose === 'revise'));
  const context = { ...await openWorkspace(root, { packs }), receiptRecords: records, events: activeEvents(await openLedger(root, 'events').readAll()) }, scope = scopeFor(context, { nodeId: 'z', outputs: { draft: '주인공', events: { appearances: ['hero'] } } });
  assert.equal(scope.branching.paths.length, 2); assert.equal(scope.branching.paths[1].events.length, 0);
  await editYaml(root, (config) => { config.features = { branching: false }; });
  assert.ok((await workStatus(root, { packs })).stale.some((s) => s.nodeId === 'z'));
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'z', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
});
