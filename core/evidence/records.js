import { openLedger } from '../ledger/ledger.js';
import { isPlainObject } from '../util/plain.js';

/** 근거 연결 기록장 이름(.folio/ledger/evidence.jsonl). 추가만 된다. */
export const EVIDENCE_LEDGER = 'evidence';
/** 한 노드 기록의 주장 수 한도, 주장 하나의 연결 수 한도. */
export const MAX_CLAIMS = 200;
export const MAX_LINKS = 20;

const isLink = (link) => isPlainObject(link) && typeof link.sourceId === 'string' && typeof link.quote === 'string';
const isClaim = (claim) => isPlainObject(claim) && typeof claim.quote === 'string' && Array.isArray(claim.sources) && claim.sources.every(isLink);

/**
 * hash 사슬은 맞지만 모양이 틀린 기록(노드 id 가 문자열이 아님, claims 가 배열이 아님, 주장·연결 모양이 틀림)은
 * 통째로 건너뛴다 — 알 수 없는 데이터로 짐작하지 않는다(M4 Ruling B1-1 과 같은 규칙).
 * @param {unknown} record
 */
export function isValidEvidenceRecord(record) {
  return isPlainObject(record) && record.type === 'evidence' && typeof record.nodeId === 'string'
    && Array.isArray(record.claims) && record.claims.every(isClaim);
}

/** 노드마다 가장 최근 기록. 같은 노드의 새 기록이 앞 기록을 대신한다(앞 기록은 지우지 않는다). */
export function latestByNode(records) {
  const latest = new Map();
  for (const record of records ?? []) if (isValidEvidenceRecord(record)) latest.set(record.nodeId, record);
  return latest;
}

/**
 * 근거 연결 기록장을 통째로 읽는다. server/ 는 core/ledger/ledger.js 를 직접 import 할 수 없어(가드) 이 도우미를 쓴다.
 * @param {string} root
 */
export const readEvidence = (root) => openLedger(root, EVIDENCE_LEDGER).readAll();
