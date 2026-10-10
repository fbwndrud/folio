import { parseArgs } from 'node:util';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FolioError } from '../../core/errors.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createViewerRegistry, DIST_DIR, preferredPort } from './registry.js';
import { startViewServer } from './http-server.js';
import { startExportPreview } from './export-preview.js';

const HELP = `Folio viewer

View a work locally:
  npm run viewer -- "/path/to/work"
  folio-view "/path/to/work" --section opening

Preview a read-only export:
  npm run preview -- "/path/to/work/exports/viewer"
  folio-view --preview "/path/to/work/exports/viewer"

Options:
  --section <id>  Open a section in the live work viewer.
  --preview       Serve an exported review copy; no work APIs or editing.
  --help          Show this help.

Open the printed address in your browser. These servers run only on this
computer. Close the work viewer with Close viewer, or stop either server with
Ctrl+C. An idle server closes after 30 minutes. Source checkout setup: npm run setup.
An installed tarball already includes the viewing screens.
`;

export function launchError(error) {
  const code = /** @type {any} */ (error)?.code;
  if (code === 'VIEWER_NOT_BUILT') return 'The viewing screens are not prepared. In a source checkout, run npm run setup. For an installed package, reinstall a prepared tarball.';
  if (code === 'VIEWER_EXPORT_INVALID') return 'This is not a Folio viewer export. Choose the exports/viewer folder made by Export review view.';
  if (code === 'FEATURE_DISABLED') return 'The viewer is turned off for this work. Ask your AI assistant to check the work settings.';
  if (code === 'NODE_NOT_FOUND') return 'That section does not exist. Open the work without --section to choose from Contents.';
  if (code === 'VIEWER_USAGE_INVALID' || String(code).startsWith('ERR_PARSE_ARGS')) return `Choose one work or export folder. Use --help for examples.\n${HELP}`;
  return `The viewer could not start. Check the selected folder and its work settings.\nTechnical details: ${code || 'ERROR'}`;
}

/** Preserve the MCP server's lifecycle; the standalone command holds its own process open. */
export async function waitForViewer(service, host = process) {
  const keepAlive = setInterval(() => {}, 60_000);
  const stop = () => { service.close().catch(() => {}); };
  host.once('SIGINT', stop);
  host.once('SIGTERM', stop);
  try { await service.closed; }
  finally { clearInterval(keepAlive); host.removeListener('SIGINT', stop); host.removeListener('SIGTERM', stop); }
}

/** @param {string} root @param {{ nodeId?: string, distDir?: string, packs?: Map<string, any> }} [options] */
export async function startWorkViewer(root, { nodeId, distDir = DIST_DIR, packs } = {}) {
  if (!await lstat(join(distDir, 'index.html')).then((info) => info.isFile(), () => false)) throw new FolioError('VIEWER_NOT_BUILT', 'prepare the screens');
  /** @type {Awaited<ReturnType<typeof startViewServer>>|null} */
  let service = null;
  const registry = createViewerRegistry({ packs: packs ?? await loadBuiltinPacks(), distDir, start: async (options) => {
    service = await startViewServer(options); return service;
  } });
  const result = await registry.open(root, nodeId === undefined ? {} : { nodeId });
  return { url: result.url, close: () => registry.closeAll(), closed: service.closed };
}

/** @param {string[]} args */
export async function launchViewer(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: 'boolean' }, preview: { type: 'boolean' }, section: { type: 'string' },
  } });
  if (values.help) { process.stdout.write(HELP); return; }
  if (positionals.length !== 1 || (values.preview && values.section !== undefined)) throw new FolioError('VIEWER_USAGE_INVALID', 'choose one folder');
  const root = resolve(positionals[0]);
  if (values.preview) {
    const preview = await startExportPreview(root, { port: preferredPort(root) }).catch((error) => {
      if (error?.code === 'EADDRINUSE') return startExportPreview(root); throw error;
    });
    process.stdout.write(`Local preview · Read only\n${preview.url}\nStop with Ctrl+C.\n`);
    await waitForViewer(preview);
    return;
  }
  const service = await startWorkViewer(root, { nodeId: values.section });
  process.stdout.write(`Local work viewer\n${service.url}\nClose with Close viewer or Ctrl+C.\n`);
  await waitForViewer(service);
}
