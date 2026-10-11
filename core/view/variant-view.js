import { FolioError } from '../errors.js';
import { MAIN, VARIANT_ID } from '../variants/model.js';
import { variantTextOf } from '../variants/original.js';
import { lastCommits } from '../ledger/receipts.js';
import { sha256 } from '../util/hash.js';
import { validateBlocks } from '../store/blocks.js';
import { viewNode } from './node-view.js';
import { viewNodeReceipts } from './receipt-view.js';
import { writingReadContext } from './read-context.js';
import { assertWritingCheckpoint } from './writing-checkpoint.js';
import { checkExport } from '../export/export-work.js';
import { viewWorkspaceMode } from './workspace-mode.js';
import { downloadPublication } from './publication-view.js';

function declaration(work, id) {
  if (id === MAIN) return { id: MAIN, kind: 'original', lang: null };
  if (typeof id !== 'string' || !VARIANT_ID.test(id) || !Object.hasOwn(work.config.variantSpecs, id)) throw new FolioError('VARIANT_UNKNOWN', 'Choose a declared edition');
  if (!work.config.features.variants) throw new FolioError('FEATURE_DISABLED', 'variants are turned off', { feature: 'variants' });
  return work.config.variantSpecs[id];
}
/** A temporary reading projection. Missing translation text never falls back to main. */
function project(context, variant) {
  const { work, receipts } = context, commits = lastCommits(receipts.records ?? [], variant);
  const nodes = new Map([...work.tree.nodes].map(([id, node]) => {
    const text = variantTextOf(work, variant, id), commit = commits.get(id);
    return [id, { ...node, body: text?.body ?? '', title: text?.title ?? node.title,
      status: text && commit && sha256(text.body) === commit.committedHash ? 'committed' : 'planned' }];
  }));
  const pairs = work.variants.get(variant)?.terms.pairs ?? [];
  const entities = new Map([...work.entities].map(([id, entity]) => {
    const name = pairs.find(p => p.from === entity.name)?.to ?? entity.name;
    return [id, { ...entity, name, aliases: [...(entity.aliases ?? []), entity.name] }];
  }));
  const tree = { ...work.tree, nodes };
  return { ...context, work: { ...work, tree, entities, blocks: validateBlocks(tree) } };
}
export async function variantCatalog(context) {
  const { work, status, receipts } = context;
  return { originalMetadata: true, editions: [declaration(work, MAIN), ...(work.config.features.variants ? work.config.variants.filter(id => id !== MAIN).map(id => ({ ...declaration(work, id), status: status?.variants?.[id] ?? null })) : [])], ledger: receipts.ledger };
}
export async function viewVariants(root, { packs }) {
  if ((await viewWorkspaceMode(root)).mode === 'resources') return { editions: [] };
  const context = await writingReadContext(root, packs), result = await variantCatalog(context);
  await assertWritingCheckpoint(root, context.checkpoint); return result;
}
export async function variantNode(context, root, variant, id, projected = null) {
  const spec = declaration(context.work, variant);
  const result = await viewNode(root, id, variant === MAIN ? context : projected ?? project(context, variant));
  const text = variant === MAIN ? context.work.tree.nodes.get(id) : variantTextOf(context.work, variant, id);
  return { ...result, edition: { ...spec, missing: !text, originalMetadata: variant !== MAIN, ledgerVerified: context.receipts.ledger.ok } };
}
export async function viewVariantNode(root, { packs }, variant, id) {
  const context = await writingReadContext(root, packs), result = await variantNode(context, root, variant, id);
  await assertWritingCheckpoint(root, context.checkpoint); return result;
}
export async function variantReceipts(context, root, packs, variant, id) {
  declaration(context.work, variant);
  return viewNodeReceipts(root, { packs, variant }, id, context);
}
export async function viewVariantReceipts(root, { packs }, variant, id) {
  const context = await writingReadContext(root, packs), result = await variantReceipts(context, root, packs, variant, id);
  await assertWritingCheckpoint(root, context.checkpoint); return result;
}
export async function viewVariantPublication(root, { packs }, variant, format = null) {
  const context = await writingReadContext(root, packs); declaration(context.work, variant);
  const result = format ? await downloadPublication(root, format, { variant }) : await checkExport({ root, variant });
  await assertWritingCheckpoint(root, context.checkpoint); return result;
}
/** Snapshot reuses one checked context; no persistent cache. */
export async function variantSnapshot(context, root, packs) {
  const catalog = await variantCatalog(context), editions = {};
  for (const spec of catalog.editions.filter(s => s.id !== MAIN)) {
    const nodes = {}, receiptNodes = {}, projected = project(context, spec.id);
    for (const id of context.work.tree.nodes.keys()) {
      nodes[id] = await variantNode(context, root, spec.id, id, projected);
      receiptNodes[id] = await variantReceipts(context, root, packs, spec.id, id);
    }
    let publication;
    try { publication = await checkExport({ root, variant: spec.id }); }
    catch (error) { if (!(error instanceof FolioError)) throw error; publication = { unavailable: true, code: error.code }; }
    editions[spec.id] = { nodes, receiptNodes, publication };
  }
  return { catalog, editions };
}
