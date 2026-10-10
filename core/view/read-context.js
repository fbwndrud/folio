import { openWork } from '../store/work.js';
import { readLedgerView } from './ledgers.js';
import { statusOrNull } from './receipt-view.js';
import { evidenceReadState } from './evidence-view.js';
import { writingCheckpoint } from './writing-checkpoint.js';

/** Private to a single read/export; never reused across HTTP requests or mutations. */
export async function writingReadContext(root, packs) {
  const work = await openWork(root);
  const checkpoint = await writingCheckpoint(root, work);
  const receipts = await readLedgerView(root, 'receipts');
  const status = await statusOrNull(root, packs);
  const evidence = await evidenceReadState(root, work);
  return { work, checkpoint, receipts, status, evidence };
}
