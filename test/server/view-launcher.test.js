import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchError, startWorkViewer, waitForViewer } from '../../server/view/launcher.js';
import { EXPORT_MARKER } from '../../server/view/export.js';
import { copyFixture, tempDir, fixturePath, fakePacks, useFakePack } from '../support/fixtures.js';

const ENTRY = fileURLToPath(new URL('../../bin/folio-view.js', import.meta.url));
function cli(args, cwd) {
  const child = spawn(process.execPath, [ENTRY, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = once(child, 'exit').then(([code, signal]) => ({ code, signal, stdout, stderr }));
  const ready = new Promise((resolve, reject) => {
    const guard = setTimeout(() => { child.kill(); reject(Error('viewer startup timed out')); }, 10_000);
    const inspect = () => { const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\S*/); if (match) { clearTimeout(guard); resolve(match[0]); } };
    child.stdout.on('data', inspect);
    child.once('exit', () => { clearTimeout(guard); resolve(null); });
  });
  return { child, done, ready };
}

test('launcher help and invalid input work from another current directory', async () => {
  const cwd = await tempDir();
  const help = await cli(['--help'], cwd).done;
  assert.equal(help.code, 0); assert.match(help.stdout, /npm run preview/);
  const invalid = await cli(['--preview', '--section', 'x', cwd], cwd).done;
  assert.equal(invalid.code, 1); assert.match(invalid.stderr, /Choose one/);
  const missing = await cli(['--preview', join(cwd, 'absent')], cwd).done;
  assert.equal(missing.code, 1); assert.match(missing.stderr, /not a Linivera viewer export/);
});

test('standalone work viewing preserves tokens and cleans lifecycle listeners on shutdown', async (t) => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const service = await startWorkViewer(root, { nodeId: 'ep-001', distDir: fixturePath('viewer-dist'), packs: fakePacks() });
  t.after(() => service.close());
  const host = new EventEmitter();
  const done = waitForViewer(service, host);
  const url = new URL(service.url);
  assert.equal(url.hash, '#/read/ep-001');
  assert.equal((await fetch(new URL('/api/work', url))).status, 401);
  const headers = { 'x-folio-token': url.searchParams.get('token'), 'content-type': 'application/json' };
  assert.equal((await fetch(new URL('/api/work', url), { headers })).status, 200);
  assert.equal((await fetch(new URL('/api/shutdown', url), { method: 'POST', headers, body: '{}' })).status, 200);
  await done;
  assert.equal(host.listenerCount('SIGTERM'), 0); assert.equal(host.listenerCount('SIGINT'), 0);
});

test('unprepared screens fail with setup guidance before starting a work server', async () => {
  await assert.rejects(startWorkViewer(await copyFixture('serial-2level'), { distDir: await tempDir() }), { code: 'VIEWER_NOT_BUILT' });
});

test('preview accepts paths with spaces and terminates cleanly', async (t) => {
  const cwd = await tempDir();
  const root = join(cwd, 'read only copy'); await mkdir(root);
  await writeFile(join(root, EXPORT_MARKER), 'made by the folio viewer export; synthetic fixture\n');
  await writeFile(join(root, 'index.html'), '<html><body>Synthetic copy</body></html>');
  const out = cli(['--preview', 'read only copy'], cwd);
  t.after(() => out.child.kill());
  const url = await out.ready;
  assert.equal((await fetch(url)).status, 200);
  out.child.kill('SIGTERM');
  const ended = await out.done;
  // Windows termination signals are translated to process termination by Node.
  if (process.platform !== 'win32') { assert.equal(ended.code, 0); assert.equal(ended.signal, null); }
  await assert.rejects(fetch(url));
});

test('setup errors explain how to recover without leaking local paths', () => {
  assert.match(launchError({ code: 'VIEWER_NOT_BUILT' }), /npm run setup/);
  assert.doesNotMatch(launchError({ code: 'ENOENT', message: '/private/path' }), /private/);
});

test('the documented npm viewer command does not accidentally invoke a preview prehook', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const args = ['run', 'viewer', '--', '--help'];
  const child = process.env.npm_execpath
    ? spawn(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr); assert.match(stdout, /Linivera viewer/);
  assert.doesNotMatch(stdout, /> node bin\/linivera-view.js --preview/);
});
