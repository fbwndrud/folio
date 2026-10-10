import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogueTags, SPEECH_TAGS } from '../../packs/novel/checkers/dialogue-tags.js';
import { dialogueRatio, DIALOGUE_RATIO_RANGES } from '../../packs/novel/checkers/dialogue-ratio.js';
import { pov } from '../../packs/novel/checkers/pov.js';
import { styleDrift } from '../../packs/novel/checkers/style-drift.js';

// 모든 문장은 이 테스트를 위해 지어낸 합성 문장이다.
const codes = (findings) => findings.map((f) => f.code);
const lines = (dialogueCount, total) => Array.from({ length: total }, (_, i) => (i < dialogueCount ? `"오늘은 ${i}번째로 늦었어."` : `그는 창가에 ${i}번째 화분을 놓았다.`)).join('\n');

test('dialogue-tags: "말했다"가 80%를 넘으면 DIALOGUE_TAG_MONOTONY', () => {
  assert.equal(SPEECH_TAGS[0], '말했다');
  const found = dialogueTags({ draft: '그가 말했다. 그녀가 말했다. 아이가 말했다. 노인이 말했다. 개가 짖자 그가 말했다.' });
  assert.deepEqual(codes(found), ['DIALOGUE_TAG_MONOTONY']);
  assert.equal(found[0].quote, '말했다');
  assert.match(found[0].message, /5\/5\(100%\) > 80%/);
  assert.equal(found[0].severity, undefined);
});

test('dialogue-tags: 정확히 80%는 넘지 않은 것이고, 발화 동사가 5번보다 적으면 보지 않는다', () => {
  assert.deepEqual(dialogueTags({ draft: '그가 말했다. 그녀가 말했다. 아이가 말했다. 노인이 말했다. 누군가 외쳤다.' }), []);
  assert.deepEqual(dialogueTags({ draft: '그가 말했다. 그녀가 말했다. 아이가 말했다. 노인이 말했다.' }), []);
  assert.deepEqual(codes(dialogueTags({ draft: '그가 말했다. 그녀가 말했다.' }, { minTags: 2 })), ['DIALOGUE_TAG_MONOTONY']);
  assert.deepEqual(dialogueTags({ draft: '그가 말했다. 그녀가 말했다. 아이가 말했다. 노인이 말했다. 개가 말했다.' }, { monotonyRatio: 1 }), []);
});

test('dialogue-tags: 빠진 ctx 와 잘못된 설정', () => {
  assert.deepEqual(dialogueTags({}), []);
  assert.deepEqual(codes(dialogueTags({ draft: '그가 말했다.' }, { minTags: 'five' })), ['CONFIG_INVALID']);
});

test('dialogue-ratio: 기본 범위(other 장르 15~50%) 밖이면 DIALOGUE_RATIO_OFF', () => {
  assert.deepEqual(DIALOGUE_RATIO_RANGES.other, [0.15, 0.5]);
  const high = dialogueRatio({ draft: lines(6, 6) });
  assert.deepEqual(codes(high), ['DIALOGUE_RATIO_OFF']);
  assert.match(high[0].message, /100%이\(가\) 상한 50%보다 높다/);
  assert.match(dialogueRatio({ draft: lines(0, 6) })[0].message, /0%이\(가\) 하한 15%보다 낮다/);
  assert.deepEqual(dialogueRatio({ draft: lines(2, 6) }), []);
  assert.equal(high[0].severity, undefined);
});

test('dialogue-ratio: 장르 표와 range 덮어쓰기(range 가 장르보다 앞선다)', () => {
  assert.deepEqual(codes(dialogueRatio({ draft: lines(2, 6) }, { genre: 'comedy' })), ['DIALOGUE_RATIO_OFF']);
  assert.deepEqual(dialogueRatio({ draft: lines(2, 6) }, { genre: 'comedy', range: [0.3, 0.4] }), []);
  assert.deepEqual(codes(dialogueRatio({ draft: lines(2, 6) }, { range: [0.5, 0.9] })), ['DIALOGUE_RATIO_OFF']);
});

