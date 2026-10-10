import { FolioError } from '../errors.js';
import { isBlocking } from '../ledger/receipts.js';
import { buildModelCheckRequest, parseModelCheckAnswer, runDeterministicChecks } from '../checks/run-checks.js';
import { parseJsonAnswer } from '../run/answers.js';
import { MAX_ANSWER_TRIES, awaitUser, requestModel, takeAnswer } from '../run/steps/common.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { readBrief, briefHash, briefText } from './brief.js';
import { referencesFor, filterSymlinkedReferences } from './references.js';
import { readHostImage } from './intake.js';
import { briefPayload, imagePayload, nodeMaterial, referenceMaterial } from './requests.js';

/** 그림 실행 기록장(.folio/ledger/assets.jsonl): 단계 결과·결정·영수증·커밋. 추가만 된다. */
export const IMAGE_LEDGER = 'assets';
/** 그림 한 장의 단계(정본 §14: 설명서 → 생성 전 점검 → 생성 → 검토 → 커밋, 그리고 사람의 승인). 순서와 종류는 코어가 정한다. */
export const IMAGE_STEPS = Object.freeze([
  { id: 'brief', kind: 'generate' }, { id: 'precheck', kind: 'check' }, { id: 'generate', kind: 'generate' },
  { id: 'review', kind: 'check' }, { id: 'approve', kind: 'gate' }, { id: 'commit', kind: 'commit' },
].map((step) => Object.freeze(step)));
export const stepIndex = (id) => IMAGE_STEPS.findIndex((s) => s.id === id);

/** 단계 결과의 digest. 기록장의 image_result 와 영수증의 단계가 이 값으로 맞물린다. */
export const resultDigest = (entry) => sha256(canonicalJson(entry ?? null));

/** 단계 결과를 기록장에 남긴다. 그 결과에 기대는 실행 파일 저장보다 먼저 부른다(가장 최근 기록이 이긴다). */
export async function recordStep(env, run, stepId) {
  await env.ledger.append({ type: 'image_result', runId: run.runId, assetId: run.assetId, stepId, digest: resultDigest(run.results[stepId]) });
}

const statusOf = (checks) => (checks.every((c) => c.status === 'not_applicable') ? 'not_applicable'
  : checks.some((c) => c.findings.some(isBlocking)) ? 'failed' : 'passed');
const findingsOf = (entry) => (entry?.checks ?? []).flatMap((c) => c.findings ?? []);

/**
 * 아직 풀리지 않은 막는 지적. hard 는 언제나 남는다. block 은 사람이 이유를 달고 넘긴 단계(점검은 precheck.approved, 검토는 approve)에서만 빠진다.
 * @param {any} run
 * @param {Array<'precheck'|'review'>} stepIds
 */
export function unresolved(run, stepIds) {
  const covered = (stepId) => (stepId === 'precheck' ? Boolean(run.results.precheck?.approved) : run.results.approve?.status === 'approved');
  return stepIds.flatMap((stepId) => findingsOf(run.results[stepId]).filter(isBlocking)
    .filter((f) => f.severity === 'hard' || !covered(stepId)));
}

/** 사람에게 묻는 질문(점검에서 막힘·승인·읽을 수 없는 답). 그림이 있으면 옮겨 둔 파일의 절대 경로를 준다. */
export function gateQuestion(env, run, kind, blocking, extra = {}) {
  const image = run.image ? { path: env.store.stagedPath(run.runId, run.image.name), hash: run.image.hash, type: run.image.type, model: run.image.model } : null;
  const advisories = ['precheck', 'review'].flatMap((id) => findingsOf(run.results[id]).filter((f) => !isBlocking(f)));
  return {
    kind, assetId: run.assetId, nodeId: run.nodeId, brief: run.brief, image, advisories, blocking,
    canApprove: kind !== 'image_blocked' && !blocking.some((f) => f.severity === 'hard'), ...extra,
  };
}

/** 읽을 수 없는 답은 세 번까지 다시 묻고, 그 뒤는 사람에게 넘긴다(건너뛰기만). */
function retry(env, run, stepId, error, request) {
  run.retries[stepId] = (run.retries[stepId] ?? 0) + 1;
  if (run.retries[stepId] < MAX_ANSWER_TRIES) return request({ retryReason: error });
  return awaitUser(run, gateQuestion(env, run, 'image_blocked', [{ checkId: stepId, severity: 'hard', code: 'IMAGE_ANSWER_FAILED', message: `${run.retries[stepId]} unreadable answers: ${error}` }], { stepId }));
}

/** 설명서가 바뀌면 그 뒤 결과(점검·그림·검토·승인)는 무효다. */
function dropAfterBrief(run) {
  for (const id of ['precheck', 'generate', 'review', 'approve']) delete run.results[id];
  run.image = null;
}

async function briefStep({ ctx, run, env, node }) {
  if (run.results.brief?.status === 'passed') { run.cursor += 1; return null; }
  const payload = briefPayload({ work: ctx.work, run, node });
  const request = (extra = {}) => requestModel(run, env, [{ stepId: 'brief', purpose: 'image_brief', payload: { ...payload, ...extra } }]);
  const entry = takeAnswer(run, 'brief', payload);
  if (entry === undefined) return request();
  let raw;
  try { raw = parseJsonAnswer(entry.answer); } catch { return retry(env, run, 'brief', 'BRIEF_JSON_INVALID', request); }
  const read = readBrief(ctx.work, raw);
  if ('errors' in read) return retry(env, run, 'brief', `${read.errors[0].code}:${read.errors[0].field}`, request);
  delete run.retries.brief;
  const hash = briefHash(read.brief);
  if (hash !== run.briefHash) dropAfterBrief(run);
  Object.assign(run, { brief: read.brief, briefHash: hash });
  run.results.brief = { status: 'passed', briefHash: hash };
  run.cursor += 1;
  return null;
}

