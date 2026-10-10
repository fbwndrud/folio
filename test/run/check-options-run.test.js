import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { copyFixture, seedEvents, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

async function setup({ fixture = 'novel-3level', seed = false, checks, overrides } = {}) {
  const root = await copyFixture(fixture);
  if (seed) await seedEvents(root, fixture);
  await useFakePack(root, { checks, overrides });
  return { root, makeRunner: () => createRunner({ root, packs: fakePacks() }) };
}
const untilDone = (o) => o.status === 'done';
const untilUser = (o) => o.status === 'needs_user';
const records = async (root) => openLedger(root, 'receipts').readAll();
const commitsOf = async (root) => (await records(root)).filter((r) => r.type === 'commit');
const receiptsOf = async (root) => (await records(root)).filter((r) => r.type === 'receipt');

test('a hard check the user switched off does not run, while a running hard finding still blocks and cannot be approved', async () => {
  const off = await setup({ fixture: 'serial-2level', seed: true, overrides: { approve: { mode: 'auto' } }, checks: { 'fake.dead-on-stage': { mode: 'off' } } });
  const trail = await driveToEnd(off.makeRunner, createFakeHost(), { start: { node: 'ep-004' }, until: untilDone });
  assert.equal(trail.at(-1).status, 'done');
  const [receipt] = await receiptsOf(off.root);
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.ok(!facts.checks.some((c) => c.checkId === 'fake.dead-on-stage'));
  const on = await setup({ fixture: 'serial-2level', seed: true, overrides: { approve: { mode: 'auto' } } });
  const blocked = await driveToEnd(on.makeRunner, createFakeHost(), { start: { node: 'ep-004' }, until: untilUser });
  assert.deepEqual([blocked.at(-1).question.canApprove, blocked.at(-1).question.blocking.map((f) => f.code)], [false, ['DEAD_ON_STAGE']]);
  await assert.rejects(on.makeRunner().decide({ runId: blocked.at(-1).runId, action: 'approve', reason: 'x' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  assert.deepEqual(await commitsOf(on.root), []);
});
