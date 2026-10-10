import { useT } from '../i18n/context.jsx';
import { StructuredValue } from '../components/StructuredValue.jsx';
import { kindLabel, locationLabel, threadLabel, readable } from '../lib/labels.js';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { AssetImage, LoadState } from '../components/Status.jsx';

const SURFACE_LABELS = { node: 'Section', entity: 'Definition', asset: 'Image', source: 'Source' };

function UsageLink({ usage }) {
  if (usage.kind === 'node') return <a href={hrefFor('read', usage.id)}>{usage.title || usage.id}</a>;
  if (usage.kind === 'entity') return <a href={hrefFor('entity', usage.id)}>{usage.title || usage.id}</a>;
  if (usage.kind === 'source') return <a href={hrefFor('source', usage.id)}>{usage.title || usage.id}</a>;
  return <span>{usage.title || usage.id}</span>;
}

/** 엔티티 화면: 정의 → 사용처(노드별) → Event history → Related images. 사용처를 누르면 그 장면으로 간다. */
export function Entity({ id }) {
  const t = useT();
  const [state] = useLoad(`/api/entities/${encodeURIComponent(id)}`);
  if (!state.data) return <LoadState state={state} />;
  const { entity, usages, events, ledgers, promise, assets } = state.data;
  const attributes = Object.fromEntries(Object.entries(entity.data ?? {}).filter(([key]) => !['id', 'kind', 'name', 'aliases'].includes(key)));
  return (
    <article className="entity-view">
      <h1>{entity.name} <span className="muted">{t(kindLabel(entity.kind))}</span></h1>
      {entity.aliases.length ? <p>{t("Other names:")} {entity.aliases.join(', ')}</p> : null}
      {entity.body ? <p className="definition">{entity.body}</p> : null}
      {Object.keys(attributes).length ? <section className="catalog-card"><h2>{t("Definition details")}</h2><StructuredValue value={attributes} /></section> : null}
      {promise ? <p>{t("Story thread:")} <strong>{promise.stage ? t(threadLabel(promise.stage)) : t("Not introduced")}</strong></p> : null}
      {state.data.tracking?.plan ? <p><a href={hrefFor('review')}>{t("Open tracking observations in the Evidence desk")}</a> · {state.data.tracking.observations.length} {t("active records")}</p> : null}
      <h2>{t("Where it appears")}</h2>
      {usages.length ? (
        <ul className="usages">
          {usages.map((u) => (
            <li key={`${u.kind}:${u.id}`}>
              <span className="muted">{t(SURFACE_LABELS[u.kind])}</span> <UsageLink usage={u} />
              {u.count ? <span className="muted"> · {u.count} {t("occurrences")}</span> : null}{u.declared ? <span className="muted"> {t("· Section details")}</span> : null}
              {u.marks.length ? <ul>{u.marks.map((m, i) => <li key={i} className={m.status === 'stale' ? 'stale' : undefined}>“{m.quote}” <span className="muted">{t(kindLabel(m.kind))} · {t(locationLabel(m.status))}</span></li>)}</ul> : null}
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t("None")}</p>}
      <h2>{t("Event history")}</h2>
      {events === null ? <p className="error">{t("The activity record could not be verified (line")} {ledgers.events.line ?? '?'}{t("). Unverified events are hidden.")}</p> : null}
      {events?.length ? (
        <ol className="timeline">
          {events.map((e) => <li key={e.eventId}><a href={hrefFor('read', e.nodeId)}>{e.nodeTitle ?? e.nodeId}</a> — <span>{readable(e.kind)}</span>{e.data ? <details className="event-details"><summary>{t("Recorded details")}</summary><StructuredValue value={e.data} /></details> : null}</li>)}
        </ol>
      ) : events ? <p className="muted">{t("None")}</p> : null}
      {assets.length ? <><h2>{t("Related images")}</h2><div className="pictures">{assets.map((a) => <AssetImage key={a.id} id={a.id} />)}</div></> : null}
    </article>
  );
}
