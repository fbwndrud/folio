import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicability, runDeterministicChecks, buildModelCheckRequest, parseModelCheckAnswer } from '../../core/checks/run-checks.js';
import { parseJsonAnswer } from '../../core/run/answers.js';

const linear = { id: 'order', tier: 'deterministic', severity: 'hard', requiresOrder: 'linear', run: () => [{ code: 'X', message: 'x' }] };
const parentFit = { id: 'fit', tier: 'model', severity: 'block', requiresParentPlan: true };

test('order-dependent checks are not applicable off the linear order', () => {
  assert.equal(applicability(linear, { ordered: true }), 'applicable');
  assert.equal(applicability(linear, { ordered: false }), 'not_applicable');
  assert.equal(applicability(parentFit, { ordered: true, parentPlan: null }), 'not_applicable');
  assert.equal(applicability(parentFit, { ordered: true, parentPlan: '계획' }), 'applicable');
});

test('deterministic results stamp check id and severity', () => {
  const [result] = runDeterministicChecks([linear], { ordered: true });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.findings, [{ code: 'X', message: 'x', checkId: 'order', severity: 'hard' }]);
  assert.deepEqual(runDeterministicChecks([linear], { ordered: false }), [{ checkId: 'order', status: 'not_applicable', findings: [] }]);
});

test('a finding may carry its own softer severity unless the user overrode it', () => {
  const mixed = { id: 'm', tier: 'deterministic', severity: 'hard', run: () => [{ code: 'W', message: 'w', severity: 'warning' }] };
  assert.equal(runDeterministicChecks([mixed], { ordered: true })[0].findings[0].severity, 'warning');
  assert.equal(runDeterministicChecks([{ ...mixed, severityOverride: 'block' }], { ordered: true })[0].findings[0].severity, 'block');
});

test('a crashing locked check fails closed', () => {
  const crash = { id: 'c', tier: 'deterministic', severity: 'hard', locked: true, run: () => { throw new Error('boom'); } };
  const [result] = runDeterministicChecks([crash], { ordered: true });
  assert.equal(result.status, 'error');
  assert.equal(result.findings[0].severity, 'hard');
  const soft = runDeterministicChecks([{ ...crash, locked: false, severity: 'advisory' }], { ordered: true })[0];
  assert.equal(soft.findings[0].severity, 'advisory');
});

test('a crashing block check fails closed to block, and throw null does not crash the runner', () => {
  const blockCrash = { id: 'b', tier: 'deterministic', severity: 'block', run: () => { throw new Error('nope'); } };
  const [blockResult] = runDeterministicChecks([blockCrash], { ordered: true });
  assert.equal(blockResult.status, 'error');
  assert.equal(blockResult.findings[0].severity, 'block');

  const nullThrow = { id: 'n', tier: 'deterministic', severity: 'advisory', run: () => { throw null; } };
  const [nullResult] = runDeterministicChecks([nullThrow], { ordered: true });
  assert.equal(nullResult.status, 'error');
  assert.equal(nullResult.findings[0].message, 'null');
});

test('model check requests carry only the check instructions and the draft', () => {
  const request = buildModelCheckRequest([{ id: 'r', tier: 'model', severity: 'block', requireQuote: true, instructionText: '존댓말 금지' }], { draft: '본문' });
  assert.deepEqual(request.checks, [{ checkId: 'r', instruction: null, instructionText: '존댓말 금지', severity: 'block', requireQuote: true, samples: null }]);
  assert.equal(request.draft, '본문');
  assert.match(request.answerFormat, /findings/);
});

test('model answers cannot choose severity, need quotes when required and are never independent', () => {
  const checks = [
    { id: 'rule', tier: 'model', severity: 'block', requireQuote: true },
    { id: 'critic', tier: 'model', severity: 'advisory' },
  ];
  const answer = JSON.stringify({
    reviewer: { independent: true },
    checked: ['rule', 'critic'],
    findings: [
      { checkId: 'rule', code: 'HONORIFIC', message: '존댓말', quote: '하셨어요', severity: 'advisory' },
      { checkId: 'rule', code: 'HONORIFIC', message: '인용 없음' },
      { checkId: 'critic', code: 'PACE', message: '느림', severity: 'hard' },
      { checkId: 'ghost', code: 'X', message: 'x' },
    ],
  });
  const results = parseModelCheckAnswer(checks, `\`\`\`json\n${answer}\n\`\`\``, '그가 말하셨어요.');
  const rule = results.find((r) => r.checkId === 'rule');
  const critic = results.find((r) => r.checkId === 'critic');
  assert.deepEqual(rule.findings.map((f) => [f.severity, f.quote]), [['block', '하셨어요']]);
  assert.equal(rule.unsupported.length, 1);
  assert.equal(rule.status, 'failed');
  assert.deepEqual(critic.findings.map((f) => f.severity), ['advisory']);
  assert.equal(critic.status, 'passed');
  for (const r of results) assert.deepEqual(r.reviewer, { sameHost: true, independent: false });
});

