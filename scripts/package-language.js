import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readZipEntries } from '../examples/production-verify.js';

/** Test installed MCP-created originals through the default Studio downloads, without export overrides. */
export async function verifyInstalledPublicationLanguages(installed, sandbox) {
  const moduleAt = path => import(pathToFileURL(join(installed, path)).href);
  const { runExamples } = await moduleAt('examples/run.js');
  const { loadBuiltinPacks } = await moduleAt('packs/index.js');
  const { startViewServer } = await moduleAt('server/view/http-server.js');
  const packs = await loadBuiltinPacks();
  const verified = [];
  for (const language of ['en', 'ko']) {
    const [{ root }] = await runExamples({ names: ['story'], language, out: join(sandbox, `publication-${language}`) });
    const server = await startViewServer({ root, packs, distDir: join(installed, 'viewer/dist') });
    try {
      const request = async path => {
        const response = await fetch(new URL(path, server.url), { headers: { 'x-folio-token': server.token } });
        assert.equal(response.status, 200, path); return response;
      };
      assert.equal((await (await request('/api/publication')).json()).language, language);
      assert.equal((await (await request('/api/variants/main/publication')).json()).language, language);
      for (const format of ['web', 'epub']) {
        const files = readZipEntries(Buffer.from(await (await request(`/api/publication/${format}`)).arrayBuffer()));
        const book = files.get(format === 'web' ? 'index.html' : 'OEBPS/book.xhtml').toString();
        assert.match(book, new RegExp(`lang="${language}"`));
        assert.match(book, language === 'en' ? /The library had closed/ : /우편함/);
        if (format === 'epub') assert.match(files.get('OEBPS/package.opf').toString(), new RegExp(`<dc:language>${language}</dc:language>`));
        else assert.equal(JSON.parse(files.get('manifest.json')).language, language);
      }
      verified.push(language);
    } finally { await server.close(); }
  }
  return { verified: true, languages: verified, defaultStudioDownloads: ['web', 'epub'], simulatedApproval: true };
}
