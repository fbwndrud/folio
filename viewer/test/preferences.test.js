import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, normalizePreferences, readPreferences, savePreferences } from '../src/lib/preferences.js';

test('reading settings are bounded and unexpected options discarded', () => {
  assert.deepEqual(normalizePreferences({ size: 1000, leading: -8, width: Infinity, font: 'injected', theme: 'invalid' }), { size: 24, leading: 1.6, width: 64, font: 'serif', theme: 'system' });
  assert.deepEqual(normalizePreferences({ size: '22' }), DEFAULT_PREFERENCES);
});

test('missing, blocked or malformed storage does not prevent reading', () => {
  assert.deepEqual(readPreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(readPreferences({ getItem: () => '{broken' }), DEFAULT_PREFERENCES);
  assert.deepEqual(readPreferences({ getItem: () => { throw Error('blocked'); } }), DEFAULT_PREFERENCES);
  assert.doesNotThrow(() => savePreferences({ setItem: () => { throw Error('quota'); } }, {}));
});

test('preferences survive a round trip without persisting manuscript text', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  savePreferences(storage, { size: 22, leading: 2, width: 48, font: 'sans', theme: 'dark', manuscript: 'must not persist' });
  assert.deepEqual(readPreferences(storage), { size: 22, leading: 2, width: 48, font: 'sans', theme: 'dark' });
  assert.equal([...values.values()][0].includes('must not persist'), false);
});
