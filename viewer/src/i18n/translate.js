import { korean } from './catalog.js';

/** Stable English message keys; unknown messages safely retain the English fallback. */
export function translate(message, locale = 'en', values = {}) {
  if (message === null || message === undefined) return message;
  const source = String(message);
  const translated = locale === 'ko' && Object.hasOwn(korean, source) ? korean[source] : source;
  return translated.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token);
}
