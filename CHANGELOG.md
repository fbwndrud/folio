# Changelog

## 0.1.2 — 2026-10-11

Fixes manuscript-language metadata in Studio exports and the API authentication guide.

- New works can save their manuscript language through `folio_init`; Studio Web/EPUB downloads use it. Existing works keep their export defaults unless the author sets a language.
- Corrected the documented Studio authentication header to the compatible `X-Folio-Token`.

## 0.1.1 — 2026-10-11

- Studio reading-edition selector for declared translations, revisions and summaries.
- Selected text, section receipts, publication preview and Web/EPUB downloads stay together.
- Portable review copies include edition-specific text, receipts and inline images.
- Missing edition text never falls back to the original; changed source and term maps warn on export.
- Updated English Studio collection and translation bundle are separate release assets; original 0.1.0 files are unchanged.

## 0.1.0 — 2026-10-11

First public release for local use.

- stdio MCP tools for structured writing, resources, image records and custom tracking.
- Korean/English Studio with Manuscript, Review and Publish views.
- Web ZIP, EPUB and read-only Studio exports.
- Optional local multimodal vector retrieval through a separate, pinned Google model runtime.
- Prepared engine tarball and five separately downloadable work examples.
- Revision-bound checks, append-only records and explicit author approval.

Release preparation fixed example output isolation and failure preservation,
private-path detection in escaped JSON, bundled third-party notices and links
in installed documentation. The first-use instructions now leave an example
you can open, and English/Korean READMEs are separate.

This is an early release. It provides no hosted service, authentication or
collaborative editor. Same-host reviews remain self-review; examples disclose
simulated or pending approval. See docs/compatibility.md and docs/operations.md
for tested environments and recovery limits.
