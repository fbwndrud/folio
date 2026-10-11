import { useEdition } from '../edition-context.jsx';
import { useT } from '../i18n/context.jsx';
import { stepLabel, RESULT_LABELS, SEVERITY_LABELS, readable, kindLabel, originLabel } from '../lib/labels.js';
import { checkTitle } from '../lib/check-labels.js';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { LoadState, TechnicalDetails } from '../components/Status.jsx';
import { RevisionReferences } from '../components/RevisionReferences.jsx';
import { ReviewSummary } from '../components/ReviewSummary.jsx';


function Findings({ checks }) {
  const t = useT();
  const findings = (checks ?? []).flatMap((c) => (c.findings ?? []).map((f) => ({ ...f, checkId: c.checkId })));
  if (!findings.length) return null;
  return <ul className="findings">{findings.map((f, i) => <li key={i}><strong>{t(SEVERITY_LABELS[f.severity]) ?? readable(f.severity)}</strong> {checkTitle(f.checkId, undefined, t)}: {f.message}</li>)}</ul>;
}

/** 노드 하나의 영수증: 단계별 결과, 건너뛴 이유와 출처, Versions used, Review needed 이유. */
export function Receipt({ id, outline = null }) {
  const t = useT();
  const { path } = useEdition();
  const [state] = useLoad(path(`/api/receipts/${encodeURIComponent(id)}`));
  if (!state.data) return <LoadState state={state} />;
  const view = state.data;
  if (!view.ledger.ok) return <article><h1>{view.title || t("Section review")}</h1><p className="error" role="alert">{t("The review records could not be verified. Unverified records are hidden. Ask your AI assistant to check the activity record.")}</p><TechnicalDetails code="LEDGER_TAMPERED" /></article>;
  return (
    <article>
      <h1>{view.title || id}</h1>
      <p><a href={hrefFor('read', id)}>{t("Read this section")}</a></p>
      <h2>{t("Review record")}</h2>
      <ReviewSummary view={view} />
      {view.receipt?.original ? <p>{t("Source version:")} <code>{view.receipt.original.committedHash}</code></p> : null}
      {view.drift ? <TechnicalDetails code={view.drift.code} /> : null}
      {view.stale?.length ? <><h2>{t("Review needed")}</h2><RevisionReferences refs={view.stale} outline={outline} /></> : null}
      {!view.receipt ? <p className="muted">{t("No finalized version has been recorded.")}</p> : (
        <>
          <p className="muted">{t("Finalized {count} times. Latest: {date}. Revision attempts: {attempts}.", { count: view.commits.length, date: view.receipt.at, attempts: view.receipt.attempts })}</p>
          <details className="review-history"><summary>{t("Finalization steps and findings")}</summary><div className="table-scroll"><table>
            <thead><tr><th>{t("Step")}</th><th>{t("Result")}</th><th>{t("Reason · Origin")}</th></tr></thead>
            <tbody>
              {view.receipt.steps.map((s) => (
                <tr key={s.id} className={`step-${s.status}`}>
                  <td>{t(stepLabel(s.id))}</td><td>{t(RESULT_LABELS[s.status]) ?? readable(s.status)}</td>
                  <td>{s.reason ? `“${s.reason}”` : ''} {s.source ? <span className="muted">{t(originLabel(s.source))}</span> : null}<Findings checks={s.checks} /></td>
                </tr>
              ))}
            </tbody>
          </table></div></details>
          {view.recheck ? <details className="review-history"><summary>{t("Latest review steps")}</summary><ul>{view.recheck.steps.map((s) => <li key={s.id}>{t(stepLabel(s.id))}: {t(RESULT_LABELS[s.status]) ?? readable(s.status)}<Findings checks={s.checks} /></li>)}</ul></details> : null}
          {view.receipt.overridden.length ? <details className="review-history"><summary>{t("Findings accepted with a reason")}</summary><ul>{view.receipt.overridden.map((f, i) => <li key={i}><strong>{checkTitle(f.checkId, undefined, t)}</strong><p>{f.message}</p>{f.quote ? <blockquote>{f.quote}</blockquote> : null}<p>{t("Author’s reason:")} {f.overrideReason || t("See the activity record.")}</p></li>)}</ul></details> : null}
          <details className="review-history"><summary>{t("Versions used")}</summary>
          <p className="muted">{t("Current names are shown for navigation. Content fingerprints below identify the versions actually used.")}</p><RevisionReferences refs={view.receipt.refs} outline={outline} />
          </details>
          <details className="technical"><summary>{t("Content fingerprints")}</summary><p>{t("Manuscript:")} <code>{view.receipt.draftHash}</code></p><p>{t("Writing steps:")} <code>{view.receipt.pipelineDigest}</code></p><ul>{view.receipt.refs.map((r) => <li key={`${r.kind}:${r.id}`}>{t(kindLabel(r.kind))} {r.id}: <code>{r.rev || t("Not recorded")}</code></li>)}</ul></details>
          {view.recheck ? <p>{t("Latest review:")} {view.recheck.at} ({view.recheck.hard} {t("must-fix issues)")}</p> : null}
        </>
      )}
    </article>
  );
}
