import { lastCommits, receiptsById, RESERVED_RECEIPT_FIELDS, validateReceipt } from '../ledger/receipts.js';
import { MAIN, variantOf } from '../variants/model.js';
import { canonicalJson, sha256 } from '../util/hash.js';
const EVENT_META = new Set(['type', 'nodeId', 'receiptId', 'seq', 'at', 'prev', 'hash', 'supersedes']);
const plainEvent = (event) => Object.fromEntries(Object.entries(event).filter(([key]) => !EVENT_META.has(key)));
/** 기록장 I/O는 호출자가 한다. 현재 main 커밋·원고·영수증의 사건을 정확히 결속한다. */
export function branchEvidence(work, events, receiptRecords) {
  const commits = lastCommits(receiptRecords), receipts = receiptsById(receiptRecords), byNode = new Map();
  for (const event of events) {
    if (event.type !== 'event' || variantOf(event) !== MAIN) continue;
    if (!byNode.has(event.nodeId)) byNode.set(event.nodeId, []);
    byNode.get(event.nodeId).push(event);
  }
  const cache = new Map();
  return (id) => {
    if (cache.has(id)) return cache.get(id);
    const node = work.tree.nodes.get(id), commit = commits.get(id), record = receipts.get(commit?.receiptId);
    const receipt = record && Object.fromEntries(Object.entries(record).filter(([key]) => !RESERVED_RECEIPT_FIELDS.includes(key)));
    const own = (byNode.get(id) ?? []).filter((e) => e.receiptId === commit?.receiptId).sort((a, b) => a.seq - b.seq);
    let verified = Boolean(node?.status === 'committed' && commit && receipt && variantOf(receipt) === MAIN && receipt.nodeId === id
      && receipt.draftHash === commit.committedHash && sha256(node.body) === commit.committedHash && receipt.hard === 0 && Array.isArray(receipt.events));
    if (verified) {
      try { verified = validateReceipt(receipt).length === 0 && canonicalJson(own.map(plainEvent)) === canonicalJson(receipt.events); }
      catch { verified = false; }
    }
    const result = { verified, events: verified ? own : [], binding: [id, commit?.receiptId ?? null, commit?.committedHash ?? null, node ? sha256(node.body) : null, verified] };
    cache.set(id, result); return result;
  };
}
