import { FolioError } from '../errors.js';
import { receiptRecorded } from './steps/common.js';
import { doneNodes } from './done.js';

/** 끝나지 않은 자식. 끝남 = 앞머리 committed + 커밋 기록(doneNodes). */
const pendingChildren = (work, node, receiptRecords) => {
  const done = doneNodes(work, receiptRecords);
  return node.children.filter((id) => !done.has(id));
};

/** 자식이 하나라도 커밋 안 됐으면(커밋 기록이 없으면) 가지를 시작·재개할 수 없다. */
export function assertChildrenDone(work, node, receiptRecords) {
  if (node.kind !== 'branch') return;
  const pending = pendingChildren(work, node, receiptRecords);
  if (pending.length) throw new FolioError('CHILDREN_PENDING', `${node.id} still has unfinished children`, { pending });
}

/**
 * 가지 실행이 자식 단계 뒤(derive 는 자식 단계부터)에 있는데 커밋 안 된 자식이 있으면(실행 도중 구조가 바뀜)
 * 자식 뒤 검사 결과를 버리고 waiting_children 으로 세운다. 자식이 다 끝나면 거기서 다시 이어간다.
 * 영수증이 이미 기록장에 들어간 커밋은 그대로 끝내야 하므로 건드리지 않는다.
 */
export function parkForChildren(ctx, run, steps, now) {
  if (run.nodeKind !== 'branch') return null;
  const index = steps.findIndex((s) => s.produces === 'children');
  if (index < 0 || run.cursor < index || (run.cursor === index && run.mode !== 'derive')) return null;
  if (run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run)) return null;
  const node = ctx.work.tree.nodes.get(run.nodeId);
  if (!node || pendingChildren(ctx.work, node, ctx.receiptRecords).length === 0) return null;
  for (const step of steps.slice(index + 1)) delete run.results[step.id];
  run.cursor = Math.min(run.cursor, index + 1);
  run.receipt = null;
  run.pending = null;
  run.state = 'waiting_children';
  run.history.push({ at: now(), event: 'children_pending' });
  return { status: 'waiting_children', runId: run.runId, nodeId: run.nodeId };
}
