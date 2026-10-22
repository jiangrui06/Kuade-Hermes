# Git and GitHub

[简体中文](GITHUB.zh-CN.md) · [繁體中文](GITHUB.zh-TW.md)

Local version control uses system Git through the Harness terminal. The changes page provides unstaged diffs and single-file restoration. GitHub connectivity uses the official MCP, without implementing another API client or OAuth flow. User requests and account permissions determine operations.

In Tools and Skills, click Add GitHub, wait for download and SHA-256 verification, then save and reload. Wait for running tasks to finish first. Complete official browser authorization when an agent first queries the account or repository. GitHub MCP operates remote repositories; local commits and pushes still use Git.

The integration pins GitHub MCP v2.0.2, Windows x64, MIT, with context, repos, issues, pull_requests, users and git toolsets and repo,read:org scopes. The official component retains tokens only in process memory, so restarting may require authorization again. Kuade does not put tokens in extension configuration. The cache is tools/github-mcp-2.0.2 inside the user-data directory; files failing verification are not launched.

## Accepted scope (2026-10-15)

- [Registration](acceptance/github-registration-2026-10-15.json): real download, verification, configuration save, engine reload and tool discovery.
- [Local Git](acceptance/real-git-2026-10-15.json): real Kimi K3 inspected, modified, committed and pushed to a local bare repository. Independent checks confirmed matching commits and a clean worktree.
- [GitHub reads](acceptance/real-github-read-2026-10-15.json): user OAuth followed by real-model account, commit and file/resource reads; independent account ID, commit SHA and full README Git blob checks. The initial verifier missed resource reads; its failed receipt is retained and persisted-event follow-up passed.
- [GitHub writes](acceptance/real-github-write-2026-10-15.json): a real model wrote one approved record on main. The first transcription omitted a colon. A second real-model task repaired it; independent checks matched the full content, blob, parent, commit message and sole changed path. The initial failure is retained and temporary model credentials were removed.

These gates establish the specific account and approved single-file read/write paths, not all Issue, Pull Request, organization or branch-protection scenarios. Tool discovery alone does not establish authentication.

## Repeating acceptance

Standard npm test runs 87 application tests and 7 verifier tests. scripts/accept-real-github.mjs is read-only by default. Run it from a built development directory with KUADE_REAL_GITHUB=1 and KUADE_MODEL_PROFILE pointing to the saved model profile. It uses an isolated instance, removes temporary credentials on exit, and leaves OAuth to the user. Write mode is scoped to this explicitly approved fixed record and rejects duplicate creation. Repair mode accepts only the known missing-colon defect; this is not a general publishing command.

References: [official MCP](https://github.com/github/github-mcp-server/tree/v2.0.2), [OAuth](https://github.com/github/github-mcp-server/blob/v2.0.2/docs/oauth-login.md), [release and checksums](https://github.com/github/github-mcp-server/releases/tag/v2.0.2).
