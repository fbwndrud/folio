import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promiseEvidence, PROMISE_EVIDENCE_DEFAULTS } from '../../packs/novel/checkers/promise-evidence.js';
import { promiseFlow } from '../../packs/novel/checkers/promise-flow.js';
import { promiseDormant, PROMISE_DORMANT_DEFAULTS } from '../../packs/novel/checkers/promise-dormant.js';
import { computePositions } from '../../core/store/position.js';
import { validateWorkConfig } from '../../core/work/config.js';

const codes = (findings) => findings.map((f) => [f.code, f.entityId ?? null]);
const ev = (kind, nodeId = 'e1', extra = {}) => ({ entityId: 'key', kind: `promise.${kind}`, nodeId, ...extra });
const promiseEntity = (data = {}) => ({ id: 'key', kind: 'promise', name: '열쇠의 비밀', aliases: [], data, body: '' });
const entitiesWith = (data) => new Map([['key', promiseEntity(data)], ['doyun', { id: 'doyun', kind: 'character', name: '도윤', aliases: [], data: {}, body: '' }]]);

test('promise-evidence: a resolved promise needs a quote of 8+ code points found in the squashed draft', () => {
  const draft = '상자 안에는\n  아버지의 편지가 들어 있었다. 도윤은 울었다.';
  const work = { entities: entitiesWith() };
  const ok = ev('resolved', 'e1', { quote: '상자 안에는 아버지의 편지가' });
  assert.deepEqual(promiseEvidence({ draft, draftEvents: [ok], work }), []);
  for (const quote of [undefined, '', '편지가 들어', '없는 문장이 인용됐다']) {
    const out = promiseEvidence({ draft, draftEvents: [ev('resolved', 'e1', quote === undefined ? {} : { quote })], work });
    assert.deepEqual(codes(out), [['PROMISE_RESOLVED_WITHOUT_EVIDENCE', 'key']], String(quote));
    assert.equal(out[0].severity, undefined);
  }
  // 다른 단계와 약속이 아닌 엔티티는 보지 않는다.
  assert.deepEqual(promiseEvidence({ draft, draftEvents: [ev('advanced'), { entityId: 'doyun', kind: 'promise.resolved' }], work }), []);
});

test('promise-evidence: minQuote comes from config; tolerates empty ctx', () => {
  const draft = '편지가 들어 있었다.';
  const short = [ev('resolved', 'e1', { quote: '편지가 들어' })];
  assert.equal(promiseEvidence({ draft, draftEvents: short }).length, 1);
  assert.deepEqual(promiseEvidence({ draft, draftEvents: short }, { minQuote: 5 }), []);
  assert.equal(PROMISE_EVIDENCE_DEFAULTS.minQuote, 8);
  assert.deepEqual(promiseEvidence({}), []);
});

test('promise-evidence: bad config is reported with exactly one CONFIG_INVALID', () => {
  const draft = '편지가 들어 있었다.';
  const short = [ev('resolved', 'e1', { quote: '편지가 들어' })];
  for (const config of [{ minQuote: 0 }, { minQuote: 2.5 }, { minquote: 3 }]) {
    const out = promiseEvidence({ draft, draftEvents: short }, config);
    assert.deepEqual(codes(out), [['PROMISE_EVIDENCE_CONFIG_INVALID', null]], JSON.stringify(config));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, undefined);
    assert.equal(out[0].message.includes('설정이 잘못'), true);
  }
});

test('promise-flow: events on a closed promise are reported, except reopened and resolved', () => {
  const prior = [ev('planted'), ev('closed', 'e2')];
  const draft = '도윤은 다시 열쇠를 꺼냈다.';
  const draftEvents = [ev('advanced', 'e3', { quote: '다시 열쇠를 꺼냈다' }), ev('mentioned', 'e3'), ev('resolved', 'e3')];
  const out = promiseFlow({ draft, priorEvents: prior, draftEvents, work: { entities: entitiesWith() } });
  assert.deepEqual(codes(out), [['PROMISE_EVENT_AFTER_CLOSE', 'key'], ['PROMISE_EVENT_AFTER_CLOSE', 'key']]);
  assert.equal(out[0].quote, '다시 열쇠를 꺼냈다');
  assert.equal(out[1].quote, undefined);
  assert.match(out[1].message, /mentioned/);
  assert.ok(out.every((f) => f.severity === undefined));
  // 다시 열면 뒤 사건은 괜찮다.
  assert.deepEqual(promiseFlow({ priorEvents: prior, draftEvents: [ev('reopened', 'e3'), ev('advanced', 'e3')] }), []);
  assert.deepEqual(promiseFlow({ priorEvents: [...prior, ev('reopened', 'e3')], draftEvents: [ev('mentioned', 'e4')] }), []);
});

test('promise-flow: mentioning a promise never planted is reported; prior events of other entities are ignored', () => {
  const out = promiseFlow({ priorEvents: [{ ...ev('planted'), entityId: 'other' }], draftEvents: [ev('mentioned', 'e2')] });
  assert.deepEqual(codes(out), [['PROMISE_MENTIONED_BEFORE_PLANT', 'key']]);
  // 심은 뒤의 언급, 이 원고가 먼저 심은 뒤의 언급은 괜찮다.
  assert.deepEqual(promiseFlow({ priorEvents: [ev('planted')], draftEvents: [ev('mentioned', 'e2')] }), []);
  assert.deepEqual(promiseFlow({ draftEvents: [ev('planted', 'e2'), ev('mentioned', 'e2')] }), []);
  // 심기 전 단계 사건은 core.promise-order 의 일이다.
  assert.deepEqual(promiseFlow({ draftEvents: [ev('advanced', 'e2')] }), []);
  // 약속이 아닌 엔티티의 promise.* 사건은 보지 않는다.
  assert.deepEqual(promiseFlow({ draftEvents: [{ entityId: 'doyun', kind: 'promise.mentioned' }], work: { entities: entitiesWith() } }), []);
  assert.deepEqual(promiseFlow({}), []);
});

