import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportFixture } from '../support/export-work.js';
import { exportWork } from '../../core/export/export-work.js';

test('한국어 초안은 상태를 계속 알리면서 긴 목차와 경고를 접어 내보낸다', async (t) => {
  const f = await exportFixture(t);
  const output = await exportWork({ root: f.root, output: f.output('ko'), language: 'ko-KR' });
  const html = await readFile(join(output.output, 'index.html'), 'utf8');
  assert.match(html, /lang="ko-KR"/);
  assert.match(html, /검토용 초안 — 검토를 완료하지 않은 절/);
  assert.match(html, /aria-label="목차"><details><summary>목차/);
  assert.match(html, /<details><summary>검토할 항목 · \d+/);
  assert.match(html, /이 절은 Folio 검토를 완료하지 않았습니다/);
  assert.match(html, /자료 목록/);
  assert.ok(output.warnings.some(w => w.code === 'EXPORT_UNVERIFIED'));
  assert.ok(html.includes('href="#source-ref"'));
});

test('영어 판본 안내는 영어로 유지하고 사용자 원고는 번역하지 않는다', async (t) => {
  const f = await exportFixture(t);
  const output = await exportWork({ root: f.root, output: f.output('en'), language: 'en' });
  const html = await readFile(join(output.output, 'index.html'), 'utf8');
  assert.match(html, /Draft edition — some sections have not completed review/);
  assert.match(html, /<summary>Items to review/);
  assert.match(html, /<h2>Sources<\/h2>/);
  assert.match(html, /합성 제목/);
  assert.doesNotMatch(html, /검토용 초안 —/);
});
