import { cp, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../core/util/hash.js';
import { fixturePath, tempDir } from './fixtures.js';

/** 합성 vibelore 작품(test/fixtures/vibelore-work)의 경로. 테스트는 이 원본을 읽기만 한다. */
export const VIBELORE_FIXTURE = fixturePath('vibelore-work');

/** 합성 vibelore 작품을 임시 폴더로 복사한다(링크·FIFO 같은 손상을 넣어 볼 때). */
export async function vibeloreCopy() {
  const dir = join(await tempDir('folio-vibelore-'), 'source');
  await cp(VIBELORE_FIXTURE, dir, { recursive: true });
  return dir;
}

/** 가져오기 대상: 아직 없는 새 폴더의 절대 경로. */
export async function importTarget(name = 'work') {
  return join(await tempDir('folio-import-'), name);
}

/** 폴더 안 모든 보통 파일의 상대 경로 → hash(원본이 바뀌지 않았는지 보는 데 쓴다). */
export async function treeHashes(dir) {
  const out = {};
  async function walk(rel) {
    for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out[path] = sha256(await readFile(join(dir, path)));
    }
  }
  await walk('');
  return out;
}
