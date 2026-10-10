import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicChecks, parseModelCheckAnswer } from '../../core/checks/run-checks.js';
import { loadBuiltinPacks } from '../../packs/index.js';

// 지적 등급은 선언 등급보다 높일 수 없다(D5 A). hard 는 pack.yaml 선언에서만 온다.
const checkOf = (severity, findings, extra = {}) => ({ id: `c.${severity}`, tier: 'deterministic', severity, run: () => findings, ...extra });
const stamped = (check) => runDeterministicChecks([check], { ordered: true })[0];
const severities = (result) => result.findings.map((f) => f.severity);

test('a checker writing hard never rises above the declared check severity', () => {
  const advisory = stamped(checkOf('advisory', [{ code: 'X', message: 'x', severity: 'hard' }]));
  assert.deepEqual(severities(advisory), ['advisory']);
  assert.equal(advisory.status, 'passed');
  const block = stamped(checkOf('block', [{ code: 'X', message: 'x', severity: 'hard' }]));
  assert.deepEqual(severities(block), ['block']);
  const warning = stamped(checkOf('warning', [{ code: 'X', message: 'x', severity: 'hard' }, { code: 'Y', message: 'y', severity: 'block' }]));
  assert.deepEqual(severities(warning), ['warning', 'warning']);
  assert.equal(warning.status, 'passed');
});

test('a block finding of an advisory check stays advisory and does not fail the check', () => {
  const result = stamped(checkOf('advisory', [{ code: 'X', message: 'x', severity: 'block' }, { code: 'Y', message: 'y', severity: 'warning' }]));
  assert.deepEqual(severities(result), ['advisory', 'advisory']);
  assert.equal(result.status, 'passed');
});

test('a finding may lower the declared severity to block, warning or advisory', () => {
  const findings = ['block', 'warning', 'advisory'].map((severity) => ({ code: severity, message: severity, severity }));
  assert.deepEqual(severities(stamped(checkOf('hard', findings))), ['block', 'warning', 'advisory']);
  assert.deepEqual(severities(stamped(checkOf('block', findings))), ['block', 'warning', 'advisory']);
  assert.deepEqual(severities(stamped(checkOf('hard', [{ code: 'H', message: 'h', severity: 'hard' }]))), ['hard']);
});

test('novel dead-on-stage keeps its behaviour: hard for a dead character, block for an unknown vital value', async () => {
  const check = (await loadBuiltinPacks()).get('novel').checks.find((c) => c.id === 'novel.dead-on-stage');
  assert.equal(check.severity, 'hard');
  const ctx = {
    ordered: true,
    priorEvents: [{ entityId: 'doyun', kind: 'state', data: { vital: 'dead' } }, { entityId: 'hana', kind: 'state', data: { vital: '사망' } }],
    appearances: ['doyun', 'hana'],
    draftEvents: [],
    draft: '도윤과 하나가 나왔다.',
  };
  const [result] = runDeterministicChecks([check], ctx);
  assert.deepEqual(result.findings.map((f) => [f.code, f.entityId, f.severity]), [['DEAD_ON_STAGE', 'doyun', 'hard'], ['VITAL_UNKNOWN', 'hana', 'block']]);
  assert.equal(result.status, 'failed');
});

test('unknown finding severities fall back to the declared severity', () => {
  const unknown = ['HARD', 'Block', 'ADVISORY', ' advisory', 'advisory ', '', 'none', 'soft', '__proto__', 'constructor', 'toString', 'hasOwnProperty',
    null, undefined, 0, 1, 3, -1, NaN, true, false, {}, [], ['advisory'], { toString: () => 'advisory' }, { valueOf: () => 'advisory' },
    Symbol('advisory'), 10n, () => 'advisory', new String('advisory')];
  for (const severity of unknown) {
    const result = stamped(checkOf('block', [{ code: 'X', message: 'x', severity }]));
    assert.deepEqual(severities(result), ['block'], String(typeof severity === 'symbol' ? severity.description : severity));
    assert.equal(result.status, 'failed');
  }
  assert.deepEqual(severities(stamped(checkOf('advisory', [{ code: 'X', message: 'x', severity: 'HARD' }]))), ['advisory']);
});

