import { makeReceipt } from '../support/receipts.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { trackingChange } from '../../core/tracking/change.js';
import { normalizeSubject } from '../../core/tracking/subject-schema.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { sha256 } from '../../core/util/hash.js';
import { canonicalJson } from '../../core/util/hash.js';
import { readTracking } from '../../core/tracking/records.js';
import { copyFixture } from '../support/fixtures.js';
import { trackingPlan, trackingCriterion } from '../support/tracking.js';

const propose = (root, plan = trackingPlan(), expectedRev = null) => trackingChange(root, { op: 'propose', expectedRev, plan });
const approve = (root, p) => trackingChange(root, { op: 'decide', proposalId: p.proposalId, proposalDigest: p.proposalDigest, action: 'approve' });
const setup = async (delegation = {}) => {
  const root = await copyFixture('serial-2level');
  await approve(root, await propose(root, trackingPlan({ delegation })));
  return { root, plan: (await trackingChange(root, { op: 'get' })).plan };
};

test('initial plan is only canonical after explicit approval; reconnect and duplicate refuse', async () => {
  const root = await copyFixture('serial-2level');
  const p = await propose(root);
  assert.equal(p.proposal.plan.purpose, trackingPlan().purpose);
  assert.equal((await trackingChange(root, { op: 'get' })).plan, null);
  await approve(root, p);
  assert.equal((await trackingChange(root, { op: 'get' })).plan.version, 1);
  await assert.rejects(approve(root, p), { code: 'TRACKING_PROPOSAL_DECIDED' });
  assert.equal((await openLedger(root, 'tracking').readAll()).length, 1);
});

test('proposal digest binds cached content; request_revision requires durable feedback', async () => {
  const root = await copyFixture('serial-2level');
  const p = await propose(root);
  await assert.rejects(trackingChange(root, { op: 'decide', ...p, action: 'request_revision' }), { code: 'TRACKING_INPUT_INVALID' });
  await trackingChange(root, { op: 'decide', proposalId: p.proposalId, proposalDigest: p.proposalDigest, action: 'request_revision', feedback: '합성 항목을 좁힌다' });
  await assert.rejects(approve(root, p), { code: 'TRACKING_PROPOSAL_DECIDED' });
  assert.equal((await openLedger(root, 'tracking').readAll())[0].feedback, '합성 항목을 좁힌다');
  const second = await propose(root);
  const path = join(root, '.folio', 'tracking-proposals', `${second.proposalId}.json`);
  const cache = JSON.parse(await readFile(path, 'utf8'));
  cache.proposal.plan.purpose = '바꿔치기';
  await writeFile(path, JSON.stringify(cache));
  await assert.rejects(approve(root, second), { code: 'TRACKING_PROPOSAL_DIGEST_MISMATCH' });
});

test('exact operation fields, XOR, revision and query pagination are strict', async () => {
  const { root, plan } = await setup();
  for (const input of [
    { op: '__proto__' },
    { op: 'get', expectedRev: plan.rev }, { op: 'query', limit: 0 }, { op: 'query', limit: 201 },
    { op: 'query', cursor: '01' }, { op: 'query', cursor: -1 }, { op: 'get', planId: 'other' },
    { op: 'propose', expectedRev: plan.rev, plan: trackingPlan(), changes: {} },
    { op: 'propose', expectedRev: plan.rev, changes: { criteria: [], mystery: true } },
  ]) await assert.rejects(trackingChange(root, input), { code: 'TRACKING_INPUT_INVALID' });
  await assert.rejects(propose(root, trackingPlan(), null), { code: 'TRACKING_REV_STALE' });
  assert.equal((await trackingChange(root, { op: 'query', limit: 1 })).entries.length, 1);
});

