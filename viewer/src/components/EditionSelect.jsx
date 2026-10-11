import { useEdition } from '../edition-context.jsx';
import { useI18n, useT } from '../i18n/context.jsx';

export function EditionSelect() {
  const { editions, variant, select } = useEdition();
  const { locale } = useI18n(); const t = useT();
  if (editions.length < 2) return null;
  const language = code => {
    try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code; }
    catch { return code; }
  };
  return <label className="edition-select">{t("Reading edition")} <select value={variant} onChange={event => select(event.target.value)}>
    {editions.map(e => <option key={e.id} value={e.id}>{e.id === 'main' ? t("Original") : `${t(e.kind === 'translation' ? 'Translation' : e.kind === 'summary' ? 'Summary' : 'Revision')} · ${e.lang ? language(e.lang) : e.id} (${e.id})`}</option>)}
  </select></label>;
}
export function EditionNotice() {
  const { variant, error } = useEdition(); const t = useT();
  if (error && error.code !== 'ROUTE_UNKNOWN') return <p className="warn" role="status">{t("Reading editions could not be loaded. Only the original is available.")}</p>;
  return variant === 'main' ? null : <p className="example-disclosure">{t("Section text, section review records and publication use the selected edition. Outline, settings, library, tracking and work-wide review summaries describe the original work.")}</p>;
}
