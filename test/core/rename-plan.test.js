import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { resolveQuote } from '../../core/occurrences/anchor.js';
import { occurrenceStates } from '../../core/occurrences/state.js';
import { planRename } from '../../core/rename/plan.js';
import { josaWarning } from '../../core/rename/josa.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';

const records = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();
const ep001 = (root) => join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
/** 계획의 등장 위치 항목이 새 글에서 한 곳으로 정확히 정해지는지(문맥 증거로) 검증하는 잣대. */
const locatesUniquely = (text, item) => resolveQuote(text, { quote: item.quote, before: item.before, after: item.after }).ok === true;

test('josa warning when the final consonant changes before a particle', () => {
  assert.equal(josaWarning('하나', '세린', '는 웃었다'), '는');
  assert.equal(josaWarning('하나', '세라', '는 웃었다'), null);
  assert.equal(josaWarning('도윤', '하나', '이 왔다'), '이');
  assert.equal(josaWarning('ATP', '아데노신삼인산', '는'), null);
  assert.equal(josaWarning('하나', '세린', ' 씨'), null);
  // Ruling C2-5: 받침이 정확히 ㄹ이면 '으로'가 아니라 '로'가 맞는 조사라 경고하지 않는다.
  assert.equal(josaWarning('하나', '세릴', '로'), null);
});

test('a character rename changes recorded occurrences by default and offers scan hits as candidates', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const plan = planRename(await openWork(root), await records(root), { entityId: 'hana', newName: '세라' });
  assert.equal(plan.oldName, '하나');
  assert.deepEqual(plan.changes.map((c) => [c.id, c.source]), [['node:ep-001:@0', 'occurrence']]);
  assert.ok(plan.candidates.some((c) => c.id === 'node:ep-003:@0' && c.source === 'scan'));
  assert.ok(plan.candidates.some((c) => c.surface.id === 'arc-awakening'));
  assert.deepEqual(plan.files.map((f) => f.path), ['entities/character/hana.md', 'tree/01-arc-awakening/01-ep-001.md']);
  assert.match(plan.files[1].text, /^---\nid: ep-001\nlevel: episode\ntitle: 1화\n---\n세라는 지하실/);
  assert.match(plan.files[0].text, /name: 세라\naliases:\n {2}- 하나\n/);
  assert.deepEqual(plan.occurrenceUpdates[0].items.map((i) => i.quote), ['세라는']);
  assert.deepEqual(plan.committed, []);
  assert.match(plan.planDigest, /^sha256:/);
});

test('include picks scan candidates; unknown ids and taken or bad names are refused; the digest follows every choice', async () => {
  const root = await copyFixture('serial-2level');
  const work = await openWork(root);
  const base = planRename(work, [], { entityId: 'hana', newName: '세라' });
  const picked = planRename(work, [], { entityId: 'hana', newName: '세라', include: ['node:ep-003:@0'] });
  assert.deepEqual(picked.changes.map((c) => c.id), ['node:ep-003:@0']);
  assert.notEqual(picked.planDigest, base.planDigest);
  assert.notEqual(planRename(work, [], { entityId: 'hana', newName: '세라', keepOldName: false }).planDigest, base.planDigest);
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '세라', include: ['node:ep-003:@99'] }), { code: 'RENAME_INCLUDE_UNKNOWN' });
  for (const name of ['', '하나', 'a\nb', 'x'.repeat(201)]) assert.throws(() => planRename(work, [], { entityId: 'hana', newName: name }), { code: 'RENAME_NAME_INVALID' }, name);
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '도윤' }), { code: 'RENAME_NAME_TAKEN' });
  assert.throws(() => planRename(work, [], { entityId: 'nobody', newName: 'x' }), { code: 'ENTITY_NOT_FOUND' });
});

