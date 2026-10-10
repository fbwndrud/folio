import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../../server/toolbox.js';
import { createHandlers } from '../../server/tools/handlers.js';
import { createViewerRegistry, BUILD_HINT } from '../../server/view/registry.js';
import { copyFixture, fakePacks, fixturePath, tempDir, useFakePack } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => out.error?.code;

function box(distDir = fixturePath('viewer-dist')) {
  const packs = fakePacks();
  const viewer = createViewerRegistry({ packs, distDir });
  return { tools: createToolbox({ packs, handlers: createHandlers({ packs, viewer }) }), viewer };
}

async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}

test('folio_view starts one loopback server per work and gives an address with the token', async () => {
  const { tools, viewer } = box();
  try {
    const root = await serial();
    const first = ok(await tools.call('folio_view', { root }));
    assert.deepEqual([first.status, first.reused, first.built, first.idleMinutes, first.hint], ['ready', false, true, 30, undefined]);
    const url = new URL(first.url);
    assert.equal(url.hostname, '127.0.0.1');
    const token = url.searchParams.get('token');
    const work = await fetch(new URL('/api/work', url), { headers: { 'x-folio-token': token } });
    assert.equal((await work.json()).title, '잠긴 문');
    const again = ok(await tools.call('folio_view', { root, nodeId: 'ep-004' }));
    assert.equal(again.reused, true);
    assert.equal(again.url, `${first.url}#/read/ep-004`);
    assert.equal(viewer.running.size, 1);
    const other = ok(await tools.call('folio_view', { root: await serial() }));
    assert.notEqual(new URL(other.url).port, url.port);
    assert.equal(viewer.running.size, 2);
  } finally { await viewer.closeAll(); }
});

test('folio_view refuses an unknown node and a work with the viewer turned off; without a build it says how to build', async () => {
  const { tools, viewer } = box(await tempDir('folio-nodist-'));
  try {
    const root = await serial();
    assert.equal(code(await tools.call('folio_view', { root, nodeId: 'ep-999' })), 'NODE_NOT_FOUND');
    const bare = ok(await tools.call('folio_view', { root }));
    assert.deepEqual([bare.built, bare.hint], [false, BUILD_HINT]);
    const off = await serial();
    await editYaml(off, (config) => { config.features = { viewer: false }; });
    const refused = await tools.call('folio_view', { root: off });
    assert.deepEqual([code(refused), refused.error.details.feature], ['FEATURE_DISABLED', 'viewer']);
  } finally { await viewer.closeAll(); }
});

test('a closed viewer leaves the list, and the next folio_view starts a fresh one', async () => {
  const { tools, viewer } = box();
  try {
    const root = await serial();
    const first = ok(await tools.call('folio_view', { root }));
    const url = new URL(first.url);
    const closed = [...viewer.running.values()][0];
    await fetch(new URL('/api/shutdown', url), { method: 'POST', headers: { 'x-folio-token': url.searchParams.get('token'), 'content-type': 'application/json' }, body: '{}' });
    await new Promise((resolve, reject) => {
      const guard = setTimeout(() => reject(new Error('not closed')), 5000);
      closed.then((server) => server.closed).then(() => { clearTimeout(guard); resolve(); });
    });
    assert.equal(viewer.running.size, 0);
    const second = ok(await tools.call('folio_view', { root }));
    assert.equal(second.reused, false);
    assert.notEqual(second.url, first.url);
  } finally { await viewer.closeAll(); }
});

test('reusing a viewer restarts its idle time, so the address it gives is alive', async () => {
  const viewer = createViewerRegistry({ packs: fakePacks(), distDir: fixturePath('viewer-dist'), idleMs: 1000 });
  try {
    const root = await serial();
    const first = await viewer.open(root);
    const url = new URL(first.url);
    const token = url.searchParams.get('token');
    await new Promise((r) => setTimeout(r, 700));
    const again = await viewer.open(root);
    assert.equal(again.reused, true);
    await new Promise((r) => setTimeout(r, 600));
    const work = await fetch(new URL('/api/work', url), { headers: { 'x-folio-token': token } });
    assert.equal(work.status, 200);
  } finally { await viewer.closeAll(); }
});
