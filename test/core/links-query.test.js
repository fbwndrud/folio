import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as query from '../../core/index/query.js';
import { indexPath } from '../../core/index/rebuild.js';
import { linkTable, linksFrom, linksTo } from '../../core/links/graph.js';
import { openWork } from '../../core/store/work.js';
import { workStatus } from '../../core/status.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';

/** reference-book 복사본의 work.yaml features 를 바꾼다(작가가 하는 일). */
async function withFeatures(features) {
  const root = await copyFixture('reference-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
  return root;
}

test('N4 contract: core/index/query.js exports the link queries under fixed names, and they need no index.db', async () => {
  assert.equal(query.linkTable, linkTable);
  assert.equal(query.linksFrom, linksFrom);
  assert.equal(query.linksTo, linksTo);
  const root = await withFeatures({});
  const work = await openWork(root);
  assert.equal(query.linkTable(work).links.length, 6);
  assert.deepEqual(query.linksFrom(work, 'cell').map((l) => l.to), ['membrane']);
  assert.deepEqual(query.linksTo(work, 'cell').map((l) => l.from), ['membrane']);
  await assert.rejects(stat(indexPath(root)), { code: 'ENOENT' });
});

test('folio_status links lists broken and self links with the link count; turning links off makes it null and leaves the rest', async () => {
  const packs = await loadBuiltinPacks();
  const on = await workStatus(await withFeatures({}), { packs });
  assert.deepEqual(on.links, {
    problems: [
      { code: 'LINK_BROKEN', nodeId: 'membrane', to: 'ghost-entry', kind: 'see-also', index: 1 },
      { code: 'LINK_SELF', nodeId: 'nucleus', to: 'nucleus', kind: 'see-also', index: 0 },
    ],
    total: 6,
  });
  const off = await workStatus(await withFeatures({ links: false }), { packs });
  assert.equal(off.links, null);
  const { links: _on, ...restOn } = on;
  const { links: _off, ...restOff } = off;
  assert.deepEqual(restOff, restOn);
});
