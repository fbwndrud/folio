import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PARITY_EXPECTED_DIR, byCodeEntity, caseDigest, folioVerdicts, listCaseIds, loadCase, loadExpected, readCaseText,
} from '../support/parity.js';
import { FOLIO_LOCK_CODES, FOLIO_REFUSAL_CODES, INTENDED_DIFF_KINDS, SOFT_EXEMPT_KINDS, parityCode } from '../support/parity-codes.js';
import { loadBuiltinPacks } from '../../packs/index.js';

/**
 * 판정 비교(M5 D10 A). 기대값은 scripts/parity/generate-expected.js 가 원래 엔진을 돌려 만든 JSON 이다.
 * 이 테스트는 그 JSON 과 합성 사례만 읽는다(원래 엔진도 생성 스크립트도 부르지 않는다).
 */
const REQUIRED_CASES = [
  'clean', 'cliche-and-tags', 'dead-on-stage', 'dense-format', 'destroyed-updated', 'dormant-promise', 'fixed-fact-conflict',
  'honorific-mismatch', 'no-time-skip', 'resolved-before-plant', 'restore-without-note', 'sentence-monotony', 'unknown-character',
];
const ids = listCaseIds();
const diffsOf = (expected, kind) => expected.intendedDiffs.filter((d) => d.kind === kind);

test('every required case exists and has a generated expectation', () => {
  for (const id of REQUIRED_CASES) assert.ok(ids.includes(id), `case ${id} is missing`);
  for (const id of ids) assert.ok(existsSync(join(PARITY_EXPECTED_DIR, `${id}.json`)), `run the generator: ${id}.json is missing`);
});

for (const id of ids) {
  test(`parity ${id}: expectation is for this exact case`, () => {
    const expected = loadExpected(id);
    assert.equal(expected.case, id);
    assert.equal(expected.caseDigest, caseDigest(readCaseText(id)), 'case changed after generation: run scripts/parity/generate-expected.js');
    assert.equal(caseDigest(loadCase(id)), expected.caseDigest, 'text and parsed digests agree');
    assert.match(expected.vibelore.commit, /^[0-9a-f]{40}$/);
    assert.match(expected.vibelore.script, /^sha256:[0-9a-f]{64}$/);
    for (const diff of expected.intendedDiffs) {
      assert.ok(INTENDED_DIFF_KINDS.includes(diff.kind), `unknown diff kind ${diff.kind}`);
      assert.ok(typeof diff.reason === 'string' && diff.reason.trim().length > 0, `${diff.kind} ${diff.code} has no reason`);
    }
    for (const diff of diffsOf(expected, 'advisory-start')) assert.equal(diff.reason, 'advisory 로 시작함');
  });

  test(`parity ${id}: hard verdicts match (minus intended differences)`, async () => {
    const expected = loadExpected(id);
    const folio = await folioVerdicts(loadCase(id));
    const crashed = folio.all.filter((f) => f.code === 'CHECK_CRASHED' || f.code === 'CHECK_ANSWER_INVALID' || f.code === 'CHECK_NOT_ANSWERED');
    assert.deepEqual(crashed, [], 'no check may crash or go unanswered');
    const skip = new Set([...diffsOf(expected, 'advisory-start').map((d) => d.code), ...diffsOf(expected, 'core-refusal').map((d) => d.source)]);
    const mapped = expected.hard.filter((h) => !skip.has(h.code)).map((h) => {
      const to = parityCode(h.code);
      assert.ok(to, `no Folio code for hard ${h.code}`);
      return { code: to.code, entityId: to.entity ? h.entityId : null };
    }).sort(byCodeEntity);
    const stricter = new Set(diffsOf(expected, 'folio-stricter').map((d) => d.code));
    const actual = folio.hard.filter((h) => !stricter.has(h.code));
    assert.deepEqual(actual, mapped);
    for (const code of stricter) assert.ok(folio.hard.some((h) => h.code === code), `folio-stricter ${code} is not hard in Folio`);
  });

  test(`parity ${id}: advisory starts, core refusals and soft verdicts appear in Folio`, async () => {
    const expected = loadExpected(id);
    const folio = await folioVerdicts(loadCase(id));
    const found = (checkId, code, severity) => folio.all.some((f) => f.checkId === checkId && f.code === code && (!severity || f.severity === severity));
    for (const diff of diffsOf(expected, 'advisory-start')) {
      assert.ok(expected.hard.some((h) => h.code === diff.code), `advisory-start ${diff.code} is not a source hard verdict`);
      const to = parityCode(diff.code);
      assert.ok(to, `no Folio code for ${diff.code}`);
      assert.ok(found(to.checkId, to.code, 'advisory'), `${to.checkId} ${to.code} must be emitted as advisory`);
    }
    const refusals = diffsOf(expected, 'core-refusal');
    for (const diff of refusals) {
      assert.ok(FOLIO_REFUSAL_CODES.includes(diff.code), `unknown refusal ${diff.code}`);
      assert.ok(folio.refused.some((r) => r.startsWith(`${diff.code}:`)), `Folio extraction must refuse with ${diff.code}`);
    }
    if (refusals.length === 0) assert.deepEqual(folio.refused, []);
    const exempt = new Set(expected.intendedDiffs.filter((d) => SOFT_EXEMPT_KINDS.includes(d.kind)).map((d) => d.code));
    for (const code of expected.soft) {
      const to = parityCode(code);
      if (!to || exempt.has(code)) continue;
      const accepted = [{ checkId: to.checkId, code: to.code }, ...to.alt];
      assert.ok(accepted.some((a) => found(a.checkId, a.code)), `soft ${code} → ${accepted.map((a) => a.code).join('|')} missing in Folio`);
    }
    for (const code of exempt) {
      const to = parityCode(code);
      const accepted = to ? [{ checkId: to.checkId, code: to.code }, ...to.alt] : [];
      assert.ok(!accepted.some((a) => found(a.checkId, a.code)), `${code} is listed as a difference but Folio emits it`);
    }
  });
}

