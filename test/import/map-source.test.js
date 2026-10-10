import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVibelore } from '../../core/import/read-source.js';
import { episodeId, FALLBACK_ARC, mapVibelore } from '../../core/import/map-source.js';
import { VIBELORE_FIXTURE } from '../support/import-source.js';

test('mapVibelore: kept arcs in number order, chapters without an arc under the fallback arc, titles from the chapter then the arc plan', async () => {
  const plan = mapVibelore(await readVibelore(VIBELORE_FIXTURE));
  assert.deepEqual(plan.arcs.map((a) => [a.id, a.title, a.episodes.map((e) => [e.id, e.title])]), [
    ['arc-2', '꺼진 등대', [['ep-001', '꺼진 등불'], ['ep-002', '일지'], ['ep-003', '바다로 난 길']]],
    [FALLBACK_ARC.id, FALLBACK_ARC.title, [['ep-004', '4화']]],
  ]);
  assert.equal(plan.arcs[0].body, '세린은 꺼진 등불의 이유를 찾아 바다의 돌길을 건넌다.\n');
  assert.deepEqual(plan.arcs[0].origin.path, '.vibelore/arcs/2.json');
  const [first, second] = plan.arcs[0].episodes;
  assert.equal(first.body, '세린은 등대 계단 끝에서 꺼진 등불을 들어 올렸다.\n\n"오늘 밤엔 배가 안 들어와." 무진이 말했다.\n');
  assert.deepEqual(first.origin.receipts.map((r) => r.path), ['.vibelore/check-receipts/check-0001aaaa.json']);
  assert.deepEqual(Object.keys(first.origin.receipts[0]), ['path', 'sha256']);
  assert.deepEqual(first.pictures.map((p) => [p.id, p.file, p.origin.path]), [
    ['ep-001-webtoon', 'ep-001-webtoon.svg', 'webtoon/episodes/1-wt-aaaa1111/episode.svg'],
    ['ep-001-webtoon-2', 'ep-001-webtoon-2.svg', 'webtoon/episodes/1-wt-bbbb2222/episode.svg'],
  ]);
  assert.deepEqual(second.pictures, []);
  assert.deepEqual(plan.warnings.map((w) => w.code), ['IMPORT_PICTURES_MULTIPLE']);
  assert.ok(!JSON.stringify(plan).includes('verdict') && !JSON.stringify(plan).includes('버린'), 'no verdict, no rejected arc');
});

test('mapVibelore: characters keep only name, aliases, gender and role; world files become world entities', async () => {
  const plan = mapVibelore(await readVibelore(VIBELORE_FIXTURE));
  assert.deepEqual(plan.entities.map((e) => [e.kind, e.id, e.data]), [
    ['character', 'c1', { id: 'c1', kind: 'character', name: '세린', aliases: ['등대지기'], gender: 'female', role: 'protagonist' }],
    ['character', 'c2', { id: 'c2', kind: 'character', name: '무진', aliases: [], gender: 'male', role: 'ally' }],
    ['world', 'setting', { id: 'setting', kind: 'world', name: 'setting' }],
  ]);
  assert.equal(plan.entities[0].body, '## 모순\n혼자 등대를 지키려 하지만, 등불을 다시 켜려면 남의 손이 필요하다.\n');
});

