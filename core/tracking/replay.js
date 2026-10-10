import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertDelegation } from './authority.js';
import { normalizePlan } from './plan.js';
import { assertJson, fields, HASH, id, invalid } from './schema.js';
import { normalizeProposal, proposalDigest } from './proposals.js';
import { validateHistoricalBatch, recordBody, sameTracking } from './batch-schema.js';
import { activeTrackingSnapshots } from './snapshots.js';
import { currentBatchSnapshot } from './semantic.js';
import { applySubjectDefinitions, assertAdditivePlan, assertCriterionIdentity } from './definition-changes.js';

const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const METADATA = ['type', 'seq', 'prev', 'hash', 'at'];

function assertHostAddition(previous, next, grantId, subjects) {
  if (!previous) throw invalid('host requires an approved plan');
  const added = assertAdditivePlan(previous, next);
  if (added.length) assertDelegation(previous, 'addCriteria', grantId);
  if (subjects.length) assertDelegation(previous, 'addSubjects', grantId);
  if ((!added.length && !subjects.length) || added.some((criterion) => criterion.behavior === 'fixed')) throw invalid('host must add non-fixed criteria or subjects');
}

/** 영수증 연결 batch 활성화는 다음 단계가 담당한다. 모르는 기록을 무시하지 않는다. */
export function replayTracking(records, { nodeIds = [], legacyEntities = null, receiptRecords = [], nodes = null } = {}) {
  let plan = null;
  const definitions = new Map();
  const grants = new Set();
  const proposals = new Set();
  const subjects = new Map();
  const states = [];
  const batches = [];
  const activated = [];
  const snapshot = (seq) => ({ seq, plan, subjects: [...subjects.values()], records: [...activated] });
  for (const record of records) {
    try {
      assertJson(record);
      if (record.type === 'tracking_batch') {
        const batch = recordBody(record);
        const base = states.find((state) => state.seq === batch.baseTrackingSeq && state.plan?.rev === batch.basePlanRev && state.plan.version === batch.basePlanVersion && state.plan.grantId === batch.grantId);
        if (!base) throw invalid('tracking batch has no historical base');
        const next = validateHistoricalBatch(batch, { ...base, nodeIds, legacyEntities: legacyEntities ?? new Map() });
        const marker = receiptRecords.find((r) => batch.mode === 'tracking-backfill'
          ? r.type === 'tracking-backfill' && r.receiptId === batch.receiptId && r.hard === 0 && sameTracking(r.trackingBatch, batch)
          : r.type === 'commit' && r.receiptId === batch.receiptId);
        if (marker) {
          if (plan.rev !== batch.basePlanRev || plan.version !== batch.basePlanVersion || plan.grantId !== batch.grantId) throw invalid('tracking batch cannot activate against a changed plan');
          plan = next.plan;
          for (const subject of next.subjects) subjects.set(subject.id, subject);
          for (const criterion of batch.criteria) definitions.set(criterion.id, criterion);
          batches.push(batch); activated.push(record);
        }
        states.push(snapshot(record.seq));
        continue;
      }
      if (!['tracking_plan', 'tracking_decision'].includes(record.type)) throw invalid('unknown or unsupported tracking record type');
      fields(record, record.type === 'tracking_plan'
        ? [...METADATA, 'proposalId', 'proposalDigest', 'source', 'grantId', 'plan', 'subjects', 'proposal']
        : [...METADATA, 'proposalId', 'proposalDigest', 'source', 'action', 'feedback', 'proposal'], record.type);
      id(record.proposalId, 'proposalId');
      if (!HASH.test(record.proposalDigest) || proposals.has(record.proposalId)) throw invalid('invalid or duplicate tracking proposal');
      if (!['user', 'host'].includes(record.source)) throw invalid('tracking source is user or host');
      if (record.proposal) {
        const proposal = normalizeProposal(record.proposal, { nodeIds, legacyEntities, subjects: [...subjects.values()], evidence: false });
        if (!same(proposal, record.proposal) || proposalDigest(proposal) !== record.proposalDigest) throw invalid('recorded proposal digest or normalization mismatch');
        if (proposal.expectedRev !== (plan?.rev ?? null) || proposal.baseVersion !== (plan?.version ?? 0)) throw invalid('recorded proposal base is stale');
        if (record.type === 'tracking_plan' && (!same(proposal.plan, record.plan) || !same(proposal.subjects, record.subjects ?? []))) throw invalid('recorded application differs from proposal');
        if (record.source === 'host' && proposal.mode !== 'addition') throw invalid('host cannot apply a replacement proposal');
        if (proposal.mode === 'addition') {
          const added = assertAdditivePlan(plan, proposal.plan);
          if (!added.length && !proposal.subjects.length) throw invalid('addition proposal requires changes');
        }
      } else if (record.type === 'tracking_decision' || Object.hasOwn(record, 'proposal') || (record.subjects ?? []).length
        || record.proposalDigest !== sha256(canonicalJson(record.plan))) throw invalid('legacy plan-only proposal digest mismatch');
      if (record.type === 'tracking_decision') {
        if (record.source !== 'user' || record.action !== 'request_revision' || typeof record.feedback !== 'string' || !record.feedback.trim() || record.feedback.length > 4000) throw invalid('revision requires a user decision and meaningful feedback');
        proposals.add(record.proposalId);
        states.push(snapshot(record.seq));
        continue;
      }
      id(record.grantId, 'grantId');
      const next = normalizePlan(record.plan, { nodeIds });
      if (!same(next, record.plan)) throw invalid('recorded plan must match normalized content and revision');
      if (next.version !== (plan?.version ?? 0) + 1) throw invalid('plan version must increase by one');
      assertCriterionIdentity(definitions, next, record.source, plan);
      const nextSubjects = applySubjectDefinitions(subjects, next, record.subjects ?? [], legacyEntities, record.source);
      if (record.source === 'host') assertHostAddition(plan, next, record.grantId, record.subjects ?? []);
      else {
        if (grants.has(record.grantId)) throw invalid('user decision identity cannot be reused');
        grants.add(record.grantId);
      }
      for (const criterion of next.criteria) definitions.set(criterion.id, criterion);
      for (const [key, subject] of nextSubjects) subjects.set(key, subject);
      proposals.add(record.proposalId);
      plan = { ...next, grantId: record.grantId };
      activated.push(record); states.push(snapshot(record.seq));
    } catch (error) {
      throw new FolioError('TRACKING_RECORD_INVALID', error.message, { seq: record.seq, type: record.type, causeCode: error.code });
    }
  }
  for (const receipt of receiptRecords.filter((r) => ['receipt', 'tracking-backfill'].includes(r.type) && r.trackingBatch)) {
    const batch = receipt.trackingBatch;
    const base = states.find((state) => state.seq === batch.baseTrackingSeq && state.plan?.rev === batch.basePlanRev && state.plan.version === batch.basePlanVersion && state.plan.grantId === batch.grantId);
    if (!base) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'tracking receipt has no historical base');
    try { validateHistoricalBatch(batch, { ...base, nodeIds, legacyEntities: legacyEntities ?? new Map() }); }
    catch (error) { throw new FolioError('LOCK_TRACKING_INTEGRITY', error.message); }
  }
  return { plan, records, receiptRecords, subjects: [...subjects.values()], observations: activeTrackingSnapshots(batches, receiptRecords, nodes).flatMap((batch) =>
    currentBatchSnapshot({ plan, records, batches }, batch).observations.map((observation) => ({ ...observation, receiptId: batch.receiptId, runId: batch.runId, batchDigest: batch.batchDigest }))), batches };
}
