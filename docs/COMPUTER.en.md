# Computer Use integration

2026-10-22: real Kimi K3 capability acceptance passed in the standalone 0.1.12 ZIP. The model loaded the project skill, called search and page-reading MCP tools, and submitted the random marker and official documentation URL through the browser; the host independently checked the POST. It then used the packaged qwen_computer to observe a dedicated Windows window, enter Chinese text and activate its button; the host checked the resulting file. Original credentials and environment fingerprints were unchanged; temporary credentials were removed. See [fresh evidence](acceptance/real-capabilities-packaged-0.1.12-2026-10-22.json). This covers the dedicated Windows and browser flows, not every application or macOS.

[简体中文](COMPUTER.zh-CN.md) · [繁體中文](COMPUTER.zh-TW.md)

2026-10-15: After correcting omitted runtime peer dependencies, standalone 0.1.7 passed real Kimi K3 Skills, search, page reading, browser submission and qwen_computer input/button activation. The receipt binds the application archive and native-component hashes: [packaged real-model acceptance](acceptance/real-capabilities-packaged-0.1.7-2026-10-15.json). Original credentials and environment fingerprints were unchanged; temporary credentials were removed. The following retains historical development-build evidence from 2026-10-14.

Real Kimi K3 input and button activation on a dedicated Windows window now pass. See [real-model acceptance](REAL_CAPABILITIES.en.md) for evidence and limits.

Kuade reuses the user-selected independent `qwen_computer` MCP: CodeBuddy version 0.2.3-local.15, based on MIT-licensed [open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use), upstream baseline `24b7cae4d449a5a8ea58c583e5151096b26de03c`. Original component source, tests, license, and Windows/macOS execution layers are retained. File fingerprints are in `vendor/qwen-computer-use.source.json`. The host reuses Harness's MCP client.

Add Computer Use under Tools and Skills, save, and inspect the nine actually registered tools. The application resolves its bundled resource; end users need no Go, Python, or PATH changes. Existing same-name configuration is preserved. Actions use the current desktop. The selected model interprets screenshots/accessibility state; the component name does not require a Qwen model. Screenshot understanding requires image support. Successful dispatch alone does not prove the application postcondition.

This integration targets Windows x64. The macOS 14+ Go/Swift source is retained, but Kuade's native Mac build, Accessibility/Screen Recording permission flow, and real input acceptance remain pending.

Development requires Go 1.22+. `npm run build:computer` runs Go tests, vet, and build, emitting `resources/computer` with license and SHA-256 provenance. Set `KUADE_GO_EXECUTABLE` to an absolute Go path when needed. The synchronized Windows entry is `node scripts/windows.mjs build:computer`; run it before packaging. Go is not a runtime dependency.

`node scripts/accept-computer.mjs` uses the actual MCP on a dedicated WPF window, checking Chinese input, button outcome, file contents and environment fingerprints. With `KUADE_LIVE_COMPUTER=1`, run `npx playwright test tests/e2e/live-computer.spec.ts` for the Kuade integration gate. Its local model responses are controlled; external-model reasoning is a separate gate. Default regression tests do not manipulate the physical desktop.

2026-10-14: typecheck, 51 unit/component tests, and Go tests/vet/build passed. Native input evidence: `.cache/computer-57dcdf14-60cc-4a88-b571-48b8a10039f3`. Initial fixture startup and fingerprint comparison issues were corrected; failed records are retained. Development component SHA-256: `b80393b2734bb877cb6935d334470c2eb90e2f31f9be1a2db0daeb4feb46d335`. Product integration, packaged release and real-model evidence are recorded separately.

Subsequently added Ollama's declared image capability detection, including models with existing reasoning settings; explicit input settings remain authoritative and unknown capabilities are not guessed from names. Latest typecheck and 52 tests passed. Full development desktop evidence: `.cache/live-computer-82e17742-ad97-44ef-a02f-ff1228ea6a11`, covering component addition, nine registered tools, four native operations, Chinese text saved by the fixture and images reaching the local controlled model endpoint. No user key or external-model screenshot upload was involved. Published 0.1.5 artifacts remain unchanged; these capabilities have not yet been packaged for release.
