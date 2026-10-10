import { publicationContents, contentsHtml, readingBody, groupHeadings } from './contents.js';
import { parseNodeMarks } from '../blocks/syntax.js';
import { fencedRanges, maskRanges } from '../util/fences.js';
import { assetRefsInBody } from '../store/assets.js';
import { xml } from './text.js';
import { publicationLabel } from './labels.js';

/** 원문 HTML을 허용하지 않는 출판 렌더러. 원고와 catalog는 변경하지 않는다. */
export function createRender(source, assets) {
  const nodeIds = new Map(source.nodes.map((node, index) => [node.id, `node-${index}`]));
  const blocks = new Map(source.catalog.blocks.map((block) => [block.id, block]));
  const usedAnchors = new Set();
  const image = (id, style = '') => {
    const asset = assets.get(id);
    return `<img src="${asset.name}" alt="${xml(source.work.assets.get(id)?.brief?.title ?? id)}"${style}/>`;
  };
  function inline(text, nodeId) {
    const marks = parseNodeMarks(text), pieces = [];
    for (const anchor of marks.anchors) {
      const owner = blocks.get(anchor.id), owned = owner?.nodeId === nodeId && !usedAnchors.has(anchor.id);
      if (owned) usedAnchors.add(anchor.id);
      pieces.push({ ...anchor, html: owned ? `<span id="block-${anchor.id}" class="block-label">${xml(owner.label ?? '')}</span>` : xml(`{#${anchor.id}}`) });
    }
    for (const ref of marks.refs) {
      const target = blocks.get(ref.target), href = target && nodeIds.has(target.nodeId) ? `#block-${ref.target}` : null;
      if (target && !href) source.warnings.push({ code: 'EXPORT_BLOCK_TARGET_NOT_EXPORTED', target: ref.target, nodeId });
      pieces.push({ ...ref, html: href ? `<a href="${href}">${xml(target.label ?? ref.target)}</a>` : xml(`[[block:${ref.target}]]`) });
    }
    for (const note of marks.footnoteRefs) {
      const target = source.catalog.footnotes.find((n) => n.nodeId === nodeId && n.id === note.id);
      pieces.push({ ...note, html: target ? `<sup><a href="#note-${nodeIds.get(nodeId)}-${note.id}">${target.number}</a></sup>` : xml(`[^${note.id}]`) });
    }
    for (const ref of marks.citations) {
      const target = source.work.sources.get(ref.sourceId);
      pieces.push({ ...ref, html: target ? `<a href="#source-${ref.sourceId}">${xml(target.title || ref.sourceId)}</a>` : xml(`[[source:${ref.sourceId}]]`) });
    }
    for (const match of text.matchAll(/!\[\[asset:([A-Za-z0-9][\w-]*)\]\]/g)) pieces.push({ start: match.index, end: match.index + match[0].length, html: image(match[1]) });
    pieces.sort((a, b) => a.start - b.start || b.end - a.end);
    let at = 0, html = '';
    for (const part of pieces) { if (part.start < at) continue; html += xml(text.slice(at, part.start)) + part.html; at = part.end; }
    return html + xml(text.slice(at));
  }
  const titleOf = (node) => typeof node.title === 'string' && node.title.trim() ? node.title : node.id;
  const articles = new Map();
  for (const node of source.nodes) {
    const paragraphs = []; let fence = null, code = [];
    for (const line of node.body.split('\n').map((part) => part.replace(/\r$/, ''))) {
      const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      const heading = /^(#{1,6})\s+([\s\S]*)$/.exec(line);
      if (fence) {
        if (mark && mark[1][0] === fence.char && mark[1].length >= fence.length && !line.slice(mark[0].length).trim()) {
          paragraphs.push(`<pre><code>${xml(code.join('\n'))}</code></pre>`); fence = null; code = [];
        } else code.push(line);
      } else if (mark) fence = { char: mark[1][0], length: mark[1].length };
      else if (/^ {0,3}\[\^[A-Za-z0-9][\w-]*\]:/.test(line)) continue;
      else if (heading) paragraphs.push(`<h${heading[1].length}>${inline(heading[2], node.id)}</h${heading[1].length}>`);
      else if (line.trim()) paragraphs.push(`<p>${inline(line, node.id)}</p>`);
    }
    if (fence) paragraphs.push(`<pre><code>${xml(code.join('\n'))}</code></pre>`);
    const already = new Set(assetRefsInBody(maskRanges(node.body, fencedRanges(node.body))));
    for (const id of node.data.assets ?? []) if (!already.has(id)) paragraphs.push(`<figure>${image(id)}</figure>`);
    for (const note of source.catalog.footnotes.filter((n) => n.nodeId === node.id)) paragraphs.push(`<aside id="note-${nodeIds.get(node.id)}-${note.id}"><span>${note.number}. </span>${inline(note.text, node.id)}</aside>`);
    const choices = (node.links ?? []).filter((link) => link.kind === 'choice');
    if (choices.length) paragraphs.push(`<nav aria-label="Choices"><ul>${choices.map((link) => nodeIds.has(link.to) ? `<li><a href="#${nodeIds.get(link.to)}">${xml(link.label ?? link.to)}</a></li>` : `<li>${xml(link.label ?? link.to)}</li>`).join('')}</ul></nav>`);
    articles.set(node.id, `<article id="${nodeIds.get(node.id)}"><h2>${xml(titleOf(node))}</h2>${paragraphs.join('\n')}</article>`);
  }
  const sourceIds = new Set(source.catalog.citations.filter((ref) => ref.valid).map((ref) => ref.sourceId));
  const bibliography = sourceIds.size ? `<section class="bibliography"><h2>${publicationLabel('Sources', source.lang)}</h2><ul>${[...sourceIds].map((id) => `<li id="source-${id}">${xml(source.work.sources.get(id).title || id)}</li>`).join('')}</ul></section>` : '';
  const contents = publicationContents(source);
  return { articles, toc: contentsHtml(contents), contents, body: readingBody(contents, articles), groupHeadings: groupHeadings(contents), bibliography, nodeIds, image };
}
