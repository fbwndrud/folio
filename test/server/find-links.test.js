import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture } from '../support/fixtures.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => (out.ok ? 'ok' : out.error.code);
const pair = (link) => `${link.from}>${link.to}`;

test('folio_find query enum ends with links (N4), and the description says links takes the same id rule', () => {
  const find = TOOLS.find((t) => t.name === 'folio_find');
  assert.equal(find.inputSchema.properties.query.enum.at(-1), 'links');
  assert.deepEqual(find.inputSchema.required, ['root', 'query', 'id']);
  assert.match(find.description, /links accept a section id \(including descendants\) or \* for the whole work\. links lists outgoing links, backlinks and broken links\./);
});

test('folio_find links: "*" gives the whole table, a node id one branch with the links coming into it, NODE_NOT_FOUND otherwise', async () => {
  const tools = await box();
  const root = await copyFixture('reference-book');
  const all = ok(await tools.call('folio_find', { root, query: 'links', id: '*' }));
  assert.equal(all.scope, '*');
  assert.deepEqual(all.links.map(pair), ['cell>membrane', 'membrane>cell', 'membrane>ghost-entry', 'nucleus>nucleus', 'atp-entry>mitochondria', 'atp-entry>membrane']);
  assert.deepEqual(all.problems.map((p) => [p.code, p.nodeId, p.to]), [['LINK_BROKEN', 'membrane', 'ghost-entry'], ['LINK_SELF', 'nucleus', 'nucleus']]);
  const one = ok(await tools.call('folio_find', { root, query: 'links', id: 'membrane' }));
  assert.deepEqual([one.scope, one.links.map(pair), one.backlinks.map(pair)], ['membrane', ['membrane>cell', 'membrane>ghost-entry'], ['cell>membrane', 'atp-entry>membrane']]);
  for (const id of ['nowhere', '**', '__proto__', 'ghost-entry']) assert.equal(code(await tools.call('folio_find', { root, query: 'links', id })), 'NODE_NOT_FOUND', id);
  await assert.rejects(stat(join(root, '.folio')), { code: 'ENOENT' });
});

test('folio_find links is FEATURE_DISABLED when links is off, before the id is looked at; the other queries still answer', async () => {
  const tools = await box();
  const root = await copyFixture('reference-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, `${await readFile(path, 'utf8')}features:\n  links: false\n`);
  for (const id of ['*', 'nowhere']) {
    const refused = await tools.call('folio_find', { root, query: 'links', id });
    assert.deepEqual([refused.error.code, refused.error.details.feature], ['FEATURE_DISABLED', 'links'], id);
  }
  assert.equal(ok(await tools.call('folio_find', { root, query: 'node', id: 'cell' })).node.id, 'cell');
  assert.equal(ok(await tools.call('folio_status', { root })).links, null);
});
