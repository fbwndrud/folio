import { useT } from '../i18n/context.jsx';
import { hrefFor } from '../lib/route.js';

/** Core-parsed note references; unknown text stays intact and no HTML is injected. */
export function ReferenceText({ segments, fallback }) {
  const t = useT();
  if (!segments) return fallback;
  return segments.map((s, index) => {
    if (s.citation) return s.valid ? <a key={index} href={hrefFor('source', s.citation)}>{s.label || s.citation}</a> : <span key={index} className="error">{s.label || s.citation} {t("· Source missing")}</span>;
    if (s.blockRef) return s.nodeId ? <a key={index} href={hrefFor('read', s.nodeId)}>{s.label || s.blockRef}</a> : <span key={index} className="error">{s.blockRef} {t("· Target missing")}</span>;
    if (s.asset) return <span key={index}>{t("Image reference:")} {s.asset}</span>;
    return <span key={index}>{s.text}</span>;
  });
}
