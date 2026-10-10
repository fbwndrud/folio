import { FolioError } from '../../core/errors.js';
import { RESOURCE_ROUTES } from './resource-routes.js';
import { exportViewer } from './export.js';
import {
  viewImpact, viewTracking, viewPublication, downloadPublication, readAssetFile, setStageMode, viewBlocks, viewCheckSets, viewEntity, viewGraph, viewNode, viewNodeReceipts, viewNodeEvidence, viewOutline, viewPromiseBoard, viewReceiptList, viewSource, viewSources, viewStages, viewerStillOn,
} from '../../core/view/index.js';

const MAX_ID = 200;

/** 경로 조각 하나를 id 로. 인코딩이 틀렸거나, 비었거나, 너무 길거나, 경로 글자가 있으면 거부한다. */
function segmentId(raw) {
  let id;
  try { id = decodeURIComponent(raw); } catch { throw new FolioError('ROUTE_INVALID', 'bad path encoding'); }
  if (!id || id.length > MAX_ID || /[/\\\0]/.test(id)) throw new FolioError('ROUTE_INVALID', 'bad id in path');
  return id;
}

/**
 * @typedef {{ root: string, packs: Map<string, any>, distDir: string, close: () => void }} ApiContext
 * @typedef {{ json: unknown } | { file: { type: string, bytes: Buffer } }} ApiResult
 */

/** 뷰어 API. 작품 root 는 서버를 띄울 때 정해지고, 요청은 root 나 파일 경로를 줄 수 없다 — id 만 준다. */
const ROUTES = [
  ...RESOURCE_ROUTES,
  ['GET', /^\/api\/work$/, async (ctx) => ({ json: await viewOutline(ctx.root, { packs: ctx.packs }) })],
  ['GET', /^\/api\/nodes\/([^/]+)$/, async (ctx, [id]) => ({ json: await viewNode(ctx.root, id) })],
  ['GET', /^\/api\/entities\/([^/]+)$/, async (ctx, [id]) => ({ json: await viewEntity(ctx.root, id) })],
  ['GET', /^\/api\/receipts$/, async (ctx) => ({ json: await viewReceiptList(ctx.root, { packs: ctx.packs }) })],
  ['GET', /^\/api\/receipts\/([^/]+)$/, async (ctx, [id]) => ({ json: await viewNodeReceipts(ctx.root, { packs: ctx.packs }, id) })],
  ['GET', /^\/api\/stages$/, async (ctx) => ({ json: await viewStages(ctx.root, { packs: ctx.packs }) })],
  ['POST', /^\/api\/stages$/, async (ctx, _ids, body) => ({ json: await setStageMode(ctx.root, { packs: ctx.packs }, body) })],
  ['GET', /^\/api\/assets\/([^/]+)$/, async (ctx, [id]) => ({ file: await readAssetFile(ctx.root, id) })],
  ['POST', /^\/api\/shutdown$/, async (ctx) => { ctx.close(); return { json: { closing: true } }; }],
  ['GET', /^\/api\/impact$/, async (ctx) => ({ json: await viewImpact(ctx.root, { packs: ctx.packs }) })],
  ['GET', /^\/api\/tracking$/, async (ctx) => ({ json: await viewTracking(ctx.root) })],
  ['GET', /^\/api\/publication$/, async (ctx) => ({ json: await viewPublication(ctx.root) })],
  ['GET', /^\/api\/publication\/(web|epub)$/, async (ctx, [format]) => ({ file: await downloadPublication(ctx.root, format) })],
  ['GET', /^\/api\/graph$/, async (ctx) => ({ json: await viewGraph(ctx.root) })],
  ['GET', /^\/api\/promises$/, async (ctx) => ({ json: await viewPromiseBoard(ctx.root) })],
  ['GET', /^\/api\/check-sets$/, async (ctx) => ({ json: await viewCheckSets(ctx.root, { packs: ctx.packs }) })],
  ['GET', /^\/api\/sources$/, async (ctx) => ({ json: await viewSources(ctx.root) })],
  ['GET', /^\/api\/sources\/([^/]+)$/, async (ctx, [id]) => ({ json: await viewSource(ctx.root, id) })],
  ['GET', /^\/api\/evidence\/([^/]+)$/, async (ctx, [id]) => ({ json: await viewNodeEvidence(ctx.root, id) })],
  ['GET', /^\/api\/blocks$/, async (ctx) => ({ json: await viewBlocks(ctx.root) })],
  ['POST', /^\/api\/export$/, async (ctx) => ({ json: await exportViewer({ root: ctx.root, packs: ctx.packs, distDir: ctx.distDir }) })],
];

/**
 * @param {{ method: string, pathname: string, body: unknown, ctx: ApiContext }} request
 * @returns {Promise<ApiResult>}
 */
export async function routeApi({ method, pathname, body, ctx }) {
  // 작가가 work.yaml 에서 viewer 기능을 끄면 떠 있던 서버도 더 답하지 않고 닫힌다(닫기 요청은 그대로 받는다) — M6 인계.
  if (pathname !== '/api/shutdown' && !(await viewerStillOn(ctx.root))) {
    ctx.close();
    throw new FolioError('FEATURE_DISABLED', 'viewer is turned off in work.yaml; this viewer is closing', { feature: 'viewer' });
  }
  let known = false;
  for (const [verb, pattern, handler] of ROUTES) {
    const match = /** @type {RegExp} */ (pattern).exec(pathname);
    if (!match) continue;
    known = true;
    if (verb !== method) continue;
    return /** @type {(ctx: ApiContext, ids: string[], body: unknown) => Promise<ApiResult>} */ (handler)(ctx, match.slice(1).map(segmentId), body);
  }
  if (known) throw new FolioError('METHOD_NOT_ALLOWED', method.slice(0, 10));
  throw new FolioError('ROUTE_UNKNOWN', pathname.slice(0, 200));
}
