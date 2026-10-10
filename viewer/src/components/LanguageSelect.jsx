import { useI18n } from '../i18n/context.jsx';
import { LANGUAGES } from '../i18n/locale.js';

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return <label className="language-select"><span>{t('Language')}</span><select value={locale} onChange={(event) => setLocale(event.target.value)} aria-label={t('Language')}>
    {LANGUAGES.map((language) => <option key={language.code} value={language.code} lang={language.code}>{language.label}</option>)}
  </select></label>;
}
