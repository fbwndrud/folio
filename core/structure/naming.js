import { join } from 'node:path';
import { safeRename } from './fs-guard.js';

const PREFIX = /^\d+-/;
const TEMP = /^~(?:add|wrap|move|renumber)-/;

/** 번호와(중간에 죽어 남은) 임시 접두어를 뗀 이름. 다음 번호 매기기에서 제 이름으로 돌아온다. */
export const baseName = (name) => name.replace(TEMP, '').replace(PREFIX, '');
export const entryName = (index, base, width = 2) => `${String(index + 1).padStart(width, '0')}-${base}`;

/**
 * 형제 항목 이름의 번호를 순서대로 다시 매긴다. 이름이 겹치지 않게 임시 이름을 거친다.
 * 임시 이름은 '~'로 시작해 숨겨지지 않으므로, 중간에 죽어도 노드를 잃지 않는다(순서만 흐트러짐).
 */
export async function renumber(dir, entries) {
  const width = Math.max(2, String(entries.length).length);
  const plan = entries.map((entry, index) => ({ from: entry.name, to: entryName(index, entry.base, width) })).filter((p) => p.from !== p.to);
  for (const p of plan) await safeRename(join(dir, p.from), join(dir, `~renumber-${p.from}`));
  for (const p of plan) await safeRename(join(dir, `~renumber-${p.from}`), join(dir, p.to));
}
