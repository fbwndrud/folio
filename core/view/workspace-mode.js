import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { FolioError } from '../errors.js';
import { loadWorkConfig } from '../work/config.js';
import { assertManagedPath } from '../util/managed-path.js';
import { createResourceStore } from '../resources/revisions.js';
import { isImmutableStage } from '../resources/immutable-stage.js';
import { metadataEntries } from '../projections/metadata.js';
import { readWorkspaceState } from '../publications/state.js';

/** Only absent work.yaml admits a resource-only workspace; invalid writing config must surface. */
export async function viewWorkspaceMode(root) {
  try {
    const { config } = await loadWorkConfig(root);
    return { mode: 'writing', config, title: config.title };
  } catch (error) {
    if (!(error instanceof FolioError) || error.code !== 'WORK_NOT_FOUND') throw error;
    const directory = join(root, '.folio', 'resources', 'revisions');
    await assertManagedPath(root, directory, { directory: true });
    const names = await readdir(directory).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
    let registered = false;
    const store = createResourceStore(root);
    for (const name of names) {
      if (await isImmutableStage(root, join(directory, name))) continue;
      if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'unsupported resource revision filename');
      await store.readRevision('sha256:' + name.slice(0, -5));
      registered = true;
    }
    if (!registered) throw error;
    await metadataEntries(root, await readWorkspaceState(root));
    return { mode: 'resources', config: null, title: basename(root) };
  }
}

export function workspaceCapabilities(mode, config) {
  return { resources: true, writing: mode === 'writing', viewerExport: mode === 'resources' || config.features.viewerExport,
    viewerToggles: mode === 'writing' && config.features.viewerToggles };
}

export function workspaceScreens(config) {
  const screens = ['reading', 'entities', 'receipts', 'stages', 'graph', 'promises', 'check-sets', 'resources'];
  if (config.features.blocks || config.features.bibliography || config.features.termIndex) screens.push('blocks');
  if (config.features.sources) screens.push('sources');
  return screens;
}
