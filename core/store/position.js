import { FolioError } from '../errors.js';
import { orderModeFor } from '../work/config.js';

/**
 * 순서 방식으로 빠진 까닭을 윗노드에서 물려받아 이 노드 레벨의 방식과 합친다(N4). branching 이 none 보다 앞선다.
 * @param {'branching'|'none'|null} parentReason
 * @param {string} orderMode
 * @returns {'branching'|'none'|null}
 */
function modeReasonOf(parentReason, orderMode) {
  if (parentReason === 'branching' || orderMode === 'branching') return 'branching';
  if (parentReason === 'none' || orderMode === 'none') return 'none';
  return null;
}

/**
 * 깊이와 상관없는 한 줄 순번. 가지 노드(계획)는 자식보다 앞에 온다.
 * front/back 역할, linear가 아닌 레벨, 그리고 그 자손은 앞뒤 판정에서 빠진다.
 * unorderedBy(N4)는 빠진 까닭이다. 앞뒤 판정 안이면 null.
 * - 'branching': 이 노드나 윗노드의 레벨이 branching(N7 이 정한다). none 과 겹치면 branching 이 앞선다.
 * - 'none': 이 노드나 윗노드의 레벨이 none.
 * - 'role': 순서 방식은 linear 인데 front·back 역할(또는 그 자손)이라 빠졌다.
 */
export function computePositions(tree, config) {
  const positions = new Map();
  let ordinal = 0;
  const walk = (ids, prefix, parentOrdered, parentReason) => {
    ids.forEach((id, index) => {
      const node = tree.nodes.get(id);
      const key = [...prefix, String(index + 1).padStart(4, '0')];
      const orderMode = orderModeFor(config, node.level);
      const ordered = parentOrdered && orderMode === 'linear' && node.role === 'body';
      const modeReason = modeReasonOf(parentReason, orderMode);
      positions.set(id, { ordinal: ordinal++, key: key.join('.'), orderMode, ordered, unorderedBy: ordered ? null : modeReason ?? 'role' });
      walk(node.children, key, ordered, modeReason);
    });
  };
  walk(tree.rootIds, [], true, null);
  return positions;
}

export function compareNodes(positions, a, b) {
  const pa = positions.get(a);
  const pb = positions.get(b);
  if (!pa || !pb) throw new FolioError('NODE_NOT_FOUND', !pa ? a : b);
  if (!pa.ordered || !pb.ordered) return 'not_applicable';
  if (pa.ordinal === pb.ordinal) return 'same';
  return pa.ordinal < pb.ordinal ? 'before' : 'after';
}
