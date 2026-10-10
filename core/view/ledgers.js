import { publishedEvents } from '../ledger/event-visibility.js';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';

/**
 * 뷰어가 기록장을 읽는다(읽기만 한다, 작업 잠금 없이). 실행기가 줄을 더하는 순간과 겹치면 본문과 head 를
 * 서로 다른 때에 읽어 LEDGER_TAMPERED 로 보일 수 있어 한 번만 다시 읽는다.
 * 두 번 다 깨졌으면 짐작하지 않는다: records 는 null, ledger 에 검증 결과(folio_status 와 같은 모양)를 준다.
 * 잠금 규칙(기록장 hash 사슬 검증)은 약하게 하지 않는다 — 깨진 기록장의 줄은 하나도 보여 주지 않는다.
 * @param {string} root
 * @param {string} name
 * @returns {Promise<{ records: any[]|null, ledger: { ok: boolean, line?: number|null } }>}
 */
export async function readLedgerView(root, name) {
  const ledger = openLedger(root, name);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return { records: await ledger.readAll(), ledger: { ok: true } };
    } catch (error) {
      if (!(error instanceof FolioError) || error.code !== 'LEDGER_TAMPERED') throw error;
      const line = error.details.line;
      if (attempt >= 1) return { records: null, ledger: { ok: false, line: typeof line === 'number' ? line : null } };
    }
  }
}

/** Events become visible only after an exact final commit marker; seed events remain compatible. */
export async function readPublishedEventsView(root) {
  const events = await readLedgerView(root, 'events');
  const receipts = await readLedgerView(root, 'receipts');
  return {
    records: events.records && receipts.records ? publishedEvents({ eventRecords: events.records, receiptRecords: receipts.records, legacyMode: true }) : null,
    ledger: events.ledger.ok ? receipts.ledger : events.ledger,
  };
}
