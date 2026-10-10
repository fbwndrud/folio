import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createImageRunner } from '../../core/image/runner.js';
import { buildAssetReceipt, validateAssetReceipt } from '../../core/image/receipt.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { sha256 } from '../../core/util/hash.js';
import { parseYaml } from '../../core/util/yaml.js';
import { PNG_A } from '../support/images.js';
import { answerUntil, createImageHost, illustratedWork } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const code = (promise) => promise.then(() => 'ok', (e) => e.code);
const runPath = (root, runId) => join(root, '.folio', 'image-runs', `${runId}.json`);
const readRun = async (root, runId) => JSON.parse(await readFile(runPath(root, runId), 'utf8'));
const writeRun = (root, run) => writeFile(runPath(root, run.runId), JSON.stringify(run));

/** 승인 질문까지 간 그림 실행. */
async function toApproval(edit, script = {}) {
  const root = await illustratedWork(edit);
  const runner = createImageRunner({ root, packs });
  const host = await createImageHost(script);
  const question = await answerUntil(runner, host, await runner.start({ assetId: 'ep-001-door', nodeId: 'ep-001' }));
  assert.equal(question.question.kind, 'image_approval');
  return { root, runner, host, runId: question.runId };
}

test('approve commits the reviewed bytes: receipt first, then the picture, its yaml and the commit record', async () => {
  const { root, runner, runId } = await toApproval();
  const done = await runner.decide({ runId, action: 'approve' });
  assert.deepEqual(Object.keys(done), ['status', 'runId', 'assetId', 'nodeId', 'receiptId', 'file']);
  assert.deepEqual([done.status, done.assetId, done.nodeId, done.file], ['done', 'ep-001-door', 'ep-001', 'ep-001-door.png']);
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-door.png')), PNG_A);
  const meta = parseYaml(await readFile(join(root, 'assets', 'ep-001-door.yaml'), 'utf8'));
  assert.deepEqual(meta.review, { receiptId: done.receiptId, status: 'passed', reviewer: { sameHost: true, independent: false } });
  assert.deepEqual([meta.id, meta.file, meta.nodeId, meta.generation], ['ep-001-door', 'ep-001-door.png', 'ep-001', { model: 'fake-image-1', references: ['hana-sheet'] }]);
  const records = await openLedger(root, 'assets').readAll();
  assert.deepEqual(records.map((r) => r.stepId ?? r.type), ['precheck', 'review', 'approve', 'asset_receipt', 'asset_commit']);
  const receipt = records[3];
  assert.deepEqual([receipt.fileHash, receipt.reviewer, receipt.hard], [sha256(PNG_A), { sameHost: true, independent: false }, 0]);
  assert.deepEqual(receipt.advisories.map((f) => f.code), ['REFERENCE_MISSING']);
  assert.deepEqual(records[4], { ...records[4], runId, assetId: 'ep-001-door', receiptId: done.receiptId, file: 'ep-001-door.png', fileHash: sha256(PNG_A) });
  const { work } = await openWorkspace(root, { packs });
  assert.deepEqual(work.assets.get('ep-001-door').entities, ['hana', 'locked-door']);
  assert.equal((await readRun(root, runId)).state, 'done');
  assert.equal(await code(runner.start({ assetId: 'ep-001-door' })), 'ASSET_EXISTS');
  assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'IMAGE_RUN_NOT_AWAITING_USER');
});

