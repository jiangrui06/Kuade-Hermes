// Live component gate: no fixture results and no model-generated search evidence.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const evidence = resolve('.cache/search-' + randomUUID());
await mkdir(evidence, { recursive: true });
const client = new Client({ name: 'kuade-search-acceptance', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.env.KUADE_UVX ?? 'uvx',
  args: ['--with', 'duckduckgo-mcp-server[browser]==0.7.0', 'duckduckgo-mcp-server==0.7.0'], stderr: 'pipe',
});
let diagnostics = '';
transport.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-12000); });
const receipt = { status: 'not-passed', package: 'duckduckgo-mcp-server@0.7.0', evidence, steps: [] };
try {
  await client.connect(transport);
  const query = 'Electron app relaunch official documentation';
  const search = await client.callTool({ name: 'search', arguments: { query, max_results: 3 } }, undefined, { timeout: 90000 });
  await writeFile(resolve(evidence, 'search.json'), JSON.stringify(search, null, 2));
  const text = search.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
  if (search.isError || !/https?:\/\//.test(text) || !/electron/i.test(text)) throw new Error('搜索未返回可核对的 Electron 网页结果');
  receipt.steps.push({ name: 'search', query, passed: true });
  const page = await client.callTool({ name: 'fetch_content', arguments: { url: 'https://www.electronjs.org/docs/latest/api/app', max_length: 5000 } }, undefined, { timeout: 90000 });
  await writeFile(resolve(evidence, 'page.json'), JSON.stringify(page, null, 2));
  const content = page.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
  if (page.isError || !/app/i.test(content) || content.length < 300 || /^(Error|Failed)/i.test(content)) throw new Error('网页正文读取未通过');
  receipt.steps.push({ name: 'fetch_content', passed: true });
  receipt.status = 'passed';
} catch (error) {
  receipt.error = String(error.message); process.exitCode = 1;
} finally {
  await client.close(); await transport.close();
  await writeFile(resolve(evidence, 'diagnostics.log'), diagnostics);
  await writeFile(resolve(evidence, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
