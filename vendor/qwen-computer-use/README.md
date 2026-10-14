# 獨立 Computer Use MCP

[简体中文](README.zh-CN.md) · [English](README.en.md)

此目錄包含 Qwen open-computer-use 0.2.3 Windows 版本的本地修正，MIT 授權。上游提交：24b7cae4d449a5a8ea58c583e5151096b26de03c。

直接使用標準 MCP 的九個工具；已移除組合版的 host bridge 及 Rust Qwen 適配器。Agent 使用每次操作返回的截圖與 UIA 資料判斷下一步。沒有逐步呼叫舊版電腦工具的視覺驗證流程。

建置：在本目錄執行 `go test ./...`、`go vet ./...`、`go build -o ../../target/debug/qwen-computer-use.exe .`。Windows 開發啟動腳本會建置並同步可執行檔；Go 不在 PATH 時設定 CODEBUDDY_GO_EXECUTABLE。桌面封裝需將此檔放在 goose.exe 同目錄。

啟用內建擴充 qwen_computer，停用 computer 與 computercontroller。Windows 路徑使用本機桌面；Mac 路徑見下節，啟動參數為 `--foreground-input mcp`。外部使用者自訂的同名 stdio 擴充不享有內建工具的權限分類。舊會話保留原工具，請建立新會話驗收。

每次輸入後重用返回狀態；視窗身分或位置變動時重新觀察。保留使用者草稿；發送前核對對象與內容，發送結果未知時先觀察，勿重複發送。操作成功不等於對方收到訊息。

## 視窗切換與捲動

`get_app_state(app="foreground")` 會觀察當前前景視窗。全域快捷鍵切換視窗後，工具會明確區分原應用截圖與新前景視窗，避免把舊畫面誤判為操作失敗。Windows 鍵支援 `super`、`win` 與左右鍵別名。

`scroll` 支援截圖相對座標 `x`/`y`，適用於無完整 UIA 的多面板介面；座標與 `element_index` 二選一，且需先取得該視窗的有效觀察。

此擴充提供操作工具，不是獨立模型。識圖與決策仍由會話模型或宿主的圖片路由處理；需要可用的圖片理解模型。工具回傳成功只代表動作已派送，驗收仍需核對畫面後置條件。

## 多視窗與結果證據

`list_apps` 列出目前可見的各個頂層視窗，而非已安裝應用或歷史使用清單。同一進程的聊天、登入和圖片視窗分開列出；使用返回的 `window:PID:HWND` 可保留精確身分，失效或更換所屬進程的視窗會拒絕操作。

重用動作回傳的最新畫面；需要啟動尚未執行的程式時，自行選擇可用的桌面入口。宿主的 `desktop_interaction` 完成證據會綁定實際輸入及其後置圖片，區分界面已提交與應用已回覆，不宣稱接收端送達。未知發送不可重播。

## macOS 14+ 執行層（待實機驗收）

macOS 共用此 Go MCP 介面與快照/回執合同，由同目錄 `qwen-computer-runtime` Swift helper 執行 AppKit、Accessibility 和 ScreenCaptureKit 操作。九個工具均已有原始碼路徑；Go 已通過 Windows 測試並交叉編譯，Swift 原生建置與合同測試已在 arm64 Mac 通過；真實輸入待 TCC 授權及實機驗收。不要將元件檔案視為安裝包。

使用桌面 `pnpm run bundle:mac --arch arm64`（Intel 選 x64）會依序執行 Go 和 Swift 合同測試、編譯並封裝兩個 helper。需要 Go 1.22+、Xcode/Swift；Go 非 PATH 時使用 CODEBUDDY_GO_EXECUTABLE。macOS 開發入口會同步兩者。完整步驟與證據見[Mac 文件](../../documentation/codebuddy/MACOS_ZH_TW.md)。

Mac 必須由使用者授予螢幕錄製與輔助使用權限，輸入需 `--foreground-input`。`cmd`/`super` 表示 Command，`ctrl` 表示 Control；文字用 type_text。`window:PID:WINDOW_ID` 保留精確視窗，圖片座標是視窗相對點。視窗移動、元素改變或輸入結果未知時重新觀察。

Mac 按鍵解析亦接受 `Control_L` / `Control_R`、`Shift_L` / `Shift_R`、`Alt_L` / `Alt_R`、`Numpad_*` 及 `plus` 等常用符號別名；主鍵盤加號與數字鍵盤加號保持不同鍵碼。Swift 合同測試覆蓋左右修飾鍵、Command 對應、符號/數字鍵盤區別與無效組合拒絕。
