import { openWorkspace } from '../run/workspace.js';
import { describeCheckSets, recommendCheckSets } from '../checks/recommend.js';

/**
 * 검사 세트 화면(읽기만): 모든 세트(팩·사용자)와 고른 것, 작품 단위 추천, 지금 켜진 검사(잠금·등급·실험).
 * 세트를 고르는 것은 작가다 — 뷰어는 work.yaml checkSets 를 쓰지 않는다(뷰어가 쓰는 것은 단계 모드뿐, 설계 §17).
 * @param {string} root
 * @param {{ packs: Map<string, any> }} options
 */
export async function viewCheckSets(root, { packs }) {
  const { work, registry, checks } = await openWorkspace(root, { packs });
  const sets = describeCheckSets(registry, work.config);
  return {
    chosenBy: work.config.checkSets === null ? 'pack-default' : 'work.yaml',
    sets,
    recommended: recommendCheckSets({ registry, config: work.config }),
    checks: checks.map((check) => ({
      id: check.id, title: check.title ?? check.id, tier: check.tier, stage: check.stage, severity: check.severityOverride ?? check.severity,
      origin: check.origin ?? null, locked: Boolean(check.locked), experimental: Boolean(check.experimental),
      sets: sets.filter((s) => s.selected && s.checks.includes(check.id)).map((s) => s.id),
    })),
  };
}
