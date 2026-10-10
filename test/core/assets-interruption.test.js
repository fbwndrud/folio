import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsPromises, { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { changeAsset } from '../../core/assets/change.js';
import { MAX_ASSET_BYTES, prepareOutput } from '../../core/assets/files.js';
import { MAX_RESOURCE_BYTES } from '../../core/resources/schema.js';
import { writeImmutable } from '../../core/resources/files.js';
import { setupAssets, syntheticSvg } from '../support/assets.js';

test('partial asset ENOSPC publishes no final copy or version, then the same public put succeeds', async (t) => {
  const s = await setupAssets(); const a = await s.add();
  const input = { op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' };
  const { output } = await prepareOutput(s.root, a.id, input);
  const target = join(s.root, 'assets', output.file);
  const originalWrite = fsPromises.writeFile; let partial = null;
  const mocked = t.mock.method(fsPromises, 'writeFile', async (path, bytes, options) => {
    if (typeof path === 'string' && path.startsWith(join(s.root, 'assets', 'files') + '/')) {
      partial = path; await originalWrite(path, bytes.subarray(0, 4), options);
      throw Object.assign(new Error('synthetic disk full'), { code: 'ENOSPC' });
    }
    return originalWrite(path, bytes, options);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(changeAsset(s.root, input), { code: 'ENOSPC' }); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.ok(partial);
  assert.equal((await s.get()).history.length, 1); assert.equal((await s.get()).asset.status, 'planned');
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  assert.deepEqual(await readdir(join(s.root, 'assets', 'files')), []);
  const ready = await s.put(a);
  assert.equal(ready.version, 2); assert.equal((await s.get()).history.length, 2);
  assert.equal(await readFile(target, 'utf8'), syntheticSvg());
});

test('SIGKILL during asset staging leaves no version and the same public put retries without deleting the orphan', async () => {
  const s = await setupAssets(); const a = await s.add();
  const input = { op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' };
  const { output } = await prepareOutput(s.root, a.id, input);
  const target = join(s.root, 'assets', output.file);
  const program = `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { changeAsset } from ${JSON.stringify(new URL('../../core/assets/change.js', import.meta.url).href)};
    const write = fs.writeFile;
    fs.writeFile = async (path, bytes, options) => {
      if (typeof path === 'string' && path.startsWith(${JSON.stringify(join(s.root, 'assets', 'files') + '/')})) {
        await write(path, bytes.subarray(0, 4), options);
        process.kill(process.pid, 'SIGKILL');
      }
      return write(path, bytes, options);
    };
    syncBuiltinESMExports();
    await changeAsset(${JSON.stringify(s.root)}, ${JSON.stringify(input)});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.error, undefined); assert.equal(child.signal, 'SIGKILL', child.stderr);
  const entries = await readdir(join(s.root, 'assets', 'files'));
  assert.equal(entries.length, 1);
  const orphan = join(s.root, 'assets', 'files', entries[0]);
  assert.equal(await readFile(orphan, 'utf8'), syntheticSvg().slice(0, 4));
  assert.equal((await s.get()).history.length, 1); assert.equal((await s.get()).asset.status, 'planned');
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  const ready = await s.put(a);
  assert.equal(ready.version, 2); assert.equal((await s.get()).history.length, 2);
  assert.equal(await readFile(target, 'utf8'), syntheticSvg());
  assert.equal(await readFile(orphan, 'utf8'), syntheticSvg().slice(0, 4));
});

test('asset publication never replaces a mismatched final file or follows a final symlink', async () => {
  for (const kind of ['mismatch', 'symlink']) {
    const s = await setupAssets(); const a = await s.add();
    const input = { op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' };
    const { output } = await prepareOutput(s.root, a.id, input);
    await mkdir(join(s.root, 'assets', 'files'), { recursive: true });
    const target = join(s.root, 'assets', output.file);
    if (kind === 'mismatch') await writeFile(target, 'synthetic conflicting bytes');
    else await symlink(s.source, target);
    const result = await s.asset(input);
    assert.equal(result.error?.code, kind === 'mismatch' ? 'ASSET_IMMUTABLE' : 'ASSET_PATH_INVALID');
    assert.equal((await s.get()).history.length, 1);
    assert.equal(await readFile(target, 'utf8'), kind === 'mismatch' ? 'synthetic conflicting bytes' : syntheticSvg());
    assert.deepEqual(await readdir(join(s.root, 'assets', 'files')), [output.file.slice('files/'.length)]);
  }
});

test('managed assets retain their 20MiB boundary while shared Resource objects retain 8MiB', async () => {
  const s = await setupAssets(); const a = await s.add();
  const bytes = Buffer.alloc(MAX_ASSET_BYTES, ' '); bytes.write(syntheticSvg());
  assert.ok(bytes.length > MAX_RESOURCE_BYTES);
  await writeFile(s.source, bytes);
  const ready = await s.put(a);
  assert.equal(ready.output.bytes, MAX_ASSET_BYTES);
  assert.deepEqual(await readFile(join(s.root, 'assets', ready.output.file)), bytes);
  await writeFile(s.source, Buffer.alloc(MAX_ASSET_BYTES + 1));
  assert.equal((await s.asset({ op: 'put', id: a.id, expectedRev: ready.rev, path: s.source, mediaType: 'image/svg+xml' })).error?.code, 'ASSET_SIZE_INVALID');
  assert.equal((await s.get()).history.length, 2);
  const resource = join(s.root, '.folio', 'resources', 'too-large.bin');
  await assert.rejects(writeImmutable(s.root, resource, Buffer.alloc(MAX_RESOURCE_BYTES + 1)), { code: 'RESOURCE_TOO_LARGE' });
  await assert.rejects(readFile(resource), { code: 'ENOENT' });
});
