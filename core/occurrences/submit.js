import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { assertFeature } from '../work/features.js';
import { sha256 } from '../util/hash.js';
import { OCCURRENCES_LEDGER } from './records.js';
import { SURFACE_KINDS, surfaceText } from './surfaces.js';
import { validateItems } from './validate.js';

/**
 * 호스트가 표면 하나의 등장 위치 목록을 낸다(설계 §15). 모두 맞아야 기록하고, 하나라도 틀리면 아무것도 쓰지 않는다.
 * 빈 목록은 "이 표면에는 등장이 없다"는 기록이다. 작업 잠금 안에서 돈다.
 * @param {string} root
 * @param {{ surface: { kind: string, id: string, field?: string }, items: any[] }} input
 * @param {{ now?: () => string }} [options]
 */
export async function submitOccurrences(root, { surface, items }, { now } = {}) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'occurrences');
    if (!SURFACE_KINDS.includes(surface?.kind)) throw new FolioError('SURFACE_KIND_INVALID', String(surface?.kind).slice(0, 100), { kinds: SURFACE_KINDS });
    if (typeof surface.id !== 'string') throw new FolioError('SURFACE_INVALID', 'surface.id must be a string', { surface });
    if (surface.field !== undefined && typeof surface.field !== 'string') throw new FolioError('SURFACE_INVALID', 'surface.field must be a string', { surface });
    const target = { kind: surface.kind, id: surface.id, field: surface.field ?? '' };
    const text = surfaceText(work, target);
    if (text === null) throw new FolioError('SURFACE_NOT_FOUND', `${target.kind}:${target.id}${target.field}`.slice(0, 200), { surface: target });
    const { items: accepted, errors } = validateItems(work, text, items);
    if (errors.length) {
      throw new FolioError('OCCURRENCES_INVALID', `${errors.length} item(s) refused; nothing was recorded`, { errors: errors.slice(0, 50) });
    }
    const ledger = openLedger(root, OCCURRENCES_LEDGER, now ? { now } : {});
    const record = await ledger.append({ type: 'occurrences', surface: target, textHash: sha256(text), items: accepted, origin: 'tool' });
    return { surface: target, textHash: record.textHash, accepted: accepted.length, seq: record.seq };
  });
}
