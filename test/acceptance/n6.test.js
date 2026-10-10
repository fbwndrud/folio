import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { lastCommits } from '../../core/ledger/receipts.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const ORIGINAL = '하나는 지하실 끝에서 잠긴 문을 30번 두드렸다.\n';
const ENGLISH = 'Hana knocked on the locked door at the end of the cellar 30 times.\n';
const SHORT = '하나가 문을 두드렸다.\n';
const EN = { id: 'en', kind: 'translation', lang: 'en' };
const BRIEF = { id: 'brief', kind: 'summary', lang: 'ko' };
const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');

/** MCP 너머의 가짜 호스트 모델. 판본 요청(payload.variant)에는 판본 글을, 원본 요청에는 원본 글을 준다. 검사는 지적 없이 답한다. */
function answer(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
  if (p.produces === 'draft') return p.variant ? (p.variant.kind === 'summary' ? SHORT : ENGLISH) : ORIGINAL;
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** 끝날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 지나온 결과 이름과 요청을 모은다. */
async function drive(folio, root, start) {
  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (out.status === 'done' || out.status === 'idle') return { labels, requests, out };
    if (out.status === 'needs_model') {
      requests.push(...out.requests);
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

/** 합성 연재 복사본에 판본 팩과 판본 선언을 더한다(작가가 work.yaml 에 적는 일). 원본 fixture 는 그대로. */
async function work(extra = {}) {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({
    ...config, packs: ['novel', 'variants'], checkSets: [...config.checkSets, 'variants.basic'], variants: ['main', EN, BRIEF], ...extra,
  }));
  return root;
}

const receipts = async (root) => openLedger(root, 'receipts').readAll();
const variantReceipt = async (root, variant, nodeId) => {
  const records = await receipts(root);
  const commit = lastCommits(records, variant).get(nodeId);
  return commit && records.find((r) => r.type === 'receipt' && r.receiptId === commit.receiptId);
};

test('N6-1 over MCP stdio a translation is made from the committed original, checked against it and committed under its own receipt; the original file is untouched', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work();
  const refused = await folio.call('folio_run', { root, node: 'ep-001', variant: 'en' });
  assert.equal(refused.error.code, 'VARIANT_ORIGINAL_NOT_COMMITTED');
  assert.equal((await drive(folio, root, { node: 'ep-001' })).out.status, 'done');
  const before = await readFile(join(root, EP1), 'utf8');
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(status.variants.en, { committed: 0, stale: [], drift: [], missing: ['ep-001'] });

  const { labels, requests, out } = await drive(folio, root, { variant: 'en' });
  assert.equal(out.status, 'done');
  assert.equal(labels[0], 'model:draft');
  const draft = requests.find((r) => r.stepId === 'draft').payload;
  assert.deepEqual([draft.variant, draft.original, draft.current], [EN, ORIGINAL, null]);
  const review = requests.find((r) => r.stepId === 'variant-review').payload;
  assert.deepEqual(review.checks.map((c) => c.checkId), ['variants.fidelity']);
  assert.equal(await readFile(join(root, 'variants', 'en', 'ep-001.md'), 'utf8'), ENGLISH);
  assert.equal(await readFile(join(root, EP1), 'utf8'), before, 'a variant commit never writes the original');

  const main = await variantReceipt(root, 'main', 'ep-001');
  const en = await variantReceipt(root, 'en', 'ep-001');
  assert.deepEqual([en.variant, en.original.receiptId, en.original.committedHash, en.events, en.structure ?? null], ['en', main.receiptId, main.draftHash, [], null]);
  assert.deepEqual(en.refs.map((r) => r.kind), ['original', 'terms']);
  assert.ok(en.appliedChecks.every((a) => a.checkId.startsWith('variants.')), 'only variant checks run on a variant');
  const after = await ok(folio.call('folio_status', { root }));
  assert.deepEqual([after.variants.en.committed, after.variants.en.missing, after.variants.brief.missing], [1, [], ['ep-001']]);
  assert.equal((await drive(folio, root, { variant: 'en' })).out.status, 'idle');
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N6-2 a summary is its own variant: its receipt never counts for the translation, and both stay beside the original', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work();
  await drive(folio, root, { node: 'ep-001' });
  await drive(folio, root, { node: 'ep-001', variant: 'brief' });
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual([status.variants.brief.committed, status.variants.en.committed, status.variants.en.missing], [1, 0, ['ep-001']]);
  assert.equal(await readFile(join(root, 'variants', 'brief', 'ep-001.md'), 'utf8'), SHORT);
  const records = await receipts(root);
  assert.deepEqual([lastCommits(records).size, lastCommits(records, 'brief').size, lastCommits(records, 'en').size], [1, 1, 0]);
});

test('N6-3 after the original is recommitted the translation is stale, a hand edit is drift; variant recheck is refused and nothing is rewritten', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work({ features: { recommit: true } });
  await drive(folio, root, { node: 'ep-001' });
  await drive(folio, root, { node: 'ep-001', variant: 'en' });
  const variantPath = join(root, 'variants', 'en', 'ep-001.md');
  await writeFile(variantPath, ENGLISH.replace('30 times', 'thirty times'));
  const path = join(root, EP1);
  await writeFile(path, (await readFile(path, 'utf8')).replace('30번', '서른 번'));
  assert.equal((await drive(folio, root, { node: 'ep-001', mode: 'recommit' })).out.status, 'done');

  const status = await ok(folio.call('folio_status', { root }));
  const { stale, drift } = status.variants.en;
  assert.deepEqual([stale.map((s) => s.nodeId), stale[0].reasons.map((r) => r.kind)], [['ep-001'], ['original']]);
  assert.deepEqual(drift.map((d) => [d.nodeId, d.code]), [['ep-001', 'HAND_EDITED']]);
  assert.equal((await folio.call('folio_run', { root, node: 'ep-001', variant: 'en', mode: 'recheck' })).error.code, 'TOOL_INPUT_INVALID');
  assert.equal(await readFile(variantPath, 'utf8'), ENGLISH.replace('30 times', 'thirty times'), 'the translator\'s edit is kept');
});

test('N6-4 refusals: an undeclared variant, a branch node, and the variants feature turned off (status.variants is null); the receipts ledger only grows', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work();
  await drive(folio, root, { node: 'ep-001' });
  const ledger = await readFile(join(root, '.folio', 'ledger', 'receipts.jsonl'), 'utf8');
  assert.equal((await folio.call('folio_run', { root, node: 'ep-001', variant: 'fr' })).error.code, 'VARIANT_UNKNOWN');
  assert.equal((await folio.call('folio_run', { root, node: 'arc-awakening', variant: 'en' })).error.code, 'VARIANT_LEAF_ONLY');
  await drive(folio, root, { node: 'ep-001', variant: 'en' });
  const grown = await readFile(join(root, '.folio', 'ledger', 'receipts.jsonl'), 'utf8');
  assert.ok(grown.startsWith(ledger) && grown.length > ledger.length, 'append-only');

  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features: { variants: false } }));
  const off = await folio.call('folio_run', { root, node: 'ep-001', variant: 'brief' });
  assert.equal(off.error.code, 'FEATURE_DISABLED');
  assert.equal((await ok(folio.call('folio_status', { root }))).variants, null);
});
