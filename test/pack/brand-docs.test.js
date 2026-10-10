import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { BRAND_PACK_DIR } from '../../packs/brand/index.js';

const REFERENCE = join(import.meta.dirname, '..', '..', 'skill', 'folio', 'references', 'brand.md');

test('the brand reference and README name every brand check and set, and the reference lists the default banned and allowed phrases', async () => {
  const pack = (await loadBuiltinPacks()).get('brand');
  const reference = await readFile(REFERENCE, 'utf8');
  const readme = await readFile(join(BRAND_PACK_DIR, 'README.md'), 'utf8');
  for (const id of [...pack.checks.map((c) => c.id), ...Object.keys(pack.checkSets)]) {
    assert.ok(reference.includes(`\`${id}\``), `brand.md: ${id}`);
    assert.ok(readme.includes(`\`${id}\``), `README.md: ${id}`);
  }
  const { words, allow } = pack.checks.find((c) => c.id === 'brand.banned-phrases').config;
  for (const phrase of [...words, ...allow]) assert.ok(reference.includes(`\`${phrase}\``), `brand.md phrase: ${phrase}`);
});
