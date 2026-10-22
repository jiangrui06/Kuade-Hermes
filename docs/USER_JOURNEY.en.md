# Kuade 0.2.3 user journey acceptance

[简体中文](USER_JOURNEY.zh-CN.md) · [繁體中文](USER_JOURNEY.zh-TW.md)

## Improvements

- Preview URLs formatted as inline code are clickable; commands and fenced code examples remain literal.

- The new-task screen identifies the actual selected project.
- Changes places file navigation beside the preview, with individual file diffs.
- New files have readable previews, including explicit empty, binary, encoding and size-limit states.
- A direct return-to-task action preserves the conversation for further edits.
- Projects without Git receive an explanation and next step instead of a raw command error.

Previews are read-only. Restore retains explicit confirmation and stale-diff protection; new files have no delete or restore action. File previews reuse Git and filesystem APIs. URL detection reuses [linkify-it 6.1.0](https://github.com/markdown-it/linkify-it) (MIT), including URLs adjacent to Chinese text. The execution engine is unchanged.

## Real-provider flow

An isolated Windows profile uses the user's saved Kimi K3 connection. Model responses are not mocked. The acceptance runner only creates the initial quote-calculator fixture; the model implements discounts and reset behavior.

Open project and create task → choose model and automatic mode → request discount logic, validation, tests and documentation → review diffs and new files → rename, search and reopen the task → request reset behavior → independently check calculation and invalid inputs and run generated tests → exercise the result in real Edge → restart the desktop application and reopen persisted history.

The first model run suggested double-clicking an HTML file that uses ES modules. Follow-up feedback requests corrected HTTP-server instructions. Reported behavior and actual execution are checked separately.

## Evidence and limits

See `docs/acceptance/real-user-journey-0.2.3-2026-10-22.json` for baseline and updated-version runs, counts, screenshots and raw evidence locations.

Only the OS folder picker receives a deterministic test path; task interactions use the real UI. The generated application runs through an isolated HTTP server in Edge. Launching the system default browser is not counted as verified. This bounded two-turn calculator and persistence exercise does not replace large-project, overnight, computer-control or self-update acceptance.

Temporary provider files are removed afterwards and hashes verify that the original settings are unchanged. Evidence excludes keys. Delivery is a portable Windows ZIP; no new installer is generated.

## Results

142 application tests, 22 acceptance-script tests, type checking, production build and desktop interaction checks passed. The latest complete two-turn real Kimi K3 development run passed on 0.2.2. Delivery version 0.2.3 further fixes URL recognition and replays that same persisted real task without submitting another development prompt. All 12 generated-project tests passed again. Edge verified the discounted total of 53.97 and reset total of 100.00.

The final version also verifies new-file previews, per-file diffs, narrow windows, returning to the task and a ready composer after restart. Link-click checks reach main-process dispatch with a stubbed OS browser opener; the actual generated page is separately exercised in Edge.

![Real model reply links](images/ui-0.2.3/01-real-reply-links.png)

![New-file preview](images/ui-0.2.3/02-new-file.png)
