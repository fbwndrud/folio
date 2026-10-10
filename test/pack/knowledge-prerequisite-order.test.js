import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prerequisiteOrder } from '../../packs/knowledge/checkers/prerequisite-order.js';

const entity = (id, name, prerequisites) => [id, { id, kind: 'concept', name, aliases: [], data: prerequisites ? { prerequisites } : {} }];
const work = {
  entities: new Map([
    entity('cell', '세포'), entity('membrane', '세포막', ['cell']), entity('diffusion', '확산', ['membrane', 'cell']), entity('osmosis', '삼투', ['ghost']),
  ]),
};
const defined = (entityId, quote) => ({ entityId, kind: 'term.defined', quote });
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.prerequisite, f.severity ?? null]);

test('prerequisite-order: defining X before its prerequisites are defined is flagged', () => {
  const draft = '확산은 물질이 퍼지는 것이다.';
  const findings = prerequisiteOrder({ work, draft, priorEvents: [], draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다')] });
  assert.deepEqual(codes(findings), [['PREREQUISITE_NOT_DEFINED', 'diffusion', 'membrane', null], ['PREREQUISITE_NOT_DEFINED', 'diffusion', 'cell', null]]);
  assert.match(findings[0].message, /세포막\(membrane\)/);
});

test('prerequisite-order: an earlier definition, or a quoted definition earlier in this draft, satisfies a prerequisite', () => {
  const draft = '세포막은 세포의 경계다. 확산은 물질이 퍼지는 것이다.';
  const ctx = {
    work, draft, priorEvents: [{ entityId: 'cell', kind: 'term.defined', nodeId: 'intro', eventId: 'ev-1' }],
    draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다'), defined('membrane', '세포막은 세포의 경계다')],
  };
  assert.deepEqual(prerequisiteOrder(ctx), []);
});

test('prerequisite-order: a prerequisite defined later in the same draft, or only by an unquoted event, does not count', () => {
  const draft = '확산은 물질이 퍼지는 것이다. 세포막은 세포의 경계다.';
  const later = { work, draft, priorEvents: [{ entityId: 'cell', kind: 'term.defined' }], draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다'), defined('membrane', '세포막은 세포의 경계다')] };
  assert.deepEqual(codes(prerequisiteOrder(later)), [['PREREQUISITE_NOT_DEFINED', 'diffusion', 'membrane', null]]);
  const unquoted = { ...later, draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다'), { entityId: 'membrane', kind: 'term.defined' }] };
  assert.deepEqual(codes(prerequisiteOrder(unquoted)), [['PREREQUISITE_NOT_DEFINED', 'diffusion', 'membrane', null]]);
});

test('prerequisite-order: only quoted definitions in this draft trigger it; an unknown prerequisite id is reported', () => {
  assert.deepEqual(prerequisiteOrder({ work, draft: '확산.', priorEvents: [], draftEvents: [{ entityId: 'diffusion', kind: 'term.defined' }] }), []);
  const draft = '삼투는 물이 막을 지나는 것이다.';
  assert.deepEqual(codes(prerequisiteOrder({ work, draft, priorEvents: [], draftEvents: [defined('osmosis', '삼투는 물이 막을 지나는 것이다')] })), [['PREREQUISITE_UNKNOWN', 'osmosis', 'ghost', null]]);
});

test('prerequisite-order: a scalar (non-array) data.prerequisites is reported as PREREQUISITE_INVALID, not silently ignored', () => {
  const scalarWork = { entities: new Map([entity('scalarTerm', '스칼라', 'cell')]) };
  const draft = '스칼라는 정의다.';
  const findings = prerequisiteOrder({ work: scalarWork, draft, priorEvents: [], draftEvents: [defined('scalarTerm', '스칼라는 정의다')] });
  assert.deepEqual(codes(findings), [['PREREQUISITE_INVALID', 'scalarTerm', 'cell', null]]);
});

test('prerequisite-order: non-string or empty-string entries in data.prerequisites are each reported as PREREQUISITE_INVALID', () => {
  const junkWork = { entities: new Map([entity('junkTerm', '쓰레기', [1, '', { bad: true }])]) };
  const draft = '쓰레기는 정의다.';
  const findings = prerequisiteOrder({ work: junkWork, draft, priorEvents: [], draftEvents: [defined('junkTerm', '쓰레기는 정의다')] });
  assert.deepEqual(codes(findings), [
    ['PREREQUISITE_INVALID', 'junkTerm', '1', null],
    ['PREREQUISITE_INVALID', 'junkTerm', '', null],
    ['PREREQUISITE_INVALID', 'junkTerm', '{"bad":true}', null],
  ]);
});

test('prerequisite-order: an object data.prerequisites value is shown with JSON.stringify, not "[object Object]"', () => {
  const scalarObjectWork = { entities: new Map([entity('scalarObj', '스칼라객체', { nope: 1 })]) };
  const draft = '스칼라객체는 정의다.';
  const findings = prerequisiteOrder({ work: scalarObjectWork, draft, priorEvents: [], draftEvents: [defined('scalarObj', '스칼라객체는 정의다')] });
  assert.deepEqual(codes(findings), [['PREREQUISITE_INVALID', 'scalarObj', '{"nope":1}', null]]);
  assert.match(findings[0].message, /\{"nope":1\}/);
});

test('prerequisite-order: an entity listing itself as a prerequisite is reported as PREREQUISITE_INVALID, not PREREQUISITE_NOT_DEFINED', () => {
  const loopWork = { entities: new Map([entity('loop', '루프', ['loop'])]) };
  const draft = '루프는 정의다.';
  const findings = prerequisiteOrder({ work: loopWork, draft, priorEvents: [], draftEvents: [defined('loop', '루프는 정의다')] });
  assert.deepEqual(codes(findings), [['PREREQUISITE_INVALID', 'loop', 'loop', null]]);
});
