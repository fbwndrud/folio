import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runExamples } from '../../examples/run.js';
import { readZipEntries } from '../../examples/production-verify.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { startViewServer } from '../../server/view/http-server.js';
import { bundlePublication } from '../../core/export/export-work.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { tempDir, copyFixture, fixturePath, fakePacks } from '../support/fixtures.js';
import { sourceSnapshot } from '../support/export-work.js';

test('the authentication header documented in SECURITY.md works against the actual server', async t => {
  const root = await copyFixture('serial-2level');
  const server = await startViewServer({ root, packs: fakePacks(), distDir: fixturePath('viewer-dist') });
  t.after(() => server.close());
  const security = await readFile(new URL('../../SECURITY.md', import.meta.url), 'utf8');
  const header = security.match(/`(X-[A-Za-z-]+-Token)`/)?.[1];
  assert.ok(header, 'security documentation must name the API authentication header');
  const response = await fetch(new URL('/api/work', server.url), { headers: { [header]: server.token } });
  assert.equal(response.status, 200);
  assert.equal((await fetch(new URL('/api/work', server.url))).status, 401);
});

for (const language of ['en', 'ko']) {
  test(`${language} MCP example keeps its publication language through default Studio Web and EPUB downloads`, async t => {
    const out = join(await tempDir('linivera-publication-language-'), 'example');
    const [{ root }] = await runExamples({ names: ['story'], language, out });
    const before = await sourceSnapshot(root);
    const server = await startViewServer({ root, packs: await loadBuiltinPacks(), distDir: fixturePath('viewer-dist') });
    t.after(() => server.close());
    const request = async path => {
      const response = await fetch(new URL(path, server.url), { headers: { 'x-folio-token': server.token } });
      assert.equal(response.status, 200, path); return response;
    };
    for (const prefix of ['/api/publication', '/api/variants/main/publication']) {
      assert.equal((await (await request(prefix)).json()).language, language);
      for (const format of ['web', 'epub']) {
        const entries = readZipEntries(Buffer.from(await (await request(`${prefix}/${format}`)).arrayBuffer()));
        const book = entries.get(format === 'web' ? 'index.html' : 'OEBPS/book.xhtml').toString();
        assert.match(book, new RegExp(`lang="${language}"`));
        assert.match(book, language === 'en' ? /The library had closed/ : /우편함/);
        if (format === 'epub') assert.match(entries.get('OEBPS/package.opf').toString(), new RegExp(`<dc:language>${language}</dc:language>`));
        else assert.equal(JSON.parse(entries.get('manifest.json')).language, language);
      }
    }
    assert.equal(parseYaml(await readFile(join(root, 'work.yaml'), 'utf8')).language, language);
    const catalog = await (await request('/api/variants')).json();
    assert.equal(catalog.editions[0].lang, language);
    assert.deepEqual(await sourceSnapshot(root), before, 'Studio reads and downloads preserve every source and ledger byte');
    const override = await bundlePublication({ root, language: 'fr' });
    assert.equal(override.manifest.language, 'fr');
    assert.match(override.files.get('index.html').toString(), /lang="fr"/);
    const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
    delete config.language;
    await writeFile(join(root, 'work.yaml'), stringifyYaml(config));
    const legacyBefore = await sourceSnapshot(root);
    assert.equal((await (await request('/api/publication')).json()).language, 'ko');
    assert.deepEqual(await sourceSnapshot(root), legacyBefore, 'old works are not automatically migrated');
  });
}
