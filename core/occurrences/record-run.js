import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { validateItems } from './validate.js';

/**
 * 커밋이 끝난 실행의 추출 등장 위치를 기록장에 남긴다(origin extract). 같은 영수증으로 두 번 쓰지 않는다(커밋 재개 멱등).
 * 실행 파일의 항목은 믿지 않는다: 커밋된 원고(draft, hash = 영수증 draftHash)와 다시 대조해 맞는 것만 쓴다.
 * origin 'extract' 는 occurrencesInExtract 가 켜져 있었다는 뜻이므로 두 기능(occurrences, occurrencesInExtract)이 다 켜져 있어야 쓴다(Ruling B3-2).
 * 원고가 바뀌었거나(hash 불일치) 제출한 항목이 다시 대조해 틀리면(공격이든 손상이든) 조용히 넘기지 않고 OCCURRENCES_INVALID 로 던진다 —
 * 호출자(commitStep)가 잡아 실행 기록에 남긴다. 등장 위치는 잠금 판단에 쓰이지 않으므로 커밋 자체는 막지 않는다.
 * @param {{ ledger: object, ctx: object, run: object, receiptId: string }} params
 */
export async function recordRunOccurrences({ ledger, ctx, run, receiptId }) {
  const events = run.outputs.events;
  const features = ctx.work.config.features;
  if (!features.occurrences || !features.occurrencesInExtract || !events?.submittedOccurrences) return null;
  const records = await ledger.readAll();
  if (records.some((r) => r.type === 'occurrences' && r.receiptId === receiptId)) return null;
  const text = run.outputs.draft;
  if (typeof text !== 'string' || sha256(text) !== run.draftHash) {
    throw new FolioError('OCCURRENCES_INVALID', `${run.runId}: committed text no longer matches the run's draftHash`);
  }
  const { items, errors } = validateItems(ctx.work, text, events.occurrences);
  if (errors.length) {
    throw new FolioError('OCCURRENCES_INVALID', `${run.runId}: submitted occurrences failed re-validation against the committed text`, { errors });
  }
  return ledger.append({ type: 'occurrences', surface: { kind: 'node', id: run.nodeId, field: '' }, textHash: run.draftHash, items, origin: 'extract', receiptId });
}
