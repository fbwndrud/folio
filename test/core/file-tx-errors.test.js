import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFilesTx } from '../../core/util/file-tx.js';
import { copyFixture } from '../support/fixtures.js';
import { sha256 } from '../../core/util/hash.js';

const A = 'tree/01-arc-awakening/01-ep-001.md';

async function plan(root, edits) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const read = (p) => readFile(join(root, p), 'utf8');
  return Promise.all(Object.entries(edits).map(async ([path, fn]) => {
    const text = await read(path);
    return { path, beforeHash: sha256(text), text: fn(text) };
  }));
}

test('C0: TX_FAILED details contain only the error code, never the path or message', async () => {
  const root = await copyFixture('serial-2level');
  const files = await plan(root, { [A]: (t) => `${t}x` });
  // 코드와, 경로가 든 메시지를 가진 오류를 주입한다
  const err = Object.assign(new Error(`EACCES: permission denied, open '${root}/tree/02-arc-hunt/02-ep-005.md.tmp'`), { code: 'EACCES' });
  await assert.rejects(
    writeFilesTx(root, files, { hooks: { beforeWrite: () => { throw err; } } }),
    (e) => e.code === 'TX_FAILED' && e.details.cause === 'EACCES' && !e.message.includes(root) && !e.message.includes('permission')
  );
});
