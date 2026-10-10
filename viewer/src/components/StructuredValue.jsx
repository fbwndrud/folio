import { useT } from '../i18n/context.jsx';
import { fieldLabel, scalarText } from '../lib/value-display.js';

/** Human-readable values preserve every submitted field, including zero, false and empty values. */
export function StructuredValue({ value, systemLabels = false }) {
  const t = useT();
  if (Array.isArray(value)) return value.length ? <ol className="structured-list">{value.map((item, i) => <li key={i}><StructuredValue value={item} systemLabels={systemLabels} /></li>)}</ol> : <span className="muted">{t("No items")}</span>;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? <dl className="structured-fields">{entries.map(([key, item]) => <div key={key}><dt>{systemLabels ? t(fieldLabel(key, true)) : fieldLabel(key)}</dt><dd><StructuredValue value={item} systemLabels={systemLabels} /></dd></div>)}</dl> : <span className="muted">{t("No recorded fields")}</span>;
  }
  const text = scalarText(value, t);
  return <span className={text.startsWith('sha256:') ? 'fingerprint-value' : 'structured-scalar'}>{text}</span>;
}
