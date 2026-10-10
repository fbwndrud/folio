import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { changeAsset } from '../../core/assets/change.js';
import { MAX_ASSET_BYTES } from '../../core/assets/files.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { setupAssets, syntheticSvg } from '../support/assets.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { planRename } from '../../core/rename/plan.js';
import { openWork } from '../../core/store/work.js';

const errorCode = (out) => out.error?.code;

test('file handoff refuses relative paths, directories, links, empty/oversized files and false hashes without recording', async () => {
  const s = await setupAssets(); const a = await s.add();
  const link = join(s.base, 'link.svg'); await symlink(s.source, link);
  const empty = join(s.base, 'empty.svg'); await writeFile(empty, '');
  const huge = join(s.base, 'huge.svg'); await writeFile(huge, Buffer.alloc(MAX_ASSET_BYTES + 1));
  for (const [path, expected] of [['relative.svg', 'ASSET_PATH_INVALID'], [s.base, 'ASSET_PATH_INVALID'], [link, 'ASSET_PATH_INVALID'], [empty, 'ASSET_SIZE_INVALID'], [huge, 'ASSET_SIZE_INVALID']]) {
    assert.equal(errorCode(await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, path, mediaType: 'image/svg+xml' })), expected);
  }
  assert.equal(errorCode(await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml', contentHash: `sha256:${'0'.repeat(64)}` })), 'ASSET_HASH_MISMATCH');
  assert.equal((await s.get()).history.length, 1);
});

test('a crash after immutable copying but before append leaves no registered version and retry reuses the exact bytes', async () => {
  const s = await setupAssets(); const a = await s.add();
  const input = { op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' };
  await assert.rejects(changeAsset(s.root, input, { hooks: { afterSnapshot: () => { throw Error('synthetic interruption'); } } }), /synthetic interruption/);
  assert.equal((await s.get()).history.length, 1); assert.equal((await s.get()).asset.status, 'planned');
  const ready = await s.put(a);
  assert.equal(ready.version, 2); assert.equal((await s.get()).history.length, 2);
  assert.equal(await readFile(join(s.root, 'assets', ready.output.file), 'utf8'), syntheticSvg());
});

test('storage directory links are rejected before reading the host file or writing a ledger', async () => {
  for (const target of ['assets', '.folio/ledger']) {
    const s = await setupAssets(); const outside = await tempDir('folio-assets-outside-');
    if (target.includes('/')) await mkdir(join(s.root, '.folio'), { recursive: true });
    await symlink(outside, join(s.root, target));
    assert.equal(errorCode(await s.asset({ op: 'add', id: 'toy-image', brief: {} })), 'ASSET_DIRECTORY_INVALID');
  }
});

test('asset ledger and head links cannot redirect managed writes outside the work', async () => {
  for (const name of ['assets.jsonl', 'assets.head']) {
    const s = await setupAssets();
    await mkdir(join(s.root, '.folio', 'ledger'), { recursive: true });
    const outside = join(s.base, 'untouched.txt'); await writeFile(outside, 'synthetic sentinel');
    await symlink(outside, join(s.root, '.folio', 'ledger', name));
    assert.equal(errorCode(await s.asset({ op: 'add', id: 'toy-image', brief: {} })), 'ASSET_DIRECTORY_INVALID');
    assert.equal(await readFile(outside, 'utf8'), 'synthetic sentinel');
  }
});

test('hash-chain corruption and semantically forged review records cannot supply approval', async () => {
  const s = await setupAssets(); const a = await s.put(await s.add());
  const ledger = openLedger(s.root, 'assets');
  await ledger.append({ type: 'asset_review', id: a.id, version: a.version, versionDigest: 'forged', contentHash: a.output.contentHash,
    reviewId: 'forged', checked: [], findings: [], reviewer: { sameHost: false, independent: true } });
  let out = await s.asset({ op: 'get', id: a.id });
  assert.equal(errorCode(out), 'WORK_INVALID'); assert.ok(out.error.details.errors.some((e) => e.code === 'ASSET_RECORD_INVALID'));
  await writeFile(ledger.path, '{"type":"asset_version"}\n');
  out = await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' });
  assert.equal(errorCode(out), 'WORK_INVALID'); assert.ok(out.error.details.errors.some((e) => e.code === 'LEDGER_TAMPERED'));
});

test('legacy YAML assets remain readable and cannot be overwritten by managed asset ops', async () => {
  const root = await copyFixture('novel-3level'); const tools = createToolbox({ packs: await loadBuiltinPacks() });
  const get = await tools.call('folio_assets', { root, op: 'get', id: 'img-rooftop' });
  assert.equal(get.ok, true); assert.equal(get.result.asset.managed, false); assert.equal(get.result.asset.status, 'legacy');
  assert.equal(errorCode(await tools.call('folio_assets', { root, op: 'add', id: 'img-rooftop', brief: {} })), 'ASSET_EXISTS');
  assert.equal(errorCode(await tools.call('folio_assets', { root, op: 'update', id: 'img-rooftop', expectedRev: get.result.asset.rev, brief: {} })), 'ASSET_LEGACY_READ_ONLY');
});

test('managed briefs cannot be renamed through file writes; excluding the hit and appending a new brief preserves history', async () => {
  const s = await setupAssets();
  await mkdir(join(s.root, 'entities', 'character'), { recursive: true });
  await writeFile(join(s.root, 'entities', 'character', 'toy.md'), '---\nid: toy\nkind: character\nname: 합성인물\n---\n');
  const a = s.ok(await s.asset({ op: 'add', id: 'toy-image', brief: { description: '합성인물이 있다.', entities: ['toy'] } })).asset;
  await submitOccurrences(s.root, { surface: { kind: 'asset', id: a.id, field: '/brief/description' }, items: [{ entityId: 'toy', kind: 'mention', quote: '합성인물' }] });
  const records = await openLedger(s.root, 'occurrences').readAll(); const work = await openWork(s.root);
  assert.throws(() => planRename(work, records, { entityId: 'toy', newName: '새인물' }), { code: 'RENAME_MANAGED_ASSET' });
  const plan = planRename(work, records, { entityId: 'toy', newName: '새인물', exclude: ['asset:toy-image:/brief/description@0'] });
  assert.ok(plan.files.every((f) => !f.path.startsWith('assets/')));
  s.ok(await s.asset({ op: 'update', id: a.id, expectedRev: a.rev, brief: { description: '새인물이 있다.', entities: ['toy'] } }));
  const history = (await s.get()).history;
  assert.equal(history[0].brief.description, '합성인물이 있다.'); assert.equal(history[1].brief.description, '새인물이 있다.');
});
