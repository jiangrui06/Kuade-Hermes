# Kuade Harness acceptance record

2026-10-22 (0.1.13): Markdown replies, code copying and web links added. 125 application tests and 22 acceptance-tool tests passed. Development and independent ZIP runs passed streaming, native clipboard, narrow layout and history relaunch checks. These runs use controlled SSE and stub the OS web opener. See [features and limits](REPLIES.en.md).

2026-10-22: See the [milestone delivery and requirement results](MILESTONE.en.md). The summary distinguishes fresh release runs, historical evidence and delayed cross-day recovery; the chronological records below remain intact.

2026-10-22: real Kimi K3 capability acceptance passed in the standalone 0.1.12 ZIP. The model loaded the project skill, called search and page-reading MCP tools, and submitted the random marker and official documentation URL through the browser; the host independently checked the POST. It then used the packaged qwen_computer to observe a dedicated Windows window, enter Chinese text and activate its button; the host checked the resulting file. Original credentials and environment fingerprints were unchanged; temporary credentials were removed. See [fresh evidence](acceptance/real-capabilities-packaged-0.1.12-2026-10-22.json). This covers the dedicated Windows and browser flows, not every application or macOS.

2026-10-22 UI correction (0.1.12): execution status follows actual Harness turn boundaries. A completed goal with an unfinished checklist shows that the turn ended and asks the user to check the plan. When a turn projection is empty, fixed-snapshot pagination finds the latest persisted plan and labels it historical. Explicit clearing, new plans and session switches take precedence; read errors are not displayed as missing plans. All 117 application tests, 22 acceptance tests, typecheck and build passed. Four real Electron flows passed, including interrupted and completed retained cross-day sessions. See [development acceptance](acceptance/task-progress-ui-2026-10-22.json). The 0.1.12 ZIP also passed independent startup with the older version pointer preserved, four desktop flows and archive integrity checks; see [release evidence](acceptance/release-0.1.12-2026-10-22.json). The NSIS installer was built but not executed in this run.

Verified 2026-10-22: the 24-hour workload completed 1,441 checks over 1,851,685 rows. Original overall acceptance remains not-passed, with coordinator exit code 1. Confirmed cause: reading only the latest 100 messages omitted persisted plans at sequences 27 and 50. Fixed-snapshot full pagination now passes 110 application tests and 22 acceptance-tool tests. Delayed same-session recovery passed: another restart retained the full history and goal, the real model completed round three, and independent CLI verification confirmed 137 input rows, 117 paid records and 791682 cents; runner exit code was 0. The original failure receipt remains unchanged. See [recovery evidence](acceptance/real-goal-post-soak-recovery-2026-10-22.json). See [run record](acceptance/real-goal-24-hour-0.1.11-observer-retry-2026-10-16.json).

2026-10-16 update: this 0.1.11 24-hour run ended at 17:17 UTC+8 and remains not passed. The last workload snapshot covers about 6 hours 44 minutes, 405 checks and 520,425 rows. One read-only session/list observation raised fetch failed; the runner then cleaned up and closed the application. The native observer recorded coordinator exit code 1. Whether the engine had exited or the connection failed transiently is unverified. Raw receipts, screenshot, logs and session are retained; temporary credentials were removed. Neither 24-hour duration nor restart recovery completed. The acceptance observer now has bounded read-only retries and diagnostics before cleanup; any new long run needs separate evidence.

2026-10-16: The first 24-hour run was interrupted by the 0.1.8 installer after about 73 minutes and remains unsuccessful. The second 0.1.9 run was interrupted after about 9 hours 8 minutes: both test processes and the original host handle were absent, and no final receipt existed. Windows had not rebooted; the termination cause is unverified. That run remains not passed and temporary credentials were removed; see the [interruption record](acceptance/real-goal-24-hour-0.1.9-2026-10-15.json). The independent-host recovery preflight passed. A complete 0.1.11 rerun began at 2026-10-16 10:32 UTC+8 and ended at 17:17 before final verification or recovery. The native exit observer recorded exit code 1; see the [terminated run](acceptance/real-goal-24-hour-0.1.11-2026-10-16.json).

