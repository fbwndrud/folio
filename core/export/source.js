import { attachedAssetIds } from '../store/asset-bindings.js';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { validateBlocks } from '../store/blocks.js';
import { blockCatalog } from '../blocks/catalog.js';
import { openLedger } from '../ledger/ledger.js';
import { lastCommits, receiptsById } from '../ledger/receipts.js';
import { MAIN, variantOf } from '../variants/model.js';
import { sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { readLayout } from '../layout/read.js';
import { xml } from './text.js';

export const EXPORT_LIMITS = Object.freeze({ nodes: 5000, files: 5000, assets: 5000, bytes: 67108864 });
/** 파일·기록장을 읽기만 하며 선택 판본의 별도 트리에서 블록을 투영한다. */
export async function loadExportSource({ root, variant = MAIN, language = null }) {
  const original = await openWork(root, { hashAssetFiles: false });
  if (original.config.features.export === false) throw new FolioError('FEATURE_DISABLED', '내보내기 기능이 꺼졌다', { feature: 'export' });
  const declaration = variant === MAIN ? { lang: original.config.language ?? 'ko' } : original.config.variantSpecs[variant];
  if (!declaration) throw new FolioError('EXPORT_VARIANT_INVALID', '선언하지 않은 판본이다', { variant });
  if (variant !== MAIN && !original.config.features.variants) throw new FolioError('FEATURE_DISABLED', '판본 기능이 꺼졌다', { feature: 'variants' });
  const ids = preorder(original.tree).filter((id) => original.tree.nodes.get(id).kind === 'leaf');
  if (!ids.length) throw new FolioError('EXPORT_EMPTY', '내보낼 잎 원고가 없다');
  if (ids.length > EXPORT_LIMITS.nodes) throw new FolioError('EXPORT_LIMIT', '원고 잎이 5000개를 넘었다');
  const records = await openLedger(root, 'receipts').readAll(), commits = lastCommits(records, variant), receipts = receiptsById(records);
  const mainCommits = lastCommits(records, MAIN);
  const nodes = new Map(original.tree.nodes), warnings = [...original.warnings], manifestNodes = [];
  let bytes = 0;
  for (const id of ids) {
    const node = original.tree.nodes.get(id), text = variant === MAIN ? node : original.variants.get(variant)?.texts.get(id);
    if (!text) throw new FolioError('EXPORT_VARIANT_MISSING', '판본 원고가 빠졌다', { variant, nodeId: id });
    xml(text.body); xml(text.title ?? node.title ?? id);
    bytes += Buffer.byteLength(text.body); if (bytes > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '원고가 64MiB를 넘었다');
    const assets = attachedAssetIds(original, node);
    nodes.set(id, { ...node, assets, data: { ...node.data, assets }, body: text.body, title: text.title ?? node.title });
    const bodyHash = sha256(text.body), commit = commits.get(id), receipt = commit ? receipts.get(commit.receiptId) : null;
    const bound = Boolean(commit && receipt && receipt.nodeId === id && variantOf(receipt) === variant && receipt.draftHash === commit.committedHash);
    manifestNodes.push({ id, bodyHash, status: node.status, commitReceiptId: bound ? commit.receiptId : null, committedHash: bound ? commit.committedHash : null });
    if (!bound || (variant === MAIN && node.status !== 'committed')) warnings.push({ code: 'EXPORT_UNVERIFIED', nodeId: id, variant });
    else if (bodyHash !== commit.committedHash) warnings.push({ code: 'EXPORT_BODY_CHANGED', nodeId: id, variant });
    if (bound && variant !== MAIN) {
      const main = mainCommits.get(id), source = receipt.original;
      if (!source || source.receiptId !== main?.receiptId || source.committedHash !== main?.committedHash || sha256(node.body) !== source.committedHash) {
        warnings.push({ code: 'EXPORT_SOURCE_CHANGED', nodeId: id, variant });
      }
      const terms = receipt.refs.find(ref => ref.kind === 'terms' && ref.id === variant);
      if (!terms || terms.rev !== original.variants.get(variant)?.terms.rev) warnings.push({ code: 'EXPORT_TERMS_CHANGED', nodeId: id, variant });
    }
  }
  const tree = { ...original.tree, nodes }, work = { ...original, tree, blocks: validateBlocks(tree) };
  const catalog = blockCatalog(work); warnings.push(...catalog.problems);
  const layout = original.config.features.layout === false ? { layout: null, problems: [{ code: 'LAYOUT_DISABLED' }] } : await readLayout(root, work);
  warnings.push(...layout.problems);
  const title = original.config.title; let lang;
  try { lang = Intl.getCanonicalLocales(language ?? declaration.lang ?? 'ko')[0]; }
  catch { throw new FolioError('EXPORT_LANGUAGE_INVALID', '지원되는 언어 태그를 지정해야 한다'); }
  if (!lang) throw new FolioError('EXPORT_LANGUAGE_INVALID', '언어 태그가 비었다'); if (!title.trim()) throw new FolioError('EXPORT_TITLE_INVALID', '작품 제목이 비었다');
  xml(title); xml(lang);
  return { root, work, variant, title, lang, nodes: ids.map((id) => nodes.get(id)), catalog, layout: layout.layout, warnings, manifestNodes, receiptsHash: sha256(JSON.stringify(records)) };
}
