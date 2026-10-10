import { useT } from '../i18n/context.jsx';
import { useEffect, useState } from 'react';
import { useApi } from '../api-context.jsx';
import { useDataUrl } from '../lib/asset-url.js';
import { STATUS_LABELS, errorSummary } from '../lib/labels.js';

export const StatusBadge = ({ status }) => { const t = useT(); return (<span className={`badge badge-${status}`}>{t(STATUS_LABELS[status]) ?? status}</span>); };

export function TechnicalDetails({ code, message }) {
  const t = useT();
  return <details className="technical"><summary>{t("Technical details")}</summary><code>{code}</code>{message ? <p>{message}</p> : null}</details>;
}

/** 읽는 중·오류 표시. 오류는 쉬운 안내를 먼저, 원래 코드와 메시지는 접힌 상세에 보여 준다. */
export function LoadState({ state }) {
  const t = useT();
  if (state.error) return <div className="error" role="alert"><p>{t(errorSummary(state.error.code))}</p><TechnicalDetails code={state.error.code ?? 'ERROR'} message={state.error.message} /></div>;
  return <p className="muted">{t("Loading…")}</p>;
}

/** 그림은 토큰 머리글이 필요해 blob 으로 받아 보여 준다. 파일이 없으면 자리만 표시한다. */
export function AssetImage({ id, alt = '' }) {
  const t = useT();
  const api = useApi();
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(null);
  const fixed = api.assetUrl ? api.assetUrl(id) : undefined;
  useEffect(() => {
    if (fixed !== undefined) return undefined;
    let url = null;
    let reader = null;
    let alive = true;
    api.blob(`/api/assets/${encodeURIComponent(id)}`).then((blob) => {
      if (!alive) return;
      if (useDataUrl(blob.type)) {
        reader = new FileReader();
        reader.onload = () => { if (alive) setSrc(reader.result); };
        reader.onerror = () => { if (alive) setFailed('ASSET_READ_ERROR'); };
        reader.readAsDataURL(blob);
      } else {
        url = URL.createObjectURL(blob);
        setSrc(url);
      }
    }, (error) => { if (alive) setFailed(error.code ?? 'ERROR'); });
    return () => { alive = false; if (reader?.readyState === FileReader.LOADING) reader.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, id, fixed]);
  if (fixed !== undefined) {
    return fixed ? <figure className="asset"><img src={fixed} alt={alt || id} /><figcaption>{id}</figcaption></figure> : <figure className="asset missing"><figcaption>{t("Image")} {id} {t("— Not included in this export")}</figcaption></figure>;
  }
  if (failed) return <figure className="asset missing"><figcaption>{t("Image")} {id} {t("— Could not display")}</figcaption><TechnicalDetails code={failed} /></figure>;
  return <figure className="asset">{src ? <img src={src} alt={alt || id} /> : null}<figcaption>{id}</figcaption></figure>;
}
