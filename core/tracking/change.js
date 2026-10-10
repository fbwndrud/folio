import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { lastCommits } from '../ledger/receipts.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { withWorkLock } from '../run/work-lock.js';
import { openWork } from '../store/work.js';
import { sha256 } from '../util/hash.js';
import { buildProposal, normalizeProposal, proposalDigest, proposalImpact } from './proposals.js';
import { loadProposal, saveProposal } from './proposal-io.js';
import { replayTracking } from './replay.js';
import { TRACKING_LEDGER } from './records.js';
import { assertJson, fields, HASH, id, invalid, text } from './schema.js';
import { trackingQuery, trackingView } from './view.js';
import { legacyEntitiesFor, validateProposedDefinitions } from './definition-changes.js';

const ARGS = {
  get: { required: [], allowed: ['planId'] },
  query: { required: [], allowed: ['type', 'subjectId', 'criterionId', 'nodeId', 'cursor', 'limit'] },
  propose: { required: ['expectedRev'], allowed: ['expectedRev', 'plan', 'changes'] },
  decide: { required: ['proposalId', 'proposalDigest', 'action'], allowed: ['proposalId', 'proposalDigest', 'action', 'feedback'] },
  apply: { required: ['proposalId', 'proposalDigest', 'grantId'], allowed: ['proposalId', 'proposalDigest', 'grantId'] },
};

function argumentsFor(input) {
  assertJson(input);
  const rule = Object.hasOwn(ARGS, input?.op) ? ARGS[input.op] : null;
  if (!rule) throw invalid('unknown tracking operation');
  fields(input, ['op', ...rule.allowed], input.op);
  if (rule.required.some((key) => input[key] === undefined)) throw invalid(`missing fields for ${input.op}`);
  if (input.planId !== undefined && input.planId !== 'main') throw invalid('planId must be main');
  if (input.op === 'propose') {
    if ((input.plan !== undefined) === (input.changes !== undefined)) throw invalid('propose requires exactly one of plan or changes');
    if (input.expectedRev !== null && (typeof input.expectedRev !== 'string' || !HASH.test(input.expectedRev))) throw invalid('expectedRev requires null or a plan hash');
  }
  if (['decide', 'apply'].includes(input.op)) {
    id(input.proposalId, 'proposalId');
    if (!HASH.test(input.proposalDigest)) throw invalid('invalid proposalDigest');
  }
  if (input.op === 'apply') id(input.grantId, 'grantId');
  if (input.op === 'decide') {
    if (!['approve', 'request_revision'].includes(input.action)) throw invalid('unknown tracking decision');
    if (input.action === 'request_revision') text(input.feedback, 'feedback');
    else if (input.feedback !== undefined) throw invalid('feedback belongs only to request_revision');
  }
}

function assertCurrent(work, proposal) {
  if (proposal.expectedRev !== (work.tracking.plan?.rev ?? null) || proposal.baseVersion !== (work.tracking.plan?.version ?? 0)) throw new FolioError('TRACKING_REV_STALE', 'read the current plan and propose again');
}

function validateRecord(work, record) {
  try {
    return replayTracking([...work.tracking.records, record], { nodeIds: [...work.tree.nodes.keys()], legacyEntities: legacyEntitiesFor(work), receiptRecords: work.tracking.receiptRecords, nodes: work.tree.nodes });
  } catch (error) {
    if (error.details?.causeCode === 'TRACKING_DELEGATION_REQUIRED') throw new FolioError('TRACKING_DELEGATION_REQUIRED', error.message);
    throw invalid(error.message);
  }
}

/** 공개 변경은 작품 잠금 안에서 정본을 다시 읽고 검증된 기록 하나만 추가한다. */
export async function trackingChange(root, input) {
  argumentsFor(input);
  if (['get', 'query'].includes(input.op)) {
    const work = await openWork(root);
    return input.op === 'get' ? trackingView(work) : trackingQuery(work, input);
  }
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    const open = (await createRunStore(root).list()).find((run) => run.error || OPEN_STATES.has(run.state));
    if (open) throw new FolioError('TRACKING_RUN_OPEN', 'finish the writing run before changing tracking', { runId: open.runId });
    const commits = lastCommits(await openLedger(root, 'receipts').readAll());
    const discoveryNodes = new Map([...work.tree.nodes].filter(([key, node]) => node.status === 'committed' && commits.get(key)?.committedHash === sha256(node.body)));
    if (input.op === 'propose') {
      assertCurrent(work, { expectedRev: input.expectedRev, baseVersion: work.tracking.plan?.version ?? 0 });
      const proposal = buildProposal({ ...work, discoveryNodes }, input);
      const proposalId = `proposal-${randomUUID()}`;
      const digest = proposalDigest(proposal);
      validateProposedDefinitions(work, proposal);
      await saveProposal(root, { proposalId, proposalDigest: digest, proposal });
      return { proposalId, proposalDigest: digest, proposal, diff: proposalImpact(proposal, work) };
    }
    if (work.tracking.records.some((record) => record.proposalId === input.proposalId)) throw new FolioError('TRACKING_PROPOSAL_DECIDED', 'proposal already has a canonical decision');
    const cached = await loadProposal(root, input.proposalId, input.proposalDigest);
    assertCurrent(work, cached);
    const proposal = normalizeProposal(cached, { nodeIds: [...work.tree.nodes.keys()], nodes: discoveryNodes, legacyEntities: legacyEntitiesFor(work), subjects: work.tracking.subjects });
    if (proposalDigest(proposal) !== input.proposalDigest) throw new FolioError('TRACKING_PROPOSAL_DIGEST_MISMATCH', 'normalized proposal changed');
    if (input.op === 'apply' && proposal.mode !== 'addition') throw new FolioError('TRACKING_DELEGATION_REQUIRED', 'replacement plans require an explicit user decision');
    const common = { proposalId: input.proposalId, proposalDigest: input.proposalDigest, proposal };
    const record = input.op === 'decide' && input.action === 'request_revision'
      ? { ...common, type: 'tracking_decision', source: 'user', action: input.action, feedback: text(input.feedback, 'feedback') }
      : { ...common, type: 'tracking_plan', source: input.op === 'apply' ? 'host' : 'user',
        grantId: input.op === 'apply' ? input.grantId : `decision-${randomUUID()}`, plan: proposal.plan, subjects: proposal.subjects };
    validateRecord(work, record);
    await openLedger(root, TRACKING_LEDGER).append(record);
    return { ...trackingView(await openWork(root)), proposalId: input.proposalId, action: input.op === 'apply' ? 'apply' : input.action };
  });
}
