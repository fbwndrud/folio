import { useT } from '../i18n/context.jsx';
import { useReading } from '../reading-context.jsx';
import { DEFAULT_PREFERENCES } from '../lib/preferences.js';

export function ReadingSettings() {
  const t = useT();
  const { preferences, update } = useReading();
  return <details className="reading-settings">
    <summary>{t("Reading settings")}</summary>
    <div className="reading-fields">
      <label>{t("Text size")} <select value={preferences.size} onChange={(e) => update({ size: Number(e.target.value) })}>
        {[18, 20, 22, 24].map((n) => <option key={n} value={n}>{n}{t("px")}</option>)}
      </select></label>
      <label>{t("Line spacing")} <select value={preferences.leading} onChange={(e) => update({ leading: Number(e.target.value) })}>
        {[1.6, 1.8, 2].map((n) => <option key={n} value={n}>{n === 1.6 ? t("Compact") : n === 1.8 ? t("Comfortable") : t("Spacious")}</option>)}
      </select></label>
      <label>{t("Text width")} <select value={preferences.width} onChange={(e) => update({ width: Number(e.target.value) })}>
        {[48, 64, 76].map((n) => <option key={n} value={n}>{n === 48 ? t("Narrow") : n === 64 ? t("Standard") : t("Wide")}</option>)}
      </select></label>
      <label>{t("Typeface")} <select value={preferences.font} onChange={(e) => update({ font: e.target.value })}>
        <option value="serif">{t("Serif")}</option><option value="sans">{t("Sans serif")}</option>
      </select></label>
      <label>{t("Appearance")} <select value={preferences.theme} onChange={(e) => update({ theme: e.target.value })}>
        <option value="system">{t("Use device setting")}</option><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option>
      </select></label>
      <button type="button" className="quiet" onClick={() => update(DEFAULT_PREFERENCES)}>{t("Reset reading settings")}</button>
    </div>
  </details>;
}
