# Self-iteration and version handoff

Packaged 0.1.11 recovery passed: a deliberately mismatched candidate version failed its health check, after which independent 0.1.11 startup restored a ready runtime. Native observation matched the recovery PID, version and runtime label. The first attempt failed because Chromium had not yet published UI text in its accessibility tree; its ready receipt and screenshot were retained. Bounded observation of the same PID passed without a product change. See [rollback evidence](acceptance/rollback-packaged-0.1.11-2026-10-15.json). This is packaged failure-recovery acceptance, not a new real-model iteration.

0.1.11 corrects version selection after a manual upgrade. An old entry redirects only when the saved self-update version is strictly newer than the running version and its artifact integrity checks pass. Equal, older or invalid versions do not override the manually launched release; the saved pointer remains unchanged. Version comparison reuses `semver`, including patch ordering, prereleases and build metadata.

2026-10-15: real Kimi initiated self-iteration from the independent 0.1.9 portable package and added Ctrl+Shift+H task history navigation. All 111 baseline/candidate tests and seven gates passed, followed by automatic restart into 0.1.10 and native keyboard checks. After closing it, the original 0.1.9 entry launched 0.1.10 again with the new feature intact. Original source and credentials were unchanged. Reviewed files were integrated after hash checks; a task-count/shortcut wrapping issue was then corrected. Integrated source passed 101 application tests, 13 harness tests, type checking, build and a desktop flow including a narrow window. Final release regression is recorded separately. See [packaged self-iteration and cold start](acceptance/real-self-iteration-packaged-2026-10-15.json).

Integrated 0.1.8 source passed 95 application tests, 7 GitHub evidence tests, typecheck, build and 5 real Electron regression scenarios. The model connection button stays on one line; its shortcut and accessible name were verified. This real iteration started from 0.1.7 without Ctrl+Shift+M. Future runs must select an unimplemented improvement and update independent outcome assertions so existing functionality is not counted as new work.

2026-10-15 real-provider acceptance passed all seven gates: Kimi K3 added Ctrl+Shift+M for model connections, made 30 tool calls, and updated component tests and three-language documentation. The host independently passed 101 baseline/candidate tests, build, packaging and credential-free startup checks, then automatically restarted into candidate 0.1.8. qwen_computer verified the new shortcut and Ctrl+N. Original source and user credentials stayed unchanged; temporary credentials were removed. Reviewed changes were integrated into source, with a separate navigation layout fix and regression checks. This candidate receipt does not establish a new installer release or hours-long/multi-day stability. See [real self-iteration startup gate acceptance](acceptance/real-self-iteration-startup-gate-2026-10-15.json).

2026-10-15 standalone startup gate acceptance passed: a controlled provider used real file tools to modify a candidate, all 91 baseline tests and seven verification gates passed, and the app automatically restarted into test candidate 0.1.8. qwen_computer verified the new Ctrl+Shift+U entry; original source stayed unchanged. The complete flow took approximately 14.1 minutes. Separate controls accepted the complete package and rejected the retained missing-dependency package. This does not certify external-model reasoning or multi-day stability, and does not update the delivered 0.1.7 installer. See the [acceptance record](acceptance/self-iteration-startup-gate-2026-10-15.json).

[简体中文](SELF_ITERATION.zh-CN.md) · [繁體中文](SELF_ITERATION.zh-TW.md)

Select the Kuade source matching the running version, enter a concrete improvement, and start with the workbench's selected model and reasoning level. The host creates a separate source copy, increments the patch version, and submits a standard Harness task. Failed verification preserves source, session and logs for further work and retry. Ctrl+Shift+I opens the Self-iteration page from anywhere; the Ctrl+N new-task shortcut is unchanged.

## Modules

- `source.ts`: explicit source roots, fingerprints and original tests; excludes build outputs, environment files and runtime data.
- `service.ts`: standard Harness task orchestration, state and waiting for other tasks to become idle.
- `process.ts` and `verify.ts`: actual exit codes for dependency installation, typechecking, baseline tests, builds and electron-builder.
- `artifact.ts` and `handoff.ts`: executable and application-resource fingerprints, candidate launch, health checks and rollback attempts.
- `boot-health.ts` and `active-version.ts`: receipts bound to process, version, profile and update attempt; old-entry redirection to a verified version.
- `Iteration.tsx`: start, progress, cancellation, task navigation and verification retry.

