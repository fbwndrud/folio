import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannedPhrases } from '../../packs/brand/checkers/banned-phrases.js';
import { figureUnits } from '../../packs/brand/checkers/figure-units.js';
import { loadBuiltinPacks } from '../../packs/index.js';

const config = { words: ['최고', '보장', '1위', '100%'], allow: ['최고경영자'] };

test('banned-phrases: each listed phrase in the draft is flagged once with its count, without a severity', () => {
  const findings = bannedPhrases({ draft: '업계 최고 품질을 보장합니다. 최고의 선택, 만족 100%입니다.' }, config);
  assert.deepEqual(findings.map((f) => [f.code, f.quote, f.count, f.severity ?? null]), [
    ['BANNED_PHRASE', '최고', 2, null], ['BANNED_PHRASE', '보장', 1, null], ['BANNED_PHRASE', '100%', 1, null],
  ]);
  assert.match(findings[0].message, /"최고"\(2번\)/);
});

test('banned-phrases: an allowed phrase covers its own letters only', () => {
  assert.deepEqual(bannedPhrases({ draft: '최고경영자가 설명합니다.' }, config), []);
  assert.deepEqual(bannedPhrases({ draft: '최고경영자가 최고라고 말합니다.' }, config).map((f) => [f.quote, f.count]), [['최고', 1]]);
});

test('banned-phrases: text is compared in NFC; bad config entries and a missing draft are skipped', () => {
  const decomposed = '최고'.normalize('NFD');
  assert.deepEqual(bannedPhrases({ draft: `${decomposed} 제품` }, config).map((f) => f.quote), ['최고']);
  assert.deepEqual(bannedPhrases({ draft: '최고 제품' }, { words: [decomposed, '', 3, null], allow: 'x' }).map((f) => f.quote), ['최고']);
  assert.deepEqual(bannedPhrases({}, config), []);
  assert.deepEqual(bannedPhrases({ draft: '최고' }), []);
});

test('banned-phrases: a phrase that starts with a digit does not match right after another digit (half- and full-width)', () => {
  const at = (draft, cfg = config) => bannedPhrases({ draft }, cfg).map((f) => [f.quote, f.count]);
  assert.deepEqual(at('업계 11위, 성장률 1100%'), []);
  assert.deepEqual(at('업계 1위'), [['1위', 1]]);
  assert.deepEqual(at('1위'), [['1위', 1]]);
  assert.deepEqual(at('(1위)'), [['1위', 1]]);
  assert.deepEqual(at('만족 100%'), [['100%', 1]]);
  assert.deepEqual(at('11위와 1위, 21위'), [['1위', 1]]);
  assert.deepEqual(at('１1위'), []);
  assert.deepEqual(at('１１위와 １위', { words: ['１위'] }), [['１위', 1]]);
  assert.deepEqual(at('최고1최고'), [['최고', 2]]);
});

const UNITS = { '%': ['%', '퍼센트'], 억: ['억'], 원: ['원'], 개: ['개'], 개월: ['개월'], 곳: ['곳'], 일: ['일'] };
const link = (quote) => ({ sourceId: 'facts', quote });

test('figure-units: a number the source carries only with another unit is flagged; unit spellings and one space are read', () => {
  const claims = [
    { quote: '2025년 매출은 30% 늘었다', sources: [link('2025년 매출은 30억 원 늘었다')] },
    { quote: '2개월 걸렸다', sources: [link('2개 제품을 냈다')] },
    { quote: '매출은 30억 원 늘었다', sources: [link('매출은 30억원 늘었다')] },
    { quote: '30퍼센트 성장', sources: [link('30 % 성장')] },
  ];
  const findings = figureUnits({ claims }, { units: UNITS });
  assert.deepEqual(findings.map((f) => [f.code, f.quote, f.figures, f.severity ?? null]), [
    ['UNIT_NOT_IN_SOURCE', '2025년 매출은 30% 늘었다', [{ number: '30', unit: '%', sourceUnits: ['억'] }], null],
    ['UNIT_NOT_IN_SOURCE', '2개월 걸렸다', [{ number: '2', unit: '개월', sourceUnits: ['개'] }], null],
  ]);
  assert.match(findings[0].message, /30%\(자료: 30억\)/);
});

test('figure-units: a missing number, a unitless source number, split dates and unsupported claims are left alone', () => {
  const claims = [
    { quote: '고객 1,200곳', sources: [link('고객 1,100곳')] },
    { quote: '30% 성장', sources: [link('성장률 30, 이익 30억')] },
    { quote: '2026.09.30일 개점', sources: [link('2026년 9월 30일 개점')] },
    { quote: '근거 없는 30%', sources: [] },
    { quote: '이상한 연결 30%', sources: [null, { sourceId: 'facts', quote: 3 }] },
  ];
  assert.deepEqual(figureUnits({ claims }, { units: UNITS }), []);
  assert.deepEqual(figureUnits({ claims: [{ quote: '30% 성장', sources: [link('30억')] }] }), []);
  assert.deepEqual(figureUnits({ claims: [{ quote: '30% 성장', sources: [link('30억')] }] }, { units: { '%': 'x', 억: [3, ''] } }), []);
});

test('figure-units: full-width and upper-case percent spellings from the pack config read as the same unit', async () => {
  const packs = await loadBuiltinPacks();
  const config = packs.get('brand').checks.find((c) => c.id === 'brand.figure-units').config;
  const claims = [
    { quote: '１０％ 성장', sources: [link('매출 10억 증가')] },
    { quote: '3%P 상승', sources: [link('3%p 상승')] },
    { quote: '3％p 상승', sources: [link('3%포인트 상승')] },
  ];
  const findings = figureUnits({ claims }, config);
  assert.deepEqual(findings.map((f) => [f.code, f.quote, f.figures]), [
    ['UNIT_NOT_IN_SOURCE', '１０％ 성장', [{ number: '10', unit: '%', sourceUnits: ['억'] }]],
  ]);
});
