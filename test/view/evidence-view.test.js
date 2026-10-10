import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { submitEvidence } from '../../core/evidence/submit.js';
import { viewNodeEvidence, viewSource, viewSources } from '../../core/view/evidence-view.js';
import { copyFixture } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

const NOTE = 'ATP는 세포의 에너지 화폐로 불린다.';

async function book() {
  const root = await copyFixture('knowledge-book');
  await editYaml(root, (config) => { config.packs = ['knowledge', 'sources']; });
  await submitEvidence(root, { nodeId: 'atp-section', claims: [{ quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] }] });
  return root;
}

test('sources list with link counts, one source with its text and claims, and a node with its claims', async () => {
  const root = await book();
  const list = await viewSources(root);
  assert.deepEqual(list.sources.map((s) => [s.id, s.reliability, s.text, s.links]), [['cell-notes', 'medium', true, 1]]);
  assert.deepEqual(list.evidence, { enabled: true, ledger: { ok: true }, total: 1, stale: [] });
  const one = await viewSource(root, 'cell-notes');
  assert.match(one.source.text, /에너지 화폐/);
  assert.deepEqual(one.links.map((l) => [l.nodeId, l.status, l.sources[0].verified]), [['atp-section', 'located', true]]);
  const node = await viewNodeEvidence(root, 'atp-section');
  assert.deepEqual(node.claims.map((c) => c.quote), ['ATP는 세포가 쓰는 에너지 화폐다']);
  assert.deepEqual((await viewNodeEvidence(root, 'membranes')).claims, []);
  await assert.rejects(viewSource(root, 'nope'), { code: 'SOURCE_NOT_FOUND' });
  await assert.rejects(viewNodeEvidence(root, 'nope'), { code: 'NODE_NOT_FOUND' });
});

test('turned-off features and a broken evidence ledger are not guessed', async () => {
  const root = await book();
  const path = join(root, '.folio', 'ledger', 'evidence.jsonl');
  await writeFile(path, (await readFile(path, 'utf8')).replace('"atp-section"', '"membranes"'));
  const broken = await viewSources(root);
  assert.deepEqual([broken.sources[0].links, broken.evidence.total, broken.evidence.ledger.ok], [null, null, false]);
  assert.equal((await viewNodeEvidence(root, 'atp-section')).claims, null);
  await editYaml(root, (config) => { config.features = { evidence: false }; });
  const off = await viewSources(root);
  assert.deepEqual([off.evidence.enabled, off.evidence.ledger, off.sources[0].links], [false, null, null]);
  await editYaml(root, (config) => { config.features = { sources: false }; });
  await assert.rejects(viewSources(root), { code: 'FEATURE_DISABLED' });
});
