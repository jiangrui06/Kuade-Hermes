# Real-model capability acceptance

[简体中文](REAL_CAPABILITIES.zh-CN.md) · [繁體中文](REAL_CAPABILITIES.zh-TW.md)

On 2026-10-14, the saved Ollama Cloud Kimi K3 connection, using low reasoning effort, completed these flows through the actual Harness engine in a Kuade development build:

- Loaded a project skill with the upstream `skill` tool. A random acceptance marker existed only in that skill.
- Searched for Electron documentation with DuckDuckGo MCP and fetched the official page.
- Navigated, filled and submitted a form through Playwright MCP. An independent local HTTP server verified the marker and documentation URL.
- Observed a dedicated WPF window through qwen_computer, entered Chinese text and activated its button. The window's independently written result file matched exactly. The model selected `get_app_state`, `set_value` and `click`.

Both tasks recorded an actual `turn/end: completed`. Credentials stayed inside the existing runtime. Credential-file and User/Machine/Process environment fingerprints were unchanged; the original MCP settings were restored.

Final passing evidence: `.cache/real-capabilities-67238442-abc7-4a58-9055-1072c47c6ef5` in the Windows build mirror. See the durable [JSON receipt](acceptance/real-capabilities-2026-10-14.json). Two earlier attempts remain non-passing: an incorrect button locator and an overly specific assertion that rejected supported `set_value`/`Invoke` operations. A complete rerun passed after correcting those acceptance-script issues.

To reproduce, run `scripts/accept-real-capabilities.mjs` from the current build directory with `KUADE_REAL_CAPABILITIES=1` and `KUADE_UVX` set to uvx's path. This requires a saved model connection, an idle Kuade and an interactive Windows desktop. The script temporarily loads three MCP servers and restores the prior configuration. Set `KUADE_ACCEPT_PHASE=web` or `computer` to run one flow.

These controlled tasks do not certify arbitrary desktop apps, complex visual targeting, multi-hour tasks, macOS or the published installer. The configured external model processes computer-use images; only the dedicated test window was targeted in this run.