The extracted 0.1.11 release passed fresh real Kimi K3 acceptance: load a project Skill, search and fetch an official web page through MCP, submit the exact random marker and document URL through Playwright MCP, then observe a dedicated Windows window, enter Chinese text and click its button through qwen_computer. Independent HTTP results and the native output file matched. Both tasks completed; original credentials and environment fingerprints were unchanged, and temporary credentials were removed. EXE, application archive and native component hashes match the 0.1.11 release. See [fresh real-provider evidence](acceptance/real-capabilities-packaged-0.1.11-2026-10-15.json). This verifies the specified workflows; complex desktop tasks and cross-day stability are recorded separately.

0.1.11 installer and portable ZIP are available. This release prevents an older saved self-update from overriding a manually launched newer release. All 110 application tests, 13 harness tests, type checking, build and five packaged Electron flows passed. Real 0.1.10 and original-user 0.1.6 update pointers were copied into credential-free temporary profiles: the new UI, engine and RPC started correctly while saved pointers remained unchanged. Original user configuration was not modified. All 24,046 ZIP entries passed CRC checks and extracted startup passed. See the [release record](acceptance/release-0.1.11-2026-10-15.json). This installer was built but not executed; install/uninstall guard evidence is reused from 0.1.9 to avoid interrupting the active 24-hour test.

2026-10-15: real Kimi initiated self-iteration from the independent 0.1.9 portable package and added Ctrl+Shift+H task history navigation. All 111 baseline/candidate tests and seven gates passed, followed by automatic restart into 0.1.10 and native keyboard checks. After closing it, the original 0.1.9 entry launched 0.1.10 again with the new feature intact. Original source and credentials were unchanged. Reviewed files were integrated after hash checks; a task-count/shortcut wrapping issue was then corrected. Integrated source passed 101 application tests, 13 harness tests, type checking, build and a desktop flow including a narrow window. Final release regression is recorded separately. See [packaged self-iteration and cold start](acceptance/real-self-iteration-packaged-2026-10-15.json).

Version 0.1.9 fixes installer termination of other Kuade instances. All 96 application tests, 13 harness tests, type checking, build, five packaged Electron flows, ZIP integrity and current-user silent installation/uninstallation passed. Setup and uninstall return 2 while preserving a running witness; original model configuration remained unchanged. Installed startup and screenshot passed; earlier screenshot timeouts remain recorded without attributing them to a product defect. See the [release record](acceptance/release-0.1.9-2026-10-15.json) and [installer notes](INSTALLER.en.md). Builds are unsigned; interactive wizard and administrator installation remain separate checks. Real-provider feature evidence below is reused from the completed 0.1.8 runs.

The 0.1.8 installer closes same-name processes outside its target directory. Do not use that older installer while tasks are running.

## 0.1.8 standalone release checks (2026-10-15)

The installer and portable ZIP were built and copied to `release` with matching hashes. The independent package directory passed five real Electron regression scenarios. All 24,049 ZIP entries passed CRC checks; extracted executable and app archive hashes match, and the extracted app passed a separate startup check. The installer is unsigned; wizard/uninstall acceptance remains pending. See the [machine record](acceptance/release-0.1.8-2026-10-15.json).

Real Kimi self-iteration passed seven gates, automatic update/restart and native shortcut verification; see the [self-iteration record](acceptance/real-self-iteration-startup-gate-2026-10-15.json). A fresh real Kimi run against the standalone 0.1.8 ZIP passed Skills, search, page reading, browser submission and qwen_computer Windows input/button operations. Original credentials and environment remain unchanged and temporary credentials were removed; see the [fresh capability record](acceptance/real-capabilities-packaged-0.1.8-2026-10-15.json). Two-hour workload and same-goal restart recovery passed; the original 24-hour run was interrupted by the installer and a full 0.1.9 rerun has started, as recorded in [ongoing goals](GOALS.en.md); the user-selected [local project manager benchmark](PROJECT_BENCHMARK.en.md) has passed within the scope described below.