test('a term rename in a knowledge book: bodies, asset briefs change; sources stay and are listed as untouched', async () => {
  const root = await copyFixture('knowledge-book');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'cell.yaml'), 'id: cell\nbrief:\n  show: [ATP 분자 모형]\n  entities: [atp]\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(root, { surface: { kind: 'asset', id: 'cell', field: '/brief/show/0' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP 분자' }] });
  await submitOccurrences(root, { surface: { kind: 'source', id: 'cell-notes', field: '/spans/0/quote' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP는' }] });
  const plan = planRename(await openWork(root), await records(root), { entityId: 'atp', newName: '아데노신삼인산', keepOldName: true });
  assert.deepEqual(plan.files.map((f) => f.path).sort(), ['assets/cell.yaml', 'entities/term/atp.md', 'tree/01-part-basics/02-chapter-energy/01-atp.md']);
  assert.match(plan.files.find((f) => f.path === 'assets/cell.yaml').text, /아데노신삼인산 분자 모형/);
  assert.deepEqual(plan.untouched, [{ surface: { kind: 'source', id: 'cell-notes' }, field: '/spans/0/quote', count: 1, reason: 'SOURCE_IMMUTABLE' }]);
  assert.ok(plan.candidates.some((c) => c.surface.id === 'glossary'));
  assert.equal(plan.warnings.length, 0);
});

test('names inside code fences are never changed or offered', async () => {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'tree', '01-arc-awakening', '03-ep-003.md');
  await writeFile(path, '---\nid: ep-003\nlevel: episode\ntitle: 3화\n---\n```\n하나\n```\n');
  const plan = planRename(await openWork(root), [], { entityId: 'hana', newName: '세라' });
  assert.equal(plan.candidates.some((c) => c.surface.id === 'ep-003'), false);
});

// --- Fix round 1 (controller rulings C2-1..C2-5) ---

test('a stale occurrence is never rewritten but is carried over unchanged (Ruling C2-1/C2-2)', async () => {
  const root = await copyFixture('serial-2level');
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나는 있다. 도윤은 웃었다.\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [
    { entityId: 'hana', kind: 'appearance', quote: '하나는' }, { entityId: 'doyun', kind: 'mention', quote: '도윤은' }] });
  // 도윤 인용문이 아예 사라지게 고친다(다시 대조하면 QUOTE_MISSING) — 하나는 그대로 살아있다.
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나는 있다. 그가 웃었다. 하나가 또 있다.\n');
  const work = await openWork(root);
  const plan = planRename(work, await records(root), { entityId: 'hana', newName: '세라' });
  const update = plan.occurrenceUpdates.find((u) => u.surface.id === 'ep-001');
  assert.ok(update, 'ep-001 surface was touched by the rename');
  const doyunItem = update.items.find((i) => i.entityId === 'doyun');
  assert.equal(doyunItem.quote, '도윤은'); // 옛 이름이 들어있지 않으니 rename이 손대지 않는다 — 그대로 옮겨졌다
  const hanaItem = update.items.find((i) => i.entityId === 'hana');
  assert.equal(hanaItem.quote, '세라는');
  assert.ok(locatesUniquely(plan.files.find((f) => f.path.includes('ep-001')).text.split('---\n')[2], hanaItem));
  assert.deepEqual(plan.staleCarried, [{ surface: { kind: 'node', id: 'ep-001', field: '' }, entityId: 'doyun', quote: '도윤은' }]);
});

test('a relocated occurrence is rewritten at its new start, not re-searched (Ruling C2-1)', async () => {
  const root = await copyFixture('serial-2level');
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나는 지하실 끝에서 잠긴 문을 발견했다. 하나는 울었다.\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는 울었다' }] });
  // 앞에 문장을 끼워 넣는다 — 인용문은 그대로 있지만 위치가 밀린다(relocated).
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n서문. 하나는 지하실 끝에서 잠긴 문을 발견했다. 하나는 울었다.\n');
  const work = await openWork(root);
  const recs = await records(root);
  const state = occurrenceStates(work, recs)[0];
  assert.equal(state.status, 'relocated');
  const plan = planRename(work, recs, { entityId: 'hana', newName: '세라' });
  const update = plan.occurrenceUpdates.find((u) => u.surface.id === 'ep-001');
  assert.equal(update.items.length, 1);
  assert.equal(update.items[0].quote, '세라는 울었다');
  assert.equal(update.items[0].before, '서문. 하나는 지하실 끝에서 잠긴 문을 발견했다. ');
  const newText = withoutFrontmatter(plan.files.find((f) => f.path.includes('ep-001')).text);
  assert.ok(locatesUniquely(newText, update.items[0]));
});

