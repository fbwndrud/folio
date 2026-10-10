import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../../server/stdio.js';

// 10MiB 를 보내지 않고, 같은 SDK 경로(ReadBuffer 초과 → transport.onerror → server.onerror)를 작은 한도로 재현한다.
test('a transport error such as a read buffer overflow leaves one diagnostic line on stderr and nothing on stdout', async (t) => {
  const stderr = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk, ...rest) => {
    stderr.push(String(chunk));
    const callback = rest.find((arg) => typeof arg === 'function');
    callback?.();
    return true;
  };
  t.after(() => { process.stderr.write = originalWrite; });
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const written = [];
  stdout.on('data', (chunk) => written.push(String(chunk)));
  const server = createMcpServer({ tools: [], call: async () => ({ ok: true, result: null }) });
  const closed = new Promise((resolve) => { server.onclose = resolve; });
  await server.connect(new StdioServerTransport(stdin, stdout, { maxBufferSize: 64 }));
  stdin.write('x'.repeat(128));
  await closed;
  process.stderr.write = originalWrite;
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /^folio-mcp: ReadBuffer exceeded maximum size of 64 bytes\n$/);
  assert.deepEqual(written, []);
});
