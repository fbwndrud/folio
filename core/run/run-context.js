import { openLedger } from '../ledger/ledger.js';
import { publishedEvents } from '../ledger/event-visibility.js';
import { DECISIONS_LEDGER } from '../ledger/decisions.js';
import { OCCURRENCES_LEDGER } from '../occurrences/records.js';
import { EVIDENCE_LEDGER } from '../evidence/records.js';
import { occurrenceStates, liveMarks } from '../occurrences/state.js';
import { openWorkspace } from './workspace.js';

/** 실행기가 쓰는 기록장 다섯. 모두 추가만 된다. */
export const openRunLedgers = (root, now) => ({
  receipts: openLedger(root, 'receipts', { now }), events: openLedger(root, 'events', { now }), decisions: openLedger(root, DECISIONS_LEDGER, { now }),
  occurrences: openLedger(root, OCCURRENCES_LEDGER, { now }), evidence: openLedger(root, EVIDENCE_LEDGER, { now }),
});

/**
 * 기능이 켜졌을 때만 읽는 기록장(등장 위치·근거 연결). 깨졌으면 짐작하지 않고 LEDGER_TAMPERED 로 멈춘다(M4 잠금 규칙과 같다 — 약하게 하지 않는다).
 * 대신 어느 기록장인지와 할 수 있는 일(백업에서 되살리기, 그 기능 끄기)을 details 에 싣는다(N2 미룬 minor, N6 검토).
 */
async function readGated(ledger, feature) {
  try {
    return await ledger.readAll();
  } catch (error) {
    if (error?.code === 'LEDGER_TAMPERED') {
      error.details = {
        ...error.details, ledger: ledger.name, feature,
        hint: `restore .folio/ledger/${ledger.name}.jsonl from a backup (the engine never rewrites ledgers), or turn off work.yaml features.${feature} to keep running without it`,
      };
    }
    throw error;
  }
}

/**
 * 실행 한 걸음의 재료: 작품·팩·검사·단계 + 기록장. 매 걸음 파일에서 새로 읽는다.
 * occurrenceScope(M4)·evidence(N2)는 기능이 켜졌을 때만 기록장을 읽는다(끄면 범위에 아무 영향 없음).
 */
export async function loadRunContext({ root, packs, ledgers }) {
  const workspace = await openWorkspace(root, { packs });
  const receiptRecords = await ledgers.receipts.readAll();
  const events = publishedEvents({ eventRecords: await ledgers.events.readAll(), receiptRecords, legacyMode: true });
  const occurrenceRecords = workspace.work.config.features.occurrenceScope ? await readGated(ledgers.occurrences, 'occurrenceScope') : null;
  const marks = occurrenceRecords ? liveMarks(occurrenceStates(workspace.work, occurrenceRecords)) : null;
  // 재검사·다시 커밋은 근거 기록장에 기록된 주장을 본다(core/evidence/scope.js).
  const evidenceRecords = workspace.work.config.features.evidence ? await readGated(ledgers.evidence, 'evidence') : null;
  return { ...workspace, receiptRecords, events, marks, evidenceRecords };
}