test('dialogue-ratio: 절반 이상이 따옴표 안이어야 대사 줄이고, 줄이 6개보다 적으면 보지 않는다', () => {
  const mixed = ['그는 한참 동안 창밖을 바라보다가 낮게 "응"이라고만 했다.', '「가자」', '『그래』', '“어서 와.”', '평범한 서술이다.', '또 하나의 서술이다.'].join('\n');
  // 대사 줄은 「가자」 『그래』 “어서 와.” 셋 — 50%, 기본 범위 안.
  assert.deepEqual(dialogueRatio({ draft: mixed }), []);
  assert.deepEqual(codes(dialogueRatio({ draft: mixed }, { range: [0, 0.4] })), ['DIALOGUE_RATIO_OFF']);
  assert.deepEqual(dialogueRatio({ draft: lines(5, 5) }), []);
  assert.deepEqual(codes(dialogueRatio({ draft: lines(3, 3) }, { minLines: 3 })), ['DIALOGUE_RATIO_OFF']);
});

test('dialogue-ratio: 빠진 ctx 와 잘못된 설정', () => {
  assert.deepEqual(dialogueRatio({}), []);
  for (const config of [{ genre: 'wuxia' }, { range: [0.6, 0.2] }, { range: [0.1] }, { range: 'wide' }, { minLines: null }]) {
    assert.deepEqual(codes(dialogueRatio({ draft: lines(6, 6) }, config)), ['CONFIG_INVALID'], JSON.stringify(config));
  }
});

const character = (id, name, data = {}, aliases = []) => [id, { id, kind: 'character', name, aliases, data, body: '' }];
const cast = (...entries) => ({ entities: new Map(entries) });
// 별칭 "나"는 "하나" 안에도 들어 있다 — 겹친 자리는 한 번만 알려야 한다.
const HANA = character('hana', '하나', { narrator: true }, ['나']);
const SEOJIN = character('seojin', '서진', {}, ['진이']);

test('pov: 화자가 아닌 인물의 감정·속마음을 서술이 사실로 말하면 POV_VIOLATION(인물, 인용)', () => {
  const draft = '하나는 문을 열었다. 서진은 슬펐다. 진이는 속으로 웃음을 참았다.';
  const found = pov({ draft, work: cast(HANA, SEOJIN) });
  assert.deepEqual(found.map((f) => [f.code, f.entityId, f.quote]), [
    ['POV_VIOLATION', 'seojin', '서진은 슬펐다'],
    ['POV_VIOLATION', 'seojin', '진이는 속으로'],
  ]);
  assert.ok(found.every((f) => draft.includes(f.quote) && f.severity === undefined));
  assert.match(found[0].message, /화자 하나\(hana\).*서진의 감정 '슬펐다'/);
});

test('pov: 대사 안 짐작과 화자 자신의 감정은 누설이 아니다', () => {
  const draft = '"서진은 슬펐다고 생각해." 하나는 슬펐다. 하나는 속으로 울었다. 서진은 고개를 숙였다.';
  assert.deepEqual(pov({ draft, work: cast(HANA, SEOJIN) }), []);
});

test('pov: 화자가 없으면 보지 않고, 여럿이면 이 노드에 등장한 화자 하나만 인정한다', () => {
  const draft = '서진은 슬펐다. 하나는 기뻤다.';
  assert.deepEqual(pov({ draft, work: cast(character('hana', '하나'), SEOJIN) }), []);
  const two = cast(HANA, character('seojin', '서진', { narrator: true }));
  assert.deepEqual(pov({ draft, work: two }), []);
  assert.deepEqual(pov({ draft, work: two, appearances: ['hana', 'seojin'] }), []);
  const fromHana = pov({ draft, work: two, appearances: ['hana'] });
  assert.deepEqual(fromHana.map((f) => f.entityId), ['seojin']);
  const fromSeojin = pov({ draft, work: two, appearances: ['seojin'] });
  assert.deepEqual(fromSeojin.map((f) => [f.entityId, f.quote]), [['hana', '하나는 기뻤다']]);
});

