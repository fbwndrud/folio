import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { useApi } from '../api-context.jsx';
import { errorSummary } from '../lib/labels.js';
import { TechnicalDetails } from './Status.jsx';

export function ExportButton() {
  const t = useT();
  const api = useApi();
  const [result, setResult] = useState(null);
  if (api.static) return null;
  const run = async () => {
    setResult({ busy: true });
    try { const out = await api.post('/api/export', {}); setResult({ ok: true, out }); }
    catch (error) { setResult({ ok: false, error }); }
  };
  return <div className="export-action">
    <h2>{t("Share a review copy")}</h2><p className="muted">{t("Export a read-only copy of this workspace, including its review records. This is separate from exporting a finished edition.")}</p>
    <button type="button" className="quiet" onClick={run} disabled={result?.busy}>{result?.busy ? t("Exporting…") : t("Export review view")}</button>
    {result && !result.busy ? <p role="status" className={result.ok ? 'ok' : 'error'}>{result.ok ? t("Exported {value0} files and {value1} images to {value2}. Open the exported view through a web server.", { value0: result.out.files, value1: result.out.assets, value2: result.out.dir }) : t(errorSummary(result.error.code))}</p> : null}
    {result?.error ? <TechnicalDetails code={result.error.code} message={result.error.message} /> : null}
  </div>;
}
