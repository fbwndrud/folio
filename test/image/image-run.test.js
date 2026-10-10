import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createImageRunner } from '../../core/image/runner.js';
import { filterSymlinkedReferences } from '../../core/image/references.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { sha256 } from '../../core/util/hash.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { tempDir } from '../support/fixtures.js';
import { PNG_A } from '../support/images.js';
import { HANA_BRIEF, answerUntil, createImageHost, editWork, illustratedWork } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const runnerFor = (root) => createImageRunner({ root, packs });
const kind = (o) => (o.status === 'needs_model' ? `model:${o.requests[0].stepId}` : o.status === 'needs_user' ? `user:${o.question.kind}` : o.status);
const code = (promise) => promise.then(() => 'ok', (e) => e.code);

test('one picture: brief → precheck → generate (references) → review → the approval question, every request bound to the run', async () => {
  const root = await illustratedWork();
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'ep-001-door', nodeId: 'ep-001' });
  assert.equal(kind(asked), 'model:brief');
  const briefPayload = asked.requests[0].payload;
  assert.equal(briefPayload.node.id, 'ep-001');
  assert.deepEqual(briefPayload.entities.map((e) => e.id), ['hana', 'locked-door']);
  const generate = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  assert.equal(kind(generate), 'model:generate');
  const refs = generate.requests[0].payload.references;
  assert.deepEqual(refs.map((r) => [r.entityId, r.assets.map((a) => a.assetId)]), [['hana', ['hana-sheet']], ['locked-door', []]]);
  assert.equal(refs[0].assets[0].path, join(root, 'assets', 'hana-sheet.png'));
  const review = await runner.resume({ runId: asked.runId, answers: await host.answer(generate) });
  assert.equal(kind(review), 'model:review');
  const image = review.requests[0].payload.image;
  assert.equal(image.path, join(root, '.folio', 'image-runs', asked.runId, 'image-1.png'));
  assert.deepEqual([image.hash, image.type], [sha256(PNG_A), 'image/png']);
  assert.deepEqual(await readFile(image.path), PNG_A);
  assert.deepEqual(review.requests[0].payload.checks.map((c) => c.checkId), ['image.review']);
  const question = await runner.resume({ runId: asked.runId, answers: await host.answer(review) });
  assert.equal(kind(question), 'user:image_approval');
  assert.deepEqual([question.question.canApprove, question.question.blocking, question.question.image.hash], [true, [], sha256(PNG_A)]);
  assert.deepEqual(question.question.advisories.map((f) => f.code), ['REFERENCE_MISSING'], 'locked-door has no reference picture');
  const records = await openLedger(root, 'assets').readAll();
  assert.deepEqual(records.map((r) => [r.type, r.stepId]), [['image_result', 'precheck'], ['image_result', 'review']]);
  assert.deepEqual(await readFile(join(host.outside, 'made-1.png')), PNG_A, 'the host file is only read');
});

test('a blocking precheck stops before the picture is made: approve needs a reason, a revision asks for a new brief', async () => {
  const root = await illustratedWork((config) => ({ ...config, checks: { 'image.dialogue-in-text': { severity: 'block' } } }));
  const host = await createImageHost({ brief: (p) => ({ ...HANA_BRIEF, dialogue: p.feedback ? [] : [{ speaker: 'hana', text: '열려라.' }] }) });
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const blocked = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  assert.equal(kind(blocked), 'user:image_precheck');
  assert.deepEqual(blocked.question.blocking.map((f) => [f.checkId, f.code, f.severity]), [['image.dialogue-in-text', 'DIALOGUE_NOT_IN_TEXT', 'block']]);
  assert.equal(await code(runner.decide({ runId: asked.runId, action: 'approve' })), 'APPROVE_REASON_REQUIRED');
  assert.equal(await code(runner.decide({ runId: asked.runId, action: 'request_revision' })), 'FEEDBACK_REQUIRED');
  const again = await runner.decide({ runId: asked.runId, action: 'request_revision', feedback: '대사는 빼 줘' });
  assert.equal(kind(again), 'model:brief');
  assert.equal(again.requests[0].payload.feedback, '대사는 빼 줘');
  assert.equal(kind(await runner.resume({ runId: asked.runId, answers: await host.answer(again) })), 'model:generate');
});

test('approving a blocking precheck with a reason goes on to the picture and is recorded', async () => {
  const root = await illustratedWork((config) => ({ ...config, checks: { 'image.dialogue-in-text': { severity: 'block' } } }));
  const host = await createImageHost({ brief: { ...HANA_BRIEF, dialogue: [{ speaker: 'hana', text: '열려라.' }] } });
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const blocked = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  const next = await runner.decide({ runId: blocked.runId, action: 'approve', reason: '말풍선은 나중에 넣는다' });
  assert.equal(kind(next), 'model:generate');
  const records = await openLedger(root, 'assets').readAll();
  assert.deepEqual(records.map((r) => r.stepId), ['precheck', 'precheck'], 'the approval re-records the precheck result');
});

