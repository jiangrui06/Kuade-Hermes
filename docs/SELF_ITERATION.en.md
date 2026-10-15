# Self-iteration and version handoff

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

The current target is Windows x64 with separate version directories, reusing Electron and electron-builder. The old executable is preserved. An external watchdog becomes ready before the old process quits. It launches the candidate and publishes the active-version pointer only after renderer acknowledgement, a ready Harness engine and continued process liveness. A failed candidate is stopped and the previous version is launched. Failed rollback preserves both versions and diagnostics.

The user-data directory stays unchanged. Source copies exclude model credentials and conversations. Successful candidate source becomes the next iteration's starting point; existing portable shortcuts redirect to the verified version. NSIS installation replacement, installed-app updates and macOS updates have separate implementation and acceptance gates.

Prerequisites are Node.js 22+, npm, build-network access and at least 3 GiB free space. The bundled native controller is reused only when its source and artifact hashes match; native changes require Go. Actual disk demand grows with dependencies and retained versions. Historical candidates are not automatically removed.

2026-10-14: 70 unit/component tests, typechecking and the build passed. Coverage includes concurrent starts, cancellation, source isolation, baseline integrity, command failure, real subprocess handoff/rollback, bound receipts and resource changes. The complete controlled-provider desktop flow passed: a real file tool changed the source copy, all dependency/test/build/runtime-install/package commands exited zero, and the app automatically switched from 0.1.5 to 0.1.6. qwen_computer verified the new Ctrl+Shift+I shortcut in the native window. Original source stayed unchanged and the model connection was retained. A mismatched-version test against the final artifact restored the previous desktop and engine. Autonomous changes by a real external model, installed-app updates and cross-day operation remain pending.

References: [Electron app.relaunch](https://www.electronjs.org/docs/latest/api/app#apprelaunchoptions), [electron-builder](https://www.electron.build/), [installed-app updates](https://www.electron.build/docs/features/auto-update/).

The process environment variable `KUADE_BUILD_ROOT` selects a build directory on another drive without changing the profile used for models and sessions.

[Acceptance record](acceptance/self-iteration-2026-10-14.json).

Historical attempt: real Kimi K3 implemented the shortcut, three component tests and trilingual documentation. Both host attempts passed typechecking and 73 tests, but packaging reported `EINVAL` and a Node/V8 memory error. That candidate was not activated or merged and did not pass the full loop.

2026-10-15 update: a new real Kimi K3 run implemented the shortcuts and passed all six host gates, including 82 tests and packaging. The app automatically switched and restarted into 0.1.6. The initial acceptance script read the UI too early; its failed receipt is retained. Independent qwen_computer follow-up observations verified both Ctrl+Shift+I and Ctrl+N. Original source, credentials and system environment stayed unchanged during the update; the accepted feature was then integrated into this repository. See [real self-iteration evidence](acceptance/real-self-iteration-2026-10-15.json). Installed-app updates, macOS and multi-day stability remain unverified.
