import { useT } from '../i18n/context.jsx';
import { reviewSummary, quoteRange } from '../lib/review.js';
import { SEVERITY_LABELS } from '../lib/labels.js';
import { checkTitle } from '../lib/check-labels.js';
import { hrefFor } from '../lib/route.js';
import { LoadState } from './Status.jsx';

export function ReviewSummary({ view, segments, onQuote }) {
  const t = useT();
  const summary = reviewSummary(view);
  return <div className={`review-summary review-${summary.state}`}>
    <p className="review-state">{t(summary.label)}</p>
    {summary.state === 'unverified' ? <p>{t("Unverified records are hidden. Ask your AI assistant to check the activity record.")}</p> : <>
      {view.drift ? <p>{t("The recorded review describes an earlier version. Review and finalize these changes with your AI assistant.")}</p> : null}
      {view.stale?.length ? <p>{t("Referenced information changed. Ask your AI assistant to review this section again.")}</p> : null}
      {view.stale === null && view.receipt ? <p>{t("Work settings prevented a freshness check. This record does not confirm the current text.")}</p> : null}
      {view.imported ? <p className="muted">{t("Imported")} {view.imported.at}{view.imported.from ? t(" from {source}", { source: view.imported.from }) : ''}{t(". Importing does not approve the text.")}</p> : null}
      {view.recheck ? <p className="muted">{t("Latest review:")} {view.recheck.at}{t(". This does not finalize later edits.")}</p> : null}
      {summary.selfReview ? <p className="review-disclosure">{t("Self-review: the writing AI also reviewed this text. This is not an independent assessment.")}</p> : null}
      {view.receipt?.overridden?.length ? <p className="warn">{view.receipt.overridden.length} {t("findings were accepted with a recorded reason. See the full review record.")}</p> : null}
      {!summary.findings.length ? <p className="muted">{view.receipt ? t("No findings in the displayed record. This is not a guarantee that the text has no issues.") : t("Use your AI assistant to complete the writing and review steps.")}</p> : null}
      {['hard', 'block', 'advisory', 'warning'].map((severity) => {
        const findings = summary.findings.filter((f) => f.severity === severity);
        return findings.length ? <section className="finding-group" key={severity}>
          <h3>{t(SEVERITY_LABELS[severity])} <span className="muted">{findings.length}</span></h3>
          <ul>{findings.map((f, i) => {
            const range = segments && quoteRange(segments, f.quote);
            return <li key={i}><strong>{checkTitle(f.checkId, undefined, t)}</strong><p>{f.message}</p>
              {f.quote ? <blockquote>{f.quote}</blockquote> : null}
              {range && onQuote ? <button className="quiet" type="button" onClick={() => onQuote(f.quote)}>{t("Show in text")}{range.count > 1 ? t(" (first match)") : ''}</button> : f.quote && segments ? <p className="muted">{t("This quote is not available in the current reading view.")}</p> : null}
            </li>;
          })}</ul>
        </section> : null;
      })}
      {summary.findings.some((f) => !t(SEVERITY_LABELS[f.severity])) ? <p className="warn">{t("Some findings have an unfamiliar severity. See the full review record.")}</p> : null}
      {summary.unsupported.length ? <details><summary>{summary.unsupported.length} {t("findings lacked supported evidence")}</summary><ul>{summary.unsupported.map((f, i) => <li key={i}>{checkTitle(f.checkId, undefined, t)}: {f.message}{f.quote ? <blockquote>{f.quote}</blockquote> : null}</li>)}</ul></details> : null}
      {summary.steps.some((s) => ['skipped', 'overridden', 'error', 'not_applicable'].includes(s.status)) ? <p className="muted">{t("Some steps were skipped, inapplicable, accepted with a reason, or could not complete. Open the full record for their status.")}</p> : null}
      {view.receipt ? <p className="muted">{t("Recorded")} {view.receipt.at}</p> : null}
    </>}
  </div>;
}

export function SectionReview({ id, segments, onQuote, state }) {
  const t = useT();
  return <section aria-label={t("Section review")}>
    <h2>{t("Section review")}</h2>
    {state.data ? <ReviewSummary view={state.data} segments={segments} onQuote={onQuote} /> : <LoadState state={state} />}
    <a className="review-record-link" href={hrefFor('receipt', id)}>{t("Open full review record")}</a>
  </section>;
}
