import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseYaml, stringifyYaml } from '../core/util/yaml.js';
import { readZipEntries } from './production-verify.js';

const DRAFTS = {
  'toy-spread-1': '### Reading text\nWhat is in the box?\n\n### Illustration brief\nOne closed blue box in the middle of the floor. This is an illustration brief.\n',
  'toy-spread-2': '### Reading text\nI opened the lid a little.\n\n### Illustration brief\nOne yellow ball inside an open blue box. This is an illustration brief.\n',
};

/** Run only on the fresh synthetic production work. Every author decision here is simulated. */
export async function verifyProductionEditions(root, call) {
  const configPath = join(root, 'work.yaml'), config = parseYaml(await readFile(configPath, 'utf8'));
  config.packs.push('variants');
  config.checkSets.push('variants.basic');
  config.variants = ['main', { id: 'en', kind: 'translation', lang: 'en' }];
  await writeFile(configPath, stringifyYaml(config));
  for (const [node, draft] of Object.entries(DRAFTS)) {
    let outcome = await call('folio_run', { root, node, variant: 'en' });
    for (let attempts = 0; attempts < 30 && outcome.status !== 'done'; attempts += 1) {
      if (outcome.status === 'needs_model') {
        const answers = Object.fromEntries(outcome.requests.map(request => {
          if (request.purpose === 'check') return [request.requestId, JSON.stringify({ checked: request.payload.checks.map(c => c.checkId), findings: [] })];
          assert.equal(request.payload.produces, 'draft');
          return [request.requestId, draft];
        }));
        outcome = await call('folio_resume', { root, runId: outcome.runId, answers });
      } else {
        assert.equal(outcome.status, 'needs_user');
        assert.equal(outcome.question.kind, 'approve');
        assert.deepEqual(outcome.question.blocking, []);
        outcome = await call('folio_decide', { root, runId: outcome.runId, action: 'approve' });
      }
    }
    assert.equal(outcome.status, 'done');
  }
  const sourcePath = join(root, '.folio/ledger/receipts.jsonl'), before = await readFile(sourcePath);
  const opened = await call('folio_view', { root }), url = new URL(opened.url);
  const headers = { 'x-folio-token': url.searchParams.get('token') };
  const request = async (path) => {
    const response = await fetch(new URL(path, url), { headers });
    assert.equal(response.status, 200, path); return response;
  };
  const catalog = await (await request('/api/variants')).json();
  assert.deepEqual(catalog.editions.map(e => e.id), ['main', 'en']);
  const node = await (await request('/api/variants/en/nodes/toy-spread-1')).json();
  assert.match(node.segments.map(s => s.text ?? '').join(''), /What is in the box/);
  const receipt = await (await request('/api/variants/en/receipts/toy-spread-1')).json();
  const original = await (await request('/api/variants/main/receipts/toy-spread-1')).json();
  assert.equal(receipt.receipt.variant, 'en');
  assert.equal(receipt.receipt.original.receiptId, original.receipt.receiptId);
  assert.notEqual(receipt.receipt.receiptId, original.receipt.receiptId);
  assert.equal(receipt.receipt.draftHash, node.contentHash);
  assert.equal((await (await request('/api/variants/en/publication')).json()).language, 'en');
  for (const format of ['web', 'epub']) {
    const response = await request(`/api/variants/en/publication/${format}`);
    const entries = readZipEntries(Buffer.from(await response.arrayBuffer()));
    const text = entries.get(format === 'web' ? 'index.html' : 'OEBPS/book.xhtml').toString();
    assert.match(text, /What is in the box/);
    assert.match(text, /lang="en"/);
    assert.doesNotMatch(text, /상자 안에는 무엇이/);
  }
  assert.deepEqual(await readFile(sourcePath), before);
  return { verified: true, variant: 'en', receiptBoundToOriginal: true, downloadsVerified: ['web', 'epub'], simulatedApproval: true };
}
