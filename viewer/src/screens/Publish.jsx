import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { useApi, useLoad } from '../api-context.jsx';
import { LoadState, TechnicalDetails, AssetImage } from '../components/Status.jsx';
import { ManuscriptBody } from '../components/ManuscriptBody.jsx';
import { ExportButton } from '../components/ExportButton.jsx';
import { errorSummary } from '../lib/labels.js';
import { galleryImages } from '../lib/reader-images.js';

function Contents({ entries, selected, onSelect }) {
  return <ol>{entries.map((entry) => <li key={entry.id}>{entry.kind === 'group' ? <><strong>{entry.title}</strong><Contents entries={entry.children} selected={selected} onSelect={onSelect} /></> : <button type="button" aria-current={selected === entry.id ? 'page' : undefined} onClick={() => onSelect(entry.id)}>{entry.title}</button>}</li>)}</ol>;
}
function PublicationDownload({ format, title }) {
  const t = useT();
  const api = useApi(); const [state, setState] = useState(null);
  const download = async () => {
    setState({ busy: true }); let url;
    try {
      const blob = await api.blob(`/api/publication/${format}`); url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = format === 'epub' ? 'book.epub' : 'web-book.zip';
      document.body.append(link); link.click(); link.remove(); setState({ done: true });
    } catch (error) { setState({ error }); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  };
  return <div className="publication-download"><button type="button" disabled={api.static || state?.busy} onClick={download}><strong>{title}</strong><span>{state?.busy ? t("Preparing…") : t("Download ↓")}</span></button>
    {state?.done ? <p className="ok" role="status">{t("Download prepared from the saved work.")}</p> : null}
    {state?.error ? <div role="alert"><p className="error">{t(errorSummary(state.error.code))}</p><TechnicalDetails code={state.error.code} message={state.error.message} /></div> : null}
  </div>;
}
function EditionPreview({ id }) {
  const t = useT();
  const [state] = useLoad(id ? `/api/nodes/${encodeURIComponent(id)}` : null);
  if (!id) return <div className="empty-state"><h1>{t("No writing sections yet")}</h1><p>{t("Ask your AI assistant to plan and write your first section. Then return here to preview and download the book.")}</p></div>;
  if (!state.data) return <LoadState state={state} />;
  const view = state.data;
  return <article className="edition-paper"><nav className="crumbs" aria-label={t("Publication location")}>{view.breadcrumb.map((b) => <span key={b.id}>{b.title || b.id}</span>)}</nav><h1>{view.node.title || id}</h1><ManuscriptBody segments={view.segments} mode="mixed" />
    {galleryImages(view.assets, 'mixed').map((a) => <AssetImage key={a.id} id={a.id} />)}
  </article>;
}
export function Publish({ outline, initialId }) {
  const t = useT();
  const api = useApi(); const [state] = useLoad('/api/publication');
  const [selected, setSelected] = useState(initialId ?? '');
  const leaves = outline.nodes.filter((n) => n.kind === 'leaf');
  const id = leaves.some((n) => n.id === selected) ? selected : leaves[0]?.id;
  const fallback = leaves.map((n) => ({ id: n.id, title: n.title || n.id, kind: 'leaf' }));
  return <section className="publish-workspace"><aside className="edition-contents"><span className="eyebrow">{t("BOOK CONTENTS")}</span><h2>{t("The shape of your work.")}</h2><Contents entries={state.data?.contents ?? fallback} selected={id} onSelect={setSelected} /></aside>
    <div className="edition-preview"><header className="edition-heading"><span className="eyebrow">{t("READING EDITION · MAIN VERSION")}</span><p className="muted">{t("Saved section preview · continuous text, not automatic pagination.")}</p></header><EditionPreview key={id} id={id} /></div>
    <aside className="edition-export"><span className="eyebrow">{t("EXPORT")}</span><h2>{t("A book to read.")}<br />{t("A copy to review.")}</h2><p>{t("Download the saved main version. Exporting does not approve the work.")}</p>
      {state.data ? <><PublicationDownload format="web" title={t("Web book ZIP")} /><PublicationDownload format="epub" title="EPUB" /><p className="muted">{t("Web ZIP includes the reading page and images. Unzip it, then open index.html. Use the Web page’s print menu to save a PDF.")}</p>
        <p>{state.data.nodes} {t("writing sections ·")} {state.data.assets} {t("images")}</p>
        {state.data.warnings.length ? <details className="export-warnings" open><summary>{state.data.warnings.length} {t("items to review")}</summary><p>{t("Check the review records and image availability before publishing.")}</p><TechnicalDetails message={state.data.warnings.map((w) => `${w.code}${w.nodeId ? ` · ${w.nodeId}` : ''}`).join('\n')} /></details> : <p className="muted">{t("No export warnings. This is not a quality guarantee.")}</p>}
      </> : state.error?.code === 'STATIC_UNAVAILABLE' ? <p className="muted">{t("Publication details were not included in this review copy.")}</p> : <LoadState state={state} />}
      {api.static ? <p className="muted">{t("This exported review copy is read only. Open the original workspace to generate a new book download.")}</p> : null}
      {outline.capabilities?.viewerExport ? <ExportButton /> : null}
    </aside>
  </section>;
}
