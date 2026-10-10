import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimSupported } from '../../packs/sources/checkers/claim-supported.js';
import { numbersMatch } from '../../packs/sources/checkers/numbers-match.js';
import { lowReliability } from '../../packs/sources/checkers/low-reliability.js';
import { numbersIn } from '../../packs/sources/checkers/claims.js';

const work = {
  sources: new Map([['a', { id: 'a', reliability: 'low' }], ['b', { id: 'b', reliability: ' LOW ' }], ['c', { id: 'c', reliability: 'high' }], ['d', { id: 'd', reliability: null }], ['e', { id: 'e', reliability: '낮음' }]]),
};
const link = (sourceId, quote = '인용 문장') => ({ sourceId, quote });

test('claim-supported: a claim with no confirmed source is flagged with its quote, without a severity', () => {
  const ctx = { work, claims: [{ quote: '근거 없는 주장', sources: [] }, { quote: '근거 있는 주장', sources: [link('c')] }] };
  const findings = claimSupported(ctx);
  assert.deepEqual(findings.map((f) => [f.code, f.quote, f.severity ?? null]), [['CLAIM_UNSUPPORTED', '근거 없는 주장', null]]);
  assert.match(findings[0].message, /근거 없는 주장/);
  assert.deepEqual(claimSupported({ work }), []);
  assert.deepEqual(claimSupported({ work, claims: [null, 'x', { quote: 3, sources: [] }, { quote: 'q' }] }), []);
});

test('numbersIn reads Arabic digits and years, drops thousands commas and leading zeros, and reads full-width digits', () => {
  assert.deepEqual(numbersIn('1905년 7월 07일, 인구 1,000명, 비율 3.5%, ２０２６년'), ['1905', '7', '1000', '3.5', '2026']);
  assert.deepEqual(numbersIn('숫자 없음'), []);
  assert.deepEqual(numbersIn(undefined), []);
});

test('numbers-match: a number or year in the claim that no linked source quote carries is flagged; unsupported claims are left to claim-supported', () => {
  const ctx = {
    work,
    claims: [
      { quote: '세포는 1665년에 처음 관찰됐다', sources: [link('c', '로버트 훅이 1665년에 세포를 관찰했다')] },
      { quote: '세포는 1666년에 37조 개다', sources: [link('c', '1665년'), link('d', '사람 몸의 세포는 약 37조 개다')] },
      { quote: '2천 개가 1,000개보다 많다', sources: [link('c', '1000개')] },
      { quote: '1999년 주장', sources: [] },
      null,
    ],
  };
  const findings = numbersMatch(ctx);
  assert.deepEqual(findings.map((f) => [f.code, f.quote, f.numbers, f.severity ?? null]), [
    ['NUMBER_NOT_IN_SOURCE', '세포는 1666년에 37조 개다', ['1666'], null],
    ['NUMBER_NOT_IN_SOURCE', '2천 개가 1,000개보다 많다', ['2'], null],
  ]);
  assert.match(findings[0].message, /1666/);
});

test('reliability: a claim that leans only on low-reliability sources is flagged; one other or unknown source clears it', () => {
  const ctx = {
    work,
    claims: [
      { quote: '낮은 자료만', sources: [link('a'), link('b', '다른 인용'), link('a', '또 다른 인용')] },
      { quote: '섞인 자료', sources: [link('a'), link('c')] },
      { quote: '모르는 신뢰도', sources: [link('d')] },
      { quote: '한국어 표기', sources: [link('e')] },
      { quote: '없는 자료', sources: [link('ghost')] },
      { quote: '근거 없음', sources: [] },
    ],
  };
  const findings = lowReliability(ctx);
  assert.deepEqual(findings.map((f) => [f.code, f.quote, f.sources, f.severity ?? null]), [['LOW_RELIABILITY_ONLY', '낮은 자료만', ['a', 'b'], null]]);
  assert.deepEqual(lowReliability({ claims: [{ quote: 'x', sources: [link('a')] }] }), []);
});
