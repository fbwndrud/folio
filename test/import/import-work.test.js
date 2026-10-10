import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { importVibelore } from '../../core/import/import-work.js';
import { lastImports } from '../../core/import/records.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { lastCommits } from '../../core/ledger/receipts.js';
import { doneNodes } from '../../core/run/done.js';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { workStatus } from '../../core/status.js';
import { viewNodeReceipts, viewReceiptList } from '../../core/view/receipt-view.js';
import { sha256 } from '../../core/util/hash.js';
import { parseYaml } from '../../core/util/yaml.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { tempDir } from '../support/fixtures.js';
import { importTarget, treeHashes, VIBELORE_FIXTURE, vibeloreCopy } from '../support/import-source.js';

const packs = await loadBuiltinPacks();
const code = (promise) => promise.then(() => 'ok', (e) => e.code);
const ids = () => { let n = 0; return (prefix) => `${prefix}-${++n}`; };

test('importVibelore makes a new work: imported nodes, entities, webtoon pictures, and import records that are not receipts', async () => {
  const before = await treeHashes(VIBELORE_FIXTURE);
  const root = await importTarget();
  const out = await importVibelore(root, { from: VIBELORE_FIXTURE, title: '등대', packs, newId: ids(), now: () => '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(out, { root: join(await fs.realpath(dirname(root)), 'work'), importId: 'import-1', status: 'imported', imported: { arcs: 2, episodes: 4, entities: 3, assets: 2 }, warnings: [out.warnings[0]] });
  assert.equal(out.warnings[0].code, 'IMPORT_PICTURES_MULTIPLE');
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before, 'the source is only read');
  const { work } = await openWorkspace(root, { packs });
  assert.deepEqual([work.config.title, work.config.packs], ['등대', ['novel', 'image']]);
  assert.deepEqual([...work.tree.nodes.values()].map((n) => [n.id, n.status, n.path]), [
    ['arc-2', 'imported', '01-arc-2/_node.md'], ['ep-001', 'imported', '01-arc-2/01-ep-001.md'], ['ep-002', 'imported', '01-arc-2/02-ep-002.md'],
    ['ep-003', 'imported', '01-arc-2/03-ep-003.md'], ['arc-imported', 'imported', '02-arc-imported/_node.md'], ['ep-004', 'imported', '02-arc-imported/01-ep-004.md'],
  ]);
  assert.deepEqual(work.tree.nodes.get('ep-001').assets, ['ep-001-webtoon', 'ep-001-webtoon-2']);
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-webtoon.svg')), await readFile(join(VIBELORE_FIXTURE, 'webtoon', 'episodes', '1-wt-aaaa1111', 'episode.svg')));
  assert.deepEqual(parseYaml(await readFile(join(root, 'assets', 'ep-001-webtoon.yaml'), 'utf8')).imported.path, 'webtoon/episodes/1-wt-aaaa1111/episode.svg');
  assert.deepEqual([...work.entities.keys()], ['c1', 'c2', 'setting']);
  const records = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(records.map((r) => [r.type, r.nodeId, r.status]), [...work.tree.nodes.keys()].map((id) => ['import', id, 'imported']));
  const ep1 = records.find((r) => r.nodeId === 'ep-001');
  assert.equal(ep1.importedHash, sha256(work.tree.nodes.get('ep-001').body));
  assert.deepEqual(ep1.origin.receipts.map((r) => r.path), ['.vibelore/check-receipts/check-0001aaaa.json']);
  assert.ok(!JSON.stringify(records).match(/verdict|passed|failed/), 'no vibelore verdict is carried over');
  assert.equal(lastCommits(records).size, 0, 'an import record is never a commit');
  assert.deepEqual([...doneNodes(work, records)].sort(), [...work.tree.nodes.keys()].sort());
  const status = await workStatus(root, { packs });
  assert.deepEqual([status.next, status.drift], [null, []]);
  const list = await viewReceiptList(root, { packs });
  assert.deepEqual(list.nodes.map((n) => [n.nodeId, n.committed, n.receiptId, n.imported?.status]), [...work.tree.nodes.keys()].map((id) => [id, false, null, 'imported']));
  const one = await viewNodeReceipts(root, { packs }, 'ep-002');
  assert.deepEqual([one.receipt, one.imported.status, one.imported.path, one.imported.origin.receipts.length], [null, 'imported', 'chapters/002.md', 1]);
});

test('importVibelore refuses an existing root, a root inside the source, a missing parent, and leaves nothing behind', async () => {
  const exists = await tempDir('folio-import-exists-');
  assert.equal(await code(importVibelore(exists, { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_EXISTS');
  const source = await vibeloreCopy();
  const before = await treeHashes(source);
  assert.equal(await code(importVibelore(join(source, 'folio'), { from: source, packs })), 'IMPORT_ROOT_INSIDE_SOURCE');
  assert.equal(await code(importVibelore(join(source, 'chapters', 'x'), { from: source, packs })), 'IMPORT_ROOT_INSIDE_SOURCE');
  assert.deepEqual(await treeHashes(source), before, 'nothing was written into the source');
  assert.equal(await code(importVibelore(join(await tempDir(), 'a', 'b'), { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_INVALID');
  assert.equal(await code(importVibelore('relative/work', { from: VIBELORE_FIXTURE, packs })), 'ROOT_NOT_ABSOLUTE');
  const root = await importTarget();
  assert.equal(await code(importVibelore(root, { from: VIBELORE_FIXTURE, packs: new Map() })), 'PACK_UNKNOWN');
  assert.deepEqual(await readdir(dirname(root)), [], 'a failed import removes its temporary folder and makes no root');
});

test('an imported node is checked by Folio only through recommit: the receipt then follows the normal locks', async () => {
  const root = await importTarget();
  await importVibelore(root, { from: VIBELORE_FIXTURE, packs, newId: ids() });
  const host = createFakeHost();
  const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.ok(!host.calls.some((c) => c.payload.produces === 'draft'), 'the imported text is the draft; it is never rewritten');
  const records = await openLedger(root, 'receipts').readAll();
  assert.equal(lastCommits(records).get('ep-001').committedHash, lastImports(records).get('ep-001').importedHash);
  const one = await viewNodeReceipts(root, { packs }, 'ep-001');
  assert.deepEqual([typeof one.receipt.receiptId, one.imported.status], ['string', 'imported']);
  const { work } = await openWorkspace(root, { packs });
  assert.equal(work.tree.nodes.get('ep-001').status, 'committed');
  await writeFile(join(root, 'tree', '01-arc-2', '02-ep-002.md'), (await readFile(join(root, 'tree', '01-arc-2', '02-ep-002.md'), 'utf8')).replace('status: imported', 'status: committed'));
  const status = await workStatus(root, { packs });
  assert.deepEqual(status.drift.map((d) => [d.nodeId, d.code]), [['ep-002', 'COMMITTED_WITHOUT_RECORD']], 'a hand-made "committed" is not a commit');
});

test('only main import records can finish an imported node or appear in its receipt view', async () => {
  const root = await importTarget();
  await importVibelore(root, { from: VIBELORE_FIXTURE, packs, newId: ids() });
  const ledger = openLedger(root, 'receipts');
  await ledger.append({ type: 'import', variant: 'en', importId: 'foreign', nodeId: 'ep-001', status: 'imported', importedHash: sha256('foreign'), origin: { from: 'foreign', path: 'elsewhere' } });
  const records = await ledger.readAll();
  assert.equal(lastImports(records).get('ep-001').importId, 'import-1');
  const { work } = await openWorkspace(root, { packs });
  assert.equal(doneNodes(work, records).has('ep-001'), true);
  const list = await viewReceiptList(root, { packs });
  const entry = list.nodes.find((node) => node.nodeId === 'ep-001');
  assert.deepEqual([entry.imported.importId, entry.committed, entry.receiptId], ['import-1', false, null]);
  const one = await viewNodeReceipts(root, { packs }, 'ep-001');
  assert.deepEqual([one.imported.importId, one.receipt, one.commits], ['import-1', null, []]);
});

test('an import record cannot stand in for a commit or receipt after a status edit', async () => {
  const root = await importTarget();
  await importVibelore(root, { from: VIBELORE_FIXTURE, packs });
  const path = join(root, 'tree', '01-arc-2', '01-ep-001.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('status: imported', 'status: committed'));
  const records = await openLedger(root, 'receipts').readAll();
  const { work } = await openWorkspace(root, { packs });
  assert.equal(lastCommits(records).has('ep-001'), false);
  assert.equal(doneNodes(work, records).has('ep-001'), false);
  const list = await viewReceiptList(root, { packs });
  const entry = list.nodes.find((node) => node.nodeId === 'ep-001');
  assert.deepEqual([entry.committed, entry.receiptId, entry.imported.status, entry.drift], [false, null, 'imported', 'COMMITTED_WITHOUT_RECORD']);
});

test('an existing symlink target is refused and a symlink parent into the source is never written', async () => {
  const parent = await tempDir();
  const existing = join(parent, 'existing');
  await symlink(VIBELORE_FIXTURE, existing);
  assert.equal(await code(importVibelore(existing, { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_EXISTS');
  const alias = join(parent, 'source-alias');
  await symlink(VIBELORE_FIXTURE, alias);
  const before = await treeHashes(VIBELORE_FIXTURE);
  assert.equal(await code(importVibelore(join(alias, 'new-work'), { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_INSIDE_SOURCE');
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before);
});

test('a two-dot prefix is still a child of the source and cannot receive the new work', async () => {
  const source = await vibeloreCopy();
  const before = await treeHashes(source);
  assert.equal(await code(importVibelore(join(source, '..-imported'), { from: source, packs })), 'IMPORT_ROOT_INSIDE_SOURCE');
  assert.deepEqual(await treeHashes(source), before);
});

test('retargeting a lexical parent alias after validation never writes into the source', async () => {
  const source = await vibeloreCopy();
  const outside = await tempDir();
  const aliasBase = await tempDir();
  const alias = join(aliasBase, 'alias');
  await symlink(outside, alias);
  const before = await treeHashes(source);
  let swapped = false;
  const wrapped = { ...fs, async mkdir(path, options) {
    if (!swapped && String(path).includes('.import-')) {
      swapped = true;
      await fs.unlink(alias);
      await symlink(source, alias);
    }
    return fs.mkdir(path, options);
  } };
  const result = await importVibelore(join(alias, 'work'), { from: source, packs, fs: wrapped });
  assert.equal(swapped, true);
  assert.equal(result.root, join(await fs.realpath(outside), 'work'));
  assert.deepEqual(await treeHashes(source), before);
});

test('a final external empty root wins the reservation and staged temp is removed', async () => {
  const root = await importTarget();
  const target = join(await fs.realpath(dirname(root)), 'work');
  let external;
  const wrapped = { ...fs, async mkdir(path, options) {
    if (path === target && !external) { await fs.mkdir(target); external = await fs.lstat(target); }
    return fs.mkdir(path, options);
  } };
  assert.equal(await code(importVibelore(root, { from: VIBELORE_FIXTURE, packs, fs: wrapped })), 'IMPORT_ROOT_EXISTS');
  assert.equal((await fs.lstat(target)).ino, external.ino);
  assert.deepEqual(await fs.readdir(dirname(root)), ['work']);
});

test('two full imports to one root leave exactly one complete work', async () => {
  const root = await importTarget();
  const results = await Promise.allSettled([
    importVibelore(root, { from: VIBELORE_FIXTURE, packs }),
    importVibelore(root, { from: VIBELORE_FIXTURE, packs }),
  ]);
  assert.deepEqual(results.map((r) => r.status === 'fulfilled' ? 'ok' : r.reason.code).sort(), ['IMPORT_ROOT_EXISTS', 'ok']);
  assert.equal((await openWorkspace(root, { packs })).work.tree.nodes.size, 6);
  assert.deepEqual(await fs.readdir(dirname(root)), ['work']);
});

test('failed removal of completed staging reports a warning and keeps the published work', async () => {
  const root = await importTarget();
  const wrapped = { ...fs, async rm(path, options) {
    if (String(path).includes('.import-')) throw Object.assign(new Error('synthetic cleanup failure'), { code: 'EACCES' });
    return fs.rm(path, options);
  } };
  const result = await importVibelore(root, { from: VIBELORE_FIXTURE, packs, fs: wrapped });
  const warning = result.warnings.find((w) => w.code === 'IMPORT_TEMP_CLEANUP_PENDING');
  assert.ok(warning?.path.includes('.import-'));
  assert.equal((await openWorkspace(root, { packs })).work.tree.nodes.size, 6);
  assert.equal(await code(importVibelore(root, { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_EXISTS');
  await fs.rm(warning.path, { recursive: true, force: true });
});

test('cleanup path remains visible when mapping warnings fill the response cap', async () => {
  const source = await vibeloreCopy();
  await writeFile(join(source, '.vibelore', 'arcs', '2.json'), JSON.stringify({
    title: '합성 아크', episodes: Array.from({ length: 205 }, () => ({ chapter: 1 })),
  }));
  const root = await importTarget();
  const wrapped = { ...fs, async rm(path, options) {
    if (String(path).includes('.import-')) throw Object.assign(new Error('synthetic cleanup failure'), { code: 'EACCES' });
    return fs.rm(path, options);
  } };
  const result = await importVibelore(root, { from: source, packs, fs: wrapped });
  assert.equal(result.warnings.length, 200);
  assert.ok(result.warnings.some((warning) => warning.code === 'IMPORT_WARNINGS_TRUNCATED'));
  const cleanup = result.warnings.find((warning) => warning.code === 'IMPORT_TEMP_CLEANUP_PENDING');
  assert.ok(cleanup?.path.includes('.import-'));
  assert.equal((await openWorkspace(root, { packs })).work.tree.nodes.size > 0, true);
  await fs.rm(cleanup.path, { recursive: true, force: true });
});

test('first temp identity lookup error reports a pending path without deleting unknown files', async () => {
  const root = await importTarget();
  let temp;
  const wrapped = { ...fs, async lstat(path) {
    if (String(path).includes('.import-') && !temp) {
      temp = String(path);
      throw Object.assign(new Error('synthetic access failure'), { code: 'EACCES' });
    }
    return fs.lstat(path);
  } };
  let error;
  try { await importVibelore(root, { from: VIBELORE_FIXTURE, packs, fs: wrapped }); } catch (caught) { error = caught; }
  assert.equal(error?.details?.cleanupPending, true);
  assert.equal(error?.details?.temp, temp);
  assert.equal((await fs.lstat(temp)).isDirectory(), true);
  await assert.rejects(fs.lstat(root), { code: 'ENOENT' });
  await fs.rm(temp, { recursive: true, force: true });
});

test('post-publication temp lookup error reports a warning while keeping the completed work', async () => {
  const root = await importTarget();
  let seen = 0;
  let temp;
  const wrapped = { ...fs, async lstat(path) {
    if (!temp && String(path).includes('.import-')) temp = String(path);
    if (String(path) === temp) {
      seen += 1;
      if (seen === 2) throw Object.assign(new Error('synthetic I/O failure'), { code: 'EIO' });
    }
    return fs.lstat(path);
  } };
  const result = await importVibelore(root, { from: VIBELORE_FIXTURE, packs, fs: wrapped });
  assert.equal(result.status, 'imported');
  assert.deepEqual(result.warnings.filter((w) => w.code === 'IMPORT_TEMP_CLEANUP_PENDING'), [{ code: 'IMPORT_TEMP_CLEANUP_PENDING', path: temp }]);
  assert.equal((await openWorkspace(root, { packs })).work.tree.nodes.size, 6);
  assert.equal((await fs.lstat(temp)).isDirectory(), true);
  await fs.rm(temp, { recursive: true, force: true });
});
