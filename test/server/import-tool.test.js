import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { mkdir, realpath, symlink } from 'node:fs/promises';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { importTarget, VIBELORE_FIXTURE } from '../support/import-source.js';
import { tempDir } from '../support/fixtures.js';

const packs = await loadBuiltinPacks();
const code = (out) => out.error?.code;

test('folio_import_vibelore imports through the toolbox and validates input', async () => {
  const tools = createToolbox({ packs });
  const root = await importTarget();
  const out = await tools.call('folio_import_vibelore', { root, from: VIBELORE_FIXTURE, title: '등대' });
  assert.equal(out.ok, true, JSON.stringify(out.error));
  assert.deepEqual([out.result.status, out.result.imported.episodes], ['imported', 4]);
  assert.equal((await tools.call('folio_status', { root: out.result.root })).result.next, null);
  assert.equal(code(await tools.call('folio_import_vibelore', { root, from: VIBELORE_FIXTURE })), 'IMPORT_ROOT_EXISTS');
  assert.equal(code(await tools.call('folio_import_vibelore', { root: await importTarget(), from: 'relative/source' })), 'IMPORT_FROM_INVALID');
  assert.equal(code(await tools.call('folio_import_vibelore', { root: await importTarget(), from: VIBELORE_FIXTURE, extra: 1 })), 'TOOL_INPUT_INVALID');
});

test('folio_import_vibelore returns the canonical root chosen for publication', async () => {
  const tools = createToolbox({ packs });
  const sandbox = await tempDir('folio-import-tool-');
  const parent = join(sandbox, 'parent');
  const alias = join(sandbox, 'alias');
  await mkdir(parent);
  await symlink(parent, alias);
  const out = await tools.call('folio_import_vibelore', { root: join(alias, 'work'), from: VIBELORE_FIXTURE });
  assert.equal(out.ok, true, JSON.stringify(out.error));
  assert.equal(out.result.root, join(await realpath(parent), 'work'));
  assert.equal((await tools.call('folio_status', { root: out.result.root })).result.next, null);
  assert.equal(dirname(out.result.root), await realpath(parent));
});
