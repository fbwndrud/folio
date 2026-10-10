import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destroyedObject } from '../../packs/novel/checkers/destroyed-object.js';
import { honorificGender, HONORIFIC_GENDER_DEFAULTS } from '../../packs/novel/checkers/honorific-gender.js';
import { metadataLeak } from '../../packs/novel/checkers/metadata-leak.js';
import { KO_HONORIFIC_SEED, lookupHonorific } from '../../packs/novel/lexicons/honorifics.js';

const codes = (findings) => findings.map((f) => [f.code, f.entityId ?? null]);
const entityMap = (...list) => new Map(list.map((e) => [e.id, { aliases: [], data: {}, body: '', ...e }]));
const destroyed = { entityId: 'sword', kind: 'state', data: { exists: 'destroyed' } };
const restored = (extra = {}) => ({ entityId: 'sword', kind: 'state', data: { exists: 'restored' }, ...extra });
const work = { entities: entityMap({ id: 'sword', kind: 'object', name: '청명검', aliases: ['청명'] }) };

test('destroyed-object: a destroyed entity on stage or updated is reported; no severity is set', () => {
  const draft = '부러진 청명검이 다시 빛났다.';
  const update = { entityId: 'sword', kind: 'state', data: { glow: true }, quote: '다시 빛났다' };
  const out = destroyedObject({ priorEvents: [destroyed], draftEvents: [update], appearances: ['sword'], entityIds: ['sword'], draft, work });
  assert.deepEqual(codes(out), [['DESTROYED_UPDATED', 'sword'], ['DESTROYED_ON_STAGE', 'sword']]);
  assert.equal(out[0].quote, '다시 빛났다');
  assert.ok(out.every((f) => f.severity === undefined));
  assert.match(out[1].message, /청명검\(sword\)/);
});

test('destroyed-object: named but not on stage is a mention; restated destruction is not an update', () => {
  const draft = '그는 청명을 떠올렸다.';
  const out = destroyedObject({ priorEvents: [destroyed], draftEvents: [{ ...destroyed }], appearances: [], entityIds: ['sword'], draft, work });
  assert.deepEqual(codes(out), [['DESTROYED_MENTIONED', 'sword']]);
  assert.equal(out[0].quote, '청명');
});

test('destroyed-object: a restore needs a quote in the draft; prior restore clears it', () => {
  const base = { priorEvents: [destroyed], appearances: ['sword'], entityIds: ['sword'], draft: '대장장이가 청명검을 다시 벼렸다.', work };
  for (const quote of [undefined, '', ' ', '없는 문장']) {
    const out = destroyedObject({ ...base, draftEvents: [restored(quote === undefined ? {} : { quote })] });
    assert.deepEqual(codes(out), [['DESTROYED_ON_STAGE', 'sword'], ['RESTORE_NOTE_MISSING', 'sword']], String(quote));
  }
  assert.deepEqual(destroyedObject({ ...base, draftEvents: [restored({ quote: '청명검을 다시 벼렸다' })] }), []);
  assert.deepEqual(destroyedObject({ ...base, priorEvents: [destroyed, restored()], draftEvents: [] }), []);
  // 파괴되지 않은 것을 되돌리는 사건은 이 검사의 일이 아니다.
  assert.deepEqual(destroyedObject({ ...base, priorEvents: [], draftEvents: [restored()] }), []);
});

test('destroyed-object: exists values are trimmed and lowercased; unknown values ask the author once', () => {
  const upper = { ...destroyed, data: { exists: ' Destroyed ' } };
  assert.deepEqual(codes(destroyedObject({ priorEvents: [upper], appearances: ['sword'], draftEvents: [] })), [['DESTROYED_ON_STAGE', 'sword']]);
  const odd = { ...destroyed, data: { exists: '분실' } };
  const out = destroyedObject({ priorEvents: [odd, odd], appearances: ['sword'], draftEvents: [] });
  assert.deepEqual(codes(out), [['EXISTS_UNKNOWN', 'sword']]);
  assert.equal(out[0].quote, undefined);
  assert.match(out[0].message, /분실/);
  assert.equal(out[0].severity, undefined);
  assert.deepEqual(codes(destroyedObject({ priorEvents: [], draftEvents: [{ entityId: 'cup', kind: 'state', data: { exists: 'gone' } }] })), [['EXISTS_UNKNOWN', 'cup']]);
  // 범위 밖 엔티티의 앞 사건은 묻지 않는다.
  assert.deepEqual(destroyedObject({ priorEvents: [odd], appearances: ['cup'], draftEvents: [] }), []);
});