test("f-misplace: another entity's mention is untouched and never lands on an unrelated look-alike (Ruling C2-1)", async () => {
  const root = await copyFixture('serial-2level');
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나는 울었다. 세라는 웃었다. 도윤이 보았다. 하나가 왔다.\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [
    { entityId: 'doyun', kind: 'mention', quote: '하나는' },
    { entityId: 'hana', kind: 'appearance', quote: '하나가 왔다' }] });
  const work = await openWork(root);
  const plan = planRename(work, await records(root), { entityId: 'hana', newName: '세라' });
  const update = plan.occurrenceUpdates.find((u) => u.surface.id === 'ep-001');
  const newText = withoutFrontmatter(plan.files.find((f) => f.path.includes('ep-001')).text);
  const doyunItem = update.items.find((i) => i.entityId === 'doyun');
  // 도윤의 '하나는'은 이름 바꾸기가 건드리지 않은 자리다 — 본문에 두 번 있는 "세라는" 중 아무 데나 짚으면 안 된다.
  assert.equal(doyunItem.quote, '하나는');
  assert.equal(doyunItem.before, '');
  assert.ok(locatesUniquely(newText, doyunItem));
  const hanaItem = update.items.find((i) => i.entityId === 'hana');
  assert.equal(hanaItem.quote, '세라가 왔다');
  assert.ok(locatesUniquely(newText, hanaItem));
  assert.equal(plan.staleCarried.length, 0);
});

test('f-drop: an unrelated live mention on the same surface survives the rename instead of being dropped (Ruling C2-2)', async () => {
  const root = await copyFixture('serial-2level');
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나가 왔다. 문이 있다. 또 문이 있다.\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [
    { entityId: 'hana', kind: 'appearance', quote: '하나가' },
    { entityId: 'locked-door', kind: 'mention', quote: '문이 있다', before: '하나가 왔다. ' }] });
  // 앞에 XX를 끼워 넣는다 — locked-door 인용문 앞의 즉시 문맥이 바뀐다.
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나가 왔다. XX 문이 있다. 또 문이 있다.\n');
  const work = await openWork(root);
  const plan = planRename(work, await records(root), { entityId: 'hana', newName: '세라' });
  const update = plan.occurrenceUpdates.find((u) => u.surface.id === 'ep-001');
  assert.deepEqual(update.items.map((i) => i.entityId).sort(), ['hana', 'locked-door']);
  const doorItem = update.items.find((i) => i.entityId === 'locked-door');
  assert.equal(doorItem.quote, '문이 있다');
  const newText = withoutFrontmatter(plan.files.find((f) => f.path.includes('ep-001')).text);
  assert.ok(locatesUniquely(newText, doorItem));
});

test('a hit buried inside another entity\'s longer name or alias is neither a change nor a candidate (Ruling C2-3)', async () => {
  const root = await copyFixture('serial-2level');
  await mkdir(join(root, 'entities', 'character'), { recursive: true });
  await writeFile(join(root, 'entities', 'character', 'hanarin.md'), '---\nid: hanarin\nkind: character\nname: 하나린\n---\n');
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나는 하나린과 하나를 봤다.\n');
  const plan = planRename(await openWork(root), [], { entityId: 'hana', newName: '세라' });
  const ids = plan.candidates.filter((c) => c.surface.id === 'ep-001').map((c) => c.id);
  assert.deepEqual(ids, ['node:ep-001:@0', 'node:ep-001:@9']);
  assert.equal(plan.candidates.some((c) => c.id === 'node:ep-001:@4'), false);
  assert.equal(plan.changes.length, 0);
});

test('exclude moves a chosen change back to candidates; unknown ids and non-array options are refused (Ruling C2-3)', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const work = await openWork(root);
  const recs = await records(root);
  const base = planRename(work, recs, { entityId: 'hana', newName: '세라' });
  assert.deepEqual(base.changes.map((c) => c.id), ['node:ep-001:@0']);
  const excluded = planRename(work, recs, { entityId: 'hana', newName: '세라', exclude: ['node:ep-001:@0'] });
  assert.deepEqual(excluded.changes, []);
  assert.ok(excluded.candidates.some((c) => c.id === 'node:ep-001:@0' && c.source === 'occurrence'));
  assert.notEqual(excluded.planDigest, base.planDigest);
  assert.throws(() => planRename(work, recs, { entityId: 'hana', newName: '세라', exclude: ['node:ep-001:@999'] }), { code: 'RENAME_INCLUDE_UNKNOWN' });
  assert.throws(() => planRename(work, recs, { entityId: 'hana', newName: '세라', exclude: 'node:ep-001:@0' }), { code: 'RENAME_OPTIONS_INVALID' });
  assert.throws(() => planRename(work, recs, { entityId: 'hana', newName: '세라', include: 'node:ep-001:@0' }), { code: 'RENAME_OPTIONS_INVALID' });
});

