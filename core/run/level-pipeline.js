import { FolioError } from '../errors.js';
import { MAIN, variantOf } from '../variants/model.js';

const MISMATCH_CODES = new Set(['RUN_LEVEL_MISMATCH', 'RUN_KIND_MISMATCH', 'VARIANT_UNKNOWN']);
const mismatchHint = (what) => `the run file and the node disagree on the ${what}; restore the node's ${what} or abandon this run with folio decide skip`;

/**
 * 실행 파일의 값과 트리 노드의 값 중 믿을 것을 고른다. 노드가 트리에 있으면 노드 값이 정본이고,
 * 실행 파일이 다른 값을 적었으면 어느 쪽도 고르지 않고 거부한다(실행 파일은 잠금에 걸리는 선택의 근거가 아니다).
 * 노드가 트리에 없을 때만 실행 파일의 값을 쓴다.
 */
function fromNode(ctx, run, { field, runField, code, runKey, nodeKey, hint }) {
  const node = ctx.work.tree.nodes.get(run.nodeId);
  const saved = run[runField];
  if (!node) return saved ?? null;
  if (saved !== undefined && saved !== null && saved !== node[field]) {
    throw new FolioError(code, `${run.runId} for ${run.nodeId}: run file says ${saved}, the node is ${node[field]}`,
      { runId: run.runId, nodeId: run.nodeId, [runKey]: saved, [nodeKey]: node[field], hint });
  }
  return node[field];
}

/** 실행이 도는 노드의 레벨. 트리의 노드 레벨이 정본이고, 실행 파일의 level 은 노드가 없을 때만 쓴다. */
export const levelOf = (ctx, run) => fromNode(ctx, run,
  { field: 'level', runField: 'level', code: 'RUN_LEVEL_MISMATCH', runKey: 'runLevel', nodeKey: 'nodeLevel', hint: mismatchHint('level') });

/** 실행이 도는 노드의 종류(leaf/branch). 레벨과 같은 규칙. */
export const kindOf = (ctx, run) => fromNode(ctx, run,
  { field: 'kind', runField: 'nodeKind', code: 'RUN_KIND_MISMATCH', runKey: 'runKind', nodeKey: 'nodeKind', hint: mismatchHint('kind') });

/**
 * 판본 실행(N6)의 판본 파이프라인. 실행 파일의 판본이 work.yaml 에 없으면(지웠거나 고쳐 쓴 실행 파일) VARIANT_UNKNOWN —
 * 어긋난 실행처럼 skip 으로만 버린다. main 실행이면 null.
 */
function variantPipeline(ctx, run, table) {
  const variant = variantOf(run);
  if (variant === MAIN) return null;
  const found = typeof variant === 'string' && Object.hasOwn(ctx[table].variants ?? {}, variant) ? ctx[table].variants[variant] : undefined;
  if (found === undefined) {
    const label = typeof variant === 'string' ? variant.slice(0, 60) : `<${variant === null ? 'null' : typeof variant}>`;
    throw new FolioError('VARIANT_UNKNOWN', `${run.runId ?? run.nodeId}: variant ${label} is not declared in work.yaml`, {
      runId: run.runId, variant: label, hint: 'declare the variant again in work.yaml variants, or abandon this run with folio decide skip',
    });
  }
  return found;
}

/** 이 실행이 따르는 파이프라인: 판본 실행은 그 판본의 것, main 실행은 노드 레벨의 것(레벨 덮어쓰기 반영). */
export function pipelineFor(ctx, run) {
  const level = levelOf(ctx, run);
  const kind = kindOf(ctx, run);
  const variant = variantPipeline(ctx, run, 'pipelines');
  if (variant) return variant;
  const pipeline = (level !== null ? ctx.pipelines.byLevel?.[level] : undefined) ?? (kind !== null ? ctx.pipelines[kind] : undefined);
  if (!pipeline) throw new FolioError('LEVEL_UNKNOWN', `${run.nodeId}: ${level}`, { nodeId: run.nodeId, level });
  return pipeline;
}

/** 이 실행의 검사 digest: 노드 레벨 파이프라인의 검사 단계에 걸리는 검사. */
export function checksDigestFor(ctx, run) {
  const level = levelOf(ctx, run);
  const kind = kindOf(ctx, run);
  if (variantOf(run) !== MAIN) return variantPipeline(ctx, run, 'checksDigest');
  return (level !== null ? ctx.checksDigest.byLevel?.[level] : undefined) ?? (kind !== null ? ctx.checksDigest[kind] : undefined);
}

/** 실행 파일과 노드가 레벨·종류·판본에서 어긋나면 그 오류를, 아니면 null. 어긋난 실행에 허락되는 것은 skip(버리기)뿐이다. */
export function runMismatch(ctx, run) {
  try {
    levelOf(ctx, run);
    kindOf(ctx, run);
    variantPipeline(ctx, run, 'pipelines');
    return null;
  } catch (error) {
    if (MISMATCH_CODES.has(error.code)) return error;
    throw error;
  }
}
