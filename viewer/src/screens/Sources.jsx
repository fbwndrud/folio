import { useT } from '../i18n/context.jsx';
import { locationLabel, readable } from '../lib/labels.js';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { LoadState } from '../components/Status.jsx';

const RELIABILITY = { low: 'Low', medium: 'Medium', high: 'High' };

function LinkList({ links, showSections = false }) {
  const t = useT();
  return (
    <ul className="claims">
      {links.map((l, i) => (
        <li key={i} className={l.status === 'stale' ? 'stale' : undefined}>
          {showSections && l.nodeTitle ? <p><a href={hrefFor('read', l.nodeId)}>{l.nodeTitle}</a></p> : null}
          “{l.quote}” <span className="muted">{t(locationLabel(l.status))}{l.reason ? ` · ${readable(l.reason)}` : ''}</span>
          <ul>{l.sources.map((s, j) => <li key={j}><a href={hrefFor('source', s.sourceId)}>{s.sourceTitle || s.sourceId}</a>: “{s.quote}” {s.verified ? '' : <span className="error">{t("Quote not found in source")}</span>}</li>)}</ul>
        </li>
      ))}
    </ul>
  );
}

/** 근거 화면: 자료 목록과 근거 연결 요약. */
export function Sources({ outline = null }) {
  const t = useT();
  const [state] = useLoad('/api/sources');
  if (!state.data) return <LoadState state={state} />;
  const { sources, evidence } = state.data;
  return (
    <section>
      <h1>{t("Sources & evidence")}</h1><p className="muted">{t("Sources cited in this manuscript, and the claims connected to them.")}</p>
      {!evidence.enabled ? <p className="muted">{t("Evidence linking is turned off for this work.")}</p> : null}
      {evidence.ledger && !evidence.ledger.ok ? <p className="error">{t("The evidence record could not be verified. Unverified links are hidden.")}</p> : null}
      {evidence.total !== null ? <p>{evidence.total} {t("claims ·")} {evidence.stale.length} {t("need relinking")}</p> : null}
      {sources.length ? <div className="table-scroll"><table>
        <thead><tr><th>{t("Source")}</th><th>{t("Date")}</th><th>{t("Reliability")}</th><th>{t("Linked claims")}</th></tr></thead>
        <tbody>{sources.map((s) => <tr key={s.id}><td><a href={hrefFor('source', s.id)}>{s.title || s.id}</a> <span className="muted">{s.file}</span></td><td>{s.date ?? ''}</td><td>{t(RELIABILITY[s.reliability]) ?? ''}</td><td>{s.links ?? '—'}</td></tr>)}</tbody>
      </table></div> : <div className="empty-state"><h2>{t("No manuscript sources added")}</h2><p>{t("When your work uses outside facts or quotations, ask your AI assistant to register their sources and connect the evidence.")}</p></div>}
      {evidence.stale?.length ? <><h2>{t("Claims needing relinking")}</h2><ul>{evidence.stale.map((s, i) => <li key={i}><a href={hrefFor('read', s.nodeId)}>{outline?.nodes.find((n) => n.id === s.nodeId)?.title || s.nodeId}</a>: “{s.quote}”</li>)}</ul></> : null}
    </section>
  );
}

/** 자료 하나: 설명서, 글(글 자료), 이 자료에 걸린 주장. */
export function Source({ id }) {
  const t = useT();
  const [state] = useLoad(`/api/sources/${encodeURIComponent(id)}`);
  if (!state.data) return <LoadState state={state} />;
  const { source, links } = state.data;
  return (
    <article>
      <h1>{source.title || source.id}</h1>
      <p className="muted">{source.file} · {source.date ?? t("No date")} {t("· Reliability:")} {t(RELIABILITY[source.reliability]) ?? t("Not set")}</p>
      {source.spans.length ? <><h2>{t("Quoted passages")}</h2><ul>{source.spans.map((s) => <li key={s.id}><code>{s.id}</code> “{s.quote}”</li>)}</ul></> : null}
      {source.text !== null ? <><h2>{t("Text")}</h2><div className="body">{source.text}</div>{source.truncated ? <p className="muted">{t("Showing the beginning only.")}</p> : null}</> : null}
      <h2>{t("Linked claims")}</h2>
      {links === null ? <p className="muted">{t("Evidence links are unavailable because linking is off or the record could not be verified.")}</p> : links.length ? <LinkList links={links} showSections /> : <p className="muted">{t("None")}</p>}
    </article>
  );
}

/** 읽기 화면 옆: 이 노드의 주장과 근거. 주장이 없으면 그리지 않는다. */
export function Claims({ nodeId }) {
  const t = useT();
  const [state] = useLoad(`/api/evidence/${encodeURIComponent(nodeId)}`);
  if (!state.data?.claims?.length) return null;
  return <section className="entities"><h2>{t("Sources & evidence")}</h2><LinkList links={state.data.claims} /></section>;
}