test('several changes in one file shift a later live mention by the cumulative length delta (Ruling C2-1)', async () => {
  const root = await copyFixture('serial-2level');
  await writeFile(ep001(root), '---\nid: ep-001\nlevel: episode\ntitle: x\n---\n하나가 있다. 도윤이 하나를 보았다. 하나가 웃었다.\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [
    { entityId: 'hana', kind: 'appearance', quote: '하나가 있다' },
    { entityId: 'doyun', kind: 'mention', quote: '하나를' },
    { entityId: 'hana', kind: 'appearance', quote: '하나가 웃었다' }] });
  const work = await openWork(root);
  // 이름 길이가 달라야(2자 -> 3자) 뒤에 오는 항목의 시작 위치가 실제로 밀린다.
  const plan = planRename(work, await records(root), { entityId: 'hana', newName: '하나짱' });
  assert.equal(plan.changes.length, 2); // 두 개의 하나 자신의 기록만 자동 선택됨(도윤의 언급은 scan)
  const update = plan.occurrenceUpdates.find((u) => u.surface.id === 'ep-001');
  const newText = withoutFrontmatter(plan.files.find((f) => f.path.includes('ep-001')).text);
  for (const item of update.items) assert.ok(locatesUniquely(newText, item), `${item.entityId}'s item locates uniquely`);
  const doyunItem = update.items.find((i) => i.entityId === 'doyun');
  assert.equal(doyunItem.quote, '하나를'); // 도윤의 인용문 자체는 안 바뀜(변경이 안쪽에 있지 않음)
});

test('a CRLF node file keeps its line endings and comments; beforeHash matches the real bytes', async () => {
  const root = await copyFixture('serial-2level');
  const raw = '---\r\nid: ep-001\r\nlevel: episode # c\r\ntitle: 하나의 모험\r\n---\r\n하나는 왔다.\r\n하나가 갔다.\r\n';
  await writeFile(ep001(root), raw);
  const work = await openWork(root);
  const p0 = planRename(work, [], { entityId: 'hana', newName: '세라' });
  const include = p0.candidates.filter((c) => c.surface.id === 'ep-001').map((c) => c.id);
  const plan = planRename(work, [], { entityId: 'hana', newName: '세라', include });
  const file = plan.files.find((f) => f.path.includes('ep-001'));
  assert.match(file.text, /level: episode # c\r\ntitle: 하나의 모험\r\n---\r\n세라는 왔다\.\r\n세라가 갔다\./);
  assert.equal(file.beforeHash, sha256(await readFile(ep001(root))));
});

test('newName is compared and matched after NFC normalisation; surrounding whitespace and control chars are refused (Ruling C2-4)', async () => {
  const root = await copyFixture('serial-2level');
  const work = await openWork(root);
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '도윤'.normalize('NFD') }), { code: 'RENAME_NAME_TAKEN' });
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '하나'.normalize('NFD') }), { code: 'RENAME_NAME_INVALID' });
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: ' 세라 ' }), { code: 'RENAME_NAME_INVALID' });
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '세라\u0000' }), { code: 'RENAME_NAME_INVALID' });
  for (const bad of ['세\u2028라', '세라\u0085', '\u200b세라', '세라\u202e']) {
    assert.throws(() => planRename(work, [], { entityId: 'hana', newName: bad }), { code: 'RENAME_NAME_INVALID' }, JSON.stringify(bad));
  }
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '세라\n라' }), { code: 'RENAME_NAME_INVALID' });
  const plan = planRename(work, [], { entityId: 'hana', newName: '세라 x' });
  assert.match(plan.files.find((f) => f.path.includes('hana')).text, /name: 세라 x/);
});

test('non-string aliases already in frontmatter are kept untouched when the entity file is rewritten (Ruling C2-5)', async () => {
  const root = await copyFixture('serial-2level');
  await writeFile(join(root, 'entities', 'character', 'hana.md'), '---\nid: hana\nkind: character\nname: 하나\naliases: [하나씨, 1]\n---\n');
  const plan = planRename(await openWork(root), [], { entityId: 'hana', newName: '세라' });
  const text = plan.files.find((f) => f.path.includes('hana')).text;
  assert.match(text, /aliases:\n {2}- 하나씨\n {2}- 1\n {2}- 하나\n/);
});

/** 계획 파일 글에서 frontmatter를 뺀 본문만(테스트가 만든 frontmatter에는 '---\n'이 본문에 나오지 않는다). */
function withoutFrontmatter(fileText) {
  return fileText.split('---\n').slice(2).join('---\n');
}