test('parity clean: no findings on either side', async () => {
  const expected = loadExpected('clean');
  assert.deepEqual([expected.hard, expected.soft, expected.intendedDiffs], [[], [], []]);
  assert.deepEqual((await folioVerdicts(loadCase('clean'))).all, []);
});

test('parity cases stay synthetic and self-consistent', () => {
  for (const id of ids) {
    const c = loadCase(id);
    assert.equal(c.id, id);
    assert.ok(Number.isInteger(c.episode) && c.episode >= 1);
    assert.equal(typeof c.prose, 'string');
    for (const e of [...(c.priorEvents ?? [])]) assert.ok(e.episode >= 1 && e.episode < c.episode, `${id}: prior event episode ${e.episode}`);
    for (const e of c.draftEvents ?? []) if (e.quote !== undefined) assert.ok(c.prose.includes(e.quote), `${id}: draft quote not in prose`);
    for (const v of c.modelVerdicts ?? []) assert.ok(c.prose.includes(v.quote), `${id}: model quote not in prose`);
  }
});

const protocol = JSON.parse(readFileSync(join(PARITY_EXPECTED_DIR, 'protocol.json'), 'utf8'));

test('protocol steps follow the novel leaf pipeline in order', async () => {
  const pack = (await loadBuiltinPacks()).get('novel');
  const leaf = pack.pipelines.leaf.map((step) => step.id);
  assert.deepEqual(protocol.steps.map((s) => s.folio), leaf);
  for (const step of protocol.steps) {
    assert.ok(Number.isInteger(step.line) && step.line > 0, `${step.vibelore} has no source line`);
    assert.ok(typeof step.file === 'string' && step.file.length > 0);
  }
  const lines = protocol.steps.filter((s) => s.file === protocol.steps[0].file).map((s) => s.line);
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b), 'source steps appear in pipeline order');
});

test('protocol refusals name real Folio lock codes, one per case', () => {
  assert.deepEqual(protocol.refusals.map((r) => r.case).sort(), ['hard_violation', 'hash_changed', 'no_receipt', 'receipt_consumed']);
  for (const refusal of protocol.refusals) {
    assert.ok(FOLIO_LOCK_CODES.includes(refusal.folio), `${refusal.folio} is not a Folio lock code`);
    assert.ok(Number.isInteger(refusal.line) && refusal.line > 0);
  }
  assert.equal(new Set(protocol.refusals.map((r) => r.folio)).size, protocol.refusals.length);
});
