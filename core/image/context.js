import { FolioError } from '../errors.js';
import { openWorkspace } from '../run/workspace.js';
import { assertFeature } from '../work/features.js';
import { checkProjection } from '../checks/applied.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { IMAGE_PACK, IMAGE_STAGES } from './stages.js';

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 그림 실행이 묶이는 설정: 그림 stage 검사(고른 세트·work.yaml checks 반영)와 그림 기능 둘. 바뀌면 열린 그림 실행은 점검부터 다시 돈다. */
export function imageSpecDigest(checks, features) {
  return sha256(canonicalJson({
    precheck: checks.precheck.map(checkProjection), review: checks.review.map(checkProjection),
    features: { imageReferences: Boolean(features.imageReferences), imageReview: Boolean(features.imageReview) },
  }));
}

/**
 * 그림 실행의 작업 맥락: openWorkspace(설정 검증 전부) + 그림 stage 검사 + 설정 digest.
 * 작품이 image 팩을 쓰지 않으면 IMAGE_PACK_REQUIRED, images 기능이 꺼졌으면 FEATURE_DISABLED(assertFeature)다.
 * @param {string} root
 * @param {{ packs: Map<string, any>, requireFeature?: boolean }} options
 */
export async function openImageContext(root, { packs, requireFeature = true }) {
  const workspace = await openWorkspace(root, { packs });
  const { config } = workspace.work;
  if (!config.packs.includes(IMAGE_PACK)) {
    throw new FolioError('IMAGE_PACK_REQUIRED', 'add the image pack to work.yaml packs to make pictures', { hint: 'packs: [<first pack>, image]' });
  }
  if (requireFeature) assertFeature(config, 'images');
  const checks = {
    precheck: workspace.checks.filter((c) => c.stage === IMAGE_STAGES.precheck).sort(byId),
    review: workspace.checks.filter((c) => c.stage === IMAGE_STAGES.review).sort(byId),
  };
  return { ...workspace, imageChecks: checks, specDigest: imageSpecDigest(checks, config.features), features: config.features };
}
