import { FolioError } from '../errors.js';
import { readWorkspaceState, sameCheckpoint } from '../publications/state.js';

/** Read-only boundary: no work lock, recovery, marker, or refresh. */
export async function withResourceViewCheckpoint(root, read) {
  const state = await readWorkspaceState(root);
  let result;
  let readError;
  let failed = false;
  try { result = await read(state); } catch (error) { failed = true; readError = error; }
  const current = await readWorkspaceState(root);
  if (!sameCheckpoint(state.checkpoint, current.checkpoint)) throw new FolioError('RESOURCE_VIEW_CHANGED', 'workspace changed while reading; retry the view');
  if (failed) throw readError;
  return result;
}