test('an unreadable model answer is an error result, blocking only for locked checks', () => {
  const [open] = parseModelCheckAnswer([{ id: 'critic', tier: 'model', severity: 'advisory' }], 'not json', '');
  assert.deepEqual([open.status, open.findings.length], ['error', 0]);
  const [locked] = parseModelCheckAnswer([{ id: 'l', tier: 'model', severity: 'hard', locked: true }], 'not json', '');
  assert.equal(locked.findings[0].severity, 'hard');
});

test('an unreadable model answer blocks non-locked hard and block checks too', () => {
  const [hard] = parseModelCheckAnswer([{ id: 'h', tier: 'model', severity: 'hard' }], 'not json', '');
  assert.equal(hard.findings[0].severity, 'hard');
  const [block] = parseModelCheckAnswer([{ id: 'b', tier: 'model', severity: 'block' }], 'not json', '');
  assert.equal(block.findings[0].severity, 'block');
});

test('a check missing from "checked" is an error result; blocking severities still surface', () => {
  const checks = [
    { id: 'locked', tier: 'model', severity: 'advisory', locked: true },
    { id: 'hard', tier: 'model', severity: 'hard' },
    { id: 'block', tier: 'model', severity: 'block' },
    { id: 'advisory', tier: 'model', severity: 'advisory' },
  ];
  const answer = JSON.stringify({ checked: [], findings: [] });
  const results = parseModelCheckAnswer(checks, answer, '');
  const byId = Object.fromEntries(results.map((r) => [r.checkId, r]));
  assert.equal(byId.locked.status, 'error');
  assert.equal(byId.locked.findings[0].severity, 'hard');
  assert.equal(byId.hard.findings[0].severity, 'hard');
  assert.equal(byId.block.findings[0].severity, 'block');
  assert.equal(byId.advisory.status, 'error');
  assert.equal(byId.advisory.findings.length, 0);
});

test('findings for an omitted check still count as evidence', () => {
  const checks = [{ id: 'rule', tier: 'model', severity: 'block', requireQuote: true }];
  const answer = JSON.stringify({
    checked: [],
    findings: [{ checkId: 'rule', code: 'X', message: 'x', quote: '본문' }],
  });
  const [result] = parseModelCheckAnswer(checks, answer, '이 본문입니다.');
  assert.equal(result.status, 'error');
  assert.equal(result.findings.some((f) => f.code === 'X'), true);
  assert.equal(result.findings.some((f) => f.code === 'CHECK_NOT_ANSWERED'), true);
});

test('a findings-only answer without "checked" treats every check as unanswered', () => {
  const [result] = parseModelCheckAnswer([{ id: 'critic', tier: 'model', severity: 'advisory' }], '{"findings":[]}', '');
  assert.equal(result.status, 'error');
});

test('quote matching normalises unicode and rejects too-short quotes', () => {
  const check = { id: 'rule', tier: 'model', severity: 'block', requireQuote: true };
  const draftNFC = '가나다'.normalize('NFC');
  const quoteNFD = '가나다'.normalize('NFD');
  const answer = JSON.stringify({ checked: ['rule'], findings: [{ checkId: 'rule', code: 'X', message: 'x', quote: quoteNFD }] });
  const [result] = parseModelCheckAnswer([check], answer, draftNFC);
  assert.equal(result.findings.length, 1);
  assert.equal(result.unsupported.length, 0);

  const shortAnswer = JSON.stringify({ checked: ['rule'], findings: [{ checkId: 'rule', code: 'X', message: 'x', quote: ' ' }] });
  const [shortResult] = parseModelCheckAnswer([check], shortAnswer, draftNFC);
  assert.equal(shortResult.findings.length, 0);
  assert.equal(shortResult.unsupported.length, 1);
});

test('parseJsonAnswer strips code fences and rejects garbage', () => {
  const fence = '`'.repeat(3);
  assert.deepEqual(parseJsonAnswer(`${fence}json\n{"a":1}\n${fence}`), { a: 1 });
  assert.deepEqual(parseJsonAnswer({ a: 1 }), { a: 1 });
  assert.throws(() => parseJsonAnswer('nope'), { code: 'ANSWER_JSON_INVALID' });
});
