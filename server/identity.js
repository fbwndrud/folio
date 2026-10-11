import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** The installed manifest is the authority for the MCP identity, including after a rename. */
export const SERVER_INFO = Object.freeze({ name: manifest.name, version: manifest.version });

export const SERVER_INSTRUCTIONS = `${manifest.name} manages local resources, revisions, evidence and review records. `
  + 'The host writes text, generates images and runs model inference. Use user-confirmed absolute work folders. '
  + 'Load skill/folio/SKILL.md and its references through the host instruction mechanism. '
  + 'Relay actual user decisions; do not turn self-review or an example approval into author acceptance. '
  + 'Studio supports Korean and English UI independently of Reading edition. Reading edition selects '
  + 'the original or a declared translation/revision/summary for section text, section review records and publication; '
  + 'settings and tracking remain tied to the original. Tool IDs retain the folio_* prefix for compatibility.';
