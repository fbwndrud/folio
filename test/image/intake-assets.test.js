import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, symlink, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { readHostImage, MAX_IMAGE_BYTES } from '../../core/image/intake.js';
import { writeAssetOnce } from '../../core/store/assets.js';
import { sha256 } from '../../core/util/hash.js';
import { tempDir } from '../support/fixtures.js';
import { PNG_A, PNG_B, placeImage } from '../support/images.js';

const posixOnly = process.platform === 'win32' && 'symlinks need privileges on Windows';

test('a host image is read only when it is an absolute path to a regular PNG, JPEG, GIF or WebP file of at most 20 MiB', { skip: posixOnly }, async () => {
  const dir = await tempDir('folio-intake-');
  const png = await placeImage(dir, 'out.png');
  const read = await readHostImage(png);
  assert.deepEqual([read.ext, read.type, read.hash, read.bytes.equals(PNG_A)], ['.png', 'image/png', sha256(PNG_A), true]);
  assert.deepEqual(await readFile(png), PNG_A, 'the original is only read');
  const jpeg = await placeImage(dir, 'x.bin', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
  assert.equal((await readHostImage(jpeg)).ext, '.jpg', 'the format comes from the bytes, not the name');
  const code = async (path) => readHostImage(path).then(() => 'ok', (e) => e.code);
  assert.equal(await code('relative/out.png'), 'IMAGE_PATH_INVALID');
  assert.equal(await code(join(dir, 'missing.png')), 'IMAGE_PATH_INVALID');
  assert.equal(await code(dir), 'IMAGE_PATH_INVALID');
  await symlink(png, join(dir, 'link.png'));
  assert.equal(await code(join(dir, 'link.png')), 'IMAGE_PATH_INVALID');
  assert.equal(await code(await placeImage(dir, 'notes.png', Buffer.from('hello'))), 'IMAGE_TYPE_UNSUPPORTED');
  assert.equal(await code(await placeImage(dir, 'x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))), 'IMAGE_TYPE_UNSUPPORTED');
  const big = await placeImage(dir, 'big.png');
  await truncate(big, MAX_IMAGE_BYTES + 1);
  assert.equal(await code(big), 'IMAGE_TOO_LARGE');
});

test('writeAssetOnce writes assets/<name> once: the same bytes again pass, other bytes, bad names, linked folders and links in the way are refused', { skip: posixOnly }, async () => {
  const root = await tempDir('folio-assets-');
  assert.deepEqual(await writeAssetOnce(root, 'pic.png', PNG_A), { written: true });
  assert.deepEqual(await readFile(join(root, 'assets', 'pic.png')), PNG_A);
  assert.deepEqual(await writeAssetOnce(root, 'pic.png', PNG_A), { written: false });
  const code = async (r, name, bytes = PNG_B) => writeAssetOnce(r, name, bytes).then(() => 'ok', (e) => e.code);
  assert.equal(await code(root, 'pic.png'), 'ASSET_IMMUTABLE');
  assert.deepEqual(await readFile(join(root, 'assets', 'pic.png')), PNG_A, 'never overwritten');
  for (const name of ['../out.png', 'a/b.png', '.hidden.png', 'pic.exe', 'Pic.png']) assert.equal(await code(root, name), 'ASSET_NAME_INVALID', name);
  const outside = await tempDir('folio-outside-');
  await symlink(join(outside, 'target.png'), join(root, 'assets', 'dangling.png'));
  assert.equal(await code(root, 'dangling.png'), 'ASSET_IMMUTABLE');
  assert.deepEqual(await readdir(outside), [], 'nothing written through the link');
  assert.deepEqual((await readdir(join(root, 'assets'))).filter((n) => n.endsWith('.tmp')), []);
  const linked = await tempDir('folio-linked-');
  await mkdir(join(outside, 'assets'));
  await symlink(join(outside, 'assets'), join(linked, 'assets'));
  assert.equal(await code(linked, 'pic.png'), 'ASSETS_DIR_INVALID');
  assert.deepEqual(await readdir(join(outside, 'assets')), []);
});

test('writeAssetOnce cleans up the tmp file even when the write fails midway', { skip: posixOnly }, async () => {
  const root = await tempDir('folio-assets-write-fail-');
  async function* failingIterable() {
    yield Buffer.alloc(1024);
    throw new Error('write failed');
  }
  await assert.rejects(
    () => writeAssetOnce(root, 'fail.png', failingIterable()),
    { message: 'write failed' }
  );
  const files = await readdir(join(root, 'assets'));
  assert.deepEqual(files.filter((n) => n.endsWith('.tmp')), [], 'no tmp files left behind');
});

test('readHostImage reads a 65537-byte PNG correctly with content equality', { skip: posixOnly }, async () => {
  const dir = await tempDir('folio-intake-65537-');
  const header = PNG_A.subarray(0, 8);
  const filler = Buffer.alloc(65537 - 8, 0);
  const bytes = Buffer.concat([header, filler]);
  const path = await placeImage(dir, 'large.png', bytes);
  const read = await readHostImage(path);
  assert.deepEqual(read.bytes, bytes, 'bytes match exactly');
  assert.equal(read.ext, '.png');
  assert.equal(read.hash, sha256(bytes));
});

test('readHostImage reads exactly MAX_IMAGE_BYTES with content equality', { skip: posixOnly }, async () => {
  const dir = await tempDir('folio-intake-max-');
  const header = PNG_A.subarray(0, 8);
  const filler = Buffer.alloc(MAX_IMAGE_BYTES - 8, 0);
  const bytes = Buffer.concat([header, filler]);
  assert.equal(bytes.length, MAX_IMAGE_BYTES);
  const path = await placeImage(dir, 'max.png', bytes);
  const read = await readHostImage(path);
  assert.deepEqual(read.bytes, bytes, 'bytes match exactly');
  assert.equal(read.ext, '.png');
});

test('readHostImage rejects MAX_IMAGE_BYTES + 1 as IMAGE_TOO_LARGE', { skip: posixOnly }, async () => {
  const dir = await tempDir('folio-intake-oversized-');
  const header = PNG_A.subarray(0, 8);
  const filler = Buffer.alloc(MAX_IMAGE_BYTES - 7, 0);
  const bytes = Buffer.concat([header, filler]);
  assert.equal(bytes.length, MAX_IMAGE_BYTES + 1);
  const path = await placeImage(dir, 'oversized.png', bytes);
  await assert.rejects(
    () => readHostImage(path),
    { code: 'IMAGE_TOO_LARGE' }
  );
});
