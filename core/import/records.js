import { HASH } from '../ledger/receipts.js';
import { MAIN, variantOf } from '../variants/model.js';

/** 가져오기 기록의 type. 영수증(receipt)·커밋(commit)과 다른 종류다 — 검사를 지난 기록이 아니다. */
export const IMPORT_RECORD = 'import';
/** 가져온 노드의 상태. 이 값만 적는다("검사 통과"가 아니다). */
export const IMPORTED = 'imported';

/**
 * 노드 하나의 가져오기 기록(영수증 기록장에 남긴다). 판정·점수는 담지 않는다 — 출처 파일과 그 hash, 원본 쪽 검사 영수증 파일의 hash 만.
 * @param {{ importId: string, nodeId: string, importedHash: string, origin: Record<string, any> }} input
 */
export const importRecord = ({ importId, nodeId, importedHash, origin }) => ({ type: IMPORT_RECORD, importId, nodeId, status: IMPORTED, importedHash, origin });

/** 노드 id → 마지막 가져오기 기록. 모양이 틀린 기록(상태가 imported 가 아니거나 hash 가 없음)은 세지 않는다. */
export function lastImports(records) {
  const imports = new Map();
  for (const record of records) {
    if (record.type === IMPORT_RECORD && variantOf(record) === MAIN && record.status === IMPORTED && typeof record.nodeId === 'string' && HASH.test(record.importedHash ?? '')) imports.set(record.nodeId, record);
  }
  return imports;
}
