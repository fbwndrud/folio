import { openWork } from '../../store/work.js';
import { FolioError } from '../../errors.js';
import { canonicalJson } from '../../util/hash.js';
import { recordRunOccurrences } from '../../occurrences/record-run.js';
import { recordRunEvidence } from '../../evidence/record-run.js';
import { restorePreparedCommit } from '../prepared-commit.js';
import { commitTarget } from '../commit-target.js';
import { readCommitIntent } from '../commit-intents.js';
import { commitNode } from '../commit.js';
import { buildReceipt } from '../receipt-builder.js';
import { scopeFor } from '../payload.js';
import { assertCommitReady } from '../commit-guard.js';
import { isLockError, refuseCommit } from '../refuse.js';
import { assertPipelineMatch } from '../commit-locks.js';
import { isVariantRun } from '../../variants/model.js';
import { originalOf } from '../../variants/original.js';
import { assertOriginalCurrent } from '../../variants/locks.js';
import { awaitUser, advisoriesOf, invalidateFrom, recheckStart, receiptRecorded, recordedReceiptOf, unresolvedBlocking } from './common.js';

const HINTS = {
  LOCK_PIPELINE_MISMATCH: 'work.yaml or a pack changed after the receipt was recorded; restore work.yaml to finish this commit, or abandon this run with folio decide skip',
  LOCK_ORIGINAL_CHANGED: 'the original was committed again after this variant receipt was recorded; abandon this run with folio decide skip and run the variant again',
};
const receiptWritten = async (env, run) => receiptRecorded(await env.ledgers.receipts.readAll(), run);
const withHint = (error) => { error.details = { ...error.details, hint: HINTS[error.code] }; return error; };

/** 기록장에 든 이 실행의 영수증 본문(기록장 필드를 뺀 것). 실행 파일의 run.receipt 는 믿지 않는다(runId·nodeId 대조). */
export function recordedReceipt(receiptRecords, run) {
  const stored = recordedReceiptOf(receiptRecords, run);
  if (!stored) return null;
  const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...body } = stored;
  return body;
}

/**
 * committing 실행의 기록된 영수증이 지금 끝낼 수 없게 되었는가: 파이프라인과 어긋나거나(LOCK_PIPELINE_MISMATCH),
 * 판본 영수증의 원본 커밋이 더는 원본의 마지막 커밋이 아니면(LOCK_ORIGINAL_CHANGED, N6). 그 오류(힌트 포함)를, 아니면 null.
 * 기록장에 든 영수증 본문으로 판단한다(실행 파일은 믿지 않는다). 커밋과 같은 검사를 쓴다. 끝낼 수 없는 실행은 skip 으로 버릴 수 있다(러너 decide).
 */
export function staleReceipt(ctx, run, pipeline) {
  if (run.state !== 'committing') return null;
  const receipt = recordedReceipt(ctx.receiptRecords, run);
  if (!receipt) return null;
  try {
    assertPipelineMatch({ pipeline, receipt });
    const batch = receipt.trackingBatch;
    if (batch) {
      const plan = ctx.work.tracking.plan;
      const own = ctx.work.tracking.batches.some((b) => b.receiptId === receipt.receiptId);
      if (!plan || plan.version !== batch.basePlanVersion || plan.grantId !== batch.grantId
        || plan.rev !== batch.basePlanRev && !(own && plan.rev === batch.effectivePlanRev)) {
        return new FolioError('LOCK_TRACKING_PLAN_CHANGED', 'tracking plan or grant changed after this receipt');
      }
    }
    assertOriginalCurrent(ctx.receiptRecords, receipt);
    return null;
  } catch (error) {
    return Object.hasOwn(HINTS, error?.code) ? withHint(error) : null;
  }
}

/**
 * 커밋 단계. 영수증이 이미 기록장에 있으면(커밋 도중 죽음) 같은 영수증으로 이어서 끝낸다.
 * committing 캐시만 있고 intent/영수증 증거가 없으면 충돌로 멈춘다. 새 실행은 영수증을 만든다: 참고 버전이 바뀌었으면 재검사,
 * 사람이 결정하지 않은 막는 지적이 있으면 묻고, 마지막 점검을 거쳐 commitNode 로 간다.
 * pipeline 은 이번 호출에서 팩 + work.yaml 로 새로 푼 것이다(실행 파일에서 읽지 않는다).
 */
