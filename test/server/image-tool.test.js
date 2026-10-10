import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { PNG_A } from '../support/images.js';
import { createImageHost, illustratedWork } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => out.error?.code;

test('folio_image start → resume → decide commits one picture through the toolbox; pending shows the open run', async () => {
  const root = await illustratedWork();
  const tools = createToolbox({ packs });
  const host = await createImageHost();
  assert.equal(ok(await tools.call('folio_image', { root, op: 'pending' })), null);
  let out = ok(await tools.call('folio_image', { root, op: 'start', assetId: 'ep-001-door', nodeId: 'ep-001' }));
  const pending = ok(await tools.call('folio_image', { root, op: 'pending' }));
  assert.deepEqual([pending.runId, pending.assetId, pending.state, pending.outcome.requests[0].purpose], [out.runId, 'ep-001-door', 'awaiting_model', 'image_brief']);
  while (out.status === 'needs_model') out = ok(await tools.call('folio_image', { root, op: 'resume', runId: out.runId, answers: await host.answer(out) }));
  assert.equal(out.question.kind, 'image_approval');
  const done = ok(await tools.call('folio_image', { root, op: 'decide', runId: out.runId, action: 'approve' }));
  assert.equal(done.status, 'done');
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-door.png')), PNG_A);
});

test('folio_image refuses wrong arguments per op and works only with the image pack and the images feature', async () => {
  const root = await illustratedWork();
  const tools = createToolbox({ packs });
  assert.equal(code(await tools.call('folio_image', { root, op: 'start' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'start', assetId: 'a', runId: 'x' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'decide', runId: 'imgrun-x' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'resume', runId: '../x', answers: {} })), 'IMAGE_RUN_ID_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'paint' })), 'TOOL_INPUT_INVALID');
  const off = await illustratedWork((c) => ({ ...c, features: { images: false } }));
  assert.equal(code(await tools.call('folio_image', { root: off, op: 'start', assetId: 'a' })), 'FEATURE_DISABLED');
});
