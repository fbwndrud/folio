import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, colorFor, colorKey, loadColors, saveColors } from '../src/lib/colors.js';

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};

test('kinds get palette colors in order unless the author chose one', () => {
  const kinds = ['character', 'location', 'promise'];
  assert.equal(colorFor('location', kinds, {}), PALETTE[1]);
  assert.equal(colorFor('location', kinds, { location: '#112233' }), '#112233');
  assert.equal(colorFor('location', kinds, { location: 'red' }), PALETTE[1]);
  assert.equal(colorFor('unknown', kinds, {}), PALETTE[0]);
});

test('chosen colors are kept per work title in the browser, and bad values are dropped', () => {
  const storage = memory();
  saveColors(storage, colorKey('잠긴 문'), { character: '#aabbcc' });
  assert.deepEqual(loadColors(storage, colorKey('잠긴 문')), { character: '#aabbcc' });
  assert.deepEqual(loadColors(storage, colorKey('다른 작품')), {});
  storage.setItem('bad', '{"a":"#12","b":3,"c":"#abcdef"}');
  assert.deepEqual(loadColors(storage, 'bad'), { c: '#abcdef' });
  storage.setItem('broken', '{');
  assert.deepEqual(loadColors(storage, 'broken'), {});
  assert.deepEqual(loadColors(null, 'x'), {});
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadColors(denied, 'x'), {});
  assert.doesNotThrow(() => saveColors(denied, 'x', {}));
});
