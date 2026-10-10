import { htmlDocument, xml } from './text.js';
import { STYLE } from './web.js';
import { epubZip } from './zip.js';
import { sha256 } from '../util/hash.js';
import { publicationLabel } from './labels.js';
/** EPUB 3.3 reflow 묶음. 지면 전용 그림도 끝 부록에 보존한다. */
export function epubFiles(source, render, assets, modified) {
  if (source.layout) source.warnings.push({ code: 'EPUB_LAYOUT_REFLOW', message: 'Fixed page positions do not apply to EPUB.' });
  const extras = new Set();
  for (const page of source.layout?.pages ?? []) for (const item of page.items) if (item.assetId !== undefined) extras.add(item.assetId);
  const appendix = extras.size ? `<section><h2>지면 그림</h2>${[...extras].map((id) => `<figure>${render.image(id)}</figure>`).join('')}</section>` : '';
  const draft = source.warnings.some(w => w.code === 'EXPORT_UNVERIFIED')
    ? `<p class="publication-draft">${publicationLabel('Draft edition — some sections have not completed review.', source.lang)}</p>` : '';
  const body = `<h1>${xml(source.title)}</h1>${draft}${render.body}${appendix}${render.bibliography}`;
  const files = new Map([
    ['mimetype', Buffer.from('application/epub+zip')],
    ['META-INF/container.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')],
    ['OEBPS/book.xhtml', Buffer.from(htmlDocument(source.title, body, source.lang))],
    ['OEBPS/nav.xhtml', Buffer.from(htmlDocument(source.title, `<nav epub:type="toc" id="toc"><h1>${publicationLabel('Contents', source.lang)}</h1><ol>${render.toc.replaceAll('href="#', 'href="book.xhtml#')}</ol></nav>`, source.lang))],
    ['OEBPS/style.css', Buffer.from(STYLE)],
  ]);
  const identifiers = sha256(JSON.stringify({ title: source.title, variant: source.variant, nodes: source.manifestNodes, assets: [...assets.values()].map((a) => a.hash) }));
  let imageItems = '', svg = false;
  for (const [index, asset] of [...assets.values()].entries()) {
    files.set(`OEBPS/${asset.name}`, asset.bytes); if (asset.type === 'image/svg+xml') svg = true;
    imageItems += `<item id="image-${index}" href="${asset.name}" media-type="${asset.type}"/>`;
  }
  const packageText = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:sha256:${identifiers}</dc:identifier><dc:title>${xml(source.title)}</dc:title><dc:language>${xml(source.lang)}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="book" href="book.xhtml" media-type="application/xhtml+xml"${svg ? ' properties="svg"' : ''}/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${imageItems}</manifest><spine><itemref idref="book"/></spine></package>`;
  files.set('OEBPS/package.opf', Buffer.from(packageText));
  return new Map([['book.epub', epubZip(files)]]);
}
