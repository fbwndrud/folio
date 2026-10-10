import { sha256 } from '../util/hash.js';
import { setDraft } from './steps/generate.js';
import { awaitUser, invalidateFrom, recheckStart } from './steps/common.js';

export const isLockError = (error) => typeof error?.code === 'string' && error.code.startsWith('LOCK_');

/**
 * 잠금이 커밋을 거부했고 영수증이 아직 기록장에 없을 때: 영수증을 버리고 검사부터 다시 돈다.
 * hard 충돌이면 사람에게 넘기고(승인 불가), 그 밖의 거부는 실행을 되살려 저장한 뒤 오류를 그대로 알린다.
 * 다음 호출(run next)이 재검사를 이어간다 — committing 에 갇히지 않는다.
 */
export async function refuseCommit({ run, step, steps, error, env }) {
  run.receipt = null;
  run.state = 'active';
  const text = typeof run.outputs.draft === 'string' ? run.outputs.draft : '';
  if (sha256(text) !== run.draftHash) setDraft(run, text);
  const start = recheckStart(steps);
  invalidateFrom(run, steps, start);
  run.cursor = start;
  run.history.push({ at: env.now(), event: 'commit_refused', code: error.code });
  if (error.code === 'LOCK_HARD_VIOLATION') {
    return awaitUser(run, {
      kind: 'blocked', code: error.code, stepId: step.id, draft: text, advisories: [], canApprove: false,
      blocking: (error.details?.findings ?? []).filter((f) => f?.severity === 'hard'),
    });
  }
  run.updatedAt = env.now();
  await env.runs.save(run);
  throw error;
}
