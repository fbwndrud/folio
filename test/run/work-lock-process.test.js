import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withWorkLock } from '../../core/run/work-lock.js';

const childProgram = `
  import { withWorkLock } from ${JSON.stringify(new URL('../../core/run/work-lock.js', import.meta.url).href)};
  Date.now = () => Number(process.env.SKEWED_NOW);
  if (process.env.INJECT_KILL_ERROR) process.kill = () => {
    const error = new Error('unexpected PID probe failure');
    error.code = 'EINVAL';
    throw error;
  };
  try {
    await withWorkLock(process.argv[1], () => { console.log('second writer entered'); });
  } catch (error) {
    console.log(error.code);
  }
`;

async function workRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.folio', 'runs'), { recursive: true });
  return root;
}

const lockPath = (root) => join(root, '.folio', 'runs', '.lock');

test('a live parent remains locked to a child whose clock is over ten minutes ahead', async (t) => {
  const root = await workRoot(t);
  let release;
  let signalReady;
  const ready = new Promise((done) => { signalReady = done; });
  const parent = withWorkLock(root, () => new Promise((done) => { release = done; signalReady(); }));
  try {
    // The callback is reached only after the durable lock has been acquired.
    await Promise.race([ready, parent]);
    assert.equal(typeof release, 'function');
    const original = await readFile(lockPath(root), 'utf8');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram, root], {
      encoding: 'utf8',
      env: { ...process.env, SKEWED_NOW: String(Date.now() + 600001) },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /WORK_LOCKED/);
    assert.doesNotMatch(child.stdout, /second writer entered/);
    assert.equal(await readFile(lockPath(root), 'utf8'), original);
  } finally {
    release?.();
    await parent;
  }
});

test('only a valid lock belonging to a dead PID is recovered', async (t) => {
  const root = await workRoot(t);
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
  assert.ok(deadPid > 0);
  await writeFile(lockPath(root), JSON.stringify({ pid: deadPid, at: new Date().toISOString() }));
  let entered = false;
  await withWorkLock(root, () => { entered = true; });
  assert.equal(entered, true);
  await assert.rejects(readFile(lockPath(root)), { code: 'ENOENT' });
});

test('backward clock movement does not permit takeover of a live PID', async (t) => {
  const root = await workRoot(t);
  const body = JSON.stringify({ pid: process.pid, at: new Date(Date.now() + 600001).toISOString() });
  await writeFile(lockPath(root), body);
  await assert.rejects(withWorkLock(root, () => assert.fail('second writer entered')), { code: 'WORK_LOCKED' });
  assert.equal(await readFile(lockPath(root), 'utf8'), body);
});

test('malformed lock bodies fail closed, even with a dead-looking PID', async (t) => {
  const root = await workRoot(t);
  const malformed = ['{', '{}', JSON.stringify({ pid: -1, at: new Date().toISOString() }),
    JSON.stringify({ pid: 2147483648, at: new Date().toISOString() }),
    JSON.stringify({ pid: 999999999, at: 'not a timestamp' })];
  for (const body of malformed) {
    await writeFile(lockPath(root), body);
    await assert.rejects(withWorkLock(root, () => assert.fail('second writer entered')), { code: 'WORK_LOCKED' });
    assert.equal(await readFile(lockPath(root), 'utf8'), body);
  }
});

test('an unexpected PID probe error leaves the existing lock untouched', async (t) => {
  const root = await workRoot(t);
  const body = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  await writeFile(lockPath(root), body);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram, root], {
    encoding: 'utf8',
    env: { ...process.env, SKEWED_NOW: String(Date.now()), INJECT_KILL_ERROR: '1' },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /WORK_LOCKED/);
  assert.doesNotMatch(child.stdout, /second writer entered/);
  assert.equal(await readFile(lockPath(root), 'utf8'), body);
});

test('a possible reused PID is conservatively protected despite an ancient timestamp', async (t) => {
  const root = await workRoot(t);
  const body = JSON.stringify({ pid: process.pid, at: '2000-01-01T00:00:00.000Z' });
  await writeFile(lockPath(root), body);
  await assert.rejects(withWorkLock(root, () => assert.fail('second writer entered')), { code: 'WORK_LOCKED' });
  assert.equal(await readFile(lockPath(root), 'utf8'), body);
});

test('a stopped owner remains protected and can resume its work', { skip: process.platform === 'win32' }, async (t) => {
  const root = await workRoot(t);
  const program = `
    import { withWorkLock } from ${JSON.stringify(new URL('../../core/run/work-lock.js', import.meta.url).href)};
    await withWorkLock(process.argv[1], async () => {
      const keepAlive = setInterval(() => {}, 1000);
      const terminated = new Promise((done) => process.once('SIGTERM', done));
      console.log('held');
      await terminated;
      clearInterval(keepAlive);
      console.log('resumed');
    });
  `;
  const owner = spawn(process.execPath, ['--input-type=module', '-e', program, root], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { owner.kill('SIGCONT'); owner.kill('SIGKILL'); });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    owner.once('error', reject);
    owner.once('exit', (code) => reject(new Error(`owner exited before ready: ${code}`)));
    owner.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('held')) resolve();
    });
  });
  await ready;
  const body = await readFile(lockPath(root), 'utf8');
  assert.equal(owner.kill('SIGSTOP'), true);
  try {
    await assert.rejects(withWorkLock(root, () => assert.fail('second writer entered')), { code: 'WORK_LOCKED' });
    assert.equal(await readFile(lockPath(root), 'utf8'), body);
  } finally {
    owner.kill('SIGCONT');
  }
  const exited = new Promise((resolve) => owner.once('exit', resolve));
  owner.kill('SIGTERM');
  assert.equal(await exited, 0);
  assert.match(output, /resumed/);
  await assert.rejects(readFile(lockPath(root)), { code: 'ENOENT' });
});
