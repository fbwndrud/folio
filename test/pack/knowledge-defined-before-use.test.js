import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definedBeforeUse } from '../../packs/knowledge/checkers/defined-before-use.js';
import { draftDefinitions } from '../../packs/knowledge/checkers/definitions.js';

const entity = (id, kind, name, extra = {}) => [id, { id, kind, name, aliases: [], data: {}, ...extra }];
const work = {
  entities: new Map([
    entity('cell', 'term', '세포'), entity('atp', 'term', 'ATP', { aliases: ['아데노신삼인산'] }),
    entity('diffusion', 'concept', '확산'), entity('ex-1', 'example', '예제 1'), entity('energy-detail', 'promise', '에너지 장에서 자세히'),
    entity('foo', 'term', 'Foo', { aliases: [' '] }),
  ]),
};
const defined = (entityId, quote) => ({ entityId, kind: 'term.defined', ...(quote === undefined ? {} : { quote }) });
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.severity ?? null]);
const DRAFT = '세포는 생명의 단위다. ATP는 세포가 쓰는 에너지 화폐다. 확산이 일어난다.';

test('defined-before-use: a concept or term used here with no earlier and no quoted definition is flagged, without a severity', () => {
  const ctx = { work, entityIds: ['atp', 'cell', 'diffusion', 'energy-detail', 'ex-1'], priorEvents: [], draftEvents: [], draft: DRAFT };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null], ['USED_BEFORE_DEFINED', 'cell', null], ['USED_BEFORE_DEFINED', 'diffusion', null]]);
  assert.match(definedBeforeUse(ctx)[0].message, /ATP\(atp\)/);
});

test('defined-before-use: an earlier term.defined event or a quoted definition in this draft clears it', () => {
  const ctx = {
    work, entityIds: ['atp', 'cell', 'diffusion'], draft: DRAFT,
    priorEvents: [{ ...defined('cell'), nodeId: 'intro', eventId: 'ev-1' }],
    draftEvents: [defined('atp', 'ATP는 세포가 쓰는 에너지 화폐다'), defined('diffusion', '확산이 일어난다')],
  };
  assert.deepEqual(definedBeforeUse(ctx), []);
});

test('defined-before-use: a definition without a quote, with a quote not in the draft, or quoting a sentence without the name does not count', () => {
  for (const quote of [undefined, '', ' ', 'A', '없는 문장이다', '세포는 생명의 단위다']) {
    const ctx = { work, entityIds: ['atp'], priorEvents: [], draft: DRAFT, draftEvents: [defined('atp', quote)] };
    assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null]], String(quote));
  }
  // 별칭도 이름이다
  const alias = { work, entityIds: ['atp'], priorEvents: [], draft: '아데노신삼인산은 에너지 화폐다.', draftEvents: [defined('atp', '아데노신삼인산은 에너지 화폐다')] };
  assert.deepEqual(definedBeforeUse(alias), []);
});

test('defined-before-use: term.redefined, other kinds and unknown ids are not definitions', () => {
  const ctx = {
    work, entityIds: ['atp', 'ghost'], draft: DRAFT, priorEvents: [{ entityId: 'atp', kind: 'term.redefined' }],
    draftEvents: [{ entityId: 'atp', kind: 'term.redefined', quote: 'ATP는 세포가 쓰는 에너지 화폐다' }],
  };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null]]);
});

test('draftDefinitions keeps the earliest quoted position per entity, comparing in NFC', () => {
  const draft = 'ATP는 화폐다. 다시, ATP는 화폐다.'.normalize('NFD');
  const map = draftDefinitions({ work, draft, draftEvents: [defined('atp', '다시, ATP는 화폐다'), defined('atp', 'ATP는 화폐다')] });
  assert.deepEqual([...map], [['atp', 0]]);
});

test('defined-before-use: a bare-name quote or a name plus one particle does not count as a definition', () => {
  const draft = '세포는 생명의 단위다. 세포.';
  for (const quote of ['세포', '세포는']) {
    const ctx = { work, entityIds: ['cell'], priorEvents: [], draft, draftEvents: [defined('cell', quote)] };
    assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'cell', null]], quote);
  }
  // 이름을 지우고도 글자가 남으면 인정한다
  const ctx = { work, entityIds: ['atp'], priorEvents: [], draft: DRAFT, draftEvents: [defined('atp', 'ATP는 세포가 쓰는 에너지 화폐다')] };
  assert.deepEqual(definedBeforeUse(ctx), []);
});

test('defined-before-use: a quote carrying only a different entity\'s name does not count', () => {
  const ctx = { work, entityIds: ['atp'], priorEvents: [], draft: DRAFT, draftEvents: [defined('atp', '확산이 일어난다')] };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null]]);
});

test('defined-before-use: promise.resolved with a quote is not a definition', () => {
  const ctx = {
    work, entityIds: ['atp'], priorEvents: [], draft: DRAFT,
    draftEvents: [{ entityId: 'atp', kind: 'promise.resolved', quote: 'ATP는 세포가 쓰는 에너지 화폐다' }],
  };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null]]);
});

test('defined-before-use: an NFC draft with an NFD quote still counts as a definition', () => {
  const draft = 'ATP는 화폐다.'.normalize('NFC');
  const ctx = { work, entityIds: ['atp'], priorEvents: [], draft, draftEvents: [defined('atp', 'ATP는 화폐다'.normalize('NFD'))] };
  assert.deepEqual(definedBeforeUse(ctx), []);
});

test('defined-before-use: a blank alias does not make a quote containing only whitespace count as the name', () => {
  const ctx = { work, entityIds: ['foo'], priorEvents: [], draft: '주어진 정의 문장 하나.', draftEvents: [defined('foo', '주어진 정의 문장')] };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'foo', null]]);
});

test('defined-before-use: a ctx missing work throws (the core reports CHECK_CRASHED); work without entityIds gives no findings', () => {
  assert.throws(() => definedBeforeUse({}), TypeError);
  assert.throws(() => definedBeforeUse({ entityIds: ['atp'] }), TypeError);
  assert.deepEqual(definedBeforeUse({ work }), []);
});
