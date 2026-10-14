import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { PRODUCT_NAME } from '../shared/branding';

const fields = { disabled: z.boolean().optional(), toolCallTimeoutMs: z.number().int().min(1000).max(600000).optional() };
const serverSchema = z.union([
  z.object({ ...fields, command: z.string().min(1), args: z.array(z.string()).default([]), env: z.record(z.string(), z.string()).optional(), cwd: z.string().optional() }).strict(),
  z.object({ ...fields, url: z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol)), headers: z.record(z.string(), z.string()).optional() }).strict(),
]);
export const extensionsSchema = z.object({ mcpServers: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/), serverSchema).default({}) }).strict();
export type ExtensionsConfig = z.infer<typeof extensionsSchema>;
export const PRODUCT_PATCH = [
  { id: 'system-prompt', config: { includeHarnessIdentity: false, personaPrefix: `You are ${PRODUCT_NAME}, a coding assistant powered by {{model}}. Your product identity is ${PRODUCT_NAME}.`, personaSuffix: `Your working directory is {{cwd}}. You are interacting through the ${PRODUCT_NAME} desktop application.` } },
  { id: 'web-runtime', config: { openBrowser: false, printUrl: true, surfaceContext: false, trustedHosts: [] } },
  // Keep upstream feedback and product analytics outside this independently branded product.
  { id: 'session-telemetry-otel', disabled: true },
  { id: 'desktop-product-telemetry', disabled: true },
  { id: 'product-analytics', disabled: true },
  { id: 'office-to-pdf', disabled: true },
];
export function extensionPatch(config: ExtensionsConfig): unknown[] {
  const rows = Object.entries(config.mcpServers).filter(([, value]) => !value.disabled).map(([name, value]) => {
    const { disabled: _, ...options } = value;
    return { id: `kuade-mcp-${name}`, name: '@deepseek-ai/dsh-mcp-client', config: { ...options, serverName: name, transport: 'url' in value ? 'streamable-http' : 'stdio' } };
  });
  return rows.length ? [{ insert: rows }] : [];
}
export class ExtensionsStore {
  constructor(private home: string, private identityPlugin = new URL('../runtime/identity-plugin.mjs', import.meta.url).href.replace('/app.asar/', '/app.asar.unpacked/')) {}
  async read(): Promise<ExtensionsConfig> {
    try { return extensionsSchema.parse(JSON.parse(await readFile(join(this.home, 'kuade-mcp.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { mcpServers: {} }; throw error; }
  }
  async save(input: unknown): Promise<void> {
    const config = extensionsSchema.parse(input);
    await mkdir(this.home, { recursive: true });
    const target = join(this.home, 'kuade-mcp.json');
    await writeFile(target + '.tmp', JSON.stringify(config, null, 2), { mode: 0o600 });
    await rename(target + '.tmp', target);
  }
  async preparePatch(): Promise<string> {
    const path = join(this.home, 'kuade.patch.json');
    const capabilityPlugin = new URL('./capabilities-plugin.mjs', this.identityPlugin).href;
    const patch = [...PRODUCT_PATCH, { insert: [{ id: 'kuade-identity', name: this.identityPlugin }, { id: 'kuade-capabilities', name: capabilityPlugin }] }, ...extensionPatch(await this.read())];
    // JSON is a YAML subset accepted by the official ordered patch loader.
    await writeFile(path, JSON.stringify(patch, null, 2), { mode: 0o600 });
    return path;
  }
}