test('mapVibelore on hand-made reads: a chapter in two arcs stays in the first, an empty arc and a broken frontmatter warn, ids pad to three digits', () => {
  const file = (path, text) => ({ path, text, sha256: `sha256:${'0'.repeat(64)}` });
  const arc = (number, chapters, extra = {}) => ({ number, path: `.vibelore/arcs/${number}.json`, sha256: `sha256:${'1'.repeat(64)}`, json: { title: `${number}부`, episodes: chapters.map((chapter) => ({ chapter })), ...extra } });
  const plan = mapVibelore({
    chapters: [{ number: 7, ...file('chapters/007.md', '---\nchapter: [\n---\n본문\n') }, { number: 1200, ...file('chapters/1200.md', '긴 연재\n') }],
    characters: [file('characters/x.md', '---\nid: Bad Id\nname: 이상\n---\n'), file('characters/y.md', '---\nid: y\n---\n')], world: [],
    arcs: [arc(1, [7]), arc(2, [7, 1200]), arc(3, [99])], receipts: [], pictures: [{ episode: 50, path: 'webtoon/episodes/50-wt-x/episode.svg', bytes: Buffer.from('<svg/>'), sha256: 'x' }], warnings: [],
  });
  assert.deepEqual(plan.arcs.map((a) => [a.id, a.episodes.map((e) => e.id)]), [['arc-1', ['ep-007']], ['arc-2', ['ep-1200']]]);
  assert.equal(plan.arcs[0].episodes[0].body, '---\nchapter: [\n---\n본문\n');
  assert.deepEqual(plan.warnings.map((w) => w.code), ['IMPORT_CHAPTER_IN_TWO_ARCS', 'IMPORT_ARC_EMPTY', 'IMPORT_FRONTMATTER_INVALID', 'IMPORT_ENTITY_ID_INVALID', 'IMPORT_ENTITY_NAME_MISSING', 'IMPORT_PICTURE_NO_CHAPTER']);
  assert.equal(episodeId(7), 'ep-007');
});

test('mapVibelore rejects chapter numbers that normalize to the same episode id and names both sources', () => {
  const chapter = (path) => ({ number: 1, path, text: '합성 본문\n', sha256: 'sha256:source' });
  const read = { chapters: [chapter('chapters/1.md'), chapter('chapters/001.md')], characters: [], world: [], arcs: [], receipts: [], pictures: [], warnings: [] };
  assert.throws(() => mapVibelore(read), (error) => error.code === 'IMPORT_CHAPTER_DUPLICATE'
    && error.details.first === 'chapters/1.md' && error.details.second === 'chapters/001.md');
});

test('mapVibelore rejects kept arcs with the same number and names both sources', () => {
  const chapter = { number: 1, path: 'chapters/1.md', text: '합성 본문\n', sha256: 'sha256:source' };
  const arc = (path, status) => ({ number: 1, path, sha256: 'sha256:arc', json: { title: '합성 아크', episodes: [{ chapter: 1 }], ...(status ? { status } : {}) } });
  const read = { chapters: [chapter], characters: [], world: [], arcs: [arc('.vibelore/arcs/1.json'), arc('.vibelore/arcs/001.json')], receipts: [], pictures: [], warnings: [] };
  assert.throws(() => mapVibelore(read), (error) => error.code === 'IMPORT_ARC_DUPLICATE'
    && error.details.first === '.vibelore/arcs/1.json' && error.details.second === '.vibelore/arcs/001.json');
  assert.doesNotThrow(() => mapVibelore({ ...read, arcs: [read.arcs[0], arc('.vibelore/arcs/001.json', 'rejected')] }));
});

test('mapVibelore bounds mapping warnings and distinguishes repeated chapters in one arc', () => {
  const chapter = { number: 1, path: 'chapters/1.md', text: '합성 본문\n', sha256: 'sha256:source' };
  const arc = { number: 1, path: '.vibelore/arcs/1.json', sha256: 'sha256:arc', json: {
    title: '합성 아크', episodes: Array.from({ length: 205 }, () => ({ chapter: 1 })),
  } };
  const read = { chapters: [chapter], characters: [], world: [], arcs: [arc], receipts: [], pictures: [], warnings: [] };
  const plan = mapVibelore(read);
  assert.deepEqual(plan.arcs[0].episodes.map((episode) => episode.id), ['ep-001']);
  assert.equal(plan.warnings.length, 200);
  assert.ok(plan.warnings.slice(0, -1).every((warning) => warning.code === 'IMPORT_CHAPTER_DUPLICATE_IN_ARC' && warning.kept === 'arc-1'));
  assert.equal(plan.warnings.at(-1).code, 'IMPORT_WARNINGS_TRUNCATED');

  const fullRead = { ...read, warnings: Array.from({ length: 199 }, () => ({ code: 'IMPORT_ENTRY_SKIPPED' })).concat({ code: 'IMPORT_WARNINGS_TRUNCATED' }) };
  const capped = mapVibelore(fullRead);
  assert.equal(capped.warnings.length, 200);
  assert.deepEqual(capped.warnings, fullRead.warnings);
  assert.equal(fullRead.warnings.length, 200);
});
