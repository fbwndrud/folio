import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicChecks } from '../../core/checks/run-checks.js';
import { definedBeforeUse } from '../../packs/knowledge/checkers/defined-before-use.js';
import { prerequisiteOrder } from '../../packs/knowledge/checkers/prerequisite-order.js';
import { containmentIndex, termConsistency } from '../../packs/knowledge/checkers/term-consistency.js';
import { workEntities } from '../../packs/knowledge/checkers/definitions.js';

const entity = (id, name, avoid, aliases = []) => [id, { id, kind: 'term', name, aliases, data: avoid ? { avoid } : {} }];
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.quote]);

test('N1 minor: every knowledge checker throws without ctx.work, and the core turns that into CHECK_CRASHED at the declared severity', () => {
  for (const ctx of [{}, { draft: '세포' }, { work: {} }, { work: { entities: {} } }, { work: { entities: [] } }]) {
    for (const run of [definedBeforeUse, prerequisiteOrder, termConsistency, workEntities]) assert.throws(() => run(ctx), TypeError, run.name);
  }
  const checks = ['advisory', 'block'].map((severity) => ({ id: `knowledge.${severity}`, tier: 'deterministic', stage: 'facts', severity, run: termConsistency }));
  const results = runDeterministicChecks(checks, { draft: '세포 막' });
  assert.deepEqual(results.map((r) => [r.checkId, r.status, r.findings.map((f) => [f.code, f.severity])]), [
    ['knowledge.advisory', 'error', [['CHECK_CRASHED', 'advisory']]],
    ['knowledge.block', 'error', [['CHECK_CRASHED', 'block']]],
  ]);
});

test('N1 minor ABA: an avoided spelling inside overlapping occurrences of another name is not counted', () => {
  const work = { entities: new Map([entity('aba', '가나가'), entity('other', '다', ['나가'])]) };
  assert.deepEqual(termConsistency({ work, draft: '가나가나가' }), []);
  assert.deepEqual(codes(termConsistency({ work, draft: '가나가나가 나가' })), [['TERM_AVOIDED', 'other', '나가']]);
  assert.match(termConsistency({ work, draft: '가나가나가 나가' })[0].message, /1번/);
});

test('N1 minor NUL: an avoid spelling with a NUL is TERM_AVOID_INVALID and never matches masked code', () => {
  const work = { entities: new Map([entity('m', '세포막', ['\u0000\u0000', '막\u0000'])]) };
  const draft = ['세포막', '```', '코드 안', '```'].join('\n');
  assert.deepEqual(termConsistency({ work, draft }).map((f) => f.code), ['TERM_AVOID_INVALID', 'TERM_AVOID_INVALID']);
});

test('N1 minor O(n·m): containmentIndex agrees with a linear scan on many random spans', () => {
  let seed = 7;
  const next = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 50; round += 1) {
    const spans = Array.from({ length: next(40) }, () => { const start = next(100); return /** @type {[number, number]} */ ([start, start + 1 + next(8)]); });
    const inside = containmentIndex(spans);
    for (let probe = 0; probe < 60; probe += 1) {
      const start = next(110);
      const span = /** @type {[number, number]} */ ([start, start + 1 + next(6)]);
      assert.equal(inside(span), spans.some(([s, e]) => span[0] >= s && span[1] <= e), JSON.stringify({ spans, span }));
    }
  }
  assert.equal(containmentIndex([])([0, 1]), false);
});

test('N1 minor O(n·m): pathological drafts finish quickly (before: about 2 s and 43 s on the planning machine)', () => {
  const started = performance.now();
  const same = new Map(Array.from({ length: 500 }, (_, i) => entity(`e${i}`, `이름${i}`, ['가'])));
  assert.equal(termConsistency({ work: { entities: same }, draft: '가'.repeat(63000) }).length, 500);
  const named = new Map(Array.from({ length: 500 }, (_, i) => entity(`e${i}`, `가나${i}`, ['나'])));
  assert.deepEqual(termConsistency({ work: { entities: named }, draft: Array.from({ length: 9000 }, (_, i) => `가나${i % 500} `).join('') }), []);
  // 500 entities named '가'.repeat(k), k=1..500, with no avoid lists — should return [] and stay under 5 s (old code took >5 s)
  const noAvoid = new Map(Array.from({ length: 500 }, (_, i) => entity(`e${i}`, '가'.repeat(i + 1))));
  assert.deepEqual(termConsistency({ work: { entities: noAvoid }, draft: '가'.repeat(63000) }), []);
  assert.ok(performance.now() - started < 5000, `took ${Math.round(performance.now() - started)} ms`);
});
