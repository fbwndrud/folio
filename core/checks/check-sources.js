import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const CHECKS_DIR = 'checks';
const INVALID = { error: 'CHECK_SOURCE_INVALID' };
const MISSING = { error: 'USER_CHECK_SOURCE_MISSING' };

/** 작품의 checks/ 안에 있는 경로만 받는다. 심볼릭 링크로 밖을 가리키는 것도 실제 경로로 막는다. */
async function guarded(root, rel) {
  if (typeof rel !== 'string' || !rel) return INVALID;
  const base = resolve(root, CHECKS_DIR);
  const path = resolve(root, rel);
  if (!path.startsWith(base + sep)) return INVALID;
  let real;
  let realBase;
  try { realBase = await realpath(base); real = await realpath(path); } catch (error) {
    if (error?.code === 'ENOENT') return MISSING;
    throw error;
  }
  if (!real.startsWith(realBase + sep)) return INVALID;
  return { path: real, info: await stat(real) };
}

async function readSource(root, rel) {
  const found = await guarded(root, rel);
  if (found.error) return found;
  if (!found.info.isFile()) return INVALID;
  return { text: await readFile(found.path, 'utf8') };
}

/** 예시 폴더의 일반 파일만 이름순으로 읽는다(링크·하위 폴더는 건너뛴다). */
async function readSamples(root, rel) {
  const found = await guarded(root, rel);
  if (found.error) return found;
  if (!found.info.isDirectory()) return INVALID;
  const entries = (await readdir(found.path, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort();
  const samples = [];
  for (const name of entries) samples.push({ name, text: await readFile(join(found.path, name), 'utf8') });
  return { samples };
}

/**
 * 검사의 규칙 파일(instructionSource → instructionText)과 예시 폴더(samplesSource → samples)를 읽는다.
 * 읽은 내용은 검사 정의에 들어가 checksDigest 에 반영된다(파일이 바뀌면 재검사).
 */
export async function loadCheckSources(root, checks) {
  const errors = [];
  const out = [];
  for (const check of checks) {
    let loaded = check;
    if (check.instructionSource) {
      const source = await readSource(root, check.instructionSource);
      if (source.error) errors.push({ code: source.error, checkId: check.id, source: check.instructionSource });
      loaded = { ...loaded, instructionText: source.text ?? null };
    }
    if (check.samplesSource) {
      const found = await readSamples(root, check.samplesSource);
      if (found.error) errors.push({ code: found.error, checkId: check.id, source: check.samplesSource });
      loaded = { ...loaded, samples: found.samples ?? null };
    }
    out.push(loaded);
  }
  return { checks: out, errors };
}
