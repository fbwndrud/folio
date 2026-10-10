import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { openLedger } from '../../core/ledger/ledger.js';

export const FIXTURES = ['novel-3level', 'serial-2level', 'knowledge-book', 'gamebook'];
export const fixturePath = (name) => join(import.meta.dirname, '..', 'fixtures', name);

// 테스트가 만든 임시 폴더를 모아뒀다가 프로세스 종료 시 한 번에 지운다.
// node:test 는 파일마다 별도 프로세스로 도니, 이 훅 하나로 그 파일이 만든 폴더가 다 정리된다.
const createdTempDirs = new Set();
let exitHookRegistered = false;

function registerExitCleanup() {
  if (exitHookRegistered) return;
  exitHookRegistered = true;
  process.on('exit', () => {
    for (const dir of createdTempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 종료 처리 중 오류는 무시한다(다음 폴더 정리를 막지 않는다).
      }
    }
  });
}

export async function tempDir(prefix = 'folio-') {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  createdTempDirs.add(dir);
  registerExitCleanup();
  return dir;
}

/** tempDir 밖에서 폴더를 직접 만들었을 때(예: 임시 루트를 다른 경로로 복사) 정리 대상에 끼워 넣는다. */
export function trackTempDir(dir) {
  createdTempDirs.add(dir);
  registerExitCleanup();
  return dir;
}

/** fixture를 임시 폴더로 복사한다. 테스트는 원본 fixture를 절대 고치지 않는다. */
export async function copyFixture(name) {
  const dir = await tempDir(`folio-${name}-`);
  await cp(fixturePath(name), dir, { recursive: true });
  return dir;
}

/** seeds/<name>.events.yaml 을 events 기록장에 넣는다(테스트 전용 경로). */
export async function seedEvents(root, name) {
  const seeds = parseYaml(await readFile(join(import.meta.dirname, '..', 'fixtures', 'seeds', `${name}.events.yaml`), 'utf8'));
  const ledger = openLedger(root, 'events', { now: () => '2026-09-26T00:00:00.000Z' });
  const records = [];
  for (const [index, seed] of seeds.entries()) {
    records.push(await ledger.append({ type: 'event', eventId: `seed-${index + 1}`, ...seed }));
  }
  return records;
}

/** work.yaml 을 가짜 팩으로 바꾼다. 원래 사용자 검사는 지운다(테스트가 필요한 것만 넣는다). */
export async function useFakePack(root, { checks = {}, overrides = {}, checkSets = ['fake.basic'] } = {}) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, packs: ['fake'], checkSets, checks, overrides }));
}

/** fixture 의 설정·엔티티는 두고 트리만 비운다(큰 틀부터/바로 쓰기 테스트용). */
export async function emptyTreeCopy(name) {
  const root = await copyFixture(name);
  await rm(join(root, 'tree'), { recursive: true });
  await mkdir(join(root, 'tree'));
  return root;
}

export { fakePacks } from './fake-pack.js';
