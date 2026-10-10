import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, seedEvents, useFakePack, fakePacks } from './fixtures.js';
import { createFakeHost, driveToEnd } from './fake-host.js';

export const editYaml = async (root, fn) => {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  fn(config);
  await writeFile(path, stringifyYaml(config));
};

/** 검사 몇 개를 끈 채 노드 하나를 커밋해 둔다(되채우기 시험용). 게이트는 auto. */
export async function committedWith({ fixture = 'novel-3level', seed = false, node = 'stairwell', checks = {}, drafts = {}, host = {} } = {}) {
  const root = await copyFixture(fixture);
  if (seed) await seedEvents(root, fixture);
  await useFakePack(root, { checks, overrides: { approve: { mode: 'auto' } } });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const trail = await driveToEnd(makeRunner, createFakeHost({ drafts, ...host }), { start: { node }, until: (o) => o.status === 'done' });
  if (trail.at(-1).status !== 'done') throw new Error(`could not commit ${node}`);
  return { root, makeRunner };
}

export const receiptRecordsOf = (root) => openLedger(root, 'receipts').readAll();
export const rechecksOf = async (root) => (await receiptRecordsOf(root)).filter((r) => r.type === 'recheck');
export const bodyOf = async (root, id) => (await openWork(root)).tree.nodes.get(id).body;
