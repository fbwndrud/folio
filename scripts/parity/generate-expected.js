#!/usr/bin/env node
/**
 * 판정 비교 기대값 생성(M5 D10 A). vibelore 를 읽기만 하고, 결과를 test/fixtures/parity-expected/ 에 쓴다.
 *   VIBELORE_ROOT=/abs/path/to/vibelore node scripts/parity/generate-expected.js
 * 테스트는 이 스크립트도 vibelore 도 부르지 않는다. 테스트는 여기서 만든 JSON 만 읽는다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { parseYaml } from '../../core/util/yaml.js';
import { loadVibelore, vibeloreVerdicts } from './vibelore-adapter.js';
import { buildProtocol } from './protocol.js';
import { intendedDiffsFor } from './intended-diffs.js';

const HERE = import.meta.dirname;
const REPO = join(HERE, '..', '..');
const CASES = join(REPO, 'test', 'fixtures', 'parity-cases');
const EXPECTED = join(REPO, 'test', 'fixtures', 'parity-expected');

function fail(message) {
  process.stderr.write(`parity: ${message}\n`);
  process.exit(1);
}

const root = process.env.VIBELORE_ROOT;
if (!root) fail('VIBELORE_ROOT is required (absolute path to a vibelore checkout)');
if (!isAbsolute(root)) fail(`VIBELORE_ROOT must be absolute: ${root}`);
if (!existsSync(join(root, 'engine', 'src', 'continuity', 'continuity-check.js'))) fail(`not a vibelore checkout: ${root}`);

const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const scriptFiles = readdirSync(HERE).filter((name) => name.endsWith('.js')).sort();
const script = sha256(scriptFiles.map((name) => readFileSync(join(HERE, name), 'utf8')).join('\n'));
const vibelore = { commit, script };

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
mkdirSync(EXPECTED, { recursive: true });

const protocol = buildProtocol(root);
if (protocol.missing.length) fail(`protocol markers not found:\n  ${protocol.missing.join('\n  ')}`);
writeFileSync(join(EXPECTED, 'protocol.json'), json({ vibelore, steps: protocol.steps, refusals: protocol.refusals }));

const mods = await loadVibelore(root);
const errors = [];
const ids = readdirSync(CASES).filter((name) => name.endsWith('.yaml')).map((name) => name.slice(0, -5)).sort();
if (ids.length === 0) fail(`no cases in ${CASES}`);
for (const id of ids) {
  const parsed = parseYaml(readFileSync(join(CASES, `${id}.yaml`), 'utf8'));
  if (parsed.id !== id) { errors.push(`${id}: case id field is ${parsed.id}`); continue; }
  const verdicts = await vibeloreVerdicts(mods, parsed);
  const { diffs, errors: diffErrors } = intendedDiffsFor(id, verdicts);
  errors.push(...diffErrors);
  const out = { case: id, caseDigest: sha256(canonicalJson(parsed)), vibelore, hard: verdicts.hard, soft: verdicts.soft, intendedDiffs: diffs };
  writeFileSync(join(EXPECTED, `${id}.json`), json(out));
  process.stdout.write(`${id}: hard ${verdicts.hard.map((h) => h.code).join(',') || '-'} | soft ${verdicts.soft.join(',') || '-'}\n`);
}
if (errors.length) fail(`intended diff table does not fit the verdicts:\n  ${errors.join('\n  ')}`);
process.stdout.write(`parity: ${ids.length} cases + protocol.json written (vibelore ${commit.slice(0, 12)})\n`);
