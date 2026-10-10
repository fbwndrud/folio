import { useT } from '../i18n/context.jsx';
import { stepLabel } from '../lib/labels.js';
import { useState } from 'react';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { filterReceipts, skippedStepIds } from '../lib/receipts-filter.js';
import { LoadState, StatusBadge, TechnicalDetails } from '../components/Status.jsx';

const flags = (n, t) => [n.stale && 'Review needed', n.recheck && 'New checks pending', n.flagged && 'Needs attention', n.drift && 'Edited since review'].filter(Boolean).map((label) => t(label)).join(' · ');

/** 영수증 목록. "critic 을 건너뛴 장면만" 같은 거르기를 한다. */
export function Receipts() {
  const t = useT();
  const [state] = useLoad('/api/receipts');
  const [skipped, setSkipped] = useState('');
  const [attention, setAttention] = useState(false);
  if (!state.data) return <LoadState state={state} />;
  const { ledger, nodes } = state.data;
  if (!ledger.ok) return <section><h1>{t("Review records")}</h1><p className="error" role="alert">{t("The review records could not be verified. Unverified records are hidden. Ask your AI assistant to check the activity record.")}</p><TechnicalDetails code="LEDGER_TAMPERED" message={ledger.line ? t("Line {value0}", { value0: ledger.line }) : null} /></section>;
  const shown = filterReceipts(nodes, { skipped: skipped || null, attention });
  return (
    <section>
      <h1>{t("Review records")}</h1>
      {state.data.statusAvailable === false ? <p className="warn">{t("Current review status is unavailable. These records do not confirm the current text.")}</p> : null}
      <div className="filters">
        <label>{t("Skipped step")} <select value={skipped} onChange={(e) => setSkipped(e.target.value)}>
          <option value="">{t("All")}</option>
          {skippedStepIds(nodes).map((id) => <option key={id} value={id}>{t(stepLabel(id))}</option>)}
        </select></label>
        <label><input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} /> {t("Only sections needing attention")}</label>
      </div>
      {!shown.length ? <p className="muted">{nodes.length ? t("No sections match these filters. Clear the filters to see all records.") : t("No sections yet. Ask your AI assistant to add your work’s structure.")}</p> : <div className="table-scroll"><table>
        <thead><tr><th>{t("Section")}</th><th>{t("Finalized")}</th><th>{t("Skipped")}</th><th>{t("Failed")}</th><th>{t("Suggestions")}</th><th>{t("Attention")}</th></tr></thead>
        <tbody>
          {shown.map((n) => (
            <tr key={n.nodeId}>
              <td><a href={hrefFor('receipt', n.nodeId)}>{n.title || n.nodeId}</a><br /><StatusBadge status={n.status} /></td>
              <td>{n.committed ? t("Yes") : n.imported ? t("Imported, not finalized") : t("Not yet")}</td><td>{n.skipped.map((id) => t(stepLabel(id))).join(', ')}</td><td>{n.failed.map((id) => t(stepLabel(id))).join(', ')}</td><td>{n.advisories || ''}</td><td>{flags(n, t)}{n.overridden ? t(" ({value0} accepted findings)", { value0: n.overridden }) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>}
    </section>
  );
}
