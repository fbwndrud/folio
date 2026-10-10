import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, useFakePack, fakePacks } from './fixtures.js';
import { createFakeHost, driveToEnd } from './fake-host.js';

/** 판본 선언 예: 영어 번역. */
export const EN = Object.freeze({ id: 'en', kind: 'translation', lang: 'en' });

/**
 * 합성 연재(serial-2level 복사본)에 판본을 선언한다. 원본 fixture 는 고치지 않는다.
 * 가짜 팩으로 돌리고 승인은 auto(판본 파이프라인의 approve 는 variants[].steps 로 따로 정한다).
 * @param {{ variants?: object[], features?: Record<string, boolean>, overrides?: Record<string, any> }} [options]
 */
export async function variantWork({ variants = [EN], features = {}, overrides = { approve: { mode: 'auto' } } } = {}) {
  const root = await copyFixture('serial-2level');
  await useFakePack(root, { overrides });
  await patchWork(root, { variants: ['main', ...variants], features });
  return root;
}

/** work.yaml 을 고친다(작가가 하는 일). */
export async function patchWork(root, patch) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, ...patch }));
}

/** variants/<id>/<file> 에 글을 둔다(번역가가 손으로 둔 파일 흉내). */
export async function putVariantFile(root, variant, file, text) {
  await mkdir(join(root, 'variants', variant), { recursive: true });
  await writeFile(join(root, 'variants', variant, file), text);
}

/** 원본(main) 노드 하나를 커밋한다. packs 를 주지 않으면 가짜 팩. events: 추출 답(사건). */
export async function commitMain(root, nodeId, text, packs = fakePacks(), events = { events: [] }) {
  const host = createFakeHost({ drafts: { [nodeId]: text }, events: { [nodeId]: events } });
  const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: nodeId }, until: (o) => o.status === 'done' });
  if (trail.at(-1).status !== 'done') throw new Error(`main ${nodeId} did not commit: ${trail.at(-1).status}`);
  return trail.at(-1);
}
