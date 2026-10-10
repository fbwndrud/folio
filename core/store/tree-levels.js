import { levelIndex } from '../work/config.js';

/** 레벨 정의와 트리가 맞는지 본다. 개수 범위는 경고만 한다(계획서: 막지 않음). */
export function validateTreeLevels(tree, config) {
  const errors = [];
  const warnings = [];
  for (const node of tree.nodes.values()) {
    const index = levelIndex(config, node.level);
    if (index < 0) { errors.push({ code: 'LEVEL_UNKNOWN', id: node.id, level: node.level }); continue; }
    const level = config.levels[index];
    if (level.leaf !== (node.kind === 'leaf')) errors.push({ code: 'LEVEL_KIND_MISMATCH', id: node.id, level: node.level, kind: node.kind });
    const parent = node.parentId ? tree.nodes.get(node.parentId) : null;
    if (parent && levelIndex(config, parent.level) >= index) errors.push({ code: 'LEVEL_ORDER_INVALID', id: node.id, parent: parent.id });
    if (!parent && index !== 0 && node.role === 'body') warnings.push({ code: 'ROOT_LEVEL_NOT_TOP', id: node.id, level: node.level });
    if (node.kind === 'branch' && level.children && node.children.length > 0) {
      const count = node.children.length;
      if (count < level.children[0] || count > level.children[1]) {
        warnings.push({ code: 'LEVEL_CHILDREN_OUT_OF_RANGE', id: node.id, count, range: level.children });
      }
    }
  }
  return { errors, warnings };
}
