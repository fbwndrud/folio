import { FolioError } from '../errors.js';
import { isPlainObject } from '../util/plain.js';

export const LAYOUT_LIMITS = Object.freeze({ pages: 500, items: 5000, problems: 200, bytes: 1048576 });
const keys = (value, allowed) => isPlainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9][\w-]{0,79}$/.test(value);
const number = (value) => typeof value === 'number' && Number.isFinite(value);
const invalid = (field) => { throw new FolioError('LAYOUT_INVALID', `지면 형식이 잘못됐다: ${field}`, { field }); };

/** 작가가 적은 지면은 그대로 돌려준다. 배치·분량 경고가 좌표나 원고를 바꾸지 않는다. */
export function validateLayout(input, work) {
  if (!keys(input, ['version', 'page', 'pages']) || input.version !== 1) invalid('version');
  const page = input.page;
  if (!keys(page, ['widthMm', 'heightMm', 'marginMm'])) invalid('page');
  if (![page.widthMm, page.heightMm].every((v) => number(v) && v >= 20 && v <= 1000)) invalid('page.size');
  if (!number(page.marginMm) || page.marginMm < 0 || page.marginMm * 2 >= Math.min(page.widthMm, page.heightMm)) invalid('page.marginMm');
  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > LAYOUT_LIMITS.pages) invalid('pages');
  const ids = new Set(), placed = new Set(), spreads = new Map(), problems = [];
  let count = 0, truncated = false;
  const add = (problem) => {
    if (problems.length < LAYOUT_LIMITS.problems) problems.push({ severity: 'advisory', ...problem });
    else truncated = true;
  };
  for (const sheet of input.pages) {
    if (!keys(sheet, ['id', 'spreadId', 'side', 'items']) || !id(sheet.id) || ids.has(sheet.id)) invalid('pages.id');
    ids.add(sheet.id);
    if (sheet.spreadId !== undefined || sheet.side !== undefined) {
      if (!id(sheet.spreadId) || !['left', 'right'].includes(sheet.side)) invalid('pages.spread');
      if (!spreads.has(sheet.spreadId)) spreads.set(sheet.spreadId, []);
      spreads.get(sheet.spreadId).push(sheet.side);
    }
    if (!Array.isArray(sheet.items) || (count += sheet.items.length) > LAYOUT_LIMITS.items) invalid('pages.items');
    for (const [index, item] of sheet.items.entries()) {
      if (!keys(item, ['nodeId', 'assetId', 'xMm', 'yMm', 'widthMm', 'heightMm', 'fit', 'maxChars'])) invalid('item');
      if ((item.nodeId === undefined) === (item.assetId === undefined)) invalid('item.target');
      if (![item.xMm, item.yMm].every((v) => number(v) && v >= 0) || ![item.widthMm, item.heightMm].every((v) => number(v) && v > 0)) invalid('item.rect');
      if (item.fit !== undefined && !['contain', 'cover'].includes(item.fit)) invalid('item.fit');
      if (item.maxChars !== undefined && (!Number.isSafeInteger(item.maxChars) || item.maxChars < 1 || item.nodeId === undefined)) invalid('item.maxChars');
      if (item.nodeId !== undefined) {
        if (typeof item.nodeId !== 'string' || work.tree.nodes.get(item.nodeId)?.kind !== 'leaf' || placed.has(item.nodeId)) invalid('item.nodeId');
        placed.add(item.nodeId);
        if (item.maxChars && [...work.tree.nodes.get(item.nodeId).body].length > item.maxChars) add({ code: 'LAYOUT_TEXT_BUDGET', pageId: sheet.id, index, nodeId: item.nodeId, maxChars: item.maxChars });
      } else if (typeof item.assetId !== 'string' || !work.assets.has(item.assetId)) invalid('item.assetId');
      const right = item.xMm + item.widthMm, bottom = item.yMm + item.heightMm;
      if (right > page.widthMm || bottom > page.heightMm) add({ code: 'LAYOUT_OUTSIDE_PAGE', pageId: sheet.id, index });
      if (item.xMm < page.marginMm || item.yMm < page.marginMm || right > page.widthMm - page.marginMm || bottom > page.heightMm - page.marginMm) add({ code: 'LAYOUT_MARGIN', pageId: sheet.id, index });
      for (let j = 0; j < index; j += 1) {
        const other = sheet.items[j];
        if (item.xMm < other.xMm + other.widthMm && other.xMm < right && item.yMm < other.yMm + other.heightMm && other.yMm < bottom) add({ code: 'LAYOUT_OVERLAP', pageId: sheet.id, items: [j, index] });
      }
    }
  }
  for (const sides of spreads.values()) if (sides.length !== 2 || !sides.includes('left') || !sides.includes('right')) invalid('pages.spreadPair');
  for (const node of work.tree.nodes.values()) if (node.kind === 'leaf' && !placed.has(node.id)) add({ code: 'LAYOUT_UNPLACED', nodeId: node.id });
  if (truncated) problems[LAYOUT_LIMITS.problems - 1] = { severity: 'advisory', code: 'LAYOUT_PROBLEMS_TRUNCATED' };
  return { layout: input, problems };
}
