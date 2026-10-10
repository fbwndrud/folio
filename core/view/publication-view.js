import { FolioError } from '../errors.js';
import { checkExport, bundlePublication } from '../export/export-work.js';
import { zipFiles } from '../export/zip.js';

export async function viewPublication(root) { return checkExport({ root }); }
/** Authenticated read-only download; output paths cannot be supplied by the browser. */
export async function downloadPublication(root, format) {
  if (!['web', 'epub'].includes(format)) throw new FolioError('EXPORT_FORMAT_INVALID', 'choose web or epub');
  const { files } = await bundlePublication({ root, format });
  return { type: format === 'epub' ? 'application/epub+zip' : 'application/zip',
    bytes: format === 'epub' ? files.get('book.epub') : zipFiles(files) };
}
