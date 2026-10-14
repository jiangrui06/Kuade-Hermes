# Kuade Harness

原始碼位於 exFAT 或小檔案讀寫較慢的磁碟時，可用 `node scripts/windows.mjs install` 安裝開發相依套件，再用 `node scripts/windows.mjs dev` 啟動。輔助程式會將原始碼同步至 `%LOCALAPPDATA%/Kuade-development/專案目錄名稱` 執行；請持續編輯原始工作目錄，系統 PATH 保持原值。也支援 `typecheck`、`test`、`build`、`test:e2e` 與 `package:win` 參數。

[简体中文](../README.md) · [English](README.en.md)

Kuade Harness 是本機程式開發工作臺，第一版提供 Windows 桌面應用程式。使用者自行設定供應商、API 位址和金鑰，再從自動取得的清單選擇模型。專案與工作記錄保存在本機；模型請求會傳送至所選服務商。

開發中的電腦控制沿用獨立 `qwen_computer` MCP，保留 Windows／macOS 執行層。詳見 [Computer Use](COMPUTER.zh-TW.md)。從原始碼打包前執行 `npm run build:computer`（Go 1.22+）；使用桌面程式無須安裝 Go。

## 品牌與工作紀錄

0.1.5 統一使用 **Kuade Harness**：視窗、安裝包、介面與模型系統身分一致。透過上游提示詞 section 擴充註冊產品身分，保留各 Agent 預設與工具；相依套件名稱、來源與版權聲明保持正確。為延續金鑰、對話與啟動入口，使用者資料目錄仍為 `Kuade`，執行檔仍為 `Kuade.exe`。

「任务记录」可重新命名，以名稱或專案目錄搜尋，並篩選進行中或有未完成計畫的工作。名稱沿用上游 `session/rename` 儲存與正規化規則；長名稱會縮短，以儲存提示顯示的實際名稱為準。失敗保留草稿，Enter 儲存、Escape 取消。清單限定目前專案，不將無計畫的工作標記為已完成。

## 工作計畫與繼續

工作對話上方顯示 Agent 的步驟計畫、目前處理項及已完成項數，展開可檢視全部步驟。沿用 Harness `todo_write` 與 `todos` 投影，未另建工作資料庫。簡單工作未建立計畫時會顯示提示。

停止、執行出錯、輸出達到上限或重啟後發現中斷時，可按「继续任务」。應用程式在原對話中傳送一則可見的繼續請求，附上前一輪計畫，要求先核對檔案與測試，再處理剩餘工作；模型與執行模式沿用目前選擇。等待核准、回答或引擎尚未就緒時不發起繼續。

「本轮结束」只表示本輪模型回覆結束；計畫勾選由 Agent 回報，不代表獨立測試已通過。新一輪開始時上游清空舊計畫，等待 Agent 更新；結束前執行中的系統命令不會原地恢復。參考：[上游工作計畫](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/todo/tool-todo/README.md)、[對話持久化](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence/README.md)。

## 開發與執行

Windows x64 使用者可安裝 `release/Kuade Harness Setup 0.1.5.exe`，或完整解壓縮 `release/Kuade Harness-0.1.5-win.zip` 後執行其中的 `Kuade.exe`。首次開啟後進入「模型連接」，設定服務商，即可在預設工作區選擇模型並傳送工作，也可另行開啟本機專案。目前建置未簽章。詳見 [驗收紀錄](ACCEPTANCE.zh-TW.md)。

填寫名稱、協定、API 位址和金鑰後自動取得模型清單，搜尋並勾選即可儲存。編輯既有連接會沿用已儲存的金鑰查詢，也可按「重新整理清單」。本機免密服務可留空金鑰；服務商未提供清單介面時，可展開手動填寫。查詢沿用上游 `llm/discoverModels`，支援 OpenAI 相容及 Anthropic 協定。清單代表服務商回傳的目錄，各模型的對話與工具呼叫權限仍由服務商決定。

安裝包內含 Electron 與 Agent 引擎。Git 操作需要 Git，PowerShell 工具需要 PowerShell 7；透過 `npx` 啟動的 MCP（包括瀏覽器預設）還需要 Node.js/npm 與首次下載所需的網路。

需要 Node.js 22.19+、npm、Git 及 PowerShell 7。

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run package:win
```

## 模組設計

首次啟動自動建立「文件/Kuade/默认工作区」，可直接傳送工作。切換專案後記住選擇，新工作沿用目前工作區。檔案與會話註冊仍由上游管理。

對話輸入框分別選擇服務商、模型與思考強度，模型選單取得該連接完整目錄，不混入未設定的 DeepSeek 預設模型。設定頁儲存的模型作為離線備用目錄；首次選擇其他模型時自動註冊至同一連接。重新整理失敗會顯示提示並保留已儲存模型。

思考選項沿用上游能力聲明。Ollama Cloud 與標準本機 Ollama 的 OpenAI 相容介面另按需查詢 `/api/show`，只顯示模型支援的檔位；缺少資訊時使用模型預設。切換模型不沿用不相容檔位。依據：[Harness 模型設定](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)、[Ollama 思考能力](https://docs.ollama.com/capabilities/thinking)。

`src/main` 管理桌面視窗、IPC 和 Git；`src/preload` 提供最小橋接；`src/shared` 定義產品契約；`src/runtime` 封裝上游進程、認證、RPC、事件及 MCP；`src/renderer/features` 分離專案、工作記錄、模型、工具和變更功能。介面不直接匯入 Electron 或執行系統命令。

優先沿用上游 Agent、模型轉接器與 MCP，僅開發必要的產品介面和整合。使用自有品牌，保留第三方聲明。

## 行為與驗收界線

- 詢問模式允許工作區內操作，必要時要求確認；自動模式採用上游完整存取預設。
- 最小化後工作繼續；退出會停止引擎。主動休眠或關機期間停止計算。
- 重啟後可讀取持久化記錄並繼續，但不會原地恢復已結束的作業系統進程。
- Git 變更包含使用者先前未暫存的編輯。恢復前需確認，且差異發生變動時會拒絕操作；不刪除未追蹤檔案。
- MCP 配置透過上游客戶端生效。執行中的工作會阻止設定重載，連線結果仍須驗證。
- 上游內建搜尋依賴 DeepSeek 搜尋服務憑證，設定其他模型供應商並不自動啟用該服務。其他搜尋服務可透過 MCP 接入，其帳號、費用與可用性由服務商決定。
- 元件測試、真實引擎、本機桌面、真實模型和跨日執行分別驗收。

上游鎖定 `@deepseek-ai/dsh@0.2.0-rc.2`。來源：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[Electron](https://www.electronjs.org/docs/latest/tutorial/security)、[Playwright MCP](https://github.com/microsoft/playwright-mcp)。

自我迭代模組、前提與驗收狀態見 [自我迭代](SELF_ITERATION.zh-TW.md)。
