import { activeChecks } from '../checks/applied.js';
import { invalidateFrom, recheckStart, receiptRecorded } from './steps/common.js';
import { nodeOrder, orderChanged } from '../scope/stale-checks.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';

/** 실행이 따르는 검사 계획: 이 파이프라인에서 지금 켜진 검사 id 와 그 검사가 도는 단계(stage). */
export const checkPlanFor = (ctx, pipeline) => activeChecks(ctx.checks, pipeline).map(({ checkId, stage }) => ({ checkId, stage }));

/**
 * 실행 도중 꺼진 검사를 기억한다. 남은 검사 단계는 그 검사를 돌리지 않고, 영수증에는 work.yaml 이 끈 검사(skipped)로 남긴다.
 * 다시 켜지면 목록에서 빠진다.
 */
function trackDeactivated(run, plan) {
  const now = new Set(plan.map((c) => c.checkId));
  const removed = (run.checkPlan ?? []).filter((c) => !now.has(c.checkId));
  const kept = (run.deactivated ?? []).filter((c) => !now.has(c.checkId) && !removed.some((r) => r.checkId === c.checkId));
  run.deactivated = [...kept, ...removed];
  run.checkPlan = plan;
}

/** 실행이 만들어진(또는 마지막으로 맞춘) 설정과 지금 설정이 다른가: 레벨 파이프라인·검사 digest, 앞뒤 판정 여부, 실행에 걸리는 기능(featuresDigest). */
export function outOfSync(run, ctx) {
  const order = nodeOrder(ctx.work, run.nodeId);
  const sameOrder = !run.order || !orderChanged(run.order, order);
  const sameFeatures = run.featuresDigest === undefined || run.featuresDigest === ctx.featuresDigest;
  const sameTracking = (run.trackingStateDigest ?? null) === (ctx.trackingStateDigest ?? null);
  return !(sameTracking && run.pipelineDigest === pipelineFor(ctx, run).digest && run.checksDigest === checksDigestFor(ctx, run) && sameOrder && sameFeatures);
}

/** 옛 설정에서 낸 질문과 받아 둔 답은 버린다(다시 묻는다). */
export function dropPending(run) {
  run.inbox = {};
  run.issued = {};
  run.pending = null;
  if (run.state === 'awaiting_model' || run.state === 'awaiting_user') run.state = 'active';
}

/**
 * 단계나 검사, 노드의 앞뒤 판정 여부(order)가 바뀌었으면 검사부터 다시. 영수증(또는 재검사 기록)이 이미 기록장에 있으면 그것으로 끝낸다.
 * steps: 이 실행이 도는 단계(보통 실행은 파이프라인 전체, 재검사는 검사 단계만).
 */
export function syncPipeline({ run, ctx, steps, now, finished = false }) {
  const pipeline = pipelineFor(ctx, run);
  const order = nodeOrder(ctx.work, run.nodeId);
  // 옛 실행 파일(order 없음)은 지금 순서로 본다.
  if (!outOfSync(run, ctx)) { run.order = order; return; }
  if (finished) return;
  if (run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run)) return;
  if (run.state === 'committing') { run.receipt = null; run.state = 'active'; }
  dropPending(run);
  run.retries = {}; // 새 설정의 요청은 처음 묻는 것이다(재검사 모델 검사·추출·자식 계획의 재시도 횟수를 새로 센다)
  trackDeactivated(run, checkPlanFor(ctx, pipeline));
  const trackingChanged = (run.trackingStateDigest ?? null) !== (ctx.trackingStateDigest ?? null) || run.featuresDigest !== ctx.featuresDigest;
  const extract = steps.findIndex((step) => step.kind === 'generate' && step.produces === 'events');
  const start = trackingChanged && extract >= 0 ? Math.min(extract, recheckStart(steps)) : recheckStart(steps);
  if (trackingChanged) { delete run.outputs.tracking; delete run.outputs.events; }
  run.trackingStateDigest = ctx.trackingStateDigest;
  run.pipelineDigest = pipeline.digest;
  run.checksDigest = checksDigestFor(ctx, run);
  run.featuresDigest = ctx.featuresDigest;
  run.order = order;
  if (run.cursor >= start) { invalidateFrom(run, steps, start); run.cursor = start; }
  run.history.push({ at: now(), event: 'pipeline_changed' });
}
