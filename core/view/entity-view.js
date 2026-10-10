import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { scanMentions } from '../index/scan.js';
import { canonicalJson } from '../util/hash.js';
import { OCCURRENCES_LEDGER } from '../occurrences/records.js';
import { occurrenceStates } from '../occurrences/state.js';
import { foldPromise, PROMISE_KIND } from '../promise.js';
import { readLedgerView, readPublishedEventsView } from './ledgers.js';
import { trackingReadView } from './tracking-view.js';
import { assetSummary } from './node-view.js';

const KIND_ORDER = { node: 0, entity: 1, asset: 2, source: 3 };
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 엔티티가 나오는 모든 글(표면). index.db 를 만들 때(core/index/rebuild.js)와 같은 규칙으로 센다:
 * 노드 본문·앞머리 entities, 다른 엔티티 본문, 그림 설명서(brief 와 brief.entities), 자료 설명서(제목·구간 인용).
 * @param {Awaited<ReturnType<typeof openWork>>} work
 * @param {string} entityId
 */
function scannedSurfaces(work, entityId) {
  const all = [...work.entities.values()];
  const count = (text) => scanMentions(text, all).get(entityId) ?? 0;
  const out = [];
  for (const id of preorder(work.tree)) {
    const node = work.tree.nodes.get(id);
    out.push({ kind: 'node', id, count: count(node.body), declared: node.entities.includes(entityId) });
  }
  for (const entity of all) if (entity.id !== entityId) out.push({ kind: 'entity', id: entity.id, count: count(entity.body), declared: false });
  for (const asset of work.assets.values()) out.push({ kind: 'asset', id: asset.id, count: count(canonicalJson(asset.brief)), declared: asset.entities.includes(entityId) });
  for (const source of work.sources.values()) {
    out.push({ kind: 'source', id: source.id, count: count([source.title, ...source.spans.map((s) => s.quote ?? '')].join('\n')), declared: false });
  }
  return out;
}

/**
 * 엔티티 화면: 정의, 모든 사용처(노드는 읽는 순서, 그다음 엔티티·그림·자료), 기록된 등장 위치(marks), 사건 이력, 관련 그림.
 * 약속이면 지금 단계와 단계 이력(foldPromise)도 싣는다. 읽기만 한다 — index.db 도 쓰지 않는다.
 * 기록장이 깨졌으면 그 부분(events·marks)은 null 이고 검증 결과만 준다(짐작하지 않는다).
 * occurrences 기능이 꺼져 있으면 marks 는 null 이다.
 * @param {string} root
 * @param {string} entityId
 */
export async function viewEntity(root, entityId, context = null) {
  const work = context?.work ?? await openWork(root);
  const entity = work.entities.get(entityId);
  if (!entity) throw new FolioError('ENTITY_NOT_FOUND', String(entityId).slice(0, 200));
  const occurrences = work.config.features.occurrences ? await readLedgerView(root, OCCURRENCES_LEDGER) : null;
  const marks = occurrences?.records ? occurrenceStates(work, occurrences.records).filter((m) => m.entityId === entityId) : null;
  const keyOf = (kind, id) => `${kind}:${id}`;
  const usages = new Map();
  for (const surface of scannedSurfaces(work, entityId)) {
    if (surface.count > 0 || surface.declared) usages.set(keyOf(surface.kind, surface.id), { ...surface, marks: [] });
  }
  for (const mark of marks ?? []) {
    const key = keyOf(mark.surface.kind, mark.surface.id);
    if (!usages.has(key)) usages.set(key, { kind: mark.surface.kind, id: mark.surface.id, count: 0, declared: false, marks: [] });
    usages.get(key).marks.push({ field: mark.surface.field ?? '', kind: mark.kind, quote: mark.quote, status: mark.status, start: mark.start, reason: /** @type {{ reason?: string }} */ (mark).reason ?? null });
  }
  const ordinal = (u) => (u.kind === 'node' ? work.positions.get(u.id)?.ordinal ?? Number.MAX_SAFE_INTEGER : 0);
  const listed = [...usages.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || ordinal(a) - ordinal(b) || byId(a.id, b.id))
    .map((u) => (u.kind === 'node' ? { ...u, title: work.tree.nodes.get(u.id)?.title ?? '', level: work.tree.nodes.get(u.id)?.level ?? null } : { ...u, title: u.kind === 'entity' ? work.entities.get(u.id)?.name ?? '' : u.kind === 'source' ? work.sources.get(u.id)?.title ?? '' : u.id }));
  const eventLedger = await readPublishedEventsView(root);
  const position = (nodeId) => work.positions.get(nodeId)?.ordinal ?? Number.MAX_SAFE_INTEGER;
  const events = eventLedger.records ? eventLedger.records.filter((e) => e.entityId === entityId)
    .sort((a, b) => position(a.nodeId) - position(b.nodeId) || a.seq - b.seq)
    .map((e) => ({
      eventId: e.eventId, nodeId: e.nodeId, nodeTitle: work.tree.nodes.get(e.nodeId)?.title ?? null, kind: e.kind, data: e.data ?? null,
      ordered: work.positions.get(e.nodeId)?.ordered ?? false,
    })) : null;
  return {
    entity: { id: entity.id, kind: entity.kind, name: entity.name, aliases: [...entity.aliases], data: entity.data, body: entity.body },
    usages: listed,
    tracking: trackingReadView(work, entityId),
    events,
    ledgers: { events: eventLedger.ledger, occurrences: occurrences ? occurrences.ledger : null },
    promise: entity.kind === PROMISE_KIND && events ? (({ stage, history }) => ({ stage, history }))(foldPromise(events.filter((e) => e.ordered))) : null,
    assets: [...work.assets.values()].filter((a) => a.entities.includes(entityId)).map((a) => assetSummary(work, a.id)),
  };
}
