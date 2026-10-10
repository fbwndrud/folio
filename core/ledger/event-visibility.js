import { activeEvents } from './events.js';
import { HASH, validateReceipt } from './receipts.js';
import { canonicalJson } from '../util/hash.js';

const EVENT_FIELDS = ['eventId', 'entityId', 'kind', 'data', 'quote'];
const eventBody = (event) => Object.fromEntries(EVENT_FIELDS.filter((key) => key in event).map((key) => [key, event[key]]));
const receiptBody = ({ type: _type, seq: _seq, at: _at, prev: _prev, hash: _hash, ...body }) => body;

/**
 * 발행 marker와 정확히 연결된 사건만 fold한다. legacyImports는 반입 절차에서
 * 검증한 명시적 eventId 선택 목록이며, receipt 연결 행을 발행시키지 않는다.
 * legacyMode는 기존 집필 호출의 미연결 seed 호환용이다. 범용 호출 기본값은 false.
 */
export function publishedEvents({ eventRecords, receiptRecords, legacyImports = [], legacyMode = false }) {
  const receipts = new Map(receiptRecords.filter((r) => r.type === 'receipt').map((r) => [r.receiptId, r]));
  const published = new Map();
  for (const marker of receiptRecords.filter((r) => r.type === 'commit')) {
    const receipt = receipts.get(marker.receiptId);
    if (!receipt || validateReceipt(receiptBody(receipt)).length || receipt.hard !== 0) continue;
    if (marker.nodeId !== receipt.nodeId || (marker.variant ?? 'main') !== receipt.variant
      || !HASH.test(marker.committedHash ?? '') || marker.committedHash !== receipt.draftHash) continue;
    published.set(receipt.receiptId, receipt);
  }
  const imported = new Set(legacyImports.map((entry) => typeof entry === 'string' ? entry : entry?.eventId));
  const eligible = eventRecords.filter((record) => {
    if (record.type !== 'event') return false;
    if (!('receiptId' in record)) return legacyMode || imported.has(record.eventId);
    const receipt = published.get(record.receiptId);
    if ('supersedes' in record) return false;
    return receipt?.nodeId === record.nodeId && (receipt.events ?? []).some((event) => canonicalJson(eventBody(event)) === canonicalJson(eventBody(record)));
  });
  const byId = new Map(eligible.map((event) => [event.eventId, event]));
  const retractions = eventRecords.filter((record) => record.type === 'retraction').flatMap((record) => {
    const receipt = published.get(record.receiptId);
    if (!receipt || receipt.nodeId !== record.nodeId || !Array.isArray(record.supersedes)) return [];
    return [{ ...record, supersedes: record.supersedes.filter((id) => {
      const prior = byId.get(id);
      return prior?.nodeId === record.nodeId && prior.receiptId !== record.receiptId;
    }) }];
  });
  return activeEvents([...eligible, ...retractions]);
}
