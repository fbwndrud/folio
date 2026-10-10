import { FolioError } from '../errors.js';
import { loadWorkConfig } from '../work/config.js';
import { readTree } from './tree.js';
import { validateTreeLevels } from './tree-levels.js';
import { computePositions } from './position.js';
import { validateBlocks } from './blocks.js';
import { readEntities } from './entities.js';
import { readSources } from './sources.js';
import { readAssets } from './assets.js';
import { readTracking } from '../tracking/records.js';
import { mergeManagedSubjects } from '../tracking/subjects.js';
import { readVariants } from './variants.js';

/** @typedef {Awaited<ReturnType<typeof openWork>>} Work */

/**
 * 작품 폴더 전체를 읽어 한 모델로 묶는다. 파일이 정본이고 이 객체는 매번 새로 만든다.
 * workYaml 을 주면 work.yaml 파일 대신 그 글로 연다(쓰기 전에 후보 설정이 작품과 맞는지 보는 데만 쓴다).
 * @param {string} root
 * @param {{ workYaml?: string, hashAssetFiles?: boolean }} [options]
 */
export async function openWork(root, { workYaml, hashAssetFiles = true } = {}) {
  const { config, warnings: configWarnings } = await loadWorkConfig(root, { text: workYaml });
  const tree = await readTree(root);
  const levels = validateTreeLevels(tree, config);
  const entities = await readEntities(root);
  const sources = await readSources(root);
  const assets = await readAssets(root, { hashFiles: hashAssetFiles });
  const variants = await readVariants(root, config, tree);
  const tracking = await readTracking(root, { nodeIds: [...tree.nodes.keys()], nodes: tree.nodes, legacyEntities: entities.entities });
  const errors = [...tree.errors, ...levels.errors, ...entities.errors, ...sources.errors, ...assets.errors, ...variants.errors];
  if (errors.length) throw new FolioError('WORK_INVALID', errors.map((e) => e.code).join(', '), { errors });
  return {
    root,
    config,
    tree,
    positions: computePositions(tree, config),
    entities: mergeManagedSubjects(entities.entities, tracking.subjects,
      [...new Set(tracking.records.flatMap((record) => [...(record.plan?.subjectKinds ?? []), ...(record.criteria ?? []).flatMap((c) => c.subjectKinds)]))]),
    sources: sources.sources,
    assets: assets.assets,
    tracking,
    blocks: validateBlocks(tree),
    // 판본 본문(N6): 판본 id → { texts: 노드 id → 본문, terms: 용어 대응표 }. variants 기능이 꺼지면 빈 Map.
    variants: variants.variants,
    warnings: [...configWarnings, ...levels.warnings, ...sources.warnings, ...assets.warnings, ...variants.warnings],
  };
}
