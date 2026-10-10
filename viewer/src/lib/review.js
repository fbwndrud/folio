/** Latest recheck supplements the finalized record; it does not finalize edits. */
export function reviewSummary(view) {
  if (!view?.ledger?.ok) return { state: 'unverified', label: 'Records could not be verified', steps: [], findings: [], unsupported: [], selfReview: false };
  const steps = view.recheck?.steps ?? view.receipt?.steps ?? [];
  const findings = steps.flatMap((step) => (step.checks ?? []).flatMap((check) =>
    (check.findings ?? []).map((finding) => ({ ...finding, checkId: check.checkId, stepId: step.id }))));
  const unsupported = steps.flatMap((step) => (step.checks ?? []).flatMap((check) =>
    (check.unsupported ?? []).map((finding) => ({ ...finding, checkId: check.checkId }))));
  const selfReview = [...steps, ...(view.receipt?.steps ?? [])].some((step) => step.reviewer?.sameHost || step.checks?.some((check) => check.reviewer?.sameHost));
  let state = 'recorded', label = 'Finalized review record';
  if (!view.receipt) { state = 'unreviewed'; label = view.imported ? 'Imported, not finalized' : 'No finalized review record'; }
  else if (view.drift) { state = 'drift'; label = 'Edited since review'; }
  else if (view.stale === null) { state = 'unknown'; label = 'Current review status unavailable'; }
  else if (view.stale?.length) { state = 'stale'; label = 'Review needed'; }
  else if (view.recheck?.hard || findings.some((f) => f.severity === 'hard' || f.severity === 'block') || steps.some((s) => s.status === 'failed' || s.status === 'error')) {
    state = 'attention'; label = 'Review needs attention';
  }
  return { state, label, steps, findings, unsupported, selfReview };
}

/** Map NFC matches back to original characters, including combining marks and segment boundaries. */
export function quoteRange(segments, quote) {
  if (typeof quote !== 'string' || quote.trim().length < 2) return null;
  const text = segments.map((s) => s.text ?? `![[asset:${s.asset}]]`).join('');
  const pieces = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
  let normalized = '';
  const starts = [], ends = [];
  for (const { segment, index } of pieces) {
    const nfc = segment.normalize('NFC');
    for (let i = 0; i < nfc.length; i++) { starts.push(index); ends.push(index + segment.length); }
    normalized += nfc;
  }
  const needle = quote.normalize('NFC');
  const start = normalized.indexOf(needle);
  if (start < 0) return null;
  const range = { start: starts[start], end: ends[start + needle.length - 1], count: normalized.split(needle).length - 1 };
  let offset = 0, visible = false;
  for (const segment of segments) {
    const length = (segment.text ?? `![[asset:${segment.asset}]]`).length;
    if (segment.text && !segment.anchor && !segment.blockRef && !(segment.footnoteRef && segment.number)
      && offset < range.end && offset + length > range.start) visible = true;
    offset += length;
  }
  return visible ? range : null;
}

export function highlightedParts(text, offset, range) {
  if (!range || offset >= range.end || offset + text.length <= range.start) return [{ text, marked: false }];
  const start = Math.max(0, range.start - offset), end = Math.min(text.length, range.end - offset);
  return [{ text: text.slice(0, start), marked: false }, { text: text.slice(start, end), marked: true },
    { text: text.slice(end), marked: false }].filter((part) => part.text);
}
