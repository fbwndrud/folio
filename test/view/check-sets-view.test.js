import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewCheckSets } from '../../core/view/check-sets-view.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

test('check sets: every set with the chosen ones, recommendations, and the checks that run with locks marked', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root, { checks: { 'fake.critic': { mode: 'off' } } });
  const view = await viewCheckSets(root, { packs: fakePacks() });
  assert.equal(view.chosenBy, 'work.yaml');
  assert.deepEqual(view.sets.filter((s) => s.selected).map((s) => s.id), ['fake.basic']);
  assert.ok(view.recommended.some((r) => r.setId === 'fake.basic' && r.reasons.some((x) => x.kind === 'default')));
  const lock = view.checks.find((c) => c.id === 'core.promise-order');
  assert.deepEqual([lock.locked, lock.severity, lock.sets], [true, 'hard', []]);
  assert.equal(view.checks.some((c) => c.id === 'fake.critic'), false);
  assert.deepEqual(view.checks.find((c) => c.id === 'fake.dead-on-stage').sets, ['fake.basic']);
});