Baseline tests and build scripts are stored separately and checked against their original hashes. Deleting candidate tests or changing package scripts does not skip the baseline; changed and new candidate tests also run. Assistant completion prose is not acceptance evidence.

## Update and recovery

Current source adds an independent startup gate. electron-builder writes each candidate to `application/win-unpacked`, beside `source`; validation rejects ancestor directories containing `node_modules`. The baseline preserves and hashes `scripts/check-packaged-startup.mjs`, so editing the candidate's copy does not replace the check. After packaging, the existing Playwright Electron API launches a fresh profile without copied credentials, checks the UI, version, runtime state, session/provider-settings RPCs and bundled native-component path, then closes the check instance. `packaged-startup` is the seventh command gate with an actual exit code. Failure prevents artifact publication and leaves the original application running. Formal handoff and rollback health checks remain in place.

This addresses the dependency inheritance discovered during 0.1.7 extraction acceptance: a package under source can resolve omitted dependencies from ancestor node_modules. Packaging success and startup under source therefore do not establish standalone readiness. The new gate accepted a complete package and rejected the retained missing-dependency package. Changes to local source do not update the previously delivered 0.1.7 installer; full self-iteration verification for this new gate is recorded separately.

Implementation references: [electron-builder configuration/output](https://www.electron.build/docs/configuration/), [Playwright ElectronApplication](https://playwright.dev/docs/api/class-electronapplication).

The current target is Windows x64 with separate version directories, reusing Electron and electron-builder. The old executable is preserved. An external watchdog becomes ready before the old process quits. It launches the candidate and publishes the active-version pointer only after renderer acknowledgement, a ready Harness engine and continued process liveness. A failed candidate is stopped and the previous version is launched. Failed rollback preserves both versions and diagnostics.

The user-data directory stays unchanged. Source copies exclude model credentials and conversations. Successful candidate source becomes the next iteration's starting point; existing portable shortcuts redirect to the verified version. NSIS installation replacement, installed-app updates and macOS updates have separate implementation and acceptance gates.

Prerequisites are Node.js 22+, npm, build-network access and at least 3 GiB free space. The bundled native controller is reused only when its source and artifact hashes match; native changes require Go. Actual disk demand grows with dependencies and retained versions. Historical candidates are not automatically removed.

2026-10-14: 70 unit/component tests, typechecking and the build passed. Coverage includes concurrent starts, cancellation, source isolation, baseline integrity, command failure, real subprocess handoff/rollback, bound receipts and resource changes. The complete controlled-provider desktop flow passed: a real file tool changed the source copy, all dependency/test/build/runtime-install/package commands exited zero, and the app automatically switched from 0.1.5 to 0.1.6. qwen_computer verified the new Ctrl+Shift+I shortcut in the native window. Original source stayed unchanged and the model connection was retained. A mismatched-version test against the final artifact restored the previous desktop and engine. Autonomous changes by a real external model, installed-app updates and cross-day operation remain pending.

References: [Electron app.relaunch](https://www.electronjs.org/docs/latest/api/app#apprelaunchoptions), [electron-builder](https://www.electron.build/), [installed-app updates](https://www.electron.build/docs/features/auto-update/).

The process environment variable `KUADE_BUILD_ROOT` selects a build directory on another drive without changing the profile used for models and sessions.

[Acceptance record](acceptance/self-iteration-2026-10-14.json).

Historical attempt: real Kimi K3 implemented the shortcut, three component tests and trilingual documentation. Both host attempts passed typechecking and 73 tests, but packaging reported `EINVAL` and a Node/V8 memory error. That candidate was not activated or merged and did not pass the full loop.

2026-10-15 update: a new real Kimi K3 run implemented the shortcuts and passed all six host gates, including 82 tests and packaging. The app automatically switched and restarted into 0.1.6. The initial acceptance script read the UI too early; its failed receipt is retained. Independent qwen_computer follow-up observations verified both Ctrl+Shift+I and Ctrl+N. Original source, credentials and system environment stayed unchanged during the update; the accepted feature was then integrated into this repository. See [real self-iteration evidence](acceptance/real-self-iteration-2026-10-15.json). Installed-app updates, macOS and multi-day stability remain unverified.
