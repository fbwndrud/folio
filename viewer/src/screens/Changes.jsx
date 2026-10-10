import { useT } from '../i18n/context.jsx';
import { StructuredValue } from '../components/StructuredValue.jsx';
import { useState } from 'react';
import { useLoad } from '../api-context.jsx';
import { LoadState } from '../components/Status.jsx';
import { CHANGE_LABELS, changeLink, changeTitle, filteredImpacts } from '../lib/impact.js';
import { hrefFor } from '../lib/route.js';

function ChangedReason({ reason, nodeId }) {
  const t = useT();
  return <li><strong>{t(CHANGE_LABELS[reason.kind]) ?? t("Recorded dependency changed")}</strong>
    <p><a href={changeLink(reason, nodeId)}>{reason.kind === 'tracking_plan' || reason.kind === 'tracking_catalog' ? t(changeTitle(reason)) : changeTitle(reason)}</a></p>
    {reason.quote ? <blockquote>{reason.quote}</blockquote> : null}
    <details className="technical"><summary>{t("Before and current versions")}</summary><p>{t("Reference identifier:")} <code>{reason.id}</code></p>
      <div><strong>{t("Recorded")}</strong><StructuredValue value={reason.was} /></div><div><strong>{t("Current")}</strong><StructuredValue value={reason.now} /></div>
    </details>
  </li>;
}

export function Changes() {
  const t = useT();
  const [state] = useLoad('/api/impact');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  if (state.error?.code === 'STATIC_UNAVAILABLE') return <section><h1>{t("Changes")}</h1><p>{t("This older review copy does not include change information. Open the live work or create a new review copy.")}</p></section>;
  if (!state.data) return <LoadState state={state} />;
  const view = state.data;
  if (!view.available) return <section><h1>{t("Changes")}</h1><p role="alert">{t("Review status could not be verified. Change information is unavailable. Ask your AI assistant to check the work settings and activity records.")}</p></section>;
  const sections = filteredImpacts(view, query, kind);
  const kinds = [...new Set(view.sections.flatMap((s) => s.reasons.map((r) => r.kind)))];
  return <section className="changes-screen">
    <header><p className="eyebrow">{t("Review · Changes")}</p><h1>{t("What needs another look?")}</h1>
      <p>{t("See what changed, where it was used, and which sections need review. This view uses recorded links; it cannot find every possible story inconsistency.")}</p></header>
    <div className="impact-summary"><div><strong>{view.sections.length}</strong><span>{t("Sections needing attention")}</span></div>
      <div><strong>{view.unreviewed.length}</strong><span>{t("Sections without a finalized review")}</span></div>
      <div><strong>{view.pendingTracking.length}</strong><span>{t("Tracking checks still pending")}</span></div></div>
    <div className="impact-guidance"><h2>{t("Next step")}</h2><p>{t("Open a section review, read its source, then ask your AI assistant to review the changed information. Changes are not rewritten or approved here.")}</p>
      <p>{t("The reading edition uses the current saved manuscript. An earlier downloaded book remains an earlier copy. After review, download a new edition from")} <a href={hrefFor('publish')}>{t("Publish")}</a>.</p></div>
    <div className="impact-filters"><label>{t("Find a section or changed item")}<input value={query} onChange={(e) => setQuery(e.target.value)} type="search" /></label>
      <label>{t("Change type")}<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">{t("All changes")}</option>{kinds.map((k) => <option key={k} value={k}>{t(CHANGE_LABELS[k]) ?? k}</option>)}</select></label></div>
    {!view.sections.length ? <p>{t("No change-related review needs were found in the recorded links. This does not confirm that every section or meaning has been checked.")}</p> : !sections.length ? <p>{t("No sections match these filters.")}</p> : <div className="impact-cards">{sections.map((s) => <article className="impact-card" key={s.nodeId}>
      <h2>{s.title}</h2><p>{s.mustFix.length ? t("{value0} must-fix findings", { value0: s.mustFix.length }) : s.newChecksPending ? t("New review checks pending") : t("Review needed")}{!s.present ? t(" · Section no longer in contents") : ''}</p>
      <ul>{s.reasons.map((reason, i) => <ChangedReason key={`${reason.kind}:${reason.id}:${i}`} reason={reason} nodeId={s.present ? s.nodeId : null} />)}</ul>
      {s.mustFix.length ? <ul>{s.mustFix.map((f, i) => <li key={i}>{f.message}</li>)}</ul> : null}
      <a className="primary-action" href={hrefFor('receipt', s.nodeId)}>{t("Open section review")}</a>{s.present ? <a href={hrefFor('read', s.nodeId)}>{t("Read current manuscript")}</a> : null}
    </article>)}</div>}
    <details className="impact-coverage"><summary>{t("Unreviewed sections and tracking coverage")}</summary>
      {view.unreviewed.length ? <ul>{view.unreviewed.map((s) => <li key={s.nodeId}><a href={hrefFor('read', s.nodeId)}>{s.title}</a></li>)}</ul> : <p>{t("All writing sections have a finalized record. This does not guarantee semantic correctness.")}</p>}
      {view.pendingTracking.length ? <ul>{view.pendingTracking.map((c, i) => <li key={`${c.nodeId}:${c.criterionId}:${i}`}><a href={hrefFor('receipt', c.nodeId)}>{c.nodeId}</a> · {c.criterionId} · {c.state}</li>)}</ul> : null}
    </details>
    <section><h2>{t("Resource search freshness")}</h2><p>{view.resourceFreshness === 'current' ? t("The resource list matches its current source checkpoint.") : t("Resource search information may be older, incomplete, or unavailable. Open the Library to check sources before using it.")} <a href={hrefFor('resources')}>{t("Open resources")}</a></p></section>
    {!view.evidenceAvailable ? <p className="muted">{t("Evidence-link checks are disabled or unavailable; their absence does not confirm that source links are current.")}</p> : null}
    {view.variants.length ? <section><h2>{t("Other editions")}</h2>{view.variants.map((v) => <p key={v.id}>{v.id}: {v.stale.length} {t("need review ·")} {v.edited.length} {t("edited ·")} {v.missing.length} {t("missing sections. Ask your AI assistant to inspect this edition separately.")}</p>)}</section> : null}
  </section>;
}
