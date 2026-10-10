import { canonicalJson, sha256 } from '../util/hash.js';
import { digestProjection, functionSource } from '../pack/digest.js';

/** 검사 정의 중 판정에 영향을 주는 필드. checksDigest 와 검사별 digest 가 같은 투영을 쓴다. */
export const CHECK_DIGEST_FIELDS = ['id', 'tier', 'stage', 'severity', 'severityOverride', 'locked', 'requiresOrder', 'instruction', 'instructionText', 'samples', 'requireQuote', 'config'];

export const checkProjection = (check) => ({
  ...Object.fromEntries(CHECK_DIGEST_FIELDS.map((field) => [field, check[field] ?? null])),
  ...(typeof check.run === 'function' ? {
    implementation: {
      source: functionSource(check.run), digest: check.implementationDigest ?? null,
      inputs: digestProjection(check.digestInputs ?? null),
    },
  } : {}),
});
export const checkDigest = (check) => sha256(canonicalJson(checkProjection(check)));

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const stageOf = (step) => step.stage ?? step.id;

/** 이 파이프라인의 검사 단계(mode 무관)에 걸리는 검사, id 순. */
export function pipelineChecks(checks, pipeline) {
  const stages = new Set(pipeline.steps.filter((s) => s.kind === 'check').map(stageOf));
  return checks.filter((c) => stages.has(c.stage)).sort(byId);
}

/**
 * 이 파이프라인에서 실제로 적용되는 검사: 꺼지지 않은(mode !== 'off') 검사 단계에 걸리는 검사.
 * 영수증 appliedChecks 와 findStale 의 "지금 켜진 검사"가 같은 정의를 쓴다.
 * @returns {{ checkId: string, digest: string, stage: string }[]}
 */
export function activeChecks(checks, pipeline) {
  const on = new Set(pipeline.steps.filter((s) => s.kind === 'check' && s.mode !== 'off').map(stageOf));
  return checks.filter((c) => on.has(c.stage)).sort(byId).map((c) => ({ checkId: c.id, digest: checkDigest(c), stage: c.stage }));
}

/** 영수증·재검사 기록에 남기는 모양. */
export const appliedChecks = (checks, pipeline) => activeChecks(checks, pipeline).map(({ checkId, digest }) => ({ checkId, digest }));

/** 결과가 error(답이 없음·검사가 죽음)인 검사는 적용한 것으로 치지 않는다 — 되채우기 대상으로 남는다. */
export function erroredCheckIds(stepEntries) {
  return new Set(stepEntries.flatMap((s) => (s.checks ?? []).filter((c) => c.status === 'error').map((c) => c.checkId)));
}

/** 영수증·재검사 기록의 appliedChecks: 켜진 검사 중 error 가 아닌 것. */
export const appliedFromEntries = (checks, pipeline, stepEntries) => {
  const errored = erroredCheckIds(stepEntries);
  return appliedChecks(checks, pipeline).filter((a) => !errored.has(a.checkId));
};
