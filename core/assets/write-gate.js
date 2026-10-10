import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { createImageRunStore, IMAGE_OPEN_STATES } from '../image/run-store.js';

/** Called under the shared work lock, before any managed asset bytes or records are written. */
export async function assertAssetWriterAvailable(root, assetId) {
  const writing = (await createRunStore(root).list()).find((run) => run.error || OPEN_STATES.has(run.state));
  if (writing) throw new FolioError('ASSET_RUN_OPEN', 'finish the writing run before changing assets', { runId: writing.runId });
  const images = await createImageRunStore(root).list({ strict: true });
  const image = images.find((run) => IMAGE_OPEN_STATES.has(run.state));
  if (image) throw new FolioError('ASSET_RUN_OPEN', 'finish the image run before changing assets', { runId: image.runId, assetId: image.assetId });
  // A durable receipt continues reserving its ID even if a mutable run cache disappears.
  const receipt = (await openLedger(root, 'assets').readAll()).find((r) => r.type === 'asset_receipt' && r.assetId === assetId);
  if (receipt) throw new FolioError('ASSET_RUN_OPEN', 'the asset ID is reserved by an image receipt', { runId: receipt.runId, assetId });
}