[简体中文](ACCEPTANCE.zh-CN.md) · [繁體中文](ACCEPTANCE.zh-TW.md)

The local project manager benchmark now passes: real Kimi completed three automatic rounds, producing 13 source files and 14 passing tests. Independent API, database restart, browser CRUD and filtering checks passed; see [results](PROJECT_BENCHMARK.en.md). This host regression passed 95 application tests and 13 acceptance-harness tests. This is a scoped multi-module project, not evidence for arbitrary large-project capability.

After extracting the portable 0.1.7 ZIP into an independent short directory, real Kimi K3 passed automatic round two, disarmed restart, explicit round-three completion and independent CLI verification. See [packaged goal recovery](acceptance/real-goal-packaged-0.1.7-2026-10-15.json). This is a short recovery test; multi-hour and multi-day stability remain unverified.

Date: 2026-10-13. Windows x64, Electron 44.7.0, DeepSeek Harness `0.2.0-rc.2`. This is a runnable first preview.

## 0.1.7 ongoing goals and standalone distribution

2026-10-15: Added goal creation, pause, automatic continuation and explicit restart recovery using Harness's goal service. The 87 existing application tests, one new packaging dependency check, seven acceptance-verifier tests and type checking passed. Six Electron regressions passed against the package outside the source tree, covering models, files, terminal approvals, MCP, native editing menus, ongoing goals, computer control and plan recovery.

Independent extraction exposed 27 missing required peer dependencies in the first package. Running inside the build directory had inherited these dependencies from ancestor node_modules and masked startup failure. Existing component versions are now explicit production dependencies, with a lockfile regression check. Packaged tests reject directories with ancestor node_modules. Original failures are retained; the corrected package was retested outside the source tree. See the [release receipt](acceptance/release-0.1.7-2026-10-15.json).

Real Kimi K3 completed Skills loading, search, page reading, browser submission and dedicated Windows window input/button activation in the corrected standalone package. Independent HTTP/file checks passed; original credentials and environment fingerprints were unchanged, and temporary credentials were removed. See [real-model evidence](acceptance/real-capabilities-packaged-0.1.7-2026-10-15.json). Earlier self-iteration and GitHub results remain separately documented in [self-iteration](SELF_ITERATION.en.md) and [GitHub](GITHUB.en.md); they were not rerun this turn.

Windows installer and ZIP artifacts are under release, with `SHA256SUMS-0.1.7.txt`. The ZIP has 24,049 entries and passed CRC checks and extraction into a short directory. The longest internal path is 194 characters; use a short destination such as `D:\Kuade`. An earlier long-directory extraction hit Windows path-length limits and remains recorded. Installer wizard, uninstall, multi-hour/multi-day tasks and complex desktop scenarios remain separate pending gates. Builds are unsigned.

## 0.1.5 branding and task records

2026-10-14: Kuade Harness branding covers windows, the interface, installers and model system identity. The upstream `systemPrompt.section` extension registers the product identity; the original application's identity and Web GUI context injection are disabled. Agent presets, tools and accurate dependency attribution are preserved. The user-data directory and executable name remain compatible with existing settings.

Task records add renaming, name/directory search and status filters using upstream `session/rename`, without a separate persistence format. Desktop testing found a stale title after restart: the cached list was at sequence 60 while the durable projection was at 61. Cold-list recovery now reads durable projections with at most four concurrent requests, correcting titles, plans and blank flags.

