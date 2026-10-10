import { useT } from '../i18n/context.jsx';
import { StructuredValue } from './StructuredValue.jsx';
import { resourceRole, resourceStatus } from '../lib/resource-labels.js';

const reasons = {
  'source-selection-changed': 'A selected source changed or was removed.',
  'source-changed': 'A selected source changed.',
  'source-deselected': 'A source is no longer selected.',
  'profile-changed': 'The representation profile changed.',
  'pipeline-changed': 'The writing steps changed.',
  'policy-changed': 'The rules changed.',
};
const severity = { hard: 'Must fix', soft: 'Suggestion', info: 'Information' };

/** Each evidence record keeps its own role, operation, review and status. */
export function ResourceEvidence({ entry, number }) {
  const t = useT();
  return <li>
    <div className="resource-role"><strong>{t(resourceRole(entry))}</strong><span className={entry.reviewRequired ? 'warn' : 'muted'}>{t(resourceStatus(entry))}</span></div>
    {entry.selfReview ? <p className="muted">{t("Self-review · Reported by the host")}</p> : null}
    {entry.reviewRequired ? <p className="warn">{t("The inputs used for this result have changed. Review it again before relying on it.")}</p> : null}
    {entry.reviewReasons?.length ? <ul>{entry.reviewReasons.map((reason, index) => <li key={index}>{t(reasons[reason.reason ?? reason]) ?? t("An input or its selection changed.")}</li>)}</ul> : null}
    {entry.findings?.length ? <ul>{entry.findings.map((finding, index) => <li key={index}><strong>{t(severity[finding.severity]) ?? t("Finding")}:</strong> {finding.message}</li>)}</ul> : null}
    <details className="technical"><summary>{t("Evidence details")}{number ? ` ${number}` : ''}</summary>
      <StructuredValue value={entry} systemLabels />
    </details>
  </li>;
}
