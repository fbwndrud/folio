import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { connectSyntheticMcp, driveSynthetic, planFor, SCENARIOS, textHash, TEXT } from './tracking-host.js';

const VERIFIED = ['explicit-plan', 'hidden-candidate', 'managed-null-path', 'unchanged-prose',
  'next-payload-provenance', 'stale-versus-coverage', 'reconnect', 'strict-input', 'feature-off-integrity'];

async function approvePlan(folio, root, scenario) {
  await folio.call('folio_init', { root, title: `합성 ${scenario}`, preset: 'scene' });
  assert.equal((await folio.call('folio_tracking', { root, op: 'get' })).plan, null);
  const plan = planFor(scenario);
  const p = await folio.call('folio_tracking', { root, op: 'propose', expectedRev: null, plan });
  assert.equal((await folio.call('folio_tracking', { root, op: 'get' })).plan, null);
  const approved = await folio.call('folio_tracking', { root, op: 'decide', proposalId: p.proposalId,
    proposalDigest: p.proposalDigest, action: 'approve' });
  assert.equal(approved.plan.version, 1);
  assert.deepEqual(approved.plan.delegation, plan.delegation);
  assert.deepEqual(approved.plan.criteria, plan.criteria);
  const history = await folio.call('folio_tracking', { root, op: 'query' });
  assert.equal(history.type, 'history'); assert.equal(history.entries[0].source, 'user');
}

async function strictInputs(folio, root) {
  const before = await folio.call('folio_tracking', { root, op: 'query' });
  for (const extra of [{ op: 'get', grantId: 'invented' }, { op: 'query', type: 'subjects' },
    { op: 'query', limit: 201 }, { op: 'query', cursor: '-1' }]) {
    const result = await folio.raw('folio_tracking', { root, ...extra });
    assert.equal(result.isError, true);
    assert.ok(['TRACKING_INPUT_INVALID', 'TOOL_INPUT_INVALID'].includes(result.body.error.code));
  }
  const current = await folio.call('folio_tracking', { root, op: 'get' });
  const bad = planFor('mystery'); bad.criteria[0].valueType = 'string';
  const result = await folio.raw('folio_tracking', { root, op: 'propose', expectedRev: current.plan.rev, plan: bad });
  assert.equal(result.isError, true); assert.equal(result.body.error.code, 'TRACKING_INPUT_INVALID');
  assert.deepEqual(await folio.call('folio_tracking', { root, op: 'query' }), before);
}

