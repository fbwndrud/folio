import { FolioError } from '../errors.js';
import { withWorkLock } from '../run/work-lock.js';
import { openWork } from '../store/work.js';
import { assetRefsInBody } from '../store/assets.js';
import { openLedger } from '../ledger/ledger.js';
import { ASSETS_LEDGER, assetView } from './records.js';
import { assertAssetDirs } from './files.js';
import { assertFeature } from '../work/features.js';

export function assetUsages(work, a) {
  return [...work.tree.nodes.values()].filter((n) => (a.nodeIds ?? []).includes(n.id) || n.assets.includes(a.id) || assetRefsInBody(n.body).includes(a.id))
    .map((n) => ({ nodeId: n.id, title: n.title, status: n.status }));
}

export function assetsSummary(work) {
  const assets = [...work.assets.values()].filter((a) => a.managed).map(assetView);
  return { total: assets.length, approved: assets.filter((a) => a.approved).length, pending: assets.filter((a) => !a.approved).map((a) => ({ id: a.id, version: a.version, status: a.status })) };
}

export async function viewAssets(root, id = undefined) {
  await assertAssetDirs(root);
  return withWorkLock(root, async () => {
    const work = await openWork(root); assertFeature(work.config, 'assets');
    if (id === undefined) return { assets: [...work.assets.values()].map((a) => ({ ...assetView(a), usages: assetUsages(work, a) })), summary: assetsSummary(work) };
    const a = work.assets.get(id);
    if (!a) throw new FolioError('ASSET_NOT_FOUND', id);
    return { asset: assetView(a), usages: assetUsages(work, a), history: (await openLedger(root, ASSETS_LEDGER).readAll()).filter((r) => r.id === id) };
  });
}
