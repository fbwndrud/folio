import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => (out.ok ? 'ok' : out.error.code);
const LINK = { quote: '세포막은 [[block:fig-cell]]의 바깥 경계다', sources: [{ sourceId: 'membrane-notes', quote: '세포막은 물질의 출입을 고른다.' }] };

async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
}

test('folio_find query enum has blocks, bibliography and terms appended after rename (then links, N4)', () => {
  const find = TOOLS.find((t) => t.name === 'folio_find');
  assert.deepEqual(find.inputSchema.properties.query.enum, ['node', 'entity', 'usages', 'events', 'candidates', 'rename', 'blocks', 'bibliography', 'terms', 'links']);
  assert.deepEqual(find.inputSchema.required, ['root', 'query', 'id']);
  assert.match(find.description, /blocks \(figure numbers, footnotes, citations and issues\), bibliography \(cited sources\), terms \(index\)/);
});

test('folio_find blocks: the whole work with "*", one branch with a node id, NODE_NOT_FOUND otherwise', async () => {
  const tools = await box();
  const root = await copyFixture('blocks-book');
  const all = ok(await tools.call('folio_find', { root, query: 'blocks', id: '*' }));
  assert.equal(all.scope, '*');
  assert.deepEqual(all.blocks.map((b) => b.label).filter(Boolean), ['그림 1', '그림 1.1', '표 1.1', '그림 1.2', '식 1.1', '그림 2.1', '그림 3.1', '표 1']);
  assert.deepEqual(all.problems.map((p) => p.code), ['FOOTNOTE_UNDEFINED', 'FOOTNOTE_DUPLICATE', 'FOOTNOTE_UNUSED', 'BLOCK_REF_BROKEN', 'SOURCE_CITATION_BROKEN', 'BLOCK_DUPLICATE']);
  const chapter = ok(await tools.call('folio_find', { root, query: 'blocks', id: 'chapter-cell' }));
  assert.deepEqual([chapter.scope, chapter.blocks.map((b) => b.id), chapter.footnotes.map((f) => `${f.nodeId}:${f.id}:${f.number}`)],
    ['chapter-cell', ['fig-cell', 'tbl-size', 'fig-membrane', 'eq-energy'], ['cell-section:def:1', 'membrane-section:size:1']]);
  for (const id of ['nowhere', '**', '__proto__']) assert.equal(code(await tools.call('folio_find', { root, query: 'blocks', id })), 'NODE_NOT_FOUND', id);
});

test('folio_find bibliography reads the evidence ledger under the work lock; evidence off or a broken ledger answer from citations only', async () => {
  const tools = await box();
  const root = await copyFixture('blocks-book');
  ok(await tools.call('folio_sources', { root, op: 'link', nodeId: 'membrane-section', claims: [LINK] }));
  const linked = ok(await tools.call('folio_find', { root, query: 'bibliography', id: '*' }));
  assert.deepEqual([linked.entries.map((e) => `${e.number}:${e.sourceId}`), linked.evidence, linked.ledger], [['1:cell-notes', '2:membrane-notes', '3:energy-review'], true, { ok: true }]);
  assert.deepEqual(ok(await tools.call('folio_find', { root, query: 'bibliography', id: 'part-one' })).entries.map((e) => e.sourceId), ['cell-notes', 'membrane-notes', 'energy-review']);
  assert.deepEqual(ok(await tools.call('folio_find', { root, query: 'bibliography', id: 'tissue' })).entries, []);
  await setFeatures(root, { evidence: false });
  const off = ok(await tools.call('folio_find', { root, query: 'bibliography', id: '*' }));
  assert.deepEqual([off.entries.map((e) => e.sourceId), off.evidence, off.ledger], [['cell-notes', 'energy-review'], false, null]);
  await setFeatures(root, {});
  await writeFile(join(root, '.folio', 'ledger', 'evidence.jsonl'), `${JSON.stringify({ type: 'evidence', seq: 1, prev: 'genesis', hash: 'x' })}\n`);
  const broken = ok(await tools.call('folio_find', { root, query: 'bibliography', id: '*' }));
  assert.deepEqual([broken.entries.map((e) => e.sourceId), broken.evidence, broken.ledger.ok], [['cell-notes', 'energy-review'], false, false]);
});

test('folio_find terms gives the index with recorded occurrences; a branch id narrows it', async () => {
  const tools = await box();
  const root = await copyFixture('blocks-book');
  ok(await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'cell', kind: 'mention', quote: '에너지 화폐' }] }));
  const all = ok(await tools.call('folio_find', { root, query: 'terms', id: '*' }));
  assert.deepEqual([all.scope, all.ledger, all.entries.map((e) => e.entityId)], ['*', { ok: true }, ['atp', 'cell', 'membrane', 'nucleus']]);
  assert.deepEqual(all.entries.find((e) => e.entityId === 'cell').locations.map((l) => [l.nodeId, l.count, l.marks]), [['cell-section', 4, 0], ['atp-section', 0, 1], ['tissue', 1, 0]]);
  assert.deepEqual(ok(await tools.call('folio_find', { root, query: 'terms', id: 'part-two' })).entries.map((e) => e.entityId), ['cell', 'membrane', 'nucleus']);
  await setFeatures(root, { occurrences: false });
  const off = ok(await tools.call('folio_find', { root, query: 'terms', id: '*' }));
  assert.deepEqual([off.ledger, off.entries.find((e) => e.entityId === 'cell').locations.map((l) => l.nodeId)], [null, ['cell-section', 'tissue']]);
});

test('each query is FEATURE_DISABLED when its toggle is off; the others keep answering', async () => {
  const tools = await box();
  const root = await copyFixture('blocks-book');
  for (const [feature, query] of [['blocks', 'blocks'], ['bibliography', 'bibliography'], ['termIndex', 'terms']]) {
    await setFeatures(root, { [feature]: false });
    const refused = await tools.call('folio_find', { root, query, id: '*' });
    assert.deepEqual([code(refused), refused.error.details.feature], ['FEATURE_DISABLED', feature]);
    for (const other of ['blocks', 'bibliography', 'terms'].filter((q) => q !== query)) ok(await tools.call('folio_find', { root, query: other, id: '*' }));
  }
});
