import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectWork } from '../../core/diagnostics/work.js';
import { createRunner } from '../../core/run/runner.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { resourceObjectPath } from '../../core/resources/files.js';
import { copyFixture, tempDir, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { setupAssets } from '../support/assets.js';
import { approvedFixture, resourceFixture } from '../support/view-resources.js';
import { unchangedInspection } from '../support/diagnostics.js';
import { sha256 } from '../../core/util/hash.js';

const warnings = (result) => result.checks.filter((c) => c.status === 'warning');
const errors = (result) => result.checks.filter((c) => c.status === 'error');
async function writing() { const root = await copyFixture('novel-3level'); await useFakePack(root); return root; }

test('normal writing diagnosis creates no state, index, gate or directory', async () => {
  const root = await writing();
  const result = await unchangedInspection(root, fakePacks());
  assert.equal(result.ok, true);
  assert.deepEqual(warnings(result), []);
  assert.deepEqual(result.actions, []);
});

test('hand-edited reviewed manuscript is a warning with an explicit next action', async () => {
  const root = await writing();
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), { until: (o) => o.status === 'done' });
  const node = (await openWork(root)).tree.nodes.get('rooftop-scene');
  const path = join(root, 'tree', node.path);
  await writeFile(path, (await readFile(path, 'utf8')).replace(node.body, `${node.body} synthetic edit`));
  const result = await unchangedInspection(root, fakePacks());
  assert.ok(warnings(result).some((c) => c.message.includes('Edited since review')));
  assert.ok(result.actions.some((a) => a.includes('Review and finalize')));
});

test('missing managed image bytes fail diagnosis without changing approval history', async () => {
  const h = await setupAssets();
  const asset = await h.approve(await h.review(await h.put(await h.add())));
  await rm(join(h.root, 'assets', asset.output.file));
  assert.equal((await unchangedInspection(h.root, h.packs)).ok, false);
});

test('all existing activity records are checked, including unreferenced records', async () => {
  const root = await writing();
  await openLedger(root, 'otherwise-unused').append({ type: 'synthetic' });
  await writeFile(openLedger(root, 'otherwise-unused').path, '{broken\n');
  const result = await unchangedInspection(root, fakePacks());
  assert.ok(errors(result).some((c) => c.name.includes('otherwise-unused')));
});

test('resource-only selected sources and approved output proofs verify without creating an index', async () => {
  const root = await tempDir('folio-doctor-resources-');
  await approvedFixture(root);
  const result = await unchangedInspection(root);
  assert.equal(result.ok, true);
  assert.ok(warnings(result).some((c) => c.message.includes('not been indexed')));
});

test('stale Resources and output needing review are warnings', async () => {
  const root = await tempDir('folio-doctor-stale-');
  const h = await approvedFixture(root);
  await buildMetadataProjection(root);
  await h.select(await h.propose('source', 'synthetic next revision'), h.selected.selectionRevision);
  const result = await unchangedInspection(root);
  assert.equal(result.ok, true);
  assert.ok(warnings(result).some((c) => c.message.includes('Review needed')));
  assert.ok(result.actions.length);
});

for (const target of ['source', 'output']) test(`damaged ${target} owned bytes are errors even without a generation`, async () => {
  const root = await tempDir('folio-doctor-damage-');
  const h = await approvedFixture(root);
  await writeFile(resourceObjectPath(root, h[target].contentHash, 'content'), 'synthetic damage');
  assert.equal((await unchangedInspection(root)).ok, false);
});

test('open manuscript and image runs warn with safe manual next actions', async () => {
  const root = await writing();
  await createRunner({ root, packs: fakePacks() }).run({ node: 'next' });
  await mkdir(join(root, '.folio', 'image-runs'), { recursive: true });
  await writeFile(join(root, '.folio', 'image-runs', 'imgrun-synthetic.json'), JSON.stringify({ runId: 'imgrun-synthetic', assetId: 'toy-image', state: 'awaiting_user' }));
  const result = await unchangedInspection(root, fakePacks());
  assert.equal(result.ok, true);
  assert.ok(warnings(result).filter((c) => c.name.includes('runs')).length >= 2);
  assert.ok(result.actions.some((a) => a.includes('Reconnect')));
});

for (const directory of ['runs', 'image-runs']) {
  for (const corruption of ['broken JSON', 'unknown state', 'filename mismatch']) test(`${directory}: ${corruption} cannot look normal`, async () => {
    const root = await writing();
    const image = directory === 'image-runs';
    const runId = image ? 'imgrun-synthetic' : 'run-synthetic';
    await mkdir(join(root, '.folio', directory), { recursive: true });
    await writeFile(join(root, '.folio', directory, `${runId}.json`), corruption === 'broken JSON' ? '{broken' : JSON.stringify({
      runId: corruption === 'filename mismatch' ? `${runId}other` : runId,
      state: corruption === 'unknown state' ? 'made-up' : 'done', nodeId: 'rooftop-scene', assetId: 'toy-image',
    }));
    assert.equal((await unchangedInspection(root, fakePacks())).ok, false);
  });
}

test('missing, empty and invalid writing roots produce real errors', async () => {
  const root = await tempDir('folio-doctor-roots-');
  for (const path of [root, join(root, 'missing')]) assert.equal((await inspectWork(path, { packs: fakePacks() })).ok, false);
  await resourceFixture(root);
  await writeFile(join(root, 'work.yaml'), 'title: []\n');
  assert.equal((await unchangedInspection(root, fakePacks())).ok, false);
});

test('state symlinks are errors and are never followed', async (t) => {
  if (process.platform === 'win32') return t.skip('symlink privileges vary');
  const root = await writing(); const other = await tempDir('folio-doctor-outside-');
  await mkdir(join(root, '.folio'), { recursive: true });
  await symlink(other, join(root, '.folio', 'ledger'));
  assert.equal((await unchangedInspection(root, fakePacks())).ok, false);
});

test('permission errors are reported rather than treated as absent', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return t.skip('requires POSIX non-root permissions');
  const root = await writing(); const config = join(root, 'work.yaml');
  await chmod(config, 0);
  try { assert.equal((await inspectWork(root, { packs: fakePacks() })).ok, false); }
  finally { await chmod(config, 0o600); }
});

for (const valid of [true, false]) test(`interrupted write (${valid ? 'valid' : 'damaged'}) is inspected without recovery`, async () => {
  const root = await writing();
  const node = (await openWork(root)).tree.nodes.get('rooftop-scene');
  const actualPath = `tree/${node.path}`;
  const original = await readFile(join(root, actualPath));
  const tx = join(root, '.folio', 'tx');
  await mkdir(tx, { recursive: true });
  await writeFile(join(tx, 'backup-0'), original);
  await writeFile(join(tx, 'journal.json'), valid ? JSON.stringify({ id: 'synthetic', files: [{ path: actualPath, backup: 'backup-0', beforeHash: sha256(original), afterHash: sha256('synthetic changed') }] }) : '{damaged');
  const result = await unchangedInspection(root, fakePacks());
  assert.equal(result.ok, valid);
  assert.equal(result.checks.find((c) => c.name === 'pending-write').status, valid ? 'warning' : 'error');
});
