import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CHILD = join(import.meta.dirname, 'child-runner.js');
const TX_CHILD = join(import.meta.dirname, 'child-tx.js');

/** root 에서 자식 프로세스로 실행기를 돌리다 scenario 가 정한 시점에 SIGKILL 로 죽인다. */
export function runChild(root, scenario) {
  return spawnSync(process.execPath, [CHILD, root, scenario], { encoding: 'utf8', timeout: 60_000 });
}

/** 여러 파일 쓰기를 자식 프로세스에서 돌리다 scenario 시점에 SIGKILL 로 죽인다. */
export function runTxChild(root, scenario) {
  return spawnSync(process.execPath, [TX_CHILD, root, scenario], { encoding: 'utf8', timeout: 60_000 });
}

/**
 * 자식이 스스로 SIGKILL 로 죽었는지. POSIX 는 signal 로 보고하고,
 * Windows 는 TerminateProcess 로 끝나 signal 없이 종료 코드 1 이 된다.
 */
export function wasKilled(child) {
  if (process.platform === 'win32') return child.signal === 'SIGKILL' || (child.signal === null && child.status === 1);
  return child.signal === 'SIGKILL';
}
