import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceRhythm, SENTENCE_RHYTHM_DEFAULTS } from '../../packs/novel/checkers/sentence-rhythm.js';
import { prosody, PROSODY_LEVELS } from '../../packs/novel/checkers/prosody.js';
import { showDontTell } from '../../packs/novel/checkers/show-dont-tell.js';
import { cliche } from '../../packs/novel/checkers/cliche.js';
import { GENERIC_CLICHES, GENRE_CLICHES } from '../../packs/novel/lexicons/style-cliches.js';
import { EMOTION_VERB_ENTRIES } from '../../packs/novel/lexicons/emotion-verbs.js';
import { ONOMATOPOEIA_SOUND } from '../../packs/novel/lexicons/onomatopoeia-sound.js';
import { ONOMATOPOEIA_MIMETIC } from '../../packs/novel/lexicons/onomatopoeia-mimetic.js';
import { SIMILE_MARKER_ENTRIES } from '../../packs/novel/lexicons/simile-markers.js';

// 모든 문장은 이 테스트를 위해 지어낸 합성 문장이다.
const codes = (findings) => findings.map((f) => f.code);
const repeat = (sentence, times) => Array(times).fill(sentence).join(' ');

// 길이가 10~40자로 고르게 흩어진 문장 12개(표준편차 약 10).
const EVEN = [
  '비가 그친 오후였다.', '골목이 길게 이어졌고 가로등이 늦게 켜졌다.', '하나는 우산을 접어 문가에 세웠다.', '조용했다.',
  '서랍 속 편지는 그대로 놓여 있었다.', '그녀는 다시 걸었다.', '물웅덩이가 하늘을 비추고 있었다.', '멀리서 버스 소리가 들려왔다.',
  '바람이 불었다.', '문이 닫혔다.', '계단 아래에서 발소리가 올라오고 있었다.',
];
// 운율 점수 59(보통 55 통과, 엄격 70 미달). 끝 문장이 없으면 42(느슨 45 미달).
const PROSODY_59 = [...EVEN, '누가 왔을까?'].join(' ');
const PROSODY_42 = EVEN.join(' ');

test('lexicons: vibelore 씨앗 수와 같고 얼어 있다', () => {
  assert.equal(EMOTION_VERB_ENTRIES.length, 107);
  assert.equal(ONOMATOPOEIA_SOUND.length + ONOMATOPOEIA_MIMETIC.length, 298);
  assert.equal(SIMILE_MARKER_ENTRIES.length, 32);
  assert.equal(GENERIC_CLICHES.length, 5);
  assert.equal(Object.keys(GENRE_CLICHES).length, 25);
  assert.ok(Object.isFrozen(EMOTION_VERB_ENTRIES) && Object.isFrozen(EMOTION_VERB_ENTRIES[0]));
  assert.ok(Object.isFrozen(GENRE_CLICHES['regression-hunter']));
});

test('sentence-rhythm: 길이가 같은 문장이 이어지면 단조, 들쭉날쭉하면 불안정', () => {
  const flat = sentenceRhythm({ draft: repeat('그는 문을 열었다.', 12) });
  assert.deepEqual(codes(flat), ['SENTENCE_MONOTONY']);
  assert.match(flat[0].message, /표준편차 0\.00 < 6/);
  assert.equal(flat[0].severity, undefined);
  const long = '그날 밤 그는 오래 닫혀 있던 창고의 문을 열고 먼지 쌓인 상자들을 하나씩 꺼내 마당에 늘어놓으며 잃어버린 열쇠를 찾았다.';
  const chaos = sentenceRhythm({ draft: Array.from({ length: 12 }, (_, i) => (i % 2 ? '끝.' : `${long} ${long}`)).join(' ') });
  assert.deepEqual(codes(chaos), ['SENTENCE_CHAOS']);
  assert.deepEqual(sentenceRhythm({ draft: EVEN.join('\n') }), []);
});

