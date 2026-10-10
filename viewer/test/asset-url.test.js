import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDataUrl } from '../src/lib/asset-url.js';

test('SVG images use an opaque-origin data URL; raster images keep blob URLs', () => {
  assert.equal(useDataUrl('image/svg+xml'), true);
  assert.equal(useDataUrl('image/svg+xml;charset=utf-8'), true);
  assert.equal(useDataUrl('image/png'), false);
  assert.equal(useDataUrl('image/webp'), false);
});
