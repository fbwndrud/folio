import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cliffhanger, CLIFFHANGER_DEFAULTS } from '../../packs/novel/checkers/cliffhanger.js';
import { timeSkip } from '../../packs/novel/checkers/time-skip.js';
import { lengthShort, countLength, LENGTH_DEFAULTS } from '../../packs/novel/checkers/length.js';
import { infoRestate } from '../../packs/novel/checkers/info-restate.js';
import { sensitive, SENSITIVE_DEFAULTS } from '../../packs/novel/checkers/sensitive.js';
import { TIME_SKIP_MARKERS } from '../../packs/novel/lexicons/time-skip-markers.js';
import { CLIFFHANGER_TRIGGERS } from '../../packs/novel/lexicons/cliffhanger-triggers.js';
import { SENSITIVE_LEXICON } from '../../packs/novel/lexicons/sensitive.js';

const codes = (findings) => findings.map((f) => f.code);
const inDraft = (findings, draft) => findings.filter((f) => f.quote !== undefined)
  .every((f) => f.quote.trim().length >= 2 && draft.includes(f.quote));

/** 아크 a1 아래 회차 e1, e2(마지막), 최상위 아크 a1, a2. */
function tree() {
  const nodes = new Map([
    ['a1', { id: 'a1', parentId: null, children: ['e1', 'e2'] }],
    ['a2', { id: 'a2', parentId: null, children: [] }],
    ['e1', { id: 'e1', parentId: 'a1', children: [] }],
    ['e2', { id: 'e2', parentId: 'a1', children: [] }],
  ]);
  return { nodes, rootIds: ['a1', 'a2'] };
}

// ─── cliffhanger ───

const flat = '서윤은 찻잔을 내려놓았다.\n\n창밖으로 해가 천천히 졌다. 방 안은 조용했다.';

test('cliffhanger: a last paragraph with no trigger is flagged, quoting that paragraph', () => {
  const out = cliffhanger({ draft: flat });
  assert.deepEqual(codes(out), ['CLIFFHANGER_MISSING']);
  assert.equal(out[0].quote, '창밖으로 해가 천천히 졌다. 방 안은 조용했다.');
  assert.equal(out[0].severity, undefined);
  assert.ok(inDraft(out, flat));
});

test('cliffhanger: interrogative, unfinished-event and reversal triggers in the last paragraph pass', () => {
  for (const tail of ['그 편지는 누가 보낸 것일까?', '문을 열려는 순간, 불이 꺼졌다.', '하지만 그는 아직 몰랐다.']) {
    assert.deepEqual(cliffhanger({ draft: `서윤은 찻잔을 내려놓았다.\n\n${tail}` }), [], tail);
  }
  // 질문이 마지막 문단 안의 한 줄 끝에만 있어도 된다('m' 플래그, vibelore 와 같다).
  assert.deepEqual(cliffhanger({ draft: '앞 문단.\n\n누구였지?\n방은 조용했다.' }), []);
  // 앞 문단의 표지는 세지 않는다.
  assert.deepEqual(codes(cliffhanger({ draft: '그러나 다음 순간이었다.\n\n방은 조용했다.' })), ['CLIFFHANGER_MISSING']);
});

test('cliffhanger: arc-end only checks the last child of its parent (or the last root)', () => {
  const work = { tree: tree() };
  const cfg = { when: 'arc-end' };
  assert.deepEqual(cliffhanger({ draft: flat, nodeId: 'e1', work }, cfg), []);
  assert.deepEqual(codes(cliffhanger({ draft: flat, nodeId: 'e2', work }, cfg)), ['CLIFFHANGER_MISSING']);
  assert.deepEqual(codes(cliffhanger({ draft: flat, nodeId: 'a2', work }, cfg)), ['CLIFFHANGER_MISSING']);
  assert.deepEqual(cliffhanger({ draft: flat, nodeId: 'a1', work }, cfg), []);
  // 트리에서 찾을 수 없으면 판단하지 않는다.
  assert.deepEqual(cliffhanger({ draft: flat, nodeId: 'zz', work }, cfg), []);
  assert.deepEqual(cliffhanger({ draft: flat }, cfg), []);
  // always(기본)는 위치와 무관하다.
  assert.deepEqual(codes(cliffhanger({ draft: flat, nodeId: 'e1', work }, CLIFFHANGER_DEFAULTS)), ['CLIFFHANGER_MISSING']);
});

