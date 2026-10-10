import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startViewServer } from '../../server/view/http-server.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fakePacks, fixturePath, useFakePack } from '../support/fixtures.js';

async function serve(root) {
  const server = await startViewServer({ root, packs: fakePacks(), distDir: fixturePath('viewer-dist'), onError: () => {} });
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(new URL(path, server.url), {
      method, headers: { 'x-folio-token': server.token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };
  return { server, call };
}
const waitClosed = (server) => new Promise((resolve, reject) => {
  const guard = setTimeout(() => reject(new Error('server did not close')), 5000);
  server.closed.then(() => { clearTimeout(guard); resolve(); });
});
async function setViewer(root, on) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, features: { ...(config.features ?? {}), viewer: on } }));
}

test('C0: turning the viewer feature off makes a running viewer refuse with FEATURE_DISABLED and close itself', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const { server, call } = await serve(root);
  try {
    assert.equal((await call('/api/work')).status, 200);
    await setViewer(root, false);
    const refused = await call('/api/nodes/ep-001');
    assert.deepEqual([refused.status, refused.json.error.code, refused.json.error.details.feature], [403, 'FEATURE_DISABLED', 'viewer']);
    await waitClosed(server);
  } finally { await server.close(); }
});

test('C0: an unreadable work.yaml reaches the screen error instead of closing the viewer; shutdown works with the feature off', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const { server, call } = await serve(root);
  try {
    const good = await readFile(join(root, 'work.yaml'), 'utf8');
    await writeFile(join(root, 'work.yaml'), 'levels: [');
    const broken = await call('/api/work');
    assert.equal(broken.status >= 400, true);
    assert.notEqual(broken.json.error.code, 'FEATURE_DISABLED');
    await writeFile(join(root, 'work.yaml'), good);
    assert.equal((await call('/api/work')).status, 200, 'still running');
    await setViewer(root, false);
    assert.deepEqual((await call('/api/shutdown', { method: 'POST', body: {} })).json, { closing: true });
    await waitClosed(server);
  } finally { await server.close(); }
});
