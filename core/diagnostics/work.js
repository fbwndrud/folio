import { workStatus } from '../status.js';
import { openLedger } from '../ledger/ledger.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { createImageRunStore, IMAGE_OPEN_STATES } from '../image/run-store.js';
import { readAssets } from '../store/assets.js';
import { readAssetFile } from '../view/asset-file.js';
import { viewWorkspaceMode } from '../view/workspace-mode.js';
import { viewResources } from '../view/resources.js';
import { withResourceViewCheckpoint } from '../view/resource-checkpoint.js';
import { metadataEntries } from '../projections/metadata.js';
import { pendingFileTxStatus } from '../util/file-tx.js';
import { inspectPaths, ledgerNames } from './paths.js';

/** Read-only inspection. Never enters toolbox locks, recovery, index or publication writers. */
export async function inspectWork(root, { packs }) {
  const checks = [];
  const actions = new Set();
  const add = (name, status, message, details = undefined) => checks.push({ name, status, message, ...(details === undefined ? {} : { details }) });
  const check = async (name, read) => {
    try { return await read(); }
    catch (error) {
      add(name, 'error', 'Inspection could not verify this part of the work.', { code: error.code ?? 'INSPECTION_FAILED', message: error.message, ...error.details });
      actions.add('Stop writing and preserve the entire folder. Compare a known good backup in a new folder; do not edit activity records.');
      return null;
    }
  };
  const paths = await check('paths', async () => { await inspectPaths(root); return true; });
  if (paths) add('paths', 'ok', 'The work contains regular files and folders.');
  // Do not proceed through an unsafe path or treat an absent root as an empty work.
  if (!paths) return { ok: false, checks, actions: [...actions] };
  const mode = await check('workspace', () => viewWorkspaceMode(root));
  if (!mode) return { ok: false, checks, actions: [...actions] };
  add('workspace', 'ok', mode.mode === 'writing' ? 'Writing work found.' : 'Resource workspace found.');
  for (const name of await check('activity-records', () => ledgerNames(root)) ?? []) {
    await check(`activity-record:${name}`, async () => {
      const result = await openLedger(root, name).verify();
      add(`activity-record:${name}`, result.ok ? 'ok' : 'error', result.ok ? 'Activity record verified.' : 'Activity record has changed or is damaged.', result);
      if (!result.ok) actions.add('Stop writing. Preserve activity records and compare a known good backup in a new folder.');
    });
  }
  await check('pending-write', async () => {
    const tx = await pendingFileTxStatus(root);
    add('pending-write', tx.pending ? tx.valid ? 'warning' : 'error' : 'ok', tx.pending ? tx.valid ? 'An interrupted write needs attention.' : 'An interrupted write cannot be safely verified.' : 'No interrupted write found.', tx);
    if (tx.pending) actions.add(tx.valid ? 'Back up the whole folder before reconnecting. A deliberate writing tool may recover the interrupted write; inspection does not recover it.' : 'Stop writing and preserve .folio/tx. Compare the affected files with a known good backup; do not remove recovery records automatically.');
  });
  await check('writing-runs', async () => {
    const runs = await createRunStore(root).list({ strict: true });
    const pending = runs.filter((r) => OPEN_STATES.has(r.state) || r.state === 'waiting_children');
    add('writing-runs', pending.length ? 'warning' : 'ok', pending.length ? 'Writing is waiting for an answer, decision or completion.' : 'No open writing runs.', { pending: pending.map(({ runId, nodeId, state }) => ({ runId, nodeId, state })) });
    if (pending.length) actions.add('Reconnect the same folder with the same Folio version and inspect pending questions before continuing. Answer only the current request; do not infer approval.');
  });
  await check('image-runs', async () => {
    const runs = await createImageRunStore(root).list({ strict: true });
    const pending = runs.filter((r) => IMAGE_OPEN_STATES.has(r.state));
    add('image-runs', pending.length ? 'warning' : 'ok', pending.length ? 'An image run is waiting for completion.' : 'No open image runs.', { pending: pending.map(({ runId, assetId, state }) => ({ runId, assetId, state })) });
    if (pending.length) actions.add('Reconnect and inspect the pending image request. Preserve staged images and provide only an explicit author decision.');
  });
  if (mode.mode === 'writing') await check('writing-status', async () => {
    const status = await workStatus(root, { packs });
    const failedLedgers = Object.entries(status.ledger).filter(([, verification]) => verification.ok === false);
    if (failedLedgers.length) {
      for (const [name, verification] of failedLedgers) {
        add(`writing-status:${name}`, 'error', 'Activity record could not be verified for writing.', verification);
      }
      actions.add('Stop writing. Preserve activity records and compare a known good backup in a new folder.');
      return;
    }
    const variants = Object.values('variants' in status ? status.variants ?? {} : {});
    const drift = [...status.drift, ...variants.flatMap((v) => v.drift)];
    const stale = [...status.stale, ...variants.flatMap((v) => v.stale)];
    add('writing-status', drift.length || stale.length || status.warnings.length || status.flagged.length ? 'warning' : 'ok',
      drift.length ? 'Edited since review: review the changes before finalizing.' : stale.length ? 'Review needed: relevant information or checks changed.' : status.flagged.length ? 'Must fix: review the flagged sections.' : status.warnings.length ? 'Some writing information needs attention.' : 'Writing status verified.', { drift, stale, flagged: status.flagged, warnings: status.warnings });
    if (drift.length) actions.add('Review and finalize changes with an explicit author decision. Preserve the edited text.');
    if (stale.length || status.flagged.length) actions.add('Review the affected sections again. Inspection never rewrites text or bypasses must-fix checks.');
    if (status.warnings.length) actions.add('Inspect the writing warnings and preserve the affected files before making changes.');
  });
  await check('managed-assets', async () => {
    const { assets, errors, warnings } = await readAssets(root);
    if (errors.length) {
      add('managed-assets', 'error', 'Asset activity records could not be verified.', { errors });
      actions.add('Preserve the asset files and activity records; compare a known good backup.');
      return;
    }
    let count = 0;
    for (const asset of assets.values()) {
      if (!asset.managed || asset.output?.kind !== 'file') continue;
      await readAssetFile(root, asset.id, { assets }); count += 1;
    }
    add('managed-assets', warnings.length ? 'warning' : 'ok', 'Managed image files checked against their recorded content fingerprints.', { verifiedFiles: count, warnings });
    if (warnings.length) actions.add('Inspect missing or changed image files against the backup before continuing.');
  });
  await check('resources', () => withResourceViewCheckpoint(root, async (state) => {
    const current = await metadataEntries(root, state);
    const view = await viewResources(root);
    const reviewRequired = current.filter((e) => e.reviewRequired);
    const unindexed = view.unavailableReason === 'not-indexed' && current.length > 0;
    const warning = unindexed || view.freshness === 'stale' || reviewRequired.length > 0 || current.some((e) => e.storageStatus === 'external_unobserved');
    add('resources', warning ? 'warning' : 'ok', unindexed ? 'Resources have not been indexed; their original evidence was verified.' : warning ? 'Review needed: Resources are older than current selections or contain unobserved external references.' : 'Selected sources and approved output evidence verified.',
      { checkpoint: state.checkpoint, freshness: view.freshness, unavailableReason: view.unavailableReason, verifiedEntries: current.length, reviewRequired: reviewRequired.map(({ resourceId, revisionId }) => ({ resourceId, revisionId })), selfReview: current.some((e) => e.selfReview === true) });
    if (warning) actions.add('Inspect current selections and prior approvals. Refresh the metadata index explicitly if needed; outputs needing review require an author decision.');
  }));
  return { ok: !checks.some((c) => c.status === 'error'), checks, actions: [...actions] };
}