test('cliffhanger: empty/missing draft is silent; an unknown when is reported', () => {
  assert.deepEqual(cliffhanger({}), []);
  assert.deepEqual(cliffhanger({ draft: '  \n\n ' }), []);
  assert.deepEqual(codes(cliffhanger({ draft: flat }, { when: 'closing' })), ['CLIFFHANGER_CONFIG_INVALID']);
  assert.equal(CLIFFHANGER_TRIGGERS.length, 39);
});

// ─── time-skip ───

test('time-skip: no marker anywhere is flagged; any marker anywhere passes', () => {
  assert.deepEqual(codes(timeSkip({ draft: flat })), ['NO_TIME_SKIP']);
  assert.deepEqual(timeSkip({ draft: `다음 날 아침이었다.\n\n${flat}` }), []);
  assert.deepEqual(timeSkip({ draft: '어느덧 겨울이 왔다.' }), []);
  assert.deepEqual(timeSkip({ draft: '그렇게 삼일이 지났다.' }), []);
  assert.deepEqual(timeSkip({}), []);
  assert.deepEqual(timeSkip({ draft: '   ' }), []);
  assert.equal(TIME_SKIP_MARKERS.length, 47);
  assert.ok(Object.isFrozen(TIME_SKIP_MARKERS) && Object.isFrozen(TIME_SKIP_MARKERS[0]));
});

// ─── length ───

test('length: no target means no findings', () => {
  assert.deepEqual(lengthShort({ draft: '짧다.' }), []);
  assert.deepEqual(lengthShort({ draft: '짧다.' }, LENGTH_DEFAULTS), []);
});

test('length: below floor(target*0.85) is LENGTH_SHORT; at the floor passes', () => {
  const draft = '가'.repeat(84);
  assert.deepEqual(codes(lengthShort({ draft }, { target: 100 })), ['LENGTH_SHORT']);
  assert.match(lengthShort({ draft }, { target: 100 })[0].message, /84자.*100자.*85자/);
  assert.deepEqual(lengthShort({ draft: '가'.repeat(85) }, { target: 100 }), []);
  // 앞뒤 공백은 세지 않는다.
  assert.deepEqual(codes(lengthShort({ draft: `  ${'가'.repeat(84)}\n\n` }, { target: 100 })), ['LENGTH_SHORT']);
  // 빈 원고는 0으로 잰다. 원고가 없으면 넘어간다.
  assert.deepEqual(codes(lengthShort({ draft: '' }, { target: 10 })), ['LENGTH_SHORT']);
  assert.deepEqual(lengthShort({}, { target: 10 }), []);
});

test('length: graphemes count a combined emoji once; chars count UTF-16 code units', () => {
  const family = '👨‍👩‍👧';
  assert.equal(countLength(family, 'graphemes'), 1);
  assert.equal(countLength(family, 'chars'), family.length);
  const draft = family.repeat(10);
  assert.deepEqual(codes(lengthShort({ draft }, { target: 20, unit: 'graphemes' })), ['LENGTH_SHORT']);
  assert.deepEqual(lengthShort({ draft }, { target: 20, unit: 'chars' }), []);
});

test('length: bad target or unit is LENGTH_CONFIG_INVALID', () => {
  for (const cfg of [{ target: 0 }, { target: -5 }, { target: 1.5 }, { target: '3000' }, { target: 100, unit: 'words' }]) {
    assert.deepEqual(codes(lengthShort({ draft: '가' }, cfg)), ['LENGTH_CONFIG_INVALID'], JSON.stringify(cfg));
  }
});

// ─── info-restate ───

const entities = (facts) => new Map(Object.entries(facts).map(([id, list]) => [id, { id, kind: 'place', name: id, aliases: [], data: { facts: list }, body: '' }]));

