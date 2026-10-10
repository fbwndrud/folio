import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { openWork } from '../../core/store/work.js';
import { parseYaml } from '../../core/util/yaml.js';
import { tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };

test('folio_init makes a sourcebook work with packs [knowledge, sources]; without the sources pack it is refused and leaves no work.yaml', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-n2-init-'), '세포 자료집');
  ok(await tools.call('folio_init', { root, title: '세포 자료집', preset: 'sourcebook', packs: ['knowledge', 'sources'] }));
  assert.deepEqual(parseYaml(await readFile(join(root, 'work.yaml'), 'utf8')), {
    title: '세포 자료집', levels: [{ name: 'part', children: [1, 10] }, { name: 'chapter', children: [1, 20] }, { name: 'section', leaf: true }],
    packs: ['knowledge', 'sources'], checkSets: ['knowledge.basic', 'sources.citations'],
  });
  const alone = join(await tempDir('folio-n2-init-'), 'w');
  const refused = await tools.call('folio_init', { root: alone, title: 't', preset: 'sourcebook', packs: ['knowledge'] });
  assert.equal(refused.error.code, 'CONFIG_INVALID');
  assert.ok(refused.error.details.errors.some((e) => e.code === 'CHECK_SET_UNKNOWN' && e.set === 'sources.citations'));
  await assert.rejects(stat(join(alone, 'work.yaml')), { code: 'ENOENT' });
  assert.deepEqual((await tools.call('folio_init', { root: alone, title: 't', preset: 'nope' })).error.details.packPresets.knowledge, ['textbook', 'history', 'guide', 'sourcebook', 'reference']);
});

test('the root plan request of a sourcebook work carries its sources, and the knowledge prompts point at sources and claims', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-n2-book-'), '세포 자료집');
  ok(await tools.call('folio_init', { root, title: '세포 자료집', preset: 'sourcebook', packs: ['knowledge', 'sources'] }));
  ok(await tools.call('folio_structure', { root, op: 'add', level: 'part', id: 'part-1', title: '1부 세포' }));
  // 작가가 한 일(합성): 자료 하나를 두고, 맨 위 노드 앞머리에 그 자료를 적는다
  await mkdir(join(root, 'sources'), { recursive: true });
  await writeFile(join(root, 'sources', 'cell-notes.txt'), '세포 강의 메모 (합성 자료). 세포는 1665년에 처음 관찰됐다.\n');
  await writeFile(join(root, 'sources', 'cell-notes.yaml'), 'id: cell-notes\ntitle: 세포 강의 메모\nfile: cell-notes.txt\nreliability: medium\n');
  const file = join(root, 'tree', (await openWork(root)).tree.nodes.get('part-1').path);
  await writeFile(file, (await readFile(file, 'utf8')).replace('status: draft\n', 'status: draft\nsources: [cell-notes]\n'));
  const asked = ok(await tools.call('folio_run', { root }));
  assert.equal(label(asked), 'model:plan');
  const payload = asked.requests[0].payload;
  assert.deepEqual([payload.node.id, payload.sources.map((s) => [s.id, s.title, s.reliability])], ['part-1', [['cell-notes', '세포 강의 메모', 'medium']]]);
  assert.match(payload.instructions, /`sources`/);
  const pack = (await loadBuiltinPacks()).get('knowledge');
  assert.match(pack.prompts['leaf.extract'], /evidence\.wanted/);
  assert.match(pack.prompts['leaf.extract'], /"claims"/);
  assert.match(pack.prompts['leaf.draft'], /자료\(sources\)/);
});
