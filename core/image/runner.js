import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkLock } from '../run/work-lock.js';
import { outcomeFromPending } from '../run/steps/common.js';
import { ID } from '../store/ids.js';
import { ASSETS_DIR } from '../store/assets.js';
import { openImageContext } from './context.js';
import { createImageRunStore, IMAGE_OPEN_STATES } from './run-store.js';
import { IMAGE_HANDLERS, IMAGE_LEDGER, IMAGE_STEPS, stepIndex } from './steps.js';
import { commitStep } from './commit.js';
import { assertImageRunParents } from './run-paths.js';
import { applyImageDecision } from './decide.js';

const HANDLERS = Object.freeze({ ...IMAGE_HANDLERS, commit: commitStep });
const defaultId = (prefix) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const exists = (path) => lstat(path).then(() => true, (error) => (error?.code === 'ENOENT' ? false : Promise.reject(error)));

/**
 * 설정(그림 stage 검사·그림 기능)이 질문을 낸 뒤 바뀌었으면 옛 질문을 버리고 점검부터 다시 돈다. 설명서와 그림은 남긴다
 * (같은 설명서면 그림 단계는 지나간다 — 검토만 새 설정으로 다시). 커밋 중인 실행은 건드리지 않는다(커밋이 영수증으로 끝맺는다).
 */
function syncSpec(run, ctx, now) {
  if (run.specDigest === ctx.specDigest || run.state === 'committing') return;
  for (const id of ['precheck', 'review', 'approve']) delete run.results[id];
  if (run.cursor > stepIndex('precheck')) run.cursor = stepIndex('precheck');
  Object.assign(run, { specDigest: ctx.specDigest, pending: null, state: 'active' });
  run.history.push({ event: 'spec_changed', at: now() });
}

/**
 * 그림 실행기(M7a). 노드 실행기(core/run/runner.js)와 따로 돈다 — 실행 파일은 .folio/image-runs, 기록은 assets 기록장.
 * 모델을 부르지 않는다: 설명서·그림·검토는 needs_model 로, 점검에서 막힘·승인은 needs_user 로 돌려준다.
 * start/resume/decide 는 작품 잠금(노드 실행과 같은 .folio/runs/.lock) 안에서 한 번에 하나씩 돈다.
 */
export function createImageRunner({ root, packs, now = () => new Date().toISOString(), newId = defaultId }) {
  const store = createImageRunStore(root);
  const env = { root, now, newId, store, ledger: openLedger(root, IMAGE_LEDGER, { now }) };

  async function drive(run) {
    for (;;) {
      const ctx = await openImageContext(root, { packs });
      const node = run.nodeId ? ctx.work.tree.nodes.get(run.nodeId) : null;
      if (run.nodeId && !node) throw new FolioError('NODE_NOT_FOUND', run.nodeId);
      syncSpec(run, ctx, now);
      const step = IMAGE_STEPS[run.cursor];
      const handler = step ? HANDLERS[step.id] : undefined;
      if (!handler) throw new FolioError('IMAGE_STEP_UNAVAILABLE', `${run.runId} cursor ${run.cursor}`);
      const outcome = await handler({ ctx, run, env, node });
      run.updatedAt = now();
      await store.save(run);
      if (outcome) return outcome;
    }
  }

  /** 새 그림 한 장. assetId 는 작품에 없는 새 id(assets/<id>.yaml 도 없어야 함), nodeId 는 그림이 붙을 노드(없어도 됨). */
  async function start({ assetId, nodeId = null }) {
    if (typeof assetId !== 'string' || !ID.test(assetId) || assetId.length > 100) throw new FolioError('ID_INVALID', `asset id: ${String(assetId).slice(0, 100)}`);
    const ctx = await openImageContext(root, { packs });
    if (nodeId !== null && !ctx.work.tree.nodes.has(nodeId)) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
    if (ctx.work.assets.has(assetId) || await exists(join(root, ASSETS_DIR, `${assetId}.yaml`))) throw new FolioError('ASSET_EXISTS', assetId, { assetId });
    if ((await env.ledger.readAll()).some((r) => r.type === 'asset_receipt' && r.assetId === assetId)) throw new FolioError('ASSET_EXISTS', assetId, { assetId });
    const open = (await store.list({ strict: true })).find((r) => IMAGE_OPEN_STATES.has(r.state));
    if (open) throw new FolioError('IMAGE_RUN_IN_PROGRESS', `${open.runId} for ${open.assetId} is not finished`, { runId: open.runId, assetId: open.assetId });
    const at = now();
    const run = {
      runId: newId('imgrun'), assetId, nodeId, state: 'active', cursor: 0, specDigest: ctx.specDigest,
      brief: null, briefHash: null, image: null, references: null, results: {}, attempts: { image: 0, briefRevisions: 0, imageRevisions: 0 },
      retries: {}, feedback: null, inbox: {}, issued: {}, pending: null, receipt: null, createdAt: at, updatedAt: at, history: [],
    };
    return drive(run);
  }

  async function resume({ runId, answers = {} }) {
    const run = await store.load(runId);
    // 커밋 중에 끊긴 실행은 이어서 부르면 같은 영수증·같은 바이트로 끝맺는다.
    if (run.state === 'committing') return drive(run);
    if (run.state !== 'awaiting_model') throw new FolioError('IMAGE_RUN_NOT_AWAITING_MODEL', runId, { state: run.state });
    const ctx = await openImageContext(root, { packs });
    // 질문을 낸 뒤 설정이 바뀌었으면 답을 받지 않고 새 설정으로 다시 묻는다(그 질문이 돌아간다).
    if (run.specDigest !== ctx.specDigest) return drive(run);
    const requests = run.pending.requests;
    const missing = requests.filter((r) => !(r.requestId in answers)).map((r) => r.requestId);
    if (missing.length) throw new FolioError('ANSWERS_INCOMPLETE', missing.join(', '), { missing });
    const unknown = Object.keys(answers).filter((id) => !requests.some((r) => r.requestId === id));
    if (unknown.length) throw new FolioError('ANSWER_UNKNOWN_REQUEST', unknown.join(', '), { unknown });
    run.inbox = Object.fromEntries(requests.map((r) => [r.stepId, { requestId: r.requestId, purpose: r.purpose, answer: answers[r.requestId] }]));
    Object.assign(run, { pending: null, state: 'active' });
    await store.save(run);
    return drive(run);
  }

  async function decide({ runId, action, feedback = '', reason = '' }) {
    const run = await store.load(runId);
    // 버리기는 기능이 꺼져 있어도 받는다 — 그림 실행이 멈춰 남지 않게. 그 밖은 기능·설정을 먼저 본다.
    if (action !== 'skip') {
      const ctx = await openImageContext(root, { packs });
      if (run.specDigest !== ctx.specDigest && IMAGE_OPEN_STATES.has(run.state)) return drive(run);
    }
    const done = await applyImageDecision(env, run, { action, feedback, reason });
    run.updatedAt = now();
    await store.save(run);
    return done ?? drive(run);
  }

  /** 열린 그림 실행의 지금 질문(없으면 null). */
  async function pending() {
    const open = (await store.list({ strict: true })).find((r) => IMAGE_OPEN_STATES.has(r.state));
    return open ? { runId: open.runId, assetId: open.assetId, state: open.state, outcome: outcomeFromPending(open) } : null;
  }

  const serial = (fn) => async (args) => {
    await assertImageRunParents(root);
    return withWorkLock(root, async () => {
      await assertImageRunParents(root);
      return fn(args);
    });
  };
  return { start: serial(start), resume: serial(resume), decide: serial(decide), pending: serial(pending) };
}
