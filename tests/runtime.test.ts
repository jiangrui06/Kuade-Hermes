// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateEndpoint, redactLog } from '../src/runtime/policy';
import { runtimeEnvironment } from '../src/runtime/supervisor';
import { extensionPatch, extensionsSchema } from '../src/runtime/extensions';
describe('运行进程边界', () => {
  it('保留 PATH，凭据和其他应用启动参数不传入子进程', () => {
    const source = { PATH: 'C:\\工具;C:\\Windows', OPENAI_API_KEY: 'test-only-secret', DSH_HOME: 'wrong', NODE_OPTIONS: '--inspect', APPDATA: 'C:\\Users\\fixture\\AppData' };
    const result = runtimeEnvironment(source, 'E:\\Kuade Data');
    expect(result.PATH).toBe(source.PATH);
    expect(result.APPDATA).toBe(source.APPDATA);
    expect(result.OPENAI_API_KEY).toBeUndefined();
    expect(result.NODE_OPTIONS).toBeUndefined();
    expect(result.DSH_HOME).toBe('E:\\Kuade Data');
    expect(source.DSH_HOME).toBe('wrong');
  });
  it('拒绝未开放的端点并遮蔽日志中的启动令牌', () => {
    expect(() => validateEndpoint('../settings')).toThrow();
    expect(() => validateEndpoint('session/prompt', true)).toThrow();
    expect(() => validateEndpoint('llm/discoverModels')).not.toThrow();
    for (const verb of ['get', 'create', 'pause', 'resume']) expect(() => validateEndpoint(`goals/${verb}`)).not.toThrow();
    expect(() => validateEndpoint('goals/complete')).toThrow();
    expect(redactLog('http://127.0.0.1:123/?token=test123 Bearer test-secret')).not.toContain('test123');
    expect(redactLog('Bearer test-secret')).not.toContain('test-secret');
  });
});
describe('复用上游 MCP 配置', () => {
  it('转换命令参数而不经过 shell 拼接，并保留中文和空格', () => {
    const config = extensionsSchema.parse({ mcpServers: { local: { command: 'E:\\工具 目录\\server.exe', args: ['--root', 'E:\\中文 项目'] }, off: { command: 'ignored', disabled: true }, remote: { url: 'http://127.0.0.1:9000/mcp' } } });
    const patch = extensionPatch(config) as any;
    expect(patch[0].insert).toHaveLength(2);
    expect(patch[0].insert[0].config.args[1]).toBe('E:\\中文 项目');
    expect(patch[0].insert[1].config.transport).toBe('streamable-http');
  });
  it('拒绝损坏的配置和非 HTTP 服务地址', () => {
    expect(() => extensionsSchema.parse({ mcpServers: { bad: { url: 'file:///C:/Windows' } } })).toThrow();
    expect(() => extensionsSchema.parse({ mcpServers: { bad: { command: '' } } })).toThrow();
  });
});
