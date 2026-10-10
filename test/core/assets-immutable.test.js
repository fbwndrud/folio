import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chmod, cp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAssets } from '../../core/store/assets.js';
import { openWork } from '../../core/store/work.js';
import { readAssetFile } from '../../core/view/asset-file.js';
import { copyFixture, fixturePath, tempDir } from '../support/fixtures.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const posixOnly = process.platform === 'win32' ? 'needs POSIX files' : false;

/** 작품에 그림 설명서 하나를 더한다. file 자리에는 부르는 쪽이 무엇이든 둔다. */
async function addAsset(root, id, file) {
  await writeFile(join(root, 'assets', `${id}.yaml`), `id: ${id}\nfile: ${file}\nbrief: {}\n`);
}
/** 끝나지 않으면 실패한다(FIFO 에서 멈추는 회귀를 잡는다). */
const within = (promise, ms = 3000) => Promise.race([promise, new Promise((_, reject) => { setTimeout(() => reject(new Error('timed out')), ms).unref(); })]);

test('C0: an asset whose file is a folder, or sits under a file, opens as a warning — never EISDIR/ENOTDIR — and is not served', async () => {
  const root = await copyFixture('novel-3level');
  await mkdir(join(root, 'assets', 'shelf.png'));
  await addAsset(root, 'img-shelf', 'shelf.png');
  await writeFile(join(root, 'assets', 'flat.png'), PNG);
  await addAsset(root, 'img-under', 'flat.png/inner.png');
  const work = await openWork(root);
  assert.deepEqual(work.warnings.filter((w) => w.id === 'img-shelf' || w.id === 'img-under').map((w) => [w.id, w.code]), [
    ['img-shelf', 'ASSET_FILE_NOT_REGULAR'], ['img-under', 'ASSET_FILE_MISSING'],
  ]);
  await assert.rejects(readAssetFile(root, 'img-shelf'), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'not a file');
  await assert.rejects(readAssetFile(root, 'img-under'), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'missing');
  assert.equal((await readAssetFile(root, 'img-rooftop')).type, 'image/svg+xml');
});

test('C0: a FIFO in the asset file place neither hangs opening the work nor a picture request', { skip: posixOnly }, async () => {
  const root = await copyFixture('novel-3level');
  execFileSync('mkfifo', [join(root, 'assets', 'pipe.png')]);
  await addAsset(root, 'img-pipe', 'pipe.png');
  const work = await within(openWork(root));
  assert.ok(work.warnings.some((w) => w.id === 'img-pipe' && w.code === 'ASSET_FILE_NOT_REGULAR'));
  await assert.rejects(within(readAssetFile(root, 'img-pipe')), { code: 'ASSET_FILE_UNAVAILABLE' });
});

test('C0: a picture request reads only its own file — other image files are not re-read and hashed per request', { skip: posixOnly || (process.getuid?.() === 0 && 'root reads anything') }, async () => {
  const root = await copyFixture('novel-3level');
  const locked = join(root, 'assets', 'locked.png');
  await writeFile(locked, PNG);
  await addAsset(root, 'img-locked', 'locked.png');
  await chmod(locked, 0o000);
  try {
    await assert.rejects(readAssets(root), { code: 'EACCES' }, 'opening the work still hashes every image');
    const { assets } = await readAssets(root, { hashFiles: false });
    assert.equal(assets.get('img-locked').rev, null);
    assert.equal((await readAssetFile(root, 'img-rooftop')).type, 'image/svg+xml');
  } finally {
    await chmod(locked, 0o600);
  }
});

// C0 fix round 1 — opus 공격 리뷰가 찾은 것: 소켓·심볼릭 링크 고리·NUL 바이트가 원문 오류(EOPNOTSUPP/ELOOP/
// ERR_INVALID_ARG_VALUE)를 그대로 던져 작품 열기·그림 요청을 INTERNAL_ERROR 로 만들었다.

test('C0: a Unix socket in the asset file place is a warning, not a crash — readAssetFile refuses it as not a file', { skip: posixOnly }, async (t) => {
  // 소켓 bind 는 커널 sockaddr_un 길이 한도(보통 104바이트, 여유를 두고 100)가 있다 — 짧은 접두어로도 못 맞으면 건너뛴다.
  const root = await tempDir('f-');
  await cp(fixturePath('novel-3level'), root, { recursive: true });
  const sockPath = join(root, 'assets', 'sock.png');
  if (Buffer.byteLength(sockPath) > 100) { t.skip('temp path too long for a unix socket on this machine'); return; }
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(sockPath, resolve); });
  try {
    await addAsset(root, 'img-sock', 'sock.png');
    const work = await within(openWork(root));
    assert.ok(work.warnings.some((w) => w.id === 'img-sock' && w.code === 'ASSET_FILE_NOT_REGULAR'));
    await assert.rejects(within(readAssetFile(root, 'img-sock')), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'not a file');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('C0: a symbolic link loop in the asset file place is a warning, not a crash — readAssetFile refuses it as a link', { skip: posixOnly }, async () => {
  const root = await copyFixture('novel-3level');
  await symlink('loop.png', join(root, 'assets', 'loop.png'));
  await addAsset(root, 'img-loop', 'loop.png');
  const work = await within(openWork(root));
  assert.ok(work.warnings.some((w) => w.id === 'img-loop' && w.code === 'ASSET_FILE_NOT_REGULAR'));
  await assert.rejects(within(readAssetFile(root, 'img-loop')), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'link');
});

test('C0: a NUL byte in the asset file path never throws raw — it is a warning, and readAssetFile refuses it', { skip: posixOnly }, async () => {
  const root = await copyFixture('novel-3level');
  await writeFile(join(root, 'assets', 'img-nul.yaml'), 'id: img-nul\nfile: "flat.png\\0evil.png"\nbrief: {}\n');
  const work = await within(openWork(root));
  assert.ok(work.warnings.some((w) => w.id === 'img-nul' && w.code === 'ASSET_FILE_MISSING'));
  await assert.rejects(within(readAssetFile(root, 'img-nul')), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'path');
});
