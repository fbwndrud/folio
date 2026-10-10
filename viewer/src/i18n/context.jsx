import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { initialLanguage, LANGUAGE_KEY, saveLanguage, supportedLanguage } from './locale.js';
import { translate } from './translate.js';

const storage = () => { try { return window.localStorage; } catch { return null; } };
const I18nContext = createContext({ locale: 'en', t: (message, values) => translate(message, 'en', values), setLocale: () => {} });
export function I18nProvider({ children, initialLocale }) {
  const [locale, changeLocale] = useState(() => supportedLanguage(initialLocale) ? initialLocale : initialLanguage(storage(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]));
  const setLocale = useCallback((value) => {
    if (!supportedLanguage(value)) return;
    changeLocale(value); saveLanguage(storage(), value);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    const onStorage = (event) => {
      if (event.key === LANGUAGE_KEY) changeLocale(initialLanguage(storage(), navigator.languages ?? []));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [locale]);
  const t = useCallback((message, values) => translate(message, locale, values), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export const useI18n = () => useContext(I18nContext);
export const useT = () => useI18n().t;
