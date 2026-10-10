import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withWorkLock } from '../../core/run/work-lock.js';
import { withLockGate } from '../../core/run/lock-gate.js';
import { withLockGateFault } from '../../core/run/lock-gate-fault.js';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-gate-')); t.after(() => rm(root, {recursive:true, force:true}));
  await mkdir(join(root, '.folio', 'runs'), {recursive:true}); return root;
}
const gate = (root) => join(root, '.folio', 'runs', '.lock-gate.sqlite');
const lock = (root) => join(root, '.folio', 'runs', '.lock');
const moduleUrl = new URL('../../core/run/work-lock.js', import.meta.url).href;
const faultUrl = new URL('../../core/run/lock-gate-fault.js', import.meta.url).href;
function child(t, root, phase) {
  const program = `
    import {withWorkLock} from ${JSON.stringify(moduleUrl)};
    import {withLockGateFault} from ${JSON.stringify(faultUrl)};
    const wait = () => new Promise(done => process.once('message', done));
    try { await withLockGateFault(async phase => {
      if (phase === ${JSON.stringify(phase)}) { process.send(phase); await wait(); }
    }, () => withWorkLock(process.argv[1], async () => {process.send('entered'); await wait();})); process.send('done'); }
    catch(error) {process.send(error.code);} finally {process.disconnect();}`;
  const p = spawn(process.execPath, ['--input-type=module', '-e', program, root], {stdio:['ignore','ignore','pipe','ipc']});
  t.after(() => p.kill('SIGKILL'));
  const messages = []; const pending = [];
  p.on('message', message => { const resolve = pending.shift(); if (resolve) resolve(message); else messages.push(message); });
  return {p, next:() => messages.length ? Promise.resolve(messages.shift()) : new Promise(resolve => pending.push(resolve)), exit: new Promise(resolve => p.once('exit', (code, signal) => resolve({code, signal})))};
}
test('a damaged SQLite gate fails closed and is never erased', async (t) => {
  const root = await fixture(t); await writeFile(gate(root), 'synthetic corrupt gate');
  await assert.rejects(withWorkLock(root, () => assert.fail('entered damaged gate')), {code:'WORK_LOCK_GATE_FAILED'});
  assert.equal(await readFile(gate(root), 'utf8'), 'synthetic corrupt gate');
});
test('gate and journal symlinks are rejected', async (t) => {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const root = await fixture(t); const outside = join(root, 'synthetic'); await writeFile(outside, 'unchanged');
    await symlink(outside, gate(root)+suffix);
    await assert.rejects(withWorkLock(root, () => assert.fail('unsafe gate')), {code:'MANAGED_PATH_UNSAFE'});
    assert.equal(await readFile(outside, 'utf8'), 'unchanged');
  }
});
test('three OS children serialize dead-owner observation and protect the new live owner', {timeout:10000}, async (t) => {
  const root = await fixture(t); const deadPid = spawnSync(process.execPath, ['-e','']).pid;
  const dead = JSON.stringify({pid:deadPid, at:new Date().toISOString()}); await writeFile(lock(root), dead);
  const a = child(t, root, 'deadOwnerObserved'); assert.equal(await a.next(), 'deadOwnerObserved');
  const b = child(t, root, 'deadOwnerObserved'); assert.equal(await b.next(), 'WORK_LOCKED'); await b.exit;
  assert.equal(await readFile(lock(root), 'utf8'), dead);
  a.p.send('resume'); assert.equal(await a.next(), 'entered');
  const live = await readFile(lock(root), 'utf8'); const c = child(t, root, 'deadOwnerObserved');
  assert.equal(await c.next(), 'WORK_LOCKED'); await c.exit;
  assert.equal(await readFile(lock(root), 'utf8'), live);
  a.p.send('finish'); assert.equal(await a.next(), 'done'); assert.equal((await a.exit).code, 0);
  await withWorkLock(root, () => {});
});
test('SIGKILL of gate acquirer and dead-owner recovery releases OS gate and permits normal retry', {timeout:10000}, async (t) => {
  for (const phase of ['afterBegin', 'deadOwnerObserved', 'entered']) {
    const root = await fixture(t); const deadPid = spawnSync(process.execPath, ['-e','']).pid;
    await writeFile(lock(root), JSON.stringify({pid:deadPid, at:new Date().toISOString()}));
    const a = child(t, root, phase); assert.equal(await a.next(), phase); a.p.kill('SIGKILL'); assert.equal((await a.exit).signal, 'SIGKILL');
    await withWorkLock(root, () => {}); await assert.rejects(readFile(lock(root)), {code:'ENOENT'});
  }
});
test('alias-like concurrent flows fail bounded without blocking event-loop owner release', async (t) => {
  const root = await fixture(t); let finish; let ready;
  const started = new Promise(resolve => {ready=resolve;});
  const owner = withLockGateFault(async () => {ready(); await new Promise(resolve => {finish=resolve;});}, () => withLockGate(root, () => {}));
  await started;
  await assert.rejects(withLockGate(root, () => assert.fail('overlap')), {code:'WORK_LOCKED'});
  finish(); await owner; await withLockGate(root, () => {});
});

test('distinct root aliases contend on one gate without synchronous event-loop deadlock', async (t) => {
  const root = await fixture(t); const alias = join(root, 'alias'); await symlink(root, alias);
  let finish; let ready; let paused = false;
  const started = new Promise(resolve => {ready=resolve;});
  const owner = withLockGateFault(async (phase) => {
    if (phase !== 'afterBegin' || paused) return;
    paused = true; ready(); await new Promise(resolve => {finish=resolve;});
  }, () => withWorkLock(root, () => {}));
  await started;
  await assert.rejects(withWorkLock(alias, () => assert.fail('overlap')), {code:'WORK_LOCKED'});
  finish(); await owner; await withWorkLock(alias, () => {});
});
test('owner release waits past acquisition timeout for a paused OS gate holder and then permits retry', {timeout:10000}, async (t) => {
  const {setTimeout} = await import('node:timers/promises');
  const root = await fixture(t); let finish; let ready;
  const started = new Promise(resolve => {ready=resolve;});
  let completion = 'pending';
  const owner = withWorkLock(root, async () => {
    ready(); await new Promise(resolve => {finish=resolve;});
  }).then(() => {completion='released';}, error => {completion=error.code;});
  await started;
  const body = await readFile(lock(root), 'utf8');
  const b = child(t, root, 'afterBegin'); assert.equal(await b.next(), 'afterBegin');
  finish(); await setTimeout(650);
  assert.equal(completion, 'pending', 'release must not abandon a live owner lock after 500ms');
  assert.equal(await readFile(lock(root), 'utf8'), body);
  b.p.send('resume'); assert.equal(await b.next(), 'WORK_LOCKED'); await b.exit;
  await owner; assert.equal(completion, 'released');
  await assert.rejects(readFile(lock(root)), {code:'ENOENT'});
  await withWorkLock(root, () => {});
});
