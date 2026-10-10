import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { FolioError } from '../../core/errors.js';
import { validateInput } from '../../server/validate-input.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const handlers = (fn) => ({ folio_status: fn });

test('long FolioError messages are cut to 300 characters, keeping the code and details', async () => {
  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw new FolioError('X_BAD', 'y'.repeat(5000), { hint: 'h' }); }) });
  const out = await tools.call('folio_status', { root: '/w' });
  assert.equal(out.error.code, 'X_BAD');
  assert.equal(out.error.message.length, 300);
  assert.ok(out.error.message.endsWith('…'));
  assert.deepEqual(out.error.details, { hint: 'h' });
});

test('non-Folio errors become INTERNAL_ERROR with the errno only; the Node message and its path stay in the server log', async () => {
  const error = Object.assign(new Error(`ENOTDIR: not a directory, stat '${'/p'.repeat(400)}'`), { code: 'ENOTDIR' });
  const logged = [];
  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw error; }), onError: (e) => { logged.push(e); } });
  const out = await tools.call('folio_status', { root: '/w' });
  assert.equal(out.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(out.error.message, /ENOTDIR|\/p\/p/);
  assert.deepEqual(out.error.details, { errno: 'ENOTDIR' });
  assert.deepEqual(logged, [error]);
});

test('C0: huge details and a huge relative root are not echoed back uncut', async () => {
  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw new FolioError('X_BIG', 'big', { list: 'z'.repeat(5000) }); }) });
  assert.deepEqual((await tools.call('folio_status', { root: '/w' })).error.details, { truncated: true });
  const relative = await tools.call('folio_status', { root: `w${'x'.repeat(5000)}` });
  assert.equal(relative.error.code, 'ROOT_NOT_ABSOLUTE');
  assert.ok(relative.error.message.length <= 300 && relative.error.details.root.length <= 300);
});

test('C0: a root that is a file, or sits under a file, is WORK_ROOT_INVALID for every tool — never INTERNAL_ERROR', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-root-file-'));
  const file = join(dir, 'not-a-folder.md');
  await writeFile(file, '# 파일\n');
  const logged = [];
  const tools = createToolbox({ packs: await loadBuiltinPacks(), onError: (e) => { logged.push(e); } });
  const calls = [
    ['folio_status', {}], ['folio_config', {}], ['folio_run', {}], ['folio_find', { query: 'node', id: 'x' }], ['folio_view', {}],
    ['folio_sources', { op: 'list' }], ['folio_init', { title: 't', preset: 'serial' }],
  ];
  for (const root of [file, join(file, 'inside')]) {
    for (const [name, args] of calls) {
      const out = await tools.call(name, { root, ...args });
      assert.equal(out.error?.code, 'WORK_ROOT_INVALID', `${name} ${root}`);
      assert.ok(!out.error.message.includes(dir), 'the path is not echoed');
    }
  }
  assert.deepEqual(logged, []);
  const missing = join(dir, 'new-work');
  assert.equal((await tools.call('folio_status', { root: missing })).error.code, 'WORK_NOT_FOUND', 'a missing root is left to the tool');
  await mkdir(join(dir, 'empty'));
  assert.equal((await tools.call('folio_status', { root: join(dir, 'empty') })).error.code, 'WORK_NOT_FOUND');
});

test('C0: broken YAML in work.yaml, a node, an entity, an asset or a source is YAML_INVALID naming the file and line — not INTERNAL_ERROR', async () => {
  const cases = {
    'work.yaml': { text: 'levels: [\n', expectedLine: 2 },
    'tree/01-arc-awakening/01-ep-001.md': { text: '---\nid: [\n---\n本文\n', expectedLine: 3 },
    'entities/character/hana.md': { text: '---\nid: [\n---\n', expectedLine: 3 },
    'assets/x.yaml': { text: 'id: [\n', expectedLine: 2 },
    'sources/x.yaml': { text: 'id: [\n', expectedLine: 2 },
  };
  for (const [file, { text, expectedLine }] of Object.entries(cases)) {
    const root = await copyFixture('serial-2level');
    await useFakePack(root);
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
    const tools = createToolbox({ packs: fakePacks(), onError: () => { throw new Error('no internal error expected'); } });
    const out = await tools.call('folio_status', { root });
    assert.equal(out.error?.code, 'YAML_INVALID', file);
    assert.equal(out.error.details.source, file);
    assert.equal(out.error.details.line, expectedLine, `${file}: expected line ${expectedLine}, got ${out.error.details.line}`);
    // message 와 details.line 이 같은 줄을 가리켜야 한다
    assert.ok(out.error.message.includes(`line ${expectedLine}`), `${file}: message should name line ${expectedLine}, got: ${out.error.message}`);
    assert.ok(!out.error.message.includes('id: ['), 'the text is not echoed');
  }
});

test('validateInput knows maxLength, maxItems and maximum', () => {
  assert.deepEqual(validateInput({ type: 'string', maxLength: 2 }, 'abc').map((e) => e.message), ['must have at most 2 characters']);
  assert.deepEqual(validateInput({ type: 'array', maxItems: 1 }, [1, 2]).map((e) => e.message), ['must have at most 1 items']);
  assert.deepEqual(validateInput({ type: 'integer', maximum: 3 }, 4).map((e) => e.message), ['must be <= 3']);
});
