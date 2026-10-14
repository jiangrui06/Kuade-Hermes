# Computer Use 整合

[简体中文](COMPUTER.zh-CN.md) · [English](COMPUTER.en.md)

最新真實 Kimi K3 專用 Windows 視窗輸入與點擊驗收通過，詳見 [真實模型能力驗收](REAL_CAPABILITIES.zh-TW.md)。

Kuade 沿用使用者指定的獨立 `qwen_computer` MCP。引入 CodeBuddy 0.2.3-local.15，基於 MIT 授權的 [open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)，上游基線 `24b7cae4d449a5a8ea58c583e5151096b26de03c`。保留元件原始碼、測試、授權及 Windows／macOS 執行層，指紋位於 `vendor/qwen-computer-use.source.json`。宿主使用既有 Harness MCP 客戶端。

在「工具與技能」添加電腦控制並儲存，檢查九個工具是否實際註冊。應用程式從資源目錄啟動元件，使用者無須安裝 Go、Python 或修改 PATH。保留同名自訂設定。工具操作目前桌面；模型依據圖片與可存取性資訊做決策，名稱不限定使用 Qwen 模型。圖片理解需模型支援。呼叫成功仍須核對應用程式結果。

目前整合目標為 Windows x64。macOS 14+ 的 Go／Swift 原始碼已保留，Kuade 的 Mac 原生建置、輔助使用／螢幕錄製權限及真實輸入尚待驗收。

開發需 Go 1.22+；`npm run build:computer` 執行 Go test、vet 和 build，輸出 `resources/computer`，附授權與 SHA-256 紀錄。可用 `KUADE_GO_EXECUTABLE` 指定 Go 路徑。同步入口為 `node scripts/windows.mjs build:computer`，打包前須完成。執行產品無須 Go。

`node scripts/accept-computer.mjs` 透過真實 MCP 操作專用 WPF 視窗，核對中文輸入、按鈕結果、檔案及環境指紋。`KUADE_LIVE_COMPUTER=1` 時執行 `npx playwright test tests/e2e/live-computer.spec.ts` 驗證 Kuade 的整合流程；模型回應為本地受控服務，外部模型自主決策另行驗證。預設回歸不操作實體桌面。

2026-10-14：型別檢查、51 項單元／元件測試及 Go 測試／vet／建置通過。原生操作證據：`.cache/computer-57dcdf14-60cc-4a88-b571-48b8a10039f3`。初次測試視窗與環境指紋比較腳本問題已修正，失敗紀錄保留。開發元件 SHA-256：`b80393b2734bb877cb6935d334470c2eb90e2f31f9be1a2db0daeb4feb46d335`。整合、發佈包與真實模型證據分開記錄。

之後補齊 Ollama 公開圖片能力讀取：已有思考設定仍會檢查圖片，顯式輸入設定優先，未知能力不依名称推測。最新 52 項測試與型別檢查通過。完整桌面流程：`.cache/live-computer-82e17742-ad97-44ef-a02f-ff1228ea6a11`，包含新增元件、九工具註冊、四次真實桌面操作、中文落盤及圖片送達本地受控模型介面。未使用使用者金鑰或傳送圖片至外部模型。已發佈 0.1.5 包保持原版，新能力尚未發佈打包。
