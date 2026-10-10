import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { isPlainObject } from '../util/plain.js';

/**
 * 작가가 켜고 끄는 기능과 기본값(설계 결정 M4 #7, N2 §5). 잠금 규칙은 여기 없다 — 어떤 값도 잠금을 약하게 하지 않는다.
 * 명시적 행동(이름 바꾸기, 다시 커밋, 자료 도구)과 기록은 켜 두고, 검사 범위를 바꾸는 occurrenceScope 만 꺼 둔다.
 * - sources: folio_sources 도구와 요청 payload 의 자료(sources). 끄면 도구가 FEATURE_DISABLED.
 * - evidence: 근거 연결(검사가 보는 주장, 기록장, folio_sources link).
 * - evidenceInExtract: 추출 요청이 주장(claims)을 묻는다(evidence 필요, 작품이 sources 팩을 쓸 때만).
 * - promiseScope: 약속(promise) 엔티티의 앞 사건을 검사 ctx·요청의 priorEvents 에 늘 싣는다(M5 휴면 판정). 범위(entityIds)·참고 버전(refs)은 넓히지 않는다.
 * - viewer: folio_view 가 이 작품의 로컬 뷰어를 띄운다(M6). 끄면 FEATURE_DISABLED.
 * - viewerToggles: 뷰어에서 단계 켜고 끄기를 work.yaml 에 쓴다(viewer 필요). 끄면 뷰어는 읽기만 한다. 잠금 단계는 이 값과 상관없이 늘 거부한다.
 * - checkConfig: work.yaml checks.<팩 검사>.config 로 팩 검사 설정(분량 목표 등)을 작품마다 겹친다(C0). 끄면 config 를 적은 줄이 CHECK_CONFIG_DISABLED.
 *   잠금·hard 검사는 이 값과 상관없이 설정을 받지 않는다. 설정 자체가 검사 digest 에 들어가므로 RUN_FEATURES 에는 넣지 않는다.
 * - blocks: 블록 번호·각주·자료 인용 목록(folio_find blocks)과 folio_status 의 blocks(겹친 앵커·깨진 참조·각주·인용 문제)(N3). 끄면 FEATURE_DISABLED·null.
 * - bibliography: 참고문헌(folio_find bibliography). 자료 설명서와 근거 기록장을 읽기만 한다.
 * - termIndex: 색인(folio_find terms). 이름 스캔·등장 위치 기록장을 읽기만 한다.
 *   셋 다 파일에서 다시 만드는 읽기 전용 투영이라 실행이 묻는 것·검사 범위를 바꾸지 않는다(RUN_FEATURES 밖, 부모 없음).
 *   상호 참조 검사(knowledge.cross-refs)는 기능이 아니라 검사 세트(knowledge.references)로 고른다.
 * - links: 노드 연결 표(folio_find links)와 folio_status 의 links(깨진 링크·자기 링크)(N4). 읽기 전용 투영이다(RUN_FEATURES 밖). 끄면 FEATURE_DISABLED·null.
 * - linkScope: 순서 없는(none) 노드의 검사 범위가 연결된 노드의 사건(linkedEvents)을 모은다(N4, 정본 §10 끝). links 필요.
 *   검사가 보는 것을 바꾸므로 RUN_FEATURES 에 든다. 앞뒤 판정(ordered)·priorEvents·core.promise-order 는 이 값과 상관없다.
 * - viewerExport: 뷰어 화면을 정적 파일로 내보낸다(exports/viewer, viewer 필요). 끄면 FEATURE_DISABLED.
 * - images: folio_image 로 그림 한 장을 설명서 → 생성 전 점검 → 생성 → 검토 → 승인 → 커밋 순서로 만든다(M7a). 끄면 FEATURE_DISABLED.
 * - imageReferences: 그림 실행이 설명서 엔티티의 기준 그림(그 엔티티가 나온 그림 파일)을 찾아 생성·검토 요청에 싣는다(images 필요).
 * - imageReview: 그림 실행의 모델 검토 단계(image-review 검사)를 돈다(images 필요). 끄면 그 단계는 이유와 출처를 남기고 건너뛴다.
 *   셋 다 노드 실행이 묻는 것·검사 범위를 바꾸지 않는다(RUN_FEATURES 밖). 그림 실행은 자기 digest(core/image/context.js 의 imageSpecDigest)로 이 값을 묶는다.
 *   잠금(커밋 그림 hash = 검토한 그림 hash, 영수증 없이 커밋 금지, 자기검토 표기)은 이 값과 상관없다.
 * - variants: 판본(번역·개정·요약) 실행(folio_run variant)과 folio_status 의 variants(N6). 판본은 work.yaml variants 로 선언해야 생긴다.
 *   끄면 판본 실행이 FEATURE_DISABLED(영수증까지 적힌 커밋은 잠금대로 끝맺는다), status.variants 는 null. main 실행에는 영향이 없어 RUN_FEATURES 밖이다.
 *   판본별 hash 일치·영수증 잠금은 이 값과 상관없이 늘 돈다.
 * - layout/export: 읽기 전용 출판 투영과 지면. 노드 실행 digest 밖이며 잠금에 영향이 없다(N8).
 */