test('a run file changed by hand is not trusted: findings dropped, the reviewer marked independent, or the approval forged are refused', async () => {
  for (const tamper of [
    (run) => { run.results.precheck.checks = run.results.precheck.checks.map((c) => ({ ...c, findings: [] })); },
    (run) => { run.results.review.checks[0].reviewer = { sameHost: false, independent: true }; },
    (run) => { run.results.review = { status: 'skipped', reason: 'x', source: 'y', imageHash: run.image.hash }; },
  ]) {
    const { root, runner, runId } = await toApproval();
    const run = await readRun(root, runId);
    tamper(run);
    await writeRun(root, run);
    assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'LOCK_LEDGER_MISMATCH');
    assert.deepEqual((await readdir(join(root, 'assets'))).sort(), ['hana-sheet.png', 'hana-sheet.yaml'], 'nothing was written');
    assert.ok(!(await openLedger(root, 'assets').readAll()).some((r) => r.type === 'asset_receipt'));
  }
  const { root, runner, runId } = await toApproval();
  const run = await readRun(root, runId);
  Object.assign(run, { state: 'active', pending: null, cursor: 5, results: { ...run.results, approve: { status: 'approved', imageHash: run.image.hash, briefHash: run.briefHash, reason: '' } } });
  await writeRun(root, run);
  assert.equal(await code(runner.resume({ runId })), 'IMAGE_RUN_NOT_AWAITING_MODEL', 'an active run is not resumed by hand');
  run.state = 'committing';
  await writeRun(root, run);
  assert.equal(await code(runner.resume({ runId })), 'LOCK_LEDGER_MISMATCH', 'an approval missing from the ledger is not an approval');
});

test('the staged picture changed after approval is never committed', async () => {
  const { root, runner, runId } = await toApproval();
  const run = await readRun(root, runId);
  await writeFile(join(root, '.folio', 'image-runs', runId, run.image.name), 'tampered');
  assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'LOCK_IMAGE_HASH_MISMATCH');
  assert.deepEqual((await readdir(join(root, 'assets'))).sort(), ['hana-sheet.png', 'hana-sheet.yaml']);
});

test('a changed brief is refused before the first receipt or asset write', async () => {
  const { root, runner, runId } = await toApproval();
  const run = await readRun(root, runId);
  run.brief.mustShow.push('an unapproved second door');
  await writeRun(root, run);
  assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'LOCK_BRIEF_HASH_MISMATCH');
  assert.deepEqual((await readdir(join(root, 'assets'))).sort(), ['hana-sheet.png', 'hana-sheet.yaml']);
  assert.ok(!(await openLedger(root, 'assets').readAll()).some((r) => r.type === 'asset_receipt'));
});

test('a changed brief is refused when resuming after a receipt was recorded', async () => {
  const { root, runner, runId } = await toApproval();
  const metaPath = join(root, 'assets', 'ep-001-door.yaml');
  await writeFile(metaPath, 'id: collateral\nfile: hana-sheet.png\n');
  assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'ASSET_IMMUTABLE');
  const run = await readRun(root, runId);
  assert.equal(run.state, 'committing');
  assert.equal((await openLedger(root, 'assets').readAll()).filter((r) => r.type === 'asset_receipt').length, 1);
  run.brief.mustShow.push('an unapproved second door');
  await writeRun(root, run);
  await unlink(metaPath);
  assert.equal(await code(runner.resume({ runId })), 'LOCK_BRIEF_HASH_MISMATCH');
  assert.deepEqual((await readdir(join(root, 'assets'))).sort(), ['ep-001-door.png', 'hana-sheet.png', 'hana-sheet.yaml']);
  assert.equal((await openLedger(root, 'assets').readAll()).filter((r) => r.type === 'asset_commit').length, 0);
});

test('a commit cut off midway finishes with the same receipt and no second record', async () => {
  const { root, runner, runId } = await toApproval();
  const done = await runner.decide({ runId, action: 'approve' });
  const run = await readRun(root, runId);
  await writeRun(root, { ...run, state: 'committing', cursor: 5 });
  assert.deepEqual(await runner.resume({ runId }), done);
  const types = (await openLedger(root, 'assets').readAll()).map((r) => r.type);
  assert.deepEqual(types.filter((t) => t !== 'image_result'), ['asset_receipt', 'asset_commit']);
  await writeFile(join(root, 'assets', 'ep-001-door.png'), 'other');
  await writeRun(root, { ...run, state: 'committing', cursor: 5 });
  assert.equal(await code(runner.resume({ runId })), 'ASSET_IMMUTABLE', 'a committed picture is never overwritten');
});

