import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { isValidOccurrenceRecord, OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { reanchor } from '../../core/occurrences/anchor.js';
import { occurrenceStates } from '../../core/occurrences/state.js';
import { planRename } from '../../core/rename/plan.js';
import { applyRename } from '../../core/rename/apply.js';
import { copyFixture } from '../support/fixtures.js';

// F-3: 이름 바꾸기가 그대로 실어 온(carried) 항목은 새 글에서 우연히 맞아도 살아나지 않는다.

const records = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();
const EP = 'tree/01-arc-awakening/02-ep-002.md';
const S = '비가 오는 밤이었고 골목은 아주 조용했다. 하나는 우산을 접고 문 앞에 섰다. 바람이 불었다 아주 차갑게 오래도록.\n';
const BODY = `첫째 장면.\n${S}둘째 장면.\n${S}`;

/** 같은 문장이 두 번 나오는 글에, 앞 문맥이 너무 길어 잘린 탓에 AMBIGUOUS 로 stale 이 되는 항목 둘을 기록한다. */
async function ambiguousWork() {
  const root = await copyFixture('serial-2level');
  const file = join(root, EP);
  const orig = await readFile(file, 'utf8');
  await writeFile(file, orig.slice(0, orig.indexOf('---\n', 4) + 4) + BODY);
  const node = [...(await openWork(root)).tree.nodes.values()].find((n) => n.body === BODY);
  const i1 = BODY.indexOf('하나는');
  const i2 = BODY.indexOf('하나는', i1 + 1);
  await submitOccurrences(root, { surface: { kind: 'node', id: node.id }, items: [
    { entityId: 'hana', kind: 'appearance', quote: '하나는', before: BODY.slice(0, i1) },
    { entityId: 'hana', kind: 'mention', quote: '하나는', before: BODY.slice(0, i2) },
  ] });
  return { root, node, i2 };
}

test('F-3: carried items stay stale (CARRIED) after a rename even though their old quote now matches one spot', async () => {
  const { root, node, i2 } = await ambiguousWork();
  const before = occurrenceStates(await openWork(root), await records(root));
  assert.deepEqual(before.map((s) => [s.kind, s.status, s.reason]), [['appearance', 'stale', 'AMBIGUOUS'], ['mention', 'stale', 'AMBIGUOUS']]);
  const include = [`node:${node.id}:@${i2}`];
  const plan = planRename(await openWork(root), await records(root), { entityId: 'hana', newName: '세라', include });
  assert.equal(plan.staleCarried.length, 2);
  await applyRename(root, { entityId: 'hana', newName: '세라', include, planDigest: plan.planDigest });

  const last = (await records(root)).at(-1);
  assert.equal(last.origin, 'rename');
  assert.ok(isValidOccurrenceRecord(last));
  assert.deepEqual(last.items.map((i) => i.carried), [true, true]);
  // 표시가 없었다면 옛 인용문은 새 글의 한 곳(바뀌지 않은 첫 문장)에 맞아 살아났을 것이다 — 그래서 이 검사가 의미 있다.
  const newBody = (await openWork(root)).tree.nodes.get(node.id).body;
  assert.notEqual(reanchor(newBody, last.items[0]).status, 'stale');

  const after = occurrenceStates(await openWork(root), await records(root));
  assert.deepEqual(after.map((s) => [s.kind, s.status, s.start, s.reason]), [['appearance', 'stale', null, 'CARRIED'], ['mention', 'stale', null, 'CARRIED']]);
});

test('F-3: resubmitting the surface replaces the carried items', async () => {
  const { root, node, i2 } = await ambiguousWork();
  const include = [`node:${node.id}:@${i2}`];
  const plan = planRename(await openWork(root), await records(root), { entityId: 'hana', newName: '세라', include });
  await applyRename(root, { entityId: 'hana', newName: '세라', include, planDigest: plan.planDigest });
  await submitOccurrences(root, { surface: { kind: 'node', id: node.id }, items: [{ entityId: 'hana', kind: 'appearance', quote: '세라는' }] });
  const states = occurrenceStates(await openWork(root), await records(root)).filter((s) => s.surface.id === node.id);
  assert.equal(states.length, 1);
  assert.equal(states[0].status, 'located');
  assert.equal((await records(root)).at(-1).items[0].carried, undefined);
});

test('F-3: a record whose carried is not a boolean is skipped as malformed', () => {
  const record = { type: 'occurrences', surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: 'x', carried: 'yes' }] };
  assert.equal(isValidOccurrenceRecord(record), false);
  assert.equal(isValidOccurrenceRecord({ ...record, items: [{ ...record.items[0], carried: false }] }), true);
});
