import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const REPO = join(import.meta.dirname, '..', '..');
export const BIN = join(REPO, 'bin', 'folio-mcp.js');

/** 실제 실행 파일을 자식 프로세스로 띄우고 MCP(stdio)로 붙는 가짜 호스트. close()가 자식 프로세스를 끝낸다. */
export async function connectFolio() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [BIN], cwd: REPO, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const client = new Client({ name: 'folio-test-host', version: '0.0.0' });
  await client.connect(transport);
  async function call(name, args) {
    const response = await client.callTool({ name, arguments: args });
    const body = JSON.parse(response.content[0].text);
    return response.isError ? { ok: false, error: body.error } : { ok: true, result: body };
  }
  return { client, call, stderr: () => stderr, close: () => client.close() };
}
