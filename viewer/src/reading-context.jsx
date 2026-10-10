import { createContext, useContext, useEffect, useState } from 'react';
import { normalizePreferences, readPreferences, savePreferences } from './lib/preferences.js';

const ReadingContext = createContext(null);
const storage = () => { try { return window.localStorage; } catch { return null; } };

export function ReadingProvider({ children }) {
  const [preferences, setPreferences] = useState(() => readPreferences(storage()));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    savePreferences(storage(), preferences);
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences]);
  const update = (patch) => setPreferences((prev) => normalizePreferences({ ...prev, ...patch }));
  return <ReadingContext.Provider value={{ preferences, update, focused, setFocused }}>{children}</ReadingContext.Provider>;
}
export const useReading = () => useContext(ReadingContext);
