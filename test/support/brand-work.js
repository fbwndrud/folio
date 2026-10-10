import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringifyYaml } from '../../core/util/yaml.js';
import { tempDir } from './fixtures.js';

/** 합성 자료 한 편(회사 사실). 원본 글이라 인용은 이 글에 그대로 있어야 한다. */
export const FACTS = '2025년 매출은 30억 원 늘었다. 고객사는 1,100곳이다. 매장은 2026년 9월 30일에 30제곱미터로 열었다.\n';

/**
 * 합성 회사 문서(제품 소개서): doc → section 두 층, packs [knowledge, sources, brand]. 원본 fixture 폴더는 만들지 않는다.
 * 맨 위 노드(intro)의 계획 글에 어조 지침을 적고, 앞머리 sources 로 자료를 건다. config 는 work.yaml 에 덮어쓴다(작가가 하는 일).
 * @param {Record<string, unknown>} [config]
 */
export async function brandWork(config = {}) {
  const root = await tempDir('folio-brand-');
  const work = {
    title: '폴리오 제품 소개서', levels: [{ name: 'doc', children: [1, 10] }, { name: 'section', leaf: true }], order: 'linear',
    packs: ['knowledge', 'sources', 'brand'], checkSets: [], ...config,
  };
  await writeFile(join(root, 'work.yaml'), stringifyYaml(work));
  await mkdir(join(root, 'tree', '01-intro'), { recursive: true });
  await mkdir(join(root, 'entities'), { recursive: true });
  await mkdir(join(root, 'sources'), { recursive: true });
  await writeFile(join(root, 'tree', '01-intro', '_node.md'), '---\nid: intro\nlevel: doc\ntitle: 제품 소개\nsources: [product-facts]\n---\n제품과 숫자를 소개한다.\n\n어조: 존댓말(합니다체), 짧은 문장, 감탄 없이.\n');
  await writeFile(join(root, 'tree', '01-intro', '01-overview.md'), '---\nid: overview\nlevel: section\ntitle: 개요\n---\n');
  await writeFile(join(root, 'sources', 'product-facts.txt'), FACTS);
  await writeFile(join(root, 'sources', 'product-facts.yaml'), 'id: product-facts\ntitle: 제품 사실 자료\nfile: product-facts.txt\ndate: 2026-09-01\nreliability: high\n');
  return root;
}
