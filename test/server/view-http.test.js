import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startViewServer } from '../../server/view/http-server.js';
import { copyFixture, fakePacks, fixturePath, tempDir, useFakePack } from '../support/fixtures.js';

const DIST = fixturePath('viewer-dist');

async function serve(root, options = {}) {
  const errors = [];
  const server = await startViewServer({ root, packs: fakePacks(), distDir: DIST, onError: (e) => errors.push(e), ...options });
  const call = async (path, { method = 'GET', body, token = server.token, headers = {} } = {}) => {
    const res = await fetch(new URL(path, server.url), {
      method, headers: { ...(token ? { 'x-folio-token': token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, headers: res.headers, json: type.startsWith('application/json') ? await res.json() : null, text: type.startsWith('application/json') ? null : await res.text() };
  };
  return { server, call, errors };
}

/** Host 머리글이나 풀지 않은 경로를 그대로 보내는 요청(fetch 는 둘 다 고쳐 보낸다). */
const raw = (server, path, headers = {}) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: server.port, path, headers: { 'x-folio-token': server.token, ...headers } }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, data }));
  });
  req.on('error', reject);
  req.end();
});

/** 서버는 프로세스를 붙잡지 않으므로(unref) 닫힐 때까지 기다리는 동안 타이머 하나로 붙잡아 둔다. */
const waitClosed = (server) => new Promise((resolve, reject) => {
  const guard = setTimeout(() => reject(new Error('server did not close')), 5000);
  server.closed.then(() => { clearTimeout(guard); resolve(); });
});

async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}

test('the API needs the token, and answers only for the loopback host it was bound to', async () => {
  const { server, call } = await serve(await serial());
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal((await call('/api/work', { token: null })).json.error.code, 'TOKEN_INVALID');
    assert.equal((await call('/api/work', { token: 'x'.repeat(32) })).status, 401);
    const work = await call('/api/work');
    assert.deepEqual([work.status, work.json.title, work.headers.get('cache-control'), work.headers.get('x-content-type-options')], [200, '잠긴 문', 'no-store', 'nosniff']);
    const rebound = await raw(server, '/api/work', { host: `evil.example:${server.port}` });
    assert.deepEqual([rebound.status, JSON.parse(rebound.data).error.code], [421, 'HOST_NOT_ALLOWED']);
    assert.equal((await raw(server, '/api/work', { host: `localhost:${server.port}` })).status, 200);
  } finally { await server.close(); }
});

test('reading, entity, receipts and stages routes answer with core/view data; unknown ids and routes are 404', async () => {
  const { server, call } = await serve(await serial());
  try {
    assert.equal((await call('/api/nodes/ep-001')).json.segments[0].entityId, 'hana');
    assert.equal((await call('/api/entities/hana')).json.entity.name, '하나');
    assert.equal((await call('/api/receipts')).json.nodes.length, 8);
    assert.equal((await call('/api/receipts/ep-001')).json.receipt, null);
    assert.equal((await call('/api/stages')).json.levels.length, 2);
    assert.deepEqual([(await call('/api/nodes/nope')).status, (await call('/api/nodes/nope')).json.error.code], [404, 'NODE_NOT_FOUND']);
    assert.equal((await call('/api/entities/%E0%A4%A')).json.error.code, 'ROUTE_INVALID');
    assert.equal((await call('/api/nodes/a%2Fb')).json.error.code, 'ROUTE_INVALID');
    assert.deepEqual([(await call('/api/teleport')).status, (await call('/api/work', { method: 'POST', body: {} })).status], [404, 405]);
  } finally { await server.close(); }
});

test('server side: a locked stage toggle is refused (403 STEP_LOCKED) and work.yaml is not touched; a free one is written', async () => {
  const root = await serial();
  const { server, call } = await serve(root);
  try {
    const before = await readFile(join(root, 'work.yaml'), 'utf8');
    const { digest } = (await call('/api/stages')).json;
    for (const [level, stepId] of [['episode', 'commit'], ['episode', 'facts'], ['episode', 'draft'], ['arc', 'commit']]) {
      const out = await call('/api/stages', { method: 'POST', body: { level, stepId, mode: 'off', baseDigest: digest } });
      assert.deepEqual([out.status, out.json.error.code], [403, 'STEP_LOCKED'], `${level}.${stepId}`);
    }
    assert.equal(await readFile(join(root, 'work.yaml'), 'utf8'), before);
    const done = await call('/api/stages', { method: 'POST', body: { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest } });
    assert.deepEqual([done.status, done.json.mode], [200, 'off']);
    assert.match(await readFile(join(root, 'work.yaml'), 'utf8'), /critic:\n {8}mode: off/);
    assert.equal((await call('/api/stages', { method: 'POST', body: { level: 'episode', stepId: 'critic', mode: 'on', baseDigest: digest } })).status, 409);
  } finally { await server.close(); }
});

