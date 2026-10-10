import { lockGateFault } from './lock-gate-fault.js';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { FolioError } from '../errors.js';
import { assertManagedPath } from '../util/managed-path.js';

/** All writers hold this short OS-released gate; owners must wait to clean up their live lock. */
export async function withLockGate(root, fn, { waitForRelease = false } = {}) {
  const path = join(root, '.folio', 'runs', '.lock-gate.sqlite');
  for (const suffix of ['', '-journal', '-wal', '-shm']) await assertManagedPath(root, path + suffix);
  await mkdir(join(root, '.folio', 'runs'), { recursive: true });
  let db;
  let active = false;
  try {
    db = new DatabaseSync(path);
    db.exec('PRAGMA busy_timeout = 0');
    // Never synchronously wait on another asynchronous flow in this process.
    const deadline = performance.now() + 500;
    for (;;) {
      try { db.exec('BEGIN IMMEDIATE'); active = true; break; }
      catch (error) {
        if (error.errcode !== 5 && error.errcode !== 6) throw error;
        if (!waitForRelease && performance.now() >= deadline) throw new FolioError('WORK_LOCKED', 'work lock gate is busy', { lock: path });
        await setTimeout(10);
      }
    }
    await lockGateFault('afterBegin');
    const result = await fn();
    db.exec('COMMIT'); active = false;
    return result;
  } catch (error) {
    if (error instanceof FolioError) throw error;
    throw new FolioError('WORK_LOCK_GATE_FAILED', 'work lock gate cannot be used; preserve it for investigation', { path, cause: error.message });
  } finally {
    if (active) db.exec('ROLLBACK');
    db?.close();
  }
}
