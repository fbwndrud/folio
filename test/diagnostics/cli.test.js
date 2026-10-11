import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempDir } from '../support/fixtures.js';
import { resourceFixture } from '../support/view-resources.js';
import { snapshotFiles } from '../support/diagnostics.js';

const repo = join(import.meta.dirname, '../..');
const run = (args) => spawnSync(process.execPath, [join(repo, 'bin/folio-doctor.js'), ...args], { encoding: 'utf8' });

test('doctor has a packaged command and a source convenience script', async () => {
  const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  assert.equal(manifest.bin['folio-doctor'], 'bin/folio-doctor.js');
  assert.equal(manifest.bin['linivera-doctor'], 'bin/linivera-doctor.js');
  assert.equal(manifest.scripts.doctor, 'node bin/linivera-doctor.js');
});

test('CLI supports human and JSON output without touching the work', async () => {
  const root = await tempDir('folio-doctor-cli-');
  await resourceFixture(root);
  const before = await snapshotFiles(root, '', true);
  const json = run([root, '--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(json.stderr, '');
  const result = JSON.parse(json.stdout);
  assert.equal(result.ok, true);
  assert.ok(result.checks.some((c) => c.status === 'warning'));
  const human = run([root]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Inspection complete/);
  assert.match(human.stdout, /Next:/);
  assert.deepEqual(await snapshotFiles(root, '', true), before);
});

test('CLI errors exit 1 with structured details including absent root', async () => {
  const root = await tempDir('folio-doctor-cli-error-');
  const absent = run([join(root, 'absent'), '--json']);
  assert.equal(absent.status, 1);
  assert.equal(JSON.parse(absent.stdout).checks[0].details.code, 'ENOENT');
  await resourceFixture(root);
  await writeFile(join(root, '.folio', 'ledger', 'workspace-state.jsonl'), 'synthetic damage');
  const bad = run([root, '--json']);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
  assert.match(run([root]).stdout, /Inspection found errors/);
});

test('CLI rejects absent, extra, repeated and unknown arguments with usage exit 2', () => {
  for (const args of [[], ['--json'], ['a', 'b'], ['a', '--bad'], ['a', '--json', '--json'], ['-x']]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Usage: linivera-doctor/);
  }
});
