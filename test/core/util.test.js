import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256, canonicalJson, shortRev } from '../../core/util/hash.js';
import { writeFileAtomic, readTextOrNull, listEntries } from '../../core/util/fs.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { parseDoc, serializeDoc } from '../../core/store/frontmatter.js';
import { tempDir } from '../support/fixtures.js';

test('sha256 returns a prefixed hex digest for text and bytes', () => {
  assert.match(sha256('a'), /^sha256:[0-9a-f]{64}$/);
  assert.equal(sha256('a'), sha256(Buffer.from('a')));
  assert.notEqual(sha256('a'), sha256('b'));
});

test('canonicalJson sorts keys at every depth and drops undefined', () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } }),
    '{"a":{"d":[2,{"y":2,"z":1}]},"b":1}',
  );
  assert.equal(canonicalJson(null), 'null');
});

test('shortRev keeps the first 12 hex characters', () => {
  assert.equal(shortRev(sha256('a')).length, 12);
});

test('yaml helpers parse empty documents and write without line folding', () => {
  assert.deepEqual(parseYaml(''), {});
  const long = 'x'.repeat(200);
  assert.equal(stringifyYaml({ a: long }), `a: ${long}\n`);
});

test('parseDoc splits frontmatter and body and serializeDoc restores the bytes', () => {
  const text = '---\nid: a\nlevel: scene\n---\n본문\n';
  const doc = parseDoc(text);
  assert.deepEqual(doc.data, { id: 'a', level: 'scene' });
  assert.equal(doc.body, '본문\n');
  assert.equal(serializeDoc(doc), text);
});

test('parseDoc without frontmatter keeps the whole text as body', () => {
  assert.deepEqual(parseDoc('그냥 글\n'), { data: {}, body: '그냥 글\n' });
});

test('parseDoc rejects an unclosed fence', () => {
  assert.throws(() => parseDoc('---\nid: a\n'), { code: 'FRONTMATTER_UNCLOSED' });
});

test('parseDoc accepts CRLF fences and YAML but returns the body byte-for-byte', () => {
  const doc = parseDoc('---\r\nid: a\r\nlevel: scene\r\n---\r\n본문\r\n둘째 줄\r\n');
  assert.deepEqual(doc.data, { id: 'a', level: 'scene' });
  assert.equal(doc.body, '본문\r\n둘째 줄\r\n');
  assert.deepEqual(parseDoc('---\r\n---\r\nb'), { data: {}, body: 'b' });
  assert.throws(() => parseDoc('---\r\nid: a\r\n'), { code: 'FRONTMATTER_UNCLOSED' });
});

test('serializeDoc always writes LF fences, and LF files still round-trip exactly', () => {
  assert.equal(serializeDoc({ data: { id: 'a' }, body: 'x\r\n' }), '---\nid: a\n---\nx\r\n');
  const text = '---\nid: a\n---\n\n본문\n\n';
  assert.equal(serializeDoc(parseDoc(text)), text);
});

test('file helpers write atomically, read missing files as null and list sorted entries', async () => {
  const dir = await tempDir('folio-util-');
  await writeFileAtomic(join(dir, 'deep', 'x.txt'), 'hi');
  assert.equal(await readTextOrNull(join(dir, 'deep', 'x.txt')), 'hi');
  assert.equal(await readTextOrNull(join(dir, 'missing.txt')), null);
  await mkdir(join(dir, 'list'));
  for (const name of ['b.md', 'a.md', '.hidden', '10-x.md', '02-y.md']) await writeFile(join(dir, 'list', name), '');
  assert.deepEqual((await listEntries(join(dir, 'list'))).map((e) => e.name), ['02-y.md', '10-x.md', 'a.md', 'b.md']);
  assert.deepEqual(await listEntries(join(dir, 'nope')), []);
});
