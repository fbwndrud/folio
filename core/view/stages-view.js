import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { openWorkspace } from '../run/workspace.js';
import { readTextOrNull } from '../util/fs.js';
import { sha256 } from '../util/hash.js';

/**
 * 단계 하나에 뷰어가 줄 수 있는 모드. 잠금 단계는 아무것도 없다(화면은 자물쇠만 그린다).
 * auto 는 승인(gate) 단계만 된다(core/pipeline/define.js 와 같은 규칙).
 * @param {{ kind: string, locked?: boolean }} step
 */
export const allowedModes = (step) => (step.locked ? [] : step.kind === 'gate' ? ['on', 'off', 'auto'] : ['on', 'off']);

/** work.yaml 글. 없으면 WORK_NOT_FOUND. */
export async function readWorkYaml(root) {
  const text = await readTextOrNull(join(root, 'work.yaml'));
  if (text === null) throw new FolioError('WORK_NOT_FOUND', `no work.yaml in ${root}`);
  return text;
}

/** @param {any} step */
const stepView = (step) => ({
  id: step.id, kind: step.kind, tier: step.tier ?? null, mode: step.mode ?? 'on', locked: Boolean(step.locked), custom: Boolean(step.custom),
  reason: step.reason ?? null, source: step.source ?? null, modes: allowedModes(step),
});

/**
 * 단계 화면: 레벨마다 단계 흐름(잠금·모드·켤 수 있는 모드). digest 는 지금 work.yaml 글의 hash 로,
 * 토글 요청이 그대로 돌려줘야 한다(그 사이 work.yaml 이 바뀌었으면 쓰기를 거부한다).
 * @param {string} root
 * @param {{ packs: Map<string, any> }} options
 */
export async function viewStages(root, { packs }) {
  const text = await readWorkYaml(root);
  const { work, pipelines } = await openWorkspace(root, { packs });
  return {
    digest: sha256(text),
    toggles: work.config.features.viewerToggles,
    levels: work.config.levels.map((level) => ({
      level: level.name, kind: level.leaf ? 'leaf' : 'branch', steps: pipelines.byLevel[level.name].steps.map(stepView),
    })),
  };
}