test('two pre-existing proposals have a single CAS winner, including unchanged plan content', async () => {
  const { root, plan } = await setup();
  const a = await propose(root, trackingPlan(), plan.rev);
  const b = await propose(root, trackingPlan(), plan.rev);
  const results = await Promise.allSettled([approve(root, a), approve(root, b)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'TRACKING_REV_STALE');
});

test('host additions preserve source, require current grant and reject replacement/fixed/modification', async () => {
  const { root, plan } = await setup({ addCriteria: true });
  const changes = { criteria: [trackingCriterion({ id: 'location', title: '위치' })] };
  const p = await trackingChange(root, { op: 'propose', expectedRev: plan.rev, changes });
  await assert.rejects(trackingChange(root, { op: 'apply', proposalId: p.proposalId, proposalDigest: p.proposalDigest, grantId: 'fake' }), { code: 'TRACKING_DELEGATION_REQUIRED' });
  await trackingChange(root, { op: 'apply', proposalId: p.proposalId, proposalDigest: p.proposalDigest, grantId: plan.grantId });
  const record = (await openLedger(root, 'tracking').readAll()).at(-1);
  assert.equal(record.source, 'host'); assert.equal(record.grantId, plan.grantId);
  await assert.rejects(trackingChange(root, { op: 'apply', proposalId: p.proposalId, proposalDigest: p.proposalDigest, grantId: plan.grantId }), { code: 'TRACKING_PROPOSAL_DECIDED' });
  const current = (await trackingChange(root, { op: 'get' })).plan;
  const replacement = await propose(root, trackingPlan({ criteria: current.criteria, delegation: { addCriteria: true } }), current.rev);
  await assert.rejects(trackingChange(root, { op: 'apply', proposalId: replacement.proposalId, proposalDigest: replacement.proposalDigest, grantId: plan.grantId }), { code: 'TRACKING_DELEGATION_REQUIRED' });
  await assert.rejects(propose(root, trackingPlan({ criteria: [trackingCriterion({ instruction: '의미 변경' })] }), current.rev), { code: 'TRACKING_INPUT_INVALID' });
  const fixed = await trackingChange(root, { op: 'propose', expectedRev: current.rev, changes: { criteria: [trackingCriterion({ id: 'color', behavior: 'fixed', expectedValue: 'blue' })] } });
  await assert.rejects(trackingChange(root, { op: 'apply', proposalId: fixed.proposalId, proposalDigest: fixed.proposalDigest, grantId: plan.grantId }), { code: 'TRACKING_INPUT_INVALID' });
  await approve(root, await propose(root, trackingPlan({ criteria: current.criteria, delegation: {} }), current.rev));
  await assert.rejects(trackingChange(root, { op: 'apply', proposalId: replacement.proposalId, proposalDigest: replacement.proposalDigest, grantId: plan.grantId }), { code: 'TRACKING_REV_STALE' });
});

test('open and corrupt runs reject all public mutations', async () => {
  const root = await copyFixture('serial-2level');
  const p = await propose(root);
  await createRunStore(root).save({ runId: 'run-synthetic', state: 'awaiting_model', createdAt: 'synthetic' });
  await assert.rejects(propose(root), { code: 'TRACKING_RUN_OPEN' });
  await assert.rejects(approve(root, p), { code: 'TRACKING_RUN_OPEN' });
  assert.equal((await trackingChange(root, { op: 'get' })).plan, null);
});

test('subject definitions validate declared kind, exact evidence and stable content revision', () => {
  const text = '합성 열쇠를 탁자 위에 놓았다.';
  const subject = { id: 'key', kind: 'object', name: '열쇠', aliases: [], body: '', data: {}, evidence: { nodeId: 'scene', textHash: sha256(text), quote: '열쇠' } };
  const context = { subjectKinds: ['object'], nodeId: 'scene', text };
  const normalized = normalizeSubject(subject, context);
  assert.equal(normalized.rev, normalizeSubject({ ...subject, rev: 'ignored' }, context).rev);
  assert.equal(normalized.rev, normalizeSubject({ ...subject, evidence: { nodeId: 'another', textHash: sha256('다른 발견'), quote: '다른' } }, { subjectKinds: ['object'] }).rev);
  assert.throws(() => normalizeSubject({ ...subject, kind: 'unknown' }, context), { code: 'TRACKING_INPUT_INVALID' });
  assert.throws(() => normalizeSubject({ ...subject, evidence: { ...subject.evidence, textHash: sha256('다른 원문') } }, context), { code: 'TRACKING_INPUT_INVALID' });
  assert.throws(() => normalizeSubject({ ...subject, evidence: { ...subject.evidence, quote: '없는 인용' } }, context), { code: 'TRACKING_INPUT_INVALID' });
});

const syntheticSubject = async (root, overrides = {}) => {
  const node = (await openWork(root)).tree.nodes.get('ep-001');
  await updateNode(root, node, { data: { status: 'committed' }, body: '합성 열쇠를 탁자에 놓았다.' });
  const textHash = sha256('합성 열쇠를 탁자에 놓았다.');
  await openLedger(root, 'receipts').append({ type: 'receipt', ...makeReceipt({ receiptId: 'synthetic-commit', nodeId: node.id, level: node.level, text: '합성 열쇠를 탁자에 놓았다.',
    pipeline: { steps: [{ id: 'synthetic', kind: 'check' }], digest: sha256('synthetic-pipeline') } }) });
  await openLedger(root, 'receipts').append({ type: 'commit', receiptId: 'synthetic-commit', nodeId: node.id, committedHash: textHash });
  return { id: 'key', kind: 'object', name: '합성 열쇠', aliases: ['합성 키'], body: '', data: { material: 'metal' },
    evidence: { nodeId: node.id, textHash, quote: '열쇠' }, ...overrides };
};

test('subject-only host addition uses addSubjects; stale proposals cannot bypass unchanged plan rev', async () => {
  const { root, plan } = await setup({ addSubjects: true });
  const subject = await syntheticSubject(root);
  const input = { op: 'propose', expectedRev: plan.rev, changes: { subjects: [subject] } };
  const a = await trackingChange(root, input);
  const b = await trackingChange(root, { ...input, changes: { subjects: [{ ...subject, id: 'key-two', name: '두 번째 열쇠', aliases: [] }] } });
  await trackingChange(root, { op: 'apply', proposalId: a.proposalId, proposalDigest: a.proposalDigest, grantId: plan.grantId });
  const read = await trackingChange(root, { op: 'get' });
  assert.equal(read.plan.rev, plan.rev); assert.equal(read.plan.version, 2);
  assert.equal(read.subjects[0].id, 'key');
  await assert.rejects(approve(root, b), { code: 'TRACKING_REV_STALE' });
  const query = await trackingChange(root, { op: 'query', subjectId: 'key' });
  assert.equal(query.entries[0].source, 'host');
});

test('managed display names may change by user decision; discovery survives source rewriting', async () => {
  const { root, plan } = await setup({ addSubjects: true });
  const subject = await syntheticSubject(root);
  await approve(root, await trackingChange(root, { op: 'propose', expectedRev: plan.rev, changes: { subjects: [subject] } }));
  let current = await trackingChange(root, { op: 'get' });
  const node = (await openWork(root)).tree.nodes.get('ep-001');
  await updateNode(root, node, { body: '합성 원문을 다시 썼다.' });
  assert.equal((await trackingChange(root, { op: 'get' })).subjects[0].id, 'key');
  const renamed = { ...current.subjects[0], name: '합성 새 이름', aliases: ['새 별칭'] };
  const p = await trackingChange(root, { op: 'propose', expectedRev: current.plan.rev, changes: { subjects: [renamed] } });
  await assert.rejects(trackingChange(root, { op: 'apply', proposalId: p.proposalId, proposalDigest: p.proposalDigest, grantId: current.plan.grantId }), { code: 'TRACKING_INPUT_INVALID' });
  await approve(root, p);
  current = await trackingChange(root, { op: 'get' });
  assert.equal(current.subjects[0].name, '합성 새 이름');
  assert.deepEqual(current.subjects[0].evidence, subject.evidence);
  await assert.rejects(trackingChange(root, { op: 'propose', expectedRev: current.plan.rev, changes: { subjects: [{ ...renamed, data: { material: 'changed' } }] } }), { code: 'TRACKING_INPUT_INVALID' });
});

test('public discoveries reject uncommitted, drifted and legacy-colliding definitions', async () => {
  const { root, plan } = await setup();
  const subject = await syntheticSubject(root);
  const proposalFor = (s) => trackingChange(root, { op: 'propose', expectedRev: plan.rev, changes: { subjects: [s] } });
  await assert.rejects(proposalFor({ ...subject, id: 'doyun' }), { code: 'TRACKING_ENTITY_COLLISION' });
  const node = (await openWork(root)).tree.nodes.get('ep-001');
  await updateNode(root, node, { body: '합성 새 열쇠를 놓았다.' });
  await assert.rejects(proposalFor({ ...subject, evidence: { nodeId: node.id, textHash: sha256('합성 새 열쇠를 놓았다.'), quote: '열쇠' } }), { code: 'TRACKING_INPUT_INVALID' });
  await updateNode(root, (await openWork(root)).tree.nodes.get(node.id), { data: { status: 'draft' } });
  await assert.rejects(proposalFor({ ...subject, evidence: { nodeId: node.id, textHash: sha256('합성 새 열쇠를 놓았다.'), quote: '열쇠' } }), { code: 'TRACKING_INPUT_INVALID' });
});

test('activation revalidates committed discovery evidence after proposing', async () => {
  const { root, plan } = await setup();
  const subject = await syntheticSubject(root);
  const p = await trackingChange(root, { op: 'propose', expectedRev: plan.rev, changes: { subjects: [subject] } });
  await updateNode(root, (await openWork(root)).tree.nodes.get('ep-001'), { body: '다른 합성 본문' });
  await assert.rejects(approve(root, p), { code: 'TRACKING_INPUT_INVALID' });
  assert.equal((await trackingChange(root, { op: 'get' })).subjects.length, 0);
});

test('replay validates proposal digest and distinguishes fixed replacement from additions', async () => {
  const { root, plan } = await setup();
  const p = await trackingChange(root, { op: 'propose', expectedRev: plan.rev, changes: { criteria: [trackingCriterion({ id: 'color', behavior: 'fixed', expectedValue: 'blue' })] } });
  await approve(root, p);
  const original = (await openLedger(root, 'tracking').readAll()).at(-1);
  const forged = structuredClone(original);
  forged.plan.criteria.find((c) => c.id === 'color').expectedValue = 'red';
  forged.proposal.plan = forged.plan;
  forged.proposalDigest = sha256(canonicalJson(forged.proposal));
  const freshRoot = await copyFixture('serial-2level');
  await openLedger(freshRoot, 'tracking').append((await openLedger(root, 'tracking').readAll())[0]);
  await openLedger(freshRoot, 'tracking').append({ ...forged, proposalDigest: sha256('tampered digest') });
  await assert.rejects(readTracking(freshRoot), { code: 'TRACKING_RECORD_INVALID' });
  const current = (await trackingChange(root, { op: 'get' })).plan;
  const replacement = await propose(root, trackingPlan({ criteria: current.criteria.map((c) => c.id === 'color' ? { ...c, expectedValue: 'red' } : c) }), current.rev);
  await approve(root, replacement);
  const replacementRecord = (await openLedger(root, 'tracking').readAll()).at(-1);
  const invalidRoot = await copyFixture('serial-2level');
  for (const record of (await openLedger(root, 'tracking').readAll()).slice(0, -1)) await openLedger(invalidRoot, 'tracking').append(record);
  replacementRecord.proposal.mode = 'addition';
  replacementRecord.proposalDigest = sha256(canonicalJson(replacementRecord.proposal));
  await openLedger(invalidRoot, 'tracking').append(replacementRecord);
  await assert.rejects(readTracking(invalidRoot), { code: 'TRACKING_RECORD_INVALID' });
});

test('unreadable run files block proposals and query pages retain canonical order', async () => {
  const { root, plan } = await setup();
  const p = await propose(root, trackingPlan(), plan.rev);
  await approve(root, p);
  const page = await trackingChange(root, { op: 'query', limit: 1 });
  assert.equal(page.nextCursor, '1');
  assert.equal((await trackingChange(root, { op: 'query', cursor: page.nextCursor })).entries[0].proposalId, p.proposalId);
  await writeFile(createRunStore(root).pathOf('run-corrupt'), '{');
  await assert.rejects(propose(root, trackingPlan(), plan.rev), { code: 'TRACKING_RUN_OPEN' });
});

test('legacy plan-only digest never authorizes subject declaration changes', async () => {
  const { root } = await setup();
  const record = (await openLedger(root, 'tracking').readAll())[0];
  delete record.proposal;
  record.proposalDigest = sha256(canonicalJson(record.plan));
  record.subjects = [normalizeSubject({ id: 'key', kind: 'object', name: '합성 열쇠', aliases: [], body: '', data: {},
    evidence: { nodeId: 'ep-001', textHash: sha256('합성 열쇠'), quote: '열쇠' } }, { subjectKinds: ['object'] })];
  const target = await copyFixture('serial-2level');
  await openLedger(target, 'tracking').append(record);
  await assert.rejects(readTracking(target), { code: 'TRACKING_RECORD_INVALID' });
});
