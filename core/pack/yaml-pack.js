import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { parseYaml } from '../util/yaml.js';
import { readPackSpec } from './yaml-schema.js';
import { packErrorPath, validatePack } from './validate.js';
import { readPackCode } from './code-files.js';
import { digestProjection } from './digest.js';
import { moduleGraph } from './module-graph.js';

export const PACK_FILE = 'pack.yaml';
const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 팩 폴더 안의 파일(확장자 ext)만 읽는다. 절대 경로·`..` 조각(정규화 전 원래 조각으로 본다)·역슬래시·NUL·
 * 링크로 밖을 가리키는 것·파일이 아닌 것은 거부한다. pack.yaml 도 같은 길로 읽는다.
 */
async function readInside(dir, rel, ext = '.md') {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || isAbsolute(rel) || rel.includes('\\') || rel.split('/').includes('..') || !rel.endsWith(ext)) {
    return { error: 'PACK_PATH_INVALID' };
  }
  let base;
  let real;
  try {
    base = await realpath(dir);
    real = await realpath(resolve(dir, rel));
  } catch (error) {
    if (error?.code === 'ENOENT') return { error: 'PACK_FILE_MISSING' };
    throw error;
  }
  if (!real.startsWith(base + sep) || !(await stat(real)).isFile()) return { error: 'PACK_PATH_INVALID' };
  return { text: await readFile(real, 'utf8') };
}

/** 검사기는 소스 글자가 있는 함수여야 한다. 바인드·네이티브 함수는 digest 에 묶을 수 없다(packDigest 가 PACK_DIGEST_UNSUPPORTED 로 거부). */
const hasSource = (fn) => typeof fn === 'function' && !Function.prototype.toString.call(fn).includes('[native code]');

const refuse = (pack, errors) => new FolioError('PACK_INVALID', errors.map((e) => `${e.code}@${e.path ?? ''}`).join(', '), { pack, errors });

function assemble(spec, texts, checkers, yamlText, codeFiles, checkerInputs, modules) {
  const used = [...new Set(spec.checks.filter((c) => c.run).map((c) => c.run))].sort();
  const codeDigest = sha256(canonicalJson(codeFiles));
  const inputsOf = (id) => Object.hasOwn(checkerInputs, id) ? checkerInputs[id] : null;
  const checks = spec.checks.map(({ run, instruction, ...check }) => ({
    ...check, origin: 'pack',
    ...(run ? { checker: run, run: checkers[run], implementationDigest: codeDigest, digestInputs: inputsOf(run) } : {}),
    ...(instruction ? { instruction: texts.get(instruction) } : {}),
  }));
  // 프롬프트 글은 팩의 데이터로 둔다 — packDigest 의 내용 투영이 보게 한다(클로저 안에만 두면 선언 digest 에만 묶인다).
  const prompts = Object.fromEntries(Object.entries(spec.prompts).map(([key, path]) => [key, texts.get(path)]));
  const pack = {
    name: spec.name, version: spec.version, title: spec.title, description: spec.description, presets: spec.presets,
    pipelines: spec.pipelines, checks, checkSets: spec.checkSets, defaultCheckSets: spec.defaultCheckSets, prompts, codeDigest,
    ...(spec.scopeFields ? { scopeFields: spec.scopeFields } : {}),
    /** 팩 프롬프트는 요청 재료에 instructions 로 얹는다(요청 digest 는 얹기 전 재료로 만든다 — core/run/payload.js). */
    prompt(step, payload) {
      const key = `${payload?.node?.kind}.${step?.id}`;
      const text = Object.hasOwn(pack.prompts ?? {}, key) ? pack.prompts[key] : undefined;
      return typeof text !== 'string' ? payload : { ...payload, instructions: text };
    },
    digest: sha256(canonicalJson({
      yaml: yamlText, files: [...texts.entries()].sort(byKey), codeFiles,
      checkers: used.map((id) => [id, Function.prototype.toString.call(checkers[id]), digestProjection(inputsOf(id))]),
      ...(modules.length ? { modules } : {}),
    })),
  };
  return pack;
}