test('info-restate: a fact phrase appearing 3+ times is flagged with entity and quote', () => {
  const work = { entities: entities({ tower: ['은빛첨탑은 북쪽 절벽에 서 있다.'], river: ['강은 겨울에 언다.'] }) };
  const draft = '은빛첨탑이 보였다. 은빛첨탑까지는 멀었다. 서윤은 은빛첨탑을 올려다보았다.';
  const out = infoRestate({ draft, work });
  assert.deepEqual(out.map((f) => [f.code, f.entityId, f.quote]), [['INFO_RESTATED', 'tower', '은빛첨탑']]);
  assert.ok(inDraft(out, draft));
  assert.match(out[0].message, /3번/);
});

test('info-restate: twice is fine; short phrases and stopwords are ignored', () => {
  const work = { entities: entities({ tower: ['은빛첨탑은 북쪽 절벽에 서 있다.', '그 탑.'] }) };
  assert.deepEqual(infoRestate({ draft: '은빛첨탑이 보였다. 은빛첨탑까지는 멀었다.', work }), []);
  // '탑'(1자)·'북쪽'(2자)은 4자 미만이라 명사구가 아니다.
  assert.deepEqual(infoRestate({ draft: '탑, 탑, 탑. 북쪽, 북쪽, 북쪽.', work }), []);
});

test('info-restate: missing entities, facts or draft are tolerated; non-string facts are skipped', () => {
  assert.deepEqual(infoRestate({ draft: '은빛첨탑 은빛첨탑 은빛첨탑' }), []);
  assert.deepEqual(infoRestate({ work: { entities: entities({ tower: ['은빛첨탑'] }) } }), []);
  const odd = new Map([['x', { id: 'x', data: { facts: [3, null, '은빛첨탑'] } }], ['y', { id: 'y', data: {} }], ['z', { id: 'z' }]]);
  assert.deepEqual(codes(infoRestate({ draft: '은빛첨탑 은빛첨탑 은빛첨탑', work: { entities: odd } })), ['INFO_RESTATED']);
});

// ─── sensitive ───

test('sensitive: adult mode flags soft terms per category and skips allow terms', () => {
  const draft = '"젠장, 늦었어." 그는 마약 거래 장부를 덮었다. 입맞춤은 없었다.';
  const out = sensitive({ draft });
  assert.deepEqual(out.map((f) => [f.code, f.quote]), [['SENSITIVE_PROFANITY', '젠장'], ['SENSITIVE_DRUG_SUBSTANCE', '마약']]);
  assert.ok(out.every((f) => f.severity === undefined));
  assert.ok(inDraft(out, draft));
});

test('sensitive: youth mode adds suggestive terms; minor-adjacent is allowed in both modes', () => {
  const draft = '소년은 입맞춤을 떠올리며 얼굴을 붉혔다.';
  assert.deepEqual(sensitive({ draft }, SENSITIVE_DEFAULTS), []);
  assert.deepEqual(codes(sensitive({ draft }, { mode: 'youth' })), ['SENSITIVE_SEXUAL_SUGGESTIVE']);
});

test('sensitive: notFollowedBy guards drop verb-form collisions but keep real uses', () => {
  assert.deepEqual(sensitive({ draft: '그는 더는 보지 않았다. 불이 꺼져 있었다. 대마도로 가는 배.' }), []);
  assert.deepEqual(codes(sensitive({ draft: '"꺼져!" 그가 외쳤다.' })), ['SENSITIVE_PROFANITY']);
  // 가드된 등장과 가드 안 된 등장이 섞이면 잡는다.
  assert.deepEqual(codes(sensitive({ draft: '불이 꺼져 있었다. "꺼져 버려."' })), ['SENSITIVE_PROFANITY']);
});

test('sensitive: one-letter terms carry no quote; bad mode is reported; missing draft is silent', () => {
  const out = sensitive({ draft: '좆 같은 하루였다.' });
  assert.deepEqual(codes(out), ['SENSITIVE_PROFANITY']);
  assert.equal(out[0].quote, undefined);
  assert.deepEqual(codes(sensitive({ draft: '젠장' }, { mode: 'teen' })), ['SENSITIVE_CONFIG_INVALID']);
  assert.deepEqual(sensitive({}), []);
  assert.equal(SENSITIVE_LEXICON.length, 89);
  assert.ok(Object.isFrozen(SENSITIVE_LEXICON[0]));
});
