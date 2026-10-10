import { useT } from '../i18n/context.jsx';
import { hrefFor } from '../lib/route.js';
import { kindLabel } from '../lib/labels.js';

/** Current labels help navigation; immutable revision IDs stay in fingerprint details. */
export function RevisionReferences({ refs, outline }) {
  const t = useT();
  const label = (r) => r.kind === 'entity'
    ? outline?.entities?.find((e) => e.id === r.id)?.name || r.id
    : outline?.nodes?.find((n) => n.id === r.id)?.title || (r.id === 'main' && r.kind.startsWith('tracking_') ? t("This work") : r.id);
  return <ul>{refs.map((r) => {
    const screen = r.kind === 'node' ? 'read' : r.kind === 'entity' ? 'entity' : r.kind === 'source' ? 'source' : r.kind === 'tracking_snapshot' || r.kind === 'tracking_candidate' ? 'read' : null;
    return <li key={`${r.kind}:${r.id}`}><span className="muted">{t(kindLabel(r.kind))}</span> {screen ? <a href={hrefFor(screen, r.id)}>{label(r)}</a> : label(r)}</li>;
  })}</ul>;
}
