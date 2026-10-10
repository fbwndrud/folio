import { lstat, readdir, rename } from 'node:fs/promises';
import { FolioError } from '../errors.js';
import { NODE_FILE } from '../store/tree.js';

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** 이미 있는 항목은 절대 덮어쓰지 않는다. */
export async function assertAbsent(path) {
  if (await exists(path)) throw new FolioError('STRUCTURE_TARGET_EXISTS', path);
}

export async function safeRename(from, to) {
  await assertAbsent(to);
  await rename(from, to);
}

/** 폴더 안에서 readTree 가 노드로 읽는 항목 이름(폴더, _node.md 가 아닌 .md). */
async function nodeEntries(dir) {
  let list;
  try { list = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return list.filter((e) => !e.name.startsWith('.') && (e.isDirectory() || (e.isFile() && e.name.endsWith('.md') && e.name !== NODE_FILE)))
    .map((e) => e.name).sort();
}

/** 호출자가 넘긴 work 가 디스크와 같은지 확인한다. 다르면(다른 구조 변경 뒤의 옛 work) 아무것도 쓰지 않고 멈춘다. */
export async function assertFresh(dir, expectedNames) {
  const actual = await nodeEntries(dir);
  const expected = [...expectedNames].sort();
  if (actual.length !== expected.length || actual.some((name, i) => name !== expected[i])) {
    throw new FolioError('STRUCTURE_STALE', `${dir} changed since the work was opened; reopen it and retry`, { expected, actual });
  }
}
