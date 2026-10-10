import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as query from '../../core/index/query.js';
import { indexPath } from '../../core/index/rebuild.js';
import { blockCatalog } from '../../core/blocks/catalog.js';
import { bibliography } from '../../core/blocks/bibliography.js';
import { termIndex } from '../../core/blocks/term-index.js';
import { BLOCK_KINDS, parseNodeMarks } from '../../core/blocks/syntax.js';
import { openWork } from '../../core/store/work.js';
import { workStatus } from '../../core/status.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';

/** blocks-book 복사본의 work.yaml features 를 바꾼다(작가가 하는 일). */
async function withFeatures(features) {
  const root = await copyFixture('blocks-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
  return root;
}

test('N3 contract: core/index/query.js exports the M6b query functions under fixed names, and they need no index.db', async () => {
  assert.equal(query.blockCatalog, blockCatalog);
  assert.equal(query.bibliography, bibliography);
  assert.equal(query.termIndex, termIndex);
  assert.equal(query.parseNodeMarks, parseNodeMarks);
  assert.equal(query.BLOCK_KINDS, BLOCK_KINDS);
  const root = await copyFixture('blocks-book');
  const work = await openWork(root);
  assert.equal(query.blockCatalog(work).blocks.length, 9);
  assert.equal(query.bibliography(work).entries.length, 2);
  assert.equal(query.termIndex(work).entries.length, 4);
  await assert.rejects(stat(indexPath(root)), { code: 'ENOENT' });
});

test('folio_status reports block problems and the block count; blocks: false gives null and the other parts stay', async () => {
  const packs = await loadBuiltinPacks();
  const on = await workStatus(await copyFixture('blocks-book'), { packs });
  assert.equal(on.blocks.total, 9);
  assert.deepEqual(on.blocks.problems.map((p) => [p.code, p.nodeId]), [
    ['FOOTNOTE_UNDEFINED', 'membrane-section'], ['FOOTNOTE_DUPLICATE', 'membrane-section'], ['FOOTNOTE_UNUSED', 'membrane-section'],
    ['BLOCK_REF_BROKEN', 'atp-section'], ['SOURCE_CITATION_BROKEN', 'atp-section'], ['BLOCK_DUPLICATE', 'tissue'],
  ]);
  const off = await workStatus(await withFeatures({ blocks: false }), { packs });
  assert.equal(off.blocks, null);
  assert.deepEqual([off.next, off.evidence], [on.next, on.evidence]);
});
