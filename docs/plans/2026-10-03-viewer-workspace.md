# Viewer workspace

## Scope and design

This lane owns viewer UI only. The concurrent multilingual lane owns prompt and
language-policy changes. Preserve existing backend contracts and mandatory locks.

Primary job: read a structured manuscript and understand its review evidence.
Use a quiet editorial workspace rather than repeated dashboard cards.

Palette: paper #FCFDFE, ink #1E293B, secondary #526170, action #3157C8,
attention #9A6600, approved #237450. Dark counterparts preserve readable contrast.
UI type: locally available humanist sans-serif (Noto Sans, system fallback).
Manuscript type: Noto Serif/Georgia with local script fallbacks, adjustable
18–24px, 1.6–2.0 line height, 48–76ch measure. No external font requests.
Left align controls and manuscript. Reserve a vertical progress track for the
outline; other decoration must serve hierarchy or interaction.

```text
Work title    Read  Review  Library  Settings       Close viewer
              Contextual page links
Contents      Manuscript and reading controls       Section review
Search        Title / status / location             Freshness / provenance
State filter  Text / images / focused reading       Findings / quoted evidence
Chapter tree  Previous / next section               Full review record
```

Review against brief: the chapter track encodes reading order and status rather
than ornamental numbering. The manuscript has a restrained reading measure;
tables and graphs use the available width. Mobile panels open in document flow,
without covering manuscript or requiring a modal focus trap.

## Implementation

- Four navigation groups retaining every existing destination and route.
- Collapsible searchable outline, ancestor-preserving filters and current location.
- Overview with honest progress and actionable attention/next-reading links.
- Persistent validated reading preferences and focus mode; shared appearance
  settings usable from Settings. Keep UI English and manuscript text unchanged.
- Section review alongside reader: freshness, import origin, self-review,
  overrides, unsupported findings and checked steps. Link quotes to verbatim text.
- Review detail summary first; step history and fingerprints in disclosure.
- Keyboard focus, skip link, responsive layout, reduced motion, empty/error states.
- No new manuscript approval/finalization writes, language engine changes, or
  variant API invented for a UI feature.

## Validation

Synthetic fixtures only. Test filtering, next action, preference validation,
review freshness/provenance and cross-segment quote matching. Build viewer and
run root checks. Inspect real browser at desktop and mobile widths, reading
controls, quote navigation, focus mode, menus and static export behavior.

## Integration

Work on `codex/viewer-workspace`; commit verified result. No remote is configured,
so do not claim push or publication. Coordinate via file boundaries rather than
modifying the multilingual lane's worktree.

## Results

- Root check: lint, typecheck and 1,335 tests passed; viewer tests: 30 passed.
- Production build passed. Existing lazy graph chunk warning remains (1.61 MB
  minified, 502 KB gzip); graphs load only when opened.
- Browser inspection at 1280x720 and 320x740: no mobile document overflow;
  search/filter, draft empty state, reading preferences across reload, dark mode,
  focus mode with Escape, quote highlight/focus and mobile review navigation passed.
- Edited a synthetic manuscript after finalization: Refresh view displayed the
  edited text and explicit outdated-review notices in outline, reader and panel.
- Exported review view: text/quote navigation and full review disclosures work;
  mutation buttons are absent and writing-step settings remain read only.
- Browser error logs were empty. Synthetic manuscripts and exported test files
  stayed outside the repository. Only browser preferences are persisted by UI.

Scope limits: approvals and manuscript finalization remain AI-assisted backend
workflows. Variant comparison needs a separate viewer projection before adding a
screen. Prompt/authoring language policy is owned by the other lane. Refresh is
explicit; this change does not claim automatic live synchronization.
