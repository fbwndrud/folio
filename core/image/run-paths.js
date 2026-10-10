import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';

/**
 * 그림 실행이 쓸 경로의 기존 구성 요소를 검사한다. 없는 경로는 호출자가 만들 수 있다.
 * 정적 링크(끊긴 링크 포함)와 파일/폴더 종류가 틀린 경로는 읽기·쓰기 전에 거부한다.
 * 검사 뒤 다른 프로세스가 폴더를 바꾸는 경합까지 막는 openat 기반 보장은 아니다.
 * parts 는 호출자가 검증한 고정 이름 또는 실행 id/그림 이름만 받는다.
 */
export async function assertImageRunPath(root, parts, { file = false } = {}) {
  let path = root;
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const info = await lstat(path).catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
    if (!info) return;
    const expectFile = file && index === parts.length - 1;
    if (info.isSymbolicLink() || (expectFile ? !info.isFile() : !info.isDirectory())) {
      throw new FolioError('IMAGE_RUN_PATH_UNSAFE', 'image run path must use real directories and regular files', { path });
    }
  }
}

/** 공용 잠금이 .folio/runs 를 만들기 전에 그림 실행의 상위 경로를 확인한다. 노드 실행기의 정책은 바꾸지 않는다. */
export async function assertImageRunParents(root) {
  await assertImageRunPath(root, ['.folio', 'runs']);
  await assertImageRunPath(root, ['.folio', 'image-runs']);
}
