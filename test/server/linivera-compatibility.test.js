import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tempDir } from '../support/fixtures.js';

// Both commands must describe the same protocol and reopen a folder made with the old command.
test('Linivera and legacy Folio entry points share tool schemas and persisted work', async (t) => {
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const root = join(await tempDir('linivera-compat-'), 'work');
  let previousStatus;
  let previousSchemas;
  for (const prefix of ['folio', 'linivera']) {
    const client = new Client({ name: 'synthetic-rename-host', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: [fileURLToPath(new URL(`../../bin/${prefix}-mcp.js`, import.meta.url))], stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    t.after(() => client.close());
    await client.connect(transport);
    assert.deepEqual(client.getServerVersion(), { name: 'linivera', version: manifest.version });
    const { tools } = await client.listTools();
    const schemas = tools.map(({ name, inputSchema, outputSchema }) => ({ name, inputSchema, outputSchema }));
    if (previousSchemas) assert.deepEqual(schemas, previousSchemas);
    previousSchemas = schemas;
    assert.ok(tools.some(({ name }) => name === 'folio_init'));
    assert.ok(tools.every(({ name }) => name.startsWith('folio_')));
    async function call(name, args) {
      const response = await client.callTool({ name, arguments: { root, ...args } });
      assert.equal(response.isError ?? false, false);
      return JSON.parse(response.content[0].text);
    }
    if (prefix === 'folio') await call('folio_init', { title: 'Synthetic legacy work', preset: 'scene' });
    const status = await call('folio_status', {});
    if (previousStatus) assert.deepEqual(status, previousStatus);
    previousStatus = status;
    assert.equal(stderr, '');
    await client.close();
  }
});
