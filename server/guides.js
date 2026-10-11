import { readdir, readFile } from 'node:fs/promises';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const skill = new URL('../skill/folio/', import.meta.url);
const references = (await readdir(new URL('references/', skill))).filter(name => /^[a-z0-9-]+\.md$/.test(name));
const guides = new Map([
  ['linivera://guides/getting-started', { name: 'Getting started (English)', file: new URL('../docs/getting-started.en.md', import.meta.url) }],
  ['linivera://guides/skill', { name: 'Detailed workflow (Korean)', file: new URL('SKILL.md', skill) }],
 ]);
for (const name of references) guides.set(`linivera://guides/${name.slice(0, -3)}`, { name: `Workflow reference: ${name.slice(0, -3)}`, file: new URL(`references/${name}`, skill) });

/** Only bundled, allowlisted instructions; never work data or caller-selected file paths. */
export function listGuides() {
  return { resources: [...guides].map(([uri, guide]) => ({ uri, name: guide.name, mimeType: 'text/markdown' })) };
}
export async function readGuide(uri) {
  const guide = guides.get(uri);
  if (!guide) throw new McpError(ErrorCode.InvalidParams, 'Unknown Linivera guide URI');
  return { contents: [{ uri, mimeType: 'text/markdown', text: await readFile(guide.file, 'utf8') }] };
}