/** 아크 a1 아래 회차 e1..eN 인 합성 작품. */
function serialWork(data = {}, leaves = 12) {
  const ids = Array.from({ length: leaves }, (_, i) => `e${i + 1}`);
  const node = (id, kind, extra) => ({ id, level: kind === 'leaf' ? 'episode' : 'arc', role: 'body', status: 'draft', kind, data: {}, body: '', ...extra });
  const nodes = new Map([['a1', node('a1', 'branch', { parentId: null, children: ids })], ...ids.map((id) => [id, node(id, 'leaf', { parentId: 'a1', children: [] })])]);
  const tree = { nodes, rootIds: ['a1'] };
  const { config, errors } = validateWorkConfig({ levels: [{ name: 'arc' }, { name: 'episode', leaf: true }] });
  assert.deepEqual(errors, []);
  return { tree, positions: computePositions(tree, config), entities: entitiesWith(data) };
}

test('promise-dormant: an unpaid promise quiet for the default span (10 leaves) is reported with distance and span', () => {
  const work = serialWork();
  const priorEvents = [ev('planted', 'e1'), ev('mentioned', 'e5')];
  assert.deepEqual(promiseDormant({ work, nodeId: 'e10', priorEvents, draftEvents: [] }), []);
  const out = promiseDormant({ work, nodeId: 'e11', priorEvents, draftEvents: [] });
  assert.deepEqual(codes(out), [['PROMISE_DORMANT', 'key']]);
  assert.match(out[0].message, /읽는 순서로 10칸째/);
  assert.match(out[0].message, /기준 10칸/);
  assert.equal(out[0].severity, undefined);
});

test('promise-dormant: movement in this draft clears dormancy; a mention does not', () => {
  const work = serialWork();
  const priorEvents = [ev('planted', 'e1')];
  assert.deepEqual(promiseDormant({ work, nodeId: 'e11', priorEvents, draftEvents: [{ entityId: 'key', kind: 'promise.advanced' }] }), []);
  assert.equal(promiseDormant({ work, nodeId: 'e11', priorEvents, draftEvents: [{ entityId: 'key', kind: 'promise.mentioned' }] }).length, 1);
});

test('promise-dormant: resolved and closed promises are not reported', () => {
  const work = serialWork();
  for (const end of ['resolved', 'closed']) {
    assert.deepEqual(promiseDormant({ work, nodeId: 'e12', priorEvents: [ev('planted', 'e1'), ev(end, 'e2')] }), [], end);
  }
});

test('promise-dormant: horizon next is 2, core is 8, parked reports PROMISE_PARKED_LONG at 10', () => {
  const next = serialWork({ horizon: ' Next ' });
  assert.deepEqual(promiseDormant({ work: next, nodeId: 'e2', priorEvents: [ev('planted', 'e1')] }), []);
  assert.deepEqual(codes(promiseDormant({ work: next, nodeId: 'e3', priorEvents: [ev('planted', 'e1')] })), [['PROMISE_DORMANT', 'key']]);
  const core = serialWork({ core: true });
  assert.deepEqual(promiseDormant({ work: core, nodeId: 'e8', priorEvents: [ev('planted', 'e1')] }), []);
  assert.equal(promiseDormant({ work: core, nodeId: 'e9', priorEvents: [ev('planted', 'e1')] }).length, 1);
  const parked = [ev('planted', 'e1'), ev('parked', 'e2')];
  assert.deepEqual(promiseDormant({ work: serialWork(), nodeId: 'e11', priorEvents: parked }), []);
  const out = promiseDormant({ work: serialWork(), nodeId: 'e12', priorEvents: parked });
  assert.deepEqual(codes(out), [['PROMISE_PARKED_LONG', 'key']]);
  assert.match(out[0].message, /미뤄 둔/);
});

test('promise-dormant: partial config merges over defaults; tolerates missing work or node', () => {
  const work = serialWork();
  const priorEvents = [ev('planted', 'e1')];
  assert.equal(promiseDormant({ work, nodeId: 'e4', priorEvents }, { defaults: { other: 3 } }).length, 1);
  assert.deepEqual(promiseDormant({ work, nodeId: 'e4', priorEvents }, { spans: { soon: 1 } }), []);
  const soon = serialWork({ horizon: 'soon' });
  assert.equal(promiseDormant({ work: soon, nodeId: 'e3', priorEvents }, { spans: { soon: 2 } }).length, 1);
  assert.equal(PROMISE_DORMANT_DEFAULTS.defaults.parked, 10);
  assert.deepEqual(promiseDormant({}), []);
  assert.deepEqual(promiseDormant({ work, priorEvents }), []);
});

test('promise-dormant: bad config is reported with exactly one CONFIG_INVALID', () => {
  const work = serialWork();
  const priorEvents = [ev('planted', 'e1')];
  for (const config of [
    { defaults: { other: 'ten' } },
    { defaults: { other: 0 } },
    { span: {} },
    { defaults: { odd: 3 } },
  ]) {
    const out = promiseDormant({ work, nodeId: 'e2', priorEvents }, config);
    assert.deepEqual(codes(out), [['PROMISE_DORMANT_CONFIG_INVALID', null]], JSON.stringify(config));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, undefined);
    assert.equal(out[0].message.includes('설정이 잘못'), true);
  }
});
