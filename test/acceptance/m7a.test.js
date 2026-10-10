import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { label } from '../support/fake-host.js';
import { PNG_A } from '../support/images.js';
import { createImageHost, illustratedWork } from '../support/image-work.js';

/** MCP 너머의 가짜 호스트 모델(노드 실행): 검사는 지적 없이, 원고는 ep-001 fixture 본문과 같은 문장. */
function answer(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
  if (p.produces === 'draft') return '하나는 지하실 끝에서 잠긴 문을 발견했다.\n';
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** folio_run 을 done 까지. needs_user 는 그 질문을 모아 두고 승인한다. */
async function drive(folio, root, start) {
  const labels = [];
  const questions = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
    labels.push(label(out));
    if (out.status === 'needs_model') out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    else if (out.status === 'needs_user') { questions.push(out.question); out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' })); } else throw new Error(`unexpected ${out.status}`);
  }
  labels.push(label(out));
  return { labels, questions };
}

const codes = (questions) => questions.flatMap((q) => [...(q.blocking ?? []), ...(q.advisories ?? [])]).map((f) => f.code);

test('M7a over MCP stdio: a scene is committed, one picture is briefed → checked → drawn → reviewed → approved, placed with ![[asset:id]] by recommit, and shown inline by the viewer', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await illustratedWork();
  assert.equal((await drive(folio, root, { node: 'ep-001' })).labels.at(-1), 'done');

  const host = await createImageHost();
  let out = await ok(folio.call('folio_image', { root, op: 'start', assetId: 'ep-001-door', nodeId: 'ep-001' }));
  const purposes = [];
  while (out.status === 'needs_model') {
    purposes.push(out.requests[0].purpose);
    out = await ok(folio.call('folio_image', { root, op: 'resume', runId: out.runId, answers: await host.answer(out) }));
  }
  assert.deepEqual(purposes, ['image_brief', 'image_generate', 'image_review']);
  assert.equal(out.question.kind, 'image_approval');
  assert.deepEqual(out.question.advisories.map((f) => f.code), ['REFERENCE_MISSING']);
  const review = host.calls.find((c) => c.purpose === 'image_review').payload;
  assert.deepEqual(await readFile(review.image.path), PNG_A, 'the review request points at the staged picture');
  const done = await ok(folio.call('folio_image', { root, op: 'decide', runId: out.runId, action: 'approve' }));
  assert.deepEqual([done.status, done.file], ['done', 'ep-001-door.png']);
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-door.png')), PNG_A);
  const scene = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  assert.doesNotMatch(await readFile(scene, 'utf8'), /asset:/, 'the image commit never writes the node');

  // 작가가 본문에 그림을 놓는다(손 작업) → recommit 이 image.asset-refs 를 지나 다시 커밋한다
  await writeFile(scene, `${await readFile(scene, 'utf8')}\n![[asset:ep-001-door]]\n`);
  const drifted = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(drifted.drift.map((d) => [d.nodeId, d.recommit]), [['ep-001', true]]);
  const recommit = await drive(folio, root, { node: 'ep-001', mode: 'recommit' });
  assert.equal(recommit.labels.at(-1), 'done');
  assert.ok(!codes(recommit.questions).some((c) => c.startsWith('ASSET_')), JSON.stringify(codes(recommit.questions)));
  assert.deepEqual((await ok(folio.call('folio_status', { root }))).drift, []);

  const view = await ok(folio.call('folio_view', { root, nodeId: 'ep-001' }));
  const url = new URL(view.url);
  const headers = { 'x-folio-token': url.searchParams.get('token') };
  const node = await (await fetch(new URL('/api/nodes/ep-001', url), { headers })).json();
  assert.deepEqual(node.assets.inline, [{ id: 'ep-001-door', known: true, hasFile: true, entities: ['hana', 'locked-door'] }]);
  const file = await fetch(new URL('/api/assets/ep-001-door', url), { headers });
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG_A);
  assert.equal(folio.stderr(), '');
});

test('M7a a picture pointing nowhere is caught by image.asset-refs on recommit; images off refuses folio_image but never the locks', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await illustratedWork();
  await drive(folio, root, { node: 'ep-001' });
  const scene = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(scene, `${await readFile(scene, 'utf8')}\n![[asset:nowhere]]\n`);
  const recommit = await drive(folio, root, { node: 'ep-001', mode: 'recommit' });
  assert.ok(codes(recommit.questions).includes('ASSET_UNKNOWN'), JSON.stringify(codes(recommit.questions)));
  const off = await illustratedWork((c) => ({ ...c, features: { images: false } }));
  assert.equal((await folio.call('folio_image', { root: off, op: 'start', assetId: 'x' })).error.code, 'FEATURE_DISABLED');
  assert.equal((await drive(folio, off, { node: 'ep-001' })).labels.at(-1), 'done', 'node runs do not need the images feature');
});