/** 원고는 임시 폴더의 inline 합성 fixture다. 성공·실패 모두 산출물을 지운다. */
export async function runTrackingExample() {
  const base = await mkdtemp(join(tmpdir(), 'folio-tracking-example-'));
  let folio = null;
  try {
    folio = await connectSyntheticMcp();
    for (const scenario of SCENARIOS) await approvePlan(folio, join(base, scenario), scenario);
    const root = join(base, 'mystery');
    await strictInputs(folio, root);
    for (const id of ['early', 'late', 'next']) await folio.call('folio_structure', { root, op: 'add', level: 'scene', id, title: `합성 ${id}` });
    const getNode = async (id) => (await folio.call('folio_find', { root, query: 'node', id })).node;
    await driveSynthetic(folio, root, 'early');
    const original = (await getNode('early')).body;
    let sawHidden = false;
    await driveSynthetic(folio, root, 'late', { discover: true, value: '문',
      inspect: async (r) => {
        if (!r.payload.tracking?.candidate?.subjects.length) return;
        const entities = await folio.call('folio_tracking', { root, op: 'query', type: 'entities', subjectId: 'key' });
        assert.deepEqual(entities.entries, []); sawHidden = true;
      }, beforeApprove: async () => {
        assert.deepEqual((await folio.call('folio_tracking', { root, op: 'query', type: 'entities', subjectId: 'key' })).entries, []);
      } });
    assert.equal(sawHidden, true);
    const managed = (await folio.call('folio_tracking', { root, op: 'query', type: 'entities', subjectId: 'key' })).entries[0];
    assert.equal(managed.storage, 'tracking'); assert.equal(managed.path, null);
    let status = await folio.call('folio_status', { root });
    assert.ok(status.backfillPending.some((entry) => entry.nodeId === 'early'));
    await driveSynthetic(folio, root, 'early', { mode: 'recheck' });
    status = await folio.call('folio_status', { root });
    assert.ok(status.backfillPending.some((entry) => entry.nodeId === 'early'));
    assert.equal(status.trackingStale.some((entry) => entry.nodeId === 'early'), false);
    const backfill = await driveSynthetic(folio, root, 'early', { mode: 'tracking-backfill', value: '문' });
    assert.equal(backfill.sawMetadataDecision, true);
    assert.equal((await getNode('early')).body, original);
    assert.equal(textHash(original), textHash(TEXT));
    const evidence = await folio.call('folio_tracking', { root, op: 'query', type: 'evidence', subjectId: 'key', nodeId: 'early' });
    assert.ok(evidence.entries.some((entry) => entry.origin === 'observation' && entry.evidence.textHash === textHash(original)));
    assert.equal(evidence.entries.some((entry) => entry.origin === 'subject'), false);
    let provenance = false;
    await driveSynthetic(folio, root, 'next', { value: '문', inspect: async (r) => {
      const observed = r.payload.tracking?.observations.find((entry) => entry.evidence.nodeId === 'early');
      if (!observed) return;
      assert.equal(observed.evidence.textHash, textHash(original)); assert.ok(observed.receiptId);
      assert.equal(r.payload.tracking.pendingRanges.some((entry) => entry.nodeId === 'early'), false);
      provenance = true;
    } });
    assert.equal(provenance, true);
    await driveSynthetic(folio, root, 'early', { mode: 'tracking-backfill', value: '탁자' });
    status = await folio.call('folio_status', { root });
    assert.ok(status.trackingStale.some((entry) => entry.nodeId === 'next'));
    await driveSynthetic(folio, root, 'next', { mode: 'recheck' });
    status = await folio.call('folio_status', { root });
    assert.equal(status.trackingStale.some((entry) => entry.nodeId === 'next'), false);
    const before = await folio.call('folio_tracking', { root, op: 'get' });
    const renewal = await folio.call('folio_tracking', { root, op: 'propose', expectedRev: before.plan.rev, plan: planFor('mystery') });
    assert.deepEqual(renewal.diff.affectedNodeIds.sort(), ['early', 'late', 'next']);
    await folio.close(); folio = await connectSyntheticMcp();
    assert.deepEqual(await folio.call('folio_tracking', { root, op: 'get' }), before);
    const renewed = await folio.call('folio_tracking', { root, op: 'decide', proposalId: renewal.proposalId,
      proposalDigest: renewal.proposalDigest, action: 'approve' });
    assert.equal(renewed.plan.version, before.plan.version + 1); assert.equal(renewed.plan.rev, before.plan.rev);
    const renewedHistory = await folio.call('folio_tracking', { root, op: 'query' });
    assert.equal(renewedHistory.entries.at(-1).source, 'user');
    assert.notEqual(renewed.plan.grantId, before.plan.grantId);
    const history = await folio.call('folio_tracking', { root, op: 'query', limit: 1 });
    assert.equal(history.nextCursor, '1');
    assert.ok((await folio.call('folio_tracking', { root, op: 'query', cursor: history.nextCursor })).entries.length);
    // 이 설정 변경·기록 삭제는 임시 합성 무결성 공격 fixture에만 수행한다.
    const configPath = join(root, 'work.yaml');
    const config = parse(await readFile(configPath, 'utf8')); config.features = { ...config.features, tracking: false };
    await writeFile(configPath, stringify(config));
    assert.deepEqual((await folio.call('folio_tracking', { root, op: 'get' })).observations, before.observations);
    await rm(join(root, '.folio/ledger/tracking.jsonl'));
    await rm(join(root, '.folio/ledger/tracking.head'));
    const broken = await folio.call('folio_status', { root });
    assert.equal(broken.ledger.tracking.ok, false); assert.equal(broken.ledger.tracking.code, 'LOCK_TRACKING_INTEGRITY');
    const failure = await folio.raw('folio_tracking', { root, op: 'get' });
    assert.equal(failure.isError, true); assert.equal(failure.body.error.code, 'LOCK_TRACKING_INTEGRITY');
    return { synthetic: true, verified: true, outputsRetained: false, scenarios: SCENARIOS, verifiedBehaviors: VERIFIED };
  } finally {
    try { await folio?.close(); }
    finally { await rm(base, { recursive: true, force: true }); }
  }
}

const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === await realpath(fileURLToPath(import.meta.url))) {
  runTrackingExample().then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
