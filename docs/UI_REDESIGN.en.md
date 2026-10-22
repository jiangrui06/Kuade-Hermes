# Kuade 0.2.0 UI redesign

[简体中文](UI_REDESIGN.zh-CN.md) · [繁體中文](UI_REDESIGN.zh-TW.md)

## User flow

All six pages now follow a simple workflow: connect a model, describe a task, read the result, inspect execution details when needed. Existing Harness execution remains unchanged. First use has a direct connection action; task examples fill an editable draft; the default workspace needs no folder picker. A single model selector groups models by provider.

Conversation output distinguishes prose, code and tables. Consecutive tool records are collapsed by default, with original details available. Users can copy code or the full Markdown reply. Incoming output preserves the position while reading older messages. Task history retains search, filtering and renaming. File names and restore actions are separate, with an explicit confirmation and the existing stale-diff guard. Model connections support discovery, filtering, bulk selection and a direct return to chat after saving.

The tools page provides four one-click configuration toggles, usable skills, and expandable connection status and custom MCP settings. Unsaved advanced drafts disable quick toggles to avoid overwriting edits. Enabled means configured, not successfully connected. If saving succeeds but restart fails, the UI rereads stored configuration and reports the connection failure explicitly. Self-iteration explains source selection, independent verification and restart, retaining progress, stop and retry controls.

## Visual system and verification

White content, a neutral sidebar, blue action accents and 13–14px base text replace competing decoration. Navigation, welcome and output grouping are separate modules. Desktop layouts are checked at 1440×960 and 1000×760.

This round uses isolated user data and a controlled local model service with real Electron, Harness, filesystem, clipboard, MCP and persistence. These checks establish UI and integration behavior, not new external-model, multi-day or self-update acceptance. See `docs/acceptance/ui-redesign-0.2.0-2026-10-22.json` for actual results.

Passed: 154 automated checks (132 application tests and 22 acceptance-script tests), type checking, production build, seven development desktop flows and three flows against an independently extracted ZIP. Archive integrity and copied SHA-256 match passed. Release 0.2.0 is unsigned; this round ships a portable ZIP, not a new installer.

## References

- [Cursor Agent](https://prod.cursor.com/help/ai-features/agent) and [Review](https://docs.cursor.com/en/agent/review): task flow and contextual review.
- [Claude Code Desktop redesign](https://claude.com/resources/articles/claude-code-desktop-redesign): session navigation and output hierarchy.
- [VS Code tools](https://code.visualstudio.com/docs/agents/run/tools): capabilities and execution state.
- [Linear UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh): consistent navigation and control hierarchy.
- [NN/g Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): advanced details on demand.

These informed interaction principles; no code or brand assets from those products were imported.

## Screenshots

Actual desktop screenshots from the isolated acceptance profile, using fixture models and project data.

![Welcome](images/ui-0.2.0/01-welcome.png)

![Conversation](images/ui-0.2.0/04-conversation.png)

![Tools](images/ui-0.2.0/07-tools.png)