test('sentence-rhythm: 문장이 기준 개수보다 적으면 보지 않고, 설정으로 기준을 바꾼다', () => {
  assert.equal(SENTENCE_RHYTHM_DEFAULTS.minSentences, 10);
  assert.deepEqual(sentenceRhythm({ draft: repeat('그는 문을 열었다.', 9) }), []);
  assert.deepEqual(codes(sentenceRhythm({ draft: repeat('그는 문을 열었다.', 3) }, { minSentences: 3 })), ['SENTENCE_MONOTONY']);
  assert.deepEqual(sentenceRhythm({ draft: repeat('그는 문을 열었다.', 12) }, { monotonyMax: 0 }), []);
  assert.deepEqual(codes(sentenceRhythm({ draft: EVEN.join(' ') }, { chaosMin: 5 })), ['SENTENCE_CHAOS']);
});

test('sentence-rhythm: 빠진 ctx 는 조용하고, 수가 아닌 설정은 CONFIG_INVALID 하나로 알린다', () => {
  assert.deepEqual(sentenceRhythm({}), []);
  assert.deepEqual(sentenceRhythm({ draft: 42 }), []);
  const bad = sentenceRhythm({ draft: repeat('그는 문을 열었다.', 12) }, { chaosMin: '30' });
  assert.deepEqual(codes(bad), ['CONFIG_INVALID']);
  assert.match(bad[0].message, /chaosMin/);
});

test('prosody: 점수가 기준보다 낮으면 PROSODY_LOW(점수·기준을 메시지에)', () => {
  const low = prosody({ draft: repeat('그는 문을 열었다.', 12) });
  assert.deepEqual(codes(low), ['PROSODY_LOW']);
  assert.match(low[0].message, /운율 점수 17점이 기준 55점\(normal\)/);
  assert.match(low[0].message, /종결어미 다양성 0/);
  assert.equal(low[0].severity, undefined);
});

test('prosody: 강도 단계(loose 45 · normal 55 · strict 70)', () => {
  assert.deepEqual(PROSODY_LEVELS, { loose: 45, normal: 55, strict: 70 });
  assert.deepEqual(prosody({ draft: PROSODY_59 }), []);
  assert.deepEqual(prosody({ draft: PROSODY_59 }, { level: 'loose' }), []);
  assert.match(prosody({ draft: PROSODY_59 }, { level: 'strict' })[0].message, /59점이 기준 70점/);
  assert.deepEqual(codes(prosody({ draft: PROSODY_42 }, { level: 'loose' })), ['PROSODY_LOW']);
});

test('prosody: 빈 원고는 보지 않고, 모르는 강도는 CONFIG_INVALID', () => {
  assert.deepEqual(prosody({}), []);
  assert.deepEqual(prosody({ draft: '   ' }), []);
  for (const level of ['medium', 55, null]) {
    assert.deepEqual(codes(prosody({ draft: PROSODY_59 }, { level })), ['CONFIG_INVALID'], String(level));
  }
});

const TELLING = '나는 슬펐다. 나는 화가 났다. 나는 두려웠다. 그리고 창문을 닫았다.';

test('show-dont-tell: 감정을 말로만 하면 SHOW_NOT_TELL_LOW·EMOTION_OVERTELL·SIMILE_TOO_SPARSE', () => {
  const found = showDontTell({ draft: TELLING });
  assert.deepEqual(codes(found), ['SHOW_NOT_TELL_LOW', 'EMOTION_OVERTELL', 'SIMILE_TOO_SPARSE']);
  assert.match(found[0].message, /3번에 비해 직유 표지는 0번/);
  assert.ok(found.every((f) => f.severity === undefined));
});

test('show-dont-tell: 의성어·의태어 과다와 직유 과다', () => {
  const noisy = '쾅 소리가 났다. 쿵 하고 무너졌다. 펑 터졌다. 그는 문으로 뛰었다. 마치 꿈처럼 느렸다.';
  assert.deepEqual(codes(showDontTell({ draft: noisy })), ['ONOMATOPOEIA_OVERUSE', 'SIMILE_OVERUSE']);
  const similes = '그녀는 마치 바람처럼 달렸고 불꽃처럼 웃었다. 물결처럼 굽은 길을 지났다.';
  assert.deepEqual(codes(showDontTell({ draft: similes })), ['SIMILE_OVERUSE']);
});

