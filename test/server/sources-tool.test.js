import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => (out.ok ? 'ok' : out.error.code);
const TEXT = '2020년 조사에서 성인의 세포는 약 37조 개로 추정됐다.\n';

test('folio_sources: add, list, get, link — a wrong quote in link records nothing; an edited body makes the link stale', async () => {
  const tools = await box();
  const root = await copyFixture('knowledge-book');
  ok(await tools.call('folio_sources', { root, op: 'add', id: 'census', title: '세포 수 조사', reliability: 'low', text: TEXT }));
  assert.deepEqual(ok(await tools.call('folio_sources', { root, op: 'list' })), {
    sources: [
      { id: 'cell-notes', title: '세포 강의 메모', file: 'cell-notes.txt', date: '2026-01-10', reliability: 'medium', spans: 1, text: true },
      { id: 'census', title: '세포 수 조사', file: 'census.txt', date: null, reliability: 'low', spans: 0, text: true },
    ],
    evidence: { stale: [], total: 0 },
  });
  const claim = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: 'ATP는 세포의 에너지 화폐로 불린다.' }] };
  const wrong = { quote: '에너지 화폐다', sources: [{ sourceId: 'census', quote: '약 36조 개' }] };
  const refused = await tools.call('folio_sources', { root, op: 'link', nodeId: 'atp-section', claims: [claim, wrong] });
  assert.deepEqual([code(refused), refused.error.details.errors.map((e) => [e.index, e.code])], ['EVIDENCE_INVALID', [[1, 'CLAIM_SOURCE_QUOTE_NOT_FOUND']]]);
  assert.equal(ok(await tools.call('folio_sources', { root, op: 'list' })).evidence.total, 0);
  assert.equal(ok(await tools.call('folio_sources', { root, op: 'link', nodeId: 'atp-section', claims: [claim] })).accepted, 1);
  const got = ok(await tools.call('folio_sources', { root, op: 'get', id: 'cell-notes' }));
  assert.equal(got.source.text, '세포 강의 메모 (합성 자료). ATP는 세포의 에너지 화폐로 불린다.\n');
  assert.equal(got.source.truncated, false);
  assert.deepEqual(got.links.map((l) => [l.nodeId, l.quote, l.status, l.reason, l.sources.map((s) => [s.sourceId, s.verified])]), [
    ['atp-section', 'ATP는 세포가 쓰는 에너지 화폐다', 'located', null, [['cell-notes', true]]],
  ]);
  assert.deepEqual(ok(await tools.call('folio_sources', { root, op: 'get', id: 'census' })).links, []);
  const file = join(root, 'tree', '01-part-basics', '02-chapter-energy', '01-atp.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace('에너지 화폐다', '연료다'));
  assert.deepEqual(ok(await tools.call('folio_sources', { root, op: 'list' })).evidence, {
    stale: [{ nodeId: 'atp-section', quote: 'ATP는 세포가 쓰는 에너지 화폐다', reason: 'QUOTE_MISSING' }], total: 1,
  });
});

test('folio_sources: arguments per op, unknown sources, and the sources toggle', async () => {
  const tools = await box();
  const root = await copyFixture('knowledge-book');
  assert.equal(code(await tools.call('folio_sources', { root, op: 'list', id: 'x' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_sources', { root, op: 'add', text: TEXT })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_sources', { root, op: 'link', nodeId: 'atp-section' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_sources', { root, op: 'remove', id: 'x' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_sources', { root, op: 'add', id: 'x', text: '' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_sources', { root, op: 'get', id: 'ghost' })), 'SOURCE_NOT_FOUND');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features: { sources: false } }));
  for (const args of [{ op: 'list' }, { op: 'get', id: 'cell-notes' }, { op: 'add', id: 'x', text: TEXT }, { op: 'link', nodeId: 'atp-section', claims: [] }]) {
    const out = await tools.call('folio_sources', { root, ...args });
    assert.deepEqual([code(out), out.error.details.feature], ['FEATURE_DISABLED', 'sources'], args.op);
  }
});

test('folio_status carries evidence { stale, total } like occurrences: null when evidence is off, the ledger check when it is broken', async () => {
  const tools = await box();
  const root = await copyFixture('knowledge-book');
  assert.deepEqual(ok(await tools.call('folio_status', { root })).evidence, { stale: [], total: 0 });
  const claim = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: 'ATP는 세포의 에너지 화폐로 불린다.' }] };
  ok(await tools.call('folio_sources', { root, op: 'link', nodeId: 'atp-section', claims: [claim] }));
  assert.deepEqual(ok(await tools.call('folio_status', { root })).evidence, { stale: [], total: 1 });
  const file = join(root, 'tree', '01-part-basics', '02-chapter-energy', '01-atp.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace('에너지 화폐다', '연료다'));
  const stale = [{ nodeId: 'atp-section', quote: 'ATP는 세포가 쓰는 에너지 화폐다', reason: 'QUOTE_MISSING' }];
  assert.deepEqual(ok(await tools.call('folio_status', { root })).evidence, { stale, total: 1 });
  assert.deepEqual(ok(await tools.call('folio_sources', { root, op: 'list' })).evidence, { stale, total: 1 });
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  // sources(도구)만 끄면 근거 stale 은 status 에 그대로 나온다 — status 가 정본 자리다
  await writeFile(path, stringifyYaml({ ...config, features: { sources: false } }));
  assert.deepEqual(ok(await tools.call('folio_status', { root })).evidence, { stale, total: 1 });
  await writeFile(path, stringifyYaml({ ...config, features: { evidence: false } }));
  assert.equal(ok(await tools.call('folio_status', { root })).evidence, null);
  await writeFile(path, stringifyYaml(config));
  await writeFile(join(root, '.folio', 'ledger', 'evidence.jsonl'), `${JSON.stringify({ type: 'evidence', seq: 1, prev: 'genesis', hash: 'x' })}\n`);
  const broken = ok(await tools.call('folio_status', { root })).evidence;
  assert.deepEqual([broken.ledger.ok, broken.stale, broken.total], [false, [], 0]);
  // folio_sources get 도 같은 자리에서 본다: 던지지 않고 자료는 그대로, links 는 null, ledger 에 검증 결과(결정 19)
  const got = ok(await tools.call('folio_sources', { root, op: 'get', id: 'cell-notes' }));
  assert.equal(got.source.id, 'cell-notes');
  assert.deepEqual([got.links, got.ledger.ok], [null, false]);
});
