import { withWorkLock } from '../run/work-lock.js';
import { buildIndexGeneration, publishIndexGeneration } from './generation.js';
export { indexPath } from './generation.js';

/** 작품 입력을 같은 잠금 범위에서 읽고 안전하게 새 index.db를 공개한다. */
export async function rebuildIndex(root, options = {}) {
  return withWorkLock(root, async () => publishIndexGeneration(root, await buildIndexGeneration(root, options)));
}