test('a severity getter is not trusted and cannot flip the stamped value', () => {
  let reads = 0;
  const finding = { code: 'X', message: 'x' };
  Object.defineProperty(finding, 'severity', { enumerable: true, get: () => (reads++ % 2 === 0 ? 'advisory' : 'hard') });
  const result = stamped(checkOf('block', [finding]));
  const [out] = result.findings;
  assert.equal(out.severity, 'block');
  assert.equal(out.severity, 'block');
  assert.ok('value' in Object.getOwnPropertyDescriptor(out, 'severity'), 'stamped severity is a plain data property');
  assert.equal(result.status, 'failed');

  const inherited = Object.create({ severity: 'advisory' });
  Object.assign(inherited, { code: 'X', message: 'x' });
  assert.deepEqual(severities(stamped(checkOf('hard', [inherited]))), ['hard']);
});

test('a polluted Object.prototype cannot lower or raise a finding', () => {
  for (const polluted of ['advisory', 'hard']) {
    Object.prototype.severity = polluted;
    try {
      assert.deepEqual(severities(stamped(checkOf('hard', [{ code: 'X', message: 'x' }]))), ['hard'], polluted);
      assert.deepEqual(severities(stamped(checkOf('advisory', [{ code: 'X', message: 'x' }]))), ['advisory'], polluted);
    } finally {
      delete Object.prototype.severity;
    }
  }
  // 속성 설명자도 평범한 객체라 Object.prototype.value 를 물려받는다. getter 지적이 그 값으로 낮춰지면 안 된다.
  const finding = { code: 'X', message: 'x' };
  Object.defineProperty(finding, 'severity', { enumerable: true, get: () => 'hard' });
  Object.prototype.value = 'advisory';
  try {
    assert.deepEqual(severities(stamped(checkOf('hard', [finding]))), ['hard']);
  } finally {
    delete Object.prototype.value;
  }
});

test('the user severityOverride still wins over the finding and the declared severity', () => {
  const findings = [{ code: 'B', message: 'b', severity: 'block' }, { code: 'A', message: 'a', severity: 'advisory' }, { code: 'H', message: 'h', severity: 'hard' }];
  assert.deepEqual(severities(stamped(checkOf('hard', findings, { severityOverride: 'advisory' }))), ['advisory', 'advisory', 'advisory']);
  assert.deepEqual(severities(stamped(checkOf('advisory', findings, { severityOverride: 'block' }))), ['block', 'block', 'block']);
});

test('crashing checks still fail closed as before', () => {
  const crash = (severity, extra = {}) => stamped({ id: 'c', tier: 'deterministic', severity, run: () => { throw new Error('boom'); }, ...extra });
  assert.deepEqual([crash('hard', { locked: true }), crash('hard'), crash('block'), crash('advisory')].map((r) => [r.status, r.findings[0].severity]),
    [['error', 'hard'], ['error', 'hard'], ['error', 'block'], ['error', 'advisory']]);
  assert.equal(crash('advisory', { locked: true }).findings[0].severity, 'hard');
  assert.equal(crash('advisory', { severityOverride: 'block' }).findings[0].severity, 'block');
});

test('a checker cannot skip stamping with its own map', () => {
  const raw = [{ code: 'X', message: 'x', severity: 'hard', checkId: 'someone.else' }];
  const duck = stamped(checkOf('advisory', { map: () => raw }));
  assert.deepEqual([duck.status, duck.findings.map((f) => [f.code, f.severity])], ['error', [['CHECK_CRASHED', 'advisory']]]);
  assert.equal(stamped(checkOf('block', { map: () => raw })).findings[0].severity, 'block');

  class Sneaky extends Array { map() { return raw; } }
  const sneaky = stamped(checkOf('advisory', Sneaky.from(raw)));
  assert.deepEqual(sneaky.findings.map((f) => [f.checkId, f.severity]), [['c.advisory', 'advisory']]);
  assert.equal(sneaky.status, 'passed');
  assert.equal(Object.getPrototypeOf(sneaky.findings), Array.prototype);
});

test('model answers still cannot choose severity, whatever the case or shape', () => {
  const checks = [{ id: 'a', tier: 'model', severity: 'advisory' }, { id: 'b', tier: 'model', severity: 'block' }];
  // JSON.parse 는 "__proto__" 를 자기 속성으로 만든다. 원문 그대로 적는다.
  const answer = `{"checked":["a","b"],"findings":[
    {"checkId":"a","code":"X","message":"x","severity":"HARD"},
    {"checkId":"a","code":"Y","message":"y","severity":"hard"},
    {"checkId":"b","code":"Z","message":"z","severity":"advisory"},
    {"checkId":"b","code":"P","message":"p","__proto__":{"severity":"advisory"}}]}`;
  const results = parseModelCheckAnswer(checks, answer, '본문');
  assert.deepEqual(results.map((r) => [r.checkId, r.status, severities(r)]), [['a', 'passed', ['advisory', 'advisory']], ['b', 'failed', ['block', 'block']]]);
});
