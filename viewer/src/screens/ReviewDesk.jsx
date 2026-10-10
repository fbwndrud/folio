import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { useLoad } from '../api-context.jsx';
import { LoadState } from '../components/Status.jsx';
import { ObservationEvidence, CoverageNotice } from '../components/tracking/Evidence.jsx';
import { SubjectConnections } from '../components/tracking/Connections.jsx';
import { BASIS_LABELS, observationValue, sectionInGroup, trackingCoverage } from '../lib/tracking.js';
import { quoteRange } from '../lib/review.js';
import { ManuscriptBody } from '../components/ManuscriptBody.jsx';

function SourcePassage({ entry }) {
  const t = useT();
  const [state] = useLoad(entry ? `/api/nodes/${encodeURIComponent(entry.evidence.nodeId)}` : null);
  if (!entry) return null;
  if (!state.data) return <LoadState state={state} />;
  const matching = state.data.contentHash === entry.evidence.textHash;
  const range = matching ? quoteRange(state.data.segments, entry.evidence.quote) : null;
  return <section className="source-passage"><span className="eyebrow">{t("SOURCE SECTION")}</span><h3>{state.data.node.title}</h3>
    {!matching ? <p className="warn">{t("The source version changed or could not be verified. The old quote is not highlighted in this text.")}</p> : null}
    {range?.count > 1 ? <p className="muted">{t("This quote occurs more than once. The first matching passage is highlighted.")}</p> : null}
    <ManuscriptBody segments={state.data.segments} mode="mixed" range={range} />
  </section>;
}
export function ReviewDesk({ outline }) {
  const t = useT();
  const [state] = useLoad('/api/tracking');
  const [graph] = useLoad('/api/graph');
  const [subject, setSubject] = useState(''), [criterion, setCriterion] = useState(''), [group, setGroup] = useState(''), [selected, setSelected] = useState(null);
  if (!state.data) return state.error?.code === 'STATIC_UNAVAILABLE' ? <section><h1>{t("Evidence desk")}</h1><p>{t("Tracking was not included in this older review copy.")}</p></section> : <LoadState state={state} />;
  const view = state.data;
  if (!view.plan) return <section className="evidence-desk"><p className="eyebrow">{t("Review · Evidence desk")}</p><h1>{t("Start tracking what matters.")}</h1><div className="empty-state"><h2>{t("No tracking plan yet")}</h2><p>{t("Tell your AI assistant which people, facts or changes you want to follow. Ask it to define those criteria and connect each recorded value to its source passage.")}</p><p>{t("Your recorded observations and their evidence will appear here.")}</p></div></section>;
  const subjectId = view.subjects.some((s) => s.id === subject) ? subject : view.observations[0]?.subjectId ?? view.subjects[0]?.id ?? '';
  const subjectName = view.subjects.find((s) => s.id === subjectId)?.name ?? subjectId;
  const rows = view.observations.filter((o) => o.subjectId === subjectId && (!criterion || o.criterionId === criterion) && sectionInGroup(outline.nodes, o.evidence.nodeId, group));
  const observation = rows.find((o) => o.observationId === selected) ?? rows[0];
  const scopedIds = outline.nodes.filter((n) => sectionInGroup(outline.nodes, n.id, group)).map((n) => n.id);
  return <section className="evidence-desk"><header className="desk-heading"><div><span className="eyebrow">{t("EVIDENCE DESK")}</span><h1>{t("Follow a record back to the page.")}</h1><p className="muted">{t("Keep what the text states apart from what a person believes.")}</p></div><CoverageNotice coverage={trackingCoverage(view, scopedIds)} /></header>
    <div className="desk-columns"><div className="desk-records"><div className="record-toolbar">
      <label>{t("Subject")}<select aria-label={t("Subject")} value={subjectId} onChange={(e) => { setSubject(e.target.value); setCriterion(''); setSelected(null); }}>{view.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>{t("Criterion")}<select aria-label={t("Criterion")} value={criterion} onChange={(e) => { setCriterion(e.target.value); setSelected(null); }}><option value="">{t("All criteria")}</option>{view.plan?.criteria.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <label>{t("Group")}<select aria-label={t("Group")} value={group} onChange={(e) => { setGroup(e.target.value); setSelected(null); }}><option value="">{t("Whole work")}</option>{outline.nodes.filter((n) => n.kind !== 'leaf').map((n) => <option key={n.id} value={n.id}>{n.title || n.id}</option>)}</select></label>
      <span className="muted">{rows.length} {t("active records")}</span></div>
      {rows.length ? <div className="records-table" tabIndex={0} role="region" aria-label={t("Recorded observations")}><table><thead><tr><th>{t("Section")}</th><th>{t("Criterion")}</th><th>{t("Recorded value")}</th><th>{t("Basis")}</th></tr></thead><tbody>{rows.map((o) => <tr key={o.observationId} className={observation === o ? 'chosen' : ''}><td><button type="button" aria-pressed={observation === o} onClick={() => setSelected(o.observationId)}>{o.sourceTitle}</button></td><td>{view.plan.criteria.find((c) => c.id === o.criterionId)?.title ?? o.criterionId}</td><td>{observationValue(o, view, t)}</td><td><span className={`badge basis-${o.basis}`}>{t(BASIS_LABELS[o.basis])}</span></td></tr>)}</tbody></table></div> : null}
      {!rows.length ? <p className="muted">{t("No active records in this scope. Changed drafts and outdated criteria can exclude older observations.")}</p> : null}
      {subjectId ? <SubjectConnections subjectId={subjectId} subjectName={subjectName} graph={graph.data} nodes={outline.nodes} groupId={group} /> : null}
    </div><aside className="desk-evidence" aria-label={t("Source evidence")}><span className="eyebrow">{t("SOURCE EVIDENCE")}</span><h2>{observation ? observationValue(observation, view, t) : t("Select a record")}</h2><ObservationEvidence entry={observation} view={view} /><SourcePassage key={observation?.observationId ?? 'empty'} entry={observation} /></aside></div>
  </section>;
}
