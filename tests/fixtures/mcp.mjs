import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
const server = new McpServer({ name: 'kuade-acceptance-fixture', version: '1.0.0' });
server.registerTool('echo', { description: 'Echo a controlled acceptance value.', inputSchema: { value: z.string() } }, async ({ value }) => {
  await writeFile(process.argv[2], value, 'utf8');
  await writeFile(process.argv[2] + '.pid', String(process.pid), 'utf8');
  return { content: [{ type: 'text', text: value }] };
});
await server.connect(new StdioServerTransport());
