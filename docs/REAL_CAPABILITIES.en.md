# Real-model capability acceptance

See [the 0.2.4 tools and skills journey](CAPABILITY_JOURNEY.en.md) for actual UI interactions, improvements and acceptance boundaries. This Kimi K3 run uses accessible window controls; tool images were not sent to the model, so it does not establish screenshot vision.

2026-10-22: real Kimi K3 capability acceptance passed in the standalone 0.1.12 ZIP. The model loaded the project skill, called search and page-reading MCP tools, and submitted the random marker and official documentation URL through the browser; the host independently checked the POST. It then used the packaged qwen_computer to observe a dedicated Windows window, enter Chinese text and activate its button; the host checked the resulting file. Original credentials and environment fingerprints were unchanged; temporary credentials were removed. See [fresh evidence](acceptance/real-capabilities-packaged-0.1.12-2026-10-22.json). This covers the dedicated Windows and browser flows, not every application or macOS.

The extracted 0.1.11 release passed fresh real Kimi K3 acceptance: load a project Skill, search and fetch an official web page through MCP, submit the exact random marker and document URL through Playwright MCP, then observe a dedicated Windows window, enter Chinese text and click its button through qwen_computer. Independent HTTP results and the native output file matched. Both tasks completed; original credentials and environment fingerprints were unchanged, and temporary credentials were removed. EXE, application archive and native component hashes match the 0.1.11 release. See [fresh real-provider evidence](acceptance/real-capabilities-packaged-0.1.11-2026-10-15.json). This verifies the specified workflows; complex desktop tasks and cross-day stability are recorded separately.

[简体中文](REAL_CAPABILITIES.zh-CN.md) · [繁體中文](REAL_CAPABILITIES.zh-TW.md)

2026-10-15: After correcting omitted runtime peer dependencies, standalone 0.1.7 passed real Kimi K3 Skills, search, page reading, browser submission and qwen_computer input/button activation. The receipt binds the application archive and native-component hashes: [packaged real-model acceptance](acceptance/real-capabilities-packaged-0.1.7-2026-10-15.json). Original credentials and environment fingerprints were unchanged; temporary credentials were removed. The following retains historical development-build evidence from 2026-10-14.

On 2026-10-14, the saved Ollama Cloud Kimi K3 connection, using low reasoning effort, completed these flows through the actual Harness engine in a Kuade development build:

- Loaded a project skill with the upstream `skill` tool. A random acceptance marker existed only in that skill.
- Searched for Electron documentation with DuckDuckGo MCP and fetched the official page.
- Navigated, filled and submitted a form through Playwright MCP. An independent local HTTP server verified the marker and documentation URL.
- Observed a dedicated WPF window through qwen_computer, entered Chinese text and activated its button. The window's independently written result file matched exactly. The model selected `get_app_state`, `set_value` and `click`.

Both tasks recorded an actual `turn/end: completed`. Credentials stayed inside the existing runtime. Credential-file and User/Machine/Process environment fingerprints were unchanged; the original MCP settings were restored.

Final passing evidence: `.cache/real-capabilities-67238442-abc7-4a58-9055-1072c47c6ef5` in the Windows build mirror. See the durable [JSON receipt](acceptance/real-capabilities-2026-10-14.json). Two earlier attempts remain non-passing: an incorrect button locator and an overly specific assertion that rejected supported `set_value`/`Invoke` operations. A complete rerun passed after correcting those acceptance-script issues.

To reproduce, run `scripts/accept-real-capabilities.mjs` from the current build directory with `KUADE_REAL_CAPABILITIES=1`, `KUADE_MODEL_PROFILE` pointing to a profile with a saved model connection, and `KUADE_UVX` set to uvx's path. The current script copies model settings into an isolated acceptance profile, loads three MCP servers and removes temporary credentials afterward. The original user instance and configuration are not used for execution. An interactive Windows desktop is required. Set `KUADE_ACCEPT_PHASE=web` or `computer` to run one flow, or `KUADE_ACCEPT_EXECUTABLE` to test a packaged application and record its version, archive hash and native-component path.

These controlled tasks do not certify arbitrary desktop apps, complex visual targeting, multi-hour tasks, macOS or the published installer. The configured external model processes computer-use images; only the dedicated test window was targeted in this run.