Type checking, production build and 44 automated tests passed. New component coverage includes name/directory search, filters, blank input, preserving drafts on save failure, duplicate-submit prevention and Escape cancellation. The development branding/model/rename/restart-continuation flow passed in 21.2 seconds; evidence: build cache `.cache/default-models-b3bd6dea-1a35-4c72-9b63-44acdf06d03c`. Actual requests are checked for both `system` and reasoning-model `developer` instruction roles. The initial cold-cache failure and a subsequent system-only assertion failure were corrected and are not counted as passes.

All four packaged Electron flows passed in approximately 1.6 minutes: branding/models/rename recovery 21.7s, terminal/Git/MCP/questions 37.9s, native editing menu 7.6s, and plans plus stopped/interrupted recovery 25.2s. Evidence directories in the build cache: `.cache/default-models-bca8a83d-5996-4270-a47a-0191c4b4a7e7`, `.cache/e2e-50284779-ece0-4e40-95e3-ce3ccbe1c2be`, `.cache/task-progress-b01e52ca-99f3-45de-9c63-62454e317fda`. The executable ProductName and FileDescription are Kuade Harness; ProductVersion is 0.1.5.0. The identity extension is included in unpacked resources. These flows use controlled model responses with real runtime, tools and desktop windows; they do not establish cross-day stability or real-model large-project capability.

The normal user-profile startup check passed: product name Kuade Harness, version 0.1.5, the existing `AppData/Roaming/Kuade` directory, 18 existing models and an unchanged credential-file fingerprint. Evidence: build cache `.cache/startup-0.1.5-4b80f557-9456-4725-a111-78e288663dc2/acceptance.json`. No additional external-model inference was tested this turn. `release/Kuade Harness Setup 0.1.5.exe` and `release/Kuade Harness-0.1.5-win.zip` were copied and their SHA-256 hashes verified; see `release/SHA256SUMS-0.1.5.txt`. The installer wizard and uninstall flow have not been exercised on the user's system.

## 0.1.4 task plans and continuation after interruption

2026-10-14: reused upstream `todo_write`, the `todos` projection and durable events in a separate progress derivation module and step panel. States distinguish questions, approvals, running, stopped, interrupted, errors, output limits and turn completion. Incomplete plans retain a Continue action. It sends a visible new prompt with the previous plan in the original session, asking the agent to inspect files and tests before proceeding instead of automatically replaying commands. Harness clears the old plan at the next turn start until it is updated.

41 automated tests, type checking and production build passed. New component and state coverage includes model prose not establishing success, incomplete plans after turn completion, cancellation/interruption/error/limit states, waiting, disabled continuation and plan transfer.

This acceptance covers plan display and manual continuation, not hours-long or overnight reliability. Plan completion is agent-reported and still requires independent file and test verification.

Fixed a history-list omission exposed by interruption testing: the upstream cold-list `blank` hint can lag the durable log. Cold sessions marked blank are now checked with `session/projections`, with at most four concurrent reads, before being hidden. Read failures retain a visible entry. No persistence format change or additional database was introduced.


All 4 development Electron flows passed (about 1.7 minutes): default workspace/model selection 20.0 seconds, existing tools 43.5 seconds, native menu 8.5 seconds, and plans with two continuation paths 29.1 seconds. The new flow executes real `todo_write` and file tools, tests cancel/restart and exit-during-run/restart, continues the same session, and independently checks both files, retained history and progress from 1/2 to 2/2. Evidence: build cache `.cache/task-progress-e310f76d-644d-469d-a2b4-0374a31fe440`. Model responses are controlled. Earlier runs failing on test entry selection, task selection or the stale blank cache are not counted as passes.


All four packaged flows have passing evidence: default workspace/model selection 18.0 seconds, native menu 7.0 seconds, and plans with cancellation/interruption recovery 26.0 seconds (`.cache/task-progress-4c8a0bf3-53ac-42f6-9dcd-88f66f926dfe`). The existing tools flow passed a targeted rerun in 45.2 seconds (`.cache/e2e-a8ecacbd-bd21-4fb9-b895-a17ec926667b`). Its first attempt included an unscripted hello message and navigation; its second stopped at screenshot capture. Neither counts as passing. Restoring the isolated test window before capture resolved the shared-desktop capture retry; no product code was changed for this.

