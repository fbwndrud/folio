import { useT } from '../../i18n/context.jsx';
import { useState } from 'react';
import { LoadState } from '../Status.jsx';
import { ObservationEvidence, CoverageNotice } from './Evidence.jsx';
import { latestRecorded, observationsThrough, observationValue, trackingCoverage } from '../../lib/tracking.js';

export function TrackingPanel({ id, state, preferredSubject = null }) {
  const t = useT();
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('latest');
  if (!state.data) return state.error?.code === 'STATIC_UNAVAILABLE'
    ? <p className="muted">{t("Tracking was not included in this older review copy.")}</p> : <LoadState state={state} />;
  const view = state.data;
  if (!view.plan) return <section><h2>{t("Tracking")}</h2><p className="muted">{t("No tracking plan yet. Tell your AI assistant what you want to follow in this work.")}</p></section>;
  const subjects = view.subjects.filter((s) => view.plan.criteria.some((c) => c.subjectKinds.includes(s.kind)));
  const subjectId = subjects.some((s) => s.id === selected) ? selected
    : subjects.find((s) => s.id === preferredSubject)?.id ?? subjects[0]?.id ?? '';
  const entries = observationsThrough(view, subjectId, id);
  const rows = entries === null ? [] : tab === 'latest' ? latestRecorded(entries, view.plan.criteria) : entries;
  const source = view.sources[id];
  const throughIds = Object.keys(view.sources).filter((key) => view.sources[key].ordered && view.sources[key].ordinal <= source?.ordinal);
  return <section className="tracking-panel" aria-label={t("Tracking")}>
    <h2>{t("Tracking")}</h2><p className="muted">{t("Recorded through this section")}</p>
    <label>{t("Subject")}<select aria-label={t("Subject")} value={subjectId} onChange={(e) => setSelected(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="tracking-tabs" role="group" aria-label={t("Tracking view")}><button type="button" aria-pressed={tab === 'latest'} onClick={() => setTab('latest')}>{t("Latest recorded")}</button><button type="button" aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>{t("Changes")}</button></div>
    {entries === null ? <p className="warn">{t("This section has no single ordered timeline. Use Review to compare records by path and perspective.")}</p> : rows.length ? <ol className="tracking-records">{rows.map((o) => <li key={o.observationId}><span className="eyebrow">{view.plan.criteria.find((c) => c.id === o.criterionId)?.title ?? o.criterionId}</span><h3>{observationValue(o, view, t)}</h3><ObservationEvidence entry={o} view={view} /></li>)}</ol> : <p className="muted">{t("No active observations for this subject through this section.")}</p>}
    <p className="muted">{t("Later sections are excluded. Different beliefs, paths and times remain separate. Recorded values are not automatically accepted facts.")}</p>
    <CoverageNotice coverage={trackingCoverage(view, entries === null ? [id] : throughIds)} />
  </section>;
}
