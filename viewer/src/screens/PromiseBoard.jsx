import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { threadLabel, SEVERITY_LABELS } from '../lib/labels.js';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { LoadState, TechnicalDetails } from '../components/Status.jsx';
import { ThreadTimeline } from '../components/ThreadTimeline.jsx';

const PROBLEMS = {
  PROMISE_RESOLVED_BEFORE_PLANT: 'This thread was resolved before it was introduced.',
  PROMISE_MOVED_BEFORE_PLANT: 'This thread developed before it was introduced.',
  PROMISE_RESOLVED_AFTER_CLOSE: 'A resolution was recorded after this thread had already closed.',
};
export function PromiseBoard({ outline = null }) {
  const t = useT();
  const [state] = useLoad('/api/promises');
  const [query, setQuery] = useState('');
  const [timeline, setTimeline] = useState(false);
  if (!state.data) return <LoadState state={state} />;
  const { ledger, leaves, promises, frontier } = state.data;
  if (!ledger.ok) return <section><h1>{t("Story threads")}</h1><p className="error">{t("The activity record could not be verified. Unverified events are hidden.")}</p><TechnicalDetails code="LEDGER_TAMPERED" /></section>;
  const title = (id) => outline?.nodes.find((n) => n.id === id)?.title || leaves.find((l) => l.id === id)?.title || id;
  const shown = promises.filter((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="threads-screen">
    <header><p className="eyebrow">{t("Manuscript · Story threads")}</p><h1>{t("Story threads")}</h1>
      <p>{t("Introductions, developments and resolutions recorded for this work. Open a milestone to read its source.")}</p></header>
    <p className="muted">{promises.length} {t("story threads ·")} {leaves.length} {t("writing sections")}{frontier ? <> · {leaves.find((l) => l.id === frontier)?.status === 'committed' ? t("Last finalized section") : t("Last written section")}: <a href={hrefFor('read', frontier)}>{title(frontier)}</a></> : t(" · No written sections yet")}</p>
    {!promises.length ? <div className="empty-state"><h2>{t("No story threads recorded yet")}</h2><p>{t("Ask your AI assistant to record a question, promise or unresolved event you want to follow, then connect its developments to the manuscript.")}</p><a href={hrefFor('review')}>{t("See other tracked information")}</a></div> : <>
      <div className="thread-controls"><label className="catalog-search">{t("Find a story thread")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div className="tracking-tabs" aria-label={t("Story thread view")}><button type="button" aria-pressed={!timeline} onClick={() => setTimeline(false)}>{t("Recorded developments")}</button><button type="button" aria-pressed={timeline} onClick={() => setTimeline(true)}>{t("Section timeline")}</button></div></div>
      {!shown.length ? <p>{t("No story threads match this search.")}</p> : timeline ? <ThreadTimeline leaves={leaves} promises={shown} /> : <div className="thread-cards">{shown.map((p) => <article className="catalog-card thread-card" key={p.entityId}>
        <header><h2><a href={hrefFor('entity', p.entityId)}>{p.name}</a></h2><span className={`thread-stage stage-${p.stage}`}>{p.stage ? t(threadLabel(p.stage)) : t("Not introduced")}</span></header>
        {p.core ? <p className="muted">{t("A main story thread")}</p> : null}
        {p.dormant ? <p className="warn">{t("No recorded development for")} {p.dormant.distance} {t("sections. Last development:")} <a href={hrefFor('read', p.dormant.lastMovedAt)}>{title(p.dormant.lastMovedAt)}</a>{t(". Expected within")} {p.dormant.span} {t("sections. This is a suggestion.")}</p> : null}
        {p.problems.map((q, i) => <div className={q.severity === 'hard' ? 'error' : 'warn'} key={i}><p><strong>{t(SEVERITY_LABELS[q.severity]) || t("Needs review")}:</strong> {t(PROBLEMS[q.code]) ?? t("The recorded thread events are out of order.")} <a href={hrefFor('read', q.nodeId)}>{t("Open source section")}</a></p><TechnicalDetails code={q.code} /></div>)}
        {p.marks.length ? <ol className="thread-milestones">{p.marks.map((m) => <li key={m.eventId}><span className={`thread-stage stage-${m.stage}`}>{t(threadLabel(m.stage))}</span>
          <a href={hrefFor('read', m.nodeId)}>{m.nodeTitle || title(m.nodeId)}</a>{m.nodeKind === 'branch' ? <span className="muted">{t("Group note")}</span> : null}
        </li>)}</ol> : <p className="muted">{t("The thread is defined, but no developments have been recorded. Ask your AI assistant to connect its first appearance.")}</p>}
      </article>)}</div>}
    </>}
  </section>;
}
