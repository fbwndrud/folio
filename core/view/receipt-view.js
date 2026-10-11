import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { workStatus } from '../status.js';
import { lastCommits, receiptsById } from '../ledger/receipts.js';
import { lastImports } from '../import/records.js';
import { latestRecheck } from '../scope/stale-checks.js';
import { readLedgerView } from './ledgers.js';
import { variantTextOf } from '../variants/original.js';
import { MAIN, variantOf } from '../variants/model.js';

/**
 * 다시 확인 필요·되채우기·막힘·손수정. 설정이 틀려 상태를 못 내면 null(영수증 자체는 그대로 보여 준다).
 * @param {string} root
 * @param {Map<string, any>} packs
 */
export async function statusOrNull(root, packs) {
  try {
    return await workStatus(root, { packs });
  } catch (error) {
    if (error instanceof FolioError) return null;
    throw error;
  }
}

/** @param {any} receipt */
const stepSummary = (receipt) => ({
  skipped: receipt.steps.filter((s) => s.status === 'skipped').map((s) => s.id),
  failed: receipt.steps.filter((s) => s.status === 'failed' || s.status === 'error').map((s) => s.id),
  overridden: (receipt.overridden ?? []).length,
  advisories: (receipt.advisories ?? []).length,
  hard: receipt.hard,
});

/** 가져온 출처만 보여 준다. 가져오기 기록은 검사 판정이나 영수증이 아니다. */
const importedOf = (record) => (record ? { importId: record.importId, status: record.status, at: record.at, from: record.origin?.from ?? null, path: record.origin?.path ?? null } : null);

/**
 * 영수증 목록: 읽는 순서의 노드마다 마지막 커밋의 영수증 요약(건너뛴 단계, 실패·오류, 넘긴 지적, 참고 의견 수)과
 * 다시 확인 필요(stale)·되채우기(recheck)·막힘(flagged)·손수정(drift). "critic 을 건너뛴 장면만 보기"는 skipped 로 거른다.
 * 영수증 기록장이 깨졌으면 짐작하지 않고 검증 결과만 준다.
 * @param {string} root
 * @param {{ packs: Map<string, any> }} options
 */
export async function viewReceiptList(root, { packs }, context = null) {
  const { records, ledger } = context?.receipts ?? await readLedgerView(root, 'receipts');
  if (!records) return { ledger, nodes: [] };
  const work = context?.work ?? await openWork(root);
  const status = context && Object.hasOwn(context, 'status') ? context.status : await statusOrNull(root, packs);
  const commits = lastCommits(records);
  const receipts = receiptsById(records);
  const imports = lastImports(records);
  const has = (list, nodeId) => (list ? list.some((item) => item.nodeId === nodeId) : null);
  const nodes = preorder(work.tree).map((nodeId) => {
    const node = work.tree.nodes.get(nodeId);
    const commit = commits.get(nodeId);
    const receipt = commit ? receipts.get(commit.receiptId) : null;
    return {
      nodeId, title: node.title, level: node.level, kind: node.kind, status: node.status,
      committed: Boolean(receipt), receiptId: receipt?.receiptId ?? null, at: commit?.at ?? null, imported: importedOf(imports.get(nodeId)),
      ...(receipt ? stepSummary(receipt) : { skipped: [], failed: [], overridden: 0, advisories: 0, hard: 0 }),
      stale: has(status?.stale, nodeId), recheck: has(status?.recheck, nodeId), flagged: has(status?.flagged, nodeId),
      drift: status ? (status.drift.find((d) => d.nodeId === nodeId && variantOf(d) === MAIN)?.code ?? null) : null,
    };
  });
  return { ledger, statusAvailable: status !== null, nodes };
}

/**
 * 노드 하나의 영수증: 커밋 이력, 마지막 커밋의 영수증 전체(단계별 결과, 건너뛴 이유와 출처, 참고한 버전, 지적),
 * 그 커밋 뒤의 가장 최근 재검사, 다시 확인 필요 이유와 손수정. 읽기만 한다.
 * @param {string} root
 * @param {{ packs: Map<string, any>, variant?: string }} options
 * @param {string} nodeId
 */
export async function viewNodeReceipts(root, { packs, variant = MAIN }, nodeId, context = null) {
  const { records, ledger } = context?.receipts ?? await readLedgerView(root, 'receipts');
  if (!records) return { ledger, nodeId, commits: [], receipt: null, imported: null, recheck: null, stale: null, drift: null };
  const work = context?.work ?? await openWork(root);
  const node = work.tree.nodes.get(nodeId);
  if (!node) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  const status = context && Object.hasOwn(context, 'status') ? context.status : await statusOrNull(root, packs);
  // 선택 판본의 커밋만 읽는다. 생략하면 기존 main 조회다.
  const commits = records.filter((r) => r.type === 'commit' && r.nodeId === nodeId && variantOf(r) === variant);
  const last = commits.at(-1) ?? null;
  const receipt = last ? receiptsById(records).get(last.receiptId) ?? null : null;
  const importedRecord = variant === MAIN ? lastImports(records).get(nodeId) : null;
  const selectedStatus = variant === MAIN ? status : status?.variants?.[variant];
  const recheck = last ? latestRecheck(records, last) : null;
  return {
    ledger, nodeId, variant, title: variant === MAIN ? node.title : variantTextOf(work, variant, nodeId)?.title ?? node.title,
    commits: commits.map((c) => ({ receiptId: c.receiptId, seq: c.seq, at: c.at, committedHash: c.committedHash })),
    receipt: receipt ? {
      receiptId: receipt.receiptId, runId: receipt.runId, level: receipt.level, at: receipt.at, draftHash: receipt.draftHash,
      pipelineDigest: receipt.pipelineDigest, steps: receipt.steps, refs: receipt.refs, hard: receipt.hard,
      advisories: receipt.advisories ?? [], overridden: receipt.overridden ?? [], attempts: receipt.attempts, order: receipt.order ?? null, variant: variantOf(receipt), original: receipt.original ?? null,
    } : null,
    imported: importedRecord ? { ...importedOf(importedRecord), importedHash: importedRecord.importedHash, origin: importedRecord.origin } : null,
    recheck: recheck ? { recheckId: recheck.recheckId, at: recheck.at, hard: recheck.hard, steps: recheck.steps } : null,
    stale: selectedStatus ? (selectedStatus.stale.find((s) => s.nodeId === nodeId)?.reasons ?? []) : null,
    drift: selectedStatus ? (selectedStatus.drift.find((d) => d.nodeId === nodeId && (variant !== MAIN || variantOf(d) === MAIN)) ?? null) : null,
  };
}
