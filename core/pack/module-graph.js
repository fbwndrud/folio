import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

/**
 * 정적 `import … from '…'`, `export … from '…'`, `import '…'`의 상대 경로(./ 또는 ../).
 * `from`/`import`와 따옴표 사이에 공백·블록 주석(`/`+`*` … `*`+`/`)·줄 주석(`// …` 줄 끝까지)이 있어도 잡는다.
 * 닫는 따옴표는 여는 것과 같은 글자만 찾는다 — 다른 종류의 따옴표(예: `"./it's.js"`)는 그냥 경로 글자다.
 * node:·패키지 이름은 보지 않는다.
 * 블록 주석은 첫 `*`+`/`에서 끝나고(안을 욕심 부려 더 삼키지 않는다), 줄 주석은 그 줄 끝까지만 본다(뒤에 아무 글자도
 * 남기지 않는 자리에서만 멈춘다) — 두 갈래가 같은 구간을 서로 다르게 쪼갤 길이 없어야, 따옴표를 못 찾을 때 그 갈래 수만큼
 * 몇 번이고 다시 나눠보는 지수 폭발(ReDoS)이 안 생긴다(C0 B2 재검토, c976214의 되돌아보기).
 * 줄 주석의 "줄 끝"은 자바스크립트 규칙대로 `\n` 뿐 아니라 외로운 `\r`·U+2028(줄 구분자)·U+2029(문단 구분자)도 포함한다 —
 * 이 셋을 빼면 주석이 다음 줄까지 삼켜, Node 는 그대로 불러오는 import 를 그래프가 놓친다(잠금 경로 fail open, C0 최종 리뷰 fix-4).
 */
const GAP = String.raw`(?:\s|/\*[^*]*\*+(?:[^/*][^*]*\*+)*/|//[^\n\r\u2028\u2029]*(?![^\n\r\u2028\u2029]))*`;
const SPECIFIER = new RegExp(String.raw`\b(?:from|import)${GAP}(['"])(\.{1,2}/[^\n]*?)\1`, 'g');
const MAX_FILES = 500;

/** 팩 폴더의 실제(symlink 를 푼) 경로 기준 POSIX 상대 경로. 기계·OS 가 달라도(win32 구분자, macOS /tmp symlink) 같은 글자를 낸다. */
const keyOf = (realDir, file) => relative(realDir, file).split(sep).join('/');

/** Node 의 상대 import 해석과 같다: 질의문자열·해시를 떼고 %xx 를 풀어 파일 경로를 낸다(symlink 는 호출한 쪽이 realpath 로 푼다). */
const resolveSpecifier = (spec, fromRealFile) => fileURLToPath(new URL(spec, pathToFileURL(fromRealFile)));

/** 없는 파일의 key. 부모 폴더까지는 있을 때 그 실제 경로를 써서(예: macOS /tmp → /private/tmp) 에러 경로도 찾은 파일과 같은 글자 체계를 쓴다. */
async function keyForMissing(realDir, target) {
  try {
    return keyOf(realDir, join(await realpath(dirname(target)), basename(target)));
  } catch {
    return keyOf(realDir, target);
  }
}

/**
 * 팩 검사기 모듈이 정적으로 import 하는 파일 전부의 내용 hash(모듈 그래프). 시작 모듈부터 상대 import 를 따라간다 —
 * 같은 팩의 도우미·사전, 다른 팩의 도우미(예: brand → sources/checkers/claims.js), 코어 파일(예: core/promise.js)까지.
 * 팩 digest 가 검사기 함수 글자만 보면 이런 파일을 바꿔도 digest 가 그대로라 열린 실행이 검사를 다시 하지 않는다(N2·M5·N5 인계 H3).
 * 경로는 Node 처럼 푼다: `fileURLToPath(new URL(spec, pathToFileURL(실제 가져온 파일)))`로 질의문자열·해시·%xx 를 처리하고,
 * 그 결과를 `realpath`로 symlink 까지 따라간다(--preserve-symlinks 없는 Node 와 같다). key 는 팩 폴더의 실제 경로 기준이다.
 * 파일을 import 하지 않고 글로만 읽는다(코어는 동적 import 를 쓰지 않는다). 스캐너가 주석 속 문구를 import 로 잘못 잡아도
 * 그 경로가 없으면 조용히 건너뛰지 않고 PACK_FILE_MISSING 으로 막는다 — 잠금 경로(팩 digest)는 fail open 이 아니라 fail closed 다.
 * @param {string} dir 팩 폴더
 * @param {string[]} entries 팩 폴더 기준 시작 모듈(예: ['checkers/index.js']). 없으면 PACK_FILE_MISSING.
 * @returns {Promise<Array<[string, string]>>} [팩 폴더(실제 경로) 기준 상대 경로, 내용 sha256], 경로 순
 */
export async function moduleGraph(dir, entries) {
  const realDir = await realpath(dir);
  const hashes = new Map();
  const queue = entries.map((entry) => ({ target: resolve(dir, entry), from: /** @type {string|null} */ (null) }));
  while (queue.length) {
    const { target, from } = /** @type {{ target: string, from: string|null }} */ (queue.shift());
    let real;
    try {
      real = await realpath(target);
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== 'ENOENT') throw error;
      const path = await keyForMissing(realDir, target);
      throw new FolioError('PACK_FILE_MISSING', `module ${path} is missing${from ? ` (imported from ${from})` : ''}`, from ? { path, from } : { path });
    }
    const key = keyOf(realDir, real);
    if (hashes.has(key)) continue;
    const text = await readFile(real, 'utf8');
    hashes.set(key, sha256(text));
    if (hashes.size > MAX_FILES) throw new FolioError('PACK_INVALID', `the checker modules import more than ${MAX_FILES} files`, { path: key });
    for (const match of text.matchAll(SPECIFIER)) queue.push({ target: resolveSpecifier(match[2], real), from: key });
  }
  return [...hashes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