Startup with the normal user profile passed: version 0.1.4, 18 models returned, and identical credential-file hashes before and after upgrade. No key was re-entered or replaced. Evidence: `.cache/startup-0.1.4-d71cf7df-9669-4c36-880e-f319b1e27689/acceptance.json`. No additional external-model inference acceptance was performed in this increment. Installer and ZIP copies in `release` match their source SHA-256 hashes; see `release/SHA256SUMS-0.1.4.txt`.


## 0.1.3 default workspace, complete catalogs and reasoning controls

2026-10-14: added default workspace initialization, remembered project selection, full per-connection model discovery, registration on first selection, and capability-based reasoning controls. User files use `Documents/Kuade/默认工作区`; tests stay isolated and existing projects are not relocated. Ollama capabilities come from `/api/show`; other connections use upstream declarations. Unknown capabilities do not produce guessed effort levels.

30 automated tests, type checking and production build passed. All 3 development desktop flows passed in about one minute: default workspace 16.6 seconds, existing tools 37.1 seconds, native menu 6.8 seconds. The new flow verifies actual file creation without a directory picker, unselected models in the complete catalog, the changed model and actual `high` / disabled `none` wire parameters, and workspace identity plus effort retention after restart. Evidence: build cache `.cache/default-models-8fbe6d00-149c-496d-8a05-9b1b083f546c` and `.cache/e2e-51b4a778-272c-49af-b677-e3b5337102f4`.

All packaged 0.1.3 desktop regressions passed: new flow 17.2 seconds, existing tools 36.9 seconds, native menu 6.9 seconds. Evidence: `.cache/default-models-2ea588d0-1cdb-4be2-855b-b57de55bc9bf` and `.cache/e2e-76aa1aae-bd65-4a1d-b1c2-b6fdc291a19c`. Copied installer and ZIP hashes match; see `release/SHA256SUMS-0.1.3.txt`.

Real Ollama acceptance passed with exit code 0: the composer listed 18 models, switched to another entry and back to `kimi-k3`, and exposed default, off, low, high and max. A real low-effort task wrote a uniquely named file in `D:/Kuade/默认工作区`; its content was independently checked. The script restored a blank task and default effort afterward. Evidence: `.cache/real-workbench-34280068-d201-4eb4-a358-cffced91720d/acceptance.json` and screenshot; reproduction: `scripts/accept-workbench.mjs`. Earlier script defects matching an old task and an exact button name were fixed; interrupted runs are not counted as passing evidence. Only Kimi's low-effort real call was tested here; listed models have not each passed inference, quota or entitlement checks.

## 0.1.2 automatic model discovery

Reuses upstream `llm/discoverModels`. Entering an API URL and key retrieves a searchable, selectable list with refresh and saved-credential reuse. Manual IDs remain a collapsed compatibility fallback. Changing the destination or protocol does not automatically forward the saved credential; stale responses are ignored and provider errors do not expose raw credential text.

Type checking, production build, and 25 automated tests across 9 files passed. The real Electron development workflow passed in 44.5 seconds, covering invalid keys, OpenAI / Anthropic discovery protocols, selection and saving, discovery using saved credentials after restart, and existing file, terminal, MCP, approval and cancellation flows. Evidence: build cache `.cache/e2e-7a81d616-819d-4ac4-ae60-d4c7f733c9e7`. A returned catalog is not proof that every model's reasoning and tool access have been tested.

Both packaged desktop regressions passed in 50.5 seconds: full workflow 41.1 seconds and native menu 7.2 seconds. Evidence: build cache `.cache/e2e-d9521f88-9677-4d02-a0e9-ed1325336cbb`. Delivered files were copied and SHA-256 verified; see `release/SHA256SUMS-0.1.2.txt`.

