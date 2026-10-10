import { isBlocking } from '../../ledger/receipts.js';
import { userOverrideCovers } from '../commit-locks.js';
import { canonicalJson, sha256 } from '../../util/hash.js';
import { variantOf } from '../../variants/model.js';

/**
 * 판정 기록을 decisions 기록장에 남긴다. 그 판정에 기대는 실행 파일 저장보다 반드시 먼저 부른다.
 * 저장 전에 죽으면 다음 호출이 같은 단계를 다시 돌려 다시 기록한다(가장 최근 기록이 이긴다).
 */
export async function recordDecisions(env, records) {
  for (const record of records) {
    await env.ledgers.decisions.append(record);
    await env.hooks?.afterDecision?.(record);
  }
}

export function skip(run, step) {
  run.results[step.id] = { status: 'skipped', reason: step.reason || '(no reason given)', source: step.source ?? 'pack' };
  run.cursor += 1;
  return null;
}

export function outcomeFromPending(run) {
  if (run.pending?.kind === 'model') return { status: 'needs_model', runId: run.runId, nodeId: run.nodeId, requests: run.pending.requests };
  if (run.pending?.kind === 'user') return { status: 'needs_user', runId: run.runId, nodeId: run.nodeId, question: run.pending.question };
  return null;
}

/** 요청 내용의 digest. 재요청 사유(retryReason)는 힌트일 뿐이라 빼고 묶는다. */
export function requestDigest(payload) {
  const { retryReason: _hint, ...rest } = payload ?? {};
  return sha256(canonicalJson(rest));
}

/**
 * 엔진은 모델을 부르지 않는다. 요청을 기록하고 호스트에 돌려줄 뿐이다.
 * 단계마다 낸 요청의 id 와 내용 digest 를 run.issued 에 남긴다 — 답은 그 요청에 묶인다(takeAnswer).
 * digestPayload(선택): digest 를 만들 재료(팩 prompt() 앞). 호스트에는 보내지 않는다.
 */
export function requestModel(run, env, requests) {
  const issued = requests.map(({ digestPayload, ...request }) => ({
    request: { requestId: env.newId('req'), ...request }, digest: requestDigest(digestPayload ?? request.payload),
  }));
  run.pending = { kind: 'model', requests: issued.map((item) => item.request) };
  run.issued = run.issued ?? {};
  for (const { request, digest } of issued) run.issued[request.stepId] = { requestId: request.requestId, digest };
  run.state = 'awaiting_model';
  return outcomeFromPending(run);
}

export function awaitUser(run, question) {
  run.pending = { kind: 'user', question };
  run.state = 'awaiting_user';
  return outcomeFromPending(run);
}

export const MAX_ANSWER_TRIES = 3;

/** 읽을 수 없는 모델 답(사건 추출·자식 계획)은 세 번까지만 다시 묻고, 그 뒤는 사람에게 넘긴다(승인 불가). */
export function retryOrGiveUp(run, step, error, request, code) {
  run.retries = run.retries ?? {};
  const tries = (run.retries[step.id] ?? 0) + 1;
  run.retries[step.id] = tries;
  if (tries < MAX_ANSWER_TRIES) return request({ retryReason: error });
  return awaitUser(run, {
    kind: 'blocked', code, stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
    blocking: [{ checkId: step.id, severity: 'hard', code, message: `${tries} unreadable answers: ${error}` }],
  });
}

/**
 * 이 단계에 온 답을 꺼낸다. 답은 그 단계가 마지막으로 낸 요청(id)에 대한 것이어야 하고,
 * 그 요청 내용(digest)이 지금 이 단계가 낼 요청(payload)과 같아야 한다. 아니면 버리고 undefined(다시 묻는다).
 */
export function takeAnswer(run, stepId, payload) {
  const entry = run.inbox?.[stepId];
  if (entry === undefined) return undefined;
  delete run.inbox[stepId];
  const issued = run.issued?.[stepId];
  if (!issued || entry.requestId !== issued.requestId || issued.digest !== requestDigest(payload)) {
    run.history?.push({ event: 'answer_dropped', stepId });
    return undefined;
  }
  return entry;
}

/** 이 실행에서 검사 단계들이 낸 지적(checks[].findings)만 모은다. unsupported 는 판정 밖이다. */
export function runCheckFindings(run) {
  return Object.values(run.results).flatMap((r) => (r.checks ?? []).flatMap((c) => c.findings ?? []));
}

export const blockingFindings = (run) => runCheckFindings(run).filter(isBlocking);

/** 아직 사람의 결정이 없는 막는 지적. hard 는 넘길 수 없으니 항상 남고, block 은 이유 있는 사용자 결정이 있어야 빠진다. */
export const unresolvedBlocking = (run) => blockingFindings(run)
  .filter((f) => f.severity === 'hard' || !userOverrideCovers(run.overridden, f));

export const advisoriesOf = (run) => runCheckFindings(run).filter((f) => !isBlocking(f));

/**
 * 이 실행의 영수증 기록(기록장의 것). 실행 파일의 receiptId 는 믿지 않으므로 기록의 runId·nodeId·판본이 이 실행과 같아야 한다.
 * 다른 실행·노드·판본의 영수증을 가리키면 null(기록되지 않은 것으로 본다).
 */
export const recordedReceiptOf = (receiptRecords, run) => receiptRecords.find((r) => r.type === 'receipt'
  && r.runId === run.runId && r.nodeId === run.nodeId && variantOf(r) === variantOf(run) && (r.trackingBatch || r.receiptId === run.receipt?.receiptId)) ?? null;

/** 이 실행의 영수증이 이미 기록장에 들어갔는가(그렇다면 같은 영수증으로 이어서 커밋해야 한다). */
export const receiptRecorded = (receiptRecords, run) => Boolean(recordedReceiptOf(receiptRecords, run));

/** 원고가 바뀌면 그 뒤 검사·승인은 무효다(hash 잠금). 자식 생성 결과만 남긴다. */
export function invalidateFrom(run, steps, index) {
  for (const step of steps.slice(index)) {
    if (step.kind === 'commit' || step.produces === 'children') continue;
    delete run.results[step.id];
  }
  run.approval = null;
}

/** 다시 검사할 때 시작점: 첫 검사 단계, 그 앞에 사건 추출 단계가 붙어 있으면 거기부터. */
export function recheckStart(steps) {
  let index = steps.findIndex((s) => s.kind === 'check');
  while (index > 0 && steps[index - 1].kind === 'generate' && steps[index - 1].produces === 'events') index -= 1;
  return index;
}
