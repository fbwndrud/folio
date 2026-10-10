import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createToolbox } from '../../server/toolbox.js';
import { createImageRunner } from '../../core/image/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { versionDigest } from '../../core/assets/schema.js';
import { illustratedWork, createImageHost, answerUntil } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const id = 'collision-image';
const brief = { description: 'synthetic managed asset', entities: [] };
async function setup() {
  const root = await illustratedWork();
  const runner = createImageRunner({ root, packs });
  const tools = createToolbox({ packs });
  const add = () => tools.call('folio_assets', { root, op: 'add', id, brief });
  const started = await runner.start({ assetId: id, nodeId: 'ep-001' });
  const path = join(root, '.folio', 'image-runs', `${started.runId}.json`);
  return { root, runner, add, started, path };
}
async function interrupted() {
  const s = await setup();
  await answerUntil(s.runner, await createImageHost(), s.started);
  const meta = join(s.root, 'assets', `${id}.yaml`);
  await writeFile(meta, 'id: collateral\nfile: hana-sheet.png\n');
  await assert.rejects(s.runner.decide({ runId: s.started.runId, action: 'approve' }), { code: 'ASSET_IMMUTABLE' });
  await unlink(meta);
  return s;
}

test('active and committing image reservations block managed writes; ordinary recovery stays idempotent', async () => {
  const active = await setup();
  assert.equal((await active.add()).error?.code, 'ASSET_RUN_OPEN');
  await active.runner.decide({ runId: active.started.runId, action: 'skip', reason: 'synthetic cancellation' });
  assert.equal((await active.add()).ok, true, 'abandoned images release an uncommitted reservation');
  const s = await interrupted();
  const ledger = openLedger(s.root, 'assets'), before = await ledger.readAll();
  assert.equal((await s.add()).error?.code, 'ASSET_RUN_OPEN');
  assert.deepEqual(await ledger.readAll(), before);
  const done = await s.runner.resume({ runId: s.started.runId });
  assert.equal(done.status, 'done');
  assert.equal((await openWork(s.root)).assets.get(id).managed, undefined);
  const run = JSON.parse(await readFile(s.path, 'utf8'));
  await writeFile(s.path, JSON.stringify({ ...run, state: 'committing', cursor: 5 }));
  assert.deepEqual(await s.runner.resume({ runId: run.runId }), done);
  assert.equal((await ledger.readAll()).filter((r) => r.type === 'asset_commit').length, 1);
});

test('a receipt reserves its ID even if the image run cache disappears', async () => {
  const s = await interrupted();
  await unlink(s.path);
  const before = await openLedger(s.root, 'assets').readAll();
  assert.equal((await s.add()).error?.code, 'ASSET_RUN_OPEN');
  await assert.rejects(s.runner.start({ assetId: id }), { code: 'ASSET_EXISTS' });
  assert.deepEqual(await openLedger(s.root, 'assets').readAll(), before);
  assert.equal((await openWork(s.root)).assets.has(id), false);
});

test('image recovery refuses a conflicting managed asset without writing legacy metadata or final marker', async () => {
  const s = await interrupted(), ledger = openLedger(s.root, 'assets');
  // Simulate the state left by the vulnerable version; use the real append-only managed record format.
  const record = { type: 'asset_version', id, version: 1, title: '', brief, output: null };
  await ledger.append({ ...record, versionDigest: versionDigest(record) });
  const before = await ledger.readAll();
  await assert.rejects(s.runner.resume({ runId: s.started.runId }), { code: 'ASSET_EXISTS' });
  assert.deepEqual(await ledger.readAll(), before);
  await assert.rejects(readFile(join(s.root, 'assets', `${id}.yaml`)), { code: 'ENOENT' });
  assert.equal((await openWork(s.root)).assets.get(id).managed, true);
});

test('malformed, unknown-state, mismatched-ID and unbound image runs fail closed for managed writes', async () => {
  for (const corrupt of [() => '{broken', (r) => JSON.stringify({ ...r, state: 'unknown' }),
    (r) => JSON.stringify({ ...r, runId: 'imgrun-other' }), (r) => JSON.stringify({ ...r, assetId: null })]) {
    const s = await setup(), run = JSON.parse(await readFile(s.path, 'utf8'));
    await writeFile(s.path, corrupt(run));
    const before = await openLedger(s.root, 'assets').readAll();
    assert.equal((await s.add()).error?.code, 'IMAGE_RUN_INVALID');
    await assert.rejects(s.runner.start({ assetId: 'another-image' }), { code: 'IMAGE_RUN_INVALID' });
    assert.deepEqual(await openLedger(s.root, 'assets').readAll(), before);
    assert.equal((await openWork(s.root)).assets.has(id), false);
  }
});
