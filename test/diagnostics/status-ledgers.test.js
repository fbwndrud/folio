import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { workStatus } from '../../core/status.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture } from '../support/fixtures.js';
import { snapshotFiles, unchangedInspection } from '../support/diagnostics.js';

const cli = join(import.meta.dirname, '../../bin/folio-doctor.js');

for (const [type, code] of [['tracking_unknown', 'TRACKING_RECORD_INVALID'], ['tracking_batch', 'LOCK_TRACKING_INTEGRITY']]) {
  async function damagedWork() {
    const root = await copyFixture('novel-3level');
    // The hash chain is genuine. Only the tracking record's meaning or receipt binding is invalid.
    await openLedger(root, 'tracking').append({ type });
    assert.deepEqual(await openLedger(root, 'tracking').verify(), { ok: true });
    return root;
  }

  test(`${code}: diagnosis preserves returned status failure without changing files`, async () => {
    const root = await damagedWork();
    const packs = await loadBuiltinPacks();
    const before = await snapshotFiles(root, '', true);
    const status = await workStatus(root, { packs });
    assert.equal(status.ledger.tracking.ok, false);
    assert.equal(status.ledger.tracking.code, code);
    assert.deepEqual(await snapshotFiles(root, '', true), before);
    const result = await unchangedInspection(root, packs);
    assert.equal(result.ok, false);
    assert.deepEqual(result.checks.find((c) => c.name === 'writing-status:tracking'), {
      name: 'writing-status:tracking', status: 'error', message: 'Activity record could not be verified for writing.', details: status.ledger.tracking,
    });
    assert.ok(!result.checks.some((c) => c.message === 'Writing status verified.'));
    assert.ok(result.actions.some((action) => action.includes('Stop writing') && action.includes('backup')));
  });

  test(`${code}: JSON and human CLI exit 1 while preserving the work`, async () => {
    const root = await damagedWork();
    const before = await snapshotFiles(root, '', true);
    const json = spawnSync(process.execPath, [cli, root, '--json'], { encoding: 'utf8' });
    assert.equal(json.status, 1, json.stderr);
    assert.equal(json.stderr, '');
    const result = JSON.parse(json.stdout);
    assert.equal(result.ok, false);
    assert.ok(result.checks.some((c) => c.status === 'error' && c.details?.code === code));
    const human = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' });
    assert.equal(human.status, 1, human.stderr);
    assert.ok(human.stdout.includes(code));
    assert.match(human.stdout, /Next: Stop writing/);
    assert.deepEqual(await snapshotFiles(root, '', true), before);
  });
}
