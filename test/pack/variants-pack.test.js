import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { lastCommits } from '../../core/ledger/receipts.js';
import { loadVariantsPack } from '../../packs/variants/index.js';
import { fakePack } from '../support/fake-pack.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { commitMain, patchWork, putVariantFile, variantWork } from '../support/variant-work.js';

const packs = async () => new Map([['fake', fakePack], ['variants', await loadVariantsPack()]]);
const ORIGINAL = '하나는 지하실 끝에서 잠긴 문을 30번 두드렸다.\n';

async function setup() {
  const root = await variantWork();
  await patchWork(root, { packs: ['fake', 'variants'], checkSets: ['fake.basic', 'variants.basic'] });
  await commitMain(root, 'ep-001', ORIGINAL, await packs());
  return root;
}

test('the variants pack is a second pack whose checks sit on the variant stages only', async () => {
  const pack = await loadVariantsPack();
  assert.ok(!pack.pipelines, 'no steps: the core gives the variant pipeline');
  assert.deepEqual(pack.defaultCheckSets, ['variants.basic']);
  assert.deepEqual(pack.checks.map((c) => [c.id, c.stage, c.severity, c.experimental]), [
    ['variants.blocks-kept', 'variant-checks', 'advisory', true], ['variants.numbers-kept', 'variant-checks', 'advisory', true],
    ['variants.paragraphs', 'variant-checks', 'advisory', true], ['variants.terms', 'variant-checks', 'advisory', true],
    ['variants.fidelity', 'variant-review', 'advisory', true],
  ]);
  const ctx = await openWorkspace(await setup(), { packs: await packs() });
  assert.deepEqual(ctx.applied.byLevel.episode.map((a) => a.checkId).filter((id) => id.startsWith('variants.')), [], 'never on the original');
  assert.deepEqual(ctx.applied.variants.en.map((a) => a.checkId), pack.checks.map((c) => c.id).sort());
});

test('a variant run with the pack: deterministic findings reach the approval as advisories, the fidelity review sees the original, the receipt lists the checks', async () => {
  const root = await setup();
  await putVariantFile(root, 'en', 'terms.yaml', 'terms:\n  - { from: 하나, to: Hana }\n');
  const host = createFakeHost({
    drafts: { '*': () => 'Hana knocked on the locked door at the end of the cellar.\n' },
    'variant-review': (p) => (p.original === ORIGINAL ? [{ checkId: 'variants.fidelity', code: 'OMITTED', message: '두드린 횟수가 빠졌다', quote: '30번' }] : []),
  });
  const loaded = await packs();
  const trail = await driveToEnd(() => createRunner({ root, packs: loaded }), host, {
    start: { node: 'ep-001', variant: 'en' }, until: (o) => o.status === 'done' || (o.status === 'needs_user' && o.question.kind === 'approve'),
  });
  const question = trail.at(-1).question;
  assert.deepEqual(question.advisories.map((f) => [f.checkId, f.code]), [['variants.numbers-kept', 'NUMBER_OMITTED'], ['variants.fidelity', 'OMITTED']]);
  const done = await createRunner({ root, packs: loaded }).decide({ runId: trail.at(-1).runId, action: 'approve' });
  assert.equal(done.status, 'done');
  const records = await openLedger(root, 'receipts').readAll();
  const receipt = records.find((r) => r.type === 'receipt' && r.receiptId === lastCommits(records, 'en').get('ep-001').receiptId);
  assert.deepEqual(receipt.appliedChecks.map((a) => a.checkId).sort(), ['variants.blocks-kept', 'variants.fidelity', 'variants.numbers-kept', 'variants.paragraphs', 'variants.terms']);
  assert.deepEqual(receipt.steps.find((s) => s.id === 'variant-review').checks[0].reviewer, { sameHost: true, independent: false });
});
