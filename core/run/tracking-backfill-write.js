import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { openLedger } from '../ledger/ledger.js';
import { refsDigest, overrideRecord } from '../ledger/decisions.js';
import { runCheckFindings } from './steps/common.js';
import { scopeFor } from './payload.js';
import { assertBackfillText, assertBackfillBase, buildBackfillRecord } from '../tracking/backfill.js';
import { assertBackfillDecisions, assertBackfillActivationAllowed, backfillOfRun, BACKFILL_TYPE } from '../tracking/backfill-record.js';
import { appendTrackingBatch } from '../tracking/commit.js';
import { assertTrackingIntegrity } from '../tracking/integrity.js';
import { activeTrackingSnapshots } from '../tracking/snapshots.js';
import { sameTracking } from '../tracking/batch-schema.js';
import { sha256 } from '../util/hash.js';

/** 사용자 요청으로만 호출되는 기록 경계. 검사 refs·후보·원고 영수증을 실제 결정에 결속한다. */
export async function metadataDecision({ ctx, run, env, action, feedback, reason }) {
  const refs = action !== 'skip' && run.outputs.tracking ? scopeFor(ctx, run).refs : [];
  if (action === 'approve') {
    for (const finding of runCheckFindings(run).filter((f) => f.severity === 'block')) {
      const override = { ...finding, overrideReason: String(reason || feedback).trim(), source: 'user' };
      run.overridden.push(override);
      await env.ledgers.decisions.append(overrideRecord({ runId: run.runId, nodeId: run.nodeId, stepId: 'tracking-record', draftHash: run.draftHash, override }));
    }
  }
  const prepared = action === 'skip' ? backfillOfRun(ctx.receiptRecords, run) : null;
  const cancellation = action === 'skip' ? { preparedReceiptId: prepared?.receiptId ?? null,
    batchActivated: Boolean(prepared && ctx.work.tracking.batches.some((b) => b.receiptId === prepared.receiptId)) } : {};
  const decision = await env.ledgers.decisions.append({ type: 'tracking_metadata_decision', source: 'user', decisionId: env.newId('tdecision'),
    runId: run.runId, nodeId: run.nodeId, stepId: 'tracking-record', committedHash: run.committedHash,
    commitReceiptId: run.commitReceiptId, planRev: run.outputs.tracking?.effectivePlanRev ?? ctx.work.tracking.plan?.rev ?? null,
    batchDigest: run.outputs.tracking?.batchDigest ?? null, refsDigest: refsDigest(refs), action, feedback, reason, ...cancellation });
  await env.hooks?.afterDecision?.(decision);
  if (action === 'approve') run.trackingAuthority = { source: 'user', decisionId: decision.decisionId, decisionSeq: decision.seq, decisionHash: decision.hash };
  return decision;
}

const finish = async (run, receipt, env) => {
  run.state = receipt.hard ? 'flagged' : 'done'; run.pending = null; run.receipt = receipt;
  const question = receipt.hard ? { kind: 'flagged', stepId: 'tracking-record', canApprove: false, receiptId: receipt.receiptId,
    hard: receipt.hard, advisories: receipt.advisories, draft: run.outputs.draft,
    blocking: receipt.steps.flatMap((s) => s.checks.flatMap((c) => c.findings)).filter((f) => f.severity === 'hard') } : null;
  if (question) run.flagged = question;
  run.updatedAt = env.now(); await env.runs.save(run);
  return { status: receipt.hard ? 'needs_user' : 'done', mode: BACKFILL_TYPE, runId: run.runId, nodeId: run.nodeId, receiptId: receipt.receiptId,
    ...(question ? { question } : {}) };
};

/** 영수증→batch 두 쓰기 사이에서 죽어도 불변 영수증을 신뢰해 복구한다. 원고 쓰기는 없다. */
export async function recordBackfill({ ctx, run, env, recorded = null, steps = [], pipeline = null, refs = [], hard = 0 }) {
  const fresh = async () => ({ ...ctx, work: await openWork(env.root), receiptRecords: await env.ledgers.receipts.readAll() });
  ctx = await fresh(); assertBackfillText(ctx, run);
  if (sha256(run.outputs.draft) !== run.committedHash) throw new FolioError('TRACKING_TEXT_DRIFTED', run.nodeId);
  let receipt = recorded;
  if (receipt) assertBackfillBase(ctx.work, receipt);
  else {
    receipt = buildBackfillRecord({ ctx, run, env, steps, pipeline, refs, hard });
    const decisions = await env.ledgers.decisions.readAll();
    receipt = { ...receipt, decisionBoundary: decisions.at(-1)?.seq ?? 0 };
    if (!hard) assertBackfillActivationAllowed(run, decisions);
    assertBackfillDecisions(receipt, decisions);
    const active = activeTrackingSnapshots(ctx.work.tracking.batches, ctx.receiptRecords, ctx.work.tree.nodes);
    const failure = ctx.receiptRecords.filter((r) => r.type === BACKFILL_TYPE && r.nodeId === receipt.nodeId && r.hard > 0
      && r.commitReceiptId === receipt.commitReceiptId && r.committedHash === receipt.committedHash).at(-1);
    const existing = ctx.receiptRecords.find((r) => r.type === BACKFILL_TYPE && r.hard === 0 && receipt.hard === 0
      && r.seq > (failure?.seq ?? 0)
      && r.commitReceiptId === receipt.commitReceiptId && r.committedHash === receipt.committedHash && r.planRev === receipt.planRev
      && r.batchDigest === receipt.batchDigest && r.pipelineDigest === receipt.pipelineDigest && sameTracking(r.refs, receipt.refs)
      && sameTracking(r.appliedChecks, receipt.appliedChecks)
      && active.some((b) => b.receiptId === r.receiptId));
    if (existing) return finish(run, existing, env);
    run.state = 'committing'; await env.runs.save(run);
    receipt = await env.ledgers.receipts.append({ type: BACKFILL_TYPE, ...receipt });
    await env.hooks?.afterReceiptWrite?.(receipt);
  }
  await assertTrackingIntegrity(env.root);
  if (receipt.hard) return finish(run, receipt, env);
  ctx = await fresh(); assertBackfillText(ctx, { ...run, committedHash: receipt.committedHash, commitReceiptId: receipt.commitReceiptId });
  assertBackfillBase(ctx.work, receipt);
  await appendTrackingBatch(env.root, receipt.trackingBatch);
  await env.hooks?.afterTrackingWrite?.(receipt.trackingBatch);
  await openLedger(env.root, 'tracking').readAll();
  return finish(run, receipt, env);
}
