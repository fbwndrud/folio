import { useT } from '../../i18n/context.jsx';
import { hrefFor } from '../../lib/route.js';
import { sectionInGroup } from '../../lib/tracking.js';

/** Text references, never inferred relationships. Labels remain readable without graph zoom. */
export function SubjectConnections({ subjectId, subjectName, graph, nodes, groupId }) {
  const t = useT();
  if (!graph) return <p className="muted">{t("Connections could not be loaded.")}</p>;
  const ids = new Set(graph.edges.filter((e) => e.target === `entity:${subjectId}`).map((e) => e.source));
  const refs = graph.nodes.filter((n) => ids.has(n.id) && nodes.find((s) => s.id === n.refId)?.kind === 'leaf' && sectionInGroup(nodes, n.refId, groupId));
  return <section className="subject-connections"><span className="eyebrow">{t("CONNECTIONS")}</span><h2>{t("One subject. Its references.")}</h2><p className="muted">{refs.length} {t("sections in this scope · manuscript references, not inferred relationships")}</p>
    <div className="reference-map"><ul>{refs.map((n) => <li key={n.id}><a href={hrefFor('read', n.refId)}>{n.label}<span aria-hidden="true">↗</span></a></li>)}</ul><div className="reference-subject"><strong>{subjectName}</strong><span className="muted">{t("Selected subject")}</span></div></div>
    {!refs.length ? <p className="muted">{t("No writing section references in this scope.")}</p> : null}
  </section>;
}
