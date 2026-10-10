export const LANGUAGE_KEY = 'folio.viewer.language.v1';
export const LANGUAGES = Object.freeze([{ code: 'ko', label: '한국어' }, { code: 'en', label: 'English' }]);
export function supportedLanguage(value) { return LANGUAGES.some((l) => l.code === value); }
export function initialLanguage(storage, languages = []) {
  try { const saved = storage?.getItem(LANGUAGE_KEY); if (supportedLanguage(saved)) return saved; } catch { /* Storage may be blocked. */ }
  for (const language of languages) {
    const base = String(language).toLowerCase().split('-')[0];
    if (supportedLanguage(base)) return base;
  }
  return 'en';
}
export function saveLanguage(storage, language) {
  if (!supportedLanguage(language)) return;
  try { storage?.setItem(LANGUAGE_KEY, language); } catch { /* Selection still works for this session. */ }
}
