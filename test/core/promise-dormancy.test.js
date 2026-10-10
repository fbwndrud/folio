import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPANS, HORIZON_SPANS, PROMISE_MENTION, PROMISE_STAGES,
  dormantPromises, foldPromise, leafDistance, promiseMovement, spanFor,
} from '../../core/promise.js';
import { computePositions } from '../../core/store/position.js';
import { validateWorkConfig } from '../../core/work/config.js';

const ev = (kind, nodeId, entityId = 'key') => ({ entityId, kind: kind.includes('.') ? kind : `promise.${kind}`, nodeId, eventId: `${nodeId}-${kind}` });

/** 아크 a1(e1..e3), 부록 역할 잎 x1, 아크 a2(e4..e6)인 합성 작품. order 를 주면 그 레벨 순서 방식을 쓴다. */
function work({ order, entities = new Map() } = {}) {
  const node = (id, kind, extra) => ({ id, level: kind === 'leaf' ? 'episode' : 'arc', role: 'body', status: 'draft', kind, data: {}, body: '', children: [], ...extra });
  const nodes = new Map([
    ['a1', node('a1', 'branch', { parentId: null, children: ['e1', 'e2', 'e3', 'x1'] })],
    ['e1', node('e1', 'leaf', { parentId: 'a1' })], ['e2', node('e2', 'leaf', { parentId: 'a1' })], ['e3', node('e3', 'leaf', { parentId: 'a1' })],
    ['x1', node('x1', 'leaf', { parentId: 'a1', role: 'back' })],
    ['a2', node('a2', 'branch', { parentId: null, children: ['e4', 'e5', 'e6'] })],
    ['e4', node('e4', 'leaf', { parentId: 'a2' })], ['e5', node('e5', 'leaf', { parentId: 'a2' })], ['e6', node('e6', 'leaf', { parentId: 'a2' })],
  ]);
  const tree = { nodes, rootIds: ['a1', 'a2'] };
  const { config, errors } = validateWorkConfig({ levels: [{ name: 'arc' }, { name: 'episode', leaf: true }], ...(order ? { order } : {}) });
  assert.deepEqual(errors, []);
  return { tree, positions: computePositions(tree, config), entities };
}

test('PROMISE_STAGES keeps its order and ends with reopened; the mention kind is separate', () => {
  assert.deepEqual(PROMISE_STAGES, ['planted', 'advanced', 'misdirected', 'resolved', 'closed', 'parked', 'reopened']);
  assert.equal(PROMISE_STAGES.at(-1), 'reopened');
  assert.equal(PROMISE_MENTION, 'promise.mentioned');
  assert.ok(!PROMISE_STAGES.includes('mentioned'));
});

test('foldPromise: reopened after closed, then resolved, gives no warning', () => {
  const out = foldPromise([ev('planted', 'e1'), ev('closed', 'e2'), ev('reopened', 'e3'), ev('resolved', 'e4')]);
  assert.equal(out.stage, 'resolved');
  assert.deepEqual(out.problems, []);
  const noReopen = foldPromise([ev('planted', 'e1'), ev('closed', 'e2'), ev('resolved', 'e4')]);
  assert.deepEqual(noReopen.problems.map((p) => [p.code, p.severity]), [['PROMISE_RESOLVED_AFTER_CLOSE', 'warning']]);
});

test('foldPromise: reopened before plant is PROMISE_MOVED_BEFORE_PLANT (hard); mentions are ignored', () => {
  const out = foldPromise([ev('reopened', 'e1'), ev('planted', 'e2')]);
  assert.deepEqual(out.problems.map((p) => [p.code, p.severity, p.nodeId]), [['PROMISE_MOVED_BEFORE_PLANT', 'hard', 'e1']]);
  assert.equal(out.stage, 'planted');
  const mentioned = foldPromise([ev(PROMISE_MENTION, 'e1'), ev('planted', 'e2'), ev(PROMISE_MENTION, 'e3')]);
  assert.deepEqual(mentioned.problems, []);
  assert.deepEqual(mentioned.history.map((h) => h.stage), ['planted']);
  assert.equal(mentioned.stage, 'planted');
});