/**
 * 파일 팩을 읽어 코어 Pack 모양으로 조립한다.
 * - pack.yaml: 선언(단계·검사·세트·프리셋·프롬프트 경로). 알 수 없는 키는 거부한다.
 * - *.md: 팩 폴더 안의 글. 모델 검사의 instruction 은 글 내용이 된다(checksDigest 에 든다).
 * - 결정론 검사는 checkers(코드로 등록한 이름 → 함수)에서 이름으로만 찾는다. 소스 없는 함수(바인드·네이티브)는 PACK_CHECKER_UNSUPPORTED.
 * - digest: pack.yaml·읽은 글·팩의 모든 JS/CJS/MJS/JSON·검사기 소스·선언 입력.
 *   팩 밖의 코드·상수는 checkerInputs에 명시한다. 바뀌면 열린 실행과 커밋된 원고를 다시 검사한다.
 * 마지막으로 코어 팩 규칙(validatePack: 잠금·접두어·중복)을 통과해야 한다.
 * @param {string} dir
 * @param {{ name?: string|null, checkers?: Record<string, (ctx: any) => any[]>, checkerInputs?: Record<string, unknown>, modules?: string[] }} [options]
 */
export async function loadYamlPack(dir, { name = null, checkers = {}, checkerInputs = {}, modules = [] } = {}) {
  const top = await readInside(dir, PACK_FILE, '.yaml');
  if (top.error) throw refuse(name, [{ code: top.error, path: PACK_FILE }]);
  let yamlText = top.text;
  let raw;
  try { raw = parseYaml(yamlText); } catch { throw refuse(name, [{ code: 'PACK_YAML_INVALID', path: PACK_FILE }]); }
  if (typeof raw?.checks === 'string') {
    const path = raw.checks;
    const catalog = await readInside(dir, path, '.yaml');
    if (catalog.error) throw refuse(name, [{ code: catalog.error, path }]);
    try { raw.checks = parseYaml(catalog.text); } catch { throw refuse(name, [{ code: 'PACK_YAML_INVALID', path }]); }
    yamlText += `\n# ${path}\n${catalog.text}`;
  }
  const { spec, files, errors } = readPackSpec(raw);
  if (!spec) throw refuse(name, errors);
  if (name && spec.name !== name) errors.push({ code: 'PACK_NAME_MISMATCH', path: 'name' });
  const texts = new Map();
  for (const file of files) {
    const read = await readInside(dir, file);
    if (read.error) errors.push({ code: read.error, path: file });
    else texts.set(file, read.text);
  }
  for (const check of spec.checks) {
    if (typeof check.run !== 'string') continue;
    const path = `checks.${check.id}.run`;
    if (!Object.hasOwn(checkers, check.run)) errors.push({ code: 'PACK_CHECKER_UNKNOWN', path });
    else if (!hasSource(checkers[check.run])) errors.push({ code: 'PACK_CHECKER_UNSUPPORTED', path });
  }
  if (!checkerInputs || typeof checkerInputs !== 'object' || Array.isArray(checkerInputs)) {
    errors.push({ code: 'PACK_CHECKER_INPUTS_INVALID', path: 'checkerInputs' });
  } else {
    const used = new Set(spec.checks.map((check) => check.run).filter(Boolean));
    for (const id of Object.keys(checkerInputs)) {
      if (!used.has(id)) errors.push({ code: 'PACK_CHECKER_UNKNOWN', path: `checkerInputs.${id}` });
    }
  }
  if (errors.length) throw refuse(spec.name, errors);
  const pack = assemble(spec, texts, checkers, yamlText, await readPackCode(dir), checkerInputs, await moduleGraph(dir, modules));
  const core = validatePack(pack);
  if (core.length) throw refuse(spec.name, core.map((e) => ({ path: packErrorPath(e), ...e })));
  return pack;
}
