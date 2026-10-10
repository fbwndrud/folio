import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { committedWith, editYaml } from '../support/recheck.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const makeRunner = (root) => () => createRunner({ root, packs: fakePacks() });
async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
}
const occ = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();

test('the extract request asks for occurrences; valid ones are recorded after the commit with the receipt id', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost({
    drafts: { 'ep-001': '하나는 문 앞에 섰다. 그녀는 숨을 골랐다.' },
    events: { 'ep-001': { events: [], appearances: [], mentions: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '그녀는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.equal(host.calls.find((c) => c.stepId === 'extract').payload.occurrences.wanted, true);
  const records = await occ(root);
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].origin, records[0].receiptId, records[0].surface], ['extract', trail.at(-1).receiptId, { kind: 'node', id: 'ep-001', field: '' }]);
  assert.equal(records[0].items[0].before, '하나는 문 앞에 섰다. ');
});

test('an answer without occurrences records nothing; a wrong quote is asked again and then blocked', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.deepEqual(await occ(root), []);
  const bad = createFakeHost({ events: { '*': { events: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '없는 인용' }] } } });
  const trail = await driveToEnd(makeRunner(root), bad, { start: { node: 'ep-002' }, until: (o) => o.status === 'needs_user' });
  assert.deepEqual(trail.map(label).filter((l) => l === 'model:extract').length, 3);
  assert.equal(trail.at(-1).question.code, 'EXTRACT_FAILED');
  assert.match(trail.at(-1).question.blocking[0].message, /OCCURRENCE_QUOTE_NOT_FOUND/);
  assert.equal(trail.at(-1).question.canApprove, false);
});

test('an appearance occurrence feeds the dead-on-stage check even when the name is not in the text', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level'); // ep-002: doyun dead
  const host = createFakeHost({
    drafts: { 'ep-003': '그는 문을 두드렸다.' },
    events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'appearance', quote: '그는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.equal(trail.at(-1).question.kind, 'blocked');
  assert.ok(trail.at(-1).question.blocking.some((f) => f.code === 'DEAD_ON_STAGE'));
  const mention = createFakeHost({
    drafts: { 'ep-003': '그는 도윤을 떠올렸다.' },
    events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'mention', quote: '도윤을' }] } },
  });
  await makeRunner(root)().decide({ runId: trail.at(-1).runId, action: 'skip', reason: '다시 쓰기' });
  const again = await driveToEnd(makeRunner(root), mention, { start: { node: 'ep-003' }, until: (o) => o.status === 'done' || o.status === 'needs_user' });
  // 언급(mention)만 있으면 사망 검사가 막지 않는다: 승인 질문이거나 끝까지 간다
  assert.ok(again.at(-1).status === 'done' || again.at(-1).question.kind === 'approve', JSON.stringify(again.at(-1)));
});

test('with occurrencesInExtract off the request does not ask, and occurrences in the answer are ignored', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await setFeatures(root, { occurrencesInExtract: false });
  const host = createFakeHost({ events: { '*': { events: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '없는 인용' }] } } });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.equal(host.calls.find((c) => c.stepId === 'extract').payload.occurrences.wanted, false);
  assert.deepEqual(await occ(root), []);
});

test('changing a run feature while a request is open makes the answer stale and restarts from extract', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost();
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => label(o) === 'model:critic' });
  await setFeatures(root, { occurrenceScope: true });
  await assert.rejects(makeRunner(root)().resume({ runId: trail.at(-1).runId, answers: host.answer(trail.at(-1)) }), { code: 'ANSWER_STALE' });
  const next = await makeRunner(root)().run({ node: 'ep-001' });
  assert.equal(label(next), 'model:extract');
});

