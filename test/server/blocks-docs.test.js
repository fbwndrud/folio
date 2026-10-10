import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { blockCatalog } from '../../core/blocks/catalog.js';
import { openWork } from '../../core/store/work.js';
import { fixturePath } from '../support/fixtures.js';

test('references/blocks.md names every block problem code, the three folio_find queries and the three toggles', async () => {
  const text = await readFile(join('skill', 'folio', 'references', 'blocks.md'), 'utf8');
  const codes = new Set(blockCatalog(await openWork(fixturePath('blocks-book'))).problems.map((p) => p.code));
  assert.equal(codes.size, 6);
  for (const code of codes) assert.match(text, new RegExp(`\`${code}\``), code);
  for (const word of ['`blocks`', '`bibliography`', '`terms`', '`termIndex`', '`knowledge.references`', '`knowledge.cross-refs`']) assert.ok(text.includes(word), word);
  assert.match(await readFile(join('skill', 'folio', 'SKILL.md'), 'utf8'), /\[references\/blocks\.md\]\(references\/blocks\.md\)/);
});
