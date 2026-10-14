# Standalone Computer Use MCP

[繁體中文](README.md) · [简体中文](README.zh-CN.md)

Based on Qwen open-computer-use 0.2.3 for Windows, commit 24b7cae4d449a5a8ea58c583e5151096b26de03c, MIT license. Retains Unicode, window identity and foreground input fixes. The hybrid host bridge and Rust Qwen adapter have been removed. Nine standard MCP tools return screenshots and accessibility data directly to the agent.

Run `go test ./...`, `go vet ./...`, and `go build -o ../../target/debug/qwen-computer-use.exe .` here. Windows development startup builds and synchronizes the executable. Set CODEBUDDY_GO_EXECUTABLE if Go is absent from PATH. Package the executable beside goose.exe.

Enable the builtin qwen_computer extension, disable computer and computercontroller, and start a new session. Arguments: `--foreground-input mcp`. The Windows path requires the local desktop; see the Mac path below. A user-configured stdio extension with the same name is not classified as the trusted builtin.

Reuse action after-states; re-observe changed windows. Preserve drafts, verify recipient and message, and reconcile uncertain sends before retrying. Outgoing UI evidence is not recipient-side delivery confirmation.

## Window transitions and scrolling

`get_app_state(app="foreground")` observes the current foreground window. After a global shortcut changes focus, results distinguish the original app screenshot from the newly active window to prevent false failure conclusions. Windows-key aliases include `super`, `win`, and left/right variants.

`scroll` accepts screenshot-relative `x`/`y` coordinates for panes with sparse accessibility data. Coordinates and `element_index` are mutually exclusive and require a valid prior observation of the window.

This extension supplies tools, not a separate model. Image understanding and decisions still depend on the session model or host image routing. Successful dispatch is not proof of task completion; verify the visible postcondition.

## Multiple windows and result evidence

`list_apps` lists visible top-level windows, not installed apps or usage history. Chat, login and image-viewer windows in one process have separate `window:PID:HWND` selectors. Exact selectors retain window identity and reject stale or wrong-owner windows.

Reuse fresh action after-states. For an app that is not running, choose an available desktop launch entry. The host desktop_interaction evidence binds an actual input to its after-image, distinguishing UI submission and an application reply from independently confirmed recipient delivery. Never replay an uncertain send.

## macOS 14+ runtime (native acceptance pending)

Mac reuses this Go MCP interface and snapshot/receipt contract. Its sibling `qwen-computer-runtime` Swift helper executes AppKit, Accessibility and ScreenCaptureKit operations. All nine tools have source paths; Go tests and cross-compilation passed on Windows. Native Swift compilation and contract checks passed on arm64 Mac; real input awaits TCC grants and acceptance. Component binaries are not installers.

Desktop `pnpm run bundle:mac --arch arm64` (x64 on Intel) runs Go/Swift contract tests, builds and packages both helpers. Requires Go 1.22+ and Xcode/Swift; CODEBUDDY_GO_EXECUTABLE may select Go outside PATH. Mac development startup synchronizes both helpers. See the [Mac record](../../documentation/codebuddy/MACOS_EN.md).

Users must grant Screen Recording/Accessibility; input requires `--foreground-input`. `cmd`/`super` mean Command and `ctrl` means Control; use type_text for text. `window:PID:WINDOW_ID` binds an exact window and screenshot coordinates use window-relative points. Re-observe changed windows/elements and uncertain input outcomes.

Mac key parsing also accepts `Control_L` / `Control_R`, `Shift_L` / `Shift_R`, `Alt_L` / `Alt_R`, `Numpad_*`, and common symbol names such as `plus`. Main-keyboard plus and keypad plus retain distinct key codes. Swift contract checks cover modifier aliases, Command mapping, symbol/keypad differences and rejection of invalid chords.
