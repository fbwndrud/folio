import { isAbsolute } from 'node:path';
import { FolioError } from '../errors.js';

export const ID = /^[a-z0-9][a-z0-9-]*$/;

/** id 형식을 검사한다. 파일 경로를 만들기 전에 반드시 거쳐야 한다. */
export function assertId(value, what) {
  if (typeof value !== 'string' || !ID.test(value)) throw new FolioError('ID_INVALID', `${what}: ${value}`);
}

/** 명시적 path 필드가 root 밖으로 나가지 않는지 검사한다. */
export function assertSafePath(path, what) {
  if (path === undefined) return;
  if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
    throw new FolioError('PATH_INVALID', `${what}: ${path}`);
  }
}