test('show-dont-tell: 보여 주는 원고는 조용하다', () => {
  const clean = '비가 그친 오후였다. 하나는 우산을 접어 문가에 세우고 젖은 신발을 벗었다. 창밖으로 골목이 길게 이어졌고 가로등 몇 개가 늦게 불을 켰다. '
    + '부엌에서는 주전자가 조용히 끓고 있었다. 그녀는 찻잔 두 개를 꺼내 식탁에 올려 두었다. 서랍 속 편지는 아직 봉투째 그대로 놓여 있었다. '
    + '봉투 모서리는 오래 만진 종이처럼 부드럽게 닳아 있었다. 그녀는 편지를 꺼내지 않고 손끝으로 한 번 쓸어 보았다. 멀리서 버스가 지나가는 소리가 들려왔다.';
  assert.deepEqual(showDontTell({ draft: clean }), []);
});

test('show-dont-tell: 설정 덮어쓰기, 빠진 ctx, 잘못된 설정', () => {
  assert.deepEqual(codes(showDontTell({ draft: TELLING }, { minEmotions: 4, overtellDensityMax: 1, simileDensityMin: 0 })), []);
  assert.deepEqual(codes(showDontTell({ draft: TELLING }, { ratioMin: 0 })), ['EMOTION_OVERTELL', 'SIMILE_TOO_SPARSE']);
  assert.deepEqual(showDontTell({}), []);
  assert.deepEqual(codes(showDontTell({ draft: TELLING }, { ratioMin: NaN })), ['CONFIG_INVALID']);
});

const TIRED = '그럴 수밖에 없었다. 그는 칼을 들었다. 그럴 수밖에 없었다. 그녀가 고개를 끄덕였다. 그럴 수밖에 없었다.';

test('cliche: 같은 상투 구절 3번이면 LEXICAL_FATIGUE(구절 인용), 밀도가 높으면 CLICHE_DENSITY', () => {
  const found = cliche({ draft: TIRED });
  assert.deepEqual(codes(found), ['LEXICAL_FATIGUE', 'CLICHE_DENSITY']);
  assert.equal(found[0].quote, '그럴 수밖에 없었다');
  assert.ok(TIRED.includes(found[0].quote));
  assert.match(found[0].message, /3번/);
  assert.equal(found[0].severity, undefined);
});

test('cliche: 장르를 고르면 그 장르 전용 구절도 본다', () => {
  const regress = repeat('지난 생에서는 달랐다. 그는 검을 닦으며 창밖의 눈을 오래 바라보았다. 마당의 나무가 조용히 흔들렸다.', 3);
  assert.deepEqual(cliche({ draft: regress }), []);
  const found = cliche({ draft: regress }, { genre: 'regression-hunter' });
  assert.deepEqual(codes(found), ['LEXICAL_FATIGUE', 'CLICHE_DENSITY']);
  assert.equal(found[0].quote, '지난 생에서는 달랐다');
  assert.match(found[0].message, /regression-hunter/);
});

test('cliche: 기준 덮어쓰기, 깨끗한 원고, 빠진 ctx, 모르는 장르', () => {
  assert.deepEqual(codes(cliche({ draft: TIRED }, { repeatMin: 4, densityMax: 1 })), []);
  assert.deepEqual(cliche({ draft: '그는 칼을 들었다. 그녀가 고개를 끄덕였다.' }), []);
  assert.deepEqual(cliche({}), []);
  const bad = cliche({ draft: TIRED }, { genre: 'wuxia' });
  assert.deepEqual(codes(bad), ['CONFIG_INVALID']);
  assert.match(bad[0].message, /genre/);
});
