import { constants } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ID } from '../store/ids.js';
import { FolioError } from '../errors.js';
import { assertImageRunPath } from './run-paths.js';
import { listEntries, readTextOrNull, writeFileAtomic } from '../util/fs.js';

/** 그림 실행 파일 자리. 노드 실행(.folio/runs)과 따로 둔다 — 노드 실행 목록·다음 노드 고르기에 끼지 않는다. */
export const IMAGE_RUNS_DIR = join('.folio', 'image-runs');
export const IMAGE_OPEN_STATES = new Set(['active', 'awaiting_model', 'awaiting_user', 'committing']);
const KNOWN_STATES = new Set([...IMAGE_OPEN_STATES, 'done', 'abandoned']);
const RUN_ID = /^imgrun-[a-z0-9]+$/;
const STAGED = /^image-\d+\.(png|jpg|gif|webp)$/;

function parseRun(text) {
  try {
    const run = JSON.parse(text ?? '');
    return run && typeof run === 'object' && typeof run.runId === 'string' && typeof run.state === 'string' ? run : null;
  } catch {
    return null;
  }
}

/** 그림 실행 상태. 매 단계 뒤 원자적으로 저장한다. 호스트가 준 그림 바이트는 실행 폴더 안에 옮겨 둔다(staged). */
export function createImageRunStore(root) {
  const dir = join(root, IMAGE_RUNS_DIR);
  const guard = (parts = [], options = {}) => assertImageRunPath(root, ['.folio', 'image-runs', ...parts], options);
  const pathOf = (runId) => {
    if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new FolioError('IMAGE_RUN_ID_INVALID', String(runId).slice(0, 100));
    return join(dir, `${runId}.json`);
  };
  /** 실행 폴더 안 옮긴 그림의 절대 경로. 이름 규칙(image-<n>.<확장자>) 밖은 만들지 않는다. */
  const stagedPath = (runId, name) => {
    if (typeof name !== 'string' || !STAGED.test(name)) throw new FolioError('IMAGE_STAGED_NAME_INVALID', String(name).slice(0, 100));
    pathOf(runId);
    return join(dir, runId, name);
  };
  /** 옮긴 그림 바이트. 링크를 따라가지 않고 보통 파일만 읽는다. 정적 링크·잘못된 경로 종류는 거부하고, 파일이 없거나 열 수 없으면 null. */
  async function readStaged(runId, name) {
    const path = stagedPath(runId, name);
    await guard([runId, name], { file: true });
    let handle;
    try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch { return null; }
    try { return (await handle.stat()).isFile() ? await handle.readFile() : null; } finally { await handle.close(); }
  }
  return {
    pathOf,
    stagedPath,
    readStaged,
    async save(run) {
      const path = pathOf(run.runId);
      await guard([`${run.runId}.json`], { file: true });
      await writeFileAtomic(path, `${JSON.stringify(run, null, 2)}\n`);
    },
    async load(runId) {
      const path = pathOf(runId);
      await guard([`${runId}.json`], { file: true });
      const run = parseRun(await readTextOrNull(path));
      if (!run) throw new FolioError('IMAGE_RUN_NOT_FOUND', String(runId));
      return run;
    },
    /** 실행을 만든 차례로 읽는다. Writer gate는 strict로 손상/알 수 없는 예약을 거부한다. */
    async list({ strict = false } = {}) {
      const runs = [];
      await guard();
      for (const entry of await listEntries(dir)) {
        if (!entry.name.endsWith('.json')) continue;
        await guard([entry.name], { file: true });
        const run = parseRun(await readTextOrNull(join(dir, entry.name)));
        if (strict && (!run || !RUN_ID.test(run.runId) || `${run.runId}.json` !== entry.name
          || !KNOWN_STATES.has(run.state) || typeof run.assetId !== 'string' || !ID.test(run.assetId) || run.assetId.length > 100)) {
          throw new FolioError('IMAGE_RUN_INVALID', 'cannot establish image asset reservations', { path: entry.name });
        }
        if (run) runs.push(run);
      }
      return runs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.runId < b.runId ? -1 : 1));
    },
    /** 옮긴 그림을 한 번만 쓴다(wx). 이름은 시도 번호로 늘 새로 정한다. 저수준 재호출에서 같은 바이트가 이미 있으면 그대로 둔다(public active 재개는 여전히 skip 전용). */
    async stage(runId, name, bytes) {
      const path = stagedPath(runId, name);
      await guard([runId, name], { file: true });
      await mkdir(join(path, '..'), { recursive: true });
      try {
        await writeFile(path, bytes, { flag: 'wx' });
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
        const existing = await readStaged(runId, name);
        if (!existing || !existing.equals(Buffer.from(bytes))) throw new FolioError('IMAGE_STAGED_CONFLICT', `${name} already holds another picture`, { name });
      }
      return path;
    },
  };
}
