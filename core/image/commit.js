import { FolioError } from '../errors.js';
import { RESERVED_RECEIPT_FIELDS } from '../ledger/receipts.js';
import { writeAssetOnce } from '../store/assets.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';
import { briefHash } from './brief.js';
import { buildAssetReceipt, SAME_HOST, validateAssetReceipt } from './receipt.js';
import { resultDigest, stepIndex, unresolved } from './steps.js';

/** 영수증·커밋 기록과 대조하는 단계: 그 결과가 기록장의 가장 최근 image_result 와 같아야 한다. */
const LEDGER_STEPS = ['precheck', 'review', 'approve'];
const REVIEW_OK = new Set(['passed', 'failed', 'skipped', 'not_applicable']);
const strip = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !RESERVED_RECEIPT_FIELDS.includes(key)));

/** 그림 커밋이 쓰는 설명서(yaml). 같은 실행이면 언제 다시 만들어도 같은 바이트다(이어서 커밋할 때 writeAssetOnce 가 통과). */
export function assetMeta(run, receipt) {
  const meta = { id: run.assetId, file: receipt.file };
  if (run.nodeId) meta.nodeId = run.nodeId;
  meta.brief = run.brief;
  meta.generation = { model: receipt.model, references: receipt.references };
  meta.review = { receiptId: receipt.receiptId, status: receipt.steps.find((s) => s.id === 'review').status, reviewer: { ...SAME_HOST } };
  return meta;
}

/**
 * 커밋 전 잠금. 실행 파일은 손으로 고칠 수 있으므로 믿지 않는다 — 기록장과 옮겨 둔 바이트로 다시 본다.
 * 하나라도 어긋나면 FolioError(LOCK_*) 로 거부하고 아무것도 쓰지 않는다.
 */
async function assertCommitLocks(env, run, records) {
  const fail = (code, message, extra = {}) => { throw new FolioError(code, message, { runId: run.runId, ...extra }); };
  const bytes = await env.store.readStaged(run.runId, run.image?.name);
  if (!bytes || sha256(bytes) !== run.image.hash) fail('LOCK_IMAGE_HASH_MISMATCH', 'the staged picture is not the reviewed picture');
  const approve = run.results.approve;
  if (approve?.status !== 'approved' || approve.imageHash !== run.image.hash || approve.briefHash !== run.briefHash) fail('LOCK_APPROVAL_MISSING', 'the picture was not approved as it is');
  if (run.image.briefHash !== run.briefHash || run.results.precheck?.briefHash !== run.briefHash) fail('LOCK_BRIEF_HASH_MISMATCH', 'the picture was made or checked for another brief');
  const review = run.results.review;
  if (!review || !REVIEW_OK.has(review.status) || review.imageHash !== run.image.hash) fail('LOCK_REVIEW_MISSING', 'the picture was not reviewed (nor skipped with a reason)');
  if (review.status === 'skipped' && !(review.reason && review.source)) fail('LOCK_REVIEW_MISSING', 'a skipped review needs its reason and source');
  const findings = ['precheck', 'review'].flatMap((id) => (run.results[id]?.checks ?? []).flatMap((c) => c.findings ?? []));
  if (findings.some((f) => f.severity === 'hard')) fail('LOCK_HARD_FINDING', 'hard findings are never committed');
  if (unresolved(run, ['precheck', 'review']).length) fail('LOCK_BLOCK_UNRESOLVED', 'blocking findings were not approved');
  // 넘긴 block 은 이유가 있어야 한다: 점검의 block 은 precheck.approved.reason, 검토의 block 은 승인 이유.
  const precheckBlocks = (run.results.precheck?.checks ?? []).flatMap((c) => c.findings ?? []).filter((f) => f.severity === 'block');
  const reviewBlocks = (review.checks ?? []).flatMap((c) => c.findings ?? []).filter((f) => f.severity === 'block');
  if (precheckBlocks.length && !run.results.precheck.approved?.reason) fail('LOCK_OVERRIDE_REASON_MISSING', 'a passed-over precheck block needs a reason');
  if (reviewBlocks.length && !approve.reason) fail('LOCK_OVERRIDE_REASON_MISSING', 'a passed-over review block needs a reason');
  for (const stepId of LEDGER_STEPS) {
    const latest = records.filter((r) => r.type === 'image_result' && r.runId === run.runId && r.stepId === stepId).at(-1);
    if (!latest || latest.digest !== resultDigest(run.results[stepId])) fail('LOCK_LEDGER_MISMATCH', `${stepId} differs from the recorded result`, { stepId });
  }
}

