# Folio

[한국어](README.ko.md) · [English examples](https://github.com/fbwndrud/folio/releases/download/v0.1.0/folio-english-example-library.zip) · [Releases](https://github.com/fbwndrud/folio/releases/tag/v0.1.0) · [Getting started (한국어)](docs/writing-guide.md) · [Report a bug](https://github.com/fbwndrud/folio/issues)

Folio keeps the manuscripts, images and sources you work on with an AI assistant, along with their revisions and review history. Open Studio to read the work, follow its references and see what needs another check. Export a reading edition as a website or EPUB.

**v0.1.0 is an early release for local use.** You need an AI application that supports stdio MCP to write with Folio. Your AI application writes and, if its tools support it, generates images; Folio manages the files and records. Studio offers Korean and English.

![Studio showing a synthetic example](https://github.com/fbwndrud/folio/releases/download/v0.1.0/folio-studio-preview.jpg)

*The screenshot uses a fixed synthetic example with simulated model responses and approval.*

## Try it

To read an English work first, [download the English example library](https://github.com/fbwndrud/folio/releases/download/v0.1.0/folio-english-example-library.zip). It includes a beginner guide and four other examples. The small fixed demo below uses Korean text.

Use Node.js 24. Supported versions are 22.13+, 24 and 26 within their respective major versions. From a source checkout:

```sh
git clone https://github.com/fbwndrud/folio.git
cd folio
npm run setup
node examples/run.js story --out ./my-first-example
npm run viewer -- "./my-first-example/story"
```

Open the address printed in the terminal. The example leaves a manuscript and its review records in `my-first-example/story`. It uses fixed responses and simulated approval, so no AI account or model download is needed for this demonstration. Stop the viewer with Ctrl+C. Use a new output folder if you repeat the example.

A prepared `folio-0.1.0.tgz` is also available in the [GitHub release](https://github.com/fbwndrud/folio/releases/tag/v0.1.0). It includes the built Studio. Follow the [installation guide (한국어)](docs/production.md) to install it without the development tools. Folio is not published on npm.

## Start your own work

Register `node /absolute/path/to/folio/bin/folio-mcp.js` as a stdio MCP server in your AI application. Load `skill/folio/` through its skill system, or provide those instructions using the application's supported instruction mechanism. The [connection guide (한국어)](docs/connect.md) explains how to check the connection and choose a work folder.

Then ask your assistant:

> Help me write a short story with Folio. First confirm a new folder for the work, then ask about my readers, main character and tone. Keep the agreed setting with the manuscript and show me the draft in Studio. I'll decide whether to accept it.

Folio records what was checked and which version you accepted. If a relevant source, setting or image changes, it flags the work that needs another review. A blocking finding prevents acceptance; an advisory does not rewrite your text. A review by the same AI host is marked as self-review.

## What you can do

| Task | What Folio provides |
|---|---|
| Write a structured work | An outline, step-by-step drafting, checks and author decisions; built-in packs for stories, guides and illustrated books |
| Keep track of details | Characters, relationships, promises and custom tracking rules, with references back to the work |
| Manage material | Original resources, immutable revisions, derived results and metadata, with keyword and optional local text/image vector retrieval |
| Manage illustrations | Image IDs, file hashes, versions, review status and usage locations; generation runs in your AI application |
| Inspect the work | Manuscript, Review and Publish views; changes, evidence, relationships and tracking timelines |
| Share a reading copy | Web ZIP, EPUB and a read-only Studio snapshot; PDF through browser printing |

Manuscripts are Markdown and settings are YAML. Activity and decisions are kept in an append-only ledger inside the work folder. Back up the whole folder to keep the work and its records together.

Optional [vector retrieval (한국어)](docs/embeddings.md) requires a separate Python runtime and pinned Google multimodal model weights. They are not included in the installation. A model's interpretation and a recorded check can still be wrong; an accepted version is your decision, not a guarantee of factual accuracy.

## Open a complete example

Choose an [English example library](https://github.com/fbwndrud/folio/releases/download/v0.1.0/folio-english-example-library.zip) or the [Korean example library](https://github.com/fbwndrud/folio/releases/download/v0.1.0/folio-example-library.zip). Both are separate downloads from the [v0.1.0 release](https://github.com/fbwndrud/folio/releases/tag/v0.1.0).

The English library contains four new works—a short story, a picture-book manuscript with two illustrations, a practical beginner guide and a four-chapter story—plus an English translation of the Korean short story. The four-chapter story is a 2,657-word structural example, not a full-length novella. The Korean library includes a longer story and a research-book draft.

Each bundle contains a Folio work copy, images where used, Web/EPUB editions and a read-only Studio. Extract a ZIP, read its English or Korean README and run `node serve.mjs` to open the collection. Copy the entire example folder before editing. See [example instructions](docs/examples.md#english).

The translation keeps its Korean original and source-bound English variant. Its Web and EPUB editions are English; Studio currently shows the original main manuscript and has no variant reader selector.

English examples use simulated approval and same-host review. The Korean research book remains a draft awaiting author approval. These examples show the workflow and its outputs, not an independent assessment of writing quality. Generated works are release downloads; the source and engine package contain only small synthetic fixtures.

## Before relying on it

Folio runs on your machine. It does not provide a hosted service, authentication, collaborative editing or an automatic publishing service. The MCP server accepts absolute work paths; your AI application must restrict access to folders you choose. Studio and the example preview server bind to loopback.

Keep backups before working on important material. The [operations guide (한국어)](docs/operations.md) covers diagnosis, restoration and interrupted writes. The [compatibility guide (한국어)](docs/compatibility.md) separates tested environments from unsupported assumptions. AI subscriptions and generation costs belong to the application you connect.

## Read more and contribute

- **Writing:** [First work](docs/writing-guide.md), [images](docs/assets.md), [sources and resources](docs/resources.md), [Studio](docs/studio.md), [exports](docs/export.md) — 한국어.
- **Setup and recovery:** [Connect](docs/connect.md), [install](docs/production.md), [operations](docs/operations.md) — 한국어.
- **Development:** [Contributing](CONTRIBUTING.md), [testing](docs/testing.md), [security](SECURITY.md) — 한국어. Run `npm run check` and the checks listed in the contribution guide. Use synthetic reproductions in issues; do not upload private works or credentials.

Folio's code is [Apache-2.0](LICENSE). The separately released example manuscripts, original images and notes are CC0-1.0, with third-party quotes, code and trademarks excluded. Studio bundles include their third-party licenses and source references in `THIRD-PARTY-NOTICES.txt`; see [NOTICE](NOTICE).
