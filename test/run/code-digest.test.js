import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { workStatus } from '../../core/status.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { SOURCES_PACK_DIR } from '../../packs/sources/index.js';
import { SOURCES_CHECKERS } from '../../packs/sources/checkers/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, tempDir, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

async function setup() {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const configPath = join(root, 'work.yaml');
  const config = parseYaml(await readFile(configPath, 'utf8'));
  config.packs.push('sources');
  config.checkSets.push('sources.citations');
  await writeFile(configPath, stringifyYaml(config));
  const dir = await tempDir('folio-run-code-');
  await cp(SOURCES_PACK_DIR, dir, { recursive: true });
  const registry = async () => new Map([...fakePacks(), ['sources', await loadYamlPack(dir, { checkers: SOURCES_CHECKERS })]]);
  const change = async () => {
    const helper = join(dir, 'checkers', 'claims.js');
    await writeFile(helper, (await readFile(helper, 'utf8')).replace("- 0xfee0", "- 0xfee1"));
    return registry();
  };
  return { root, before: await registry(), change };
}

test('a helper change rejects a pending answer without committing the old draft', async () => {
  const { root, before, change } = await setup();
  const host = createFakeHost();
  const trail = await driveToEnd(() => createRunner({ root, packs: before }), host, {
    start: { node: 'stairwell' }, until: (out) => label(out) === 'model:critic',
  });
  const pending = trail.at(-1);
  const runner = createRunner({ root, packs: await change() });
  await assert.rejects(runner.resume({ runId: pending.runId, answers: host.answer(pending) }), { code: 'ANSWER_STALE' });
  assert.deepEqual(await openLedger(root, 'receipts').readAll(), []);
  assert.equal(label(await runner.run({ node: 'next' })), 'model:extract');
});

test('a helper change marks a committed node for recheck, keeps old records and clears after recheck', async () => {
  const { root, before, change } = await setup();
  const host = createFakeHost();
  await driveToEnd(() => createRunner({ root, packs: before }), host, {
    start: { node: 'stairwell' }, until: (out) => out.status === 'done',
  });
  assert.deepEqual((await workStatus(root, { packs: before })).recheck, []);
  const ledger = openLedger(root, 'receipts');
  const original = await ledger.readAll();
  const after = await change();
  const status = await workStatus(root, { packs: after });
  assert.deepEqual(status.recheck, [{ nodeId: 'stairwell', checks: [
    'sources.claim-supported', 'sources.numbers-match', 'sources.reliability',
  ] }]);
  assert.deepEqual(await ledger.readAll(), original, 'status must not rewrite the old ledger');
  await driveToEnd(() => createRunner({ root, packs: after }), host, {
    start: { node: 'stairwell', mode: 'recheck' }, until: (out) => out.status === 'done',
  });
  assert.deepEqual((await workStatus(root, { packs: after })).recheck, []);
  assert.deepEqual((await ledger.readAll()).slice(0, original.length), original);
});

test('changing a programmatic checker body marks the committed node without changing its declaration', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), {
    start: { node: 'stairwell' }, until: (out) => out.status === 'done',
  });
  const base = fakePacks().get('fake');
  const changed = { ...base, checks: base.checks.map((check) => check.id === 'fake.dead-on-stage' ? { ...check, run: () => [] } : check) };
  assert.deepEqual((await workStatus(root, { packs: new Map([['fake', changed]]) })).recheck,
    [{ nodeId: 'stairwell', checks: ['fake.dead-on-stage'] }]);
});
