import { skip, awaitUser, advisoriesOf, unresolvedBlocking } from './common.js';

export async function gateStep({ run, step }) {
  if (step.mode === 'off') return skip(run, step);
  if (step.mode === 'auto') {
    run.results[step.id] = { status: 'auto', source: step.source ?? 'pack' };
    run.cursor += 1;
    return null;
  }
  if (run.approval?.stepId === step.id && run.approval.draftHash === run.draftHash) {
    run.results[step.id] = { status: 'approved', source: 'user' };
    run.cursor += 1;
    return null;
  }
  return awaitUser(run, {
    kind: 'approve', stepId: step.id, draft: run.outputs.draft ?? '',
    advisories: advisoriesOf(run), blocking: unresolvedBlocking(run),
  });
}
