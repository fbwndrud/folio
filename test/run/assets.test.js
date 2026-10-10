import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { setupAssets, syntheticSvg } from '../support/assets.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';

const runUntilDone = (make, host, options) => driveToEnd(make, host, { ...options, until: (o) => o.status === 'done' });

test('asset scope is sent to the host; replacement marks the original stale and a new recheck clears it without rewriting prose', async () => {
  const s = await setupAssets(); let a = await s.approve(await s.review(await s.put(await s.add())));
  a = s.ok(await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] })).asset;
  const body = '합성 입력 장면. ![[asset:toy-image]]\n';
  const host = createFakeHost({ drafts: { 'toy-scene': body } });
  const make = () => createRunner({ root: s.root, packs: s.packs });
  const first = await make().run({ node: 'toy-scene' });
  assert.equal(first.requests[0].payload.assets[0].id, a.id);
  assert.equal(first.requests[0].payload.assets[0].approved, true);
  assert.equal((await s.asset({ op: 'update', id: a.id, expectedRev: a.rev, brief: {} })).error.code, 'ASSET_RUN_OPEN');
  await runUntilDone(make, host, { from: first });
  assert.equal(s.ok(await s.call('folio_status', {})).stale.length, 0);
  await writeFile(s.source, syntheticSvg('red')); a = await s.put(a);
  assert.equal(a.approved, false);
  let status = s.ok(await s.call('folio_status', {}));
  assert.ok(status.stale.some((n) => n.nodeId === 'toy-scene' && n.reasons.some((r) => r.kind === 'asset' && r.id === a.id)));
  a = await s.approve(await s.review(a));
  await runUntilDone(make, host, { start: { node: 'toy-scene', mode: 'recheck' } });
  status = s.ok(await s.call('folio_status', {}));
  assert.equal(status.stale.length, 0);
  assert.equal(s.ok(await s.call('folio_find', { query: 'node', id: 'toy-scene' })).node.body, body);
  assert.equal((await s.get()).usages[0].nodeId, 'toy-scene');
});

test('a new attachment after prose commit is a recheck reason and an invalid attachment changes nothing', async () => {
  const s = await setupAssets(); const make = () => createRunner({ root: s.root, packs: s.packs });
  await runUntilDone(make, createFakeHost(), { start: { node: 'toy-scene' } });
  const a = await s.add();
  assert.equal((await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['unknown'] })).error.code, 'ASSET_INPUT_INVALID');
  assert.equal((await s.get()).history.length, 1);
  s.ok(await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] }));
  assert.ok(s.ok(await s.call('folio_status', {})).stale[0].reasons.some((r) => r.id === a.id && r.was === null));
  await runUntilDone(make, createFakeHost(), { start: { node: 'toy-scene', mode: 'recheck' } });
  assert.equal(s.ok(await s.call('folio_status', {})).stale.length, 0);
});

test('turning off asset tools cannot disable data integrity or allow corrupted referenced bytes to commit', async () => {
  const s = await setupAssets(); const a = await s.put(await s.add());
  s.ok(await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] }));
  const path = join(s.root, 'work.yaml'); const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, features: { assets: false } }));
  assert.equal((await s.asset({ op: 'list' })).error.code, 'FEATURE_DISABLED');
  await writeFile(join(s.root, 'assets', a.output.file), syntheticSvg('red'));
  const make = () => createRunner({ root: s.root, packs: s.packs });
  const trail = await driveToEnd(make, createFakeHost(), { start: { node: 'toy-scene' }, user: () => ({ action: 'approve' }), until: (o) => o.status === 'needs_user' && o.question.canApprove === false });
  assert.equal(trail.at(-1).question.blocking[0].code, 'ASSET_CONTENT_CHANGED');
  assert.equal(s.ok(await s.call('folio_find', { query: 'node', id: 'toy-scene' })).node.status, 'draft');
});

test('extracted appearances keep indirect asset scope after commit; detach is stale once and recheck clears it', async () => {
  const s = await setupAssets();
  await mkdir(join(s.root, 'entities', 'character'), { recursive: true });
  await writeFile(join(s.root, 'entities', 'character', 'toy.md'), '---\nid: toy\nkind: character\nname: 합성인물\n---\n');
  let a = s.ok(await s.asset({ op: 'add', id: 'indirect', brief: { entities: ['toy'] } })).asset;
  a = await s.put(a);
  const make = () => createRunner({ root: s.root, packs: s.packs });
  const host = createFakeHost({ drafts: { 'toy-scene': '그는 문을 열었다.\n' }, events: { 'toy-scene': { events: [], appearances: ['toy'] } } });
  await runUntilDone(make, host, { start: { node: 'toy-scene' } });
  assert.equal(s.ok(await s.call('folio_status', {})).stale.length, 0);
  await writeFile(s.source, syntheticSvg('red'));
  await s.put(a);
  assert.ok(s.ok(await s.call('folio_status', {})).stale[0].reasons.some((r) => r.id === 'indirect'));
  await runUntilDone(make, host, { start: { node: 'toy-scene', mode: 'recheck' } });
  assert.equal(s.ok(await s.call('folio_status', {})).stale.length, 0);
  a = await s.add();
  a = s.ok(await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] })).asset;
  await runUntilDone(make, host, { start: { node: 'toy-scene', mode: 'recheck' } });
  s.ok(await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: [] }));
  assert.ok(s.ok(await s.call('folio_status', {})).stale[0].reasons.some((r) => r.id === a.id && r.now === null));
  await runUntilDone(make, host, { start: { node: 'toy-scene', mode: 'recheck' } });
  assert.equal(s.ok(await s.call('folio_status', {})).stale.length, 0);
});

test('asset occurrence marks contribute to both run payload and current stale scope', async () => {
  const s = await setupAssets();
  const path = join(s.root, 'work.yaml'); const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, features: { occurrenceScope: true } }));
  await mkdir(join(s.root, 'entities', 'character'), { recursive: true });
  await writeFile(join(s.root, 'entities', 'character', 'toy.md'), '---\nid: toy\nkind: character\nname: 합성인물\n---\n');
  let a = s.ok(await s.asset({ op: 'add', id: 'marked', brief: { description: '합성 모습' } })).asset;
  a = await s.put(a);
  await submitOccurrences(s.root, { surface: { kind: 'asset', id: a.id, field: '/brief/description' }, items: [{ entityId: 'toy', kind: 'mention', quote: '합성 모습' }] });
  const make = () => createRunner({ root: s.root, packs: s.packs });
  const host = createFakeHost({ drafts: { 'toy-scene': '합성인물이 문을 열었다.\n' } });
  await runUntilDone(make, host, { start: { node: 'toy-scene' } });
  assert.ok(host.calls.some((c) => c.payload.assets.some((asset) => asset.id === a.id)));
  assert.equal(s.ok(await s.call('folio_status', {})).stale.length, 0);
  await writeFile(s.source, syntheticSvg('red')); await s.put(a);
  assert.ok(s.ok(await s.call('folio_status', {})).stale[0].reasons.some((r) => r.id === a.id));
});
