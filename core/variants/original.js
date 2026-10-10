import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';

/**
 * 판본이 기대는 원본(main)의 지금 커밋. 판본은 커밋된 원본에서만 만든다:
 * - 노드가 committed 이고 main 커밋 기록이 있어야 한다(아니면 VARIANT_ORIGINAL_NOT_COMMITTED).
 * - 파일 본문이 그 커밋 원고 그대로여야 한다(손수정이면 VARIANT_ORIGINAL_DRIFTED — 기록장에는 hash 만 있어 커밋 원고를 되살릴 수 없다).
 * @param {{ work: { tree: { nodes: Map<string, any> } }, receiptRecords: any[] }} ctx
 * @param {string} nodeId
 * @returns {{ error: string|null, text: string|null, original: { receiptId: string, committedHash: string }|null }}
 */
export function originalOf(ctx, nodeId) {
  const node = ctx.work.tree.nodes.get(nodeId);
  const commit = lastCommits(ctx.receiptRecords).get(nodeId);
  if (!node || !commit || node.status !== 'committed') return { error: 'VARIANT_ORIGINAL_NOT_COMMITTED', text: null, original: null };
  if (sha256(node.body) !== commit.committedHash) return { error: 'VARIANT_ORIGINAL_DRIFTED', text: null, original: null };
  return { error: null, text: node.body, original: { receiptId: commit.receiptId, committedHash: commit.committedHash } };
}

/** 이 판본의 지금 파일 본문(없으면 null). */
export const variantTextOf = (work, variant, nodeId) => work.variants?.get(variant)?.texts.get(nodeId) ?? null;
