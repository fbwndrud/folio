import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';

const repo = dirname(import.meta.dirname);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run npm run package:build or npm run package:verify');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--verify')) throw new Error('unsupported package option');
// Keep verification stdout as JSON; build diagnostics, including size warnings, stay visible on stderr.
const build = spawnSync(process.execPath, [npmCli, '--prefix', 'viewer', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
process.stderr.write(build.stdout ?? ''); process.stderr.write(build.stderr ?? '');
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const command = args[0] === '--verify' ? ['scripts/check-package.js'] : [npmCli, 'pack', '--ignore-scripts'];
const result = spawnSync(process.execPath, command, { cwd: repo, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
