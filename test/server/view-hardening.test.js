import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startViewServer } from '../../server/view/http-server.js';
import { copyFixture, fakePacks, fixturePath, useFakePack } from '../support/fixtures.js';

const DIST = fixturePath('viewer-dist');

async function serve(root) {
  const errors = [];
  const server = await startViewServer({ root, packs: fakePacks(), distDir: DIST, onError: (error) => errors.push(error) });
  const call = (path, options = {}) => fetch(new URL(path, server.url), {
    ...options,
    headers: { 'x-folio-token': server.token, ...options.headers },
  });
  return { server, call, errors };
}

async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}

test('HEAD on an API route is refused; HEAD on a page returns headers without a body', async () => {
  const { server, call, errors } = await serve(await serial());
  try {
    const api = await call('/api/work', { method: 'HEAD' });
    assert.equal(api.status, 405);
    assert.equal(await api.text(), '');
    const page = await call('/', { method: 'HEAD' });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.equal(await page.text(), '');
    assert.deepEqual(errors, []);
  } finally { await server.close(); }
});

test('Origin null cannot toggle a stage and leaves work.yaml byte-for-byte unchanged', async () => {
  const root = await serial();
  const before = await readFile(join(root, 'work.yaml'));
  const { server, call } = await serve(root);
  try {
    const stages = await (await call('/api/stages')).json();
    const response = await call('/api/stages', {
      method: 'POST', headers: { origin: 'null', 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'episode', stepId: 'critic', mode: 'off', baseDigest: stages.digest }),
    });
    assert.deepEqual([response.status, (await response.json()).error.code], [403, 'ORIGIN_NOT_ALLOWED']);
    assert.deepEqual(await readFile(join(root, 'work.yaml')), before);
  } finally { await server.close(); }
});

test('a sparse asset over 20 MiB is rejected with the asset code, without a server error', async () => {
  const root = await copyFixture('novel-3level');
  await truncate(join(root, 'assets', 'img-rooftop.svg'), 20 * 1024 * 1024 + 1);
  const { server, call, errors } = await serve(root);
  try {
    const response = await call('/api/assets/img-rooftop');
    const body = await response.json();
    assert.deepEqual([response.status, body.error.code, body.error.details.reason], [404, 'ASSET_FILE_UNAVAILABLE', 'too large']);
    assert.deepEqual(errors, []);
  } finally { await server.close(); }
});

test('a held work lock refuses a stage toggle and preserves work.yaml bytes', async () => {
  const root = await serial();
  const before = await readFile(join(root, 'work.yaml'));
  const { server, call } = await serve(root);
  try {
    const stages = await (await call('/api/stages')).json();
    const lockDir = join(root, '.folio', 'runs');
    await mkdir(lockDir, { recursive: true });
    await writeFile(join(lockDir, '.lock'), JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: 'held-test-lock' }));
    const response = await call('/api/stages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'episode', stepId: 'critic', mode: 'off', baseDigest: stages.digest }),
    });
    assert.deepEqual([response.status, (await response.json()).error.code], [409, 'WORK_LOCKED']);
    assert.deepEqual(await readFile(join(root, 'work.yaml')), before);
  } finally { await server.close(); }
});
