import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { findStale } from '../../core/scope/stale.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';

test('gatherScope adds the prerequisites of entities named by this draft\'s events to priorEvents and refs, not to entityIds', async () => {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'entities', 'term', 'cell.md'), '---\nid: cell\nkind: term\nname: 세포\n---\n');
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell, ghost]\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-27T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', nodeId: 'what-is-a-cell', entityId: 'cell', kind: 'term.defined' });
  const work = await openWork(root);
  const events = activeEvents(await ledger.readAll());
  const draftText = '세포막은 바깥 경계다.';
  const plain = gatherScope({ work, events, nodeId: 'membranes', draftText, scopeFields: ['prerequisites'] });
  assert.deepEqual([plain.entityIds, plain.prerequisiteIds, plain.priorEvents.length], [['membrane'], [], 0]);
  const extracted = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };
  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted, scopeFields: ['prerequisites'] });
  assert.deepEqual(scope.entityIds, ['membrane']);
  assert.deepEqual(scope.prerequisiteIds, ['cell']);
  assert.deepEqual(scope.priorEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['what-is-a-cell:cell:term.defined']);
  assert.deepEqual(scope.refs.filter((r) => r.kind === 'entity').map((r) => r.id), ['cell', 'membrane']);
});

// M7(최종 리뷰 Minor 2): 선수 개념이 스코프에 들어간 원고를 실제로 커밋하면, 선수 개념의 앞선 정의가 바뀔 때
// core findStale 이 그 노드를 다시 확인 필요로 잡는지 — 리뷰 스크래치 스크립트로 확인한 것을 자동 테스트로 굳힌다.
test('a leaf committed with a prerequisite in scope goes stale when the prerequisite\'s earlier definition changes', async () => {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'entities', 'term', 'cell.md'), '---\nid: cell\nkind: term\nname: 세포\n---\n');
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell]\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-27T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', nodeId: 'what-is-a-cell', entityId: 'cell', kind: 'term.defined' });
  const work = await openWork(root);
  const events = activeEvents(await ledger.readAll());
  const draftText = work.tree.nodes.get('membranes').body;
  const extracted = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };
  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted, scopeFields: ['prerequisites'] });
  // membranes 본문이 "ATP"도 언급해 atp 도 entityIds 에 들어간다 — cell 은 entityIds 가 아니라 prerequisiteIds 로만 들어간다.
  assert.deepEqual(scope.refs.filter((r) => r.kind === 'entity').map((r) => r.id), ['atp', 'cell', 'membrane']);

  const receipts = openLedger(root, 'receipts');
  await receipts.append({ type: 'receipt', receiptId: 'rcpt-membranes', nodeId: 'membranes', variant: 'main', draftHash: sha256(draftText), refs: scope.refs });
  await receipts.append({ type: 'commit', receiptId: 'rcpt-membranes', nodeId: 'membranes', variant: 'main', committedHash: sha256(draftText) });
  const staleNow = async () => findStale({
    work: await openWork(root),
    receiptRecords: await openLedger(root, 'receipts').readAll(),
    events: activeEvents(await openLedger(root, 'events').readAll()),
  });
  assert.deepEqual(await staleNow(), []);

  // 선수 개념(cell)의 정의를 담은 엔티티 파일을 고친다 — membranes 는 cell 을 정의하지 않으니 entityIds 에는 없지만
  // prerequisiteIds 를 통해 refs 에 들어가 있었다.
  await writeFile(join(root, 'entities', 'term', 'cell.md'), '---\nid: cell\nkind: term\nname: 세포\n---\n세포는 생명의 가장 작은 단위다.\n');
  const stale = await staleNow();
  assert.deepEqual(stale.map((s) => s.nodeId), ['membranes']);
  assert.deepEqual(stale[0].reasons.map((r) => `${r.kind}:${r.id}`), ['entity:cell']);
});
