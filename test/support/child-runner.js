import { writeSync } from 'node:fs';
import { createRunner } from '../../core/run/runner.js';
import { fakePacks } from './fake-pack.js';
import { createFakeHost, driveToEnd } from './fake-host.js';

const [root, scenario] = process.argv.slice(2);
const die = () => process.kill(process.pid, 'SIGKILL');

if (scenario === 'kill-after-first-request') {
  const outcome = await createRunner({ root, packs: fakePacks() }).run({ node: 'next' });
  writeSync(1, JSON.stringify(outcome));
  die();
} else if (scenario === 'kill-during-commit') {
  await driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: { afterBodyWrite: die } }), createFakeHost());
} else if (scenario === 'kill-before-receipt' || scenario === 'kill-after-receipt') {
  const hook = scenario === 'kill-before-receipt' ? 'afterCommitIntentWrite' : 'afterReceiptWrite';
  await driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: { [hook]: die } }), createFakeHost());
} else if (scenario === 'kill-after-check-record' || scenario === 'kill-after-approval-record') {
  const type = scenario === 'kill-after-check-record' ? 'check_result' : 'approval';
  const afterDecision = (record) => { if (record.type === type) die(); };
  await driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: { afterDecision } }), createFakeHost());
} else {
  throw new Error(`unknown scenario ${scenario}`);
}
