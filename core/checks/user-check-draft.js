import { posix } from 'node:path';
import { USER_SEVERITIES } from './user-checks.js';
import { CHECKS_DIR } from './check-sources.js';
import { isPlainObject } from '../util/plain.js';

const ID = /^[a-z][a-z0-9-]*$/;
const FIELDS = ['id', 'title', 'description', 'rule', 'source', 'samples', 'words', 'pattern', 'severity', 'stage', 'experimental', 'requireQuote'];
const COPIED = ['title', 'description', 'rule', 'source', 'samples', 'words', 'pattern', 'stage'];
/** 단계 정보를 주지 않을 때 쓰는 기본 검사 단계(팩 기본 파이프라인의 이름). */
export const DEFAULT_STAGES = Object.freeze({ deterministic: ['facts'], model: ['critic'] });
const TIER_OF = { pattern: 'deterministic', model: 'model' };

/** 풀린 파이프라인({ leaf, branch, byLevel? })에서 검사 단계를 tier 별로 모은다(초안 검사에 넘길 stages). */
export function stagesByTier(pipelines) {
  const out = { deterministic: [], model: [] };
  const all = [pipelines.leaf, pipelines.branch, ...Object.values(pipelines.byLevel ?? {})].filter(Boolean);
  for (const step of all.flatMap((pipeline) => pipeline.steps ?? [])) {
    if (step.kind !== 'check' || !out[step.tier]) continue;
    const stage = step.stage ?? step.id;
    if (!out[step.tier].includes(stage)) out[step.tier].push(stage);
  }
  return out;
}

/** checks/ 아래 상대 경로인가(.. 로 빠져나가지 않는가). */
function insideChecks(path) {
  if (typeof path !== 'string' || path.startsWith('/')) return false;
  const normal = posix.normalize(path);
  return normal.startsWith(`${CHECKS_DIR}/`) && !normal.split('/').includes('..');
}

function kindOf(spec) {
  const pattern = spec.words !== undefined || spec.pattern !== undefined;
  const model = spec.rule !== undefined || spec.source !== undefined || spec.samples !== undefined;
  if (pattern && model) return { error: 'USER_CHECK_KIND_AMBIGUOUS' };
  if (pattern) return { kind: 'pattern' };
  if (model) return { kind: 'model' };
  return { error: 'USER_CHECK_INVALID' };
}

function fieldErrors(spec, kind) {
  const errors = [];
  if (kind === 'pattern') {
    if (spec.words !== undefined && !(Array.isArray(spec.words) && spec.words.every((w) => typeof w === 'string' && w))) errors.push({ code: 'USER_CHECK_INVALID', field: 'words' });
    if (spec.pattern !== undefined) {
      try { if (typeof spec.pattern !== 'string') throw new Error('not a string'); new RegExp(spec.pattern, 'gu'); } catch { errors.push({ code: 'USER_CHECK_PATTERN_INVALID' }); }
    }
  } else {
    if (spec.rule !== undefined && (typeof spec.rule !== 'string' || !spec.rule.trim())) errors.push({ code: 'USER_CHECK_INVALID', field: 'rule' });
    for (const field of ['source', 'samples']) if (spec[field] !== undefined && !insideChecks(spec[field])) errors.push({ code: 'CHECK_SOURCE_INVALID', field });
  }
  return errors;
}

/**
 * AI 가 만든 사용자 검사 초안을 검사한다(순수 함수). 통과하면 work.yaml checks 에 넣을 spec 을 돌려준다.
 * 초안은 언제나 experimental 이고 기본은 참고 의견(advisory)이다. 등급은 advisory|block 만(hard 불가 — 사용자만 block 으로 올린다).
 * 모델 검사는 인용을 요구한다. 패턴은 컴파일되어야 한다. 알 수 없는 필드(locked 등)는 거부한다.
 * stage 는 stages(기본 DEFAULT_STAGES, 작품 것은 stagesByTier)에서 그 tier 의 단계여야 한다.
 * @returns {{ ok: boolean, id: string|null, kind: string|null, spec: object|null, errors: object[] }}
 */
export function validateUserCheckDraft(draft, { stages = DEFAULT_STAGES } = {}) {
  if (!isPlainObject(draft)) return { ok: false, id: null, kind: null, spec: null, errors: [{ code: 'USER_CHECK_INVALID' }] };
  const errors = [];
  for (const field of Object.keys(draft)) if (!FIELDS.includes(field)) errors.push({ code: 'USER_CHECK_FIELD_UNKNOWN', field });
  if (draft.id !== undefined && (typeof draft.id !== 'string' || !ID.test(draft.id))) errors.push({ code: 'USER_CHECK_ID_INVALID', id: draft.id });
  const severity = draft.severity ?? 'advisory';
  if (!USER_SEVERITIES.includes(severity)) errors.push({ code: 'USER_CHECK_SEVERITY_INVALID', severity });
  const { kind = null, error } = kindOf(draft);
  if (error) errors.push({ code: error });
  else errors.push(...fieldErrors(draft, kind));
  // stage 는 그 tier 의 검사 단계여야 한다(모델 검사는 모델 단계, 패턴 검사는 결정론 단계). 없으면 기본 단계.
  if (kind && draft.stage !== undefined && !(stages[TIER_OF[kind]] ?? []).includes(draft.stage)) errors.push({ code: 'USER_CHECK_STAGE_INVALID', stage: draft.stage });
  const spec = { severity, experimental: true };
  for (const field of COPIED) if (draft[field] !== undefined) spec[field] = draft[field];
  if (kind === 'model') spec.requireQuote = true;
  const ok = errors.length === 0;
  return { ok, id: draft.id ?? null, kind, spec: ok ? spec : null, errors };
}
