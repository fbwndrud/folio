import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { listGenerations } from '../../core/projections/manifest.js';
import { viewResources, viewResource } from '../../core/view/resources.js';
import { buildSnapshot } from '../../core/view/snapshot.js';
import { inspectWork } from '../../core/diagnostics/work.js';
import { createToolbox } from '../../server/toolbox.js';
import { resourceFixture } from '../support/view-resources.js';
import { snapshotFiles } from '../support/diagnostics.js';
import { tempDir, fakePacks } from '../support/fixtures.js';

const stageName = '.immutable-11111111-1111-4111-8111-111111111111.tmp';
const directory = (root) => join(root, '.folio', 'projections', 'metadata');

test('SIGKILL during metadata staging preserves reads and explicit refresh retries through public query', async () => {
  const root = await tempDir(); const f = await resourceFixture(root);
  const previous = await buildMetadataProjection(root);
  const replacement = await f.propose('source', 'synthetic replacement');
  await f.select(replacement, f.selected.selectionRevision);
  const program = `
    import { buildMetadataProjection } from ${JSON.stringify(new URL('../../core/projections/metadata.js', import.meta.url).href)};
    import { withImmutableWriteFault } from ${JSON.stringify(new URL('../../core/resources/immutable-write-fault.js', import.meta.url).href)};
    import { writeFile } from 'node:fs/promises';
    await withImmutableWriteFault(async (path, bytes, options) => {
      await writeFile(path, bytes.subarray(0, 10), options);
      process.kill(process.pid, 'SIGKILL');
    }, () => buildMetadataProjection(${JSON.stringify(root)}));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.error, undefined); assert.equal(child.signal, 'SIGKILL', child.stderr);
  const names = await readdir(directory(root));
  const stage = names.find((name) => name.startsWith('.immutable-'));
  assert.ok(stage); assert.equal((await readFile(join(directory(root), stage))).length, 10);
  assert.deepEqual(names.filter((name) => name.endsWith('.json')), [previous.generationId.slice(7) + '.json']);
  const interrupted = await snapshotFiles(root, '', true);
  assert.equal((await viewResources(root)).freshness, 'stale');
  assert.equal((await inspectWork(root, { packs: fakePacks() })).ok, true);
  assert.deepEqual(await snapshotFiles(root, '', true), interrupted);

  const tools = createToolbox({ packs: fakePacks() });
  const refreshed = await tools.call('folio_resource_query', { root, op: 'refresh' });
  assert.equal(refreshed.ok, true, JSON.stringify(refreshed));
  const queried = await tools.call('folio_resource_query', { root, op: 'query', resourceId: 'source' });
  assert.equal(queried.ok, true, JSON.stringify(queried));
  assert.equal(queried.result.entries[0].revisionId, replacement.revisionId);
  assert.equal((await listGenerations(root)).length, 2);
  const before = await snapshotFiles(root, '', true);
  const resources = await viewResources(root);
  assert.equal(resources.freshness, 'current');
  assert.equal((await viewResource(root, replacement.revisionId)).contentPreview, 'synthetic replacement');
  assert.deepEqual((await buildSnapshot(root, { packs: fakePacks() })).resources, resources);
  const doctor = await inspectWork(root, { packs: fakePacks() });
  assert.equal(doctor.ok, true); assert.equal(doctor.checks.find((c) => c.name === 'resources').status, 'ok');
  assert.deepEqual(await snapshotFiles(root, '', true), before);
  assert.deepEqual(before.find((entry) => entry.path.endsWith(stage)), interrupted.find((entry) => entry.path.endsWith(stage)));
});

test('metadata stages admit only known regular files; unknown names, unsafe paths and corrupt generations fail closed', async () => {
  const root = await tempDir(); await resourceFixture(root);
  const generation = await buildMetadataProjection(root);
  const stage = join(directory(root), stageName);
  await writeFile(stage, 'synthetic partial metadata');
  assert.equal((await listGenerations(root)).length, 1);
  await rm(stage);
  for (const name of ['unknown.tmp', '.immutable-not-a-uuid.tmp', 'unknown.json']) {
    const path = join(directory(root), name); await writeFile(path, 'synthetic');
    await assert.rejects(listGenerations(root), { code: 'PROJECTION_INTEGRITY_FAILURE' }); await rm(path);
  }
  await symlink(join(root, 'missing'), stage);
  await assert.rejects(listGenerations(root), { code: 'MANAGED_PATH_UNSAFE' }); await rm(stage);
  await mkdir(stage);
  await assert.rejects(listGenerations(root), { code: 'MANAGED_PATH_UNSAFE' }); await rm(stage, { recursive: true });
  if (process.platform !== 'win32') {
    execFileSync('mkfifo', [stage]);
    await assert.rejects(listGenerations(root), { code: 'MANAGED_PATH_UNSAFE' }); await rm(stage);
  }
  const canonical = join(directory(root), generation.generationId.slice(7) + '.json');
  await writeFile(canonical, '{');
  await assert.rejects(listGenerations(root), { code: 'PROJECTION_INTEGRITY_FAILURE' });
  await rm(canonical); await symlink(join(root, 'missing'), canonical);
  await assert.rejects(listGenerations(root), { code: 'MANAGED_PATH_UNSAFE' });
});
