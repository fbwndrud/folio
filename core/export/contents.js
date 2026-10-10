import { xml } from './text.js';

/** Only ancestor titles accompany exported leaves. Group planning bodies never become publication text. */
export function publicationContents(source) {
  const selected = new Set(source.nodes.map((n) => n.id));
  const included = new Set(selected);
  for (const node of source.nodes) {
    let parent = source.work.tree.nodes.get(node.parentId);
    while (parent && !included.has(parent.id)) { included.add(parent.id); parent = source.work.tree.nodes.get(parent.parentId); }
  }
  const entries = new Map();
  let groupIndex = 0;
  for (const node of source.work.tree.nodes.values()) {
    if (!included.has(node.id)) continue;
    const index = source.nodes.findIndex((n) => n.id === node.id);
    entries.set(node.id, { id: node.id, title: node.title?.trim() ? node.title : node.id, kind: selected.has(node.id) ? 'leaf' : 'group',
      anchor: selected.has(node.id) ? `node-${index}` : `group-${groupIndex++}`, children: [] });
  }
  const roots = [];
  for (const node of source.work.tree.nodes.values()) {
    const entry = entries.get(node.id); if (!entry) continue;
    const parent = entries.get(node.parentId);
    (parent ? parent.children : roots).push(entry);
  }
  const order = new Map(source.nodes.map((n, i) => [n.id, i]));
  const first = (e) => e.kind === 'leaf' ? order.get(e.id) : Math.min(...e.children.map(first));
  const sort = (list) => { list.sort((a, b) => first(a) - first(b)); for (const e of list) sort(e.children); };
  sort(roots); return roots;
}
export function contentsHtml(entries) {
  return entries.map((e) => `<li><a href="#${e.anchor}">${xml(e.title)}</a>${e.children.length ? `<ol>${contentsHtml(e.children)}</ol>` : ''}</li>`).join('');
}
export function readingBody(entries, articles, depth = 1) {
  return entries.map((e) => e.kind === 'leaf' ? articles.get(e.id)
    : `<section class="chapter" id="${e.anchor}"><h${Math.min(depth + 1, 6)}>${xml(e.title)}</h${Math.min(depth + 1, 6)}>${readingBody(e.children, articles, depth + 1)}</section>`).join('\n');
}

export function groupHeadings(entries) {
  return entries.filter((e) => e.kind === 'group').map((e) => `<section class="chapter" id="${e.anchor}"><h2>${xml(e.title)}</h2>${groupHeadings(e.children)}</section>`).join('');
}
