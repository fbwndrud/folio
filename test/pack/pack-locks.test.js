import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePacks } from '../../core/pack/registry.js';
import { validatePack } from '../../core/pack/validate.js';
import { resolvePipeline, coreLockedIds, LOCKED_STAGES } from '../../core/pipeline/define.js';
import { fakePack } from '../support/fake-pack.js';

const strip = (steps) => steps.map(({ locked: _locked, ...step }) => step);
const withLeaf = (leaf) => ({ ...fakePack, pipelines: { ...fakePack.pipelines, leaf } });
const codes = (pack) => validatePack(pack).map((e) => e.code);
const leaf = fakePack.pipelines.leaf;

test('core locks commit, the step hosting core.promise-order and what it requires, whatever the pack says', () => {
  assert.deepEqual(LOCKED_STAGES, ['facts']);
  assert.deepEqual([...coreLockedIds(strip(leaf))].sort(), ['commit', 'draft', 'extract', 'facts']);
  const { steps, errors } = resolvePipeline(strip(leaf), {});
  assert.deepEqual(errors, []);
  assert.deepEqual(steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(resolvePipeline(strip(leaf), { facts: { mode: 'off' } }).errors.map((e) => e.code), ['LOCKED_STEP_OVERRIDE']);
  assert.deepEqual(resolvePipeline(strip(fakePack.pipelines.branch), {}).steps.filter((s) => s.locked).map((s) => s.id), ['commit']);
});

test('a pack without locked flags is valid, and flags that agree with core are accepted', () => {
  assert.deepEqual(codes({ ...fakePack, pipelines: { leaf: strip(leaf), branch: strip(fakePack.pipelines.branch) } }), []);
  assert.deepEqual(codes(fakePack), []);
});

test('a pack that contradicts the core locks is rejected', () => {
  const unlockCommit = withLeaf(leaf.map((s) => (s.id === 'commit' ? { ...s, locked: false } : s)));
  assert.deepEqual(codes(unlockCommit), ['PACK_LOCK_MISMATCH']);
  const lockCritic = withLeaf(leaf.map((s) => (s.id === 'critic' ? { ...s, locked: true } : s)));
  assert.deepEqual(codes(lockCritic), ['PACK_LOCK_MISMATCH']);
  assert.throws(() => resolvePacks(['fake'], new Map([['fake', unlockCommit]])),
    (e) => e.code === 'PACK_LOCK_MISMATCH' && e.details.errors[0].stepId === 'commit' && e.details.pack === 'fake');
});

test('a leaf pipeline must host the locked core stage after the extracted events and the draft', () => {
  assert.deepEqual(codes(withLeaf(leaf.filter((s) => s.id !== 'facts'))), ['PACK_LOCKED_STAGE_MISSING']);
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'facts' ? { ...s, requires: [] } : s)))), ['PACK_FACTS_REQUIRES_EVENTS']);
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'extract' ? { ...s, requires: [] } : s)))), ['PACK_EVENTS_REQUIRES_DRAFT']);
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'facts' ? { ...s, tier: 'model' } : s)))), ['PACK_LOCKED_STAGE_TIER']);
});

test('a pack step cannot be called levels, and work.yaml cannot add a step named after a locked stage or levels', () => {
  assert.deepEqual(codes(withLeaf([{ id: 'levels', kind: 'gate' }, ...leaf])), ['PACK_STEP_ID_RESERVED']);
  for (const id of ['facts', 'levels']) {
    const { errors } = resolvePipeline(fakePack.pipelines.branch, { [id]: { after: 'fit', kind: 'check', tier: 'model' } });
    assert.deepEqual(errors.map((e) => e.code), ['STEP_ID_RESERVED'], id);
  }
});

test('the first pack must bring pipelines; a checks-only pack may follow it', () => {
  const extra = { name: 'extra', checks: [], checkSets: {} };
  assert.throws(() => resolvePacks(['extra'], new Map([['extra', extra]])), { code: 'PACK_PIPELINE_MISSING' });
  assert.doesNotThrow(() => resolvePacks(['fake', 'extra'], new Map([['fake', fakePack], ['extra', extra]])));
});

test('a pack cannot ship a core-locked step switched off', () => {
  for (const id of ['facts', 'commit']) {
    const off = withLeaf(leaf.map((s) => (s.id === id ? { ...s, mode: 'off' } : s)));
    assert.deepEqual(codes(off), ['PACK_LOCKED_STEP_MODE'], id);
    assert.throws(() => resolvePacks(['fake'], new Map([['fake', off]])),
      (e) => e.code === 'PACK_LOCKED_STEP_MODE' && e.details.pack === 'fake' && e.details.errors[0].stepId === id && e.details.errors[0].kind === 'leaf');
  }
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'facts' ? { ...s, mode: 'on' } : s)))), []);
});
