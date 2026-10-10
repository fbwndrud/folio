import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { readSources } from '../../core/store/sources.js';
import { latestByNode } from '../../core/evidence/records.js';
import { checkSourceQuote } from '../../core/evidence/source-quote.js';
import { validateClaims } from '../../core/evidence/validate.js';
import { evidenceStates, staleEvidence } from '../../core/evidence/state.js';
import { copyFixture, tempDir } from '../support/fixtures.js';

const NOTE = 'ATP는 세포의 에너지 화폐로 불린다.';
const TEXT = '세포는 1665년에 처음 관찰됐다. ATP는 세포가 쓰는 에너지 화폐다. 같은 말. 같은 말.\n```\n코드 속 주장\n```\n';

/** knowledge-book 복사본에 글이 아닌(PDF 같은) 자료 하나를 더한다. 이 자료의 인용은 설명서 spans 로만 댄다. */
async function bookWithScan() {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'sources', 'scan.pdf'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
  await writeFile(join(root, 'sources', 'scan.yaml'), 'id: scan\ntitle: 스캔본\nfile: scan.pdf\nreliability: low\nspans:\n  - id: p3\n    quote: 1905년에 처음 관찰했다.\n');
  return root;
}

test('readSources keeps the text of .txt/.md originals only, and refuses a file name that leaves sources/', async () => {
  const root = await bookWithScan();
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, []);
  assert.match(sources.get('cell-notes').text, /ATP는 세포의 에너지 화폐로 불린다\./);
  assert.equal(sources.get('scan').text, null);
  for (const [name, body] of [['escape', 'id: escape\nfile: ../work.yaml\n'], ['hidden', 'id: hidden\nfile: .secret.txt\n'], ['empty', '']]) {
    const probe = await copyFixture('knowledge-book');
    await writeFile(join(probe, 'sources', `${name}.yaml`), body);
    assert.deepEqual((await readSources(probe)).errors, [{ code: 'SOURCE_META_INVALID', path: `sources/${name}.yaml` }], name);
  }
});

test('readSources refuses a source original that is a symlink out of the work, without following it', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.txt'), '작품 밖 글, 새면 안 된다.');
  await symlink(join(outside, 'secret.txt'), join(root, 'sources', 'leaked.txt'));
  await writeFile(join(root, 'sources', 'leaked.yaml'), 'id: leaked\nfile: leaked.txt\n');
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, [{ code: 'SOURCE_FILE_INVALID', id: 'leaked', file: 'leaked.txt' }]);
  assert.equal(sources.has('leaked'), false);
  // openWork도 이 에러를 그대로 드러낸다(글이 새지 않았는지 호출자가 볼 수 있다).
  await assert.rejects(openWork(root), (error) => {
    assert.equal(error.code, 'WORK_INVALID');
    assert.ok(error.details.errors.some((e) => e.code === 'SOURCE_FILE_INVALID' && e.id === 'leaked'));
    return true;
  });
});

test('a source quote must be in the text of a text source, or equal a span quote of any other source', async () => {
  const work = await openWork(await bookWithScan());
  const notes = work.sources.get('cell-notes');
  const scan = work.sources.get('scan');
  assert.deepEqual(checkSourceQuote(notes, NOTE), { ok: true });
  assert.deepEqual(checkSourceQuote(notes, NOTE.normalize('NFD')), { ok: true });
  assert.deepEqual(checkSourceQuote(notes, 'ATP는 세포의 연료다'), { ok: false, code: 'CLAIM_SOURCE_QUOTE_NOT_FOUND' });
  assert.deepEqual(checkSourceQuote(scan, ' 1905년에 처음 관찰했다. '), { ok: true });
  assert.deepEqual(checkSourceQuote(scan, '1905년에'), { ok: false, code: 'CLAIM_SOURCE_QUOTE_NOT_FOUND' });
  for (const bad of ['', ' ', 'A', 3, 'x'.repeat(501)]) assert.deepEqual(checkSourceQuote(notes, bad), { ok: false, code: 'CLAIM_SOURCE_QUOTE_INVALID' }, String(bad));
  assert.deepEqual(checkSourceQuote(undefined, NOTE), { ok: false, code: 'CLAIM_SOURCE_UNKNOWN' });
});

test('validateClaims accepts claims with and without sources and cuts the context from the text itself', async () => {
  const work = await openWork(await bookWithScan());
  const { claims, errors } = validateClaims(work, TEXT, [
    { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }, { sourceId: 'cell-notes', quote: NOTE }, { sourceId: 'scan', quote: '1905년에 처음 관찰했다.' }] },
    { quote: '세포는 1665년에 처음 관찰됐다', after: '. ATP는', sources: [] },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(claims.map((c) => [c.quote, c.before, c.sources.map((l) => l.sourceId)]), [
    ['ATP는 세포가 쓰는 에너지 화폐다', '세포는 1665년에 처음 관찰됐다. ', ['cell-notes', 'scan']],
    ['세포는 1665년에 처음 관찰됐다', '', []],
  ]);
  assert.equal(claims[1].after, TEXT.slice('세포는 1665년에 처음 관찰됐다'.length, '세포는 1665년에 처음 관찰됐다'.length + 30));
});

