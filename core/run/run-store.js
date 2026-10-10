import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { assertManagedPath } from '../util/managed-path.js';
import { listEntries, readTextOrNull, writeFileAtomic } from '../util/fs.js';

export const OPEN_STATES = new Set(['active', 'awaiting_model', 'awaiting_user', 'committing']);
const RUN_ID = /^run-[a-z0-9-]+$/;
const KNOWN_STATES = new Set([...OPEN_STATES, 'waiting_children', 'done', 'skipped', 'abandoned', 'flagged']);

function parseRun(text) {
  try {
    const run = JSON.parse(text ?? '');
    return run && typeof run === 'object' && typeof run.runId === 'string' && typeof run.state === 'string' ? run : null;
  } catch {
    return null;
  }
}

/** 진행 중 작업 상태. 매 단계 뒤 원자적으로 저장해 프로세스가 죽어도 이어간다. */
export function createRunStore(root) {
  const dir = join(root, '.folio', 'runs');
  const pathOf = (runId) => {
    if (!RUN_ID.test(runId)) throw new FolioError('RUN_ID_INVALID', String(runId));
    return join(dir, `${runId}.json`);
  };
  return {
    pathOf,
    async save(run) { await assertManagedPath(root, pathOf(run.runId)); await writeFileAtomic(pathOf(run.runId), `${JSON.stringify(run, null, 2)}\n`); },
    async load(runId) {
      await assertManagedPath(root, pathOf(runId));
      const text = await readTextOrNull(pathOf(runId));
      if (text === null) throw new FolioError('RUN_NOT_FOUND', runId);
      return JSON.parse(text);
    },
    /** 기본 목록은 손상을 sentinel로 알린다. strict 진단은 손상·파일명 불일치·알 수 없는 상태를 거부한다. */
    async list({ strict = false } = {}) {
      await assertManagedPath(root, dir, { directory: true });
      const runs = [];
      const corrupt = [];
      for (const entry of await listEntries(dir)) {
        if (entry.isSymbolicLink()) throw new FolioError('MANAGED_PATH_UNSAFE', 'run cache cannot be a symbolic link');
        if (strict && entry.name.endsWith('.json') && !entry.isFile()) throw new FolioError('RUN_FILE_CORRUPT', 'writing run must be a regular file', { path: entry.name });
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const run = parseRun(await readTextOrNull(join(dir, entry.name)));
        if (strict && (!run || !RUN_ID.test(run.runId) || `${run.runId}.json` !== entry.name || !KNOWN_STATES.has(run.state)
          || typeof run.nodeId !== 'string' || !run.nodeId)) {
          throw new FolioError('RUN_FILE_CORRUPT', 'cannot establish writing run state', { path: entry.name });
        }
        if (run) runs.push(run);
        else corrupt.push({ runId: entry.name.slice(0, -'.json'.length), error: 'RUN_FILE_CORRUPT' });
      }
      runs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.runId < b.runId ? -1 : 1));
      return [...runs, ...corrupt];
    },
  };
}
