import { useT } from '../i18n/context.jsx';
import { runLabel } from '../lib/labels.js';
import { ExportButton } from '../components/ExportButton.jsx';
import { hrefFor } from '../lib/route.js';
import { attentionIds, nextAction, workProgress, unverifiedRecords } from '../lib/workspace.js';
import { LoadState, TechnicalDetails, StatusBadge } from '../components/Status.jsx';

export function Home({ outline }) {
  const t = useT();
  if (!outline.data) return <LoadState state={outline} />;
  const { status, nodes } = outline.data;
  const title = (id) => nodes.find((n) => n.id === id)?.title || id;
  const progress = workProgress(nodes);
  const attention = attentionIds(status);
  const action = nextAction(nodes, status);
  return <section className="overview">
    <h1>{outline.data.title}</h1>
    <p className="overview-intro">{t("Your manuscript, its structure, and the decisions behind each section.")}</p>
    <p><a href={hrefFor('examples')}>{t("Learn with examples")}</a> · {t("See a small workflow or open a separate work bundle.")}</p>
    <div className="work-progress">
      <progress max={Math.max(progress.total, 1)} value={progress.finalized} aria-label={t("Finalized writing sections")} />
      <p><strong>{progress.finalized} {t("of")} {progress.total}</strong> {t("writing sections finalized")} <span className="muted">{progress.written} {t("with text")}</span></p>
    </div>
    <section className="next-action">
      <h2>{!status.ok || unverifiedRecords(status) ? t("Review status needs attention") : attention.length ? t("{count} sections need attention", { count: attention.length }) : !progress.written ? t("Start your manuscript") : t("Ready to read")}</h2>
      <p>{!status.ok ? t("Work settings prevented a status check. You can still open sections from Contents.") : unverifiedRecords(status) ? t("The activity record could not be verified. Ask your AI assistant to check it before relying on review status.") : attention.length ? t("Open a section review to see what changed and what needs a decision.") : progress.written ? t("Open your manuscript to read the text alongside its review record.") : t("Ask your AI assistant to plan and write a section. It will appear here when text is available.")}</p>
      {action ? <a className="primary-action" href={hrefFor(action.screen, action.id)}>{t(action.label)}</a> : null}
      {!status.ok ? <TechnicalDetails code={status.error.code} message={status.error.message} /> : null}
    </section>
    {status.activeRun ? <p className="run-status">{t("Work in progress:")} <a href={hrefFor('read', status.activeRun.nodeId)}>{title(status.activeRun.nodeId)}</a> ({t(runLabel(status.activeRun.state))})</p> : null}
    {attention.length ? <section><h2>{t("Review queue")}</h2><p><a href={hrefFor('changes')}>{t("See what changed and which sections need review")}</a></p><ul className="section-list">{attention.map((id) => <li key={id}><a href={hrefFor('receipt', id)}>{title(id)}</a><span className="muted">{status.drift?.some((d) => d.nodeId === id) ? t("Edited since review") : status.stale?.includes(id) ? t("Review needed") : status.recheck?.includes(id) ? t("New checks pending") : t("Needs attention")}</span></li>)}</ul></section> : null}
    <section><h2>{t("Writing sections")}</h2>
      {nodes.some((n) => n.kind === 'leaf') ? <ul className="section-list">{nodes.filter((n) => n.kind === 'leaf').map((n) => <li key={n.id}><a href={hrefFor('read', n.id)}>{n.title || n.id}</a><StatusBadge status={n.status} /></li>)}</ul> : <p className="muted">{t("No writing sections yet. Ask your AI assistant to add your work’s structure.")}</p>}
    </section>
    <ExportButton />
  </section>;
}
