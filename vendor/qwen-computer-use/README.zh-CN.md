# 独立 Computer Use MCP

[繁體中文](README.md) · [English](README.en.md)

基于 Qwen open-computer-use 0.2.3 Windows，MIT 许可，上游提交 24b7cae4d449a5a8ea58c583e5151096b26de03c。保留中文输入、窗口绑定和前台输入修复，删除组合版 host bridge 与 Rust Qwen 适配器。标准 MCP 九个工具直接返回截图和 UIA，供 Agent 判断后续动作。

在此目录执行 `go test ./...`、`go vet ./...`、`go build -o ../../target/debug/qwen-computer-use.exe .`。开发启动自动构建并同步；Go 不在 PATH 时设置 CODEBUDDY_GO_EXECUTABLE。打包时该文件与 goose.exe 同目录。

启用内置 qwen_computer，停用 computer 和 computercontroller，新建会话。启动参数 `--foreground-input mcp`，Windows 路径需本机桌面，Mac 路径见下节。外部同名扩展不会被视为可信内置工具。

动作后复用返回状态，窗口变化则重新观察。保护原草稿，核对收件人和正文；未知发送结果先查证，不盲目重发。界面发出证据不代表接收端已送达。

## 窗口切换与滚动

`get_app_state(app="foreground")` 观察当前前台窗口。全局快捷键切换窗口后，工具明确区分原应用截图与新前台窗口，避免把旧画面误判为操作失败。Windows 键支持 `super`、`win` 和左右键别名。

`scroll` 支持截图相对坐标 `x`/`y`，用于 UIA 不完整的多面板界面；坐标与 `element_index` 二选一，且需先取得该窗口的有效观察。

扩展提供操作工具，不是独立模型。识图和决策仍由会话模型或宿主图片路由处理，需要可用的图片理解模型。工具成功只表示动作已派发，验收仍须核对画面后置条件。

## 多窗口与结果证据

`list_apps` 列出当前可见的各个顶层窗口，不是已安装应用或历史使用清单。同一进程的聊天、登录和图片窗口分别列出；使用返回的 `window:PID:HWND` 保留准确身份，失效或更换所属进程的窗口会拒绝操作。

复用动作返回的最新画面；需要启动尚未运行的程序时，自行选择可用桌面入口。宿主的 `desktop_interaction` 完成证据绑定实际输入及后置图片，区分界面已提交与应用已回复，不宣称接收端送达。未知发送不重放。

## macOS 14+ 执行层（待实机验收）

Mac 共用 Go MCP 接口和快照/回执合同，通过同目录 `qwen-computer-runtime` Swift helper 调用 AppKit、Accessibility、ScreenCaptureKit。九工具已有源码路径；Go 已在 Windows 测试并交叉编译，Swift 原生构建及合同测试已在 arm64 Mac 通过；真实输入待 TCC 授权及实机验收。元件文件不是安装包。

桌面 `pnpm run bundle:mac --arch arm64`（Intel 选 x64）会执行 Go/Swift 合同测试，编译并封装两个 helper。需要 Go 1.22+、Xcode/Swift；可用 CODEBUDDY_GO_EXECUTABLE 指定 Go。Mac 开发入口同步两者。见[完整记录](../../documentation/codebuddy/MACOS_ZH_CN.md)。

用户须授予屏幕录制/辅助功能权限，输入需 `--foreground-input`。`cmd`/`super` 是 Command，`ctrl` 是 Control；文字用 type_text。`window:PID:WINDOW_ID` 绑定精确窗口，图片坐标是窗口相对点。窗口移动、元素变化、输入结果未知时重新观察。

Mac 按键解析也接受 `Control_L` / `Control_R`、`Shift_L` / `Shift_R`、`Alt_L` / `Alt_R`、`Numpad_*` 和 `plus` 等常用符号别名；主键盘加号与数字键盘加号保留不同键码。Swift 合同测试覆盖左右修饰键、Command 映射、符号/数字键盘区别以及无效组合拒绝。
