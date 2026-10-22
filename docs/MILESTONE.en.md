# Kuade Harness Windows milestone acceptance

[简体中文](MILESTONE.zh-CN.md) · [繁體中文](MILESTONE.zh-TW.md)

2026-10-22: The agreed Windows implementation and acceptance milestone is complete; the delivered version is **0.1.12**. Fresh runs, historical runs and recovery checks are distinguished below. Original failed receipts remain intact. See the [requirement audit](acceptance/milestone-audit-2026-10-22.json).

| Requirement | Result and evidence | Version / date |
| --- | --- | --- |
| Self-edit, test, package, update and restart | Real Kimi added a history shortcut, passed 111 baseline/candidate tests and seven verification gates, and restarted into the candidate. Reopening the old entry launched the candidate with the feature retained. Today the candidate EXE, complete resources hash and original test logs were checked again. [Self-iteration](acceptance/real-self-iteration-packaged-2026-10-15.json) | 0.1.9 → 0.1.10 on October 15; retained artifacts checked October 22 |
| MCP, Skills, search and webpage reading | Fresh real Kimi loaded the skill, searched and read a page, then submitted a random marker and documentation URL through the browser. An independent HTTP service verified the submission. [Fresh capabilities](acceptance/real-capabilities-packaged-0.1.12-2026-10-22.json) | 0.1.12, October 22 |
| Windows desktop and browser control | The real model used packaged qwen_computer to observe a dedicated window, enter Chinese text and click its button. The independent output file matched. Browser form interaction also passed. Coverage is limited to these exercised flows. | 0.1.12, October 22 |
| Git and GitHub | Real-model commit/push and official GitHub MCP reads/writes were exercised previously. Today local and bare-remote HEADs and the clean worktree were checked, and GitHub API reads confirmed the retained commit, sole changed file and blob. [GitHub](acceptance/real-github-write-2026-10-15.json) | October 15 execution; October 22 read-only verification |
| Selected project manager benchmark | Three automatic real-model rounds produced 13 files and 14 passing tests covering projects, tasks, SQLite persistence, filters and UI. Independent API, browser and database-restart checks passed. Today the archive hash and retained results were verified. [Project delivery](PROJECT_BENCHMARK.en.md) | 0.1.8, October 15 |
| Hours and cross-day operation | A complete two-hour run and recovery passed. Another 24-hour workload completed 1,441 checks over 1,851,685 records. On October 22 the same session resumed after restart, the real model completed its goal, and independent CLI verification passed. [Delayed recovery](acceptance/real-goal-post-soak-recovery-2026-10-22.json) | 0.1.11; two-stage cross-day evidence |
| Current release | 117 application tests, 22 acceptance-tool tests, type checking and build passed. Independent ZIP startup, four packaged desktop flows, archive integrity and real-model capabilities passed. [Release](acceptance/release-0.1.12-2026-10-22.json) | 0.1.12, October 22 |

## Deliverables and limits

- [Windows ZIP](../release/Kuade%20Harness-0.1.12-win.zip): the freshly extracted and tested distribution. Use a short extraction path.
- [Windows installer](../release/Kuade%20Harness%20Setup%200.1.12.exe): built; installation/uninstallation was not rerun in this acceptance.
- [Model-generated project manager source](../release/Kuade-generated-project-manager-2026-10-15.zip): extract, enter `workspace`, and use Node 22.23.2 to run `npm test` or `npm start`.

The original overall 24-hour receipt remains failed: its observer read only the latest 100 messages and missed the persisted plan. Pagination was fixed and delayed recovery of the same session passed. These results establish a sustained workload and subsequent recovery, not one uninterrupted fault-free acceptance run or 24 hours of continuous code generation.

Self-iteration reuses explicitly versioned real evidence; today's hash audit is not a fresh autonomous upgrade from 0.1.12. The verified updater switches independent version directories. Artifacts are unsigned. This acceptance does not newly cover the NSIS lifecycle, macOS, arbitrary desktop applications or arbitrary large projects. Original model settings were retained and temporary credentials removed. Raw sessions and local data remain on the machine rather than being published wholesale.
