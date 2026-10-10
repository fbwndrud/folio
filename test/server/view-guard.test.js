import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** server/view 가 부를 수 있는 코어: 조회 층 입구와 오류 형식뿐. 쓰기 경로(단계 모드)는 core/view 안에서만 간다. */
const ALLOWED_CORE = ['core/view/index.js', 'core/errors.js'];

test('server/view reaches the core only through core/view/index.js', async () => {
  const offenders = [];
  let files = 0;
  for (const entry of await readdir('server/view')) {
    if (!entry.endsWith('.js')) continue;
    files += 1;
    const file = join('server/view', entry);
    const text = await readFile(file, 'utf8');
    for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (!spec.startsWith('.')) continue;
      const target = relative(process.cwd(), resolve(dirname(file), spec)).split(sep).join('/');
      if (target.startsWith('core/') && !ALLOWED_CORE.includes(target)) offenders.push(`${file} -> ${target}`);
    }
  }
  assert.ok(files > 0);
  assert.deepEqual(offenders, []);
});
