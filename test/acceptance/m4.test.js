import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { createToolbox } from '../../server/toolbox.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { createRunner } from '../../core/run/runner.js';
import { runTxChild, wasKilled } from '../support/crash.js';
import { applyRename } from '../../core/rename/apply.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}
// 기대 상태는 A3 규칙(anchor.js reanchor)으로 정해진다. 두 fixture 모두 인용문이 본문 맨 앞이라 저장된 앞 문맥이 비어 있다.
// 빈(짧은) 문맥은 "지금 앞 글 전체가 정확히 같아야" 온전하므로, 앞에 무엇을 더하면 앞 문맥이 깨져 relocated 가 된다(결정적).
// 본문이 30자보다 짧아 뒤 문맥도 "나머지 전부"로 저장되므로 뒤에 무엇을 더해도 relocated 다. 본문 밖(제목)만 고치면 located 다.
const EDITS = [
  ['prepend a paragraph', (t) => `새 문단.\n\n${t}`, 'relocated'],
  ['edit the words next to the quote', (t, q) => t.replace(q, `아주 ${q}`), 'relocated'],
  ['delete the quote', (t, q) => t.replace(q, '다른 말'), 'stale'],
  ['duplicate the whole text', (t) => `${t}\n${t}`, 'stale'],
];

for (const [fixture, nodeFile, surfaceId, entityId, quote] of [
  ['serial-2level', join('tree', '01-arc-awakening', '01-ep-001.md'), 'ep-001', 'hana', '하나는'],
  ['knowledge-book', join('tree', '01-part-basics', '02-chapter-energy', '01-atp.md'), 'atp-section', 'atp', 'ATP는'],
]) {
  for (const [name, edit, expected] of EDITS) {
    test(`M4-1 ${fixture}: re-find after "${name}"`, async () => {
      const root = await copyFixture(fixture);
      await useFakePack(root);
      const tools = createToolbox({ packs: fakePacks() });
      await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: surfaceId }, items: [{ entityId, kind: 'appearance', quote }] }));
      const path = join(root, nodeFile);
      const text = await readFile(path, 'utf8');
      const body = text.slice(text.indexOf('---\n', 4) + 4);
      const newBody = edit(body, quote);
      await writeFile(path, text.replace(body, newBody));
      const marks = (await ok(tools.call('folio_find', { root, query: 'usages', id: entityId }))).marks;
      assert.equal(marks.length, 1);
      assert.equal(marks[0].status, expected);
      if (expected === 'stale') assert.equal(marks[0].start, null);
      else {
        // 살아 있는 표시는 새 글에서 인용문이 실제로 있는 자리를 가리킨다(새 글에 인용문은 한 곳뿐이다).
        assert.equal(newBody.split(quote).length - 1, 1);
        assert.equal(marks[0].start, newBody.indexOf(quote));
      }
      const status = await ok(tools.call('folio_status', { root }));
      assert.equal(status.occurrences.stale.length, marks[0].status === 'stale' ? 1 : 0);
    });
  }
  test(`M4-1 ${fixture}: an edit outside the body (the title) keeps the mark located at the same start`, async () => {
    const root = await copyFixture(fixture);
    await useFakePack(root);
    const tools = createToolbox({ packs: fakePacks() });
    await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: surfaceId }, items: [{ entityId, kind: 'appearance', quote }] }));
    const path = join(root, nodeFile);
    const text = await readFile(path, 'utf8');
    const body = text.slice(text.indexOf('---\n', 4) + 4);
    await writeFile(path, text.replace(/^title: .*$/m, 'title: 바뀐 제목'));
    assert.notEqual(await readFile(path, 'utf8'), text);
    const marks = (await ok(tools.call('folio_find', { root, query: 'usages', id: entityId }))).marks;
    assert.deepEqual(marks.map((m) => [m.status, m.start]), [['located', body.indexOf(quote)]]);
  });
}

test('M4-2 an appearance of a dead character blocks; a mention does not', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level');
  const make = () => createRunner({ root, packs: fakePacks() });
  const appear = createFakeHost({ drafts: { 'ep-003': '그는 문을 두드렸다.' }, events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'appearance', quote: '그는' }] } } });
  const blocked = await driveToEnd(make, appear, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.ok(blocked.at(-1).question.blocking.some((f) => f.code === 'DEAD_ON_STAGE'));
  await make().decide({ runId: blocked.at(-1).runId, action: 'skip', reason: '다시' });
  const mention = createFakeHost({ drafts: { 'ep-003': '하나는 도윤을 떠올렸다.' }, events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'mention', quote: '도윤을' }] } } });
  const done = await driveToEnd(make, mention, { start: { node: 'ep-003' }, until: (o) => o.status === 'done' });
  assert.equal(done.at(-1).status, 'done');
});

