import { openLedger } from '../ledger/ledger.js';
import { surfaceKey } from './surfaces.js';
import { isPlainObject } from '../util/plain.js';

/** 등장 위치 기록장 이름(.folio/ledger/occurrences.jsonl). 추가만 된다. */
export const OCCURRENCES_LEDGER = 'occurrences';
/** 등장(장면에 직접 나옴)과 언급(이름·회상으로만 나옴). 언급은 사망 같은 등장 검사에 걸리지 않는다. */
export const OCCURRENCE_KINDS = Object.freeze(['appearance', 'mention']);
export const MAX_ITEMS = 500;

/**
 * 표면 모양이 올바른지: 평범한 객체이고 kind·id 가 문자열, field 는 있으면 문자열.
 * @param {unknown} surface
 */
function isValidSurface(surface) {
  return isPlainObject(surface) && typeof surface.kind === 'string' && typeof surface.id === 'string'
    && (surface.field === undefined || typeof surface.field === 'string');
}

/**
 * 항목 모양: 평범한 객체. carried(이름 바꾸기가 그대로 실어 온 표시, Ruling F-3)는 있으면 불리언이어야 한다.
 * @param {unknown} item
 */
const isValidItem = (item) => isPlainObject(item) && (item.carried === undefined || typeof item.carried === 'boolean');

/**
 * hash 사슬은 맞지만 모양이 틀린 기록(표면이 없거나, items 가 배열이 아니거나, 항목이 객체가 아니거나 carried 가 불리언이 아님)은
 * 통째로 건너뛴다 — 알 수 없는 데이터로 짐작하지 않는다. Ruling B1-1.
 * @param {unknown} record
 */
export function isValidOccurrenceRecord(record) {
  return isPlainObject(record) && record.type === 'occurrences' && isValidSurface(record.surface)
    && Array.isArray(record.items) && record.items.every(isValidItem);
}

/** 표면마다 가장 최근 기록. 같은 표면의 새 기록이 앞 기록을 대신한다(앞 기록은 지우지 않는다). */
export function latestBySurface(records) {
  const latest = new Map();
  for (const record of records) if (isValidOccurrenceRecord(record)) latest.set(surfaceKey(record.surface), record);
  return latest;
}

/**
 * 등장 위치 기록장을 통째로 읽는다. server/ 는 core/ledger/ledger.js 를 직접 import 할 수 없어(가드),
 * 이 도우미를 대신 부른다.
 * @param {string} root
 */
export const readOccurrences = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();
