import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readdir, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function snapshot(root) {
  const files = [];
  for (const name of (await readdir(root, { recursive: true })).sort()) {
    const path = join(root, name);
    const info = await lstat(path);
    files.push({ name, directory: info.isDirectory(), inode: info.ino, modified: info.mtimeMs, changed: info.ctimeMs,
      bytes: info.isFile() ? (await readFile(path)).toString('base64') : null });
  }
  return files;
}

/** Verify the installed command from a fresh tarball using a synthetic Resource-only folder. */
export async function verifyInstalledDoctor(sandbox, installed) {
  const command = join(sandbox, 'node_modules', '.bin', process.platform === 'win32' ? 'folio-doctor.cmd' : 'folio-doctor');
  await access(command);
  const root = join(sandbox, 'doctor-synthetic');
  await mkdir(root);
  const { createResourceStore } = await import(pathToFileURL(join(installed, 'core', 'resources', 'revisions.js')).href);
  const store = createResourceStore(root);
  const revision = await store.propose({ resourceId: 'synthetic-source', kind: 'document', owned: { bytes: Buffer.from('Synthetic installed doctor fixture'), mediaType: 'text/plain' } });
  await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  const before = await snapshot(root);
  // Windows npm creates a .cmd shim; verify its presence, then execute its packaged Node target without shell expansion.
  const invoke = (args) => spawnSync(process.platform === 'win32' ? process.execPath : command,
    process.platform === 'win32' ? [join(installed, 'bin', 'folio-doctor.js'), ...args] : args,
    { cwd: sandbox, encoding: 'utf8', timeout: 30000 });
  const json = invoke([root, '--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(json.stderr, '');
  assert.equal(JSON.parse(json.stdout).ok, true);
  const human = invoke([root]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Inspection complete/);
  const missing = invoke([join(root, 'missing'), '--json']);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).ok, false);
  assert.deepEqual(await snapshot(root), before);
  return { installedBinVerified: true, resourceOnlyVerified: true, pureReadVerified: true, missingRootExit: missing.status };
}
