/**
 * 그림 실행(M7a)이 검사를 돌리는 stage. 이 stage 의 검사는 노드 파이프라인에 자리가 없다 — 노드 실행은 돌리지 않고,
 * 그림 실행(core/image)만 돌린다. 검사 세트로 고르고 work.yaml checks 로 켜고 끄는 길은 다른 검사와 같다.
 */
export const IMAGE_STAGES = Object.freeze({ precheck: 'image-precheck', review: 'image-review' });
/** 생성 전 점검은 설명서 글(draft=briefText)을 검사하고, 생성 후 검토는 그림과 같은 설명서 글을 모델에 제시한다. */
export const IMAGE_STAGE_TIERS = Object.freeze({ 'image-precheck': 'deterministic', 'image-review': 'model' });
export const IMAGE_STAGE_NAMES = Object.freeze(Object.values(IMAGE_STAGES));
/** 그림 실행을 쓰려면 작품 packs 에 있어야 하는 팩 이름. */
export const IMAGE_PACK = 'image';