test('a tampered occurrences ledger never strands the run in committing (Ruling P11)', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const ledgerDir = join(root, '.folio', 'ledger');
  await mkdir(ledgerDir, { recursive: true });
  await writeFile(join(ledgerDir, 'occurrences.jsonl'), '{"not":"valid-chain"}\n');
  const host = createFakeHost({
    drafts: { 'ep-001': '하나는 문 앞에 섰다. 그녀는 숨을 골랐다.' },
    events: { 'ep-001': { events: [], appearances: [], mentions: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '그녀는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const last = trail.at(-1);
  assert.equal(last.status, 'done');
  const runFile = JSON.parse(await readFile(join(root, '.folio', 'runs', `${last.runId}.json`), 'utf8'));
  assert.ok(runFile.history.some((h) => h.event === 'occurrences_not_recorded' && h.code === 'LEDGER_TAMPERED'));
  const commits = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === 'ep-001');
  assert.equal(commits.length, 1);
});

test('a mention submitted before the appearance for the same quote still feeds the dead-on-stage check (Ruling B3-1 regression)', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level'); // ep-002: doyun dead
  const host = createFakeHost({
    drafts: { 'ep-003': '도윤이 문을 두드렸다.' },
    events: {
      'ep-003': {
        events: [],
        occurrences: [
          { entityId: 'doyun', kind: 'mention', quote: '도윤이' },
          { entityId: 'doyun', kind: 'appearance', quote: '도윤이' },
        ],
      },
    },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.equal(trail.at(-1).question.kind, 'blocked');
  assert.ok(trail.at(-1).question.blocking.some((f) => f.code === 'DEAD_ON_STAGE'), JSON.stringify(trail.at(-1)));
});

test('occurrence items tampered in the run file after extraction fail commit-time re-validation without stranding the run (Ruling B3-2)', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost({
    drafts: { 'ep-001': '하나는 문 앞에 섰다. 그녀는 숨을 골랐다.' },
    events: { 'ep-001': { events: [], appearances: [], mentions: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '그녀는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => label(o) === 'model:critic' });
  const runId = trail.at(-1).runId;
  const runPath = join(root, '.folio', 'runs', `${runId}.json`);
  const runFile = JSON.parse(await readFile(runPath, 'utf8'));
  runFile.outputs.events.occurrences[0].quote = '없는 인용'; // 추출 뒤 실행 파일만 손댄 것을 흉내낸다
  await writeFile(runPath, JSON.stringify(runFile, null, 2));
  const resumed = await makeRunner(root)().resume({ runId, answers: host.answer(trail.at(-1)) });
  const after = await driveToEnd(makeRunner(root), host, { from: resumed, until: (o) => o.status === 'done' });
  assert.equal(after.at(-1).status, 'done');
  const finalRunFile = JSON.parse(await readFile(runPath, 'utf8'));
  assert.ok(finalRunFile.history.some((h) => h.event === 'occurrences_not_recorded' && h.code === 'OCCURRENCES_INVALID'), JSON.stringify(finalRunFile.history));
  assert.deepEqual(await occ(root), []);
  const commits = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === 'ep-001');
  assert.equal(commits.length, 1);
});

test('resuming a run forced back to committing after a successful commit (simulating a crash right after) records occurrences exactly once', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost({
    drafts: { 'ep-001': '하나는 문 앞에 섰다. 그녀는 숨을 골랐다.' },
    events: { 'ep-001': { events: [], appearances: [], mentions: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '그녀는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const runId = trail.at(-1).runId;
  assert.equal((await occ(root)).length, 1);
  const runPath = join(root, '.folio', 'runs', `${runId}.json`);
  const runFile = JSON.parse(await readFile(runPath, 'utf8'));
  runFile.state = 'committing'; // 커밋이 끝난 뒤(영수증·등장 위치 모두 기록된 뒤) 죽었다고 흉내낸다
  await writeFile(runPath, JSON.stringify(runFile, null, 2));
  const again = await makeRunner(root)().run({ node: 'ep-001' });
  assert.equal(again.status, 'done');
  assert.equal((await occ(root)).length, 1);
});

test('a recheck run never asks for occurrences and ignores any it is given, even a badly quoted one (Ruling B3-3)', async () => {
  const draft = '문을 두드렸다.';
  const initial = { drafts: { 'ep-003': draft }, events: { 'ep-003': { events: [], appearances: [] } } };
  const { root, makeRunner: mk } = await committedWith({ fixture: 'serial-2level', seed: true, node: 'ep-003', checks: { 'fake.dead-on-stage': { mode: 'off' } }, host: initial });
  await editYaml(root, (c) => { c.checks = {}; });
  const recheckHost = createFakeHost({ drafts: { 'ep-003': draft }, events: { 'ep-003': { events: [], appearances: [], occurrences: [{ entityId: 'doyun', kind: 'appearance', quote: '없는 인용' }] } } });
  const trail = await driveToEnd(mk, recheckHost, { start: { node: 'ep-003', mode: 'recheck' }, until: (o) => o.status === 'done' || o.status === 'needs_user' });
  assert.equal(trail.filter((o) => label(o) === 'model:extract').length, 1); // 답의 나쁜 quote 로 다시 묻지 않았다
  assert.equal(trail.at(-1).status, 'done', JSON.stringify(trail.at(-1)));
  assert.equal(recheckHost.calls.find((c) => c.stepId === 'extract').payload.occurrences.wanted, false);
  assert.deepEqual(await occ(root), []); // 재검사는 등장 위치를 기록하지 않는다
});

test('turning rename or recommit off does not disturb an open run', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost();
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => label(o) === 'model:critic' });
  await setFeatures(root, { rename: false, recommit: false });
  const out = await makeRunner(root)().resume({ runId: trail.at(-1).runId, answers: host.answer(trail.at(-1)) });
  assert.equal(label(out), 'user:approve');
});
