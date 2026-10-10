import { lockGateFault } from './lock-gate-fault.js';
import { withLockGate } from './lock-gate.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FolioError } from '../errors.js';
import { assertManagedPath } from '../util/managed-path.js';
import { recoverFileTx } from '../util/file-tx.js';

const LOCK_FILE = '.lock';
const queues = new Map();
/** 지금 이 비동기 흐름이 쥐고 있는 작품 root 들. 안에서 같은 root 를 다시 잠그면 영원히 기다리므로 바로 거부한다. */
const held = new AsyncLocalStorage();

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== 'ESRCH'; }
}

async function readLock(path) {
  try { return await readFile(path, 'utf8'); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

/** 형식이 유효한 잠금의 로컬 PID가 죽었을 때만 복구한다. 시계 차이는 소유권의 증거가 아니다. */
function isDeadOwner(text) {
  let info;
  try { info = JSON.parse(text); } catch { return false; }
  if (!Number.isInteger(info?.pid) || info.pid <= 0 || info.pid > 0x7fffffff || typeof info.at !== 'string') return false;
  const at = new Date(info.at);
  if (!Number.isFinite(at.getTime()) || at.toISOString() !== info.at) return false;
  return !pidAlive(info.pid);
}

async function acquire(dir) {
  await mkdir(dir, { recursive: true });
  const path = join(dir, LOCK_FILE);
  const token = randomUUID();
  const body = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token });
  const temp = join(dir, `${LOCK_FILE}.${token}.tmp`);
  await writeFile(temp, body);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { await link(temp, path); return { path, body }; } catch (error) { if (error?.code !== 'EEXIST') throw error; }
      const current = await readLock(path);
      if (current === null) continue;
      if (!isDeadOwner(current)) throw new FolioError('WORK_LOCKED', 'another process is running this work', { lock: path });
      await lockGateFault('deadOwnerObserved');
      await unlink(path);
    }
    throw new FolioError('WORK_LOCKED', 'could not take the work lock', { lock: path });
  } finally {
    await unlink(temp).catch(() => {});
  }
}

async function release({ path, body }) {
  if ((await readLock(path)) === body) await unlink(path).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

/**
 * 한 작품에서 run/resume/decide 는 한 번에 하나만 돈다.
 * 같은 프로세스 안은 root 별 대기열로, 프로세스끼리는 .folio/runs/.lock 으로 줄 세운다.
 * 획득·죽은 소유자 복구·해제는 짧은 SQLite 게이트 안에서만 수행한다.
 * 유효한 잠금의 주인 프로세스가 죽었다면 다음 호출이 가져간다.
 */
export async function withWorkLock(root, fn) {
  const key = resolve(root);
  const holding = held.getStore() ?? new Set();
  if (holding.has(key)) throw new FolioError('WORK_LOCK_REENTRANT', 'this work is already locked by the calling run/resume/decide', { root: key });
  const previous = queues.get(key) ?? Promise.resolve();
  /** @type {(value?: unknown) => void} */
  let finish = () => {};
  const mine = new Promise((done) => { finish = done; });
  const tail = previous.then(() => mine);
  queues.set(key, tail);
  await previous;
  try {
    await assertManagedPath(key, join(key, '.folio', 'ledger'), { directory: true });
    await assertManagedPath(key, join(key, '.folio', 'runs'), { directory: true });
    await assertManagedPath(key, join(key, '.folio', 'runs', LOCK_FILE));
    const lock = await withLockGate(key, () => acquire(join(key, '.folio', 'runs')));
    try {
      // 여러 파일 쓰기(이름 바꾸기)가 죽으며 남긴 반쪽 상태는 잠금을 잡은 쪽이 먼저 되돌린다.
      await recoverFileTx(key);
      return await held.run(new Set([...holding, key]), fn);
    } finally { await withLockGate(key, () => release(lock), { waitForRelease: true }); }
  } finally {
    finish();
    if (queues.get(key) === tail) queues.delete(key);
  }
}