test('destroyed-object: tolerates an empty ctx', () => {
  assert.deepEqual(destroyedObject({}), []);
});

const people = entityMap(
  { id: 'doyun', kind: 'character', name: '도윤', data: { gender: 'male' } },
  { id: 'hana', kind: 'character', name: '하나', aliases: ['하나 씨'], data: { gender: 'female' } },
);
const address = (entityId, term, quote) => ({ entityId, kind: 'address', data: { term }, ...(quote ? { quote } : {}) });

test('honorific lexicon: seed is ported verbatim and frozen', () => {
  assert.equal(KO_HONORIFIC_SEED.length, 24);
  assert.ok(Object.isFrozen(KO_HONORIFIC_SEED) && Object.isFrozen(KO_HONORIFIC_SEED[0]));
  assert.equal(lookupHonorific(' 도련님 ').genderImplication, 'male');
  assert.equal(lookupHonorific('오라버니').speakerGenderImplication, 'female');
  assert.equal(lookupHonorific('전하').genderImplication, undefined);
  assert.equal(lookupHonorific('없는말'), undefined);
});

test('honorific-gender: an attributed term that mismatches the addressee is reported with its quote', () => {
  const draft = '"도련님, 일어나세요." 하나가 말했다.';
  const out = honorificGender({ draft, draftEvents: [address('hana', '도련님', '"도련님, 일어나세요."')], work: { entities: people } });
  assert.deepEqual(codes(out), [['HONORIFIC_GENDER_MISMATCH', 'hana']]);
  assert.equal(out[0].quote, '"도련님, 일어나세요."');
  assert.equal(out[0].severity, undefined);
  // 맞는 성별, 성별 함의 없는 호칭, 모르는 호칭은 조용하다.
  const quiet = [address('doyun', '도련님'), address('hana', '전하'), address('hana', '선배')];
  assert.deepEqual(honorificGender({ draft, draftEvents: quiet, work: { entities: people } }), []);
});

test('honorific-gender: effective gender follows prior state events, and a draft change allows both', () => {
  const became = { entityId: 'hana', kind: 'state', data: { gender: ' Male ' } };
  const draft = '"도련님." 하나가 고개를 들었다.';
  const ctx = { draft, work: { entities: people } };
  assert.deepEqual(honorificGender({ ...ctx, priorEvents: [became], draftEvents: [address('hana', '도련님')] }), []);
  const back = { entityId: 'hana', kind: 'state', data: { gender: 'female' } };
  assert.deepEqual(codes(honorificGender({ ...ctx, priorEvents: [became, back], draftEvents: [address('hana', '도련님')] })), [['HONORIFIC_GENDER_MISMATCH', 'hana']]);
  assert.deepEqual(honorificGender({ ...ctx, draftEvents: [became, address('hana', '도련님')] }), []);
});

test('honorific-gender: prose scan suspects a term no named character fits', () => {
  const draft = '하나는 문을 열었다.\n"언니!" 목소리가 복도에 울렸다.\n도윤이 돌아보았다.';
  const onlyDoyun = entityMap({ id: 'doyun', kind: 'character', name: '도윤', data: { gender: 'male' } });
  const out = honorificGender({ draft: draft.replace('하나는', '그는'), work: { entities: onlyDoyun } });
  assert.deepEqual(codes(out), [['HONORIFIC_GENDER_SUSPECT', 'doyun']]);
  assert.ok(draft.includes(out[0].quote) && out[0].quote.includes('언니'));
  // 맞는 성별의 인물(하나)이 원고에 나오면 넘어간다.
  assert.deepEqual(honorificGender({ draft, work: { entities: people } }), []);
  // '그'는 기본으로 훑지 않는다. 설정으로 되돌릴 수 있다.
  const pronoun = { draft: '하나는 그 날을 기억했다.', work: { entities: people } };
  const hanaOnly = { ...pronoun, work: { entities: entityMap({ id: 'hana', kind: 'character', name: '하나', data: { gender: 'female' } }) } };
  assert.deepEqual(honorificGender(hanaOnly), []);
  assert.deepEqual(codes(honorificGender(hanaOnly, { proseSkipTerms: [] })), [['HONORIFIC_GENDER_SUSPECT', 'hana']]);
  assert.deepEqual(honorificGender({ draft: draft.replace('하나는', '그는'), work: { entities: onlyDoyun } }, { ...HONORIFIC_GENDER_DEFAULTS, proseScan: false }), []);
});

