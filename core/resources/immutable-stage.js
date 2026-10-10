import { basename } from 'node:path';
import { assertManagedPath } from '../util/managed-path.js';

const IMMUTABLE_STAGE = /^\.immutable-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/;

/** Known interrupted stages are preserved, but links and special files remain errors. */
export async function isImmutableStage(root, path) {
  if (!IMMUTABLE_STAGE.test(basename(path))) return false;
  await assertManagedPath(root, path);
  return true;
}
