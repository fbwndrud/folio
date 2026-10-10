import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { withWorkLock } from '../run/work-lock.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { addNode, moveNode, wrapNodes } from './ops.js';

export const STRUCTURE_OPS = Object.freeze({ add: addNode, move: moveNode, wrap: wrapNodes });

/** 읽는 순서(preorder)의 노드 요약. 구조를 바꾼 뒤 호스트에 보여 준다. */
export function outlineOf(work) {
  return preorder(work.tree).map((id) => {
    const node = work.tree.nodes.get(id);
    return { id, level: node.level, kind: node.kind, status: node.status, title: node.title, parentId: node.parentId };
  });
}

/**
 * 구조 바꾸기의 공개 입구(MCP folio_structure 가 부른다). 실행기와 같은 작업 잠금 안에서,
 * 열린 실행(active·awaiting_model·awaiting_user·committing)이 없을 때만 바꾼다 — 질문이 떠 있는 동안 트리가 바뀌면 그 질문의 범위가 틀어진다.
 * waiting_children 가지 실행은 열린 실행이 아니다(큰 틀부터 쓰는 중에도 자식을 더할 수 있다).
 * @param {string} root
 * @param {{ op: string, [key: string]: any }} request
 */
export async function changeStructure(root, { op, ...args }) {
  if (typeof op !== 'string' || !Object.hasOwn(STRUCTURE_OPS, op)) throw new FolioError('STRUCTURE_OP_UNKNOWN', String(op), { ops: Object.keys(STRUCTURE_OPS) });
  const apply = STRUCTURE_OPS[op];
  return withWorkLock(root, async () => {
    const open = (await createRunStore(root).list()).find((r) => !r.error && OPEN_STATES.has(r.state));
    if (open) throw new FolioError('STRUCTURE_RUN_OPEN', `${open.runId} for ${open.nodeId} is not finished; finish or skip it first`, { runId: open.runId, nodeId: open.nodeId });
    await apply(root, await openWork(root), args);
    return { op, outline: outlineOf(await openWork(root)) };
  });
}
