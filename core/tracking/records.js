import { openLedger } from '../ledger/ledger.js';
import { assertTrackingIntegrity } from './integrity.js';
import { readEntities } from '../store/entities.js';
import { readTree } from '../store/tree.js';
import { replayTracking } from './replay.js';

export const TRACKING_LEDGER = 'tracking';

/** 기록장 부재는 예전 작품의 정상 상태다. 읽기에서는 디렉터리·head·기록을 만들지 않는다. */
export async function readTracking(root, options = {}) {
  const records = await openLedger(root, TRACKING_LEDGER).readAll();
  const receiptRecords = options.receiptRecords ?? await openLedger(root, 'receipts').readAll();
  await assertTrackingIntegrity(root, { receiptRecords, trackingRecords: records });
  const legacyEntities = options.legacyEntities ?? (await readEntities(root)).entities;
  const nodes = options.nodes ?? (await readTree(root)).nodes;
  const nodeIds = options.nodeIds ?? [...nodes.keys()];
  return replayTracking(records, { ...options, legacyEntities, nodeIds, receiptRecords, nodes });
}
