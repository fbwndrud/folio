import { isBlocking } from '../ledger/receipts.js';
import { parseJsonAnswer } from '../run/answers.js';

const SAME_HOST = Object.freeze({ sameHost: true, independent: false });
const ANSWER_FORMAT = '{"checked":["<checkId>", ...],"findings":[{"checkId":"<id>","code":"<CODE>","message":"<why>","quote":"<verbatim text from the draft>"}]}';

/**
 * 검사가 이 노드에 해당하는가. requiresOrder: linear 는 읽는 순서 안(ordered)에서만, none 은 순서 없는(none) 노드에서만(N4, ctx.unorderedBy).
 * 해당 없음은 실패가 아니라 영수증에 not_applicable 로 남는다. core.promise-order(linear)는 순서 밖 노드에서 늘 해당 없음이다.
 */
export function applicability(check, ctx) {
  if (check.requiresOrder === 'linear' && !ctx.ordered) return 'not_applicable';
  if (check.requiresOrder === 'none' && ctx.unorderedBy !== 'none') return 'not_applicable';
  if (check.requiresOrder === 'branching' && !ctx.branching?.applicable) return 'not_applicable';
  if (check.requiresParentPlan && !ctx.parentPlan) return 'not_applicable';
  return 'applicable';
}

const effectiveSeverity = (check) => check.severityOverride ?? check.severity;

/** 검사가 죽거나, 답을 못 받거나, 답이 안 왔을 때 닫힌 쪽으로 실패시킬 심각도. 없으면 null(advisory류는 막지 않는다). */
export function failClosedSeverity(check) {
  const effective = effectiveSeverity(check);
  if (check.locked || effective === 'hard') return 'hard';
  if (effective === 'block') return 'block';
  return null;
}

/** 지적이 스스로 적을 수 있는 등급. hard 는 pack.yaml 선언에서만 온다(D5 A). */
const FINDING_OWN_SEVERITIES = ['advisory', 'warning', 'block'];
const SEVERITY_RANK = ['advisory', 'warning', 'block', 'hard'];

/**
 * 지적 등급은 선언 등급을 낮추기만 한다. 자기 데이터 속성의 값만 읽는다(getter·상속·프로토타입 오염은 무시).
 * 알 수 없는 값이나 선언보다 높은 값은 선언 등급이다.
 */
function cappedSeverity(declared, finding) {
  const own = Object.getOwnPropertyDescriptor(finding, 'severity');
  const wanted = own && Object.hasOwn(own, 'value') ? own.value : undefined;
  if (!FINDING_OWN_SEVERITIES.includes(wanted)) return declared;
  return SEVERITY_RANK.indexOf(wanted) <= SEVERITY_RANK.indexOf(declared) ? wanted : declared;
}

function stamp(check, finding) {
  return {
    ...finding,
    code: String(finding.code ?? 'FINDING'),
    message: String(finding.message ?? finding.code ?? ''),
    checkId: check.id,
    severity: check.severityOverride ?? cappedSeverity(check.severity, finding),
  };
}

const statusOf = (findings) => (findings.some(isBlocking) ? 'failed' : 'passed');

export function runDeterministicChecks(checks, ctx) {
  return checks.map((check) => {
    if (applicability(check, ctx) === 'not_applicable') return { checkId: check.id, status: 'not_applicable', findings: [] };
    try {
      const out = check.run(ctx) ?? [];
      // 검사기의 map 을 부르지 않는다. 모든 지적이 stamp 를 거치고 결과는 평범한 배열이다.
      if (!Array.isArray(out)) throw new TypeError('checker must return an array of findings');
      const findings = Array.from(out, (finding) => stamp(check, finding));
      return { checkId: check.id, status: statusOf(findings), findings };
    } catch (error) {
      const severity = failClosedSeverity(check) ?? effectiveSeverity(check);
      const message = error?.message ?? String(error);
      return { checkId: check.id, status: 'error', findings: [{ checkId: check.id, severity, code: 'CHECK_CRASHED', message }] };
    }
  });
}

export function buildModelCheckRequest(checks, ctx) {
  return {
    checks: checks.map((check) => ({
      checkId: check.id, instruction: check.instruction ?? null, instructionText: check.instructionText ?? null,
      severity: check.severityOverride ?? check.severity, requireQuote: Boolean(check.requireQuote), samples: check.samples ?? null,
    })),
    draft: ctx.draft,
    answerFormat: ANSWER_FORMAT,
  };
}

/** 인용은 유니코드 정규화(NFC) 후 부분 문자열로 비교하고, 다듬은 길이가 2 미만이면 근거로 인정하지 않는다. */
function quoteSupported(quote, draft) {
  if (typeof quote !== 'string') return false;
  if (quote.trim().length < 2) return false;
  return String(draft).normalize('NFC').includes(quote.normalize('NFC'));
}

/** 같은 호스트의 검토다. 모델이 뭐라고 하든 독립 평가로 표기하지 않는다. */
export function parseModelCheckAnswer(checks, answer, draft) {
  let parsed;
  try { parsed = parseJsonAnswer(answer); } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.findings)) {
    return checks.map((check) => {
      const severity = failClosedSeverity(check);
      return {
        checkId: check.id, status: 'error', reviewer: { ...SAME_HOST }, unsupported: [],
        findings: severity ? [{ checkId: check.id, severity, code: 'CHECK_ANSWER_INVALID', message: 'model answer was not a findings list' }] : [],
      };
    });
  }
  const checkedSet = Array.isArray(parsed.checked) ? new Set(parsed.checked) : null;
  const results = new Map(checks.map((check) => [check.id, { checkId: check.id, status: 'passed', findings: [], reviewer: { ...SAME_HOST }, unsupported: [] }]));
  for (const raw of parsed.findings) {
    const check = checks.find((c) => c.id === raw?.checkId);
    if (!check) continue;
    const { severity: _ignored, ...rest } = raw;
    const finding = stamp(check, { code: rest.code, message: rest.message, ...(typeof rest.quote === 'string' ? { quote: rest.quote } : {}) });
    finding.severity = check.severityOverride ?? check.severity;
    const result = results.get(check.id);
    if (check.requireQuote && !quoteSupported(finding.quote, draft)) { result.unsupported.push(finding); continue; }
    result.findings.push(finding);
  }
  for (const check of checks) {
    const result = results.get(check.id);
    if (checkedSet?.has(check.id)) { result.status = statusOf(result.findings); continue; }
    const severity = failClosedSeverity(check);
    if (severity) result.findings.push({ checkId: check.id, severity, code: 'CHECK_NOT_ANSWERED', message: 'model did not report on this check' });
    result.status = 'error';
  }
  return [...results.values()];
}
