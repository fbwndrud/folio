import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * 판정 비교 격리(M5 D10 A). 테스트는 기대값 JSON 만 읽는다 — 원래 엔진 원본도, 그것을 부르는 생성 스크립트도 import 하지 않는다.
 * test/fixtures 밖의 모든 test/**\/*.js 의 import 경로(정적 from·import '…'·동적 import('…')·require('…'))를 본다.
 * 금지 문자열은 이 파일 소스에 그대로 적지 않는다(이 파일도 검사 대상이다).
 */
const SOURCE_ENGINE = ['vibe', 'lore'].join('');
const FORBIDDEN_PARTS = [SOURCE_ENGINE, ['scripts', 'parity'].join('/')];
const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"`]([^'"`]+)['"`]/g,
  /\bimport\s*['"`]([^'"`]+)['"`]/g,
  /\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /\brequire\s*\(\s*['"`]([^'"`]+)['"`]/g,
];

/** 소스의 import 경로 전부(주석 안의 것도 센다 — 느슨하게 막는 쪽이 안전하다). */
function importPaths(text) {
  const paths = [];
  for (const pattern of IMPORT_PATTERNS) for (const match of text.matchAll(pattern)) paths.push(match[1]);
  return paths;
}

const offending = (text) => importPaths(text).filter((path) => FORBIDDEN_PARTS.some((part) => path.replaceAll('\\', '/').includes(part)));

test('the import scan catches every way to load the source engine or the parity script', () => {
  const q = "'";
  const imp = 'imp' + 'ort';
  const bad = [
    `${imp} { continuityCheck } from ${q}/Users/x/${SOURCE_ENGINE}/engine/src/continuity/continuity-check.js${q};`,
    `${imp} ${q}../../scripts/parity/vibe-adapter.js${q};`,
    `const m = await ${imp}(${q}/abs/${SOURCE_ENGINE}/src/tools/check.js${q});`,
    `const m = await ${imp}( "file:///abs/${SOURCE_ENGINE}/x.js" );`,
    `export { a } from ${q}../../scripts/parity/protocol.js${q};`,
    `const r = require(${q}../../scripts/parity/generate-expected.js${q});`,
    `${imp} * as all from ${q}C:\\work\\scripts\\parity\\intended-diffs.js${q};`,
  ];
  for (const sample of bad) assert.ok(offending(sample).length > 0, sample);
  const good = [
    `${imp} { loadCase } from ${q}../support/parity.js${q};`,
    `${imp} { PARITY_CODES } from ${q}../support/parity-codes.js${q};`,
    `const { join } = await ${imp}(${q}node:path${q});`,
    `const note = ${q}run scripts/parity/generate-expected.js by hand${q};`,
  ];
  for (const sample of good) assert.deepEqual(offending(sample), [], sample);
});

async function* testFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (relative('test', path).split(sep)[0] === 'fixtures') continue;
      yield* testFiles(path);
    } else if (path.endsWith('.js')) yield path;
  }
}

test('no test imports the source engine or scripts/parity', async () => {
  const offenders = [];
  let files = 0;
  for await (const file of testFiles('test')) {
    files += 1;
    for (const path of offending(await readFile(file, 'utf8'))) offenders.push(`${file}: ${path}`);
  }
  assert.ok(files > 0, 'test/ has no .js files');
  assert.deepEqual(offenders, []);
});

test('the parity code map never names the source engine', async () => {
  const text = await readFile(join('test', 'support', 'parity-codes.js'), 'utf8');
  assert.equal(text.toLowerCase().includes(SOURCE_ENGINE), false);
});
