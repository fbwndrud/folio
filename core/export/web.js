import { htmlDocument, xml } from './text.js';
import { warningLabel } from './warning-labels.js';
import { publicationLabel } from './labels.js';
export const STYLE = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#ece8df;color:#242721;font-family:Georgia,"Noto Serif KR",serif;line-height:1.7;overflow-wrap:anywhere}header,main>nav,.warnings{max-width:900px;margin:24px auto;padding:0 28px}h1{font-size:2.2rem}h2{font-size:1.3rem}.chapter>h2,.chapter>h3,.chapter>h4,.chapter>h5,.chapter>h6{max-width:900px;margin:40px auto 20px;padding:0 28px}a{color:#2d5e59}img{max-width:100%;height:auto}article,.bibliography{background:white;max-width:900px;margin:28px auto;padding:36px;border-radius:4px}p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f0;padding:16px}aside{font-size:.85em}.block-label{font-weight:bold}.spread{display:flex;justify-content:center;gap:18px;margin:32px 0}.page{position:relative;flex:none;background:white;box-shadow:0 3px 16px #0002}.page article{margin:0;padding:0;border:0;background:transparent}.page-item{position:absolute;overflow:visible}.page-item img{width:100%;height:100%}.page-item figure{margin:0}.page>footer{position:absolute;bottom:1mm;right:4mm;font-size:9pt}.warnings{font-family:system-ui;font-size:14px}.publication-note{font-size:14px;color:#4d544c}@media print{body{background:white}header[data-layout="true"],main>nav,.warnings,.publication-note{display:none}article,.bibliography{box-shadow:none;border:0;margin:0;max-width:none}.spread{display:block;margin:0}.page{box-shadow:none;margin:0;break-after:page;page-break-after:always}.page:last-child{break-after:auto}.page>footer{color:#444}a{color:inherit;text-decoration:none}}`;
/** 명시 좌표는 그대로 쓰고 미배치 원고는 끝에 보존한다. */
export function webFiles(source, render, assets) {
  const layout = source.layout; let body, pageCss = '';
  if (layout) {
    const { widthMm, heightMm } = layout.page; pageCss = `@page{size:${widthMm}mm ${heightMm}mm;margin:0}`;
    const placed = new Set(), groups = new Map();
    for (const page of layout.pages) {
      const items = page.items.map((item) => {
        const style = `left:${item.xMm}mm;top:${item.yMm}mm;width:${item.widthMm}mm;height:${item.heightMm}mm`;
        if (item.nodeId) placed.add(item.nodeId);
        const content = item.nodeId ? render.articles.get(item.nodeId) : render.image(item.assetId, ` style="object-fit:${item.fit ?? 'contain'}"`);
        return `<div class="page-item" style="${style}">${content}</div>`;
      }).join('');
      const sheet = `<section class="page" data-side="${page.side ?? ''}" style="width:${widthMm}mm;height:${heightMm}mm">${items}<footer>${xml(page.id)}</footer></section>`;
      const key = page.spreadId ? `spread:${page.spreadId}` : `page:${page.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ side: page.side, sheet });
    }
    body = [...groups.values()].map((group) => `<div class="spread">${group.sort((a, b) => a.side === b.side ? 0 : a.side === 'left' ? -1 : 1).map((p) => p.sheet).join('')}</div>`).join('\n');
    body = render.groupHeadings + body;
    body += source.nodes.filter((node) => !placed.has(node.id)).map((node) => render.articles.get(node.id)).join('\n');
  } else body = render.body;
  const label = (text) => publicationLabel(text, source.lang);
  const warning = source.warnings.length ? `<section class="warnings"><details><summary>${label('Items to review')} · ${source.warnings.length}</summary><ul>${source.warnings.map((w) => `<li>${xml(warningLabel(w.code, source.lang))}${w.nodeId ? ` · ${xml(w.nodeId)}` : ''}<details><summary>${label('Technical details')}</summary><code>${xml(w.code)}</code></details></li>`).join('')}</ul></details></section>` : '';
  const draft = source.warnings.some(w => w.code === 'EXPORT_UNVERIFIED') ? `<p class="publication-draft">${label('Draft edition — some sections have not completed review.')}</p>` : '';
  const content = `<header data-layout="${Boolean(layout)}"><p class="publication-note">${label('Version')} ${xml(source.variant)} · ${label('Read-only export. This is not a review record. Use your browser’s print menu to save a PDF.')}</p>${draft}<h1>${xml(source.title)}</h1></header><main><nav aria-label="${label('Contents')}"><details><summary>${label('Contents')}</summary><ol>${render.toc}</ol></details></nav>${warning}${body}${render.bibliography}</main>`;
  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; img-src &apos;self&apos; data:; style-src &apos;self&apos; &apos;unsafe-inline&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;"/>';
  const files = new Map([['index.html', Buffer.from(htmlDocument(source.title, content, source.lang, 'style.css', csp))], ['style.css', Buffer.from(STYLE + pageCss)]]);
  for (const asset of assets.values()) files.set(asset.name, asset.bytes);
  return files;
}
