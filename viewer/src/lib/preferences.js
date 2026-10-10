export const DEFAULT_PREFERENCES = Object.freeze({ size: 20, leading: 1.8, width: 64, font: 'serif', theme: 'system' });
export const PREFERENCE_KEY = 'folio.viewer.reading.v1';

export function normalizePreferences(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const number = (name, low, high) => typeof safe[name] === 'number' && Number.isFinite(safe[name])
    ? Math.min(high, Math.max(low, safe[name])) : DEFAULT_PREFERENCES[name];
  return { size: number('size', 18, 24), leading: number('leading', 1.6, 2), width: number('width', 48, 76),
    font: ['serif', 'sans'].includes(safe.font) ? safe.font : 'serif',
    theme: ['system', 'light', 'dark'].includes(safe.theme) ? safe.theme : 'system' };
}

export function readPreferences(storage) {
  try { return normalizePreferences(JSON.parse(storage?.getItem(PREFERENCE_KEY) ?? 'null')); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}

export function savePreferences(storage, value) {
  try { storage?.setItem(PREFERENCE_KEY, JSON.stringify(normalizePreferences(value))); } catch { /* Optional storage. */ }
}
