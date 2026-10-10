import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createImageRunner } from '../../core/image/runner.js';
import { createImageRunStore } from '../../core/image/run-store.js';
import { illustratedWork, createImageHost } from '../support/image-work.js';
import { tempDir } from '../support/fixtures.js';
import { PNG_A } from '../support/images.js';

const unsafe = { code: 'IMAGE_RUN_PATH_UNSAFE' };
const run = { runId: 'imgrun-probe', state: 'active', createdAt: '2026-10-01' };

for (const relative of ['.folio', '.folio/runs', '.folio/image-runs']) {
  test(`runner start refuses static ${relative} link before any outside write`, async () => {
    const root = await illustratedWork();
    const outside = await tempDir();
    await mkdir(join(root, relative, '..'), { recursive: true });
    await symlink(outside, join(root, relative));
    await writeFile(join(outside, `${run.runId}.json`), 'EXTERNAL ORIGINAL');
    const runner = createImageRunner({ root, packs: await loadBuiltinPacks(), newId: (p) => `${p}-probe` });
    await assert.rejects(runner.start({ assetId: 'static-link' }), unsafe);
    assert.equal(await readFile(join(outside, `${run.runId}.json`), 'utf8'), 'EXTERNAL ORIGINAL');
    assert.deepEqual(await readdir(outside), [`${run.runId}.json`]);
  });
}

for (const relative of ['.folio', '.folio/image-runs']) {
  test(`known resume and direct save refuse replaced ${relative} parent`, async () => {
    const root = await illustratedWork();
    const runner = createImageRunner({ root, packs: await loadBuiltinPacks() });
    const pending = await runner.start({ assetId: 'resume-link' });
    const store = createImageRunStore(root);
    const saved = await store.load(pending.runId);
    const outside = await tempDir();
    const sentinel = JSON.stringify(saved);
    await writeFile(join(outside, `${pending.runId}.json`), sentinel);
    await rename(join(root, relative), join(root, 'original-state'));
    await symlink(outside, join(root, relative));
    await assert.rejects(runner.resume({ runId: pending.runId }), unsafe);
    await assert.rejects(store.save(saved), unsafe);
    await assert.rejects(store.load(pending.runId), unsafe);
    await assert.rejects(store.list(), unsafe);
    assert.equal(await readFile(join(outside, `${pending.runId}.json`), 'utf8'), sentinel);
    assert.deepEqual(await readdir(outside), [`${pending.runId}.json`]);
  });
}

test('run JSON symlink cannot be read, listed or replaced by save', async () => {
  const root = await illustratedWork();
  const outside = await tempDir();
  const target = join(outside, 'state.json');
  await writeFile(target, JSON.stringify(run));
  const store = createImageRunStore(root);
  await mkdir(join(root, '.folio/image-runs'), { recursive: true });
  await symlink(target, store.pathOf(run.runId));
  await assert.rejects(store.load(run.runId), unsafe);
  await assert.rejects(store.save(run), unsafe);
  await assert.rejects(store.list(), unsafe);
  assert.equal(await readFile(target, 'utf8'), JSON.stringify(run));
});

test('staged directory links and file links refuse reads and writes without touching external bytes', async () => {
  for (const linkDirectory of [true, false]) {
    const root = await illustratedWork();
    const outside = await tempDir();
    const store = createImageRunStore(root);
    await store.save(run);
    const target = join(outside, 'image-1.png');
    await writeFile(target, PNG_A);
    const runDir = join(root, '.folio/image-runs', run.runId);
    if (linkDirectory) await symlink(outside, runDir);
    else {
      await mkdir(runDir);
      await symlink(target, store.stagedPath(run.runId, 'image-1.png'));
    }
    await assert.rejects(store.readStaged(run.runId, 'image-1.png'), unsafe);
    await assert.rejects(store.stage(run.runId, 'image-1.png', PNG_A), unsafe);
    if (linkDirectory) await assert.rejects(store.stage(run.runId, 'image-2.png', PNG_A), unsafe);
    assert.deepEqual(await readFile(target), PNG_A);
    assert.deepEqual(await readdir(outside), ['image-1.png']);
  }
});

test('valid store retains atomic state updates, staging idempotency and host intake', async () => {
  const root = await illustratedWork();
  const store = createImageRunStore(root);
  assert.deepEqual(await store.list(), []);
  await store.save(run);
  await store.save({ ...run, state: 'awaiting_model' });
  assert.equal((await store.load(run.runId)).state, 'awaiting_model');
  assert.equal((await store.list()).length, 1);
  await store.stage(run.runId, 'image-1.png', PNG_A);
  await store.stage(run.runId, 'image-1.png', PNG_A);
  assert.deepEqual(await store.readStaged(run.runId, 'image-1.png'), PNG_A);
  assert.equal(await store.readStaged(run.runId, 'image-2.png'), null);
  const root2 = await illustratedWork();
  const runner = createImageRunner({ root: root2, packs: await loadBuiltinPacks() });
  const host = await createImageHost();
  let pending = await runner.start({ assetId: 'intake-ok' });
  for (let n = 0; n < 2; n += 1) pending = await runner.resume({ runId: pending.runId, answers: await host.answer(pending) });
  const stored = await createImageRunStore(root2).load(pending.runId);
  assert.deepEqual(await createImageRunStore(root2).readStaged(pending.runId, stored.image.name), PNG_A);
});

test('runner generation refuses a preplanted run subdirectory link and preserves outside files', async () => {
  const root = await illustratedWork();
  const outside = await tempDir();
  const runner = createImageRunner({ root, packs: await loadBuiltinPacks() });
  const host = await createImageHost();
  let pending = await runner.start({ assetId: 'staged-link' });
  pending = await runner.resume({ runId: pending.runId, answers: await host.answer(pending) });
  await writeFile(join(outside, 'image-1.png'), PNG_A);
  await symlink(outside, join(root, '.folio/image-runs', pending.runId));
  await assert.rejects(runner.resume({ runId: pending.runId, answers: await host.answer(pending) }), unsafe);
  assert.deepEqual(await readFile(join(outside, 'image-1.png')), PNG_A);
  assert.deepEqual(await readdir(outside), ['image-1.png']);
});

test('normal runner keeps shared work lock: concurrent starts produce one open run', async () => {
  const root = await illustratedWork();
  const runner = createImageRunner({ root, packs: await loadBuiltinPacks() });
  const results = await Promise.allSettled([runner.start({ assetId: 'one' }), runner.start({ assetId: 'two' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const failed = results.find((r) => r.status === 'rejected');
  assert.equal(failed.reason.code, 'IMAGE_RUN_IN_PROGRESS');
  assert.equal((await createImageRunStore(root).list()).length, 1);
});
