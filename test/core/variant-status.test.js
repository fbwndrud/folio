import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { workStatus } from '../../core/status.js';
import { fakePacks } from '../support/fixtures.js';
import { fakePack } from '../support/fake-pack.js';
import { loadVariantsPack } from '../../packs/variants/index.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { commitMain, patchWork, putVariantFile, variantWork } from '../support/variant-work.js';

const ORIGINAL = '하나는 지하실 끝에서 잠긴 문을 발견했다.\n';
const ENGLISH = 'Hana found the locked door at the end of the cellar.\n';
const MAIN_FILE = ['tree', '01-arc-awakening', '01-ep-001.md'];
const status = (root) => workStatus(root, { packs: fakePacks() });

async function translated() {
  const root = await variantWork();
  await commitMain(root, 'ep-001', ORIGINAL);
  await commitMain(root, 'ep-002', '도윤은 문을 두드렸다.\n');
  const host = createFakeHost({ drafts: { '*': () => ENGLISH } });
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'ep-001', variant: 'en' }, until: (o) => o.status === 'done' });
  return root;
}

test('status.variants is null with the feature off or no variant declared', async () => {
  assert.equal((await status(await variantWork({ variants: [] }))).variants, null);
  assert.equal((await status(await variantWork({ features: { variants: false } }))).variants, null);
});

test('status.variants counts commits per variant and lists the done originals still missing a variant; the original status is untouched', async () => {
  const root = await translated();
  const s = await status(root);
  assert.deepEqual(s.variants, { en: { committed: 1, stale: [], drift: [], missing: ['ep-002'] } });
  assert.deepEqual([s.stale, s.drift, s.recheck], [[], [], []]);
});

test('a hand edit of the variant file is variant drift, never original drift', async () => {
  const root = await translated();
  await putVariantFile(root, 'en', 'ep-001.md', 'Hana found it.\n');
  const s = await status(root);
  assert.deepEqual(s.variants.en.drift.map((d) => [d.nodeId, d.code, d.path]), [['ep-001', 'HAND_EDITED', 'variants/en/ep-001.md']]);
  assert.deepEqual(s.drift, []);
  await rm(join(root, 'variants', 'en', 'ep-001.md'));
  assert.deepEqual((await status(root)).variants.en.drift, [{ nodeId: 'ep-001', code: 'VARIANT_FILE_MISSING' }]);
});

test('attack: stale and recheck do not cross variants — a changed original or term map marks the variant only, and next-recheck never picks a variant', async () => {
  const root = await translated();
  await putVariantFile(root, 'en', 'terms.yaml', 'terms:\n  - { from: 하나, to: Hana }\n');
  let s = await status(root);
  assert.deepEqual(s.variants.en.stale.map((x) => x.reasons.map((r) => [r.kind, r.id])), [[['terms', 'en']]]);
  assert.deepEqual([s.stale, s.recheck], [[], []], 'the original is not stale because its variant used a term map');
  assert.deepEqual(await createRunner({ root, packs: fakePacks() }).run({ node: 'next-recheck', mode: 'recheck' }), { status: 'idle' });
  const path = join(root, ...MAIN_FILE);
  await writeFile(path, (await readFile(path, 'utf8')).replace('발견했다', '찾았다'));
  s = await status(root);
  assert.deepEqual(s.variants.en.stale[0].reasons.map((r) => r.kind), ['original', 'terms']);
  assert.deepEqual(s.drift.map((d) => [d.nodeId, d.code]), [['ep-001', 'HAND_EDITED']], 'the original drift is the original’s own');
  assert.deepEqual(s.variants.en.drift, []);
});

test('an open variant run shows its variant in activeRun; with the feature off status.variants is null', async () => {
  const root = await translated();
  const open = await createRunner({ root, packs: fakePacks() }).run({ node: 'ep-002', variant: 'en' });
  assert.deepEqual((await status(root)).activeRun, { runId: open.runId, nodeId: 'ep-002', state: 'awaiting_model', variant: 'en' });
  await patchWork(root, { features: { variants: false } });
  assert.equal((await status(root)).variants, null);
});

test('a disabled variant does not report unread committed text as a live hand edit', async () => {
  const root = await translated();
  const open = await createRunner({ root, packs: fakePacks() }).run({ node: 'ep-001', variant: 'en' });
  assert.equal(open.status, 'needs_model');
  assert.deepEqual((await status(root)).drift, []);

  await patchWork(root, { features: { variants: false } });
  await putVariantFile(root, 'en', 'terms.yaml', 'terms: [broken\n');
  const disabled = await status(root);
  assert.equal(disabled.variants, null);
  assert.deepEqual(disabled.drift, []);
  assert.deepEqual(disabled.activeRun, { runId: open.runId, nodeId: 'ep-001', state: 'awaiting_model', variant: 'en' });
});

test('an enabled variant live hand edit stays tagged in the shared drift list', async () => {
  const root = await translated();
  const open = await createRunner({ root, packs: fakePacks() }).run({ node: 'ep-001', variant: 'en' });
  await putVariantFile(root, 'en', 'ep-001.md', 'Translator edit.\n');
  assert.deepEqual((await status(root)).drift, [
    { nodeId: 'ep-001', code: 'CHANGED_DURING_RUN', runId: open.runId, variant: 'en' },
  ]);
});

test('variant checks turned on after a variant commit make that variant stale with check reasons, not the original', async () => {
  const root = await translated();
  await patchWork(root, { packs: ['fake', 'variants'], checkSets: ['fake.basic', 'variants.basic'] });
  const s = await workStatus(root, { packs: new Map([['fake', fakePack], ['variants', await loadVariantsPack()]]) });
  assert.deepEqual(s.variants.en.stale.map((x) => [x.nodeId, x.reasons.map((r) => r.kind)]), [['ep-001', ['check', 'check', 'check', 'check', 'check']]]);
  assert.deepEqual(s.recheck, []);
});
