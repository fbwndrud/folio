import { resolvePipeline } from '../pipeline/define.js';
import { canonicalJson, sha256 } from '../util/hash.js';

/**
 * 판본 파이프라인(코어가 정한다, 첫 팩과 무관): 판본 초안 → 원본 대비 결정론 검사 → 원본 대비 모델 검토 → 최소 수정 → 승인 → 커밋.
 * 원고를 만드는 모델 요청은 원본(main 커밋 본문)과 용어 대응표를 싣는다(core/variants/payload.js). 커밋은 잠긴다(코어 잠금 씨앗).
 * 판본 검사는 stage 로 이 자리에 붙는다(packs/variants). main 파이프라인의 검사는 여기서 돌지 않고, 판본 검사는 main 에서 돌지 않는다.
 */
export const VARIANT_STEPS = Object.freeze([
  { id: 'draft', kind: 'generate', produces: 'draft' },
  { id: 'variant-checks', kind: 'check', tier: 'deterministic', stage: 'variant-checks' },
  { id: 'variant-review', kind: 'check', tier: 'model', stage: 'variant-review' },
  { id: 'revise', kind: 'generate', produces: 'draft', loop: { until: ['variant-checks'], max: 3 } },
  { id: 'approve', kind: 'gate' },
  { id: 'commit', kind: 'commit' },
]);
const STEP_IDS = VARIANT_STEPS.map((s) => s.id);

/**
 * 판본 파이프라인 digest 에 묶는 재료: 팩 digest + 판본 선언(id·종류·언어). 같은 단계라도 판본이 다르면 digest 가 다르다 —
 * 한 판본의 영수증은 다른 판본의 파이프라인과 맞지 않는다(LOCK_PIPELINE_MISMATCH).
 * @param {string|null} packDigest
 * @param {{ id: string, kind: string, lang: string|null }} spec
 */
export const variantPackDigest = (packDigest, spec) => sha256(canonicalJson({ packs: packDigest, variant: { id: spec.id, kind: spec.kind, lang: spec.lang } }));

/**
 * 선언된 판본마다 파이프라인. variants[].steps 는 있는 단계만 덮어쓴다(mode·reason·max). 새 단계·잠긴 단계 덮어쓰기는 거부한다.
 * 결과 파이프라인은 variant(판본 id)를 함께 든다.
 * @param {{ specs: Record<string, { id: string, kind: string, lang: string|null, steps: Record<string, any> }>, packDigest: string|null }} options
 */
export function resolveVariantPipelines({ specs, packDigest }) {
  const errors = [];
  /** @type {Record<string, any>} */
  const pipelines = {};
  for (const spec of Object.values(specs)) {
    const patches = {};
    for (const [id, patch] of Object.entries(spec.steps)) {
      if (STEP_IDS.includes(id)) patches[id] = patch;
      else errors.push({ code: 'VARIANT_STEP_UNKNOWN', variant: spec.id, stepId: id });
    }
    const result = resolvePipeline(VARIANT_STEPS, patches, { packDigest: variantPackDigest(packDigest, spec) });
    errors.push(...result.errors.map((error) => ({ ...error, variant: spec.id })));
    pipelines[spec.id] = { ...result, variant: spec.id };
  }
  return { pipelines, errors };
}

/** 검사 배치 확인에 쓰는 판본 파이프라인 모양. 판본을 선언하지 않은 작품도 판본 검사(packs/variants)를 둘 자리가 있다. */
export const variantHomePipeline = () => resolvePipeline(VARIANT_STEPS, {});
