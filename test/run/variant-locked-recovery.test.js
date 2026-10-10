import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseDoc } from '../../core/store/frontmatter.js';
import { fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { commitMain, patchWork, putVariantFile, variantWork } from '../support/variant-work.js';

const BODY = 'Synthetic translation.\n';
const META = '---\ntitle: Existing title\ncustom: keep\n---\n';
const mainPath = (root) => join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
const variantPath = (root) => join(root, 'variants', 'en', 'ep-001.md');
const runner = (root, hooks = {}) => createRunner({ root, packs: fakePacks(), hooks });
const receipts = (root) => openLedger(root, 'receipts').readAll();

async function interrupted() {
  const root = await variantWork({ variants: [{ id: 'en', kind: 'translation', lang: 'en' }, { id: 'fr', kind: 'translation', lang: 'fr' }] });
  await commitMain(root, 'ep-001', 'Synthetic original.\n');
  await putVariantFile(root, 'en', 'ep-001.md', `${META}Old translation.\n`);
  await assert.rejects(driveToEnd(() => runner(root, { afterBodyWrite() { throw new Error('interrupted'); } }),
    createFakeHost({ drafts: { '*': BODY } }), { start: { node: 'ep-001', variant: 'en' }, until: (o) => o.status === 'done' }), /interrupted/);
  const run = (await createRunStore(root).list()).find((r) => r.variant === 'en');
  assert.equal(run.state, 'committing');
  const records = await receipts(root);
  assert.equal(records.filter((r) => r.type === 'receipt' && r.receiptId === run.receipt.receiptId).length, 1);
  assert.equal(records.filter((r) => r.type === 'commit' && r.receiptId === run.receipt.receiptId).length, 0);
  return { root, run, records };
}

test('public runner finishes only the recorded variant while off and keeps target metadata and original records', async () => {
  const { root, run, records: before } = await interrupted();
  const mainBefore = await readFile(mainPath(root), 'utf8');
  const sideBefore = await Promise.all(['events', 'occurrences', 'evidence'].map((name) => openLedger(root, name).readAll()));
  await putVariantFile(root, 'fr', 'terms.yaml', 'terms: [broken\n');
  await patchWork(root, { features: { variants: false } });
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'fr' }), { code: 'RUN_IN_PROGRESS' });
  await assert.rejects(runner(root).run({ node: 'ep-001' }), { code: 'RUN_IN_PROGRESS' });
  const done = await runner(root).run({ node: 'ep-001', variant: 'en' });
  assert.deepEqual([done.status, done.variant], ['done', 'en']);
  const target = parseDoc(await readFile(variantPath(root), 'utf8'));
  assert.deepEqual([target.data.title, target.data.custom, target.body], ['Existing title', 'keep', BODY]);
  const after = await receipts(root);
  assert.deepEqual(after.slice(0, before.length), before, 'receipt ledger remains append-only');
  assert.equal(after.filter((r) => r.type === 'receipt' && r.receiptId === run.receipt.receiptId).length, 1);
  assert.equal(after.filter((r) => r.type === 'commit' && r.receiptId === run.receipt.receiptId).length, 1);
  assert.equal(await readFile(mainPath(root), 'utf8'), mainBefore);
  assert.deepEqual(await Promise.all(['events', 'occurrences', 'evidence'].map((name) => openLedger(root, name).readAll())), sideBefore);
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'fr' }), { code: 'FEATURE_DISABLED' });
  await rm(root, { recursive: true, force: true });
});

test('feature-off unrecorded variant cannot continue, including a committing run without its receipt', async () => {
  const root = await variantWork();
  await commitMain(root, 'ep-001', 'Synthetic original.\n');
  const first = await runner(root).run({ node: 'ep-001', variant: 'en' });
  const store = createRunStore(root);
  const run = await store.load(first.runId);
  await store.save({ ...run, state: 'committing' });
  await patchWork(root, { features: { variants: false } });
  await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'en' }), { code: 'FEATURE_DISABLED' });
  await rm(root, { recursive: true, force: true });
});

for (const kind of ['malformed', 'symlink', 'hardlink']) {
  test(`feature-off locked recovery refuses a ${kind} target without clobbering it`, async () => {
    const { root, run } = await interrupted();
    const target = variantPath(root);
    const protectedPath = join(root, 'protected.txt');
    await patchWork(root, { features: { variants: false } });
    if (kind === 'malformed') await writeFile(target, '---\ntitle: [broken\n---\nOld body.\n');
    else {
      await writeFile(protectedPath, 'Protected outside target.\n');
      await rm(target);
      if (kind === 'symlink') await symlink(protectedPath, target);
      else await link(protectedPath, target);
    }
    const before = await readFile(kind === 'malformed' ? target : protectedPath, 'utf8');
    await assert.rejects(runner(root).run({ node: 'ep-001', variant: 'en' }),
      { code: kind === 'malformed' ? 'YAML_INVALID' : 'VARIANT_FILE_INVALID' });
    assert.equal(await readFile(kind === 'malformed' ? target : protectedPath, 'utf8'), before);
    assert.equal((await receipts(root)).filter((r) => r.type === 'commit' && r.receiptId === run.receipt.receiptId).length, 0);
    await rm(root, { recursive: true, force: true });
  });
}
