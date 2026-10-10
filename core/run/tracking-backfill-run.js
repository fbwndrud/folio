import { FolioError } from '../errors.js';
import { checkPlanFor, outOfSync, dropPending } from './sync.js';
import { pipelineFor, checksDigestFor } from './level-pipeline.js';
import { assertFeature } from '../work/features.js';
import { generateStep } from './steps/generate.js';
import { checkStep } from './steps/check.js';
import { outcomeFromPending, awaitUser, runCheckFindings, MAX_ANSWER_TRIES } from './steps/common.js';
import { scopeFor } from './payload.js';
import { prepareTracking } from '../tracking/candidates.js';
import { trackingCandidateFor } from '../tracking/extract.js';
import { assertBackfillText } from '../tracking/backfill.js';
import { backfillOfRun, assertBackfillActivationAllowed } from '../tracking/backfill-record.js';
import { recordBackfill, metadataDecision } from './tracking-backfill-write.js';

export const isTrackingBackfill = (run) => run?.mode === 'tracking-backfill';
export const backfillSteps = (pipeline) => [
  { ...(pipeline.steps.find((s) => s.produces === 'events' && !s.loop) ?? { id: 'extract', produces: 'events', kind: 'generate', requires: [] }), mode: 'on' },
  ...pipeline.steps.filter((s) => s.kind === 'check' && !s.loop),
];