test('promiseMovement: stage events move, mentions do not, and pre-plant events are ignored', () => {
  assert.deepEqual(promiseMovement([]), { stage: null, plantedAt: null, lastMovedAt: null });
  assert.deepEqual(promiseMovement([ev('advanced', 'e1'), ev(PROMISE_MENTION, 'e1')]), { stage: null, plantedAt: null, lastMovedAt: null });
  const events = [ev('advanced', 'e1'), ev('planted', 'e2'), ev('advanced', 'e3'), ev(PROMISE_MENTION, 'e5'), { entityId: 'key', kind: 'state', nodeId: 'e6' }];
  assert.deepEqual(promiseMovement(events), { stage: 'advanced', plantedAt: 'e2', lastMovedAt: 'e3' });
  assert.deepEqual(promiseMovement([ev('planted', 'e1'), ev('parked', 'e4')]), { stage: 'parked', plantedAt: 'e1', lastMovedAt: 'e4' });
});

test('leafDistance: counts ordered body leaves after from through to; branches and back matter are not counted', () => {
  const w = work();
  assert.equal(leafDistance(w, 'e1', 'e1'), 0);
  assert.equal(leafDistance(w, 'e1', 'e3'), 2);
  assert.equal(leafDistance(w, 'e3', 'e4'), 1, 'arc a2 and back-matter x1 are not counted');
  assert.equal(leafDistance(w, 'e1', 'e6'), 5);
  assert.equal(leafDistance(w, 'e5', 'e2'), 0, 'backwards counts nothing');
  assert.equal(leafDistance(w, 'a1', 'e2'), 2, 'a plan node can be the start');
  assert.equal(leafDistance(w, 'e1', 'x1'), null, 'back matter is unordered');
  assert.equal(leafDistance(w, 'e1', 'nope'), null);
});

test('leafDistance: a work without reading order (none) gives null', () => {
  const w = work({ order: { default: 'none' } });
  assert.equal(leafDistance(w, 'e1', 'e3'), null);
});

test('spanFor: horizon (trimmed, lowercased) wins; otherwise core or other', () => {
  assert.equal(spanFor({ data: { horizon: 'next' } }), HORIZON_SPANS.next);
  assert.equal(spanFor({ data: { horizon: ' FINALE ' } }), 24);
  assert.equal(spanFor({ data: { horizon: 'someday', core: true } }), DEFAULT_SPANS.core);
  assert.equal(spanFor({ data: {} }), 10);
  assert.equal(spanFor(undefined), 10);
  assert.equal(spanFor({ data: { horizon: 'toString' } }), 10, 'prototype keys are not horizons');
  assert.equal(spanFor({ data: { horizon: 'arc' } }, { arc: 3 }, { core: 1, other: 2, parked: 4 }), 3);
  assert.equal(spanFor({ data: { core: true } }, {}, { core: 1, other: 2, parked: 4 }), 1);
  assert.ok(Object.isFrozen(HORIZON_SPANS) && Object.isFrozen(DEFAULT_SPANS));
});

test('dormantPromises: reports active and parked promises at their spans, sorted by id; skips the rest', () => {
  const promise = (id, data = {}) => [id, { id, kind: 'promise', name: id, aliases: [], data, body: '' }];
  const entities = new Map([promise('p-next', { horizon: 'next' }), promise('p-core', { core: true }), promise('p-parked'),
    promise('p-done', { horizon: 'next' }), promise('p-unplanted', { horizon: 'next' }), ['hero', { id: 'hero', kind: 'character', data: {} }]]);
  const w = work({ entities });
  const events = [
    ev('planted', 'e1', 'p-next'), ev(PROMISE_MENTION, 'e3', 'p-next'),
    ev('planted', 'e1', 'p-core'),
    ev('planted', 'e1', 'p-parked'), ev('parked', 'e2', 'p-parked'),
    ev('planted', 'e1', 'p-done'), ev('resolved', 'e2', 'p-done'),
    ev('advanced', 'e1', 'p-unplanted'),
    ev('planted', 'e1', 'hero'),
  ];
  const out = dormantPromises({ work: w, events, atNodeId: 'e4' });
  assert.deepEqual(out, [{ entityId: 'p-next', code: 'PROMISE_DORMANT', stage: 'planted', lastMovedAt: 'e1', distance: 3, span: 2 }]);
  const tight = dormantPromises({ work: w, events, atNodeId: 'e4', defaults: { core: 3, other: 10, parked: 2 } });
  assert.deepEqual(tight.map((d) => [d.entityId, d.code, d.distance, d.span]), [
    ['p-core', 'PROMISE_DORMANT', 3, 3], ['p-next', 'PROMISE_DORMANT', 3, 2], ['p-parked', 'PROMISE_PARKED_LONG', 2, 2],
  ]);
  assert.deepEqual(dormantPromises({ work: w, events, atNodeId: 'x1' }), [], 'an unordered node reports nothing');
});
