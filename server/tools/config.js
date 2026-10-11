import { openWorkspace } from '../../core/run/workspace.js';
import { describeCheckSets, recommendCheckSets, recommendForNode } from '../../core/checks/recommend.js';
import { stagesByTier, validateUserCheckDraft } from '../../core/checks/user-check-draft.js';
import { FEATURES, FEATURE_PARENTS } from '../../core/work/features.js';

const stepView = (step) => ({
  id: step.id, kind: step.kind, tier: step.tier ?? null, stage: step.kind === 'check' ? (step.stage ?? step.id) : null,
  mode: step.mode ?? 'on', locked: Boolean(step.locked), custom: Boolean(step.custom), reason: step.reason ?? null,
});
/** config: 팩 검사의 지금 설정(팩 config 위에 work.yaml checks.<id>.config 를 겹친 값). 사용자 검사는 null(자기 spec 이 곧 설정이다). */
const checkView = (check) => ({
  id: check.id, title: check.title ?? check.id, tier: check.tier, stage: check.stage, severity: check.severityOverride ?? check.severity,
  origin: check.origin ?? null, locked: Boolean(check.locked), experimental: Boolean(check.experimental),
  config: check.origin === 'pack' && check.config !== undefined ? check.config : null,
});

/**
 * folio_config(고급, 읽기 전용). 작가에게 보여 줄 설정 그림: 레벨별 단계와 잠금, 검사 세트·추천, 켜진 검사, 검사를 둘 수 있는 단계.
 * checkDraft 가 있으면 이 작품의 단계 기준으로 사용자 검사 초안을 검증한다. workKind 가 있으면 작품 단위 추천에 그 작품 종류 이유를 더한다.
 * node 가 있으면 그 노드(레벨·역할·위치) 기준 추천을 nodeRecommendations 로 더한다. work.yaml 은 쓰지 않는다 — 쓰기는 작가 승인 뒤 호스트가 한다.
 * @param {string} root
 * @param {{ packs: Map<string, any>, checkDraft?: object, workKind?: string, node?: string }} options
 */
export async function describeConfig(root, { packs, checkDraft, workKind, node }) {
  const { work, registry, checks, pipelines } = await openWorkspace(root, { packs });
  const { config } = work;
  const stages = stagesByTier(pipelines);
  return {
    title: config.title, language: config.language ?? null, levels: config.levels, packs: config.packs,
    pipelines: Object.fromEntries(Object.entries(pipelines.byLevel).map(([level, p]) => [level, { digest: p.digest, steps: p.steps.map(stepView) }])),
    checkSets: describeCheckSets(registry, config),
    recommended: recommendCheckSets({ registry, config, workKind: workKind ?? null }),
    checks: checks.map(checkView),
    stages,
    options: config.options,
    features: { values: config.features, defaults: FEATURES, parents: FEATURE_PARENTS },
    ...(checkDraft !== undefined ? { checkDraft: validateUserCheckDraft(checkDraft, { stages }) } : {}),
    ...(node !== undefined ? { nodeRecommendations: recommendForNode({ registry, config, work, nodeId: node }) } : {}),
  };
}