export async function commitStep({ ctx, run, step, steps, pipeline, env }) {
  await restorePreparedCommit(env.root, run, ctx.work.tree.nodes.get(run.nodeId)?.path);
  const commit = async () => {
    run.receipt = recordedReceipt(ctx.receiptRecords, run) ?? run.receipt;
    const result = await commitNode({ root: env.root, work: ctx.work, ledgers: env.ledgers, pipeline, receipt: run.receipt, text: run.outputs.draft, hooks: env.hooks, resume: true });
    const committedCtx = run.receipt.trackingBatch ? { ...ctx, work: await openWork(env.root) } : ctx;
    // 판본 커밋(N6)은 곁 기록장(등장 위치·근거)을 쓰지 않는다 — 그 기록은 원본 본문의 것이다(실행 파일이 무엇을 들고 오든).
    if (isVariantRun(run)) return finished(result);
    // 등장 위치 기록은 커밋이 끝난 뒤(Ruling B3-1)다. 실패해도 실행을 committing 에 묶어 두지 않는다(Ruling P11) — 원고는 이미 커밋됐다.
    try {
      await recordRunOccurrences({ ledger: env.ledgers.occurrences, ctx: committedCtx, run, receiptId: result.receiptId });
    } catch (error) {
      run.history.push({ at: env.now(), event: 'occurrences_not_recorded', code: error?.code ?? 'ERROR' });
    }
    // 근거 연결(N2)도 같은 규칙: 커밋 뒤에 쓰고, 실패해도 실행을 committing 에 묶지 않는다(기록장이 잠금 판단에 쓰이지 않는다).
    try {
      await recordRunEvidence({ ledger: env.ledgers.evidence, ctx: committedCtx, run, receiptId: result.receiptId });
    } catch (error) {
      run.history.push({ at: env.now(), event: 'evidence_not_recorded', code: error?.code ?? 'ERROR' });
    }
    return finished(result);
  };
  const finished = (result) => {
    run.results[step.id] = { status: 'passed' };
    run.state = 'done';
    run.pending = null;
    return { status: 'done', runId: run.runId, nodeId: run.nodeId, receiptId: result.receiptId, ...(isVariantRun(run) ? { variant: run.variant } : {}) };
  };
  if (run.state === 'committing') {
    if (!receiptRecorded(ctx.receiptRecords, run) && !(run.receipt && await readCommitIntent(env.root, run.receipt.receiptId))) {
      throw new FolioError('COMMIT_TARGET_CONFLICT', 'interrupted commit has no durable target baseline; skip this run');
    }
    try { return await commit(); } catch (error) {
      throw Object.hasOwn(HINTS, error?.code) ? withHint(error) : error;
    }
  }
  run.receipt = null;
  run.state = 'active';
  const scope = scopeFor(ctx, run);
  const checkedRefs = steps.filter((s) => s.kind === 'check' && run.results[s.id]?.refs).map((s) => run.results[s.id].refs);
  if (checkedRefs.some((refs) => canonicalJson(refs) !== canonicalJson(scope.refs))) {
    const start = recheckStart(steps);
    invalidateFrom(run, steps, start);
    run.cursor = start;
    run.history.push({ at: env.now(), event: 'refs_changed' });
    return null;
  }
  const open = unresolvedBlocking(run);
  if (open.length) {
    return awaitUser(run, {
      kind: 'blocked', stepId: step.id, draft: run.outputs.draft ?? '', blocking: open,
      advisories: advisoriesOf(run), canApprove: !open.some((f) => f.severity === 'hard'),
    });
  }
  try {
    assertCommitReady({ ctx, run, steps });
    const original = isVariantRun(run) ? originalOf(ctx, run.nodeId).original : null;
    run.receipt = buildReceipt({ run, steps, work: ctx.work, refs: scope.refs, newId: env.newId, checks: ctx.checks, pipeline, original });
    assertCommitReady({ ctx, run, steps, receipt: run.receipt });
    // committing 캐시를 저장하기 전에 기준 bytes를 기록장에 고정한다. 캐시만 남은 옛 실행은 재기준화하지 않는다.
    await commitTarget({ root: env.root, node: ctx.work.tree.nodes.get(run.nodeId), receipt: run.receipt, text: run.outputs.draft, prepare: true });
    await env.hooks.afterPreparedCommitIntentWrite?.();
    run.state = 'committing';
    await env.runs.save(run);
    await env.hooks.afterCommittingRunWrite?.();
    return await commit();
  } catch (error) {
    if (!isLockError(error) || await receiptWritten(env, run)) throw error;
    return refuseCommit({ run, step, steps, error, env });
  }
}
