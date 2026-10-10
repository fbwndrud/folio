import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSources } from '../../core/store/sources.js';
import { copyFixture, tempDir } from '../support/fixtures.js';

// C0: 하드 링크는 심볼릭 링크와 달리 O_NOFOLLOW 로 못 막는다. 이름이 둘 이상인 원본은 작품 밖 글과 같은 파일일 수 있어 거절한다.
test('readSources refuses a source original that is a hard link to a file out of the work', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.txt'), '작품 밖 글, 새면 안 된다.');
  await link(join(outside, 'secret.txt'), join(root, 'sources', 'leaked.txt'));
  await writeFile(join(root, 'sources', 'leaked.yaml'), 'id: leaked\nfile: leaked.txt\n');
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, [{ code: 'SOURCE_FILE_INVALID', id: 'leaked', file: 'leaked.txt' }]);
  assert.equal(sources.has('leaked'), false);
});

test('a source original with a single name still reads', async () => {
  const root = await copyFixture('knowledge-book');
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, []);
  assert.ok(sources.get('cell-notes').text.length > 0);
});