/** 이 실행의 영수증(기록장). 이미 남겼으면 그것을, 아니면 잠금을 보고 새로 만들어 남긴다. */
async function receiptFor(env, run, records) {
  const recorded = records.filter((r) => r.type === 'asset_receipt' && r.runId === run.runId).at(-1);
  if (recorded) {
    const stored = strip(recorded);
    const rebuilt = buildAssetReceipt(run, { receiptId: stored.receiptId });
    if (canonicalJson(rebuilt) !== canonicalJson(stored)) throw new FolioError('LOCK_RECEIPT_MISMATCH', `${stored.receiptId} differs from this run`, { runId: run.runId });
    return stored;
  }
  if (records.some((r) => r.type === 'asset_commit' && r.assetId === run.assetId)) throw new FolioError('ASSET_EXISTS', run.assetId, { assetId: run.assetId });
  await assertCommitLocks(env, run, records);
  const receipt = buildAssetReceipt(run, { receiptId: env.newId('imgrcpt') });
  const errors = validateAssetReceipt(receipt);
  if (errors.length) throw new FolioError('RECEIPT_INVALID', errors.map((e) => e.code).join(', '), { errors });
  await env.ledger.append({ type: 'asset_receipt', ...receipt });
  return receipt;
}

/**
 * 커밋 단계: 잠금 → 영수증(assets 기록장) → assets/<id>.<ext> → assets/<id>.yaml → asset_commit 기록.
 * 노드 파일은 쓰지 않는다 — 본문에 놓기는 작가가 ![[asset:id]] 를 넣고 다시 커밋(recommit)한다.
 * 중간에 끊겨도 이어서 부르면 같은 영수증·같은 바이트로 끝맺는다(쓰기는 한 번만, 같은 내용이면 통과).
 */
export async function commitStep({ ctx, run, env }) {
  if (briefHash(run.brief) !== run.briefHash) throw new FolioError('LOCK_BRIEF_HASH_MISMATCH', 'the brief differs from the reviewed brief', { runId: run.runId });
  const records = await env.ledger.readAll();
  const existing = ctx.work.assets.get(run.assetId);
  const ownReceipt = records.some((r) => r.type === 'asset_receipt' && r.runId === run.runId && r.assetId === run.assetId);
  // Only this run's receipted legacy output may be resumed; managed ownership is never bypassed.
  if (existing && (existing.managed || run.state !== 'committing' || !ownReceipt)) {
    throw new FolioError('ASSET_EXISTS', run.assetId, { assetId: run.assetId });
  }
  run.state = 'committing';
  const receipt = await receiptFor(env, run, records);
  run.receipt = { receiptId: receipt.receiptId };
  await env.store.save(run);
  const bytes = await env.store.readStaged(run.runId, run.image.name);
  if (!bytes || sha256(bytes) !== receipt.fileHash) throw new FolioError('LOCK_IMAGE_HASH_MISMATCH', 'the staged picture is not the receipt picture', { runId: run.runId });
  await writeAssetOnce(env.root, receipt.file, bytes);
  await writeAssetOnce(env.root, `${run.assetId}.yaml`, stringifyYaml(assetMeta(run, receipt)));
  if (!records.some((r) => r.type === 'asset_commit' && r.receiptId === receipt.receiptId)) {
    await env.ledger.append({ type: 'asset_commit', runId: run.runId, assetId: run.assetId, receiptId: receipt.receiptId, file: receipt.file, fileHash: receipt.fileHash });
  }
  Object.assign(run, { state: 'done', pending: null, cursor: stepIndex('commit') + 1 });
  run.history.push({ event: 'committed', receiptId: receipt.receiptId, at: env.now() });
  return { status: 'done', runId: run.runId, assetId: run.assetId, nodeId: run.nodeId, receiptId: receipt.receiptId, file: receipt.file };
}
