import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { assertFeature } from '../work/features.js';
import { sha256 } from '../util/hash.js';
import { EVIDENCE_LEDGER } from './records.js';
import { validateClaims } from './validate.js';

/**
 * 호스트가 노드 하나의 근거 연결(주장 ↔ 자료 인용) 목록을 낸다(folio_sources link). 모두 맞아야 기록하고,
 * 틀린 인용이 하나라도 있으면 아무것도 쓰지 않는다(N2 완료 기준 1). 빈 목록은 "이 노드에는 주장이 없다"는 기록이다.
 * 대조 대상은 지금 파일 본문이다. 작업 잠금 안에서 돈다. sources·evidence 기능이 모두 켜져 있어야 한다.
 * @param {string} root
 * @param {{ nodeId: unknown, claims: unknown }} input
 * @param {{ now?: () => string }} [options]
 */
export async function submitEvidence(root, { nodeId, claims }, { now } = {}) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'sources');
    assertFeature(work.config, 'evidence');
    const node = typeof nodeId === 'string' ? work.tree.nodes.get(nodeId) : undefined;
    if (!node) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
    const { claims: accepted, errors } = validateClaims(work, node.body, claims);
    if (errors.length) throw new FolioError('EVIDENCE_INVALID', `${errors.length} claim(s) refused; nothing was recorded`, { errors: errors.slice(0, 50) });
    const ledger = openLedger(root, EVIDENCE_LEDGER, now ? { now } : {});
    const record = await ledger.append({ type: 'evidence', nodeId: node.id, textHash: sha256(node.body), claims: accepted, origin: 'tool' });
    return { nodeId: node.id, textHash: record.textHash, accepted: accepted.length, seq: record.seq };
  });
}
