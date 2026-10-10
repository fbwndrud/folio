import { isBlocking } from '../../ledger/receipts.js';
import { applicability, runDeterministicChecks, buildModelCheckRequest, parseModelCheckAnswer } from '../../checks/run-checks.js';
import { basePayload, scopeFor } from '../payload.js';
import { trackingWorkFor } from '../../tracking/extract.js';
import { checkResultRecord, checkStepEntry } from '../../ledger/decisions.js';
import { isVariantRun } from '../../variants/model.js';
import { originalOf } from '../../variants/original.js';
import { skip, requestModel, takeAnswer, recordDecisions } from './common.js';

export function checkContext(ctx, run, scope) {
  const work = trackingWorkFor(ctx.work, run);
  return {
    ...scope, work, node: work.tree.nodes.get(run.nodeId), draft: run.outputs.draft ?? '',
    draftEvents: (run.outputs.events?.events ?? []).map((e, i) => ({ ...e, eventId: `draft-${i + 1}`, nodeId: run.nodeId })),
  };
}

function stepStatus(results) {
  if (results.every((r) => r.status === 'not_applicable' || r.status === 'skipped')) return 'not_applicable';
  return results.some((r) => r.findings.some(isBlocking)) ? 'failed' : 'passed';
}

/** 검사 결과를 decisions 기록장에 남긴다. drive 가 실행 파일을 저장하기 전에 불린다. */
const recordResult = (env, ctx, run, step) => recordDecisions(env, [checkResultRecord({
  runId: run.runId, nodeId: run.nodeId, stepId: step.id, draftHash: run.draftHash,
  entry: checkStepEntry(step.id, run.results[step.id]), refs: run.results[step.id].refs,
  ...(isVariantRun(run) ? { variant: run.variant, original: originalOf(ctx, run.nodeId).original } : {}),
})]);

/** 실행 도중 work.yaml 에서 꺼진 검사: 돌리지 않고 skipped(source work.yaml)로 남긴다 — 통과로 적지 않는다. */
function deactivatedEntries(run, stage, listed) {
  const ids = new Set(listed.map((c) => c.checkId));
  return (run.deactivated ?? []).filter((c) => c.stage === stage && !ids.has(c.checkId))
    .map((c) => ({ checkId: c.checkId, status: 'skipped', source: 'work.yaml', findings: [] }));
}

export async function checkStep({ ctx, run, step, env }) {
  const stage = step.stage ?? step.id;
  const checks = ctx.checks.filter((c) => c.stage === stage);
  if (step.mode === 'off') {
    skip(run, step);
    const listed = checks.map((c) => ({ checkId: c.id, status: 'skipped', findings: [] }));
    run.results[step.id].checks = [...listed, ...deactivatedEntries(run, stage, listed)];
    run.results[step.id].refs = scopeFor(ctx, run).refs; // 꺼진 검사도 범위에 묶는다(범위가 바뀌면 커밋 단계가 재검사)
    await recordResult(env, ctx, run, step);
    return null;
  }
  const scope = scopeFor(ctx, run);
  const checkCtx = checkContext(ctx, run, scope);
  const record = async (found) => {
    const results = [...found, ...deactivatedEntries(run, stage, found)];
    run.results[step.id] = { status: stepStatus(results), draftHash: run.draftHash, checks: results, refs: scope.refs };
    await recordResult(env, ctx, run, step);
    run.cursor += 1;
    return null;
  };
  if (step.tier === 'deterministic') return record(runDeterministicChecks(checks, checkCtx));
  const applicable = checks.filter((c) => applicability(c, checkCtx) === 'applicable');
  const notApplicable = checks.filter((c) => !applicable.includes(c)).map((c) => ({ checkId: c.id, status: 'not_applicable', findings: [] }));
  if (applicable.length === 0) return record(notApplicable);
  const payload = { ...basePayload(ctx, run, step, scope), ...buildModelCheckRequest(applicable, checkCtx), claims: scope.claims };
  const entry = takeAnswer(run, step.id, payload);
  if (entry !== undefined) return record([...parseModelCheckAnswer(applicable, entry.answer, checkCtx.draft), ...notApplicable]);
  return requestModel(run, env, [{ stepId: step.id, purpose: 'check', payload }]);
}
