import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, tempDir } from './fixtures.js';
import { PNG_A, PNG_B, placeImage } from './images.js';

/**
 * 그림을 쓰는 합성 작품: serial-2level 복사본에 image 팩과 그림 세트를 더하고, 하나(hana)의 기준 그림 한 장(hana-sheet)을 둔다.
 * edit(config) 로 work.yaml 을 더 고칠 수 있다.
 */
export async function illustratedWork(edit = (config) => config) {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml(edit({ ...config, packs: ['novel', 'image'], checkSets: [...config.checkSets, 'image.basic', 'image.placement'] })));
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'hana-sheet.yaml'), stringifyYaml({ id: 'hana-sheet', file: 'hana-sheet.png', reference: true, brief: { entities: ['hana'] } }));
  await writeFile(join(root, 'assets', 'hana-sheet.png'), PNG_B);
  return root;
}

/** work.yaml 을 고친다. */
export async function editWork(root, edit) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml(edit(parseYaml(await readFile(path, 'utf8')))));
}

export const HANA_BRIEF = Object.freeze({
  mustShow: ['지하실 끝의 잠긴 문', '문 앞의 하나'], mustNotShow: ['문 너머'], entities: ['hana', 'locked-door'],
  continuity: '하나는 회색 외투를 입는다.', dialogue: [], reference: false,
});

/**
 * 그림 실행의 가짜 호스트(모델 대신): 설명서·그림·검토 요청에 답한다. 그림은 작품 밖 임시 폴더에 PNG 를 만들어 그 절대 경로를 준다.
 * script: { brief?: object|((payload) => object|string), image?: (payload, n) => object|string|Promise, review?: (payload) => findings[] }
 */
export async function createImageHost(script = {}) {
  const outside = await tempDir('folio-host-images-');
  const calls = [];
  let made = 0;
  async function respond(request) {
    const p = request.payload;
    calls.push({ purpose: request.purpose, stepId: request.stepId, payload: p });
    if (request.purpose === 'image_brief') {
      const brief = typeof script.brief === 'function' ? script.brief(p) : (script.brief ?? HANA_BRIEF);
      return typeof brief === 'string' ? brief : JSON.stringify(brief);
    }
    if (request.purpose === 'image_generate') {
      made += 1;
      if (script.image) { const out = await script.image(p, made); return typeof out === 'string' ? out : JSON.stringify(out); }
      return JSON.stringify({ path: await placeImage(outside, `made-${made}.png`, made % 2 ? PNG_A : PNG_B), model: 'fake-image-1' });
    }
    if (request.purpose === 'image_review') {
      return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: script.review ? script.review(p) : [] });
    }
    throw new Error(`image host cannot answer ${request.purpose}`);
  }
  return {
    calls, outside,
    async answer(outcome) {
      const answers = {};
      for (const request of outcome.requests) answers[request.requestId] = await respond(request);
      return answers;
    },
  };
}

/** needs_model 이면 가짜 호스트로 답하기를 until 이 참이 될 때까지(최대 limit 번). */
export async function answerUntil(runner, host, outcome, until = (o) => o.status !== 'needs_model', limit = 20) {
  let out = outcome;
  for (let i = 0; i < limit && !until(out); i += 1) {
    if (out.status !== 'needs_model') throw new Error(`cannot answer ${out.status}`);
    out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  }
  return out;
}