export const FEATURES = Object.freeze({
  occurrences: true,
  occurrencesInExtract: true,
  occurrenceScope: false,
  rename: true,
  recommit: true,
  sources: true,
  evidence: true,
  evidenceInExtract: true,
  assets: true,
  tracking: true,
  promiseScope: true,
  viewer: true,
  viewerToggles: true,
  checkConfig: true,
  blocks: true,
  bibliography: true,
  termIndex: true,
  links: true,
  linkScope: true,
  viewerExport: true,
  images: true,
  imageReferences: true,
  imageReview: true,
  variants: true,
  branching: true,
  layout: true,
  export: true,
});

/** 켜려면 부모 기능도 켜져 있어야 하는 기능. 부모가 꺼지면 (명시적으로 true 가 아닌 한) 저절로 꺼진다. */
export const FEATURE_PARENTS = Object.freeze({
  occurrencesInExtract: 'occurrences', occurrenceScope: 'occurrences', rename: 'occurrences', evidenceInExtract: 'evidence',
  branching: 'links', viewerToggles: 'viewer', linkScope: 'links', viewerExport: 'viewer', imageReferences: 'images', imageReview: 'images',
});

/** 실행이 묻는 것·검사 범위를 바꾸는 기능. 이것이 바뀌면 열린 실행은 검사부터 다시 돈다. */
export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope', 'sources', 'evidence', 'evidenceInExtract', 'promiseScope', 'linkScope', 'branching']);

/**
 * features: 알려진 불리언만. 빠진 것은 기본값.
 * 부모가 꺼지면 자식도 저절로 꺼진다(작가가 부모만 꺼도 작품이 막히지 않는다 — 기능은 빼는 것이지 막는 것이 아니다).
 * 작가가 부모를 끈 채 자식을 work.yaml 에 명시적으로 true 로 적었을 때만 FEATURE_REQUIRES 오류다.
 * 돌려주는 값은 실제로 쓰이는(유효한) 값이다.
 * @param {unknown} input
 * @param {Array<Record<string, unknown>>} errors
 * @returns {Record<string, boolean>}
 */
export function readFeatures(input, errors) {
  const features = { ...FEATURES };
  if (input === undefined) return features;
  if (!isPlainObject(input)) { errors.push({ code: 'FEATURES_INVALID' }); return features; }
  const given = /** @type {Record<string, unknown>} */ (input);
  for (const [key, value] of Object.entries(given)) {
    if (!Object.hasOwn(FEATURES, key)) errors.push({ code: 'FEATURE_UNKNOWN', feature: key });
    else if (typeof value !== 'boolean') errors.push({ code: 'FEATURE_INVALID', feature: key });
    else features[key] = value;
  }
  for (const [child, parent] of Object.entries(FEATURE_PARENTS)) {
    if (features[parent]) continue;
    if (Object.hasOwn(given, child) && given[child] === true) errors.push({ code: 'FEATURE_REQUIRES', feature: child, requires: parent });
    features[child] = false;
  }
  return features;
}

/** 실행에 걸리는 기능 값(유효한 값 — readFeatures 가 돌려준 것)의 digest. 실행 파일의 featuresDigest 와 견준다. */
export const featuresDigest = (features, planPresent = false) => sha256(canonicalJson({
  ...Object.fromEntries(RUN_FEATURES.map((key) => [key, Boolean(features?.[key])])),
  ...(planPresent ? { tracking: features?.tracking !== false } : {}),
}));

/**
 * @param {{ features?: Record<string, boolean> }} config
 * @param {string} name
 */
export function assertFeature(config, name) {
  if (config?.features?.[name]) return;
  throw new FolioError('FEATURE_DISABLED', `${name} is turned off in work.yaml`, {
    feature: name, hint: `the author can turn it on with work.yaml features.${name}: true`,
  });
}
