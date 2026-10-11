import { createContext, useContext, useMemo, useState } from 'react';
import { useLoad } from './api-context.jsx';
import { readStaticData } from './lib/static-api.js';
import { editionPath } from './lib/edition.js';

const EditionContext = createContext({ variant: 'main', select: () => {}, editions: [], path: p => p });
export function EditionProvider({ children }) {
  const [catalog, reload] = useLoad('/api/variants');
  const [chosen, select] = useState(() => {
    try {
      const requested = JSON.parse(document.getElementById('folio-example')?.textContent ?? 'null')?.readingVariant;
      const data = readStaticData(document);
      return requested && Object.hasOwn(data?.variants?.editions ?? {}, requested) ? requested : 'main';
    } catch { return 'main'; }
  });
  const editions = catalog.data?.editions ?? [];
  const variant = editions.some(e => e.id === chosen) ? chosen : 'main';
  const value = useMemo(() => ({ variant, select, editions, reload, error: catalog.error, path: p => editionPath(p, variant) }), [variant, editions, catalog.error]);
  return <EditionContext.Provider value={value}>{children}</EditionContext.Provider>;
}
export const useEdition = () => useContext(EditionContext);
