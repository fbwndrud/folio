import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { startViewServer } from '../../server/view/http-server.js';
import { createViewerRegistry, preferredPort } from '../../server/view/registry.js';
import { copyFixture, fakePacks, fixturePath, tempDir, useFakePack } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

const DIST = fixturePath('viewer-dist');

/** 서버 하나를 띄워 token 을 붙여 GET/POST 하는 도우미. */
async function serve(root) {
  const server = await startViewServer({ root, packs: fakePacks(), distDir: DIST, onError: () => {} });
  const call = async (path, body) => {
    const res = await fetch(new URL(path, server.url), body === undefined
      ? { headers: { 'x-folio-token': server.token } }
      : { method: 'POST', headers: { 'x-folio-token': server.token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  return { server, call };
}

async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}

test('GET /api/graph gives nodes, entities and their links', async () => {
  const { server, call } = await serve(await serial());
  try {
    const graph = (await call('/api/graph')).json;
    assert.deepEqual(graph.kinds, ['character', 'promise']);
    assert.ok(graph.edges.some((e) => e.source === 'node:ep-001' && e.target === 'entity:hana'));
  } finally { await server.close(); }
});

test('a work keeps the same preferred port, and falls back to a free one when it is taken', async () => {
  const root = await serial();
  const port = preferredPort(root);
  assert.ok(port >= 41000 && port < 49000);
  assert.equal(preferredPort(`${root}/`), port);
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(port, '127.0.0.1', resolve));
  const viewer = createViewerRegistry({ packs: fakePacks(), distDir: DIST });
  try {
    const moved = new URL((await viewer.open(root)).url);
    assert.notEqual(Number(moved.port), port);
    await viewer.closeAll();
    await new Promise((resolve) => blocker.close(resolve));
    const home = new URL((await viewer.open(root)).url);
    assert.equal(Number(home.port), port);
  } finally {
    await viewer.closeAll();
    if (blocker.listening) await new Promise((resolve) => blocker.close(resolve));
  }
});

test('a symlink to a work and its real path open the same server', async () => {
  const root = await serial();
  const link = join(await tempDir('folio-link-'), 'work-link');
  await symlink(root, link);
  const viewer = createViewerRegistry({ packs: fakePacks(), distDir: DIST });
  try {
    const first = await viewer.open(link);
    const second = await viewer.open(root);
    assert.equal(second.reused, true);
    assert.equal(new URL(second.url).origin, new URL(first.url).origin);
    assert.equal(viewer.running.size, 1);
  } finally { await viewer.closeAll(); }
});

test('GET /api/promises gives the promise board', async () => {
  const { server, call } = await serve(await serial());
  try {
    const board = (await call('/api/promises')).json;
    assert.deepEqual(board.promises.map((p) => [p.entityId, p.stage, p.marks.length]), [['locked-door', null, 0]]);
    assert.equal(board.leaves.length, 6);
  } finally { await server.close(); }
});

test('GET /api/check-sets gives sets and checks, and the viewer has no route to change them', async () => {
  const { server, call } = await serve(await serial());
  try {
    const view = (await call('/api/check-sets')).json;
    assert.deepEqual(view.sets.filter((s) => s.selected).map((s) => s.id), ['fake.basic']);
    assert.equal((await call('/api/check-sets', { checkSets: [] })).status, 405);
  } finally { await server.close(); }
});

test('GET /api/sources, /api/sources/:id and /api/evidence/:node read sources and evidence without writing', async () => {
  const root = await copyFixture('knowledge-book');
  await editYaml(root, (config) => { config.packs = ['knowledge', 'sources']; });
  const { server, call } = await serve(root);
  try {
    assert.deepEqual((await call('/api/sources')).json.sources.map((s) => s.id), ['cell-notes']);
    assert.equal((await call('/api/sources/cell-notes')).json.source.title, '세포 강의 메모');
    assert.deepEqual((await call('/api/evidence/atp-section')).json.claims, []);
    assert.equal((await call('/api/sources/nope')).status, 404);
  } finally { await server.close(); }
});

test('GET /api/blocks gives anchors, references and broken ones', async () => {
  const { server, call } = await serve(await copyFixture('knowledge-book'));
  try {
    const blocks = (await call('/api/blocks')).json;
    assert.deepEqual(blocks.anchors.map((a) => a.id), ['fig-1-1', 'tbl-2-1']);
    assert.deepEqual(blocks.problems.map((p) => p.code), ['BLOCK_REF_BROKEN']);
  } finally { await server.close(); }
});

test('GET /api/blocks is FEATURE_DISABLED (403) when blocks, bibliography and termIndex are all off', async () => {
  const root = await copyFixture('knowledge-book');
  await editYaml(root, (config) => { config.features = { blocks: false, bibliography: false, termIndex: false }; });
  const { server, call } = await serve(root);
  try {
    const res = await call('/api/blocks');
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'FEATURE_DISABLED');
  } finally { await server.close(); }
});