/** 작품 잠금은 바깥 runner가 소유한다. 이 드라이버는 같은 run store를 쓴다. */
export function createTrackingBackfillDriver({ env, context, packs: _packs }) {
  const save = async (run) => { run.updatedAt = env.now(); await env.runs.save(run); };
  function reset(run, ctx) {
    dropPending(run); run.cursor = 0; run.results = {}; run.retries = {}; run.overridden = [];
    delete run.outputs.tracking; delete run.outputs.events; delete run.trackingAuthority;
    run.pipelineDigest = pipelineFor(ctx, run).digest; run.checksDigest = checksDigestFor(ctx, run);
    run.featuresDigest = ctx.featuresDigest; run.trackingStateDigest = ctx.trackingStateDigest;
    run.checkPlan = checkPlanFor(ctx, pipelineFor(ctx, run));
  }
  async function validate(run, ctx) {
    assertBackfillText(ctx, run);
    const recorded = backfillOfRun(ctx.receiptRecords, run);
    if (!recorded || recorded.hard === 0 && !ctx.work.tracking.batches.some((b) => b.receiptId === recorded.receiptId)) {
      assertBackfillActivationAllowed(run, await env.ledgers.decisions.readAll());
    }
    if (!recorded) assertFeature(ctx.work.config, 'tracking');
    return recorded;
  }
  async function drive(run) {
    for (;;) {
      const ctx = await context();
      const recorded = await validate(run, ctx);
      if (recorded) return recordBackfill({ ctx, run, env, recorded });
      if (outOfSync(run, ctx)) reset(run, ctx);
      trackingCandidateFor(ctx.work, run);
      const pending = outcomeFromPending(run); if (pending) return pending;
      const pipeline = pipelineFor(ctx, run); const steps = backfillSteps(pipeline); const step = steps[run.cursor];
      if (step) {
        const outcome = await (step.kind === 'generate' ? generateStep : checkStep)({ ctx, run, step, env });
        await save(run); if (outcome) return outcome; continue;
      }
      const errored = steps.find((s) => s.kind === 'check' && run.results[s.id]?.checks?.some((c) => c.status === 'error'));
      if (errored) {
        const tries = (run.retries[errored.id] ?? 0) + 1; run.retries[errored.id] = tries;
        if (errored.tier === 'model' && tries < MAX_ANSWER_TRIES) { delete run.results[errored.id]; run.cursor = steps.indexOf(errored); continue; }
        const outcome = awaitUser(run, { kind: 'blocked', stepId: 'tracking-record', code: 'TRACKING_BACKFILL_INCOMPLETE', canApprove: false, blocking: [], advisories: [] });
        await save(run); return outcome;
      }
      const findings = runCheckFindings(run); const hard = findings.filter((f) => f.severity === 'hard').length;
      if (!hard && !run.trackingAuthority && (run.outputs.tracking.staged || findings.some((f) => f.severity === 'block'))) {
        const outcome = awaitUser(run, { kind: 'tracking_metadata', stepId: 'tracking-record', canApprove: true,
          candidate: run.outputs.tracking, blocking: findings.filter((f) => f.severity === 'block'), advisories: findings.filter((f) => !['hard', 'block'].includes(f.severity)) });
        await save(run); return outcome;
      }
      const refs = scopeFor(ctx, run).refs;
      if (steps.filter((s) => s.kind === 'check').some((s) => JSON.stringify(run.results[s.id]?.refs) !== JSON.stringify(refs))) { reset(run, ctx); continue; }
      return recordBackfill({ ctx, run, env, steps, pipeline, refs, hard });
    }
  }
  async function start(ctx, node) {
    assertFeature(ctx.work.config, 'tracking');
    const target = ctx.work.tree.nodes.get(node); if (!target) throw new FolioError('NODE_NOT_FOUND', node);
    const commit = assertBackfillText(ctx, { nodeId: node });
    if (!ctx.work.tracking.plan) throw new FolioError('TRACKING_PLAN_REQUIRED', node);
    const at = env.now();
    const run = { runId: env.newId('run'), nodeId: node, nodeKind: target.kind, level: target.level, variant: 'main', mode: 'tracking-backfill',
      commitReceiptId: commit.receiptId, committedHash: commit.committedHash, draftHash: commit.committedHash,
      outputs: { draft: target.body, ...(target.kind === 'branch' ? { plan: target.body } : {}) }, state: 'active', cursor: 0, results: {}, retries: {}, inbox: {}, pending: null,
      overridden: [], approval: null, receipt: null, attempts: 0, createdAt: at, updatedAt: at, history: [], deactivated: [] };
    reset(run, ctx); await save(run); return drive(run);
  }
  async function resume({ runId, answers = {} }) {
    const run = await env.runs.load(runId); const ctx = await context(); await validate(run, ctx);
    if (run.state !== 'awaiting_model') throw new FolioError('RUN_NOT_AWAITING_MODEL', runId);
    if (outOfSync(run, ctx)) { reset(run, ctx); await save(run); throw new FolioError('ANSWER_STALE', runId); }
    trackingCandidateFor(ctx.work, run);
    const requests = run.pending.requests;
    const missing = requests.filter((r) => !(r.requestId in answers)).map((r) => r.requestId);
    if (missing.length) throw new FolioError('ANSWERS_INCOMPLETE', missing.join(', '));
    const unknown = Object.keys(answers).filter((id) => !requests.some((r) => r.requestId === id));
    if (unknown.length) throw new FolioError('ANSWER_UNKNOWN_REQUEST', unknown.join(', '));
    run.inbox = Object.fromEntries(requests.map((r) => [r.stepId, { requestId: r.requestId, purpose: r.purpose, answer: answers[r.requestId] }]));
    run.pending = null; run.state = 'active'; await save(run); return drive(run);
  }
  async function decide({ runId, action, feedback = '', reason = '' }) {
    const run = await env.runs.load(runId); const ctx = await context();
    if (action === 'skip') {
      if (!['active', 'awaiting_model', 'awaiting_user', 'committing'].includes(run.state)) throw new FolioError('RUN_NOT_AWAITING_USER', runId);
      if (!String(reason).trim()) throw new FolioError('SKIP_REASON_REQUIRED', runId);
      await metadataDecision({ ctx, run, env, action, feedback, reason }); run.state = 'abandoned'; run.pending = null; run.inbox = {}; await save(run);
      return { status: 'skipped', runId, nodeId: run.nodeId, reason };
    }
    await validate(run, ctx);
    if (run.state !== 'awaiting_user') throw new FolioError('RUN_NOT_AWAITING_USER', runId);
    if (outOfSync(run, ctx)) { reset(run, ctx); await save(run); return drive(run); }
    trackingCandidateFor(ctx.work, run);
    if (action === 'request_revision') {
      if (!String(feedback).trim()) throw new FolioError('FEEDBACK_REQUIRED', runId);
      await metadataDecision({ ctx, run, env, action, feedback, reason }); reset(run, ctx); run.userRevision = feedback;
    } else if (action === 'approve') {
      if (run.pending.question.canApprove !== true || runCheckFindings(run).some((f) => f.severity === 'hard')) throw new FolioError('APPROVE_BLOCKED_BY_HARD', runId);
      if (runCheckFindings(run).some((f) => f.severity === 'block') && !String(reason || feedback).trim()) throw new FolioError('OVERRIDE_REASON_REQUIRED', runId);
      // 승인 직전에도 strict 후보를 현재 원문·계획으로 다시 검증한다.
      prepareTracking(ctx.work, run, { planRev: run.outputs.tracking.basePlanRev, discoveries: { subjects: run.outputs.tracking.subjects, criteria: run.outputs.tracking.criteria },
        observations: run.outputs.tracking.observations, checked: run.outputs.tracking.checked }, { nodeId: run.nodeId, text: run.outputs.draft, mode: run.mode });
      await metadataDecision({ ctx, run, env, action, feedback, reason }); run.pending = null; run.state = 'active';
    } else throw new FolioError('ACTION_INVALID', action);
    await save(run); return drive(run);
  }
  return { start, resume, decide, drive };
}
