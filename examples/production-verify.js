import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

/** Independent ZIP reader checks the actual generated publication, not an exporter return flag. */
export function readZipEntries(bytes) {
  const entries = new Map(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const method = bytes.readUInt16LE(at + 8), size = bytes.readUInt32LE(at + 18);
    const length = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + length).toString();
    const start = at + 30 + length + extra, packed = bytes.subarray(start, start + size);
    assert.ok(method === 0 || method === 8);
    const raw = method === 0 ? packed : inflateRawSync(packed);
    let crc = 0xffffffff;
    for (const byte of raw) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    assert.equal((crc ^ 0xffffffff) >>> 0, bytes.readUInt32LE(at + 14));
    assert.equal(raw.length, bytes.readUInt32LE(at + 22));
    entries.set(name, raw); at = start + size;
  }
  assert.equal(bytes.readUInt32LE(at), 0x02014b50);
  return entries;
}

export function verifyEpub(bytes, svg) {
  assert.equal(bytes.readUInt16LE(8), 0);
  assert.equal(bytes.readUInt16LE(28), 0);
  const entries = readZipEntries(bytes);
  assert.equal(entries.keys().next().value, 'mimetype');
  assert.equal(entries.get('mimetype').toString(), 'application/epub+zip');
  assert.match(entries.get('META-INF/container.xml').toString(), /OEBPS\/package.opf/);
  assert.match(entries.get('OEBPS/package.opf').toString(), /<itemref idref="book"\/>/);
  assert.match(entries.get('OEBPS/nav.xhtml').toString(), /book.xhtml#node-/);
  assert.match(entries.get('OEBPS/book.xhtml').toString(), /상자/);
  assert.ok([...entries.values()].some((raw) => raw.toString() === svg));
  return true;
}

export async function verifyViewerCli(repo, root) {
  const child = spawn(process.execPath, [join(repo, 'bin/folio-view.js'), root], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const done = once(child, 'exit');
  let stdout = '', stderr = '', timer;
  try {
    const url = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('viewer CLI timed out')), 15_000);
      child.once('error', reject);
      child.once('exit', () => reject(new Error(`viewer CLI stopped: ${stderr}`)));
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdout.on('data', (chunk) => { stdout += chunk; const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]*/); if (match) resolve(match[0]); });
    });
    const response = await fetch(String(url));
    assert.equal(response.status, 200); assert.match(await response.text(), /<div id="root">/);
    assert.equal(stderr, '');
    return true;
  } finally {
    clearTimeout(timer); child.kill('SIGTERM'); await done;
  }
}
