import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { readAssetFile } from './asset-file.js';

// Private provenance follows each summary without exposing local paths in HTTP/JSON.
const provenance = new WeakMap();
export function rememberSnapshotAsset(summary, asset) {
  provenance.set(summary, asset);
  return summary;
}

/** Copy sequentially from the catalog version that produced the displayed review state. */
export async function* snapshotAssetFiles(root, snapshot) {
  const catalog = new Map();
  const summaries = [
    ...Object.values(snapshot.nodes).flatMap((n) => [...n.assets.inline, ...n.assets.attached]),
    ...Object.values(snapshot.variants?.editions ?? {}).flatMap(e => Object.values(e.nodes)).flatMap(n => [...n.assets.inline, ...n.assets.attached]),
    ...Object.values(snapshot.entities).flatMap((e) => e.assets),
  ];
  for (const summary of summaries) {
    const asset = provenance.get(summary);
    if (!asset) {
      if (summary.known || summary.hasFile) throw new FolioError('ASSET_SNAPSHOT_CHANGED', 'The image snapshot has lost its version evidence', { assetId: summary.id });
      continue; // An unknown reference is already an explicit placeholder.
    }
    const previous = catalog.get(asset.id);
    if (previous && previous.rev !== asset.rev) throw new FolioError('ASSET_SNAPSHOT_CHANGED', 'An image changed while preparing the review copy', { assetId: asset.id });
    catalog.set(asset.id, asset);
  }
  for (const [id, asset] of catalog) {
    if (asset.file === null) continue; // Intentionally planned or reference-only, not missing bytes.
    const file = await readAssetFile(root, id, { assets: catalog });
    // Managed immutable versions are checked by readAssetFile against output.contentHash.
    // Legacy files may change in place; their revision binds the metadata and exact bytes.
    if (!asset.managed && sha256(`${asset.metaText}\u0000${sha256(file.bytes)}`) !== asset.rev) {
      throw new FolioError('ASSET_FILE_UNAVAILABLE', 'An image changed since its snapshot', { assetId: id, reason: 'content changed' });
    }
    yield { id, ...file };
  }
}
