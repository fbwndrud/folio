import { createContext, useContext, useEffect, useState } from 'react';

/** @type {import('react').Context<ReturnType<typeof import('./lib/api.js').createApi> | null>} */
export const ApiContext = createContext(null);
export const useApi = () => useContext(ApiContext);

/**
 * GET 한 번. 경로가 바뀌거나 reload() 를 부르면 다시 읽는다.
 * @param {string|null} path
 * @returns {[{ data?: any, error?: any, loading: boolean }, () => void]}
 */
export function useLoad(path) {
  const api = useApi();
  const [state, setState] = useState({ loading: true });
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setState((prev) => ({ ...prev, loading: true }));
    api.get(path).then((data) => { if (alive) setState({ data, loading: false, path }); }, (error) => { if (alive) setState({ error, loading: false, path }); });
    return () => { alive = false; };
  }, [api, path, round]);
  return [state.path === path ? state : { loading: true }, () => setRound((n) => n + 1)];
}
