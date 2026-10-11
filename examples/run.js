import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { stringifyYaml } from '../core/util/yaml.js';
import { answerRequest } from './host.js';

const REPO = dirname(import.meta.dirname);
const EXAMPLES = ['story', 'guide', 'picturebook', 'fairytale'];

/** 공개 실행 파일과 실제 MCP 통신을 사용한다. 결과는 항상 새 폴더에만 쓴다. */
export async function runExamples({ names = EXAMPLES, out = null, verify = false } = {}) {
  if (!names.length || names.some((name) => !EXAMPLES.includes(name))) throw new Error('choose story, guide, picturebook, fairytale or all');
  if (out && verify) throw new Error('--out and --verify cannot be combined');
  const base = out ? resolve(out) : await mkdtemp(join(tmpdir(), 'folio-example-'));
  if (out) await mkdir(base, { recursive: false });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(REPO, 'bin', 'linivera-mcp.js')], cwd: REPO, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const client = new Client({ name: 'folio-synthetic-example', version: '0.1.0' });
  const results = [];
  async function call(name, args) {
    const response = await client.callTool({ name, arguments: args });
    const body = JSON.parse(response.content[0].text);
    if (response.isError) throw new Error(`${name}: ${JSON.stringify(body.error)}`);
    return body;
  }
  try {
    await client.connect(transport);
    for (const name of names) {
      const scenario = JSON.parse(await readFile(join(import.meta.dirname, `${name}.json`), 'utf8'));
      const root = join(base, name);
      const init = await call('folio_init', { root, title: scenario.title, preset: scenario.preset, packs: scenario.packs });
      assert.equal(init.created, true);
      for (const entity of scenario.entities) {
        const dir = join(root, 'entities', entity.kind);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${entity.id}.md`), `---\n${stringifyYaml(entity)}---\n`);
      }
      await call('folio_structure', { root, op: 'add', ...scenario.rootNode });
      let outcome = await call('folio_run', { root });
      let calls = 0;
      const committed = new Set();
      for (; calls < 100 && outcome.status !== 'idle'; calls += 1) {
        if (outcome.status === 'needs_model') {
          outcome = await call('folio_resume', { root, runId: outcome.runId,
            answers: Object.fromEntries(outcome.requests.map((request) => [request.requestId, answerRequest(request, scenario)])) });
        } else if (outcome.status === 'needs_user') {
          assert.equal(outcome.question.kind, 'approve', `the example never overrides a blocked check: ${JSON.stringify(outcome.question)}`);
          assert.deepEqual(outcome.question.blocking, []);
          assert.deepEqual(outcome.question.advisories, []);
          outcome = await call('folio_decide', { root, runId: outcome.runId, action: 'approve' });
        } else if (outcome.status === 'done') {
          committed.add(outcome.nodeId);
          const { node } = await call('folio_find', { root, query: 'node', id: outcome.nodeId });
          assert.equal(node.status, 'committed');
          const expected = scenario.nodes[outcome.nodeId];
          assert.equal(node.body.trim(), (expected.draft ?? expected.plan).trim());
          outcome = await call('folio_run', { root });
        } else throw new Error(`unexpected example outcome: ${outcome.status}`);
      }
      assert.equal(outcome.status, 'idle', 'the example must reach the end');
      assert.deepEqual([...committed].sort(), Object.keys(scenario.nodes).sort());
      const status = await call('folio_status', { root });
      assert.equal(status.activeRun, null);
      for (const field of ['stale', 'recheck', 'flagged', 'drift', 'warnings', 'waiting']) assert.deepEqual(status[field], []);
      for (const ledger of Object.values(status.ledger)) assert.equal(ledger.ok, true);
      results.push({ example: name, root, committed: [...committed], calls });
    }
    assert.equal(stderr, '', 'the MCP server must keep stderr clean');
    return results;
  } finally {
    await client.close();
    if (verify) await rm(base, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const name = args[0] && !args[0].startsWith('--') ? args.shift() : 'all';
  let out = null;
  let verify = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--verify') verify = true;
    else if (arg === '--out' && args[0] && !args[0].startsWith('--')) out = args.shift();
    else throw new Error('usage: node examples/run.js [story|guide|picturebook|fairytale|all] [--out NEW_DIRECTORY | --verify]');
  }
  console.log(JSON.stringify({ synthetic: true, verified: true, outputsRetained: !verify,
    results: await runExamples({ names: name === 'all' ? EXAMPLES : [name], out, verify }) }, null, 2));
}

const invokedPath = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invokedPath === await realpath(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
