import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canToggle, toggleRequest } from '../src/lib/stages.js';

const critic = { id: 'critic', locked: false, modes: ['on', 'off'] };
const commit = { id: 'commit', locked: true, modes: [] };

test('the screen never offers a toggle for a locked step, nor when toggles are off', () => {
  assert.equal(canToggle(critic, true), true);
  assert.equal(canToggle(critic, false), false);
  assert.equal(canToggle(commit, true), false);
  assert.equal(canToggle({ ...commit, modes: ['on', 'off'] }, true), false);
});

test('a toggle request carries the digest the screen read, and refuses locked steps and unknown modes', () => {
  const stages = { digest: 'sha256:abc' };
  assert.deepEqual(toggleRequest(stages, 'episode', critic, 'off', '속도'), { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: 'sha256:abc', reason: '속도' });
  assert.deepEqual(toggleRequest(stages, 'episode', critic, 'on'), { level: 'episode', stepId: 'critic', mode: 'on', baseDigest: 'sha256:abc' });
  assert.throws(() => toggleRequest(stages, 'episode', commit, 'off'), /locked/);
  assert.throws(() => toggleRequest(stages, 'episode', critic, 'auto'), /does not take/);
});
