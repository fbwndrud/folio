import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';

async function brokenLedgerWork(name) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  await mkdir(join(root, '.folio', 'ledger'), { recursive: true });
  await writeFile(join(root, '.folio', 'ledger', `${name}.jsonl`), 'not json\n');
  return root;
}

async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, features: { ...(config.features ?? {}), ...features } }));
}

test('a broken evidence ledger still stops every run (LEDGER_TAMPERED, the lock is not weakened) but names the ledger, the feature and the way out', async () => {
  const root = await brokenLedgerWork('evidence');
  const runner = () => createRunner({ root, packs: fakePacks() });
  await assert.rejects(runner().run({ node: 'stairwell' }), (error) => {
    assert.equal(error.code, 'LEDGER_TAMPERED');
    assert.equal(error.details.ledger, 'evidence');
    assert.equal(error.details.feature, 'evidence');
    assert.match(error.details.hint, /features\.evidence/);
    return true;
  });
  await setFeatures(root, { evidence: false });
  assert.equal((await runner().run({ node: 'stairwell' })).status, 'needs_model', 'turning the feature off is the author’s way to keep writing');
});

test('a broken occurrences ledger stops runs only while occurrenceScope reads it, with the same details', async () => {
  const root = await brokenLedgerWork('occurrences');
  const runner = () => createRunner({ root, packs: fakePacks() });
  assert.equal((await runner().run({ node: 'stairwell' })).status, 'needs_model', 'occurrenceScope is off by default: the runner does not read the ledger');
  await setFeatures(root, { occurrenceScope: true });
  await assert.rejects(runner().run({ node: 'stairwell' }), (error) => {
    assert.equal(error.code, 'LEDGER_TAMPERED');
    assert.equal(error.details.feature, 'occurrenceScope');
    assert.equal(error.details.ledger, 'occurrences');
    return true;
  });
});

test('the receipts ledger is never feature-gated: a broken one stops runs without a feature hint', async () => {
  const root = await brokenLedgerWork('receipts');
  await assert.rejects(createRunner({ root, packs: fakePacks() }).run({ node: 'stairwell' }), (error) => {
    assert.equal(error.code, 'LEDGER_TAMPERED');
    assert.equal(error.details.feature, undefined);
    return true;
  });
});
