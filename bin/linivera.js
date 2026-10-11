#!/usr/bin/env node
import { quietSqliteWarning } from '../server/warnings.js';

quietSqliteWarning(process);
const [command, ...args] = process.argv.slice(2);
try {
  if (!command) await import('./folio-mcp.js');
  else if (command === '--help' || command === 'help') {
    console.log(`Linivera

  linivera                           Start the stdio MCP server
  linivera demo [--language en|ko] [--out NEW_FOLDER]
                                     Create a synthetic story and open Studio
  linivera view WORK_FOLDER           Open an existing work
  linivera examples [story|guide|picturebook|fairytale|all] [--language en|ko] [--verify]
                                     Run fixed examples (English by default)

Demo approvals are simulated. Your own work needs your actual decision.
Open the printed browser address. Stop Studio with Ctrl+C.
Node.js 24 recommended; prepared release packages include Studio.`);
  } else if (command === 'demo') {
    const { parseArgs } = await import('node:util');
    const { values, positionals } = parseArgs({ args, options: { language: { type: 'string', default: 'en' }, out: { type: 'string' } } });
    if (positionals.length) throw new Error('Use --out NEW_FOLDER to choose a demo folder.');
    const { runExamples } = await import('../examples/run.js');
    const [result] = await runExamples({ names: ['story'], language: values.language, out: values.out });
    console.log(`Synthetic example · simulated approval\nSaved work: ${result.root}`);
    const { launchViewer } = await import('../server/view/launcher.js');
    await launchViewer([result.root]);
  } else if (command === 'view') {
    const { launchViewer } = await import('../server/view/launcher.js');
    await launchViewer(args);
  } else if (command === 'examples') {
    const { runExampleCli } = await import('../examples/run.js');
    await runExampleCli(args);
  } else throw new Error(`Unknown command: ${command}. Use linivera --help.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
