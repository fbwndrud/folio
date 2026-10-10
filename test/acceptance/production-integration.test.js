import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { driveSynthetic, planFor, TEXT } from '../../examples/tracking-host.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { createFakeHost } from '../support/fake-host.js';
import { tempDir } from '../support/fixtures.js';

// The optional executable is only for verifying the same acceptance against a pre-merge tree.
test('one stdio installation serves editions, managed assets, tracking and selected resources', async (t) => {
  const dir = await tempDir('folio-production-');
  const worker = join(dir, 'synthetic-embedding-worker');
  await writeFile(worker, `#!${process.execPath}
let input = ''; process.stdin.on('data', b => input += b); process.stdin.on('end', () => {
  const r = JSON.parse(input);
  const profile = { model: 'google/embeddinggemma-2', modelRevision: r.revision, processorRevision: r.revision,
    processorConfig: { folioInputPolicy: { maxInputBytes: 8388608, maxInputs: 100, maxBatchBytes: 33554432 } }, runtime: { synthetic: 'fixture-only' }, dtype: 'float32', dimension: r.dimension,
    normalization: 'l2', prefixes: { document: '', query: '', media: '' } };
  process.stdout.write(JSON.stringify({ profile, vectors: r.inputs.map(() => [1, ...Array(r.dimension - 1).fill(0)]) }));
});
`, { mode: 0o700 });
  const client = new Client({ name: 'production-integration-fixture', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [process.env.FOLIO_INTEGRATION_BIN ?? join(import.meta.dirname, '../../bin/folio-mcp.js')], stderr: 'pipe', env: { ...process.env, FOLIO_EMBEDDING_PYTHON: worker } });
  await client.connect(transport);
  t.after(() => client.close());
  const listed = await client.listTools();
  for (const name of ['folio_view', 'folio_export', 'folio_image', 'folio_assets', 'folio_tracking', 'folio_resources', 'folio_embeddings']) {
    assert.ok(listed.tools.some((tool) => tool.name === name), `${name} is available in the same process`);
  }
  const call = async (name, args) => {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, undefined, JSON.stringify(response.content));
    const result = JSON.parse(response.content[0].text);
    assert.deepEqual(response.structuredContent, { result });
    return result;
  };
  const root = join(dir, 'picturebook');
  assert.equal((await call('folio_init', { root, title: 'Synthetic book', preset: 'picturebook', packs: ['novel', 'image'] })).created, true);
  const game = join(dir, 'gamebook');
  assert.equal((await call('folio_init', { root: game, title: 'Synthetic choices', preset: 'gamebook', packs: ['gamebook'] })).created, true);
  await call('folio_assets', { root, op: 'list' });
  await call('folio_tracking', { root, op: 'get' });
  await call('folio_image', { root, op: 'pending' });
  await call('folio_structure', { root, op: 'add', id: 'book', level: 'book' });
  await call('folio_structure', { root, op: 'add', id: 'page', level: 'spread', parentId: 'book' });
  await call('folio_export', { root, op: 'check' });
  const proposed = await call('folio_resources', { root, op: 'propose', resourceId: 'synthetic-source', kind: 'note', owned: { bytes: 'Synthetic source text.', mediaType: 'text/plain' } });
  await call('folio_resources', { root, op: 'decideSource', revisionId: proposed.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  await call('folio_resource_query', { root, op: 'refresh' });
  const queried = await call('folio_resource_query', { root, op: 'query', resourceId: 'synthetic-source', selector: { type: 'current' }, freshness: 'requireCurrent' });
  assert.match(JSON.stringify(queried), /synthetic-source/);
  const generation = await call('folio_embeddings', { root, op: 'index', dimension: 128 });
  const vector = await call('folio_embeddings', { root, op: 'search', generationId: generation.generationId, text: 'synthetic' });
  assert.equal(vector.results[0].revisionId, proposed.revisionId);
  const tracked = join(dir, 'tracking');
  await call('folio_init', { root: tracked, title: 'Synthetic tracking', preset: 'scene' });
  const proposal = await call('folio_tracking', { root: tracked, op: 'propose', expectedRev: null, plan: planFor('mystery') });
  await call('folio_tracking', { root: tracked, op: 'decide', proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest, action: 'approve' });
  await call('folio_structure', { root: tracked, op: 'add', id: 'early', level: 'scene' });
  await call('folio_structure', { root: tracked, op: 'add', id: 'late', level: 'scene' });
  const folio = { call };
  await driveSynthetic(folio, tracked, 'early');
  await driveSynthetic(folio, tracked, 'late', { discover: true, value: '문' });
  const backfill = await driveSynthetic(folio, tracked, 'early', { mode: 'tracking-backfill', value: '문' });
  assert.equal(backfill.sawMetadataDecision, true);
  const configPath = join(tracked, 'work.yaml');
  const config = parseYaml(await readFile(configPath, 'utf8'));
  await writeFile(configPath, stringifyYaml({ ...config, packs: [...config.packs, 'variants'],
    checkSets: [...config.checkSets, 'variants.basic'], variants: ['main', { id: 'en', kind: 'translation', lang: 'en' }] }));
  const host = createFakeHost({ drafts: { '*': 'The synthetic key is beside the door.' } });
  let translated = await call('folio_run', { root: tracked, node: 'early', variant: 'en' });
  for (let i = 0; i < 20 && translated.status !== 'done'; i += 1) {
    translated = translated.status === 'needs_model'
      ? await call('folio_resume', { root: tracked, runId: translated.runId, answers: host.answer(translated) })
      : await call('folio_decide', { root: tracked, runId: translated.runId, action: 'approve' });
  }
  assert.equal(translated.status, 'done');
  assert.equal((await call('folio_status', { root: tracked })).variants.en.committed, 1);

  assert.equal((await call('folio_find', { root: tracked, query: 'node', id: 'early' })).node.body, TEXT);
});
