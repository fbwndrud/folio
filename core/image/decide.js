import { FolioError } from '../errors.js';
import { MAX_LOOP } from '../pipeline/define.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { recordStep, stepIndex, unresolved } from './steps.js';

const ACTIONS = ['approve', 'request_revision', 'skip'];
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** 버리기(skip) 기록. 이유가 있어야 한다. 실행은 abandoned 로 끝나고 그림은 쓰지 않는다. */
async function abandon(env, run, reason) {
  if (!reason) throw new FolioError('SKIP_REASON_REQUIRED', 'skipping a picture needs a reason');
  await env.ledger.append({ type: 'image_decision', runId: run.runId, assetId: run.assetId, action: 'skip', digest: sha256(canonicalJson({ reason })) });
  Object.assign(run, { state: 'abandoned', pending: null, abandoned: { reason, at: env.now() } });
  return { status: 'skipped', runId: run.runId, assetId: run.assetId };
}

/** 넘기는 막는 지적에 이유가 있는가. hard 는 넘길 수 없다. */
function assertApprovable(blocking, reason) {
  if (blocking.some((f) => f.severity === 'hard')) throw new FolioError('APPROVE_BLOCKED_BY_HARD', 'hard findings cannot be approved', { findings: blocking });
  if (blocking.length && !reason) throw new FolioError('APPROVE_REASON_REQUIRED', 'approving past blocking findings needs a reason', { findings: blocking });
}

/**
 * 사람의 결정을 그림 실행에 적용한다. 결과(점검 넘김·승인)는 기록장에 먼저 남기고, 실행 파일은 부른 쪽이 저장한다.
 * - image_precheck: approve(막는 지적은 이유 필요) → 생성으로. request_revision(feedback) → 설명서부터 다시(3번까지). skip.
 * - image_approval: approve(막는 지적은 이유 필요) → 커밋으로. request_revision(feedback) → 그림부터 다시(3번까지). skip.
 * - image_blocked(읽을 수 없는 답): skip 만.
 * 버리기(skip)는 열린 상태(커밋 중 제외) 어디서든 받는다 — 그림 실행이 멈춰 남지 않게.
 * @returns {Promise<object|null>} 끝난 결과(skipped) 또는 null(이어서 돈다)
 */
export async function applyImageDecision(env, run, { action, feedback = '', reason = '' }) {
  if (!ACTIONS.includes(action)) throw new FolioError('DECISION_INVALID', String(action).slice(0, 40));
  if (action === 'skip' && ['active', 'awaiting_model', 'awaiting_user'].includes(run.state)) return abandon(env, run, text(reason));
  if (run.state !== 'awaiting_user') throw new FolioError('IMAGE_RUN_NOT_AWAITING_USER', run.runId, { state: run.state });
  const kind = run.pending?.question?.kind;
  if (kind === 'image_blocked') throw new FolioError('DECISION_INVALID', 'this picture run can only be skipped', { allowed: ['skip'] });
  if (action === 'request_revision') {
    if (!text(feedback)) throw new FolioError('FEEDBACK_REQUIRED', 'a revision request needs feedback');
    const counter = kind === 'image_precheck' ? 'brief' : 'image';
    if (run.attempts[`${counter}Revisions`] >= MAX_LOOP) throw new FolioError('IMAGE_REVISION_LIMIT', `at most ${MAX_LOOP} revisions; approve or skip`, { max: MAX_LOOP });
    run.attempts[`${counter}Revisions`] += 1;
    run.feedback = text(feedback);
    const drop = kind === 'image_precheck' ? ['brief', 'precheck', 'generate', 'review', 'approve'] : ['generate', 'review', 'approve'];
    for (const id of drop) delete run.results[id];
    if (kind !== 'image_precheck') run.image = null;
    run.cursor = stepIndex(kind === 'image_precheck' ? 'brief' : 'generate');
    Object.assign(run, { pending: null, state: 'active' });
    return null;
  }
  const why = text(reason);
  if (kind === 'image_precheck') {
    assertApprovable(unresolved(run, ['precheck']), why);
    run.results.precheck = { ...run.results.precheck, approved: { reason: why } };
    await recordStep(env, run, 'precheck');
  } else {
    assertApprovable(unresolved(run, ['precheck', 'review']), why);
    run.results.approve = { status: 'approved', imageHash: run.image.hash, briefHash: run.briefHash, reason: why };
    await recordStep(env, run, 'approve');
  }
  Object.assign(run, { pending: null, state: 'active' });
  return null;
}
