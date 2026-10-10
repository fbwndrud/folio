import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { hrefFor } from '../lib/route.js';
import { visibleOutline, attentionIds } from '../lib/workspace.js';
import { StatusBadge } from './Status.jsx';

export function Outline({ nodes, current, status }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(() => new Set(nodes.filter((n) => n.children.length).map((n) => n.id)));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const attention = attentionIds(status);
  const visible = visibleOutline(nodes, query, filter, attention);
  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const isAncestor = (node) => {
    let parent = byId.get(current);
    const visited = new Set();
    while (parent && !visited.has(parent.id)) {
      if (parent.parentId === node.id) return true;
      visited.add(parent.id); parent = byId.get(parent.parentId);
    }
    return false;
  };
  const item = (node) => {
    if (!node || !visible.has(node.id)) return null;
    const children = node.children.filter((id) => visible.has(id));
    const expanded = query || filter !== 'all' || isAncestor(node) || !collapsed.has(node.id);
    return <li key={node.id}>
      <div className={`outline-row ${node.id === current ? 'selected' : ''}`}>
        {children.length ? <button type="button" className="tree-toggle" aria-label={`${expanded ? t("Collapse") : t("Expand")} ${node.title || node.id}`} aria-expanded={Boolean(expanded)} onClick={() => toggle(node.id)} disabled={Boolean(query || filter !== 'all' || isAncestor(node))}>{expanded ? '▾' : '▸'}</button> : <span className="tree-spacer" />}
        <a aria-current={node.id === current ? 'page' : undefined} href={hrefFor('read', node.id)}>
          <span>{node.title || node.id}</span><span className="outline-status"><StatusBadge status={node.status} />{attention.includes(node.id) ? <span className="warn">{t("Needs attention")}</span> : null}</span>
        </a>
      </div>
      {children.length && expanded ? <ul>{children.map((id) => item(byId.get(id)))}</ul> : null}
    </li>;
  };
  return <nav className="outline" aria-label={t("Contents")}>
    <h2>{t("Contents")}</h2>
    <label className="outline-search">{t("Find a section")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Title or section ID")} /></label>
    <label className="outline-filter">{t("Show")}<select value={filter} onChange={(e) => setFilter(e.target.value)}>
      <option value="all">{t("All sections")}</option><option value="finalized">{t("Finalized")}</option><option value="draft">{t("Not finalized")}</option>
      {status?.ok ? <option value="attention">{t("Needs attention")}</option> : null}
    </select></label>
    {nodes.length ? visible.size ? <ul className="chapter-track">{nodes.filter((node) => node.parentId === null).map(item)}</ul> : <p className="muted">{t("No matching sections. Try another search or choose All sections.")}</p> : <p className="muted">{t("No sections yet. Ask your AI assistant to add the structure of your work.")}</p>}
  </nav>;
}
