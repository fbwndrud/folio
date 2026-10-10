import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMISE_MENTION, PROMISE_STAGES, foldPromise, promiseMovement, promiseStageOf, stepPromise } from '../../core/promise.js';
import { PROMISE_ORDER_CHECK } from '../../core/checks/builtin.js';
import { promiseFlow } from '../../packs/novel/checkers/promise-flow.js';

const ev = (kind, nodeId, entityId = 'key') => ({ entityId, kind: kind.includes('.') ? kind : `promise.${kind}`, nodeId, eventId: `${nodeId}-${kind}` });
const promiseEntities = new Map([['key', { kind: 'promise', name: '열쇠' }]]);

test('C0: stepPromise is the one promise step — planted starts it, closed stays closed until reopened, mentions never move it', () => {
  const cases = [
    [null, 'planted', 'planted', true], [null, 'advanced', null, false], [null, 'resolved', null, false], [null, null, null, false],
    ['planted', 'advanced', 'advanced', true], ['advanced', 'resolved', 'resolved', true], ['resolved', 'closed', 'closed', true],
    ['closed', 'advanced', 'closed', false], ['closed', 'resolved', 'closed', false], ['closed', 'planted', 'closed', false],
    ['closed', 'reopened', 'reopened', true], ['parked', 'advanced', 'advanced', true], ['advanced', null, 'advanced', false],
  ];
  for (const [stage, next, after, moved] of cases) assert.deepEqual(stepPromise(stage, next), { stage: after, moved }, `${stage} → ${next}`);
});

test('C0: closed → advanced → resolved reads the same everywhere — the core lock warns, dormancy sees it closed, the flow check flags the advance', () => {
  const events = [ev('planted', 'e1'), ev('closed', 'e2'), ev('advanced', 'e3'), ev('resolved', 'e4')];
  const folded = foldPromise(events);
  assert.equal(folded.stage, 'closed');
  assert.deepEqual(folded.problems.map((p) => [p.code, p.severity, p.nodeId]), [['PROMISE_RESOLVED_AFTER_CLOSE', 'warning', 'e4']]);
  assert.deepEqual(promiseMovement(events), { stage: 'closed', plantedAt: 'e1', lastMovedAt: 'e2' });
  const flow = promiseFlow({ draft: '', priorEvents: events.slice(0, 2), draftEvents: events.slice(2), work: { entities: promiseEntities } });
  assert.deepEqual(flow.map((f) => f.code), ['PROMISE_EVENT_AFTER_CLOSE'], 'the flow check flags the advance and leaves the resolve to the core warning');
  const reopened = [ev('planted', 'e1'), ev('closed', 'e2'), ev('reopened', 'e3'), ev('advanced', 'e4'), ev('resolved', 'e5')];
  assert.deepEqual(foldPromise(reopened).problems, []);
  assert.deepEqual(promiseMovement(reopened), { stage: 'resolved', plantedAt: 'e1', lastMovedAt: 'e5' });
  const withMention = [ev('planted', 'e1'), ev(PROMISE_MENTION, 'e2'), ev('closed', 'e3')];
  assert.deepEqual(promiseMovement(withMention).lastMovedAt, 'e3');
});

/** C0 전의 foldPromise(바꾸기 전 동작). 새 동작이 잠금을 약하게 하지 않는지 견주는 기준이다. */
function foldBefore(events) {
  let stage = null;
  const problems = [];
  for (const event of events) {
    const next = promiseStageOf(event);
    if (!next) continue;
    if (stage === null && next !== 'planted') problems.push({ code: next === 'resolved' ? 'PROMISE_RESOLVED_BEFORE_PLANT' : 'PROMISE_MOVED_BEFORE_PLANT', severity: 'hard', nodeId: event.nodeId });
    else if (stage === 'closed' && next === 'resolved') problems.push({ code: 'PROMISE_RESOLVED_AFTER_CLOSE', severity: 'warning', nodeId: event.nodeId });
    if (stage !== null || next === 'planted') stage = next;
  }
  return problems;
}

test('C0: over every sequence of up to four stage events the lock only gets stricter — the same hard findings, warnings only added', () => {
  const kinds = [...PROMISE_STAGES, 'mentioned'];
  let sequences = [[]];
  let compared = 0;
  for (let length = 1; length <= 4; length += 1) {
    sequences = sequences.flatMap((seq) => kinds.map((kind) => [...seq, kind]));
    for (const seq of sequences) {
      const events = seq.map((kind, i) => ev(kind === 'mentioned' ? PROMISE_MENTION : kind, `n${i}`));
      const before = foldBefore(events);
      const after = foldPromise(events).problems;
      const key = (p) => `${p.code}@${p.nodeId}`;
      assert.deepEqual(after.filter((p) => p.severity === 'hard').map(key), before.filter((p) => p.severity === 'hard').map(key), seq.join(' '));
      for (const warning of before.filter((p) => p.severity === 'warning')) assert.ok(after.some((p) => key(p) === key(warning)), seq.join(' '));
      compared += 1;
    }
  }
  assert.equal(compared, 8 + 64 + 512 + 4096);
});

test('C0: core.promise-order reports the new warning on the resolving node, and it does not block', () => {
  const work = { entities: promiseEntities };
  const priorEvents = [ev('planted', 'e1'), ev('closed', 'e2'), ev('advanced', 'e3')];
  const findings = PROMISE_ORDER_CHECK.run({ work, nodeId: 'e4', priorEvents, draftEvents: [ev('resolved', 'e4')] });
  assert.deepEqual(findings.map((f) => [f.code, f.severity]), [['PROMISE_RESOLVED_AFTER_CLOSE', 'warning']]);
});
