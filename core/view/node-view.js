import { sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { attachedAssetIds } from '../store/asset-bindings.js';
import { openWork } from '../store/work.js';
import { ancestorsOf, preorder } from '../store/tree.js';
import { scanMentions } from '../index/scan.js';
import { blockCatalog } from '../blocks/catalog.js';
import { bodySegments } from './segments.js';
import { rememberSnapshotAsset } from './snapshot-assets.js';

const unique = (ids) => [...new Set(ids)];

/**
 * 그림 하나의 요약. 설명서가 없으면 known:false, 이미지 파일이 없으면(생성 전) hasFile:false.
 * @param {Awaited<ReturnType<typeof openWork>>} work
 * @param {string} id
 */
export function assetSummary(work, id) {
  const asset = work.assets.get(id);
  if (!asset) return { id, known: false, hasFile: false, entities: [] };
  const missing = work.warnings.some((w) => ['ASSET_FILE_MISSING', 'ASSET_FILE_NOT_REGULAR', 'ASSET_CONTENT_CHANGED'].includes(w.code) && w.id === id);
  return rememberSnapshotAsset({ id, known: true, hasFile: asset.file !== null && !missing, entities: [...asset.entities], ...(asset.managed ? { status: asset.status, approved: asset.approved, contentVerified: asset.contentVerified } : {}) }, asset);
}

/**
 * 읽기 화면: 노드 하나의 본문 조각(엔티티 이름·그림), 위층 경로, 앞뒤 본문, 붙은 그림, 나오는 엔티티. 읽기만 한다.
 * 앞뒤는 읽는 순서에서 본문이 있는 맨 아래 칸(leaf)이다.
 * @param {string} root
 * @param {string} nodeId
 */
export async function viewNode(root, nodeId, context = null) {
  const work = context?.work ?? await openWork(root);
  const node = work.tree.nodes.get(nodeId);
  if (!node) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  const order = preorder(work.tree);
  const index = order.indexOf(nodeId);
  const readable = (ids) => ids.find((id) => {
    const other = work.tree.nodes.get(id);
    return other.kind === 'leaf' && other.body.trim().length > 0;
  }) ?? null;
  // 블록 참조는 가리키는 앵커가 있는 노드와 번호 이름(blocks 기능이 켜졌을 때만, 없으면 null)을, 각주는 번호를, 자료 인용은 자료가 있는지를 붙인다.
  const catalog = work.config.features.blocks ? blockCatalog(work, { nodeId }) : null;
  const labels = new Map((catalog?.refs ?? []).filter((r) => r.nodeId === nodeId).map((r) => [r.target, r.label]));
  const numbers = new Map((catalog?.footnotes ?? []).filter((f) => f.nodeId === nodeId).map((f) => [f.id, f.number]));
  const segments = bodySegments(node.body, work.entities.values()).map((s) => {
    if ('blockRef' in s) return { ...s, nodeId: work.blocks.anchors.get(s.blockRef)?.nodeId ?? null, label: labels.get(s.blockRef) ?? null };
    if ('footnoteRef' in s) return { ...s, number: numbers.get(s.footnoteRef) ?? null };
    if ('citation' in s) return { ...s, valid: work.sources.has(s.citation), label: work.sources.get(s.citation)?.title || s.citation };
    return s;
  });
  const counts = scanMentions(node.body, work.entities.values());
  const entityIds = unique([...node.entities.filter((id) => work.entities.has(id)), ...counts.keys()]).sort();
  return {
    node: {
      id: node.id, level: node.level, kind: node.kind, role: node.role, status: node.status, title: node.title,
      parentId: node.parentId, children: [...node.children],
    },
    breadcrumb: ancestorsOf(work.tree, nodeId).reverse().map((a) => ({ id: a.id, level: a.level, title: a.title })),
    prev: readable(order.slice(0, index).reverse()),
    next: readable(order.slice(index + 1)),
    segments,
    contentHash: sha256(node.body),
    assets: {
      inline: unique(segments.flatMap((s) => ('asset' in s ? [s.asset] : []))).map((id) => assetSummary(work, id)),
      attached: attachedAssetIds(work, node).map((id) => assetSummary(work, id)),
    },
    entities: entityIds.map((id) => {
      const entity = work.entities.get(id);
      return { id, kind: entity.kind, name: entity.name, declared: node.entities.includes(id), count: counts.get(id) ?? 0 };
    }),
  };
}