async function precheckStep({ ctx, run, env, node }) {
  if (!run.results.precheck) {
    if (ctx.features.imageReferences) {
      const refs = referencesFor(ctx.work, run.brief.entities, { exclude: run.assetId });
      run.references = await filterSymlinkedReferences(env.root, refs);
    } else {
      run.references = null;
    }
    const checkCtx = { work: ctx.work, node: node ?? null, nodeText: node ? node.body : null, brief: run.brief, draft: briefText(run.brief), references: run.references };
    const checks = runDeterministicChecks(ctx.imageChecks.precheck, checkCtx);
    run.results.precheck = { status: statusOf(checks), briefHash: run.briefHash, checks };
    await recordStep(env, run, 'precheck');
  }
  const blocking = unresolved(run, ['precheck']);
  if (blocking.length) return awaitUser(run, gateQuestion(env, run, 'image_precheck', blocking));
  run.cursor += 1;
  return null;
}

async function generateStep({ run, env, node }) {
  if (run.image && run.image.briefHash === run.briefHash) { run.cursor += 1; return null; }
  const payload = imagePayload({ root: env.root, run, node });
  const request = (extra = {}) => requestModel(run, env, [{ stepId: 'generate', purpose: 'image_generate', payload: { ...payload, ...extra } }]);
  const entry = takeAnswer(run, 'generate', payload);
  if (entry === undefined) return request();
  let answer;
  try { answer = parseJsonAnswer(entry.answer); } catch { return retry(env, run, 'generate', 'IMAGE_ANSWER_JSON_INVALID', request); }
  let read;
  try { read = await readHostImage(answer?.path); } catch (error) {
    if (error instanceof FolioError) return retry(env, run, 'generate', error.code, request);
    throw error;
  }
  delete run.retries.generate;
  run.attempts.image += 1;
  const name = `image-${run.attempts.image}${read.ext}`;
  await env.store.stage(run.runId, name, read.bytes);
  const model = typeof answer.model === 'string' && answer.model.trim() ? answer.model.trim().slice(0, 200) : 'unknown';
  run.image = { name, hash: read.hash, type: read.type, bytes: read.bytes.length, model, briefHash: run.briefHash, from: String(answer.path).slice(0, 500) };
  for (const id of ['review', 'approve']) delete run.results[id];
  run.results.generate = { status: 'passed', imageHash: read.hash };
  run.cursor += 1;
  return null;
}

/** 옮겨 둔 그림이 그 사이 바뀌었으면(손으로 바꿈) 그림을 버리고 생성부터 다시 돈다 — 검토한 그림과 커밋하는 그림이 같아야 한다. */
export async function stagedIntact(env, run) {
  const bytes = await env.store.readStaged(run.runId, run.image.name);
  return bytes !== null && sha256(bytes) === run.image.hash;
}

async function reviewStep({ ctx, run, env, node }) {
  if (!run.results.review) {
    if (!(await stagedIntact(env, run))) {
      run.history.push({ event: 'staged_image_changed', at: env.now() });
      run.image = null;
      for (const id of ['generate', 'review', 'approve']) delete run.results[id];
      run.cursor = stepIndex('generate');
      return null;
    }
    const imageHash = run.image.hash;
    if (!ctx.features.imageReview) {
      run.results.review = { status: 'skipped', reason: 'imageReview is off in work.yaml features', source: 'work.yaml#features.imageReview', imageHash };
    } else if (ctx.imageChecks.review.length === 0) {
      run.results.review = { status: 'not_applicable', imageHash, checks: [] };
    } else {
      const text = briefText(run.brief);
      const payload = {
        ...buildModelCheckRequest(ctx.imageChecks.review, { draft: text }), asset: { id: run.assetId }, node: nodeMaterial(node), brief: run.brief,
        image: { path: env.store.stagedPath(run.runId, run.image.name), hash: imageHash, type: run.image.type },
        references: referenceMaterial(env.root, run.references ?? null),
      };
      const entry = takeAnswer(run, 'review', payload);
      if (entry === undefined) return requestModel(run, env, [{ stepId: 'review', purpose: 'image_review', payload }]);
      const checks = parseModelCheckAnswer(ctx.imageChecks.review, entry.answer, text);
      run.results.review = { status: statusOf(checks), imageHash, checks };
    }
    await recordStep(env, run, 'review');
  }
  run.cursor += 1;
  return null;
}

async function approveStep({ run, env }) {
  const approved = run.results.approve;
  if (approved?.status === 'approved' && approved.imageHash === run.image?.hash && approved.briefHash === run.briefHash) { run.cursor += 1; return null; }
  return awaitUser(run, gateQuestion(env, run, 'image_approval', unresolved(run, ['precheck', 'review'])));
}

/** 단계 id → 처리 함수. 커밋 단계는 core/image/commit.js 의 commitStep 을 실행기(runner.js)가 더한다(서로 부르지 않게). */
export const IMAGE_HANDLERS = { brief: briefStep, precheck: precheckStep, generate: generateStep, review: reviewStep, approve: approveStep };
