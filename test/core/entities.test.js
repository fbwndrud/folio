import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readEntities, writeEntity } from '../../core/store/entities.js';
import { FIXTURES, fixturePath, copyFixture, tempDir } from '../support/fixtures.js';

test('entities load with kind, name, aliases and a content rev', async () => {
  const { entities, errors } = await readEntities(fixturePath('novel-3level'));
  assert.deepEqual(errors, []);
  assert.deepEqual([...entities.keys()], ['junho', 'mara', 'red-letter', 'rooftop']);
  const mara = entities.get('mara');
  assert.equal(mara.kind, 'character');
  assert.equal(mara.name, '마라');
  assert.deepEqual(mara.aliases, ['마라 언니']);
  assert.equal(mara.path, 'entities/character/mara.md');
  assert.match(mara.rev, /^sha256:/);
  assert.equal(entities.get('red-letter').kind, 'promise');
});

for (const name of FIXTURES) {
  test(`entity round trip of ${name} is byte-identical`, async () => {
    const { entities } = await readEntities(fixturePath(name));
    const target = await tempDir();
    for (const entity of entities.values()) await writeEntity(target, entity);
    for (const entity of entities.values()) {
      assert.equal(await readFile(join(target, entity.path), 'utf8'), await readFile(join(fixturePath(name), entity.path), 'utf8'));
    }
  });
}

test('kind folder must match the kind field and ids must be unique', async () => {
  const root = await copyFixture('novel-3level');
  await writeFile(join(root, 'entities/location/mara.md'), '---\nid: mara\nkind: location\nname: 마라\n---\n');
  await mkdir(join(root, 'entities/item'), { recursive: true });
  await writeFile(join(root, 'entities/item/x.md'), '---\nid: x\nkind: character\nname: X\n---\n');
  const codes = (await readEntities(root)).errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['DUPLICATE_ENTITY_ID', 'ENTITY_KIND_MISMATCH']);
});

test('writeEntity rejects a path-traversal id and an unsafe explicit path', async () => {
  const target = await tempDir();
  await assert.rejects(
    writeEntity(target, { id: '../evil', kind: 'character', data: {}, body: '' }),
    { code: 'ID_INVALID' },
  );
  await assert.rejects(
    writeEntity(target, { id: 'ok', kind: '../../etc', data: {}, body: '' }),
    { code: 'ID_INVALID' },
  );
  await assert.rejects(
    writeEntity(target, { id: 'ok', kind: 'character', path: '../evil.md', data: {}, body: '' }),
    { code: 'PATH_INVALID' },
  );
  await assert.rejects(access(join(dirname(target), 'evil.md')), { code: 'ENOENT' });
  await assert.rejects(access(join(target, '..', 'evil')), { code: 'ENOENT' });
});
