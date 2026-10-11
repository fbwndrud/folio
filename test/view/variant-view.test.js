import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { viewVariants, viewVariantNode, viewVariantReceipts, viewVariantPublication } from '../../core/view/variant-view.js';
import { viewNodeReceipts } from '../../core/view/receipt-view.js';
import { buildSnapshot, snapshotAssetIds } from '../../core/view/snapshot.js';
import { snapshotAssetFiles } from '../../core/view/snapshot-assets.js';
import { openWork } from '../../core/store/work.js';
import { fakePacks, fixturePath } from '../support/fixtures.js';
import { commitMain, patchWork, putVariantFile, variantWork } from '../support/variant-work.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { sourceSnapshot, SVG } from '../support/export-work.js';
import { startViewServer } from '../../server/view/http-server.js';

const options = { packs: fakePacks() }, ID = 'ep-001';
const MAIN_TEXT = '하나는 문을 열었다.\n', EN_TEXT = 'Hana opened the door.\n';
async function translated(t) {
  const root = await variantWork(); t.after(() => rm(root, { recursive: true, force: true }));
  await commitMain(root, ID, MAIN_TEXT);
  const trail = await driveToEnd(() => createRunner({ root, ...options }), createFakeHost({ drafts: { '*': EN_TEXT } }),
    { start: { node: ID, variant: 'en' }, until: o => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done'); return root;
}
const textOf = view => view.segments.map(s => s.text ?? '').join('');

test('selected text, receipt identity and source version agree; read and snapshot leave all source bytes unchanged', async t => {
  const root = await translated(t), before = await sourceSnapshot(root);
  const catalog = await viewVariants(root, options); assert.deepEqual(catalog.editions.map(e => e.id), ['main', 'en']);
  const main = await viewVariantNode(root, options, 'main', ID), en = await viewVariantNode(root, options, 'en', ID);
  assert.match(textOf(main), /하나/); assert.match(textOf(en), /Hana/); assert.doesNotMatch(textOf(en), /문을/);
  assert.equal(en.edition.missing, false); assert.equal(en.edition.originalMetadata, true);
  const original = await viewNodeReceipts(root, options, ID), selected = await viewVariantReceipts(root, options, 'en', ID);
  assert.notEqual(selected.receipt.receiptId, original.receipt.receiptId);
  assert.equal(selected.receipt.variant, 'en'); assert.equal(selected.receipt.original.receiptId, original.receipt.receiptId);
  assert.equal(selected.receipt.draftHash, en.contentHash);
  const snapshot = await buildSnapshot(root, options);
  assert.equal(snapshot.variants.editions.en.nodes[ID].contentHash, en.contentHash);
  assert.equal(snapshot.variants.editions.en.receiptNodes[ID].receipt.receiptId, selected.receipt.receiptId);
  assert.equal(snapshot.variants.editions.en.publication.code, 'EXPORT_VARIANT_MISSING');
  assert.deepEqual(await sourceSnapshot(root), before);
});

test('missing translation never substitutes the original; hand edit and original or terms changes stay edition scoped', async t => {
  const root = await translated(t);
  await putVariantFile(root, 'en', `${ID}.md`, 'Hana changed her mind.\n');
  assert.equal((await viewVariantReceipts(root, options, 'en', ID)).drift.code, 'HAND_EDITED');
  assert.equal((await viewNodeReceipts(root, options, ID)).drift, null);
  await rm(join(root, 'variants/en', `${ID}.md`));
  const missing = await viewVariantNode(root, options, 'en', ID);
  assert.equal(missing.edition.missing, true); assert.equal(textOf(missing), '');
  await assert.rejects(viewVariantPublication(root, options, 'en'), { code: 'EXPORT_VARIANT_MISSING' });
  await putVariantFile(root, 'en', `${ID}.md`, EN_TEXT);
  await commitMain(root, ID, '하나는 창문을 열었다.\n');
  await putVariantFile(root, 'en', 'terms.yaml', 'terms:\n  - { from: 하나, to: Hana }\n');
  const receipt = await viewVariantReceipts(root, options, 'en', ID);
  assert.deepEqual(receipt.stale.map(r => r.kind), ['original', 'terms']);
  assert.deepEqual((await viewNodeReceipts(root, options, ID)).stale, []);
  const work = await openWork(root);
  for (const node of work.tree.nodes.values()) if (node.kind === 'leaf' && node.id !== ID) await putVariantFile(root, 'en', `${node.id}.md`, 'Synthetic translated section.\n');
  const summary = await viewVariantPublication(root, options, 'en');
  assert.ok(summary.warnings.some(w => w.code === 'EXPORT_SOURCE_CHANGED' && w.nodeId === ID));
  assert.ok(summary.warnings.some(w => w.code === 'EXPORT_TERMS_CHANGED' && w.nodeId === ID));
});

test('unknown and disabled editions are refused; corrupt ledger exposes no claimed review or committed status', async t => {
  const root = await translated(t);
  for (const id of ['../en', '__proto__', 'fr']) await assert.rejects(viewVariantNode(root, options, id, ID), { code: 'VARIANT_UNKNOWN' });
  await patchWork(root, { features: { variants: false } });
  assert.deepEqual((await viewVariants(root, options)).editions.map(e => e.id), ['main']);
  await assert.rejects(viewVariantNode(root, options, 'en', ID), { code: 'FEATURE_DISABLED' });
  await patchWork(root, { features: { variants: true } });
  const ledger = join(root, '.folio/ledger/receipts.jsonl');
  await writeFile(ledger, (await readFile(ledger, 'utf8')).replace('"ep-001"', '"ep-002"'));
  await assert.rejects(viewVariantReceipts(root, options, 'en', ID), { code: 'LEDGER_TAMPERED' });
  await assert.rejects(viewVariantNode(root, options, 'en', ID), { code: 'LEDGER_TAMPERED' });
});

test('variant-only inline images are verified and copied in review snapshots', async t => {
  const root = await translated(t);
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets/variant-image.svg'), SVG);
  await writeFile(join(root, 'assets/variant-image.yaml'), 'id: variant-image\nfile: variant-image.svg\n');
  await putVariantFile(root, 'en', `${ID}.md`, `${EN_TEXT}![[asset:variant-image]]\n`);
  const snapshot = await buildSnapshot(root, options);
  assert.ok(snapshotAssetIds(snapshot).includes('variant-image'));
  const files = []; for await (const file of snapshotAssetFiles(root, snapshot)) files.push(file);
  assert.equal(files.find(f => f.id === 'variant-image').bytes.toString(), SVG);
});

test('authenticated edition routes serve matching text, receipts and English downloads without source writes', async t => {
  const root = await translated(t), work = await openWork(root);
  for (const node of work.tree.nodes.values()) if (node.kind === 'leaf' && node.id !== ID) await putVariantFile(root, 'en', `${node.id}.md`, 'Synthetic translated section.\n');
  const before = await sourceSnapshot(root);
  const server = await startViewServer({ root, ...options, distDir: fixturePath('viewer-dist') }); t.after(() => server.close());
  const call = (path, init = {}) => fetch(new URL(path, server.url), { ...init, headers: { 'x-folio-token': server.token, ...init.headers } });
  assert.equal((await call('/api/variants')).status, 200);
  const node = await (await call(`/api/variants/en/nodes/${ID}`)).json(); assert.match(textOf(node), /Hana/);
  const receipt = await (await call(`/api/variants/en/receipts/${ID}`)).json(); assert.equal(receipt.receipt.variant, 'en');
  const summary = await (await call('/api/variants/en/publication')).json(); assert.equal(summary.language, 'en');
  for (const format of ['web', 'epub']) {
    const response = await call(`/api/variants/en/publication/${format}`); assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), format === 'web' ? 'application/zip' : 'application/epub+zip');
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  assert.equal((await fetch(new URL('/api/variants', server.url))).status, 401);
  assert.equal((await call('/api/variants/en/publication/web', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
  assert.equal((await call('/api/variants/en/nodes/ghost')).status, 404);
  assert.deepEqual(await sourceSnapshot(root), before);
});