test('POST needs JSON from the same origin, within 16KiB', async () => {
  const { server, call } = await serve(await serial());
  try {
    assert.equal((await call('/api/stages', { method: 'POST', body: 'level=episode', headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await call('/api/stages', { method: 'POST', body: '{bad' })).json.error.code, 'BAD_JSON');
    assert.equal((await call('/api/stages', { method: 'POST', body: {}, headers: { origin: 'http://evil.example' } })).json.error.code, 'ORIGIN_NOT_ALLOWED');
    assert.equal((await call('/api/stages', { method: 'POST', body: { reason: 'x'.repeat(17 * 1024) } })).status, 413);
    assert.equal((await call('/api/stages', { method: 'POST', body: { stepId: 'critic' } })).json.error.code, 'STAGE_TOGGLE_INVALID');
  } finally { await server.close(); }
});

test('an unexpected error is INTERNAL_ERROR without the Node message or paths; the server keeps it for itself', async () => {
  const root = await serial();
  await rm(join(root, 'tree'), { recursive: true });
  await writeFile(join(root, 'tree'), 'not a folder');
  const { server, call, errors } = await serve(root);
  try {
    const out = await call('/api/work');
    assert.deepEqual([out.status, out.json], [500, { error: { code: 'INTERNAL_ERROR', message: 'internal error' } }]);
    assert.equal(errors.length, 1);
    assert.doesNotMatch(JSON.stringify(out.json), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { await server.close(); }
});

test('pictures come only from assets/ inside the work: no escaping paths, no links, only image types', async () => {
  const root = await copyFixture('novel-3level');
  const { server, call } = await serve(root);
  try {
    const picture = await call('/api/assets/img-rooftop');
    assert.deepEqual([picture.status, picture.headers.get('content-type')], [200, 'image/svg+xml']);
    assert.match(picture.headers.get('content-security-policy'), /sandbox/);
    const meta = (id, file) => writeFile(join(root, 'assets', `${id}.yaml`), `id: ${id}\nfile: ${file}\n`);
    await meta('escape', '../work.yaml');
    await meta('absolute', join(root, 'work.yaml'));
    await meta('text', 'notes.txt');
    await writeFile(join(root, 'assets', 'notes.txt'), 'x');
    await symlink(join(root, 'work.yaml'), join(root, 'assets', 'linked.png'));
    await meta('linked', 'linked.png');
    for (const [id, reason] of [['escape', 'path'], ['absolute', 'path'], ['text', 'type'], ['linked', 'link']]) {
      const out = await call(`/api/assets/${id}`);
      assert.deepEqual([out.status, out.json.error.code, out.json.error.details.reason], [404, 'ASSET_FILE_UNAVAILABLE', reason], id);
    }
    assert.equal((await call('/api/assets/none')).json.error.code, 'ASSET_NOT_FOUND');
  } finally { await server.close(); }
});

test('the built viewer is served from its folder only, with a page CSP; without a build a fallback page explains how', async () => {
  const { server, call } = await serve(await serial());
  try {
    const page = await call('/', { token: null });
    assert.match(page.text, /viewer fixture/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal((await call('/app.js', { token: null })).headers.get('content-type'), 'text/javascript; charset=utf-8');
    for (const path of ['/..%2Fapp.js', '/%2e%2e%2f%2e%2e%2fpackage.json', '/a%5Capp.js', '/missing.js', '/work.yaml']) {
      assert.equal((await raw(server, path)).status, 404, path);
    }
    assert.equal((await call('/api/work', { method: 'DELETE' })).status, 405);
  } finally { await server.close(); }
  const empty = await tempDir('folio-dist-');
  const bare = await serve(await serial(), { distDir: empty });
  try {
    assert.match((await bare.call('/', { token: null })).text, /npm --prefix viewer run build/);
  } finally { await bare.server.close(); }
});

test('the server closes on shutdown, on close() and after being idle', async () => {
  const first = await serve(await serial());
  assert.deepEqual((await first.call('/api/shutdown', { method: 'POST', body: {} })).json, { closing: true });
  await waitClosed(first.server);
  await assert.rejects(fetch(first.server.url));
  const idle = await serve(await serial(), { idleMs: 50 });
  await waitClosed(idle.server);
  await assert.rejects(fetch(idle.server.url));
});
