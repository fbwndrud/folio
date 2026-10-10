import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { loadCheckSources } from '../checks/check-sources.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { appliedChecks, checkProjection, pipelineChecks } from '../checks/applied.js';
import { resolvePacks } from '../pack/registry.js';
import { resolveChecks } from '../checks/check-set.js';
import { resolvePipelines, customStepChecks } from '../pipeline/resolve.js';
import { featuresDigest } from '../work/features.js';
import { trackingStateDigest } from '../tracking/extract.js';
import { resolveVariantPipelines, variantHomePipeline } from '../variants/pipeline.js';

/**
 * 한 파이프라인(leaf 또는 branch)의 검사 단계에 걸리는 검사만 id 순으로 모은 다이제스트.
 * 실행 중에 이것이 바뀌면 단계 변경처럼 재검사한다. 순서만 바뀌거나 다른 종류 노드의 검사만 바뀌면 그대로다.
 */
export function checksDigest(checks, pipeline) {
  return sha256(canonicalJson(pipelineChecks(checks, pipeline).map(checkProjection)));
}

/**
 * 정규화된 설정 + 팩 → 레지스트리·검사·단계와 설정 오류(잠금 덮어쓰기 포함). 파일을 읽지 않는 순수 부분이다.
 * openWorkspace 와 뷰어 토글의 후보 검증(core/view/stage-toggle.js candidateErrors)이 이것 하나를 같이 쓴다.
 * 팩 이름이 틀리면(PACK_UNKNOWN 등) FolioError 를 던진다.
 * @param {any} config validateWorkConfig 의 config
 * @param {{ packs: Map<string, any> }} options
 */
export function resolveWorkspaceConfig(config, { packs }) {
  const registry = resolvePacks(config.packs, packs);
  const resolved = resolveChecks({ registry, config });
  // 판본 파이프라인은 검사 배치를 검증하기 전에 풀어야 실제 단계 덮어쓰기도 확인할 수 있다.
  const variants = resolveVariantPipelines({ specs: config.variantSpecs, packDigest: registry.digest });
  const pipelines = resolvePipelines({
    primary: registry.primary, overrides: config.overrides, checks: resolved.checks, levels: config.levels,
    includeAllHardChecks: config.options.includeAllHardChecks, packDigest: registry.digest,
    homes: [variantHomePipeline(), ...Object.values(variants.pipelines)],
  });
  // 기능이 꺼져도 판본 설정 오류는 늘 보인다(실행만 막힌다).
  return { registry, resolved, pipelines: { ...pipelines, variants: variants.pipelines }, errors: [...resolved.errors, ...pipelines.errors, ...variants.errors] };
}

/**
 * 작품 + 팩 + 검사 + 단계(레벨별 포함). 잠금 덮어쓰기를 포함한 설정 오류는 여기서 전부 거부된다.
 * workYaml 을 주면 work.yaml 파일 대신 그 글로 연다 — 쓰기 전에 후보 설정을 여는 길 그대로(검사 글 파일까지) 본다.
 * @param {string} root
 * @param {{ packs: Map<string, any>, workYaml?: string }} options
 */
export async function openWorkspace(root, { packs, workYaml }) {
  const work = await openWork(root, { workYaml });
  const { registry, resolved, pipelines, errors } = resolveWorkspaceConfig(work.config, { packs });
  const loaded = await loadCheckSources(root, [...resolved.checks, ...customStepChecks(pipelines)]);
  errors.push(...loaded.errors);
  const { checks } = loaded;
  if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
  /** leaf·branch(전체 덮어쓰기)와 레벨마다, 판본마다 같은 계산. */
  const each = (fn) => ({
    leaf: fn(pipelines.leaf), branch: fn(pipelines.branch),
    byLevel: Object.fromEntries(Object.entries(pipelines.byLevel).map(([level, pipeline]) => [level, fn(pipeline)])),
    variants: Object.fromEntries(Object.entries(pipelines.variants).map(([variant, pipeline]) => [variant, fn(pipeline)])),
  });
  return {
    work, registry, checks, pipelines: { leaf: pipelines.leaf, branch: pipelines.branch, byLevel: pipelines.byLevel, variants: pipelines.variants },
    checksDigest: each((pipeline) => checksDigest(checks, pipeline)),
    applied: each((pipeline) => appliedChecks(checks, pipeline)),
    featuresDigest: featuresDigest(work.config.features, Boolean(work.tracking.plan)),
    trackingStateDigest: trackingStateDigest(work),
  };
}
