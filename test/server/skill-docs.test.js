import { tmpdir } from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { TOOLS } from '../../server/tools/definitions.js';

const SKILL = join('skill', 'folio');
const docs = async () => [join(SKILL, 'SKILL.md'), ...(await readdir(join(SKILL, 'references'))).map((f) => join(SKILL, 'references', f))];

test('the skill is one folder named folio and the old folio-checks skill is gone', async () => {
  const text = await readFile(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(text, /^---\nname: folio\ndescription: .+\n---\n/);
  await assert.rejects(stat(join('skill', 'folio-checks')), { code: 'ENOENT' });
  assert.match(await readFile(join('skill', 'README.md'), 'utf8'), /folio\/SKILL\.md/);
});

test('every folio_* name the skill mentions is a real tool, and every tool is mentioned', async () => {
  const names = new Set(TOOLS.map((t) => t.name));
  const mentioned = new Set();
  for (const file of await docs()) {
    for (const [name] of (await readFile(file, 'utf8')).matchAll(/folio_[a-z_]+/g)) {
      assert.ok(names.has(name), `${file}: ${name}`);
      mentioned.add(name);
    }
  }
  assert.deepEqual([...names].filter((n) => !mentioned.has(n)), []);
});

test('the skill does not tell the host to call core functions', async () => {
  for (const file of await docs()) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /commitNode|createRunner|workStatus\(|core\/run\//, file);
  }
});

test('every reference file is linked from SKILL.md', async () => {
  const text = await readFile(join(SKILL, 'SKILL.md'), 'utf8');
  for (const file of await readdir(join(SKILL, 'references'))) assert.match(text, new RegExp(`\\(references/${file.replace('.', '\\.')}\\)`), file);
});


test('standalone copied resource guidance contains its contracts and resolves local links', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'folio-standalone-skill-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const installed = join(home, '.claude', 'skills', 'folio');
  await cp(SKILL, installed, { recursive: true });
  const entry = await readFile(join(installed, 'SKILL.md'), 'utf8');
  assert.match(entry, /\(references\/resources\.md\)/);
  const reference = join(installed, 'references', 'resources.md');
  const text = await readFile(reference, 'utf8');
  for (const [, href] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^[a-z]+:/i.test(href) || href.startsWith('#')) continue;
    const target = resolve(dirname(reference), href.split('#')[0]);
    await stat(target);
    assert.ok(!relative(installed, target).startsWith('..'), href);
  }
  for (const name of ['folio_resources', 'folio_inputs', 'folio_policy', 'folio_operations', 'folio_resource_query']) assert.ok(text.includes(name), name);
  for (const contract of ['expectedSelectionRevision', 'inputSnapshotId', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId', 'maxInputBytes', 'allowedActions', 'capability', 'authority:{actor:user,attested:true}', '실제 사용자', 'atRevision', 'atCheckpoint', 'requireCurrent', 'allowStale', 'PROJECTION_NOT_CURRENT', 'reviewRequired', 'coverage', 'evidence', 'receiptId']) assert.ok(text.includes(contract), contract);
});
