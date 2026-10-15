# Kuade Harness

For source workspaces on exFAT or disks with slow small-file access, run `node scripts/windows.mjs install`, then `node scripts/windows.mjs dev`. The helper copies source into `%LOCALAPPDATA%/Kuade-development/<project-folder>` for execution. Keep editing the original workspace; the helper does not change the system PATH. It also accepts `typecheck`, `test`, `build`, `test:e2e`, and `package:win`. Run the helper again to sync source changes before testing or building.

[简体中文](../README.md) · [繁體中文](README.zh-TW.md)

Kuade Harness is a local coding workspace. The first release targets Windows desktop. Users configure their own endpoint and credentials, then select models from an automatically retrieved list. Projects and session records stay on the machine; model requests go to the selected provider.

The development Computer Use integration reuses the independent `qwen_computer` MCP and retains its Windows/macOS execution layers. See [Computer Use](COMPUTER.en.md). Run `npm run build:computer` (Go 1.22+) before packaging from source; desktop users do not need Go.

## Branding and task records

Version 0.1.5 uses **Kuade Harness** in windows, installers, the interface and model system identity. An upstream prompt-section extension registers the product identity while preserving agent presets and tools. Dependency names, sources and copyright notices remain accurate. The `Kuade` user-data directory and `Kuade.exe` executable are retained to preserve credentials, sessions and launch paths.

Task records support renaming, searching by name or project directory, and filtering running tasks or tasks with unfinished plans. Names use upstream `session/rename` persistence and normalization; long names are shortened and the accepted name appears in the save notice. Errors preserve the draft; Enter saves and Escape cancels. The list is scoped to the current project. Having no plan does not imply completion.

## Plans and continuation

The conversation shows the agent's step plan, current activity and completed item count. Expand the plan to inspect individual steps. Kuade reuses Harness `todo_write` and the `todos` projection without adding a task database; simple tasks may have no plan.

After cancellation, a turn error, an output limit or an interrupted restart, click “继续任务” (Continue task). A visible new prompt in the same session carries the previous plan and asks the agent to inspect files and test results before proceeding. The current model and execution mode apply. Continuation is unavailable while approval, an answer or engine readiness is pending.

“本轮结束” means the model turn ended. Checklist completion is agent-reported, not independent test evidence. Harness clears the old plan at the next turn start until the agent updates it. Terminated system commands do not resume in place. References: [upstream plans](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/todo/tool-todo/README.md), [session persistence](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence/README.md).

## Development

Windows x64: install `release/Kuade Harness Setup 0.1.5.exe`, or fully extract `release/Kuade Harness-0.1.5-win.zip` and launch its `Kuade.exe`. Open Model Connections, configure a provider, select a model and submit a task in the default workspace; opening another project is optional. These builds are unsigned. See the [acceptance record](ACCEPTANCE.en.md).

Enter a name, protocol, API URL and key; the model list loads automatically. Search and check the models you need, then save. Editing an existing connection reuses its saved key; Refresh reloads the list. Local services without authentication may leave the key blank. Manual IDs remain in a collapsed fallback for providers without a listing endpoint. Discovery reuses upstream `llm/discoverModels` for OpenAI-compatible and Anthropic protocols. A returned catalog does not guarantee chat or tool-call access to every model.

Electron and the agent runtime are bundled. Git operations require Git; the PowerShell tool requires PowerShell 7. MCP commands using `npx`, including the browser preset, also require Node.js/npm and network access for their first download.

Prerequisites: Node.js 22.19+, npm, Git and PowerShell 7.

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run package:win
```

## Boundaries

Startup creates `Documents/Kuade/默认工作区`, so a task can start without a folder picker. Project choices are remembered, and new tasks reuse the current workspace. Harness continues to own workspace registration and session persistence.

The composer selects a provider, a model from that connection's full discovered catalog, and supported reasoning effort. Unconfigured DeepSeek defaults are excluded. Saved models provide an offline fallback; choosing another discovered model registers it automatically on the same connection. Refresh failures keep saved entries and show a notice.

Reasoning choices come from upstream declarations. For Ollama Cloud and standard local Ollama OpenAI-compatible endpoints, the product also reads `/api/show` on demand and offers only reported levels. Unknown capabilities use provider defaults. Switching models does not carry incompatible effort levels. Protocols and session selection still use Harness. References: [Harness provider configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md), [Ollama thinking controls](https://docs.ollama.com/capabilities/thinking).

- `src/main`: desktop lifecycle, IPC admission, folder picker and Git integration.
- `src/preload`: a minimal isolated renderer bridge.
- `src/shared`: product contracts without Electron or upstream imports.
- `src/runtime`: pinned upstream process, authentication, RPC, event streams and MCP composition.
- `src/renderer/features`: separate workspace, task, model, extension and change views.

Reuse the upstream agent loop, model adapters and MCP client. Build only the product experience and necessary integration. The renderer cannot import Node/Electron or launch commands directly. Kuade uses its own branding and preserves upstream notices.

## Behavior and verification limits

Ask mode uses the upstream workspace-write preset with approval when required; it does not ask before every file read. Automatic mode uses the full-access preset. Minimizing keeps the runtime alive; exiting stops it. Automatic idle sleep is blocked while the app runs, but explicit sleep and shutdown still pause computation.

Persisted sessions can be reopened after restart. Interrupted OS processes do not resume in place. Git review includes all unstaged changes, including pre-existing user edits. Restoring a selected tracked file requires confirmation and a matching diff; untracked files are never deleted by restore.

MCP configuration uses the upstream client. Active tasks block a configuration restart. A saved configuration is not proof of a working server. Component tests, real-engine integration, desktop interaction, real-provider behavior and multi-day execution are separate acceptance gates.

Upstream built-in web search requires credentials for DeepSeek's search service; configuring another model provider does not enable that service. Connect a suitable search MCP for other providers. Accounts, fees and availability depend on the chosen service.

Shortcuts: Ctrl+N starts a new task; Ctrl+Shift+I opens the Self-iteration page. Shortcut resolution lives in `src/renderer/features/shortcuts.ts` with no Electron dependency.

Upstream is pinned to `@deepseek-ai/dsh@0.2.0-rc.2`. Sources: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), [Electron](https://www.electronjs.org/docs/latest/tutorial/security), [Playwright MCP](https://github.com/microsoft/playwright-mcp).

See [Self-iteration](SELF_ITERATION.en.md) for modules, prerequisites and acceptance status.
