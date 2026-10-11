#!/usr/bin/env node
import { resolve } from 'node:path';
import { inspectWork } from '../core/diagnostics/work.js';
import { loadBuiltinPacks } from '../packs/index.js';
import { quietSqliteWarning } from '../server/warnings.js';

quietSqliteWarning(process);
const args = process.argv.slice(2);
const json = args.includes('--json');
const roots = args.filter((arg) => !arg.startsWith('--'));
if (roots.length !== 1 || args.length !== (json ? 2 : 1) || args.some((arg) => arg.startsWith('-') && arg !== '--json')) {
  process.stderr.write('Usage: linivera-doctor <work> [--json]\n');
  process.exitCode = 2;
} else {
  const result = await inspectWork(resolve(roots[0]), { packs: await loadBuiltinPacks() });
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`${result.ok ? 'Inspection complete' : 'Inspection found errors'}\n`);
    for (const check of result.checks) process.stdout.write(`[${check.status}] ${check.name}: ${check.message}\n${check.status === 'error' ? `  ${check.details?.code ?? ''}: ${check.details?.message ?? check.details?.error ?? ''}\n` : ''}`);
    for (const action of result.actions) process.stdout.write(`Next: ${action}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}
