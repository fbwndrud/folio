import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyFixture } from './fixtures.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { sha256 } from '../../core/util/hash.js';
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f0c75e"/><circle cx="50" cy="50" r="25" fill="#2d5e59"/></svg>';
export const BODY = '# 합성 제목\n도표 {#fig-test}\n[[block:fig-test]] [^note] [[source:ref]] ![[asset:cover]]\n[^note]: 합성 각주\n<script>alert("x")</script>\n```\n![[asset:missing]] {#fig-code}\n```\n';
/** 테스트가 소유하는 합성 작품과 외부 결과 부모다. */
export async function exportFixture(t) {
  const root = await copyFixture('gamebook-n7'), outside = await mkdtemp(join(tmpdir(), 'folio-export-out-'));
  if (t) t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await mkdir(join(root, 'assets'), { recursive: true }); await mkdir(join(root, 'sources'), { recursive: true });
  await writeFile(join(root, 'assets', 'cover.svg'), SVG);
  await writeFile(join(root, 'assets', 'cover.yaml'), stringifyYaml({ id: 'cover', file: 'cover.svg', brief: { title: '합성 원' } }));
  await writeFile(join(root, 'sources', 'ref.yaml'), stringifyYaml({ id: 'ref', file: 'ref.txt', title: '합성 자료' }));
  await writeFile(join(root, 'sources', 'ref.txt'), '합성 자료 문장.');
  const work = await openWork(root); await updateNode(root, work.tree.nodes.get('a'), { body: BODY });
  return { root, outside, output: (name) => join(outside, name) };
}
export async function sourceSnapshot(root) {
  const out = {};
  async function walk(rel) {
    for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out[path] = sha256(await readFile(join(root, path)));
    }
  }
  await walk(''); return out;
}
export const CLOCK = () => '2026-10-02T03:04:05.678Z';