test('honorific-gender: prose scan skips attributed terms and particles; tolerates empty ctx', () => {
  const draft = '도윤이 말했다. "언니, 가요."';
  const onlyDoyun = entityMap({ id: 'doyun', kind: 'character', name: '도윤', data: { gender: 'male' } });
  const ev = [address('mira', '언니', '"언니, 가요."')];
  assert.deepEqual(honorificGender({ draft, draftEvents: ev, work: { entities: onlyDoyun } }), []);
  // 조사가 붙은 호칭('언니가')은 경계가 아니라 잡지 않는다(vibelore 와 같다).
  assert.deepEqual(honorificGender({ draft: '도윤이 언니가 왔다고 했다.', work: { entities: onlyDoyun } }), []);
  assert.deepEqual(honorificGender({}), []);
});

test('honorific-gender: bad config is caught; good config is accepted', () => {
  const ctx = { draft: '도윤이 말했다.', work: { entities: people } };
  // 알 수 없는 설정, 잘못된 타입, 배열 아님, 배열 원소 타입 오류.
  assert.deepEqual(codes(honorificGender(ctx, { bogus: 1 })), [['HONORIFIC_GENDER_CONFIG_INVALID', null]]);
  assert.deepEqual(codes(honorificGender(ctx, { proseScan: 'no' })), [['HONORIFIC_GENDER_CONFIG_INVALID', null]]);
  assert.deepEqual(codes(honorificGender(ctx, { proseSkipTerms: 5 })), [['HONORIFIC_GENDER_CONFIG_INVALID', null]]);
  assert.deepEqual(codes(honorificGender(ctx, { proseSkipTerms: [1] })), [['HONORIFIC_GENDER_CONFIG_INVALID', null]]);
  // 좋은 설정도 검사.
  assert.deepEqual(honorificGender(ctx, { proseScan: false }), []);
  assert.deepEqual(honorificGender(ctx, { proseSkipTerms: [] }), []);
  assert.deepEqual(honorificGender(ctx, { proseScan: true, proseSkipTerms: ['언니'] }), []);
});

test('metadata-leak: an id with - or _ in the prose is reported; plain ids are ignored', () => {
  const entities = entityMap({ id: 'kim-doyun', kind: 'character', name: '김도윤' }, { id: 'hana', kind: 'character', name: '하나' }, { id: 'old_sword', kind: 'object', name: '낡은 검' });
  const draft = '김도윤(kim-doyun)이 old_sword를 들었다. hana는 웃었다.';
  const out = metadataLeak({ draft, work: { entities } });
  assert.deepEqual(codes(out), [['METADATA_LEAK', 'kim-doyun'], ['METADATA_LEAK', 'old_sword']]);
  assert.equal(out[0].quote, 'kim-doyun');
  assert.equal(out[0].severity, undefined);
  // 더 긴 id 의 일부는 노출이 아니다.
  assert.deepEqual(metadataLeak({ draft: 'kim-doyun-2 가 왔다.', work: { entities } }), []);
});

test('metadata-leak: a trailing cast list or id|name line is reported', () => {
  const entities = entityMap({ id: 'doyun', kind: 'character', name: '도윤' }, { id: 'hana', kind: 'character', name: '하나' });
  const draft = '도윤은 잠들었다.\n\n- 도윤\n* 하나\nhana|하나';
  const out = metadataLeak({ draft, work: { entities } });
  assert.deepEqual(out.map((f) => f.quote), ['- 도윤', '* 하나', 'hana|하나']);
  assert.ok(out.every((f) => f.code === 'METADATA_LEAK' && draft.includes(f.quote)));
  // 목록 표시 없는 이름 한 줄은 본문일 수 있다.
  assert.deepEqual(metadataLeak({ draft: '그 이름은\n하나', work: { entities } }), []);
  assert.deepEqual(metadataLeak({}), []);
});