test('refusals: no image pack, images off, a taken id, an open run, an unknown node, a bad id', async () => {
  assert.equal(await code(runnerFor(await illustratedWork((c) => ({ ...c, packs: ['novel'], checkSets: ['novel.basic'] }))).start({ assetId: 'x' })), 'IMAGE_PACK_REQUIRED');
  assert.equal(await code(runnerFor(await illustratedWork((c) => ({ ...c, features: { images: false } }))).start({ assetId: 'x' })), 'FEATURE_DISABLED');
  const root = await illustratedWork();
  const runner = runnerFor(root);
  assert.equal(await code(runner.start({ assetId: 'hana-sheet' })), 'ASSET_EXISTS');
  assert.equal(await code(runner.start({ assetId: '../x' })), 'ID_INVALID');
  assert.equal(await code(runner.start({ assetId: 'x', nodeId: 'nope' })), 'NODE_NOT_FOUND');
  const open = await runner.start({ assetId: 'first' });
  assert.equal(open.requests[0].payload.node, null, 'a picture without a node');
  assert.equal(await code(runner.start({ assetId: 'second' })), 'IMAGE_RUN_IN_PROGRESS');
  assert.equal(await code(runner.decide({ runId: open.runId, action: 'approve' })), 'IMAGE_RUN_NOT_AWAITING_USER');
  assert.equal(await code(runner.decide({ runId: open.runId, action: 'skip' })), 'SKIP_REASON_REQUIRED');
  assert.deepEqual(await runner.decide({ runId: open.runId, action: 'skip', reason: '나중에' }), { status: 'skipped', runId: open.runId, assetId: 'first' });
  assert.equal(kind(await runner.start({ assetId: 'second' })), 'model:brief');
});

test('unreadable answers are asked again three times, then only skip is left; a host file that is not an image never enters the work', async () => {
  const root = await illustratedWork();
  const host = await createImageHost({ image: async (p, n) => ({ path: n === 1 ? 'relative.png' : join(root, 'work.yaml') }) });
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  let out = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  assert.equal(out.requests[0].payload.retryReason, 'IMAGE_PATH_INVALID');
  out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  assert.equal(out.requests[0].payload.retryReason, 'IMAGE_TYPE_UNSUPPORTED');
  out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  assert.equal(kind(out), 'user:image_blocked');
  assert.equal(out.question.canApprove, false);
  assert.equal(await code(runner.decide({ runId: out.runId, action: 'approve', reason: 'x' })), 'DECISION_INVALID');
  assert.equal((await runner.decide({ runId: out.runId, action: 'skip', reason: '그림 도구가 없다' })).status, 'skipped');
});

test('imageReview off skips the review with its reason; imageReferences off sends no references; a changed setting re-runs the precheck', async () => {
  const root = await illustratedWork((c) => ({ ...c, features: { imageReview: false, imageReferences: false } }));
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const generate = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  assert.equal(generate.requests[0].payload.references, null);
  const question = await runner.resume({ runId: asked.runId, answers: await host.answer(generate) });
  assert.equal(kind(question), 'user:image_approval');
  const run = JSON.parse(await readFile(join(root, '.folio', 'image-runs', `${asked.runId}.json`), 'utf8'));
  assert.deepEqual(run.results.review, { status: 'skipped', reason: 'imageReview is off in work.yaml features', source: 'work.yaml#features.imageReview', imageHash: sha256(PNG_A) });
  await editWork(root, (c) => ({ ...c, features: { imageReferences: false } }));
  const again = await runner.decide({ runId: asked.runId, action: 'approve' });
  assert.equal(kind(again), 'model:review', 'the review is on now: the same picture is reviewed before any approval');
});

test('a staged picture changed by hand is never reviewed: the run asks for a new picture', async () => {
  const root = await illustratedWork();
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const generate = await answerUntil(runner, host, asked, (o) => kind(o) === 'model:generate');
  const review = await runner.resume({ runId: asked.runId, answers: await host.answer(generate) });
  await writeFile(review.requests[0].payload.image.path, 'tampered');
  const asksAgain = await runner.resume({ runId: asked.runId, answers: await host.answer(review) });
  assert.equal(kind(asksAgain), 'model:generate');
  assert.equal(asksAgain.requests[0].payload.attempt, 2);
});

test('reference assets with paths that escape assets/ (../x.png, invalid names) are never offered', async () => {
  const root = await illustratedWork();
  await writeFile(join(root, 'x.png'), PNG_A);
  const path = join(root, 'assets', 'evil.yaml');
  await writeFile(path, stringifyYaml({ id: 'evil', file: '../x.png', reference: true, brief: { entities: ['hana'] } }));
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const generate = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  const refs = generate.requests[0].payload.references;
  assert.deepEqual(refs.map((r) => [r.entityId, r.assets.map((a) => a.assetId)]), [['hana', ['hana-sheet']], ['locked-door', []]]);
});

test('a linked assets directory never offers a real file outside the work as a reference', async () => {
  const root = await tempDir('folio-reference-work-');
  const outside = await tempDir('folio-reference-outside-');
  await writeFile(join(outside, 'outside.png'), PNG_A);
  await symlink(outside, join(root, 'assets'));
  assert.deepEqual(await readFile(join(root, 'assets', 'outside.png')), PNG_A, 'the link reaches a real outside file');
  const references = [{ entityId: 'hana', assets: [{ assetId: 'outside', file: 'outside.png', reference: true }] }];
  assert.deepEqual(await filterSymlinkedReferences(root, references), [{ entityId: 'hana', assets: [] }]);
});

test('reference assets that are symlinks to files outside assets/ are never offered', async () => {
  const root = await illustratedWork();
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.png'), PNG_A);
  const linkPath = join(root, 'assets', 'linked-ref.png');
  await symlink(join(outside, 'secret.png'), linkPath);
  const yamlPath = join(root, 'assets', 'linked.yaml');
  await writeFile(yamlPath, stringifyYaml({ id: 'linked', file: 'linked-ref.png', reference: true, brief: { entities: ['hana'] } }));
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const generate = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  const refs = generate.requests[0].payload.references;
  assert.deepEqual(refs.map((r) => [r.entityId, r.assets.map((a) => a.assetId)]), [['hana', ['hana-sheet']], ['locked-door', []]]);
});
