import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { dormantPromises, foldPromise, PROMISE_KIND, PROMISE_MENTION, promiseStageOf } from '../promise.js';
import { readPublishedEventsView } from './ledgers.js';

/**
 * 휴면을 재는 기준 노드: 읽는 순서에서 마지막으로 커밋된 본문 잎. 커밋이 없으면 본문이 있는 마지막 잎. 둘 다 없으면 null.
 * @param {Awaited<ReturnType<typeof openWork>>} work
 * @param {string[]} leaves 앞뒤 판정되는 잎(읽는 순서)
 */
function frontierOf(work, leaves) {
  const committed = leaves.filter((id) => work.tree.nodes.get(id).status === 'committed');
  if (committed.length) return committed.at(-1);
  return leaves.filter((id) => work.tree.nodes.get(id).body.trim()).at(-1) ?? null;
}

/**
 * 떡밥 보드(설계 §11·§17): 약속마다 심긴 곳 → 움직인 곳 → 해소된 곳을 읽는 순서의 본문 잎(열) 위에 놓는다.
 * 지나가는 언급(promise.mentioned)은 단계가 아닌 표시로 싣는다. 잠금 검사(core.promise-order)와 같은 접기(foldPromise)로
 * 순서 문제를 싣고, M5 휴면 판정(dormantPromises)으로 기준 노드(frontier)에서 오래 움직이지 않은 약속을 표시한다. 읽기만 한다.
 * 사건 기록장이 깨졌으면 짐작하지 않는다: promises 는 빈 목록, ledger 에 검증 결과.
 * @param {string} root
 */
export async function viewPromiseBoard(root) {
  const work = await openWork(root);
  const leaves = preorder(work.tree).filter((id) => work.tree.nodes.get(id).kind === 'leaf' && work.positions.get(id).ordered);
  const ordinal = (id) => work.positions.get(id).ordinal;
  const columnOf = (nodeId) => {
    const at = work.positions.get(nodeId);
    if (!at?.ordered) return null;
    const index = leaves.findIndex((id) => ordinal(id) >= at.ordinal);
    return index < 0 ? null : index;
  };
  const base = { leaves: leaves.map((id) => ({ id, title: work.tree.nodes.get(id).title, status: work.tree.nodes.get(id).status })) };
  const { records, ledger } = await readPublishedEventsView(root);
  if (!records) return { ledger, ...base, frontier: null, promises: [] };
  const ordered = records.filter((e) => work.positions.get(e.nodeId)?.ordered)
    .sort((a, b) => ordinal(a.nodeId) - ordinal(b.nodeId) || a.seq - b.seq);
  const frontier = frontierOf(work, leaves);
  const upTo = frontier ? ordered.filter((e) => ordinal(e.nodeId) <= ordinal(frontier)) : [];
  const dormant = frontier ? dormantPromises({ work, events: upTo, atNodeId: frontier }) : [];
  const promises = [...work.entities.values()].filter((e) => e.kind === PROMISE_KIND).map((entity) => {
    const own = ordered.filter((e) => e.entityId === entity.id);
    const { stage, problems } = foldPromise(own);
    const late = dormant.find((d) => d.entityId === entity.id) ?? null;
    return {
      entityId: entity.id, name: entity.name, core: entity.data?.core === true,
      horizon: typeof entity.data?.horizon === 'string' ? entity.data.horizon : null,
      stage,
      marks: own.filter((e) => promiseStageOf(e) || e.kind === PROMISE_MENTION)
        .map((e) => ({ eventId: e.eventId, nodeId: e.nodeId, nodeTitle: work.tree.nodes.get(e.nodeId)?.title || e.nodeId, nodeKind: work.tree.nodes.get(e.nodeId)?.kind ?? null, stage: promiseStageOf(e) ?? 'mentioned', column: columnOf(e.nodeId) })),
      problems: problems.map((p) => ({ code: p.code, severity: p.severity, nodeId: p.nodeId })),
      dormant: late ? { code: late.code, lastMovedAt: late.lastMovedAt, distance: late.distance, span: late.span } : null,
    };
  });
  return { ledger, ...base, frontier, promises };
}
