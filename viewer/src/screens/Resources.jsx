import { useT } from '../i18n/context.jsx';
import { StructuredValue } from '../components/StructuredValue.jsx';
import { useEffect, useState } from 'react';
import { ExportButton } from '../components/ExportButton.jsx';
import { ResourceEvidence } from '../components/ResourceEvidence.jsx';
import { loadResourceDetail } from '../lib/resource-detail.js';
import { useApi, useLoad } from '../api-context.jsx';
import { LoadState } from '../components/Status.jsx';
import { hrefFor } from '../lib/route.js';
import { resourceGroups, resourceKind, resourceListStatus, resourceTitle } from '../lib/resource-labels.js';

export function Resources({ allowExport = false }) {
  const t = useT();
  const api = useApi();
  const [state, reload] = useLoad('/api/resources');
  return state.data ? <><ResourcesContent data={state.data} />{allowExport ? <ExportButton /> : null}</>
    : <><LoadState state={state} />{state.error && !api.static ? <button type="button" onClick={reload}>{t("Retry view")}</button> : null}</>;
}

export function ResourceListSummary({ data }) {
  const t = useT();
  const status = t(resourceListStatus(data));
  return <div className="resource-summary">
    <p className={status === t("Complete list") ? 'ok' : 'warn'}>{status}</p>
    {data.unavailableReason === 'not-indexed' ? <p>{t("The resource list has not been prepared yet. Ask your AI assistant to index selected sources and approved results.")}</p> : null}
    {data.freshness === 'stale' ? <p>{t("This list reflects an earlier workspace state. Selections and review needs may have changed.")}</p> : null}
    {data.coverage?.missing?.length ? <p>{t("Some requested resources are missing from this list.")}</p> : null}
    {data.coverage?.unknown?.length ? <p>{t("External content has not been observed. Its current contents cannot be confirmed.")}</p> : null}
    <details className="technical"><summary>{t("List details")}</summary><StructuredValue value={{ freshness: data.freshness, coverage: data.coverage, checkpoint: data.checkpoint, currentCheckpoint: data.currentCheckpoint }} systemLabels /></details>
  </div>;
}

export function ResourcesContent({ data }) {
  const t = useT();
  const groups = resourceGroups(data.entries);
  return <section className="resources">
    <h1>{t("Resources")}</h1><p className="muted">{t("Selected sources and approved results, with their recorded evidence.")}</p>
    <ResourceListSummary data={data} />
    {groups.length ? <ul className="resource-list">{groups.map((entries) => <li key={entries[0].revisionId}>
      <h2><a href={hrefFor('resource', entries[0].revisionId)}>{resourceTitle(entries[0])}</a></h2>
      <p className="muted">{t(resourceKind(entries[0]))}</p>
      <ul className="resource-contexts">{entries.map((entry, index) => <ResourceEvidence key={index} entry={entry} number={index + 1} />)}</ul>
    </li>)}</ul> : data.unavailableReason !== 'not-indexed' ? <p>{t("No selected sources or approved results are included in this list.")}</p> : null}
  </section>;
}

/** A direct detail URL reads the verified list as well as the singular preview. */
export function Resource({ id }) {
  const t = useT();
  const api = useApi();
  const [state, setState] = useState({ loading: true });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    loadResourceDetail(api, id).then((data) => { if (alive) setState({ data, loading: false }); }, (error) => { if (alive) setState({ error, loading: false }); });
    return () => { alive = false; };
  }, [api, id, round]);
  return state.data ? <ResourceContent {...state.data} /> : <><LoadState state={state} />{state.error && !api.static ? <button type="button" onClick={() => setRound((n) => n + 1)}>{t("Retry view")}</button> : null}</>;
}

function ResourcePreview({ detail }) {
  const t = useT();
  if (detail.contentPreview === null) return <p className="muted">{t("No text preview is available for this resource. Binary and unobserved external content are not included.")}</p>;
  if (!detail.previewTruncated && detail.entry.mediaType?.split(';')[0] === 'application/json') {
    try { return <StructuredValue value={JSON.parse(detail.contentPreview)} />; } catch { /* Original invalid JSON remains visible as authored text. */ }
  }
  const jsonSource = detail.entry.mediaType?.split(';')[0] === 'application/json';
  return jsonSource ? <><p className="muted">{detail.previewTruncated ? t("This JSON source is too large for a complete field preview.") : t("This source could not be read as valid JSON fields.")} {t("The recorded source text is preserved below.")}</p><details><summary>{t("Original source text")}</summary><pre className="body resource-preview">{detail.contentPreview}</pre></details></> : <pre className="body resource-preview">{detail.contentPreview}</pre>;
}

export function ResourceContent({ data, detail }) {
  const t = useT();
  const entries = data.entries.filter((entry) => entry.revisionId === detail.entry.revisionId);
  return <article className="resources">
    <p><a href={hrefFor('resources')}>{t("All resources")}</a></p>
    <h1>{resourceTitle(detail.entry)}</h1><p className="muted">{t(resourceKind(detail.entry))}</p>
    <ResourceListSummary data={data} />
    <h2>{t("Recorded evidence")}</h2>
    <ul className="resource-contexts">{entries.map((entry, index) => <ResourceEvidence key={index} entry={entry} number={index + 1} />)}</ul>
    <h2>{t("Text preview")}</h2>
    <ResourcePreview detail={detail} />
    {detail.previewTruncated ? <p className="muted">{t("Showing the beginning only.")}</p> : null}
  </article>;
}
