import { isBlocking } from '../../ledger/receipts.js';
import { packRequest } from '../payload.js';
import { setDraft } from './generate.js';
import { skip, requestModel, awaitUser, takeAnswer, runCheckFindings, invalidateFrom, recheckStart } from './common.js';

/**
 * 필요한 최소 수정. 막는 지적(hard, block)만 넘긴다. 참고 의견은 절대 넘기지 않는다.
 * 최대 횟수를 넘기면 사람에게 넘기고, hard 가 남아 있으면 승인도 막는다.
 */
export async function reviseStep({ ctx, run, step, steps, env }) {
  const start = recheckStart(steps);
  const reviseIndex = steps.indexOf(step);
  const blocking = steps.slice(start, reviseIndex).filter((s) => s.kind === 'check')
    .flatMap((s) => (run.results[s.id]?.checks ?? []).flatMap((c) => c.findings.filter(isBlocking)));
  const current = packRequest(ctx, run, step, run.userRevision ? { feedback: run.userRevision } : { blocking });
  const ask = (purpose) => requestModel(run, env, [{ stepId: step.id, purpose, ...current }]);
  const entry = takeAnswer(run, step.id, current.digestPayload);
  if (entry !== undefined) {
    setDraft(run, typeof entry.answer === 'string' ? entry.answer : JSON.stringify(entry.answer));
    if (entry.purpose === 'user_revision') { run.attempts = 0; run.retries = {}; delete run.userRevision; } else run.attempts += 1;
    run.history.push({ at: env.now(), event: entry.purpose, attempts: run.attempts });
    invalidateFrom(run, steps, start);
    run.cursor = start;
    return null;
  }
  if (run.userRevision) return ask('user_revision');
  if (blocking.length === 0) {
    if (step.mode === 'off') return skip(run, step);
    run.results[step.id] = { status: run.attempts > 0 ? 'passed' : 'not_needed' };
    run.cursor += 1;
    return null;
  }
  const max = step.mode === 'off' ? 0 : step.loop.max;
  if (run.attempts >= max) {
    return awaitUser(run, {
      kind: 'blocked', stepId: step.id, draft: run.outputs.draft ?? '', blocking,
      advisories: runCheckFindings(run).filter((f) => !isBlocking(f)),
      canApprove: !blocking.some((f) => f.severity === 'hard'), attempts: run.attempts,
    });
  }
  return ask('revise');
}
