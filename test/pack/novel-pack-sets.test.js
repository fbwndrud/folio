import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBuiltinPacks } from '../../packs/index.js';
import { runDeterministicChecks } from '../../core/checks/run-checks.js';
import { withCheckConfig } from '../../packs/novel/index.js';
import { NOVEL_CHECKERS } from '../../packs/novel/checkers/index.js';

const EXISTING = ['novel.dead-on-stage', 'novel.fixed-facts', 'novel.critic', 'novel.episode-hook', 'novel.parent-fit', 'novel.promise-kept', 'novel.young-readers'];
const SETS = {
  'novel.young-readers': ['novel.young-readers'],
  'novel.basic': ['novel.dead-on-stage', 'novel.fixed-facts', 'novel.critic', 'novel.parent-fit', 'novel.promise-kept',
    'novel.destroyed-object', 'novel.honorific-gender', 'novel.metadata-leak', 'novel.promise-evidence', 'novel.promise-flow'],
  'novel.serial': ['novel.episode-hook', 'novel.cliffhanger', 'novel.time-skip', 'novel.webnovel-format', 'novel.length',
    'novel.info-restate', 'novel.sensitive', 'novel.promise-dormant'],
  'novel.style': ['novel.sentence-rhythm', 'novel.prosody', 'novel.show-dont-tell', 'novel.cliche', 'novel.dialogue-tags',
    'novel.dialogue-ratio', 'novel.pov', 'novel.style-drift'],
};

test('M5: the novel pack has the four sets (basic, web-novel serial, style, young-readers) and only basic is a default', async () => {
  const novel = (await loadBuiltinPacks()).get('novel');
  assert.deepEqual(Object.fromEntries(Object.entries(novel.checkSets).map(([id, set]) => [id, set.checks])), SETS);
  assert.deepEqual(novel.defaultCheckSets, ['novel.basic']);
  assert.deepEqual(novel.checkSets['novel.style'].recommendedFor, { kinds: ['novel', 'serial'] });
});

test('M5: every ported check is an experimental, advisory, deterministic facts check — hard stays with the existing checks', async () => {
  const novel = (await loadBuiltinPacks()).get('novel');
  const ported = novel.checks.filter((c) => !EXISTING.includes(c.id));
  assert.equal(ported.length, 20);
  for (const check of ported) {
    assert.deepEqual([check.experimental, check.severity, check.tier, check.stage], [true, 'advisory', 'deterministic', 'facts'], check.id);
  }
  assert.deepEqual(novel.checks.filter((c) => c.severity === 'hard').map((c) => c.id), ['novel.dead-on-stage', 'novel.fixed-facts']);
  assert.deepEqual(novel.checks.filter((c) => c.requiresOrder === 'linear').map((c) => c.id).sort(),
    ['novel.dead-on-stage', 'novel.destroyed-object', 'novel.honorific-gender', 'novel.promise-dormant', 'novel.promise-flow']);
});

test('M5: the loaded novel pack passes its pack.yaml config (novel.length has target null, so it stays quiet)', async () => {
  const novel = (await loadBuiltinPacks()).get('novel');
  const length = novel.checks.find((c) => c.id === 'novel.length');
  assert.deepEqual(length.config, { target: null, unit: 'graphemes' });
  assert.deepEqual(runDeterministicChecks([length], { draft: '짧은 원고.', nodeId: 'ep-001' })[0].findings, []);
  const tuned = withCheckConfig({ checks: [{ ...length, run: NOVEL_CHECKERS.length, config: { target: 100, unit: 'graphemes' } }] }).checks[0];
  assert.deepEqual(runDeterministicChecks([tuned], { draft: '짧은 원고.', nodeId: 'ep-001' })[0].findings.map((f) => [f.code, f.severity]), [['LENGTH_SHORT', 'advisory']]);
});
