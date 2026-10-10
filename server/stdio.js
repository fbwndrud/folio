import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadBuiltinPacks } from '../packs/index.js';
import { createToolbox } from './toolbox.js';

export const SERVER_INFO = Object.freeze({ name: 'folio', version: '0.1.0' });

/**
 * 공식 SDK 의 저수준 Server 에 도구 상자를 붙인다. 입력 검증은 도구 상자가 한다(zod 를 쓰지 않는다).
 * 기존 JSON 글 응답을 유지하고 structuredContent에는 성공 {result}, 오류 {error}를 함께 싣는다.
 * 오류는 {code, message, details}이며 isError로 표시한다. 도구별 outputSchema는 이 구조화된 응답의 계약이다.
 * @param {{ tools: readonly any[], call: (name: string, args: any) => Promise<any> }} toolbox
 */
export function createMcpServer(toolbox) {
  const server = new Server({ ...SERVER_INFO }, { capabilities: { tools: {} } });
  // 통로 오류(예: 한 메시지가 SDK 읽기 한도를 넘어 연결이 닫힘)를 stderr 한 줄로 남긴다. stdout 은 MCP 통로라 쓰지 않는다.
  server.onerror = (error) => {
    process.stderr.write(`folio-mcp: ${String(error?.message ?? error).replace(/\s+/g, ' ')}\n`);
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolbox.tools.map(({ name, description, inputSchema, annotations, outputSchema }) => ({ name, description, inputSchema, annotations, outputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const out = await toolbox.call(request.params.name, request.params.arguments ?? {});
    if (out.ok) return { content: [{ type: 'text', text: JSON.stringify(out.result) }], structuredContent: { result: out.result } };
    return { content: [{ type: 'text', text: JSON.stringify({ error: out.error }) }], structuredContent: { error: out.error }, isError: true };
  });
  return server;
}

/**
 * stdio 로 붙는다. 표준 출력은 MCP 통로이므로 여기서는 아무것도 stdout 에 쓰지 않는다. 호스트가 표준 입출력을 닫으면 끝난다.
 * @param {{ packs?: Map<string, any> | null }} [options]
 */
export async function startStdioServer({ packs = null } = {}) {
  const server = createMcpServer(createToolbox({ packs: packs ?? await loadBuiltinPacks() }));
  await server.connect(new StdioServerTransport());
  return server;
}
