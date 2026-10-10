import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeImmutable } from '../../core/resources/files.js';
import { normalizeTrace } from '../../core/operations/trace.js';
test('immutable write copies caller bytes before the first asynchronous boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-immutable-')); t.after(() => rm(root, {recursive:true, force:true}));
  const path = join(root, '.folio', 'resources', 'copy.bin'); const bytes = Buffer.from('synthetic');
  const pending = writeImmutable(root, path, bytes); bytes.fill(0); await pending;
  assert.equal((await readFile(path)).toString(), 'synthetic');
  await assert.rejects(writeImmutable(root, path, 'different'), {code:'RESOURCE_INTEGRITY_FAILURE'});
  await writeFile(path, 'broken');
  await assert.rejects(writeImmutable(root, path, 'synthetic'), {code:'RESOURCE_INTEGRITY_FAILURE'});
});
test('null and absent trace cost are truthfully unavailable; zero is known', () => {
  for (const cost of [null, undefined]) { const trace = normalizeTrace({cost}); assert.equal(trace.cost, 'unknown'); assert.ok(trace.unavailableFields.includes('cost')); }
  const trace = normalizeTrace({cost:0}); assert.equal(trace.cost, 0); assert.ok(!trace.unavailableFields.includes('cost'));
});
test('partial temporary writes never publish and normal retry completes', async (t) => {
  const { withImmutableWriteFault } = await import('../../core/resources/immutable-write-fault.js');
  const { readdir } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'folio-partial-')); t.after(() => rm(root, {recursive:true, force:true}));
  const path = join(root, '.folio', 'resources', 'retry.bin');
  await assert.rejects(withImmutableWriteFault(async (temp, bytes, options) => {
    await writeFile(temp, bytes.subarray(0, 2), options); throw Object.assign(new Error('synthetic disk full'), {code:'ENOSPC'});
  }, () => writeImmutable(root, path, 'synthetic')), {code:'ENOSPC'});
  await assert.rejects(readFile(path), {code:'ENOENT'});
  assert.deepEqual(await readdir(join(root, '.folio', 'resources')), []);
  await writeImmutable(root, path, 'synthetic'); assert.equal((await readFile(path)).toString(), 'synthetic');
});
test('shared immutable objects reject bytes exceeding their read limit before any final write', async (t) => {
  const {MAX_RESOURCE_BYTES} = await import('../../core/resources/schema.js');
  const root = await mkdtemp(join(tmpdir(), 'folio-large-')); t.after(() => rm(root, {recursive:true, force:true}));
  const path = join(root, '.folio', 'resources', 'too-large.bin');
  await assert.rejects(writeImmutable(root, path, Buffer.alloc(MAX_RESOURCE_BYTES + 1)), {code:'RESOURCE_TOO_LARGE'});
  await assert.rejects(readFile(path), {code:'ENOENT'});
});
