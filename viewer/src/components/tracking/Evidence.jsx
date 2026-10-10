import { useT } from '../../i18n/context.jsx';
import { BASIS_LABELS, COVERAGE_LABELS, evidenceHref } from '../../lib/tracking.js';
import { hrefFor } from '../../lib/route.js';

export function ObservationEvidence({ entry, view }) {
  const t = useT();
  if (!entry) return <p className="muted">{t("Select a recorded observation to see its source.")}</p>;
  const perspective = view.subjects.find((s) => s.id === entry.perspectiveId);
  return <div className="observation-evidence">
    <span className={`badge basis-${entry.basis}`}>{t(BASIS_LABELS[entry.basis]) ?? t("Unknown basis")}</span>
    {perspective ? <p className="muted">{t("Perspective:")} {perspective.name}</p> : null}
    {entry.timeLabel ? <p>{t("Work time:")} {entry.timeLabel}</p> : null}
    {entry.pathLabel ? <p>{t("Path:")} {entry.pathLabel}</p> : null}
    <blockquote>{entry.evidence.quote}</blockquote>
    <a className="evidence-jump" href={evidenceHref(entry)}>{t("Show in manuscript ↗")}</a>
    <p className="muted">{entry.sourceTitle}</p>
    <p className={entry.sourceState === 'complete' ? 'muted' : 'warn'}>{t(COVERAGE_LABELS[entry.sourceState])}</p>
    {entry.selfReview ? <p className="review-disclosure">{t("Self-review: the writing AI also reviewed this text.")}</p> : null}
    <details className="technical"><summary>{t("Source version")}</summary><p>{t("Content fingerprint")}</p><code>{entry.evidence.textHash}</code><p>{t("Review record:")} {entry.receiptId}</p><a href={hrefFor('receipt', entry.evidence.nodeId)}>{t("Open review record")}</a></details>
  </div>;
}
export function CoverageNotice({ coverage }) {
  const t = useT();
  return <div className="tracking-coverage"><strong>{coverage.complete} / {coverage.total}</strong> {t("recorded ranges checked by host")} {coverage.missing ? <p className="warn">{coverage.missing} {t("writing sections have no tracking coverage record.")}</p> : null}
    {coverage.complete < coverage.total ? <p className="warn">{t("Some recorded ranges need review. Missing observations do not prove that nothing changed.")}</p> : null}
    <p className="muted">{t("Coverage does not guarantee accurate extraction or author approval.")}</p>
  </div>;
}
