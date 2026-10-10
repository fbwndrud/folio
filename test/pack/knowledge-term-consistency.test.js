import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termConsistency } from '../../packs/knowledge/checkers/term-consistency.js';

const entity = (id, name, avoid, aliases = []) => [id, { id, kind: 'term', name, aliases, data: avoid ? { avoid } : {} }];
const work = { entities: new Map([entity('membrane', '세포막', ['세포 막', '셀 멤브레인']), entity('atp', '아데노신 삼인산', ['아데노신'], ['ATP']), entity('cell', '세포')]) };
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.quote, f.severity ?? null]);

test('term-consistency: an avoided spelling in the prose is flagged with the spelling as the quote, without a severity', () => {
  const findings = termConsistency({ work, draft: '세포 막은 경계다. 세포 막을 지나는 물질이 있다. 셀 멤브레인이라고도 한다.' });
  assert.deepEqual(codes(findings), [['TERM_AVOIDED', 'membrane', '세포 막', null], ['TERM_AVOIDED', 'membrane', '셀 멤브레인', null]]);
  assert.match(findings[0].message, /2번/);
});

test('term-consistency: spellings inside code fences are ignored, an unclosed fence runs to the end', () => {
  const fenced = ['세포막은 경계다.', '```text', '세포 막', '```', '~~~', '셀 멤브레인', '~~~'].join('\n');
  assert.deepEqual(termConsistency({ work, draft: fenced }), []);
  assert.deepEqual(termConsistency({ work, draft: '세포막.\n```\n세포 막' }), []);
  assert.deepEqual(codes(termConsistency({ work, draft: '세포 막 ```\n안' })), [['TERM_AVOIDED', 'membrane', '세포 막', null]]);
});

test('term-consistency: an avoided spelling inside the entity\'s own name or alias is not counted; NFD text still matches', () => {
  assert.deepEqual(termConsistency({ work, draft: '아데노신 삼인산(ATP)은 화폐다.' }), []);
  assert.deepEqual(codes(termConsistency({ work, draft: '아데노신은 화폐다.' })), [['TERM_AVOIDED', 'atp', '아데노신', null]]);
  assert.deepEqual(codes(termConsistency({ work, draft: '세포 막은 경계다.'.normalize('NFD') })), [['TERM_AVOIDED', 'membrane', '세포 막', null]]);
});

test('term-consistency: no avoid list or no draft give nothing; blank entries are silently ignored but non-string entries are TERM_AVOID_INVALID', () => {
  // Ruling (fix round 1): blank/whitespace-only avoid entries stay silently ignored, but a non-string
  // entry (3, null) is now a config error (TERM_AVOID_INVALID), not a silent no-op. This changes the
  // plan's original expectation of [] for the `odd` entity from "nothing" to two invalid findings.
  const odd = { entities: new Map([entity('x', '엑스', ['', '  ', 3, null])]) };
  assert.deepEqual(codes(termConsistency({ work: odd, draft: '엑스  3' })), [
    ['TERM_AVOID_INVALID', 'x', '3', null],
    ['TERM_AVOID_INVALID', 'x', 'null', null],
  ]);
  assert.deepEqual(termConsistency({ work }), []);
  assert.throws(() => termConsistency({ draft: '세포 막' }), TypeError);
});

test('term-consistency: avoid forms are trimmed and de-duplicated after trimming (fix round 1, ruling 1)', () => {
  const w = { entities: new Map([entity('m', '세포막', [' 세포 막 ', '세포 막'])]) };
  assert.deepEqual(codes(termConsistency({ work: w, draft: '그 세포 막.' })), [
    ['TERM_AVOIDED', 'm', '세포 막', null],
  ]);
});

test('term-consistency: an avoid form that contains a short alias is still flagged (containment, not masking — ruling 2)', () => {
  const w = { entities: new Map([entity('m', '세포막', ['세포 막'], ['막'])]) };
  assert.deepEqual(codes(termConsistency({ work: w, draft: '세포 막을 본다.' })), [
    ['TERM_AVOIDED', 'm', '세포 막', null],
  ]);
});

test('term-consistency: an avoid form fully inside another entity\'s own name is not flagged (ruling 2)', () => {
  const w = { entities: new Map([
    entity('atp', '아데노신 삼인산', ['아데노신'], ['ATP']),
    entity('adp', '아데노신 이인산', [], ['ADP']),
  ]) };
  assert.deepEqual(termConsistency({ work: w, draft: '아데노신 이인산(ADP)은 화폐다.' }), []);
});

test('term-consistency: TERM_AVOID_INVALID for a non-array avoid, non-string entries, or a form equal to the entity\'s own name/alias (ruling 3)', () => {
  const scalar = { entities: new Map([['s', { id: 's', name: '스칼라', aliases: [], data: { avoid: '통짜문자열' } }]]) };
  assert.deepEqual(codes(termConsistency({ work: scalar, draft: '아무 글' })), [
    ['TERM_AVOID_INVALID', 's', '통짜문자열', null],
  ]);

  const nonString = { entities: new Map([['n', { id: 'n', name: '엔', aliases: [], data: { avoid: [{}, 5] } }]]) };
  assert.deepEqual(codes(termConsistency({ work: nonString, draft: '아무 글' })), [
    ['TERM_AVOID_INVALID', 'n', '[object Object]', null],
    ['TERM_AVOID_INVALID', 'n', '5', null],
  ]);

  const selfName = { entities: new Map([['y', { id: 'y', name: '엑스', aliases: ['엑스별칭'], data: { avoid: ['엑스', '엑스별칭'] } }]]) };
  assert.deepEqual(codes(termConsistency({ work: selfName, draft: '엑스도 엑스별칭도 있다' })), [
    ['TERM_AVOID_INVALID', 'y', '엑스', null],
    ['TERM_AVOID_INVALID', 'y', '엑스별칭', null],
  ]);
});

// 최종 리뷰 Minor 3: avoid 표기가 다른 엔티티의 이름·별칭과 같으면 이름 스캔이 항상 가려 TERM_AVOIDED 가 결코 뜨지 않는다
// (조용한 무력화). 자기 것과 마찬가지로 TERM_AVOID_INVALID 로 알린다.
test('term-consistency: an avoid form equal to ANOTHER entity\'s name or alias is TERM_AVOID_INVALID, since it could never be flagged', () => {
  const w = { entities: new Map([
    entity('membrane', '세포막', ['세포']),
    entity('cell', '세포'),
  ]) };
  assert.deepEqual(codes(termConsistency({ work: w, draft: '세포는 생명의 단위다. 세포막은 경계다.' })), [
    ['TERM_AVOID_INVALID', 'membrane', '세포', null],
  ]);
});

test('term-consistency: a 4-space indented fence marker is not a fence (fences.js needs 0-3 leading spaces, ruling 4)', () => {
  const draft = '    ```\n세포 막';
  assert.deepEqual(codes(termConsistency({ work, draft })), [
    ['TERM_AVOIDED', 'membrane', '세포 막', null],
  ]);
});

test('term-consistency: a CRLF fence masks its content the same as an LF fence (ruling 4)', () => {
  const draft = ['세포막.', '```text', '세포 막', '```', '뒤 세포 막'].join('\r\n');
  assert.deepEqual(codes(termConsistency({ work, draft })), [
    ['TERM_AVOIDED', 'membrane', '세포 막', null],
  ]);
});

test('term-consistency: a shorter closing fence does not close a longer opener; masking runs to the end (ruling 4)', () => {
  const draft = ['````', '세포 막', '```', '뒤 세포 막'].join('\n');
  assert.deepEqual(termConsistency({ work, draft }), []);
});
