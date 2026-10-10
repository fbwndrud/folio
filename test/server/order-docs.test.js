import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { linkTable } from '../../core/links/graph.js';
import { openWork } from '../../core/store/work.js';
import { fixturePath } from '../support/fixtures.js';

test('references/order.md names every link problem code, the links query, both toggles and the unordered set; SKILL.md and knowledge.md point at it', async () => {
  const text = await readFile(join('skill', 'folio', 'references', 'order.md'), 'utf8');
  const codes = new Set(linkTable(await openWork(fixturePath('reference-book'))).problems.map((p) => p.code));
  assert.deepEqual([...codes], ['LINK_BROKEN', 'LINK_SELF']);
  for (const code of codes) assert.match(text, new RegExp(`\`${code}\``), code);
  for (const word of ["query: 'links'", '`backlinks`', '`linkScope`', '`linkedEvents`', '`not_applicable`', '`knowledge.unordered`', '`knowledge.links`',
    '`knowledge.linked-consistency`', '`requiresOrder: none`', "preset: 'reference'", '`core.promise-order`']) assert.ok(text.includes(word), word);
  assert.match(await readFile(join('skill', 'folio', 'SKILL.md'), 'utf8'), /\[references\/order\.md\]\(references\/order\.md\)/);
  const knowledge = await readFile(join('skill', 'folio', 'references', 'knowledge.md'), 'utf8');
  for (const word of ['`reference`', '`knowledge.unordered`', '[order.md](order.md)']) assert.ok(knowledge.includes(word), word);
});
