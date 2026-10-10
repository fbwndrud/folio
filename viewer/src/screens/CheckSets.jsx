import { useT } from '../i18n/context.jsx';
import { useState } from 'react';
import { SEVERITY_LABELS, stepLabel, kindLabel, readable } from '../lib/labels.js';
import { checkTitle, setTitle, setDescription } from '../lib/check-labels.js';
import { useLoad } from '../api-context.jsx';
import { LoadState } from '../components/Status.jsx';

/** Read-only check selection; required checks retain their separate locked state. */
export function CheckSets() {
  const [state] = useLoad('/api/check-sets');
  return state.data ? <CheckGroupsContent data={state.data} /> : <LoadState state={state} />;
}
export function CheckGroupsContent({ data }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const { sets, recommended, checks, chosenBy } = data;
  const reasons = new Map(recommended.map((r) => [r.setId, r.reasons.map((x) => x.value ? `${t(readable(x.kind))}: ${t(readable(x.value))}` : t(readable(x.kind))).join(', ')]));
  const search = query.trim().toLocaleLowerCase();
  const matches = (...values) => !search || values.join(' ').toLocaleLowerCase().includes(search);
  const shownSets = sets.filter((s) => matches(setTitle(s.id, s.title, t), setDescription(s.id, s.description, t)));
  const shownChecks = checks.filter((c) => matches(checkTitle(c.id, c.title, t), t(stepLabel(c.stage)), c.sets.map((id) => setTitle(id, sets.find((s) => s.id === id)?.title, t)).join(' ')));
  return <section className="check-groups-screen"><p className="eyebrow">{t("Review · Check groups")}</p><h1>{t("Check groups")}</h1>
    <p>{chosenBy === 'work.yaml' ? t("Groups selected for this work") : t("Default check groups")}{t(". Ask your AI assistant to change the selected groups. Required checks always remain active.")}</p>
    <label className="catalog-search">{t("Find a group or check")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <h2>{t("Available groups")}</h2><p className="muted">{sets.filter((s) => s.selected).length} {t("selected ·")} {sets.length} {t("available")}</p>
    {shownSets.length ? <div className="catalog-grid">{shownSets.map((s) => <article className="catalog-card" key={s.id}><header className="check-card-heading"><h3>{setTitle(s.id, s.title, t)}</h3><span className={s.selected ? 'badge badge-committed' : 'badge'}>{s.selected ? t("Selected") : t("Not selected")}</span></header>
      <p>{setDescription(s.id, s.description, t)}</p><p className="muted">{s.checks.length} {t("checks")}{s.default ? t(" · Suggested by default") : ''}</p>
      {reasons.get(s.id) ? <p><strong>{t("Recommended because:")}</strong> {reasons.get(s.id)}</p> : null}
    </article>)}</div> : <p>{t("No groups match this search.")}</p>}
    <h2>{t("Active checks")}</h2><p className="muted">{checks.length} {t("checks run under the current settings.")}</p>
    {shownChecks.length ? <div className="catalog-grid">{shownChecks.map((c) => <article className="catalog-card" key={c.id}><h3>{checkTitle(c.id, c.title, t)}</h3>
      <p className={c.locked ? 'lock' : 'muted'}>{c.locked ? t("🔒 Always required") : t("Selected by group")}{c.experimental ? t(" · Experimental") : ''}</p>
      <dl className="structured-fields"><div><dt>{t("Step")}</dt><dd>{t(stepLabel(c.stage))} · {t(kindLabel(c.tier))}</dd></div><div><dt>{t("Impact")}</dt><dd>{t(SEVERITY_LABELS[c.severity]) ?? readable(c.severity)}</dd></div>
        <div><dt>{t("Group")}</dt><dd>{c.locked ? t("Always required") : c.sets.map((id) => setTitle(id, sets.find((s) => s.id === id)?.title, t)).join(', ')}</dd></div></dl>
    </article>)}</div> : <p>{t("No active checks match this search.")}</p>}
  </section>;
}
