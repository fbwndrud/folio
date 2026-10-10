import { reanchor } from './anchor.js';
import { latestBySurface } from './records.js';
import { surfaceText } from './surfaces.js';

/**
 * 기록된 등장 위치가 지금 글에서 어디 있는지 계산한다. 파일이 정본이고 이 결과는 매번 새로 만든다.
 * 표면이 없으면 SURFACE_MISSING, 엔티티가 없으면 ENTITY_MISSING 으로 stale.
 * 이름 바꾸기가 옮기지 못하고 그대로 실어 온 항목(carried: true)은 reanchor 결과와 상관없이 항상 CARRIED 로 stale 이다
 * (Ruling F-3 — 우연히 새 글에 맞아 엉뚱한 곳에서 살아나지 않게). 그 표면을 다시 제출하면 새 기록이 대신한다.
 */
export function occurrenceStates(work, records) {
  const out = [];
  for (const record of latestBySurface(records).values()) {
    const text = surfaceText(work, record.surface);
    for (const item of record.items) {
      let at;
      if (text === null) at = { status: 'stale', start: null, reason: 'SURFACE_MISSING' };
      else if (!work.entities.has(item.entityId)) at = { status: 'stale', start: null, reason: 'ENTITY_MISSING' };
      else if (item.carried === true) at = { status: 'stale', start: null, reason: 'CARRIED' };
      else at = reanchor(text, item);
      out.push({
        entityId: item.entityId, kind: item.kind, surface: record.surface, quote: item.quote, before: item.before, after: item.after,
        origin: record.origin, seq: record.seq, ...at,
      });
    }
  }
  return out;
}

export const staleOccurrences = (states) => states.filter((s) => s.status === 'stale')
  .map(({ entityId, kind, surface, quote, reason }) => ({ entityId, kind, surface, quote, reason }));

export const liveMarks = (states) => states.filter((s) => s.status !== 'stale');
