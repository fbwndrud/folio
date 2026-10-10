# User-facing language

Folio offers Korean and English product labels, selected by the user in the viewer header. English labels are stable translation keys; Korean translations live in `viewer/src/i18n/`. The saved browser preference takes priority over supported browser languages, with English as the fallback. A section can be saved as a draft before it is reviewed, so **Finalize** means recording the reviewed and approved version; it is more specific than Save.

| Internal identifier | Product label | Meaning |
|---|---|---|
| commit / committed | Finalize / Finalized | Record the reviewed, approved version. |
| recommit | Review and finalize changes | Check the edited text and approve the new version. |
| receipt | Review record | The checks, decisions and text version recorded together. |
| recheck | Review again | Run checks without rewriting the text. |
| stale | Review needed | Relevant information or rules changed. |
| drift | Edited since review | The file differs from the reviewed version. |
| node | Section | A piece of the work, including a group or a writing section. |
| entity | Definition | A character, object, concept, term or story thread. |
| ledger | Activity record | The recorded sequence of events and decisions. |
| hash / digest | Content fingerprint | A value used to detect changed content. |
| hard | Must fix | Approval cannot bypass this active issue. |
| block | Needs your decision | Accepting the issue requires a recorded reason. |
| advisory | Suggestion | Advice that does not trigger automatic rewriting. |
| needs_model | Waiting for AI | The AI assistant needs to answer. |
| needs_user | Waiting for your decision | The author needs to decide. |

Use these labels in buttons, statuses and explanations, in the user's conversation language when appropriate. Keep file formats, tool names, error codes and API values unchanged. Put exact codes and diagnostic messages in technical details when needed for troubleshooting. User-authored text, titles and custom rules retain their original language.

## Viewer language contract

The language selector works in live and exported review views. Changing language updates product labels and `html[lang]` without rewriting manuscript content, user titles, quotes, custom rule names, file paths, or API identifiers. Reading preferences and language preferences are independent. To add a language, register it in `locale.js`, add its message catalog, and extend `translate.js`. Keep interpolation fields identical and run viewer tests.
