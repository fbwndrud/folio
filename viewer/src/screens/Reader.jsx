import { useT } from '../i18n/context.jsx';
import { TrackingPanel } from '../components/tracking/TrackingPanel.jsx';
import { kindLabel } from '../lib/labels.js';
import { useEffect, useRef, useState } from 'react';
import { useLoad } from '../api-context.jsx';
import { useReading } from '../reading-context.jsx';
import { hrefFor } from '../lib/route.js';
import { quoteRange, reviewSummary } from '../lib/review.js';
import { AssetImage, LoadState, StatusBadge } from '../components/Status.jsx';
import { ManuscriptBody } from '../components/ManuscriptBody.jsx';
import { ReadingSettings } from '../components/ReadingSettings.jsx';
import { SectionReview } from '../components/ReviewSummary.jsx';
import { Claims } from './Sources.jsx';
import { galleryImages } from '../lib/reader-images.js';

const MODES = [['mixed', 'Text & images'], ['text', 'Text only'], ['pictures', 'Images only']];

export function Reader({ id, observationId }) {
  const t = useT();
  const [state] = useLoad(`/api/nodes/${encodeURIComponent(id)}`);
  const [tracking] = useLoad('/api/tracking');
  const [panel, setPanel] = useState('tracking');
  const [review] = useLoad(`/api/receipts/${encodeURIComponent(id)}`);
  const [mode, setMode] = useState('mixed');
  const [reviewOpen, setReviewOpen] = useState(() => window.matchMedia('(min-width: 1200px)').matches);
  const [selection, setSelection] = useState(null);
  const { preferences, focused, setFocused } = useReading();
  const manuscript = useRef(null);
  useEffect(() => {
    if (!observationId || !tracking.data || !state.data) return;
    const observation = tracking.data.observations.find((o) => o.observationId === observationId && o.evidence.nodeId === id);
    const valid = observation && state.data.contentHash === observation.evidence.textHash;
    setSelection(valid ? { quote: observation.evidence.quote, range: quoteRange(state.data.segments, observation.evidence.quote) } : { unavailable: true });
    setMode('mixed');
  }, [observationId, tracking.data, state.data, id]);
  const reviewPanel = useRef(null);
  useEffect(() => {
    if (!selection) return;
    const mark = manuscript.current?.querySelector('mark');
    mark?.scrollIntoView({ block: 'center', behavior: 'instant' });
    mark?.focus({ preventScroll: true });
  }, [selection]);
  useEffect(() => {
    if (!focused) return;
    const escape = (event) => { if (event.key === 'Escape') setFocused(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [focused, setFocused]);
  if (!state.data) return <LoadState state={state} />;
  const view = state.data;
  const reviewStatus = review.data ? reviewSummary(review.data) : null;
  const pictures = galleryImages(view.assets, mode);
  const showQuote = (quote) => {
    setSelection({ quote, range: quoteRange(view.segments, quote) });
    if (mode === 'pictures') setMode('text');
  };
  const toggleReview = () => {
    setReviewOpen(!reviewOpen);
    if (!reviewOpen && !window.matchMedia('(min-width: 1200px)').matches) {
      requestAnimationFrame(() => { reviewPanel.current?.scrollIntoView({ block: 'start' }); reviewPanel.current?.focus({ preventScroll: true }); });
    }
  };
  const backToText = () => {
    setReviewOpen(false);
    requestAnimationFrame(() => manuscript.current?.querySelector('.reader-toolbar button')?.focus());
  };
  const style = { '--reader-size': `${preferences.size}px`, '--reader-leading': preferences.leading,
    '--reader-width': `${preferences.width}ch` };
  return <div className={`reader-workspace ${reviewOpen ? 'review-open' : 'review-closed'}`}>
    <article className={`reader reader-${preferences.font}`} style={style} ref={manuscript}>
      <div className="reader-toolbar">
        <ReadingSettings />
        <button type="button" className="quiet" aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? t("Exit focus mode") : t("Focus mode")}</button>
        {!focused ? <button type="button" className="quiet" aria-expanded={reviewOpen} aria-controls="section-review" onClick={toggleReview}>{reviewOpen ? t("Hide details") : t("Show details")}</button> : null}
      </div>
      <nav className="crumbs" aria-label={t("Location")}>
        {view.breadcrumb.map((b) => <a key={b.id} href={hrefFor('read', b.id)}>{b.title || b.id}</a>)}
      </nav>
      <header className="reader-heading"><StatusBadge status={view.node.status} /><h1>{view.node.title || view.node.id}</h1>
        {reviewStatus && reviewStatus.state !== 'recorded' ? <p className={reviewStatus.state === 'unverified' ? 'error' : 'warn'}><a href={hrefFor('receipt', id)}>{t(reviewStatus.label)}</a></p> : null}
        {review.error ? <p className="warn">{t("Review status could not be loaded.")} <a href={hrefFor('receipt', id)}>{t("Open review record")}</a></p> : null}
      </header>
      <div className="modes" role="group" aria-label={t("Reading view")}>
        {MODES.map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{t(label)}</button>)}
      </div>
      {selection ? <div className="quote-notice" role="status">{selection.unavailable ? t("This evidence version is no longer available. Review the source before using it.") : selection.range?.count > 1 ? t("Showing the first matching passage.") : t("Showing the quoted passage.")}<button type="button" className="quiet" onClick={() => setSelection(null)}>{t("Clear highlight")}</button></div> : null}
      {mode !== 'pictures' ? view.segments.length ? <ManuscriptBody segments={view.segments} mode={mode} range={selection?.range} /> : <p className="empty-text">{t("This section has no text yet. Ask your AI assistant to write it.")}</p> : null}
      {pictures.length ? <div className="pictures">{pictures.map((a) => <AssetImage key={a.id} id={a.id} />)}</div> : null}
      {mode === 'pictures' && !pictures.length ? <p className="muted">{t("This section has no images. Choose Text & images to read the manuscript.")}</p> : null}
      {view.entities.length ? <details className="section-definitions"><summary>{t("Definitions in this section (")}{view.entities.length})</summary><ul>{view.entities.map((e) => <li key={e.id}><a href={hrefFor('entity', e.id)}>{e.name}</a> <span className="muted">{t(kindLabel(e.kind))}</span></li>)}</ul></details> : null}
      <Claims nodeId={view.node.id} />
      <footer className="pager">
        {view.prev ? <a href={hrefFor('read', view.prev)}>{t("Previous section")}</a> : <span />}
        <a href={hrefFor('receipt', view.node.id)}>{t("Review record")}</a>
        {view.next ? <a href={hrefFor('read', view.next)}>{t("Next section")}</a> : <span />}
      </footer>
    </article>
    <aside className="review-panel" id="section-review" ref={reviewPanel} tabIndex={-1} hidden={!reviewOpen || focused}>
      <button type="button" className="quiet review-back" onClick={backToText}>{t("Back to text")}</button>
      <div className="tracking-tabs" role="group" aria-label={t("Side panel")}><button type="button" aria-pressed={panel === 'tracking'} onClick={() => setPanel('tracking')}>{t("Tracking")}</button><button type="button" aria-pressed={panel === 'review'} onClick={() => setPanel('review')}>{t("Section review")}</button></div>
      {panel === 'tracking' ? <TrackingPanel id={id} state={tracking} preferredSubject={view.entities.find((e) => tracking.data?.observations.some((o) => o.subjectId === e.id && o.evidence.nodeId === id))?.id} /> : <SectionReview id={id} segments={view.segments} onQuote={showQuote} state={review} />}
    </aside>
  </div>;
}
