import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { initWork } from '../../core/work/init.js';
import { validateWorkConfig, loadWorkConfig } from '../../core/work/config.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from '../support/fixtures.js';
import { parseYaml } from '../../core/util/yaml.js';

const levels = [{ name: 'scene', leaf: true }];
test('work language is canonicalized only when explicitly supplied; legacy normalized config stays unchanged', () => {
  const legacy = validateWorkConfig({ levels });
  assert.equal(Object.hasOwn(legacy.config, 'language'), false);
  for (const [language, expected] of [['en', 'en'], ['EN-us', 'en-US'], ['ko', 'ko'], ['zh-hant', 'zh-Hant']]) {
    const result = validateWorkConfig({ levels, language });
    assert.deepEqual(result.errors, []);
    assert.equal(result.config.language, expected);
    const { language: _language, ...rest } = result.config;
    assert.deepEqual(rest, legacy.config);
  }
});

test('invalid work language is rejected instead of silently becoming Korean', () => {
  for (const language of ['', ' ', 'en_US', null, 7, ['en'], {}, 'a'.repeat(36)]) {
    assert.ok(validateWorkConfig({ levels, language }).errors.some(e => e.code === 'WORK_LANGUAGE_INVALID'), JSON.stringify(language));
  }
});

test('init saves canonical language only in new works and preserves existing work bytes', async () => {
  const available = await loadBuiltinPacks();
  const root = join(await tempDir('linivera-language-init-'), 'work');
  assert.equal((await initWork(root, { title: 'Synthetic English work', preset: 'scene', packs: ['novel'], available, language: 'EN-us' })).created, true);
  const before = await readFile(join(root, 'work.yaml'));
  assert.equal(parseYaml(before.toString()).language, 'en-US');
  assert.equal((await loadWorkConfig(root)).config.language, 'en-US');
  assert.equal((await initWork(root, { title: 'Replacement', preset: 'scene', packs: ['novel'], available, language: 'ko' })).created, false);
  assert.deepEqual(await readFile(join(root, 'work.yaml')), before);
});

test('invalid init language is rejected before the new work folder is created', async () => {
  const root = join(await tempDir('linivera-language-invalid-'), 'work');
  await assert.rejects(initWork(root, { title: 'Synthetic', preset: 'scene', packs: ['novel'], available: await loadBuiltinPacks(), language: 'en_US' }),
    e => e.code === 'CONFIG_INVALID' && e.details.errors.some(item => item.code === 'WORK_LANGUAGE_INVALID'));
  await assert.rejects(stat(root), { code: 'ENOENT' });
});