test('imageReview off: the receipt says the review was skipped and why; the yaml says so too', async () => {
  const { root, runner, runId } = await toApproval((c) => ({ ...c, features: { imageReview: false } }));
  const done = await runner.decide({ runId, action: 'approve' });
  const receipt = (await openLedger(root, 'assets').readAll()).find((r) => r.type === 'asset_receipt');
  assert.deepEqual(receipt.steps.find((s) => s.id === 'review'), { id: 'review', kind: 'check', status: 'skipped', reason: 'imageReview is off in work.yaml features', source: 'work.yaml#features.imageReview', imageHash: sha256(PNG_A) });
  assert.equal(parseYaml(await readFile(join(root, 'assets', `${done.assetId}.yaml`), 'utf8')).review.status, 'skipped');
});

test('validateAssetReceipt: the self-review label, reserved fields, skip reasons and hashes are locks', async () => {
  const { root, runId } = await toApproval();
  const run = await readRun(root, runId);
  run.results.approve = { status: 'approved', imageHash: run.image.hash, briefHash: run.briefHash, reason: '' };
  const receipt = buildAssetReceipt(run, { receiptId: 'imgrcpt-1' });
  assert.deepEqual(validateAssetReceipt(receipt), []);
  const codes = (edit) => { const r = structuredClone(receipt); edit(r); return validateAssetReceipt(r).map((e) => e.code); };
  assert.deepEqual(codes((r) => { r.reviewer.independent = true; }), ['SELF_REVIEW_MISLABELED']);
  assert.deepEqual(codes((r) => { r.steps[3].checks[0].reviewer.independent = true; }), ['SELF_REVIEW_MISLABELED']);
  assert.deepEqual(codes((r) => { r.hash = 'x'; }), ['RECEIPT_FIELD_RESERVED']);
  assert.deepEqual(codes((r) => { r.steps[3] = { id: 'review', kind: 'check', status: 'skipped', imageHash: r.fileHash }; }), ['STEP_SKIP_REASON_MISSING']);
  assert.deepEqual(codes((r) => { r.steps[3].imageHash = r.briefHash; }), ['CHECK_HASH_MISMATCH']);
  assert.deepEqual(codes((r) => { r.steps[4].status = 'passed'; }), ['APPROVAL_MISSING']);
  assert.deepEqual(codes((r) => { r.steps[1].checks[0].findings.push({ severity: 'fatal' }); }), ['FINDING_SEVERITY_INVALID']);
  assert.deepEqual(codes((r) => { r.steps.pop(); }), ['RECEIPT_STEPS_INVALID', 'CHECK_HASH_MISMATCH', 'APPROVAL_MISSING']);
  assert.deepEqual(codes((r) => { r.fileHash = 'sha256:0'; }), ['RECEIPT_HASH_INVALID', 'CHECK_HASH_MISMATCH', 'CHECK_HASH_MISMATCH', 'CHECK_HASH_MISMATCH', 'APPROVAL_MISSING'], 'generate, review and approve all name the picture');
  for (const stepId of ['generate', 'approve']) {
    const field = stepId === 'generate' ? 'imageHash' : 'briefHash';
    assert.ok(codes((r) => { delete r.steps.find((s) => s.id === stepId)[field]; }).includes('CHECK_HASH_MISMATCH'), `${stepId}.${field} is required`);
    assert.ok(codes((r) => { r.steps.find((s) => s.id === stepId)[field] = 'sha256:wrong'; }).includes('CHECK_HASH_MISMATCH'), `${stepId}.${field} must match`);
  }
  for (const field of ['reason', 'source']) for (const value of ['', '   ']) {
    assert.ok(codes((r) => { r.steps[3] = { id: 'review', kind: 'check', status: 'skipped', reason: 'valid', source: 'valid', imageHash: r.fileHash, [field]: value }; }).includes('STEP_SKIP_REASON_MISSING'), `skip ${field} must be nonblank`);
  }
});
