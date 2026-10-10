import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryImages } from '../src/lib/reader-images.js';

test('mixed reading does not repeat an inline image but keeps attachment-only images', () => {
  const cover = { id: 'synthetic-cover' }, chart = { id: 'synthetic-chart' };
  const assets = { inline: [cover], attached: [cover, chart, chart] };
  assert.deepEqual(galleryImages(assets, 'mixed'), [chart]);
  assert.deepEqual(galleryImages(assets, 'pictures'), [cover, chart]);
  assert.deepEqual(galleryImages(assets, 'text'), []);
});

test('attachment-only reading and missing images preserve their references', () => {
  const missing = { id: 'synthetic-missing', hasFile: false };
  assert.deepEqual(galleryImages({ inline: [], attached: [missing] }, 'mixed'), [missing]);
  assert.deepEqual(galleryImages({ inline: [], attached: [] }, 'pictures'), []);
});