Real Ollama Cloud acceptance passed: the saved credential retrieved 18 models, and `kimi-k3` created `sum.mjs` and `sum.test.mjs` in an isolated temporary project and ran its tests. Independent checks also validated normal sums, empty arrays, negative values and invalid inputs. Evidence: build cache `.cache/real-model-f8e8356b-2a46-4a57-804e-e3ba99e2f54b`, including `discovery.json`, `acceptance.json` and screenshots. The initial configuration used the website root and a misspelled model ID. Following [Ollama's official documentation](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx), the endpoint was corrected to `https://ollama.com/v1` and the catalog ID to `kimi-k3`; the saved key was preserved.

## 0.1.1 context menu fix

Added a native editing menu for model settings, password fields, task input and the MCP editor. It reuses Electron editing roles and Chromium capability flags without exposing clipboard access to the renderer. Three new menu tests bring the total to 20 passing automated tests; type checking and building passed. Real desktop acceptance checks right-click events, native menu display, native paste handlers, actual field values, Ctrl+V and undo. Password tests use fixture values. Clipboard contents are preserved in memory and restored, never logged or written to disk.

Packaged 0.1.1 passed the native-menu regression (10.8 seconds) and full desktop workflow (34.8 seconds), including a new assertion that saved model connections survive restart. Evidence: build cache `.cache/e2e-dc54c586-ab95-4d1f-b94e-b8fb234ec2d5`; delivery checksums: `release/SHA256SUMS-0.1.1.txt`. The manually invoked `scripts/accept-model.mjs` sends no model request when a complete user connection is missing.

## 0.1.0 baseline verification

- Type checking, production build, and 17 automated tests across 7 files passed.
- Development and packaged `Kuade.exe` passed a real Electron workflow: configure a model, open a project with a Chinese path, write a real file, restart and restore history, approve a PowerShell command, discover and invoke an MCP tool, answer an agent question, and cancel a waiting task.
- Assertions checked file contents, terminal output, MCP invocation markers and termination of the MCP process after application exit.
- Tests using a real temporary Git repository covered selective restore, stale-diff rejection and preservation of unrelated edits.
- Packaging includes the supplied icon, Kuade product metadata, an installer and a ZIP distribution. Builds are unsigned.
- ZIP extraction verified all 21,341 files. The extracted application passed the full desktop regression again (47.3 seconds). SHA-256 checks matched after copying delivery files; checksums are in `release/SHA256SUMS.txt`.
- Before/after Machine and User environment comparisons found no changes. System PATH was preserved.

The model endpoint supplies scripted local responses and the folder dialog returns a fixture path. The engine, desktop windows, tools and filesystem are real. These checks establish integration behavior, not external model reasoning quality. Packaged regression evidence is under the build cache at `.cache/e2e-8c7c22b5-307d-4e36-87e5-11a849661ca7`.

ZIP regression evidence: `.cache/e2e-ea187755-685e-4f2f-877f-0d01ab5f3acf`. [Workbench screenshot](images/workbench.png).

## Pending acceptance

Version 0.1.2 passed the small Ollama Cloud coding task described above. Other models and providers, large projects, autonomous self-iteration and multi-hour/multi-day reliability remain unverified. Background execution, persisted history, event reconnection and cancellation are available; terminated OS processes are not restored in place after exit.

Browser MCP, individual search providers and custom Skills have not each been tested. NSIS installation, uninstallation and upgrades have not been executed; the packaged application itself has passed. The local web edition is deferred.

The self-extracting portable EXE exceeded the local 180-second startup test limit, so delivery uses a ZIP that is extracted once before launching.

## Reproduction and data

Use `node scripts/windows.mjs test`, `typecheck`, `build` or `test:e2e`. Set `KUADE_TEST_EXECUTABLE` to the absolute packaged `Kuade.exe` path for packaged acceptance. Sessions and model settings use the `harness` subdirectory of Electron's user-data directory. Tests isolate data through `KUADE_USER_DATA`. Do not publish user-data directories containing credentials.
