import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [
  /\bfetch\s*\(/,
  /['"](node:)?(https?|http2|net|tls|dgram|child_process|worker_threads)['"]/,
  /@anthropic-ai|openai/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\bcreateRequire\b/,
  /\bWebSocket\b/,
  /\bundici\b/,
];

/** 주석을 벗겨 낸 뒤 검사한다. JSDoc 타입 표기 `import('../x.js').Type` 는 주석 안이라 실행되지 않는다. */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const offends = (text) => FORBIDDEN.some((p) => p.test(stripComments(text)));

test('the forbidden patterns catch each way out of the process', () => {
  const samples = [
    "fetch('x')", "import https from 'node:https';", "import { spawn } from 'node:child_process';", "import cp from 'child_process';",
    "import http2 from 'node:http2';", "import tls from 'node:tls';", "import dgram from 'node:dgram';",
    "const m = await import('./x.js');", 'new WebSocket(url)', "import { request } from 'undici';",
    "/* x */ const m = await import('node:https');", "const r = createRequire(import.meta.url)('https');",
    "/** @type {x} */\nconst m = await import('./x.js');",
  ];
  for (const sample of samples) assert.ok(offends(sample), sample);
  assert.equal(offends("import { join } from 'node:path';"), false);
  assert.equal(offends(" /** @param {{ work: import('../store/work.js').Work }} args */"), false);
  assert.equal(offends("// const m = await import('node:https');"), false);
});

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (path.endsWith('.js')) yield path;
  }
}

test('core and packs never call a model or the network', async () => {
  for (const dir of ['core', 'packs']) {
    const offenders = [];
    let files = 0;
    for await (const file of walk(dir)) {
      files += 1;
      const text = await readFile(file, 'utf8');
      const code = stripComments(text);
      for (const pattern of FORBIDDEN) if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
    }
    assert.ok(files > 0, `${dir}/ has no .js files`);
    assert.deepEqual(offenders, []);
  }
});
