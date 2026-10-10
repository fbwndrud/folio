import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFilesTx } from '../../core/util/file-tx.js';
import { sha256 } from '../../core/util/hash.js';

const [root, scenario] = process.argv.slice(2);
/** 시나리오 → 쓸 파일(fixture 별). 두 파일을 쓴 뒤 세 번째 앞에서 SIGKILL 로 죽는다. */
const PATHS = {
  'kill-after-second-write': ['tree/01-arc-awakening/01-ep-001.md', 'tree/01-arc-awakening/02-ep-002.md', 'entities/character/hana.md'],
  'kill-after-second-write-book': ['tree/01-part-basics/02-chapter-energy/01-atp.md', 'tree/01-part-basics/01-chapter-cells/02-membranes.md', 'entities/term/atp.md'],
};
const paths = PATHS[scenario];
if (!paths) throw new Error(`unknown scenario ${scenario}`);
const files = await Promise.all(paths.map(async (path) => {
  const text = await readFile(join(root, path), 'utf8');
  return { path, beforeHash: sha256(text), text: `${text}!` };
}));
await writeFilesTx(root, files, { hooks: { beforeWrite: (i) => { if (i === 2) process.kill(process.pid, 'SIGKILL'); } } });
