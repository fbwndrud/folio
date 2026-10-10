import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** 같은 폴더의 임시 파일에 쓰고 rename 한다. 중간에 죽어도 반쯤 쓴 파일이 남지 않는다. */
export async function writeFileAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export async function readTextOrNull(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** 숨김 항목을 뺀 폴더 목록. 정렬은 코드포인트 순이라 OS와 무관하게 같다. */
export async function listEntries(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