test('pov: 빠진 ctx 와 인물 아닌 엔티티', () => {
  assert.deepEqual(pov({}), []);
  assert.deepEqual(pov({ work: cast(HANA, SEOJIN) }), []);
  const place = ['harbor', { id: 'harbor', kind: 'place', name: '항구', aliases: [], data: {}, body: '' }];
  assert.deepEqual(pov({ draft: '항구는 쓸쓸했다.', work: cast(HANA, place) }), []);
});

const para = (chars) => '가'.repeat(chars - 1) + '.';
/** n 개 문단(각 chars 자) 원고. */
const body = (n, chars) => Array.from({ length: n }, () => para(chars)).join('\n\n');
const node = (id, data, text) => [id, { id, level: 'scene', role: null, status: 'committed', kind: 'leaf', parentId: null, children: [], data, body: text }];
const workOf = (...nodes) => ({
  tree: { nodes: new Map(nodes), rootIds: nodes.map(([id]) => id) },
  positions: new Map(nodes.map(([id], index) => [id, { ordinal: index + 1, ordered: true }])),
});

test('style-drift: 승인한 기준 노드와 문단 호흡이 크게 다르면 STYLE_ANCHOR_DRIFT(어느 지표인지)', () => {
  const work = workOf(node('s1', { styleAnchor: true }, body(10, 60)), node('s2', { styleAnchor: true }, body(12, 50)), node('s3', {}, ''));
  assert.deepEqual(styleDrift({ nodeId: 's3', draft: body(11, 55), work }), []);
  const found = styleDrift({ nodeId: 's3', draft: body(2, 400), work });
  assert.deepEqual(codes(found), ['STYLE_ANCHOR_DRIFT']);
  assert.match(found[0].message, /1,000자당 문단 수/);
  assert.match(found[0].message, /문단 길이 중앙값 400자/);
  assert.match(found[0].message, /s1, s2/);
  assert.match(found[0].message, /자동으로 고치지 말고/);
  assert.equal(found[0].severity, undefined);
  const chatty = styleDrift({ nodeId: 's3', draft: Array.from({ length: 11 }, () => `"${para(54)}"`).join('\n\n'), work });
  assert.match(chatty[0].message, /대사 문단 비율 1/);
  assert.doesNotMatch(chatty[0].message, /문단 길이 중앙값/);
});

test('style-drift: 기준 노드가 없거나 자기 자신뿐이면 보지 않는다', () => {
  assert.deepEqual(styleDrift({ nodeId: 's1', draft: body(2, 400), work: workOf(node('s1', {}, body(10, 60))) }), []);
  assert.deepEqual(styleDrift({ nodeId: 's1', draft: body(2, 400), work: workOf(node('s1', { styleAnchor: true }, body(10, 60))) }), []);
  assert.deepEqual(styleDrift({ nodeId: 's2', draft: body(2, 400), work: workOf(node('s1', { styleAnchor: 'yes' }, body(10, 60))) }), []);
  assert.deepEqual(styleDrift({}), []);
  assert.deepEqual(styleDrift({ draft: body(2, 400) }), []);
});

test('style-drift: 읽는 순서로 앞의 기준 노드 3개만 쓴다', () => {
  const anchors = ['a1', 'a2', 'a3', 'a4'].map((id, i) => node(id, { styleAnchor: true }, i === 3 ? body(2, 400) : body(10, 60)));
  const work = workOf(...anchors, node('d', {}, ''));
  assert.deepEqual(styleDrift({ nodeId: 'd', draft: body(10, 60), work }), []);
  assert.match(styleDrift({ nodeId: 'd', draft: body(2, 400), work })[0].message, /a1, a2, a3\)/);
  // 순서 정보가 뒤집히면 a4 가 맨 앞으로 온다.
  const reversed = { ...work, positions: new Map([...work.positions, ['a4', { ordinal: 0, ordered: true }]]) };
  assert.match(styleDrift({ nodeId: 'd', draft: body(2, 400), work: reversed })[0].message, /a4, a1, a2\)/);
});
