/** Legacy node metadata and managed asset bindings share one attachment view. */
export function attachedAssetIds(work, node) {
  return [...new Set([
    ...node.assets,
    ...[...work.assets.values()].filter((asset) => asset.nodeIds?.includes(node.id)).map((asset) => asset.id),
  ])];
}
