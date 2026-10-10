import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { publishWork } from '../../core/import/publish-work.js';
import { openWork } from '../../core/store/work.js';
import { tempDir } from '../support/fixtures.js';

async function staged() {
  const parent = await tempDir('folio-publish-');
  const temp = join(parent, '.stage');
  const target = join(parent, 'work');
  await fs.mkdir(join(temp, 'tree'), { recursive: true });
  await fs.writeFile(join(temp, 'tree', 'node.md'), 'synthetic node');
  await fs.writeFile(join(temp, 'work.yaml'), 'synthetic work');
  return { parent, temp, target };
}
const code = (promise) => promise.then(() => 'ok', (error) => error.code);

// 폴더 예약 자체를 외부 폴더 생성과 경합시킨다. 이미 생긴 inode는 절대 교체하지 않는다.
test('an external empty root appearing at final reservation is preserved', async () => {
  const { temp, target } = await staged();
  let external;
  const wrapped = { ...fs, async mkdir(path, options) {
    if (path === target && !external) { await fs.mkdir(target); external = await fs.lstat(target); }
    return fs.mkdir(path, options);
  } };
  assert.equal(await code(publishWork(temp, target, { fs: wrapped })), 'IMPORT_ROOT_EXISTS');
  assert.equal((await fs.lstat(target)).ino, external.ino);
  assert.deepEqual(await fs.readdir(target), []);
});

test('two simultaneous publications have one winner and preserve its files', async () => {
  const first = await staged();
  const second = join(first.parent, '.second');
  await fs.cp(first.temp, second, { recursive: true });
  const outcomes = await Promise.allSettled([publishWork(first.temp, first.target), publishWork(second, first.target)]);
  assert.deepEqual(outcomes.map((r) => r.status === 'fulfilled' ? 'ok' : r.reason.code).sort(), ['IMPORT_ROOT_EXISTS', 'ok']);
  assert.equal(await fs.readFile(join(first.target, 'work.yaml'), 'utf8'), 'synthetic work');
});

test('a caught mid-publication failure rolls back only owned entries', async () => {
  const { temp, target } = await staged();
  const wrapped = { ...fs, async link(source, destination) {
    if (destination.endsWith('node.md')) throw Object.assign(new Error('synthetic failure'), { code: 'EIO' });
    return fs.link(source, destination);
  } };
  let error;
  try { await publishWork(temp, target, { fs: wrapped }); } catch (caught) { error = caught; }
  assert.equal(error.code, 'IMPORT_PUBLISH_FAILED');
  assert.equal(error.details.cleanupPending, false);
  await assert.rejects(fs.lstat(target), { code: 'ENOENT' });
});

test('external file added during publication survives rollback and marks cleanup pending', async () => {
  const { temp, target } = await staged();
  const wrapped = { ...fs, async link(source, destination) {
    if (destination.endsWith('node.md')) {
      await fs.writeFile(join(target, 'outside.txt'), 'external');
      throw Object.assign(new Error('synthetic failure'), { code: 'EIO' });
    }
    return fs.link(source, destination);
  } };
  let error;
  try { await publishWork(temp, target, { fs: wrapped }); } catch (caught) { error = caught; }
  assert.equal(error.code, 'IMPORT_PUBLISH_FAILED');
  assert.equal(error.details.cleanupPending, true);
  assert.equal(await fs.readFile(join(target, 'outside.txt'), 'utf8'), 'external');
});

test('a published file changed by another writer is preserved during rollback', async () => {
  const { temp, target } = await staged();
  const wrapped = { ...fs, async link(source, destination) {
    if (destination.endsWith('work.yaml')) {
      await fs.appendFile(join(target, 'tree', 'node.md'), ' external');
      throw Object.assign(new Error('synthetic failure'), { code: 'EIO' });
    }
    return fs.link(source, destination);
  } };
  let error;
  try { await publishWork(temp, target, { fs: wrapped }); } catch (caught) { error = caught; }
  assert.equal(error.code, 'IMPORT_PUBLISH_FAILED');
  assert.equal(error.details.cleanupPending, true);
  assert.equal(await fs.readFile(join(target, 'tree', 'node.md'), 'utf8'), 'synthetic node external');
});

test('a persistent replacement of the reserved root fails closed and preserves the replacement', async () => {
  const { parent, temp, target } = await staged();
  const moved = join(parent, 'moved-owned-root');
  let replacement;
  const wrapped = { ...fs, async mkdir(path, options) {
    const result = await fs.mkdir(path, options);
    if (path === join(target, 'tree')) {
      await fs.rename(target, moved);
      await fs.mkdir(target);
      replacement = await fs.lstat(target);
    }
    return result;
  } };
  let error;
  try { await publishWork(temp, target, { fs: wrapped }); } catch (caught) { error = caught; }
  assert.equal(error.code, 'IMPORT_PUBLISH_FAILED');
  assert.equal(error.details.cleanupPending, true);
  assert.equal((await fs.lstat(target)).ino, replacement.ino);
  assert.deepEqual(await fs.readdir(target), []);
});

test('work.yaml is linked last so a middle publication cannot open as a work', async () => {
  const { temp, target } = await staged();
  let observed;
  const wrapped = { ...fs, async link(source, destination) {
    if (destination.endsWith('node.md')) {
      observed = await fs.lstat(join(target, 'work.yaml')).then(() => 'present', (error) => error.code);
      await assert.rejects(openWork(target));
    }
    return fs.link(source, destination);
  } };
  await publishWork(temp, target, { fs: wrapped });
  assert.equal(observed, 'ENOENT');
  assert.equal(await fs.readFile(join(target, 'work.yaml'), 'utf8'), 'synthetic work');
});
