import { FolioError } from '../../errors.js';
import { levelIndex } from '../../work/config.js';
import { updateNode } from '../../store/tree.js';
import { sha256 } from '../../util/hash.js';
import { openWork } from '../../store/work.js';
import { addNode } from '../../structure/ops.js';
import { parseJsonAnswer } from '../answers.js';
import { packRequest, rawPackPayload } from '../payload.js';
import { requestModel, takeAnswer, retryOrGiveUp } from './common.js';
import { ID } from '../../store/ids.js';
import { isRecommit } from '../recommit-plan.js';

/** 모델이 낸 자식 목록을 읽는다. kept 는 이미 만들어 둔 자식 수(개수 범위에 함께 센다). */
function readChildren(answer, work, newId, childLevel, range, kept = 0) {
  let data;
  try { data = parseJsonAnswer(answer); } catch { return { error: 'CHILDREN_JSON_INVALID' }; }
  if (!Array.isArray(data?.children) || data.children.length === 0) return { error: 'CHILDREN_EMPTY' };
  const count = kept + data.children.length;
  if (range && (count < range[0] || count > range[1])) return { error: `CHILDREN_COUNT_OUT_OF_RANGE:${count} not in [${range[0]}, ${range[1]}]` };
  const seen = new Set();
  const list = [];
  for (const child of data.children) {
    const id = child?.id ?? newId(childLevel);
    if (typeof id !== 'string' || !ID.test(id) || work.tree.nodes.has(id) || seen.has(id)) return { error: `CHILD_ID_INVALID:${id}` };
    seen.add(id);
    list.push({ id, title: typeof child.title === 'string' ? child.title : '', brief: typeof child.brief === 'string' ? child.brief : null });
  }
  return { value: list };
}

/**
 * 고정한 자식 id 가 그 사이 다른 곳에 생겼으면(사람의 구조 변경 등) 그 id 는 버리고 다시 묻는다.
 * 이 부모 아래 이미 만든 자식은 남긴다(keptChildren). 재요청 사유를 돌려주고, 충돌이 없으면 null.
 */
function dropConflicts(run, work, parentId) {
  const clash = run.outputs.children.filter((c) => { const e = work.tree.nodes.get(c.id); return e && e.parentId !== parentId; });
  if (!clash.length) return null;
  run.outputs.keptChildren = run.outputs.children.filter((c) => work.tree.nodes.get(c.id)?.parentId === parentId);
  delete run.outputs.children;
  return `CHILD_ID_CONFLICT:${clash.map((c) => c.id).join(',')}`;
}

/** 위층 칸: 자식들의 짧은 계획으로 자식 노드를 만들고, 자식이 다 끝날 때까지 기다린다. */
export async function childrenStep({ ctx, run, step, env }) {
  if (run.mode === 'derive') {
    run.results[step.id] = { status: 'skipped', reason: 'children already exist', source: 'core' };
    run.cursor += 1;
    return null;
  }
  // 다시 커밋(M4): 자식이 있으면 그대로 두고 이 노드의 본문만 다시 검사·커밋한다(자식 단계를 건너뛰어 자식 검사를 피할 수 없다 — 애초에 자식을 새로 만들지 않는다).
  // 자식이 없는 가지는(assertRecommitNeeded 가 이미 막지만, 실행 파일 위조에 대비해 여기서도) not_needed 로 건너뛰지 않고 보통대로 자식을 만든다.
  if (isRecommit(run) && ctx.work.tree.nodes.get(run.nodeId)?.children.length > 0) {
    run.results[step.id] = { status: 'not_needed', reason: 'recommit keeps the existing children', source: 'recommit' };
    run.cursor += 1;
    return null;
  }
  const node = ctx.work.tree.nodes.get(run.nodeId);
  const levelAt = levelIndex(ctx.work.config, node.level);
  const childLevel = ctx.work.config.levels[levelAt + 1];
  if (!childLevel) throw new FolioError('LEVEL_ORDER_INVALID', `${node.id} has no child level`);
  const request = (extra) => requestModel(run, env, [{ stepId: step.id, purpose: 'generate', produces: 'children', ...packRequest(ctx, run, step, extra) }]);
  if (run.outputs.children) {
    const conflict = dropConflicts(run, ctx.work, node.id);
    if (conflict) return retryOrGiveUp(run, step, conflict, request, 'CHILDREN_FAILED');
  }
  if (!run.outputs.children) {
    const entry = takeAnswer(run, step.id, rawPackPayload(ctx, run, step));
    if (entry === undefined) return request();
    const kept = run.outputs.keptChildren ?? [];
    const parsed = readChildren(entry.answer, ctx.work, env.newId, childLevel.name, ctx.work.config.levels[levelAt].children, kept.length);
    if (parsed.error) return retryOrGiveUp(run, step, parsed.error, request, 'CHILDREN_FAILED');
    if (run.retries) delete run.retries[step.id];
    run.outputs.children = [...kept, ...parsed.value];
    delete run.outputs.keptChildren;
    await env.runs.save(run); // 자식 id 를 먼저 고정해야 중간에 죽어도 같은 자식이 만들어진다
  }
  await updateNode(env.root, node, { data: { status: 'planned' }, body: run.outputs.draft ?? '' });
  let work = await openWork(env.root);
  // 엔진이 방금 쓴 본문이 이제 이 실행이 본 글이다(커밋 전 손수정 점검의 기준 — core/run/text-guard.js).
  run.fileHash = sha256(work.tree.nodes.get(node.id)?.body ?? '');
  for (const child of run.outputs.children) {
    const existing = work.tree.nodes.get(child.id);
    if (existing && existing.parentId === node.id) continue; // 중간에 죽기 전에 이미 만든 자식
    if (existing) throw new FolioError('CHILD_ID_CONFLICT', `${child.id} already exists outside ${node.id}`); // dropConflicts 뒤에는 오지 않는다
    await addNode(env.root, work, { parentId: node.id, level: childLevel.name, id: child.id, title: child.title, brief: child.brief });
    work = await openWork(env.root);
  }
  run.results[step.id] = { status: 'passed' };
  run.state = 'waiting_children';
  run.cursor += 1;
  return { status: 'waiting_children', runId: run.runId, nodeId: run.nodeId };
}
