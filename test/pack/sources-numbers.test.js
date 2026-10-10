import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberMatches, numbersIn } from '../../packs/sources/checkers/claims.js';
import { numbersMatch } from '../../packs/sources/checkers/numbers-match.js';
import { loadBuiltinPacks } from '../../packs/index.js';

const link = (quote) => ({ sourceId: 'facts', quote });

test('numbersIn no longer turns symbols into digits: ㎡, ², ①, ㎞ are not numbers; full-width digits still are', () => {
  assert.deepEqual(numbersIn('면적 30㎡, 제곱 m², ① 항목, 약 5㎞, ２０２６년'), ['30', '5', '2026']);
  assert.deepEqual(numbersIn('①②③'), []);
  assert.deepEqual(numbersIn('３．５%'), ['3.5']);
});

test('numbersIn splits dates and lists, and reads trailing decimal zeros as the same value', () => {
  assert.deepEqual(numbersIn('2026.09.30 발표, 판 10.0.1'), ['2026', '9', '30', '10', '0', '1']);
  assert.deepEqual(numbersIn('1,2,3단계'), ['1', '2', '3']);
  assert.deepEqual(numbersIn('1.50배, 2.0배, 0.50, 1,000.50원'), ['1.5', '2', '0.5', '1000.5']);
  assert.deepEqual(numbersIn('1,000명과 12,345,678원'), ['1000', '12345678']);
});

test('numbersIn and numberMatches read only strings; numberMatches gives where each run of digits ends', () => {
  assert.deepEqual([numbersIn(undefined), numbersIn(5), numbersIn(Object.create(null))], [[], [], []]);
  assert.deepEqual(numberMatches('매출 30억 원, 2026.09.30'), [
    { value: '30', end: 5 }, { value: '2026', end: 20 }, { value: '9', end: 20 }, { value: '30', end: 20 },
  ]);
});

test('numbers-match: dates, symbols and 1.50 against 1.5 no longer raise false findings; a real mismatch still does', () => {
  const claims = [
    { quote: '2026.09.30에 30㎡ 매장을 열었다', sources: [link('2026년 9월 30일 30제곱미터 매장 개점')] },
    { quote: '가격은 1.50배다', sources: [link('가격이 1.5배 올랐다')] },
    { quote: '① 고객 1,200곳', sources: [link('고객사는 1,100곳이다')] },
    { quote: '이상한 연결', sources: [null, { sourceId: 'facts', quote: Object.create(null) }] },
  ];
  assert.deepEqual(numbersMatch({ claims }).map((f) => [f.code, f.quote, f.numbers]), [
    ['NUMBER_NOT_IN_SOURCE', '① 고객 1,200곳', ['1200']],
  ]);
});

test('the sources pack version is 2: changed helper rules change the pack digest', async () => {
  assert.equal((await loadBuiltinPacks()).get('sources').version, 2);
});
