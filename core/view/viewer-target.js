import { viewWorkspaceMode, workspaceCapabilities } from './workspace-mode.js';
import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { loadWorkConfig } from '../work/config.js';
import { assertFeature } from '../work/features.js';

/**
 * folio_view 가 서버를 띄우기 전에 본다: 작품이 열리고, viewer 기능이 켜져 있고, nodeId 를 줬다면 그 노드가 있다.
 * @param {string} root
 * @param {string} [nodeId]
 */
export async function viewerTarget(root, nodeId) {
  const workspace = await viewWorkspaceMode(root);
  if (workspace.mode === 'resources') {
    if (nodeId !== undefined) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
    return { title: workspace.title, mode: workspace.mode, capabilities: workspaceCapabilities(workspace.mode, null) };
  }
  const work = await openWork(root);
  assertFeature(work.config, 'viewer');
  if (nodeId !== undefined && !work.tree.nodes.has(nodeId)) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  return { title: work.config.title, mode: 'writing', capabilities: workspaceCapabilities('writing', work.config) };
}

/**
 * 떠 있는 뷰어 서버가 요청마다 본다: work.yaml 에서 viewer 기능이 꺼졌는가. 꺼졌으면 false — 서버는 답하지 않고 닫힌다.
 * work.yaml 을 읽을 수 없으면 true 를 돌려준다 — 그 오류는 각 화면 요청이 제 코드로 알린다.
 * @param {string} root
 */
export async function viewerStillOn(root) {
  try {
    const { config } = await loadWorkConfig(root);
    return config.features.viewer !== false;
  } catch {
    return true;
  }
}
