import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPackSpec } from '../../core/pack/yaml-schema.js';
import { SCOPE_FIELDS } from '../../core/scope/fields.js';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const DEFINES_MEMBRANE = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };

/** knowledge-book 복사본: 세포막의 선수 개념이 세포이고, 앞 절(what-is-a-cell)이 세포를 정의했다. */
async function bookWithPrerequisite() {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'entities', 'term', 'cell.md'), '---\nid: cell\nkind: term\nname: 세포\n---\n');
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell]\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', nodeId: 'what-is-a-cell', entityId: 'cell', kind: 'term.defined' });
  return root;
}

test('without a pack that turns prerequisites on, the core scope does not read them', async () => {
  const root = await bookWithPrerequisite();
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const input = { work, events, nodeId: 'membranes', draftText: '세포막은 바깥 경계다.', extracted: DEFINES_MEMBRANE };
  const off = gatherScope(input);
  assert.deepEqual([off.prerequisiteIds, off.priorEvents, off.refs.filter((r) => r.kind === 'entity').map((r) => r.id)], [[], [], ['membrane']]);
  const on = gatherScope({ ...input, scopeFields: SCOPE_FIELDS });
  assert.deepEqual([on.prerequisiteIds, on.priorEvents.map((e) => e.entityId), on.refs.filter((r) => r.kind === 'entity').map((r) => r.id)], [['cell'], ['cell'], ['cell', 'membrane']]);
});

test('pack.yaml scopeFields takes only fields the core knows; the registry keeps the fields some pack turned on', async () => {
  assert.deepEqual(SCOPE_FIELDS, ['prerequisites']);
  assert.deepEqual(readPackSpec({ name: 'demo', scopeFields: ['prerequisites', 'prerequisites'] }).spec.scopeFields, ['prerequisites']);
  assert.equal(Object.hasOwn(readPackSpec({ name: 'demo' }).spec, 'scopeFields'), false);
  for (const bad of [['avoid'], 'prerequisites', [1], {}, ['__proto__']]) {
    assert.deepEqual(readPackSpec({ name: 'demo', scopeFields: bad }).errors, [{ code: 'PACK_FIELD_INVALID', path: 'scopeFields' }], JSON.stringify(bad));
  }
  const packs = await loadBuiltinPacks();
  assert.deepEqual(packs.get('knowledge').scopeFields, ['prerequisites']);
  for (const name of ['novel', 'sources', 'brand']) assert.equal(Object.hasOwn(packs.get(name), 'scopeFields'), false, name);
  assert.deepEqual((await openWorkspace(await copyFixture('knowledge-book'), { packs })).registry.scopeFields, ['prerequisites']);
  assert.deepEqual((await openWorkspace(await copyFixture('serial-2level'), { packs })).registry.scopeFields, []);
});

test('a run widens the scope by prerequisites under the knowledge pack only', async () => {
  const critic = async (packs, fake) => {
    const root = await bookWithPrerequisite();
    if (fake) await useFakePack(root);
    else await writeFile(join(root, 'work.yaml'), (await readFile(join(root, 'work.yaml'), 'utf8')).replace('checkSets: []', 'checkSets: [knowledge.basic]'));
    const host = createFakeHost({ drafts: { membranes: '세포막은 바깥 경계다.' }, events: { membranes: DEFINES_MEMBRANE } });
    const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membranes' }, until: (o) => label(o) === 'model:critic' });
    return trail.at(-1).requests[0].payload.priorEvents.map((e) => `${e.nodeId}:${e.entityId}`);
  };
  assert.deepEqual(await critic(await loadBuiltinPacks(), false), ['what-is-a-cell:cell']);
  assert.deepEqual(await critic(fakePacks(), true), []);
});