test('M4-3 a rename that fails in the middle or is killed leaves the files as they were', async () => {
  const root = await copyFixture('knowledge-book');
  const BOOK_FILES = ['tree/01-part-basics/02-chapter-energy/01-atp.md', 'tree/01-part-basics/01-chapter-cells/02-membranes.md', 'entities/term/atp.md'];
  const readAll = async (dir) => Promise.all(BOOK_FILES.map((p) => readFile(join(dir, p), 'utf8')));
  const before = await readAll(root);
  const child = runTxChild(root, 'kill-after-second-write-book');
  assert.ok(wasKilled(child), child.stderr);
  // 죽기 전에 두 파일은 정말 바뀌었고 세 번째는 아직이다 — 되돌리기가 실제로 일을 했는지 보려면 이것부터 확인한다
  const killed = await readAll(root);
  assert.notEqual(killed[0], before[0]);
  assert.notEqual(killed[1], before[1]);
  assert.equal(killed[2], before[2]);
  await useFakePack(root);
  const tools = createToolbox({ packs: fakePacks() });
  const interrupted = await ok(tools.call('folio_status', { root }));
  assert.deepEqual(interrupted.warnings.find((w) => w.code === 'TX_INTERRUPTED'), { code: 'TX_INTERRUPTED', dir: '.folio/tx', valid: true });
  // 다음 작업 잠금이 되돌린다(folio_find usages 는 작업 잠금을 잡는다)
  await ok(tools.call('folio_find', { root, query: 'usages', id: 'atp' }));
  assert.deepEqual(await readAll(root), before);
  // 주입 실패도 같은 결과: 계획을 적용하다 세 번째 파일 앞에서 실패
  await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] }));
  await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'membranes' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP를' }] }));
  const plan = await ok(tools.call('folio_find', { root, query: 'rename', id: 'atp', newName: '아데노신삼인산' }));
  const ledgerPath = join(root, '.folio', 'ledger', 'occurrences.jsonl');
  const ledgerBefore = await readFile(ledgerPath);
  await assert.rejects(applyRename(root, { entityId: 'atp', newName: '아데노신삼인산', planDigest: plan.planDigest }, { hooks: { beforeWrite: (i) => { if (i === 2) throw new Error('boom'); } } }), { code: 'TX_FAILED' });
  assert.deepEqual(await readAll(root), before);
  assert.deepEqual(await readFile(ledgerPath), ledgerBefore, 'a failed rename appends nothing to the occurrences ledger');
});

test('M4-4 over MCP stdio: extract occurrences → commit → marks → rename → recommit → no drift', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await copyFixture('serial-2level');
  const answer = (r) => {
    const p = r.payload;
    if (r.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (r.purpose === 'revise' || r.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title} 계획`;
    if (p.produces === 'draft') return '하나는 지하실 끝에서 잠긴 문을 발견했다. 그녀는 숨을 골랐다.\n';
    if (p.produces === 'events') {
      // 이름을 바꾼 뒤(recommit)에는 원고에 새 이름이 있다 — 인용문은 늘 지금 원고에서 뽑는다
      const name = p.draft.includes('세라는') ? '세라는' : '하나는';
      return JSON.stringify({ events: [], appearances: [], mentions: [], occurrences: p.occurrences?.wanted ? [{ entityId: 'hana', kind: 'appearance', quote: name }, { entityId: 'hana', kind: 'appearance', quote: '그녀는' }] : undefined });
    }
    throw new Error(`no answer for ${r.purpose}/${p.produces}`);
  };
  async function drive(start) {
    const labels = [];
    let out = await ok(folio.call('folio_run', { root, ...start }));
    for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
      labels.push(label(out));
      if (out.status === 'needs_model') out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
      else if (out.status === 'needs_user') out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
      else throw new Error(`unexpected ${out.status}`);
    }
    labels.push(label(out));
    return labels;
  }
  assert.equal((await drive({ node: 'ep-001' })).at(-1), 'done');
  const marks = (await ok(folio.call('folio_find', { root, query: 'usages', id: 'hana' }))).marks;
  assert.deepEqual(marks.map((m) => [m.quote, m.status, m.origin]), [['하나는', 'located', 'extract'], ['그녀는', 'located', 'extract']]);
  const plan = await ok(folio.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' }));
  assert.deepEqual(plan.committed, ['ep-001']);
  const applied = await ok(folio.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: '세라', planDigest: plan.planDigest }));
  assert.deepEqual(applied.recommit, ['ep-001']);
  const drifted = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(drifted.drift.map((d) => [d.nodeId, d.code, d.recommit]), [['ep-001', 'HAND_EDITED', true]]);
  const labels = await drive({ node: 'ep-001', mode: 'recommit' });
  assert.deepEqual(labels, ['model:extract', 'model:critic', 'user:approve', 'done']);
  const clean = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(clean.drift, []);
  assert.deepEqual(clean.occurrences.stale, []);
  assert.match(await readFile(join(root, 'tree', '01-arc-awakening', '01-ep-001.md'), 'utf8'), /세라는 지하실/);
  assert.equal(folio.stderr(), '');
});

test('M4-5 feature toggles remove features but never locks', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features: { occurrences: false, occurrencesInExtract: false, rename: false, recommit: false } }));
  const tools = createToolbox({ packs: fakePacks() });
  assert.equal((await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'ep-001' }, items: [] })).error.code, 'FEATURE_DISABLED');
  assert.equal((await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' })).error.code, 'FEATURE_DISABLED');
  assert.equal((await tools.call('folio_run', { root, node: 'ep-001', mode: 'recommit' })).error.code, 'FEATURE_DISABLED');
  const host = createFakeHost({ drafts: { 'ep-003': '도윤이 문을 두드렸다.' }, events: { 'ep-003': { events: [], appearances: ['doyun'] } } });
  const make = () => createRunner({ root, packs: fakePacks() });
  const trail = await driveToEnd(make, host, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.equal(trail.at(-1).question.canApprove, false);
  assert.ok(trail.at(-1).question.blocking.some((f) => f.code === 'DEAD_ON_STAGE'), JSON.stringify(trail.at(-1).question.blocking));
  await assert.rejects(make().decide({ runId: trail.at(-1).runId, action: 'approve', reason: '괜찮다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
});
