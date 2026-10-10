#!/usr/bin/env node
import { quietSqliteWarning } from '../server/warnings.js';

quietSqliteWarning(process);
const { launchViewer, launchError } = await import('../server/view/launcher.js');
try { await launchViewer(process.argv.slice(2)); }
catch (error) { process.stderr.write(`${launchError(error)}\n`); process.exitCode = 1; }
