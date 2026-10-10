import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { markdownDestinations, missingPackedLinks, verifyPackedMarkdownLinks } from '../../scripts/package-links.js';
import { tempDir } from '../support/fixtures.js';

test('packed links use tarball contents rather than files excluded from the package', async (t) => {
  const root = await tempDir('folio-package-links-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs', 'plans'), { recursive: true });
  await writeFile(join(root, 'README.md'), '[Install](docs/connect.md)');
  await writeFile(join(root, 'docs', 'connect.md'), '[Evidence](plans/private.md)');
  await writeFile(join(root, 'docs', 'plans', 'private.md'), 'Exists only in the checkout');
  const files = ['README.md', 'docs/connect.md'];
  await assert.rejects(verifyPackedMarkdownLinks({ root, files }), /docs\/connect.md: plans\/private.md/);
  await writeFile(join(root, 'docs', 'connect.md'), '[Evidence](https://github.com/fbwndrud/folio/blob/v0.1.0/docs/plans/private.md)');
  assert.deepEqual(await verifyPackedMarkdownLinks({ root, files }), { documents: 2, relativeLinksVerified: true });
});

test('references, images, encoded names, anchors and directory links are checked without fetching URLs', () => {
  const files = new Set(['docs/start.md', 'docs/Guide (new).md', 'assets/cover.png', 'skill/folio/SKILL.md']);
  const markdown = '[Guide](<Guide (new).md#first>)\n![Cover][cover]\n[cover]: ../assets/cover.png "Cover"\n[Skill](../skill/folio/)\n[Encoded](Guide%20%28new%29.md?mode=read#first)\n[Local](#first)\n[Email](mailto:test@example.com)\n[Remote](https://example.com/missing)';
  assert.deepEqual(missingPackedLinks('docs/start.md', markdown, files), []);
  assert.deepEqual(missingPackedLinks('docs/start.md', '[Bad]: ../test/missing.js\n![Missing](../assets/missing.png)', files).map((f) => f.target), ['test/missing.js', 'assets/missing.png']);
});

test('escaped parentheses work; literal examples in code do not become download links', () => {
  const markdown = '[Guide](Guide\\(new\\).md)\n`[Literal](missing.md)`\n```md\n[Example](missing.md)\n```\n~~~\n[Other example](missing.md)\n~~~';
  assert.deepEqual(markdownDestinations(markdown), ['Guide(new).md']);
  assert.deepEqual(missingPackedLinks('docs/start.md', markdown, new Set(['docs/Guide(new).md'])), []);
  assert.equal(missingPackedLinks('docs/start.md', '[Invalid](bad%XX.md)', new Set()).length, 1);
});
