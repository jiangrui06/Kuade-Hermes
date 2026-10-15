# Git and GitHub

Latest acceptance (2026-10-15): 82 tests and typechecking passed. Real Kimi K3 inspected, modified, committed and pushed an isolated repository. The host verified matching worktree and local bare-repository commits and a clean worktree. See [Git acceptance](acceptance/real-git-2026-10-15.json). This record does not cover GitHub account authorization or remote writes.

[简体中文](GITHUB.zh-CN.md) · [繁體中文](GITHUB.zh-TW.md)

Local version control uses system Git through the Harness terminal tool. The Changes page displays unstaged diffs and restores individual files. Connecting GitHub does not automatically commit, push, or create branches; the user's specific task determines those operations.

Open Tools and Skills, select Add GitHub, wait for download and SHA-256 verification, then save and reload. Wait for active tasks to finish first. On the first request to query your GitHub account or repository, the official MCP guides you through browser authorization. Kuade implements no custom OAuth flow and stores no token in the extension configuration.

The connector pins the official GitHub MCP v2.0.2 Windows x64 release (MIT), enabling repository, Git object, issue, pull request, and user tools with `repo,read:org` scopes. Available operations depend on the authenticated account's repository permissions. GitHub tools operate on remote repositories; local commits and pushes continue to use Git.

The official MCP holds OAuth tokens in process memory; restarting the engine may require authorization again. Registered tools prove component availability, while account access requires an actual call such as `get_me`. The cache resides in `tools/github-mcp-2.0.2` under Kuade's user data directory. A failed cache checksum prevents that file from starting.

2026-10-15: typecheck, build, and 75 unit/component tests passed, covering archive and executable checksums, cache tampering, concurrent installation, and UI error handling. Desktop download/registration, browser authorization, and real-model Git/GitHub operations are separate acceptance gates. Account authorization and remote writes remain pending.

References: [official MCP](https://github.com/github/github-mcp-server/tree/v2.0.2), [OAuth documentation](https://github.com/github/github-mcp-server/blob/v2.0.2/docs/oauth-login.md), [release and checksums](https://github.com/github/github-mcp-server/releases/tag/v2.0.2).

Real desktop download, configuration saving, engine reload and official tool registration passed, including `get_me`. Downloads now use Electron's system-proxy network stack; the additional network-error test passed. Evidence: [GitHub registration receipt](acceptance/github-registration-2026-10-15.json). This gate did not invoke account authorization or remote writes.
