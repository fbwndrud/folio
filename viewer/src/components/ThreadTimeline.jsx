import { useT } from '../i18n/context.jsx';
import { threadLabel } from '../lib/labels.js';
import { hrefFor } from '../lib/route.js';

/** Fixed-width cells and wrapped titles; no SVG text positions or unreadable fit-to-page scaling. */
export function ThreadTimeline({ leaves, promises }) {
  const t = useT();
  return <div className="thread-timeline-scroll" role="region" aria-label={t("Story thread section timeline")} tabIndex={0}>
    <table className="thread-matrix"><caption>{t("Writing-section events in reading order. Scroll sideways to see later sections. Group notes are shown in Recorded developments.")}</caption>
      <thead><tr><th scope="col">{t("Story thread")}</th>{leaves.map((leaf, i) => <th scope="col" key={leaf.id}>
        <a href={hrefFor('read', leaf.id)} title={leaf.title || leaf.id}><span className="eyebrow">{t("Section")} {i + 1}</span><span className="thread-section-name">{leaf.title || leaf.id}</span></a>
      </th>)}</tr></thead>
      <tbody>{promises.map((p) => <tr key={p.entityId}><th scope="row"><a href={hrefFor('entity', p.entityId)}>{p.name}</a></th>
        {leaves.map((leaf) => <td key={leaf.id}>{p.marks.filter((m) => m.nodeId === leaf.id).map((m) => <a className={`thread-stage stage-${m.stage}`} key={m.eventId} href={hrefFor('read', m.nodeId)} aria-label={`${t(threadLabel(m.stage))} — ${leaf.title || leaf.id}`}>{t(threadLabel(m.stage))}</a>)}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