test('validateClaims refuses with a code per claim: missing, ambiguous, fenced, short, duplicate, unknown source, wrong source quote, bad shape', async () => {
  const work = await openWork(await bookWithScan());
  const codes = (claims) => validateClaims(work, TEXT, claims).errors.map((e) => e.code);
  assert.deepEqual(codes([{ quote: '없는 주장', sources: [] }]), ['CLAIM_QUOTE_NOT_FOUND']);
  assert.deepEqual(codes([{ quote: '같은 말', sources: [] }]), ['CLAIM_AMBIGUOUS']);
  assert.deepEqual(codes([{ quote: '코드 속 주장', sources: [] }]), ['CLAIM_QUOTE_NOT_FOUND']);
  assert.deepEqual(codes([{ quote: ' 세', sources: [] }, { quote: 'x'.repeat(501), sources: [] }]), ['CLAIM_QUOTE_INVALID', 'CLAIM_QUOTE_INVALID']);
  assert.deepEqual(codes([{ quote: 'ATP는', sources: [] }, { quote: 'ATP는 세포가', sources: [] }]), ['CLAIM_DUPLICATE']);
  assert.deepEqual(codes([{ quote: 'ATP는', sources: [{ sourceId: 'ghost', quote: NOTE }] }, { quote: '같은 말.', after: '\n', sources: [{ sourceId: '__proto__', quote: NOTE }] }]), ['CLAIM_SOURCE_UNKNOWN', 'CLAIM_SOURCE_UNKNOWN']);
  assert.deepEqual(validateClaims(work, TEXT, [{ quote: 'ATP는', sources: [{ sourceId: 'scan', quote: '1905년에' }] }]).errors,
    [{ index: 0, link: 0, code: 'CLAIM_SOURCE_QUOTE_NOT_FOUND', sourceId: 'scan' }]);
  assert.deepEqual(codes([{ quote: 'ATP는' }, 'x', null, { quote: 'ATP는', sources: 'cell-notes' }, { quote: 'ATP는', sources: Array(21).fill({ sourceId: 'cell-notes', quote: NOTE }) }]),
    ['CLAIM_INVALID', 'CLAIM_INVALID', 'CLAIM_INVALID', 'CLAIM_INVALID', 'CLAIM_INVALID']);
  assert.deepEqual(codes('nope'), ['CLAIMS_SHAPE_INVALID']);
  assert.deepEqual(codes(Array.from({ length: 201 }, () => ({ quote: 'ATP는', sources: [] }))), ['CLAIMS_SHAPE_INVALID']);
});

test('evidenceStates re-finds each claim in the current node text and re-checks each link against the current source', async () => {
  const root = await bookWithScan();
  const work = await openWork(root);
  const { claims } = validateClaims(work, work.tree.nodes.get('atp-section').body, [
    { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }, { sourceId: 'scan', quote: '1905년에 처음 관찰했다.' }] },
  ]);
  const records = [
    { type: 'evidence', nodeId: 'atp-section', claims: [{ quote: 'ATP는', sources: [] }], origin: 'tool', seq: 1 },
    { type: 'evidence', nodeId: 'atp-section', claims, origin: 'tool', seq: 2 },
    { type: 'evidence', nodeId: 'ghost', claims, origin: 'extract', seq: 3 },
    { type: 'evidence', nodeId: 'broken', claims: 'x', seq: 4 }, { type: 'evidence', nodeId: 'broken', claims: ['x'], seq: 5 }, { type: 'other' },
  ];
  assert.deepEqual([...latestByNode(records).keys()], ['atp-section', 'ghost']);
  const view = (states) => states.map((s) => [s.nodeId, s.status, s.reason ?? null, s.sources.map((l) => l.verified)]);
  assert.deepEqual(view(evidenceStates(work, records)), [['atp-section', 'located', null, [true, true]], ['ghost', 'stale', 'NODE_MISSING', [true, true]]]);
  // 본문을 고치면 주장이 stale(M4 다시 찾기 규칙), 설명서의 span 을 바꾸면 그 연결은 확인되지 않는다
  const file = join(root, 'tree', '01-part-basics', '02-chapter-energy', '01-atp.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace('에너지 화폐다', '연료다'));
  await writeFile(join(root, 'sources', 'scan.yaml'), 'id: scan\nfile: scan.pdf\nspans:\n  - id: p3\n    quote: 1906년에 처음 관찰했다.\n');
  const after = evidenceStates(await openWork(root), records);
  assert.deepEqual(view(after), [['atp-section', 'stale', 'QUOTE_MISSING', [true, false]], ['ghost', 'stale', 'NODE_MISSING', [true, false]]]);
  assert.deepEqual(staleEvidence(after), [
    { nodeId: 'atp-section', quote: 'ATP는 세포가 쓰는 에너지 화폐다', reason: 'QUOTE_MISSING' },
    { nodeId: 'ghost', quote: 'ATP는 세포가 쓰는 에너지 화폐다', reason: 'NODE_MISSING' },
  ]);
});
