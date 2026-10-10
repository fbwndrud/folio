import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { ReferenceText } from '../components/ReferenceText.jsx';
import { referenceProblem } from '../lib/reference-labels.js';
import { kindLabel } from '../lib/labels.js';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { LoadState, TechnicalDetails } from '../components/Status.jsx';

const nodeLink = (id, title) => <a href={hrefFor('read', id)}>{title || id}</a>;
export function Blocks({ outline = null }) {
  const t = useT();
  const [state] = useLoad('/api/blocks');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  if (!state.data) return <LoadState state={state} />;
  const { anchors, refs, problems, footnotes, citations, bibliography, terms } = state.data;
  const sectionTitle = (id, recorded) => recorded || outline?.nodes.find((n) => n.id === id)?.title || id;
  const tabs = [{ id: 'figures', label: t("Figures"), count: anchors?.length ?? 0 }, { id: 'references', label: t("References"), count: refs?.length ?? 0 },
    { id: 'footnotes', label: t("Footnotes"), count: footnotes?.length ?? 0 }, { id: 'sources', label: t("Cited sources"), count: bibliography?.entries.length ?? citations?.length ?? 0 }, { id: 'index', label: t("Index"), count: terms?.entries.length ?? 0 }];
  const active = selected ?? tabs.find((t) => t.count)?.id ?? 'figures';
  const search = query.trim().toLocaleLowerCase();
  const matches = (value) => !search || String(value ?? '').toLocaleLowerCase().includes(search);
  const index = (terms?.entries ?? []).filter((e) => matches(`${e.name} ${e.entityId}`));
  const figures = (anchors ?? []).filter((a) => matches(`${a.caption} ${a.label} ${a.id} ${a.nodeTitle}`));
  return <section className="references-screen"><p className="eyebrow">{t("Library · Figures & references")}</p><h1>{t("Figures & references")}</h1>
    <p>{t("Figures, notes, cited sources and a name index drawn from your manuscript. Open a section to see the item in context.")}</p>
    {problems?.length ? <details className="catalog-card" open><summary>{problems.length} {t("reference issues need attention")}</summary><ul>{problems.map((p, i) => <li key={i}><p className="error">{t(referenceProblem(p.code))} · {nodeLink(p.nodeId, sectionTitle(p.nodeId, p.nodeTitle))}{p.line ? t(" · Line {value0}", { value0: p.line }) : ''}</p><TechnicalDetails code={p.code} message={p.target ?? p.id ?? p.sourceId} /></li>)}</ul></details> : null}
    <div className="tracking-tabs" aria-label={t("Supporting details")}>{tabs.map((t) => <button key={t.id} type="button" aria-pressed={active === t.id} onClick={() => { setSelected(t.id); setQuery(''); }}>{t.label} <span className="muted">{t.count}</span></button>)}</div>
    {active === 'index' || active === 'figures' ? <label className="catalog-search">{t("Find")} {active === 'index' ? t("a name") : t("a figure")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label> : null}
    {active === 'figures' ? figures.length ? <div className="catalog-grid">{figures.map((a) => <article className="catalog-card" key={a.id}><h2>{a.caption || a.label || a.id}</h2><p>{a.label ? `${a.label} · ` : ''}{nodeLink(a.nodeId, a.nodeTitle)}</p><p className="muted">{a.refs} {t("manuscript references · Line")} {a.line}</p><details className="technical"><summary>{t("Reference identifier")}</summary>{a.id}</details></article>)}</div> : <EmptyItem name="figures" searched={Boolean(search)} /> : null}
    {active === 'references' ? refs?.length ? <ul className="catalog-links">{refs.map((r, i) => <li className="catalog-card" key={i}><p>{nodeLink(r.nodeId, r.nodeTitle)} → {r.targetNodeId ? nodeLink(r.targetNodeId, r.label || r.targetTitle || r.target) : <span className="error">{r.label || r.target} {t("· Target missing")}</span>}</p><p className="muted">{t("Line")} {r.line}</p></li>)}</ul> : <EmptyItem name="cross-references" /> : null}
    {active === 'footnotes' ? footnotes?.length ? <ol className="catalog-links">{footnotes.map((f) => <li className="catalog-card" key={`${f.nodeId}:${f.id}`}><p><strong>{t("Note")} {f.number}</strong> · {nodeLink(f.nodeId, f.nodeTitle)}</p><p><ReferenceText segments={f.segments} fallback={f.text} /></p></li>)}</ol> : <EmptyItem name="footnotes" /> : null}
    {active === 'sources' ? <>
      {bibliography?.ledger && !bibliography.ledger.ok ? <p className="error">{t("The evidence record could not be verified. Only citations found in the manuscript are included.")}</p> : null}
      {bibliography?.entries.length ? <ol>{bibliography.entries.map((e) => <li className="catalog-card" key={e.sourceId}><h2><a href={hrefFor('source', e.sourceId)}>{e.title || e.sourceId}</a></h2><ul>{e.citedIn.map((c, i) => <li key={i}>{nodeLink(c.nodeId, sectionTitle(c.nodeId, c.nodeTitle))} · {c.via === 'evidence' ? t("Evidence link") : t("Text citation")}</li>)}</ul></li>)}</ol> : citations?.length ? <ul>{citations.map((c, i) => <li className="catalog-card" key={i}>{nodeLink(c.nodeId, c.nodeTitle)} · {c.valid ? <a href={hrefFor('source', c.sourceId)}>{c.sourceId}</a> : <span className="error">{t("Source missing")}</span>}</li>)}</ul> : <EmptyItem name="cited sources" />}
    </> : null}
    {active === 'index' ? <>{terms?.ledger && !terms.ledger.ok ? <p className="error">{t("The appearance record could not be verified. Only names found in the manuscript are included.")}</p> : null}
      {index.length ? <div className="catalog-grid">{index.map((e) => <details className="catalog-card index-card" key={e.entityId}><summary><strong>{e.name}</strong><span className="muted">{t(kindLabel(e.kind))} · {e.locations.length} {t("sections")}</span></summary><p><a href={hrefFor('entity', e.entityId)}>{t("Open definition")}</a></p><ul>{e.locations.map((l) => <li key={l.nodeId}>{nodeLink(l.nodeId, l.title)}</li>)}</ul></details>)}</div> : <EmptyItem name="index entries" searched={Boolean(search)} />}
    </> : null}
  </section>;
}
function EmptyItem({ name, searched = false }) {
  const t = useT();
  return <div className="empty-state"><h2>{searched ? t("No {value0} match this search", { value0: t(name) }) : t("No {value0} recorded", { value0: name })}</h2><p>{searched ? t("Try another name or clear the search.") : t("Ask your AI assistant to add these details when your manuscript needs them. Their absence does not indicate a review failure.")}</p></div>;
}
