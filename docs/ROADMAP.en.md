# Kuade Harness self-iteration acceptance goal

[简体中文](ROADMAP.zh-CN.md) · [繁體中文](ROADMAP.zh-TW.md)

2026-10-14. Confirmed scope: automatically update and restart itself; computer control includes Windows applications and browsers.

| Module | Acceptance requirement | Status |
| --- | --- | --- |
| MCP | Show configuration, actually registered tools and call results; independently verify real calls | Real Kimi K3 search, browser and computer tool calls passed |
| Skills | Show skills discovered for the project; a model loads and follows a skill | Real model loaded the skill and submitted its random marker; passed |
| Search | An existing MCP searches the public web, reads pages and returns verifiable sources | Real model searched and fetched official Electron documentation; passed |
| Browser | Playwright MCP navigates, interacts with a form and verifies results | Real model navigation, form filling and submission independently verified by HTTP server; passed |
| Computer control | Prefer the user-selected qwen_computer MCP; observe and operate a controlled desktop window and check actual results | Native, controlled-provider and real Kimi K3 window input/click passed; packaged and complex-task acceptance pending |
| Self-iteration | A real model changes a source copy; independent tests and build pass; the app switches versions, restarts and passes a health check; failures preserve the prior version and diagnostics | Complete controlled-provider iteration, native-window verification and final-artifact rollback passed; real-model acceptance pending |

Reuse Harness registries, `skills/list` and its MCP client. Product diagnostics do not implement another transport or skill parser. Evaluate pinned [Playwright MCP](https://github.com/microsoft/playwright-mcp) (Apache-2.0), [Windows-MCP](https://github.com/CursorTouch/Windows-MCP) (MIT), and [DuckDuckGo MCP](https://github.com/nickclyde/duckduckgo-mcp-server) (MIT). Display prerequisites and measured availability rather than treating configuration as readiness.

Separate iteration orchestration from version launch. Reuse Electron and electron-builder, initially switching version directories for the current portable distribution; evaluate [electron-updater](https://www.electron.build/docs/features/auto-update/) for installed distributions. Keep old builds and original source. Source copies exclude credentials and user conversations. Model completion text does not establish acceptance.

Run automated tests before real application flows for each module. Finally, use an existing real provider to implement a visible improvement in the source copy and actually update/restart the app. Record versions, session ID, changes, exit codes and health results. Multi-hour and cross-day stability remain separate acceptance gates.

Update: the user confirmed reuse of qwen_computer from the existing project; Windows-MCP remains an evaluated candidate. CodeBuddy's local version 0.2.3-local.15 is based on [open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use) (MIT). It exposes nine standard MCP tools and includes a macOS 14+ native execution layer. Real Mac input remains pending hardware acceptance; image understanding depends on the selected model.

Current evidence: 49 unit/component tests passed. After lowering decorator syntax for Node 22, the development desktop passed MCP registration, real echo file results, call receipts and project skill loading (`.cache/e2e-be276732-d80c-49aa-8e90-069cbf5d11b9`). This controlled-provider integration gate does not establish external-model reasoning or packaged-release acceptance.

Later gate: 52 tests passed. Live search component evidence: `.cache/search-27a56a31-7414-474d-a750-5c18366399db`; desktop search integration: `.cache/live-search-d5c07975-1b26-4b5e-bdca-90b3015413c5`. See [Computer Use](COMPUTER.en.md) for its native/input/image gates. See [Self-iteration](SELF_ITERATION.en.md) for update modules and current acceptance boundaries. Autonomous real-model improvement remains pending.
